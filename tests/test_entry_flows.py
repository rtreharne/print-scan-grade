"""Run inside the app image: docker compose run --rm -T print-scan-grade python < tests/test_entry_flows.py."""
import json
import tempfile
import time
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import jwt
from app import main


class EntryFlowsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        settings = patch.multiple(main, DATA_DIR=root, DATABASE=root / "test.sqlite3", KEY_FILE=root / "key.pem")
        settings.start()
        self.addCleanup(settings.stop)
        env = patch.dict(main.os.environ, {
            "DOMAIN": "example.test", "ADMIN_USERNAME": "admin", "ADMIN_PASSWORD": "test-password",
            "LTI_PLATFORM_ISSUER": "", "LTI_PLATFORM_REGISTRATIONS": "",
            "CANVAS_PUBLIC_BASE_URL": "https://institution.instructure.com",
            "LTI_INTERNAL_PLATFORM_BASE_URL": "",
        })
        env.start()
        self.addCleanup(env.stop)
        self.app = main.create_app()
        self.app.config.update(TESTING=True, SECRET_KEY="test-only", SESSION_COOKIE_SECURE=False)
        self.addCleanup(lambda: self.app.extensions["roster_executor"].shutdown(wait=True))
        self.client = self.app.test_client()

    def test_personal_token_endpoints_are_removed(self):
        for path in ["/canvas", "/canvas/login", "/canvas/logout", "/admin/canvas",
                     "/admin/canvas/1/courses.json", "/admin/canvas/1/delete"]:
            for method in ["get", "post"]:
                with self.subTest(path=path, method=method):
                    self.assertEqual(getattr(self.client, method)(path).status_code, 404)
        with main.connect() as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertNotIn("canvas_connections", tables)
        self.assertNotIn("canvas_config", tables)

    def test_old_personal_session_cannot_access_course_routes(self):
        context = {"issuer": "https://institution.instructure.com", "context_id": "1",
                   "deployment_id": "canvas-personal-token", "course_title": "Retired", "user_id": "old", "is_staff": True}
        with self.client.session_transaction() as session:
            session.update(canvas_authenticated=True, canvas_course=context)
        for path in ["/print", "/scan", "/grade", "/scan/forms.json", "/scan/dummy-options.json", "/grade?format=json"]:
            self.assertEqual(self.client.get(path).status_code, 403, path)
        self.assertEqual(self.client.post("/print/logo", data={}).status_code, 403)

    def test_standalone_workspaces_still_work(self):
        setup = self.client.get("/standalone")
        self.assertEqual(setup.status_code, 200)
        self.assertIn(b"Existing FORM code", setup.data)
        response = self.client.post("/standalone", data={"title": "Test sheet", "question_count": 20, "choice_count": 4})
        self.assertEqual(response.status_code, 302)
        agreement_path = response.location
        path = agreement_path.removesuffix("/agreement")
        self.assertEqual(self.client.get(f"{path}?view=scan").location, agreement_path)
        agreement = self.client.get(agreement_path)
        self.assertEqual(agreement.status_code, 200)
        self.assertIn(b"PrintScanGrade usage policy", agreement.data)
        accepted = self.client.post(agreement_path, data={
            "email": "teacher@example.test", "institution": "Example University",
            "department": "School of Chemistry", "accept_policy": "yes",
        })
        self.assertEqual(accepted.status_code, 302)
        self.assertEqual(accepted.location, f"{path}?view=print")
        slug = path.rsplit("/", 1)[-1]
        with main.connect() as db:
            agreement_row = db.execute(
                "SELECT email, institution, department, policy_version "
                "FROM standalone_workspace_agreements WHERE slug=?", (slug,)
            ).fetchone()
        self.assertEqual(dict(agreement_row)["email"], "teacher@example.test")
        self.assertEqual(dict(agreement_row)["institution"], "Example University")
        self.assertEqual(dict(agreement_row)["department"], "School of Chemistry")
        self.assertEqual(self.client.get("/usage-policy").status_code, 200)
        for view in ["print", "scan", "grade"]:
            self.assertEqual(self.client.get(f"{path}?view={view}").status_code, 200)
            legacy = self.client.get(f"/standalone/uol_legacy?view={view}")
            self.assertEqual(legacy.status_code, 200)
            self.assertEqual(legacy.headers.get("Content-Security-Policy"), "frame-ancestors *")
        pdf = self.client.get(path + "/answer-sheet.pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertTrue(pdf.data.startswith(b"%PDF-"))
        imported = self.client.post("/standalone", data={
            "title": "CHEM101 In-Class Test", "question_count": 15,
            "choice_count": 4, "existing_form_code": "6945b3d6-b7e",
        })
        self.assertEqual(imported.status_code, 302)
        imported_agreement_path = imported.location
        imported_path = imported_agreement_path.removesuffix("/agreement")
        self.client.post(imported_agreement_path, data={
            "email": "teacher@example.test", "institution": "Example University",
            "department": "School of Chemistry", "accept_policy": "yes",
        })
        imported_form = self.client.get(imported_path + "/forms.json").json[0]
        self.assertEqual(imported_form["question_count"], 15)
        self.assertEqual(imported_form["choice_count"], 4)
        self.assertEqual(imported_form["accepted_form_ids"], [imported_form["form_id"], "6945b3d6-b7e"])

    def test_standalone_batch_renderer_returns_requested_pages(self):
        created = self.client.post("/standalone", data={"title": "Render check", "question_count": 15,
                                                        "choice_count": 4})
        path = created.location.removesuffix("/agreement")
        self.client.post(created.location, data={
            "email": "teacher@example.test", "institution": "Example University",
            "department": "Chemistry", "accept_policy": "yes",
        })
        scan_workspace = self.client.get(path + "?view=scan")
        self.assertEqual(scan_workspace.headers["Cache-Control"], "no-store")
        self.assertIn(b"scan.js?v=107", scan_workspace.data)
        pdf = self.client.get(path + "/answer-sheet.pdf").data
        for height in (1400, 1600):
            response = self.client.post(path + f"/render-pages?first=1&last=1&height={height}",
                                        data=pdf, content_type="application/pdf",
                                        headers={"X-Scan-Render": "1"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            with zipfile.ZipFile(BytesIO(response.data)) as pages:
                self.assertEqual(pages.namelist(), ["1.png"])
                self.assertTrue(pages.read("1.png").startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertEqual(self.client.post(path + "/render-pages?first=1&last=26",
                                          data=pdf, content_type="application/pdf",
                                          headers={"X-Scan-Render": "1"}).status_code, 400)

    def test_admin_login_lands_on_lti_clients(self):
        response = self.client.post("/admin/login", data={"username": "admin", "password": "test-password"})
        self.assertEqual(response.location, "/admin/lti")
        self.assertEqual(self.client.get(response.location).status_code, 200)

    def test_signed_lti_launch_and_nrps_course_workspace(self):
        issuer = "https://canvas.instructure.com"
        platform = {"issuer": issuer, "client_id": "test-client", "client_ids": ["test-client"],
                    "authorization_endpoint": "https://institution.instructure.com/authorize",
                    "jwks_url": "https://institution.instructure.com/jwks",
                    "token_endpoint": "https://institution.instructure.com/token"}
        now = int(time.time())
        with main.connect() as db:
            db.execute("INSERT INTO deployments VALUES (?,?,?,?)", (issuer, "test-client", "deployment", now))
        key = main.private_key()
        jwk = json.loads(main.RSAAlgorithm.to_jwk(key.public_key()))
        jwk["kid"] = "platform-key"
        with patch.object(main, "platforms", return_value={issuer: platform}), patch.object(main, "platform_client", return_value=platform):
            response = self.client.post("/oidc/login", data={"iss": issuer, "client_id": "test-client", "login_hint": "instructor"})
            self.assertEqual(response.status_code, 302)
            with self.client.session_transaction() as session:
                state, nonce = session["lti_state"], session["lti_nonce"]
            claims = {"iss": issuer, "aud": "test-client", "sub": "teacher", "exp": now + 300, "iat": now, "nonce": nonce,
                      main.LTI + "deployment_id": "deployment", main.LTI + "message_type": "LtiResourceLinkRequest",
                      main.LTI + "version": "1.3.0", main.LTI + "context": {"id": "course-1", "title": "LTI course"},
                      main.LTI + "roles": ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
                      main.NRPS_CLAIM: {"context_memberships_url": "https://institution.instructure.com/roster"}}
            token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "platform-key"})
            with patch.object(main, "urlopen", return_value=BytesIO(json.dumps({"keys": [jwk]}).encode())):
                response = self.client.post("/lti/launch", data={"state": state, "id_token": token})
            self.assertEqual(response.status_code, 302, response.get_data(as_text=True))
            self.assertEqual(response.location, "/print")
            self.assertEqual(self.client.get("/print").status_code, 200)
            self.assertEqual(self.client.get("/scan/forms.json").status_code, 200)
            learners = [{"name": "Student", "student_id": "201234567", "sis_login_id": "student@example.test"}]
            with patch.object(main, "fetch_active_learners", return_value=learners) as fetch:
                grade = self.client.get("/grade?format=json")
                self.assertEqual(grade.status_code, 200)
                self.assertEqual(grade.json["roster"], learners)
                self.assertTrue(grade.json["roster_available"])
                self.assertEqual(self.client.get("/scan").status_code, 200)
                for job in self.app.extensions["roster_jobs"].values():
                    job["future"].result(timeout=2)
                scan = self.client.get("/scan")
                self.assertEqual(scan.status_code, 200)
                self.assertIn("Choose PDF or ZIP files", scan.get_data(as_text=True))
                fetch.assert_called()
        self.assertEqual(main.normalize_nrps_url("https://institution.instructure.com/roster", issuer), "https://institution.instructure.com/roster")


if __name__ == "__main__":
    unittest.main(verbosity=2)
