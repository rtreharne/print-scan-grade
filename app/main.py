"""Print Scan Grade: a small LTI 1.3 launch app."""
import json
import os
import random
import re
import secrets
import sqlite3
import time
import uuid
import zipfile
from datetime import datetime, timezone
from functools import wraps
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask, abort, flash, jsonify, redirect, render_template, request, send_file, session, url_for
from jwt.algorithms import RSAAlgorithm
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.pdfbase.pdfmetrics import stringWidth
from PIL import Image, UnidentifiedImageError
from werkzeug.utils import secure_filename

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
DATABASE = DATA_DIR / "print-scan-grade.sqlite3"
KEY_FILE = DATA_DIR / "tool-private.pem"
LTI = "https://purl.imsglobal.org/spec/lti/claim/"
LTI_DEEP_LINKING = "https://purl.imsglobal.org/spec/lti-dl/claim/"
SHEET_LAYOUT_VERSION = 4
LEGACY_SHEET_LAYOUT_VERSION = 1
NRPS_SCOPE = "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly"
NRPS_CLAIM = "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice"
SAMPLE_FONTS = (
    ("SampleCaveat", "Caveat-Regular.ttf"),
    ("SampleKalam", "Kalam-Regular.ttf"),
    ("SamplePatrickHand", "PatrickHand-Regular.ttf"),
)
FONT_DIR = Path(__file__).resolve().parent / "fonts"
MIN_PRINT_FONT_SIZE = 12
MAX_QUESTIONS = 60
QUESTIONS_PER_COLUMN = 15
FORM_BUBBLE_RADIUS = 6.8
REGISTRATION_MARK_EDGE = 16
REGISTRATION_MARK_SIZE = 10


class MinimumFontCanvas(canvas.Canvas):
    """Canvas that enforces the minimum size on the answer-sheet page only."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._enforce_minimum_font = True

    def setFont(self, fontName, fontSize, leading=None):
        if self._enforce_minimum_font:
            fontSize = max(MIN_PRINT_FONT_SIZE, fontSize)
        return super().setFont(fontName, fontSize, leading)

    def setFontExact(self, fontName, fontSize, leading=None):
        """Set an intentional exception font without changing page enforcement."""
        return canvas.Canvas.setFont(self, fontName, fontSize, leading)

    def showPage(self):
        super().showPage()
        self._enforce_minimum_font = False


def base_url():
    return os.getenv("TOOL_BASE_URL", "http://localhost:8004").rstrip("/")


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE IF NOT EXISTS deployments (
            issuer TEXT NOT NULL, client_id TEXT NOT NULL, deployment_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (issuer, client_id, deployment_id)
        );
        CREATE TABLE IF NOT EXISTS lti_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            issuer TEXT NOT NULL,
            client_id TEXT NOT NULL,
            authorization_endpoint TEXT NOT NULL,
            jwks_url TEXT NOT NULL,
            token_endpoint TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE (issuer, client_id)
        );
        CREATE TABLE IF NOT EXISTS exam_designs (
            form_id TEXT PRIMARY KEY,
            issuer TEXT NOT NULL,
            context_id TEXT NOT NULL,
            deployment_id TEXT NOT NULL,
            course_title TEXT NOT NULL,
            created_by TEXT NOT NULL,
            title TEXT NOT NULL,
            question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 60),
            choice_count INTEGER NOT NULL CHECK(choice_count BETWEEN 2 AND 8),
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS exam_designs_course_idx
            ON exam_designs (issuer, context_id, created_at);
        CREATE TABLE IF NOT EXISTS course_branding (
            issuer TEXT NOT NULL,
            context_id TEXT NOT NULL,
            logo BLOB NOT NULL,
            logo_type TEXT NOT NULL CHECK(logo_type IN ('image/png', 'image/jpeg')),
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (issuer, context_id)
        );
    """)
    return db


def platforms():
    with connect() as db:
        rows = db.execute(
            "SELECT issuer, client_id, authorization_endpoint, jwks_url, token_endpoint "
            "FROM lti_clients WHERE enabled=1 ORDER BY id"
        ).fetchall()
    result = {}
    configured_issuer = os.getenv("LTI_PLATFORM_ISSUER", "").strip().rstrip("/")
    if configured_issuer:
        result[configured_issuer] = {
            "issuer": configured_issuer,
            "authorization_endpoint": os.getenv("LTI_PLATFORM_AUTHORIZATION_ENDPOINT", "").strip(),
            "jwks_url": os.getenv("LTI_PLATFORM_JWKS_URL", "").strip(),
            "token_endpoint": os.getenv("LTI_PLATFORM_TOKEN_ENDPOINT", "").strip(),
            "deployment_ids": [], "client_ids": [],
        }
    for row in rows:
        platform = result.setdefault(row["issuer"].rstrip("/"), {
            "issuer": row["issuer"].rstrip("/"),
            "authorization_endpoint": row["authorization_endpoint"],
            "jwks_url": row["jwks_url"],
            "token_endpoint": row["token_endpoint"],
            "deployment_ids": [],
        })
        if row["client_id"] not in platform.get("client_ids", []):
            platform.setdefault("client_ids", []).append(row["client_id"])
    with connect() as db:
        for row in db.execute("SELECT issuer, client_id, deployment_id FROM deployments"):
            platform = result.get(row["issuer"])
            if platform and row["deployment_id"] not in platform["deployment_ids"]:
                platform["deployment_ids"].append(row["deployment_id"])
    return result


def platform_client(issuer, client_id=None):
    with connect() as db:
        if client_id:
            row = db.execute(
                "SELECT * FROM lti_clients WHERE issuer=? AND client_id=? AND enabled=1",
                (issuer, client_id),
            ).fetchone()
        else:
            row = db.execute(
                "SELECT * FROM lti_clients WHERE issuer=? AND enabled=1 ORDER BY id LIMIT 1",
                (issuer,),
            ).fetchone()
    return dict(row) if row else None


def private_key():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists():
        return serialization.load_pem_private_key(KEY_FILE.read_bytes(), password=None)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    KEY_FILE.write_bytes(key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()))
    KEY_FILE.chmod(0o600)
    return key


def public_jwk():
    key = json.loads(RSAAlgorithm.to_jwk(private_key().public_key()))
    key.update({"kid": "print-scan-grade", "use": "sig", "alg": "RS256"})
    return key


def known_client(db, issuer, client_id):
    row = db.execute("SELECT 1 FROM deployments WHERE issuer=? AND client_id=? LIMIT 1",
                     (issuer, client_id)).fetchone()
    client = db.execute(
        "SELECT 1 FROM lti_clients WHERE issuer=? AND client_id=? AND enabled=1",
        (issuer, client_id),
    ).fetchone()
    return bool(platforms().get(issuer) and (row or client))


def is_course_staff(roles):
    return any(
        isinstance(role, str) and (
            role.endswith("#Instructor") or role.endswith("#Administrator")
        )
        for role in roles or []
    )


def active_course_context():
    context = session.get("lti_course")
    if not isinstance(context, dict) or not context.get("is_staff"):
        abort(403, "Launch Print Scan Grade from a MiniVLE course as an instructor to manage answer sheets.")
    required = ("issuer", "context_id", "deployment_id", "course_title", "user_id")
    if any(not context.get(key) for key in required):
        abort(403, "The active LTI course context is incomplete. Launch the app from MiniVLE again.")
    return context


def _same_origin(left, right):
    return (left.scheme, left.hostname, left.port) == (right.scheme, right.hostname, right.port)


def normalize_nrps_url(value, issuer):
    parsed = urlparse(value)
    public_origin = urlparse(issuer)
    internal_base = os.getenv("LTI_INTERNAL_PLATFORM_BASE_URL", "").strip()
    internal_origin = urlparse(internal_base) if internal_base else None
    if not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("MiniVLE provided an invalid course roster URL.")
    if _same_origin(parsed, public_origin):
        if internal_origin:
            parsed = parsed._replace(scheme=internal_origin.scheme, netloc=internal_origin.netloc)
    elif not internal_origin or not _same_origin(parsed, internal_origin):
        raise ValueError("MiniVLE provided a course roster URL on an unexpected host.")
    if parsed.scheme != "https" and not (internal_origin and _same_origin(parsed, internal_origin)):
        raise ValueError("The course roster service must use HTTPS.")
    return parsed.geturl()


def is_learner_role(role):
    name = re.split(r"[#/:]", str(role))[-1].strip().lower()
    return name in {"learner", "student"}


def fetch_active_learners(context):
    memberships_url = context.get("nrps_url")
    platform = platforms().get(context["issuer"])
    token_url = (platform or {}).get("token_endpoint", "")
    if not memberships_url or not token_url:
        raise ValueError("Update the MiniVLE tool registration to grant the course roster read scope, then reopen this page.")
    token_endpoint = urlparse(token_url)
    internal_base = os.getenv("LTI_INTERNAL_PLATFORM_BASE_URL", "").strip()
    internal_origin = urlparse(internal_base) if internal_base else None
    if (token_endpoint.scheme not in {"http", "https"} or not token_endpoint.netloc or
            token_endpoint.username or token_endpoint.password or
            (token_endpoint.scheme != "https" and
             (not internal_origin or not _same_origin(token_endpoint, internal_origin)))):
        raise ValueError("The MiniVLE service token endpoint is not configured securely.")

    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": context["client_id"], "sub": context["client_id"], "aud": token_url,
            "iat": now, "exp": now + 300, "jti": secrets.token_urlsafe(24),
            LTI + "deployment_id": context["deployment_id"],
        },
        private_key(), algorithm="RS256", headers={"kid": "print-scan-grade"},
    )
    token_body = urlencode({
        "grant_type": "client_credentials",
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": assertion,
        "scope": NRPS_SCOPE,
    }).encode()
    try:
        with urlopen(Request(token_url, data=token_body, headers={
                "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}), timeout=10) as response:
            access_token = json.load(response).get("access_token")
        if not access_token:
            raise ValueError("MiniVLE did not provide a course roster access token.")

        current_url = normalize_nrps_url(memberships_url, context["issuer"])
        learners = {}
        page_count = 0
        while current_url:
            with urlopen(Request(current_url, headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
            }), timeout=10) as response:
                payload = json.load(response)
                link_header = response.headers.get("Link", "")
            members = payload.get("members", [])
            if not isinstance(members, list):
                raise ValueError("MiniVLE returned an invalid course roster.")
            for member in members:
                if not isinstance(member, dict) or not member.get("user_id"):
                    continue
                roles = member.get("roles", [])
                status = str(member.get("status", "Active")).lower()
                if status in {"", "active"} and any(is_learner_role(role) for role in roles):
                    user_id = str(member["user_id"])
                    sis_login_id = str(member.get("sis_login_id") or member.get("lis_person_sourcedid") or "").strip()
                    # Match the nine-digit number wherever MiniVLE embeds it in SIS login ID.
                    # Other platforms can provide student_id directly.
                    matches = re.findall(r"(?<!\d)(\d{9})(?!\d)", sis_login_id)
                    student_id = matches[0] if len(matches) == 1 else str(member.get("student_id") or "").strip()
                    if not sis_login_id or not re.fullmatch(r"\d{9}", student_id):
                        raise ValueError(
                            "MiniVLE's NRPS roster is missing a SIS login ID or a matching nine-digit student number."
                        )
                    name = str(member.get("name") or "").strip()
                    if not name:
                        name = " ".join(filter(None, (member.get("given_name"), member.get("family_name"))))
                    if not name:
                        name = sis_login_id
                    learners.setdefault(user_id, {
                        "name": name,
                        "sis_login_id": sis_login_id,
                        "student_id": student_id,
                    })
            next_link = re.search(r'<([^>]+)>\s*;\s*rel="?next"?', link_header, re.I)
            current_url = normalize_nrps_url(urljoin(current_url, next_link.group(1)), context["issuer"]) if next_link else None
            page_count += 1
            if page_count > 100:
                raise ValueError("The course roster has too many pages to load safely.")
        student_ids = [learner["student_id"] for learner in learners.values()]
        if len(student_ids) != len(set(student_ids)):
            raise ValueError("MiniVLE returned duplicate student numbers for active learners.")
        return list(learners.values())
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("MiniVLE's course roster could not be read. Check the NRPS tool scope and try again.") from error


def draw_registration_marks(pdf, width, height, layout_version=SHEET_LAYOUT_VERSION):
    if layout_version < 4:
        pdf.setFillColorRGB(0, 0, 0)
        for x, y in ((12, 12), (width - 20, 12), (12, height - 20), (width - 20, height - 20)):
            pdf.rect(x, y, 8, 8, fill=1, stroke=0)
        return
    # Keep the marks inside the printable area. The previous 8pt squares began
    # only 12pt from the paper edge, so ordinary printers clipped the lower
    # pair into visibly different shapes.
    edge = REGISTRATION_MARK_EDGE
    size = REGISTRATION_MARK_SIZE
    pdf.setFillColorRGB(0, 0, 0)
    for x, y in (
        (edge, edge),
        (width - edge - size, edge),
        (edge, height - edge - size),
        (width - edge - size, height - edge - size),
    ):
        pdf.rect(x, y, size, size, fill=1, stroke=0)


def draw_qr(pdf, value, x, y, size):
    widget = QrCodeWidget(value)
    x1, y1, x2, y2 = widget.getBounds()
    drawing = Drawing(
        size, size,
        transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0],
    )
    drawing.add(widget)
    renderPDF.draw(drawing, pdf, x, y)


def pdf_text(value):
    return str(value).encode("cp1252", "replace").decode("cp1252")


def wrapped_lines(text, font_name, font_size, max_width):
    lines = []
    line = ""
    for word in str(text).split():
        candidate = f"{line} {word}".strip()
        if line and stringWidth(candidate, font_name, font_size) > max_width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def guide_text(pdf, text, x, top_y, max_width, font_name="Helvetica", font_size=8,
               leading=10, color=(0.15, 0.17, 0.2), max_lines=None):
    # Guide body copy is intentionally larger and more open than diagram labels.
    font_size = max(12, font_size)
    leading = max(14, leading)
    pdf.setFillColorRGB(*color)
    pdf.setFont(font_name, font_size)
    lines = wrapped_lines(text, font_name, font_size, max_width)
    if max_lines:
        lines = lines[:max_lines]
    for index, line in enumerate(lines):
        pdf.drawString(x, top_y - index * leading, line)
    return top_y - len(lines) * leading


def guide_card(pdf, x, y, width, height, number, title):
    pdf.setFillColorRGB(0.985, 0.985, 0.975)
    pdf.setStrokeColorRGB(0.82, 0.84, 0.85)
    pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, width, height, 11, fill=1, stroke=1)
    pdf.setFillColorRGB(0.08, 0.31, 0.48)
    pdf.circle(x + 19, y + height - 21, 10, fill=1, stroke=0)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(x + 19, y + height - 24, str(number))
    pdf.setFillColorRGB(0.08, 0.1, 0.13)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(x + 36, y + height - 25, title)


def draw_guide_page(pdf, design, logo=None):
    width, height = A4
    left, right = 40, width - 40
    draw_registration_marks(pdf, width, height)

    pdf.setFillColorRGB(0.08, 0.31, 0.48)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(left, height - 34, "STUDENT GUIDE")
    pdf.setFillColorRGB(0.08, 0.1, 0.13)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(left, height - 59, "How to complete your answer sheet")
    guide_text(pdf, "Follow these examples carefully. Incorrect or unreadable answers may not be marked.",
               left, height - 78, 420, font_size=9, leading=12, color=(0.3, 0.33, 0.36))

    if logo:
        try:
            image = ImageReader(BytesIO(logo))
            image_width, image_height = image.getSize()
            scale = min(90 / image_width, 35 / image_height)
            pdf.drawImage(image, right - image_width * scale, height - 40 - image_height * scale,
                          width=image_width * scale, height=image_height * scale,
                          preserveAspectRatio=True, mask="auto")
        except (ValueError, OSError):
            pass

    guide_qr_size = 46
    guide_qr_x, guide_qr_y = right - guide_qr_size, height - 131
    draw_qr(pdf, f"PSGGUIDE|{design['form_id']}", guide_qr_x, guide_qr_y, guide_qr_size)
    pdf.setFillColorRGB(0.35, 0.37, 0.39)
    pdf.setFont("Helvetica", 5)
    pdf.drawCentredString(guide_qr_x + guide_qr_size / 2, guide_qr_y - 7, "INSTRUCTIONS ONLY")

    card_width, gap = 249, 16
    top_card_height, lower_card_height = 260, 220
    left_x, right_x = left, left + card_width + gap
    top_y, lower_y = 430, 190

    # 1. Name must stay inside its field.
    guide_card(pdf, left_x, top_y, card_width, top_card_height, 1, "Print your name inside the box")
    guide_text(pdf, "Print your full name in clear, separate letters. Do not join the letters.", left_x + 13, top_y + 214,
               card_width - 26, font_size=7.8, leading=10)
    sample_y = top_y + 145
    sample_width, sample_height = 96, 29
    safe_x, outside_x = left_x + 13, left_x + 139
    for box_x in (safe_x, outside_x):
        pdf.setStrokeColorRGB(0.34, 0.38, 0.4)
        pdf.setLineWidth(0.8)
        pdf.rect(box_x, sample_y, sample_width, sample_height, fill=0, stroke=1)
    pdf.setFillColorRGB(0.12, 0.14, 0.16)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(safe_x + 6, sample_y + 10, "ALEX KIM")
    pdf.saveState()
    pdf.translate(outside_x + 5, sample_y + 2)
    pdf.rotate(34)
    pdf.drawString(0, 0, "ALEX KIM")
    pdf.restoreState()
    pdf.setFont("Helvetica-Bold", 7)
    pdf.setFillColorRGB(0.12, 0.43, 0.27)
    pdf.drawCentredString(safe_x + sample_width / 2, sample_y - 13, "INSIDE BOX")
    pdf.setFillColorRGB(0.68, 0.16, 0.13)
    pdf.drawCentredString(outside_x + sample_width / 2, sample_y - 13, "CROSSES BORDER")
    guide_text(pdf, "If any part of your name sits outside the box, your script may not be marked.",
               left_x + 13, top_y + 105, card_width - 26, font_name="Helvetica-Bold",
               font_size=7.7, leading=10, color=(0.58, 0.13, 0.12), max_lines=3)

    # 2. The written ID and bubble ID must agree digit for digit.
    guide_card(pdf, right_x, top_y, card_width, top_card_height, 2, "Make both ID entries match")
    guide_text(pdf, "Write one digit in each box. In that same column, shade the row with that digit.", right_x + 13,
               top_y + 200, card_width - 26, font_size=7.6, leading=9)
    example_id = "207418365"
    grid_x, column_pitch = right_x + 42, 22.5
    box_width = 21
    pdf.setFillColorRGB(0.25, 0.28, 0.3)
    pdf.setFont("Helvetica-Bold", 6)
    pdf.drawString(right_x + 13, top_y + 176, "ID BOXES")
    for index, digit in enumerate(example_id):
        bx = grid_x + index * column_pitch - box_width / 2
        pdf.setStrokeColorRGB(0.38, 0.41, 0.43)
        pdf.setLineWidth(0.65)
        pdf.rect(bx, top_y + 150, box_width, 25, fill=0, stroke=1)
        pdf.setFillColorRGB(0.1, 0.12, 0.14)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawCentredString(bx + box_width / 2, top_y + 157, digit)

    grid_top, row_pitch = top_y + 138, 7
    pdf.setFillColorRGB(0.25, 0.28, 0.3)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(right_x + 13, grid_top, "SHADE THE ROW THAT MATCHES EACH BOX")
    pdf.setFont("Helvetica", 8)
    pdf.setStrokeColorRGB(0.35, 0.38, 0.4)
    for digit in range(10):
        cy = grid_top - 8 - digit * row_pitch
        pdf.setFillColorRGB(0.2, 0.22, 0.24)
        pdf.drawRightString(grid_x - 7, cy - 2.5, str(digit))
        for column, student_digit in enumerate(example_id):
            cx = grid_x + column * column_pitch
            pdf.setFillColorRGB(0, 0, 0)
            pdf.circle(cx, cy, 3.2, fill=0, stroke=1)
            if int(student_digit) == digit:
                pdf.circle(cx, cy, 2.1, fill=1, stroke=0)
    guide_text(pdf, "The bubbles must match every digit in the boxes. A mismatch may mean your work is not marked.",
               right_x + 13, top_y + 40, card_width - 26, font_name="Helvetica-Bold",
               font_size=7.2, leading=9, color=(0.58, 0.13, 0.12), max_lines=3)

    # 3. One active answer per question; show the correction method.
    guide_card(pdf, left_x, lower_y, card_width, lower_card_height, 3, "Choose one answer per question")
    guide_text(pdf, "More than one active bubble makes that question incorrect.", left_x + 13,
               lower_y + 164, card_width - 26, font_size=7.8, leading=10)
    labels_x = left_x + 87
    bubble_positions = [labels_x + i * 23 for i in range(4)]
    for row_y, label, chosen, crossed in (
        (lower_y + 116, "MULTIPLE", {0, 2}, set()),
        (lower_y + 72, "CORRECTED", {0, 2}, {0}),
    ):
        pdf.setFillColorRGB(0.2, 0.23, 0.25)
        pdf.setFont("Helvetica-Bold", 6.5)
        pdf.drawString(left_x + 13, row_y - 2, label)
        for index, cx in enumerate(bubble_positions):
            pdf.setFillColorRGB(0, 0, 0)
            pdf.setStrokeColorRGB(0.2, 0.22, 0.24)
            pdf.circle(cx, row_y, 6, fill=0, stroke=1)
            pdf.setFillColorRGB(0.75, 0.75, 0.75)
            pdf.setFont("Helvetica-Bold", 6)
            pdf.drawCentredString(cx, row_y - 2, chr(ord("A") + index))
            if index in chosen:
                pdf.setFillColorRGB(0, 0, 0)
                pdf.circle(cx, row_y, 4.5, fill=1, stroke=0)
            if index in crossed:
                pdf.setStrokeColorRGB(0.16, 0.17, 0.18)
                pdf.setLineWidth(1.1)
                pdf.line(cx - 8, row_y - 8, cx + 8, row_y + 8)
                pdf.line(cx - 8, row_y + 8, cx + 8, row_y - 8)
    pdf.setFillColorRGB(0.68, 0.16, 0.13)
    pdf.setFont("Helvetica-Bold", 6.5)
    pdf.drawString(left_x + 183, lower_y + 113, "INCORRECT")
    pdf.setFillColorRGB(0.12, 0.43, 0.27)
    pdf.drawString(left_x + 183, lower_y + 69, "X OLD, FILL NEW")
    guide_text(pdf, "For a change, cross the old bubble with an X that extends beyond its edge, then fill the new bubble.",
               left_x + 13, lower_y + 42, card_width - 26, font_size=7.5, leading=9, max_lines=3)

    # 4. Faint marks can disappear in scanning or photocopying.
    guide_card(pdf, right_x, lower_y, card_width, lower_card_height, 4, "Shade firmly and darkly")
    guide_text(pdf, "A faintly shaded bubble may be read as blank and marked incorrect.", right_x + 13,
               lower_y + 164, card_width - 26, font_size=7.8, leading=10)
    faint_x, dark_x, example_y = right_x + 76, right_x + 174, lower_y + 111
    for cx, shade, label, label_color in (
        (faint_x, 0.86, "TOO FAINT", (0.68, 0.16, 0.13)),
        (dark_x, 0.05, "DARK ENOUGH", (0.12, 0.43, 0.27)),
    ):
        pdf.setFillColorRGB(shade, shade, shade)
        pdf.setStrokeColorRGB(0.15, 0.17, 0.19)
        pdf.setLineWidth(1)
        pdf.circle(cx, example_y, 15, fill=1, stroke=1)
        pdf.setFillColorRGB(*label_color)
        pdf.setFont("Helvetica-Bold", 6.5)
        pdf.drawCentredString(cx, example_y - 28, label)
    guide_text(pdf, "Fill the bubble inside its border using a dark pencil or pen. Do not make a light mark.",
               right_x + 13, lower_y + 56, card_width - 26, font_size=7.6, leading=10, max_lines=3)

    checklist_y, checklist_height = 40, 130
    pdf.setFillColorRGB(0.92, 0.95, 0.96)
    pdf.setStrokeColorRGB(0.72, 0.79, 0.81)
    pdf.roundRect(left, checklist_y, right - left, checklist_height, 11, fill=1, stroke=1)
    pdf.setFillColorRGB(0.08, 0.31, 0.48)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(left + 16, checklist_y + checklist_height - 24, "Before handing in your answers")
    checklist_items = (
        "Print your name inside the box",
        "Make the ID boxes and bubbles match",
        "Choose one answer per question",
        "Shade bubbles firmly",
    )
    checklist_x, checklist_y_text = left + 18, checklist_y + checklist_height - 52
    pdf.setFont("Helvetica-Bold", 12)
    pdf.setFillColorRGB(0.12, 0.18, 0.21)
    pdf.setStrokeColorRGB(0.12, 0.18, 0.21)
    for index, item in enumerate(checklist_items):
        item_y = checklist_y_text - index * 15
        pdf.circle(checklist_x + 2, item_y + 2.5, 1.5, fill=1, stroke=0)
        pdf.drawString(checklist_x + 10, item_y, item)
    guide_text(pdf, "This page is a guide only. Submit the answer sheet on page 1.",
               left + 16, checklist_y + 14, right - left - 32,
               font_name="Helvetica-Bold", font_size=8, leading=10, color=(0.58, 0.13, 0.12))
    pdf.setFillColorRGB(0.28, 0.3, 0.32)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(width / 2, 27, "printscangrade.com  |  student instructions")

    # Fade instructional artwork for printing, but keep the guide QR readable.
    pdf.saveState()
    pdf.setFillAlpha(0.22)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.rect(30, 35, width - 60, 665, fill=1, stroke=0)
    pdf.restoreState()


def make_answer_sheet(design, logo=None, sample_response=None, include_guide=True,
                      layout_version=SHEET_LAYOUT_VERSION):
    if not 1 <= int(design["question_count"]) <= MAX_QUESTIONS:
        raise ValueError(f"Answer sheets support 1–{MAX_QUESTIONS} questions.")
    buffer = BytesIO()
    width, height = A4
    pdf = MinimumFontCanvas(buffer, pagesize=(width, height), pageCompression=1)
    title_text = pdf_text(design["title"])
    pdf.setTitle(f"{title_text} - Print Scan Grade answer sheet" + (" - sample response" if sample_response else ""))
    pdf.setAuthor("Print Scan Grade")
    draw_registration_marks(pdf, width, height, layout_version)

    left, right = 27, width - 27
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(left, height - 28,
                   "STUDENT ANSWER SHEET  |  READ INSTRUCTIONS PAGE FIRST (Turn over)")
    title_size = 18
    title_limit = width - left - 150
    while title_size > 10 and stringWidth(title_text, "Helvetica-Bold", title_size) > title_limit:
        title_size -= 1
    if stringWidth(title_text, "Helvetica-Bold", title_size) > title_limit:
        while title_text and stringWidth(title_text + "...", "Helvetica-Bold", title_size) > title_limit:
            title_text = title_text[:-1]
        title_text += "..."
    pdf.setFont("Helvetica-Bold", title_size)
    pdf.drawString(left, height - 51, title_text)
    pdf.setFont("Helvetica", 9)
    choice_labels = ", ".join(chr(ord("A") + i) for i in range(design["choice_count"]))
    subtitle = f"{design['question_count']} questions  |  Choices {choice_labels}"
    if sample_response:
        subtitle += "  |  SAMPLE RESPONSE"
    pdf.drawString(left, height - 68, subtitle)

    if logo:
        try:
            image = ImageReader(BytesIO(logo))
            image_width, image_height = image.getSize()
            scale = min(110 / image_width, 42 / image_height)
            shown_width, shown_height = image_width * scale, image_height * scale
            title_y = height - 51
            logo_y = title_y + title_size / 2 - shown_height / 2 - 50
            pdf.drawImage(image, right - shown_width, logo_y,
                          width=shown_width, height=shown_height, preserveAspectRatio=True,
                          mask="auto")
        except (ValueError, OSError):
            pass

    qr_size = 48
    if sample_response:
        qr_payload = (
            f"PSGSAMPLE|{design['form_id']}|{design['question_count']}|"
            f"{design['choice_count']}|{layout_version}|{sample_response['seed']}"
        )
    else:
        qr_payload = (
            f"PSG1|{design['form_id']}|{design['question_count']}|"
            f"{design['choice_count']}|{layout_version}"
        )

    # ID boxes sit directly above their bubble columns; row labels are digits 0–9.
    grid_x = left + 2
    first_bubble_x, col_pitch = grid_x + 34, 20.5
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawString(grid_x, height - 86, "STUDENT NUMBER")
    pdf.setFont("Helvetica", 6)
    pdf.drawString(grid_x, height - 99, "Write one digit in each box. Shade the matching row below.")
    box_y, box_w, box_h = height - 145, 19, 28
    pdf.setLineWidth(0.85)
    for index in range(9):
        center_x = first_bubble_x + index * col_pitch
        box_x = center_x - box_w / 2
        pdf.rect(box_x, box_y, box_w, box_h, fill=0, stroke=1)
        if sample_response:
            pdf.setFillColorRGB(0.08, 0.08, 0.08)
            pdf.setFont(sample_response["font"], 15)
            pdf.drawCentredString(center_x, box_y + 8, sample_response["student_id"][index])
            pdf.setFillColorRGB(0, 0, 0)
    # Match the answer bubbles and give the ten digit rows enough vertical room
    # that their outlines and 12pt guide letters never touch.
    first_row_y, row_pitch = box_y - 13, 14.5
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica", 6)
    for digit in range(10):
        y = first_row_y - digit * row_pitch
        pdf.drawRightString(first_bubble_x - 12, y - 2, str(digit))
        for column in range(9):
            selected_digit = sample_response and int(sample_response["student_id"][column]) == digit
            pdf.circle(
                first_bubble_x + column * col_pitch,
                y,
                FORM_BUBBLE_RADIUS,
                fill=1 if selected_digit else 0,
                stroke=1,
            )

    # Student name field sits beside the ID grid.
    name_x, name_y, name_w, name_h = left + 260, 620, right - (left + 260), 36
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawString(name_x, name_y + name_h + 7, "STUDENT NAME (PRINT CLEARLY)")
    pdf.rect(name_x, name_y, name_w, name_h, fill=0, stroke=1)
    if sample_response:
        sample_font = sample_response["font"]
        draw_sample_handwriting(pdf, sample_response["name"], name_x + 9, name_y + 11,
                                name_w - 18, sample_font)
    # Center the form QR and its identifier beneath the student-name box.
    qr_x = name_x + name_w - qr_size
    qr_y = name_y - qr_size - 18
    draw_qr(pdf, qr_payload, qr_x, qr_y, qr_size)
    pdf.setFillColorRGB(0.28, 0.3, 0.32)
    pdf.setFontExact("Helvetica", 10)
    pdf.drawRightString(name_x + name_w, qr_y - 16, f"FORM {design['form_id'][:12]}")

    # Balanced columns make the answer area span the available portrait page height.
    columns = min(4, max(1, (design["question_count"] + QUESTIONS_PER_COLUMN - 1) // QUESTIONS_PER_COLUMN))
    rows_per_column = QUESTIONS_PER_COLUMN
    question_top, question_bottom = 510, 38
    pdf.setStrokeColorRGB(0.65, 0.68, 0.7)
    pdf.setLineWidth(0.7)
    pdf.line(left, question_top, right, question_top)
    question_grid_top = question_top - 50
    column_width = (right - left) / columns
    row_pitch = min(31, max(12, (question_grid_top - question_bottom) / max(1, rows_per_column - 1)))
    bubble_radius = FORM_BUBBLE_RADIUS
    row_offset = (question_grid_top - question_bottom - (rows_per_column - 1) * row_pitch) / 2
    for column in range(columns):
        x = left + column * column_width
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica-Bold", 6)
        answer_start = x + 30
        answer_pitch = min(20.5, (column_width - 34) / max(1, design["choice_count"] - 1))
        for choice in range(design["choice_count"]):
            pdf.drawCentredString(answer_start + choice * answer_pitch, question_top - 16,
                                  chr(ord("A") + choice))

        for row in range(rows_per_column):
            question_number = column * rows_per_column + row + 1
            if question_number > design["question_count"]:
                break
            y = question_grid_top - row_offset - row * row_pitch
            pdf.setFillColorRGB(0, 0, 0)
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawRightString(x + 18, y - 3.5, f"{question_number}.")
            pdf.setLineWidth(0.75)
            pdf.setStrokeColorRGB(0, 0, 0)
            for choice in range(design["choice_count"]):
                if sample_response:
                    answer_key = sample_response.get("answers")
                    selected_choice = answer_key[question_number - 1] if answer_key else (
                        question_number + sample_response["seed"]
                    ) % design["choice_count"]
                    selected = choice == selected_choice
                else:
                    selected = False
                bubble_x = answer_start + choice * answer_pitch
                pdf.circle(bubble_x, y, bubble_radius, fill=0, stroke=1)
                pdf.setFillColorRGB(0.74, 0.74, 0.74)
                pdf.setFont("Helvetica-Bold", 5)
                pdf.drawCentredString(bubble_x, y - 3.5, chr(ord("A") + choice))
                if selected:
                    # Sample marks cover the printed guide just as a student's mark should.
                    pdf.setFillColorRGB(0, 0, 0)
                    pdf.circle(bubble_x, y, bubble_radius * 0.76, fill=1, stroke=0)

    pdf.setFontExact("Helvetica", 10)
    pdf.setFillColorRGB(0.28, 0.28, 0.28)
    pdf.drawCentredString(width / 2, 16, "printscangrade.com")
    pdf.showPage()
    if include_guide:
        draw_guide_page(pdf, design, logo)
        pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer


def sample_handwriting_font(index):
    font_name, filename = SAMPLE_FONTS[index % len(SAMPLE_FONTS)]
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(FONT_DIR / filename)))
    return font_name


def draw_sample_handwriting(pdf, text, x, y, max_width, font_name):
    original_text = str(text)
    text = original_text
    font_size = 20
    while font_size > 13 and stringWidth(text, font_name, font_size) > max_width:
        font_size -= 1
    while text and stringWidth(text + "...", font_name, font_size) > max_width:
        text = text[:-1]
    if text != original_text:
        text = text.rstrip() + "..."
    pdf.saveState()
    pdf.setFillColorRGB(0.08, 0.08, 0.08)
    pdf.setFont(font_name, font_size)
    pdf.drawString(x, y, text)
    pdf.restoreState()


def make_sample_response_pdf(design, learner, logo=None, sample_index=0, seed=None, answers=None,
                             layout_version=SHEET_LAYOUT_VERSION):
    student = {
        "name": learner["name"],
        "student_id": learner["student_id"],
        "sis_login_id": learner["sis_login_id"],
        # All sheets in a generated set share the answer-key seed.
        "seed": seed if seed is not None else (sample_index % 100) + 1,
        "font": sample_handwriting_font(sample_index),
    }
    if answers is not None:
        student["answers"] = answers
    return make_answer_sheet(
        design, logo, sample_response=student, include_guide=False,
        layout_version=layout_version,
    )


def create_app():
    app = Flask(__name__)
    secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    app.config.update(
        SECRET_KEY=os.getenv("FLASK_SECRET_KEY", "local-development-only-change-me"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=secure,
        SESSION_COOKIE_SAMESITE="None" if secure else "Lax",
        SESSION_COOKIE_PARTITIONED=secure,
        TEMPLATES_AUTO_RELOAD=True,
        SEND_FILE_MAX_AGE_DEFAULT=0,
        MAX_CONTENT_LENGTH=4 * 1024 * 1024,
    )

    @app.get("/")
    def home():
        return render_template("landing.html", course=None, launched=False)

    def admin_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if not session.get("lti_admin_authenticated"):
                return redirect(url_for("admin_login", next=request.path))
            return view(*args, **kwargs)
        return wrapped

    @app.route("/admin/login", methods=["GET", "POST"])
    def admin_login():
        if request.method == "POST":
            username = os.getenv("ADMIN_USERNAME", "").strip()
            password = os.getenv("ADMIN_PASSWORD", "")
            if (secrets.compare_digest(request.form.get("username", ""), username) and
                    secrets.compare_digest(request.form.get("password", ""), password) and username and password):
                session["lti_admin_authenticated"] = True
                target = request.args.get("next") or request.form.get("next") or url_for("lti_admin")
                return redirect(target if target.startswith("/") else url_for("lti_admin"))
            return render_template("admin_login.html", error="Incorrect username or password.", next=request.form.get("next", "")), 401
        return render_template("admin_login.html", error="", next=request.args.get("next", ""))

    @app.post("/admin/logout")
    @admin_required
    def admin_logout():
        session.pop("lti_admin_authenticated", None)
        return redirect(url_for("home"))

    @app.route("/admin/lti", methods=["GET", "POST"])
    @admin_required
    def lti_admin():
        if request.method == "POST":
            client_id = request.form.get("client_id", "").strip()
            issuer = request.form.get("issuer", "").strip().rstrip("/")
            name = request.form.get("name", "").strip() or f"{issuer} / {client_id}"
            values = (
                name, issuer, client_id,
                request.form.get("authorization_endpoint", "").strip(),
                request.form.get("jwks_url", "").strip(),
                request.form.get("token_endpoint", "").strip(),
            )
            if not all(values[1:]):
                abort(400, "Name, issuer, client ID, and all platform endpoints are required.")
            now = int(time.time())
            with connect() as db:
                client_pk = request.form.get("id", "").strip()
                if client_pk:
                    db.execute(
                        "UPDATE lti_clients SET name=?, issuer=?, client_id=?, authorization_endpoint=?, "
                        "jwks_url=?, token_endpoint=?, enabled=?, updated_at=? WHERE id=?",
                        (*values, 1 if request.form.get("enabled") == "on" else 0, now, client_pk),
                    )
                else:
                    db.execute(
                        "INSERT INTO lti_clients "
                        "(name, issuer, client_id, authorization_endpoint, jwks_url, token_endpoint, created_at, updated_at) "
                        "VALUES (?,?,?,?,?,?,?,?)",
                        (*values, now, now),
                    )
            return redirect(url_for("lti_admin"))
        with connect() as db:
            clients = [dict(row) for row in db.execute("SELECT * FROM lti_clients ORDER BY issuer, name")]
        return render_template("lti_admin.html", clients=clients)

    @app.post("/admin/lti/<int:client_pk>/delete")
    @admin_required
    def delete_lti_client(client_pk):
        with connect() as db:
            db.execute("DELETE FROM lti_clients WHERE id=?", (client_pk,))
        return redirect(url_for("lti_admin"))

    def render_print_workspace(context, form_values=None, errors=None, status=200):
        with connect() as db:
            rows = db.execute(
                "SELECT form_id, title, question_count, choice_count, created_at "
                "FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            ).fetchall()
            branding = db.execute(
                "SELECT logo_type, updated_at FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        designs = []
        for row in rows:
            design = dict(row)
            design["created_label"] = datetime.fromtimestamp(
                design["created_at"], timezone.utc
            ).strftime("%d %b %Y, %H:%M UTC")
            designs.append(design)
        if "print_csrf" not in session:
            session["print_csrf"] = secrets.token_urlsafe(32)
        return render_template(
            "print.html", context=context, designs=designs,
            branding=dict(branding) if branding else None,
            form_values=form_values or {"title": "", "question_count": 20, "choice_count": 4},
            errors=errors or [],
        ), status

    @app.get("/print")
    def print_workspace():
        return render_print_workspace(active_course_context())

    @app.get("/scan")
    def scan_workspace():
        context = active_course_context()
        return render_template("scan.html", context=context)

    @app.get("/scan/forms.json")
    def scan_forms_manifest():
        context = active_course_context()
        with connect() as db:
            rows = db.execute(
                "SELECT form_id, title, question_count, choice_count "
                "FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            ).fetchall()
        scan_forms = [
            {
                "form_id": row["form_id"],
                "title": row["title"],
                "question_count": row["question_count"],
                "choice_count": row["choice_count"],
                "legacy_layout_version": LEGACY_SHEET_LAYOUT_VERSION,
            }
            for row in rows
        ]
        return jsonify(scan_forms)

    @app.get("/scan/dummy-options.json")
    def scan_dummy_options():
        context = active_course_context()
        with connect() as db:
            rows = db.execute(
                "SELECT form_id, title FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            ).fetchall()
        try:
            learners = fetch_active_learners(context)
        except ValueError as error:
            return jsonify({"error": str(error), "forms": [], "student_count": 0}), 503
        return jsonify({
            "forms": [dict(row) for row in rows],
            "student_count": len(learners),
        })

    @app.get("/grade")
    def grade_workspace():
        context = active_course_context()
        with connect() as db:
            rows = db.execute(
                "SELECT form_id, title, question_count, choice_count "
                "FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            ).fetchall()
        grade_forms = [dict(row) for row in rows]
        if request.args.get("format") != "json":
            return render_template("scan.html", context=context, initial_phase="grade")
        roster_available = bool(
            context.get("nrps_url") and
            (platforms().get(context["issuer"]) or {}).get("token_endpoint")
        )
        roster = []
        roster_error = ""
        if roster_available:
            try:
                roster = fetch_active_learners(context)
            except ValueError as error:
                roster_error = str(error)
        return jsonify({
            "forms": grade_forms,
            "roster": roster,
            "roster_available": roster_available,
            "roster_error": roster_error,
        })

    @app.get("/scan/<form_id>/sample.pdf")
    def download_sample_response(form_id):
        context = active_course_context()
        with connect() as db:
            design = db.execute(
                "SELECT * FROM exam_designs WHERE form_id=? AND issuer=? AND context_id=?",
                (form_id, context["issuer"], context["context_id"]),
            ).fetchone()
            branding = db.execute(
                "SELECT logo FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        if not design:
            abort(404)
        try:
            learners = fetch_active_learners(context)
        except ValueError as error:
            flash(str(error), "error")
            return redirect(url_for("scan_workspace"))
        if not learners:
            flash("MiniVLE returned no active students for this course, so there are no sample sheets to create.", "error")
            return redirect(url_for("scan_workspace"))
        filename = secure_filename(design["title"]) or "answer-sheet"
        student_name = secure_filename(learners[0]["name"]) or "student"
        return send_file(
            make_sample_response_pdf(design, learners[0], branding["logo"] if branding else None),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{filename}-sample-{student_name}.pdf",
        )

    @app.get("/scan/<form_id>/dummy.zip")
    def download_dummy_response_zip(form_id):
        context = active_course_context()
        try:
            count = int(request.args.get("count", ""))
        except (TypeError, ValueError):
            abort(400, "Choose how many student sheets to generate.")
        try:
            scanner_layout_version = int(request.args.get("scanner_layout_version", "3"))
        except (TypeError, ValueError):
            scanner_layout_version = 3
        # Old open tabs do not send a scanner version. Generate the latest
        # layout they can read instead of handing them a newly introduced QR
        # version that the already-loaded JavaScript will reject.
        dummy_layout_version = 4 if scanner_layout_version >= 4 else 3
        with connect() as db:
            design = db.execute(
                "SELECT * FROM exam_designs WHERE form_id=? AND issuer=? AND context_id=?",
                (form_id, context["issuer"], context["context_id"]),
            ).fetchone()
            branding = db.execute(
                "SELECT logo FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        if not design:
            abort(404)
        try:
            learners = fetch_active_learners(context)
        except ValueError as error:
            abort(503, str(error))
        if not learners:
            abort(400, "MiniVLE returned no active students for this course.")
        if count < 1 or count > len(learners):
            abort(400, f"Choose a number from 1 to {len(learners)}.")

        filename = secure_filename(design["title"]) or "answer-sheet"
        output = BytesIO()
        question_count = int(design["question_count"])
        choice_count = int(design["choice_count"])
        answer_seed = 1
        correct_answers = [
            (question_number + answer_seed) % choice_count
            for question_number in range(1, question_count + 1)
        ]
        answer_sheet = {
            "name": "Answer Sheet",
            "student_id": "000000000",
            "sis_login_id": "",
        }
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            answer_pdf = make_sample_response_pdf(
                design, answer_sheet, branding["logo"] if branding else None,
                sample_index=0, seed=answer_seed, answers=correct_answers,
                layout_version=dummy_layout_version,
            )
            archive.writestr("000-Answer_Sheet.pdf", answer_pdf.getvalue())

            rng = random.SystemRandom()
            possible_scores = [
                score for score in range(question_count + 1)
                if 0.5 <= score / question_count <= 0.9
            ]
            for index, learner in enumerate(learners[:count]):
                student_name = secure_filename(learner["name"]) or f"student-{index + 1}"
                correct_count = rng.choice(possible_scores) if possible_scores else round(question_count * 0.7)
                changed_questions = set(rng.sample(range(question_count), question_count - correct_count))
                student_answers = list(correct_answers)
                for question_index in changed_questions:
                    alternatives = [choice for choice in range(choice_count)
                                    if choice != correct_answers[question_index]]
                    student_answers[question_index] = rng.choice(alternatives)
                pdf_data = make_sample_response_pdf(
                    design, learner, branding["logo"] if branding else None,
                    sample_index=index + 1, seed=answer_seed, answers=student_answers,
                    layout_version=dummy_layout_version,
                )
                archive.writestr(
                    f"{index + 1:03d}-{student_name}.pdf", pdf_data.getvalue()
                )
        output.seek(0)
        return send_file(
            output,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"{filename}-dummy-set-{count}-students.zip",
        )

    @app.post("/print/logo")
    def update_course_logo():
        context = active_course_context()
        submitted_csrf = request.form.get("csrf_token", "")
        if not secrets.compare_digest(submitted_csrf, session.get("print_csrf", "")):
            abort(400, "The form expired. Reload the Print page and try again.")
        if request.form.get("action") == "remove":
            with connect() as db:
                db.execute("DELETE FROM course_branding WHERE issuer=? AND context_id=?",
                           (context["issuer"], context["context_id"]))
            flash("Removed the course logo.", "success")
            return redirect(url_for("print_workspace"))

        upload = request.files.get("logo")
        if not upload or not upload.filename:
            return render_print_workspace(context, errors=["Choose a PNG or JPEG logo to upload."], status=400)
        data = upload.stream.read(3 * 1024 * 1024 + 1)
        if not data or len(data) > 3 * 1024 * 1024:
            return render_print_workspace(context, errors=["Logo files must be 3 MB or smaller."], status=400)
        try:
            image = Image.open(BytesIO(data))
            if image.format not in ("PNG", "JPEG") or image.width > 8000 or image.height > 8000:
                raise ValueError
            image.verify()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            return render_print_workspace(context, errors=["Upload a valid PNG or JPEG image (maximum 8000 × 8000 pixels)."], status=400)
        logo_type = "image/png" if image.format == "PNG" else "image/jpeg"
        with connect() as db:
            db.execute(
                "INSERT INTO course_branding (issuer, context_id, logo, logo_type, updated_at) "
                "VALUES (?,?,?,?,?) ON CONFLICT(issuer, context_id) DO UPDATE SET "
                "logo=excluded.logo, logo_type=excluded.logo_type, updated_at=excluded.updated_at",
                (context["issuer"], context["context_id"], data, logo_type, int(time.time())),
            )
        flash("Saved the logo for this course. It will appear on all its answer sheets.", "success")
        return redirect(url_for("print_workspace"))

    @app.post("/print/designs")
    def create_exam_design():
        context = active_course_context()
        submitted_csrf = request.form.get("csrf_token", "")
        if not secrets.compare_digest(submitted_csrf, session.get("print_csrf", "")):
            abort(400, "The form expired. Reload the Print page and try again.")

        title = request.form.get("title", "").strip()
        raw_questions = request.form.get("question_count", "")
        raw_choices = request.form.get("choice_count", "")
        values = {"title": title, "question_count": raw_questions, "choice_count": raw_choices}
        errors = []
        if not title:
            errors.append("Enter a name for this answer sheet.")
        elif len(title) > 120:
            errors.append("The answer-sheet name must be 120 characters or fewer.")
        try:
            question_count = int(raw_questions)
            if not 1 <= question_count <= MAX_QUESTIONS:
                raise ValueError
        except (TypeError, ValueError):
            errors.append(f"Choose between 1 and {MAX_QUESTIONS} questions.")
            question_count = 20
        try:
            choice_count = int(raw_choices)
            if not 2 <= choice_count <= 8:
                raise ValueError
        except (TypeError, ValueError):
            errors.append("Choose between 2 and 8 answer choices.")
            choice_count = 4
        values["question_count"], values["choice_count"] = question_count, choice_count
        if errors:
            return render_print_workspace(context, values, errors, 400)

        form_id = str(uuid.uuid4())
        created_at = int(time.time())
        with connect() as db:
            db.execute(
                "INSERT INTO exam_designs "
                "(form_id, issuer, context_id, deployment_id, course_title, created_by, title, "
                "question_count, choice_count, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (form_id, context["issuer"], context["context_id"], context["deployment_id"],
                 context["course_title"], context["user_id"], title, question_count,
                 choice_count, created_at),
            )
        flash(f"Saved “{title}”. Download the PDF when you are ready to print.", "success")
        return redirect(url_for("print_workspace"))

    @app.get("/print/designs/<form_id>.pdf")
    def download_exam_design(form_id):
        context = active_course_context()
        with connect() as db:
            design = db.execute(
                "SELECT * FROM exam_designs WHERE form_id=? AND issuer=? AND context_id=?",
                (form_id, context["issuer"], context["context_id"]),
            ).fetchone()
            branding = db.execute(
                "SELECT logo FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        if not design:
            abort(404)
        filename = secure_filename(design["title"]) or "answer-sheet"
        return send_file(
            make_answer_sheet(design, branding["logo"] if branding else None), mimetype="application/pdf", as_attachment=True,
            download_name=f"{filename}.pdf",
        )

    @app.post("/print/designs/<form_id>/delete")
    def delete_exam_design(form_id):
        context = active_course_context()
        submitted_csrf = request.form.get("csrf_token", "")
        if not secrets.compare_digest(submitted_csrf, session.get("print_csrf", "")):
            abort(400, "The form expired. Reload the Print page and try again.")
        with connect() as db:
            cursor = db.execute(
                "DELETE FROM exam_designs WHERE form_id=? AND issuer=? AND context_id=?",
                (form_id, context["issuer"], context["context_id"]),
            )
        if cursor.rowcount != 1:
            abort(404)
        flash("Deleted the saved sheet. Existing printed copies will no longer be recognized by Scan.", "success")
        return redirect(url_for("print_workspace"))

    @app.get("/lti/config.json")
    def tool_config():
        base = base_url()
        return jsonify({
            "title": "Print Scan Grade",
            "description": "Create paper MCQ exams, scan completed forms, and sync grades to the VLE.",
            "oidc_initiation_url": base + "/oidc/login",
            "target_link_uri": base + "/lti/launch",
            "redirect_uris": [base + "/lti/launch"],
            "public_jwk_url": base + "/.well-known/jwks.json",
            "minivle_deployment_registration_url": base + "/api/lti/deployments",
            "scopes": [NRPS_SCOPE],
            "placements": [{"placement": "course_navigation", "text": "Print Scan Grade"}],
            "messages": [{
                "type": "LtiDeepLinkingRequest",
                "target_link_uri": base + "/lti/launch",
                "label": "Add Print Scan Grade",
                "placements": ["course_navigation"],
            }],
        })

    @app.get("/.well-known/jwks.json")
    def jwks():
        return jsonify({"keys": [public_jwk()]})

    @app.post("/api/lti/deployments")
    def deployment_sync():
        payload = request.get_data()
        try:
            data = json.loads(payload)
            issuer = data["issuer"].rstrip("/")
            client_id, deployment_id = data["client_id"], data["deployment_id"]
            if not all(isinstance(x, str) and x for x in (issuer, client_id, deployment_id)):
                raise ValueError
        except (KeyError, TypeError, ValueError, AttributeError):
            abort(400, "Invalid deployment registration payload.")
        if issuer not in platforms():
            abort(400, "Unknown platform issuer.")
        with connect() as db:
            platform = db.execute(
                "SELECT 1 FROM lti_clients WHERE issuer=? AND client_id=?",
                (issuer, client_id),
            ).fetchone()
            if not platform:
                configured = platforms()[issuer]
                now = int(time.time())
                db.execute(
                    "INSERT OR IGNORE INTO lti_clients "
                    "(name, issuer, client_id, authorization_endpoint, jwks_url, token_endpoint, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (f"{issuer} / {client_id}", issuer, client_id,
                     configured["authorization_endpoint"], configured["jwks_url"],
                     configured["token_endpoint"], now, now),
                )
            db.execute("INSERT OR IGNORE INTO deployments VALUES (?,?,?,?)",
                       (issuer, client_id, deployment_id, int(time.time())))
        return jsonify({"status": "registered"}), 201

    @app.get("/oidc/login")
    def oidc_login():
        issuer = request.args.get("iss", "").rstrip("/")
        client_id = request.args.get("client_id", "")
        with connect() as db:
            if not known_client(db, issuer, client_id):
                abort(400, "Unknown LTI platform or client ID.")
        target = request.args.get("target_link_uri", "")
        if target and target.rstrip("/") != base_url() + "/lti/launch":
            abort(400, "Unexpected target link URI.")
        state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        session["lti_state"], session["lti_nonce"] = state, nonce
        session["lti_expires"] = int(time.time()) + 300
        params = {
            "response_type": "id_token", "response_mode": "form_post", "scope": "openid",
            "client_id": client_id, "redirect_uri": base_url() + "/lti/launch",
            "login_hint": request.args.get("login_hint", ""),
            "lti_message_hint": request.args.get("lti_message_hint", ""),
            "state": state, "nonce": nonce, "prompt": "none",
        }
        platform = platform_client(issuer, client_id) or platforms()[issuer]
        return redirect(platform["authorization_endpoint"] + "?" + urlencode(params))

    @app.post("/lti/launch")
    def lti_launch():
        expected = session.pop("lti_state", "")
        nonce = session.pop("lti_nonce", "")
        expires = session.pop("lti_expires", 0)
        if not expected or int(time.time()) > expires or not secrets.compare_digest(
                request.form.get("state", ""), expected):
            abort(400, "Invalid or expired LTI state.")
        token = request.form.get("id_token") or request.form.get("JWT") or ""
        try:
            header = jwt.get_unverified_header(token)
            unverified = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
            issuer = str(unverified.get("iss", "")).rstrip("/")
            platform = platforms()[issuer]
            audiences = unverified.get("aud", [])
            audiences = [audiences] if isinstance(audiences, str) else audiences
            with connect() as db:
                client_id = next((a for a in audiences if known_client(db, issuer, a)), None)
                if not client_id:
                    raise ValueError("Unknown LTI client ID")
                platform = platform_client(issuer, client_id) or platform
                with urlopen(Request(platform["jwks_url"], headers={"Accept": "application/json"}), timeout=8) as response:
                    keys = json.load(response)["keys"]
                jwk = next(k for k in keys if k.get("kid") == header.get("kid"))
                claims = jwt.decode(
                    token, RSAAlgorithm.from_jwk(json.dumps(jwk)), algorithms=["RS256"],
                    audience=client_id, issuer=issuer,
                    options={"require": ["iss", "aud", "sub", "exp", "iat", "nonce"]},
                )
                if not secrets.compare_digest(str(claims["nonce"]), nonce):
                    raise ValueError("LTI nonce mismatch")
                message_type = claims.get(LTI + "message_type")
                deployment_id = claims[LTI + "deployment_id"]
                registered = db.execute(
                    "SELECT 1 FROM deployments WHERE issuer=? AND client_id=? AND deployment_id=?",
                    (issuer, client_id, deployment_id),
                ).fetchone()
                if not registered and deployment_id not in platform.get("deployment_ids", []):
                    raise ValueError("Unregistered LTI deployment")
                if message_type == "LtiDeepLinkingRequest":
                    settings = claims.get(LTI_DEEP_LINKING + "deep_linking_settings", {})
                    return_url = settings.get("deep_link_return_url", "")
                    issuer_url, return_url_parts = urlparse(issuer), urlparse(return_url)
                    if (
                        "ltiResourceLink" not in settings.get("accept_types", [])
                        or not return_url
                        or return_url_parts.scheme != issuer_url.scheme
                        or return_url_parts.netloc != issuer_url.netloc
                    ):
                        raise ValueError("Invalid LTI Deep Linking settings")
                    now = int(time.time())
                    response_claims = {
                        "iss": base_url(), "aud": issuer, "iat": now, "exp": now + 300,
                        "jti": secrets.token_urlsafe(18),
                        LTI + "version": "1.3.0",
                        LTI + "deployment_id": deployment_id,
                        LTI + "message_type": "LtiDeepLinkingResponse",
                        LTI_DEEP_LINKING + "deep_linking_settings": {"data": settings.get("data", "")},
                        LTI_DEEP_LINKING + "content_items": [{
                            "type": "ltiResourceLink", "title": "Print Scan Grade",
                            "url": base_url() + "/lti/launch",
                        }],
                    }
                    response_token = jwt.encode(
                        response_claims, private_key(), algorithm="RS256",
                        headers={"kid": "print-scan-grade"},
                    )
                    return render_template(
                        "lti_post.html", target=return_url,
                        field_name="JWT", field_value=response_token,
                        message="Adding Print Scan Grade to your course…",
                    )
                if message_type != "LtiResourceLinkRequest":
                    raise ValueError("Unsupported LTI message type")
                context_claim = claims.get(LTI + "context", {})
                course = context_claim.get("title") or "Your course"
                course_id = context_claim.get("id")
                subject = claims.get("sub")
                roles = claims.get(LTI + "roles", [])
                is_staff = is_course_staff(roles)
                if not course_id or not subject:
                    raise ValueError("LTI launch is missing the course or user identity")
        except (KeyError, StopIteration, ValueError, jwt.PyJWTError, OSError, TypeError) as error:
            abort(400, f"Invalid LTI launch: {error}")
        session.clear()
        session["lti_course"] = {
            "issuer": issuer, "client_id": client_id, "deployment_id": deployment_id,
            "context_id": str(course_id), "course_title": course,
            "user_id": str(subject), "is_staff": is_staff,
            "nrps_url": (claims.get(NRPS_CLAIM) or {}).get("context_memberships_url"),
        }
        if is_staff:
            session["print_csrf"] = secrets.token_urlsafe(32)
            return redirect(url_for("print_workspace"))
        return render_template("landing.html", course=course, launched=True, is_staff=False)

    return app


app = create_app()
