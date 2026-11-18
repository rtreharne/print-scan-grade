"""Print Scan Grade: a small LTI 1.3 launch app."""
import json
import ipaddress
import math
import os
import random
import re
import secrets
import socket
import sqlite3
from statistics import NormalDist
import time
import uuid
import base64
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import wraps
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

import jwt
import pymupdf
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask, abort, flash, jsonify, make_response, redirect, render_template, request, send_file, session, url_for
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
SHEET_LAYOUT_VERSION = 7
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
    domain = os.getenv("DOMAIN", "").strip().rstrip("/")
    if domain:
        return f"https://{domain}"
    return os.getenv("TOOL_BASE_URL", "http://localhost:8004").strip().rstrip("/")


def _public_https_url(value):
    """Accept only public HTTPS endpoints for outbound dynamic-registration calls."""
    parsed = urlparse(value if isinstance(value, str) else "")
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or
            parsed.password or parsed.fragment):
        raise ValueError("The platform supplied an invalid HTTPS endpoint.")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443)}
    except OSError as exc:
        raise ValueError("The platform endpoint could not be resolved.") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("The platform endpoint must resolve to a public address.")
    return parsed


def environment_platforms():
    """Load both the current single-platform and legacy JSON configuration."""
    result = {}
    legacy = os.getenv("LTI_PLATFORM_REGISTRATIONS", "").strip()
    if legacy:
        raw = json.loads(legacy)
        if not isinstance(raw, list):
            raise ValueError("LTI_PLATFORM_REGISTRATIONS must be a JSON array")
        for item in raw:
            if not isinstance(item, dict) or not str(item.get("issuer", "")).strip():
                raise ValueError("Each LTI platform registration must have an issuer")
            issuer = str(item["issuer"]).strip().rstrip("/")
            platform = dict(item)
            platform["issuer"] = issuer
            platform["deployment_ids"] = list(item.get("deployment_ids") or [])
            platform["client_ids"] = list(item.get("client_ids") or [])
            if item.get("client_id") and item["client_id"] not in platform["client_ids"]:
                platform["client_ids"].append(item["client_id"])
            result[issuer] = platform

    configured_issuer = os.getenv("LTI_PLATFORM_ISSUER", "").strip().rstrip("/")
    if configured_issuer:
        result[configured_issuer] = {
            "issuer": configured_issuer,
            "authorization_endpoint": os.getenv("LTI_PLATFORM_AUTHORIZATION_ENDPOINT", "").strip(),
            "jwks_url": os.getenv("LTI_PLATFORM_JWKS_URL", "").strip(),
            "token_endpoint": os.getenv("LTI_PLATFORM_TOKEN_ENDPOINT", "").strip(),
            "deployment_ids": [],
            "client_ids": [],
        }
    return result


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
        CREATE TABLE IF NOT EXISTS lti_registration_requests (
            request_id TEXT PRIMARY KEY,
            issuer TEXT NOT NULL,
            authorization_endpoint TEXT NOT NULL,
            jwks_url TEXT NOT NULL,
            token_endpoint TEXT NOT NULL,
            registration_endpoint TEXT NOT NULL,
            registration_token TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_migrations (
            name TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
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
        CREATE TABLE IF NOT EXISTS standalone_designs (
            slug TEXT PRIMARY KEY,
            form_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 60),
            choice_count INTEGER NOT NULL CHECK(choice_count BETWEEN 2 AND 8),
            logo BLOB,
            logo_type TEXT CHECK(logo_type IN ('image/png', 'image/jpeg')),
            created_at INTEGER NOT NULL
        );
    """)
    # Releases before lti_clients was introduced stored only deployment rows.
    # Once endpoint metadata is available, retain those clients in the new
    # registration table so existing launches continue to work and appear in
    # the admin UI.
    now = int(time.time())
    for issuer, platform in environment_platforms().items():
        migration_name = f"deployment-clients:{issuer}"
        if db.execute(
                "SELECT 1 FROM app_migrations WHERE name=?", (migration_name,)
        ).fetchone():
            continue
        endpoints = tuple(platform.get(key, "") for key in (
            "authorization_endpoint", "jwks_url", "token_endpoint"
        ))
        if not all(endpoints):
            continue
        db.execute(
            "INSERT OR IGNORE INTO lti_clients "
            "(name, issuer, client_id, authorization_endpoint, jwks_url, token_endpoint, created_at, updated_at) "
            "SELECT ? || ' / ' || client_id, issuer, client_id, ?, ?, ?, ?, ? "
            "FROM deployments WHERE issuer=?",
            (issuer, *endpoints, now, now, issuer),
        )
        db.execute(
            "INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)",
            (migration_name, now),
        )
    db.commit()
    return db


def platforms():
    with connect() as db:
        rows = db.execute(
            "SELECT issuer, client_id, authorization_endpoint, jwks_url, token_endpoint "
            "FROM lti_clients WHERE enabled=1 ORDER BY id"
        ).fetchall()
    result = environment_platforms()
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
        abort(403, "Launch Print Scan Grade through LTI from your course as an instructor to manage answer sheets.")
    required = ("issuer", "context_id", "deployment_id", "course_title", "user_id")
    if any(not context.get(key) for key in required):
        abort(403, "The active LTI course context is incomplete. Launch the app from your learning platform again.")
    return context




def _same_origin(left, right):
    return (left.scheme, left.hostname, left.port) == (right.scheme, right.hostname, right.port)


def normalize_nrps_url(value, issuer):
    parsed = urlparse(value)
    public_origin = urlparse(issuer)
    internal_base = os.getenv("LTI_INTERNAL_PLATFORM_BASE_URL", "").strip()
    internal_origin = urlparse(internal_base) if internal_base else None
    canvas_public_base = os.getenv("CANVAS_PUBLIC_BASE_URL", "").strip()
    canvas_public_origin = urlparse(canvas_public_base) if canvas_public_base else None
    if not parsed.netloc or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("The learning platform provided an invalid course roster URL.")
    # Canvas commonly advertises canvas.instructure.com as its issuer while
    # serving its institution-specific NRPS endpoint from another host.
    if canvas_public_origin and _same_origin(parsed, canvas_public_origin):
        if parsed.scheme != "https":
            raise ValueError("The course roster service must use HTTPS.")
        return parsed.geturl()
    if _same_origin(parsed, public_origin):
        if internal_origin:
            parsed = parsed._replace(scheme=internal_origin.scheme, netloc=internal_origin.netloc)
    elif not internal_origin or not _same_origin(parsed, internal_origin):
        raise ValueError("The learning platform provided a course roster URL on an unexpected host.")
    if parsed.scheme != "https" and not (internal_origin and _same_origin(parsed, internal_origin)):
        raise ValueError("The course roster service must use HTTPS.")
    return parsed.geturl()


def is_learner_role(role):
    name = re.split(r"[#/:]", str(role))[-1].strip().lower()
    return name in {"learner", "student"}


def fetch_active_learners(context):
    memberships_url = context.get("nrps_url")
    platform = platform_client(context["issuer"], context.get("client_id")) or platforms().get(context["issuer"])
    token_url = (platform or {}).get("token_endpoint", "")
    if not memberships_url or not token_url:
        raise ValueError("Update the tool registration to grant the course roster read scope, then reopen this page.")
    token_endpoint = urlparse(token_url)
    internal_base = os.getenv("LTI_INTERNAL_PLATFORM_BASE_URL", "").strip()
    internal_origin = urlparse(internal_base) if internal_base else None
    if (token_endpoint.scheme not in {"http", "https"} or not token_endpoint.netloc or
            token_endpoint.username or token_endpoint.password or
            (token_endpoint.scheme != "https" and
             (not internal_origin or not _same_origin(token_endpoint, internal_origin)))):
        raise ValueError("The learning platform token endpoint is not configured securely.")

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
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": "PrintScanGrade-LTI/1.0 (+https://printscangrade.uniwebdev.co.uk)",
        }), timeout=10) as response:
            access_token = json.load(response).get("access_token")
        if not access_token:
            raise ValueError("The learning platform did not provide a course roster access token.")

        current_url = normalize_nrps_url(memberships_url, context["issuer"])
        learners = {}
        page_count = 0
        while current_url:
            with urlopen(Request(current_url, headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
                    "User-Agent": "PrintScanGrade-LTI/1.0 (+https://printscangrade.uniwebdev.co.uk)",
            }), timeout=10) as response:
                payload = json.load(response)
                link_header = response.headers.get("Link", "")
            members = payload.get("members", [])
            if not isinstance(members, list):
                raise ValueError("The learning platform returned an invalid course roster.")
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
                    # Canvas test courses commonly omit SIS IDs. Preserve a
                    # stable value here; normalize_learners assigns an
                    # unambiguous temporary nine-digit ID when needed.
                    if not student_id:
                        student_id = sis_login_id or user_id
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
            raise ValueError("The learning platform returned duplicate student numbers for active learners.")
        return list(learners.values())
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("The learning platform's course roster could not be read. Check the NRPS tool scope and try again.") from error


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


def draw_guide_page(pdf, design, logo=None, generic=False):
    width, height = A4
    left, right = 40, width - 40
    if not generic:
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

    if not generic:
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
    guide_card(pdf, right_x, lower_y, card_width, lower_card_height, 4, "Use black pen and shade firmly")
    guide_text(pdf, "Use black pen only. A faintly shaded bubble may be read as blank and marked incorrect.", right_x + 13,
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
    guide_text(pdf, "Fill the bubble inside its border using black pen. Do not use pencil or make a light mark.",
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
        "Use black pen and shade bubbles firmly",
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

    # Fade instructional artwork while retaining the registration marks.
    pdf.saveState()
    pdf.setFillAlpha(0.22)
    pdf.setFillColorRGB(1, 1, 1)
    pdf.rect(30, 35, width - 60, 665, fill=1, stroke=0)
    pdf.restoreState()


def make_answer_sheet(design, logo=None, sample_response=None, include_guide=True,
                      layout_version=SHEET_LAYOUT_VERSION, generic=False):
    if not 1 <= int(design["question_count"]) <= MAX_QUESTIONS:
        raise ValueError(f"Answer sheets support 1–{MAX_QUESTIONS} questions.")
    buffer = BytesIO()
    width, height = A4
    pdf = MinimumFontCanvas(buffer, pagesize=(width, height), pageCompression=1)
    title_text = "" if generic else pdf_text(design["title"])
    pdf.setTitle(f"{title_text} - Print Scan Grade answer sheet" + (" - sample response" if sample_response else ""))
    pdf.setAuthor("Print Scan Grade")
    draw_registration_marks(pdf, width, height, layout_version)

    left, right = 27, width - 27
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(left, height - 28,
                   "USE BLACK PEN ONLY  |  READ INSTRUCTIONS PAGE FIRST (Turn over)")
    title_size = 18
    title_limit = width - left - 150
    while title_size > 10 and stringWidth(title_text, "Helvetica-Bold", title_size) > title_limit:
        title_size -= 1
    if stringWidth(title_text, "Helvetica-Bold", title_size) > title_limit:
        while title_text and stringWidth(title_text + "...", "Helvetica-Bold", title_size) > title_limit:
            title_text = title_text[:-1]
        title_text += "..."
    pdf.setFont("Helvetica-Bold", title_size)
    if title_text:
        pdf.drawString(left, height - 51, title_text)
    pdf.setFont("Helvetica", 9)
    choice_labels = ", ".join(chr(ord("A") + i) for i in range(design["choice_count"]))
    subtitle = f"{design['question_count']} questions  |  Choices {choice_labels}"
    if generic:
        qr_payload = None
    elif sample_response:
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
    student_id = str(sample_response.get("student_id") or "") if sample_response else ""
    for index in range(9):
        center_x = first_bubble_x + index * col_pitch
        box_x = center_x - box_w / 2
        pdf.rect(box_x, box_y, box_w, box_h, fill=0, stroke=1)
        if sample_response and index < len(student_id):
            pdf.setFillColorRGB(0.08, 0.08, 0.08)
            pdf.setFont(sample_response["font"], 15)
            pdf.drawCentredString(center_x, box_y + 8, student_id[index])
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
            selected_digit = bool(
                sample_response and sample_response.get("fill_id_bubbles", True) and
                column < len(student_id) and student_id[column].isdigit() and
                int(student_id[column]) == digit
            )
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
    if not generic:
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
    # In the uniquely dense four-column A–H layout, a modestly smaller answer
    # bubble preserves a real gap between columns. ID bubbles stay full size.
    if layout_version >= 7:
        max_answer_radius = (
            column_width - 35 - 8 - max(0, design["choice_count"] - 1) * 0.75
        ) / (2 * design["choice_count"] - 1)
        bubble_radius = max(5.5, min(FORM_BUBBLE_RADIUS, max_answer_radius))
    else:
        bubble_radius = FORM_BUBBLE_RADIUS
    row_offset = (question_grid_top - question_bottom - (rows_per_column - 1) * row_pitch) / 2
    for column in range(columns):
        x = left + column * column_width
        pdf.setFillColorRGB(0, 0, 0)
        pdf.setFont("Helvetica-Bold", 6)
        # Layout 5 moves the first choice bubble right, giving the question
        # number a clear visual gap even when all A–H choices are present.
        # Layout 6 reserves space after the final bubble before the next
        # column's question number; layout 7 keeps that space even in dense
        # A–H grids. Keep prior geometry for older QR layouts so their scans
        # remain valid.
        if layout_version >= 5:
            answer_start = x + 35
            requested_trailing_gap = 8 if layout_version >= 6 else 0
            # Never make adjacent bubbles overlap just to create a column
            # gutter in a particularly dense (for example, 60-question A–H)
            # sheet.
            minimum_pitch = bubble_radius * 2 + 0.75
            trailing_gap = max(0, min(
                requested_trailing_gap,
                column_width - (answer_start - x) - bubble_radius -
                max(0, design["choice_count"] - 1) * minimum_pitch,
            ))
            answer_pitch = min(
                20.5,
                (column_width - (answer_start - x) - bubble_radius - trailing_gap) /
                max(1, design["choice_count"] - 1),
            )
        else:
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
                    selected_choices = (selected_choice if isinstance(selected_choice, (list, tuple, set))
                                        else [selected_choice])
                    crossed_choice = sample_response.get("crossed_answers", {}).get(question_number)
                    extra_choices = sample_response.get("additional_answers", {}).get(question_number, [])
                    selected = (choice in selected_choices or choice == crossed_choice or
                                choice in extra_choices)
                else:
                    selected = False
                bubble_x = answer_start + choice * answer_pitch
                pdf.circle(bubble_x, y, bubble_radius, fill=0, stroke=1)
                pdf.setFillColorRGB(0.74, 0.74, 0.74)
                # These letters are deliberately tiny, pale guides inside the
                # answer bubbles. The minimum-font canvas must not enlarge
                # them, or the scanner can mistake the printed glyphs for marks.
                pdf.setFontExact("Helvetica-Bold", 5)
                pdf.drawCentredString(bubble_x, y - 3.5, chr(ord("A") + choice))
                if selected:
                    # Sample marks cover the printed guide just as a student's mark should.
                    pdf.setFillColorRGB(0, 0, 0)
                    pdf.circle(bubble_x, y, bubble_radius * 0.76, fill=1, stroke=0)
                    if sample_response and choice == crossed_choice:
                        pdf.setStrokeColorRGB(0, 0, 0)
                        pdf.setLineWidth(1.5)
                        cross_radius = bubble_radius * 1.35
                        pdf.line(bubble_x - cross_radius, y - cross_radius,
                                 bubble_x + cross_radius, y + cross_radius)
                        pdf.line(bubble_x - cross_radius, y + cross_radius,
                                 bubble_x + cross_radius, y - cross_radius)
                        pdf.setLineWidth(0.75)

    pdf.setFontExact("Helvetica", 10)
    pdf.setFillColorRGB(0.28, 0.28, 0.28)
    pdf.drawCentredString(width / 2, 16, "printscangrade.com")
    pdf.showPage()
    if include_guide:
        draw_guide_page(pdf, design, logo, generic=generic)
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
                             layout_version=SHEET_LAYOUT_VERSION, fill_id_bubbles=True,
                             crossed_answers=None, additional_answers=None, generic=False):
    student = {
        "name": learner["name"],
        "student_id": learner["student_id"],
        "sis_login_id": learner["sis_login_id"],
        # All sheets in a generated set share the answer-key seed.
        "seed": seed if seed is not None else (sample_index % 100) + 1,
        "font": sample_handwriting_font(sample_index),
        "fill_id_bubbles": fill_id_bubbles,
    }
    if answers is not None:
        student["answers"] = answers
    if crossed_answers:
        student["crossed_answers"] = crossed_answers
    if additional_answers:
        student["additional_answers"] = additional_answers
    return make_answer_sheet(
        design, logo, sample_response=student, include_guide=False,
        layout_version=layout_version, generic=generic,
    )


def dummy_score_counts(student_count, question_count, rng):
    """Return a realistic bell-shaped cohort with a small number of outliers."""
    if student_count < 1 or question_count < 1:
        return []
    minimum = math.ceil(question_count * 0.40)
    maximum = math.floor(question_count * 0.90)
    # Very short tests cannot express a distinct 40–90% interval.
    if minimum > maximum:
        minimum, maximum = 0, question_count
    if student_count == 1:
        return [min(maximum, max(minimum, round(question_count * 0.65)))]

    # Quantiles give every cohort size a smooth progression without artificial
    # score clusters. The main cohort sits between 40% and 90% around 65%.
    normal = NormalDist(mu=0.65, sigma=0.12)
    target_rates = [normal.inv_cdf((index + 0.5) / student_count)
                    for index in range(student_count)]
    target_rates = [min(0.90, max(0.40, rate)) for rate in target_rates]
    target_counts = [rate * question_count for rate in target_rates]
    counts = [min(maximum, max(minimum, round(target))) for target in target_counts]
    # Add rare tails outside the main 40–90% profile. They make the histogram
    # and item analysis resemble a real cohort without dominating it.
    outlier_count = 1 if student_count >= 8 else 0
    if outlier_count:
        counts[0] = max(0, math.floor(question_count * rng.uniform(0.25, 0.39)))
        counts[-1] = min(question_count, math.ceil(question_count * rng.uniform(0.91, 0.98)))
    rng.shuffle(counts)
    return counts


def score_distribution(counts, question_count):
    """Return population mean and standard deviation as score proportions."""
    if not counts or question_count < 1:
        return 0.0, 0.0
    scores = [count / question_count for count in counts]
    mean = sum(scores) / len(scores)
    variance = sum((score - mean) ** 2 for score in scores) / len(scores)
    return mean, math.sqrt(variance)


def dummy_correct_question_sets(score_counts, question_count, rng, multi_answer_question=1):
    """Generate answer patterns with varied difficulty and useful discrimination.

    Higher-ability students are more likely to solve well-discriminating items;
    a small set of weak items and difficult items gives the analysis dashboard
    realistic signals rather than identical item bars.
    """
    if not score_counts or question_count < 1:
        return [], []
    abilities = [score / question_count for score in score_counts]
    correct_sets = [set() for _ in score_counts]
    qualities = []
    for question in range(1, question_count + 1):
        position = (question - 1) / max(1, question_count - 1)
        difficulty = 0.82 - position * 0.36
        # Every eighth item is deliberately weak; every sixth is challenging.
        discrimination = 1.35
        if question % 8 == 0:
            difficulty, discrimination = 0.58, 0.15
            quality = "weak discrimination"
        elif question % 6 == 0:
            difficulty, discrimination = 0.42, 1.55
            quality = "challenging"
        else:
            quality = "discriminating"
        qualities.append(quality)
        for index, ability in enumerate(abilities):
            probability = difficulty + (ability - 0.65) * discrimination
            probability = min(0.96, max(0.04, probability))
            if rng.random() < probability:
                correct_sets[index].add(question)
    return correct_sets, qualities


def create_app():
    app = Flask(__name__)
    app.extensions["roster_jobs"] = {}
    app.extensions["roster_executor"] = ThreadPoolExecutor(
        max_workers=4, thread_name_prefix="lti-roster"
    )
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

    @app.before_request
    def redirect_public_http_to_https():
        public = urlparse(base_url())
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").split(",", 1)[0].strip().lower()
        if (public.scheme == "https" and request.host == public.netloc and
                forwarded_proto == "http"):
            return redirect(base_url() + request.full_path, code=308)

    @app.after_request
    def iframe_headers(response):
        if request.path.startswith("/standalone/"):
            response.headers.pop("X-Frame-Options", None)
            response.headers["Content-Security-Policy"] = "frame-ancestors *"
            return response
        return response

    @app.get("/")
    def home():
        response = make_response(render_template("landing.html", course=None, launched=False))
        response.headers["Cache-Control"] = "no-store"
        return response

    def lti_course_required(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            active_course_context()
            return view(*args, **kwargs)
        return wrapped

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
    @lti_course_required
    def print_workspace():
        return render_print_workspace(active_course_context())

    @app.get("/scan")
    @lti_course_required
    def scan_workspace():
        context = active_course_context()
        job_key = (context["issuer"], str(context["context_id"]),
                   str(context.get("client_id", "")), str(context["deployment_id"]))
        jobs = app.extensions["roster_jobs"]
        job = jobs.get(job_key)
        # Keep a completed roster briefly so switching between Scan and Grade
        # does not make another NRPS request. A fresh page load after two
        # minutes starts a new lookup.
        if not job or (job["future"].done() and time.monotonic() - job["started"] > 120):
            job = {
                "started": time.monotonic(),
                "future": app.extensions["roster_executor"].submit(
                    fetch_active_learners, dict(context)
                ),
            }
            jobs[job_key] = job
        if not job["future"].done():
            return render_template("scan_loading.html", context=context)

        with connect() as db:
            dummy_forms = [dict(row) for row in db.execute(
                "SELECT form_id, title FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            )]
        dummy_learners, dummy_enrollment_error = [], ""
        try:
            dummy_learners = job["future"].result()
        except Exception as error:
            dummy_enrollment_error = str(error)
        return render_template(
            "scan.html", context=context, dummy_forms=dummy_forms,
            dummy_student_count=len(dummy_learners),
            dummy_synthetic_student_ids=any(item.get("synthetic_student_id") for item in dummy_learners),
            dummy_enrollment_error=dummy_enrollment_error,
        )

    @app.post("/scan/render-page")
    @lti_course_required
    def render_scan_page():
        active_course_context()
        request.max_content_length = 64 * 1024 * 1024
        if request.mimetype != "application/pdf" or request.headers.get("X-Scan-Render") != "1":
            abort(415, "A PDF scan is required.")
        page_number = request.args.get("page", type=int)
        if page_number is None or page_number < 1:
            abort(400, "A valid page number is required.")
        pdf_bytes = request.get_data()
        if not pdf_bytes.startswith(b"%PDF-"):
            abort(400, "The uploaded file is not a PDF.")
        try:
            with pymupdf.open(stream=pdf_bytes, filetype="pdf") as document:
                if page_number > len(document):
                    abort(400, "The requested page does not exist.")
                page = document[page_number - 1]
                scale = min(2.8, 1600 / max(page.rect.width, page.rect.height))
                # Render the PDF layers as the viewer shows them. No tone or
                # contrast operation is applied to the resulting RGB pixels.
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale),
                                         colorspace=pymupdf.csRGB, alpha=False)
                png = pixmap.tobytes("png")
        except (pymupdf.FileDataError, pymupdf.EmptyFileError, ValueError):
            abort(400, "The PDF page could not be rendered.")
        response = send_file(BytesIO(png), mimetype="image/png", download_name="scan-page.png")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/scan/forms.json")
    @lti_course_required
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
    @lti_course_required
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
            "synthetic_student_ids": any(learner.get("synthetic_student_id") for learner in learners),
        })

    @app.get("/scan/dummy-forms.json")
    @lti_course_required
    def scan_dummy_forms():
        context = active_course_context()
        with connect() as db:
            rows = db.execute(
                "SELECT form_id, title FROM exam_designs WHERE issuer=? AND context_id=? ORDER BY created_at DESC",
                (context["issuer"], context["context_id"]),
            ).fetchall()
        return jsonify({"forms": [dict(row) for row in rows]})

    @app.get("/grade")
    @lti_course_required
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
            (platform_client(context["issuer"], context.get("client_id")) or
             platforms().get(context["issuer"]) or {}).get("token_endpoint")
        )
        roster = []
        roster_error = ""
        if roster_available:
            try:
                # Cross-reference the roster supplied by the LTI NRPS service.
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
    @lti_course_required
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
    @lti_course_required
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
        dummy_layout_version = 7 if scanner_layout_version >= 7 else 6 if scanner_layout_version >= 6 else 5 if scanner_layout_version >= 5 else 4 if scanner_layout_version >= 4 else 3
        generic = form_id == "generic"
        with connect() as db:
            design = None if generic else db.execute(
                "SELECT * FROM exam_designs WHERE form_id=? AND issuer=? AND context_id=?",
                (form_id, context["issuer"], context["context_id"]),
            ).fetchone()
            branding = db.execute(
                "SELECT logo FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        if generic:
            try:
                question_count = int(request.args.get("question_count", ""))
                choice_count = int(request.args.get("choice_count", ""))
                if not 1 <= question_count <= MAX_QUESTIONS or not 2 <= choice_count <= 8:
                    raise ValueError
            except (TypeError, ValueError):
                abort(400, f"Choose 1–{MAX_QUESTIONS} questions and 2–8 choices.")
            design = {"title": "Generic answer sheet", "form_id": "", "question_count": question_count,
                      "choice_count": choice_count}
        elif not design:
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
        # Include a deterministic multi-answer key item in every dummy set so
        # the Grade workspace exposes its all-keyed/any-keyed rule selector.
        multi_answer_question = 1
        multi_answer_choices = [correct_answers[0], (correct_answers[0] + 1) % choice_count]
        answer_key_answers = list(correct_answers)
        answer_key_answers[multi_answer_question - 1] = multi_answer_choices
        rng = random.SystemRandom()
        score_counts = dummy_score_counts(count, question_count, rng)
        correct_question_sets, item_qualities = dummy_correct_question_sets(
            score_counts, question_count, rng, multi_answer_question
        )
        all_answer_slots = [
            (student_index, question_number)
            for student_index in range(count)
            for question_number in range(1, question_count + 1)
            if question_number != multi_answer_question
        ]
        shuffled_slots = rng.sample(all_answer_slots, len(all_answer_slots))
        total_student_answers = len(all_answer_slots)
        correction_target = max(1, (total_student_answers * 5 + 99) // 100)
        multiple_target = max(1, (total_student_answers + 99) // 100)
        blank_target = max(1, (total_student_answers * 5 + 99) // 100)
        # Tiny sheets may not have enough distinct answers for every requested
        # category; reserve one slot per category in order when possible.
        correction_count = min(correction_target, len(shuffled_slots))
        multiple_count = min(multiple_target, len(shuffled_slots) - correction_count)
        blank_count = min(blank_target, len(shuffled_slots) - correction_count - multiple_count)
        correction_slots = shuffled_slots[:correction_count]
        multiple_slots = shuffled_slots[correction_count:correction_count + multiple_count]
        blank_slots = shuffled_slots[correction_count + multiple_count:
                                     correction_count + multiple_count + blank_count]
        corrections_by_student = [{} for _ in range(count)]
        multiples_by_student = [{} for _ in range(count)]
        blanks_by_student = [set() for _ in range(count)]
        for student_index, question_number in correction_slots:
            corrections_by_student[student_index][question_number] = True
        for student_index, question_number in multiple_slots:
            multiples_by_student[student_index][question_number] = True
        for student_index, question_number in blank_slots:
            blanks_by_student[student_index].add(question_number)
        # A blank or uncrossed multiple answer is deliberately ungradeable.
        # Reserve those questions before choosing correct answers so the final
        # scored response, rather than a hidden preliminary mark, follows the
        # requested cohort distribution.
        compensatory_effective_counts = {
            score for score in range(question_count + 1)
            if 0.35 <= score / question_count < 0.40
        }
        effective_score_counts = []
        for index in range(count):
            gradeable_count = question_count - len(
                blanks_by_student[index] | set(multiples_by_student[index])
            )
            effective = min(score_counts[index], gradeable_count)
            if effective in compensatory_effective_counts:
                # Keep a final scored result out of the compensatory band even
                # when a blank/multiple-answer slot lowered the planned score.
                lower = min(effective - 1, math.ceil(question_count * 0.35) - 1)
                effective = max(0, lower) if lower >= 0 else min(gradeable_count, math.ceil(question_count * 0.40))
            effective_score_counts.append(effective)
        score_mean, score_stddev = score_distribution(effective_score_counts, question_count)
        answer_sheet = {
            "name": "Answer Sheet",
            "student_id": "000000000",
            "sis_login_id": "",
        }
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            answer_pdf = make_sample_response_pdf(
                design, answer_sheet, branding["logo"] if branding else None,
                sample_index=0, seed=answer_seed, answers=answer_key_answers,
                layout_version=dummy_layout_version, generic=generic,
            )
            archive.writestr("000-Answer_Sheet.pdf", answer_pdf.getvalue())

            missing_name_index = 0
            missing_id_bubble_count = max(1, math.ceil(count * 0.05))
            missing_id_bubbles_indices = set(rng.sample(range(count), missing_id_bubble_count))
            issue_lines = [
                "Page appearance: clean white PDF; no rotation or geometric distortion.",
                f"Student pages: {count}; questions per page: {question_count}.",
                "Score profile: bell-shaped main cohort from 40% to 90%, with occasional low and high outliers.",
                f"Planned student ability profile: {score_mean:.0%} average, {score_stddev:.0%} standard deviation, "
                f"{min(effective_score_counts) / question_count:.0%}–{max(effective_score_counts) / question_count:.0%} range; "
                "with varied item difficulty and discrimination.",
                f"Filled answer then crossed out: {correction_count} of {total_student_answers} student answers.",
                f"Two filled answers with no cross: {multiple_count} of {total_student_answers} student answers.",
                f"No answer filled: {blank_count} of {total_student_answers} student answers.",
                "Answer key: question 1 has two correct answers; configure its scoring rule in Grade.",
                f"Name left blank: {learners[missing_name_index]['name']}.",
                "ID bubbles left blank (written student number remains): " +
                ", ".join(learners[index]["name"] for index in sorted(missing_id_bubbles_indices)) + ".",
                "Question numbers below are one-based.",
            ]
            for index, roster_learner in enumerate(learners[:count]):
                learner = dict(roster_learner)
                student_name = secure_filename(learner["name"]) or f"student-{index + 1}"
                excluded_questions = blanks_by_student[index] | set(multiples_by_student[index])
                gradeable_questions = [
                    question_index for question_index in range(question_count)
                    if question_index + 1 not in excluded_questions
                ]
                correct_questions = correct_question_sets[index] & {
                    question + 1 for question in gradeable_questions
                }
                student_answers = []
                for question_index, correct_answer in enumerate(answer_key_answers):
                    keyed_choices = (list(correct_answer) if isinstance(correct_answer, (list, tuple, set))
                                     else [correct_answer])
                    if question_index + 1 in blanks_by_student[index]:
                        student_answers.append(None)
                    elif question_index + 1 in correct_questions:
                        student_answers.append(keyed_choices if len(keyed_choices) > 1 else keyed_choices[0])
                    else:
                        alternatives = [choice for choice in range(choice_count)
                                        if choice not in keyed_choices]
                        student_answers.append(rng.choice(alternatives))
                crossed_answers = {}
                additional_answers = {}
                for question_number in corrections_by_student[index]:
                    answer = student_answers[question_number - 1]
                    answer_choices = answer if isinstance(answer, (list, tuple, set)) else [answer]
                    alternatives = [choice for choice in range(choice_count) if choice not in answer_choices]
                    crossed_answers[question_number] = rng.choice(alternatives)
                for question_number in multiples_by_student[index]:
                    answer = student_answers[question_number - 1]
                    answer_choices = answer if isinstance(answer, (list, tuple, set)) else [answer]
                    alternatives = [choice for choice in range(choice_count) if choice not in answer_choices]
                    additional_answers[question_number] = [rng.choice(alternatives)]
                if index == missing_name_index:
                    learner["name"] = ""
                fill_id_bubbles = index not in missing_id_bubbles_indices
                pdf_data = make_sample_response_pdf(
                    design, learner, branding["logo"] if branding else None,
                    sample_index=index + 1, seed=answer_seed, answers=student_answers,
                    layout_version=dummy_layout_version,
                    fill_id_bubbles=fill_id_bubbles,
                    crossed_answers=crossed_answers,
                    additional_answers=additional_answers,
                    generic=generic,
                )
                archive.writestr(
                    f"{index + 1:03d}-{student_name}.pdf",
                    pdf_data.getvalue(),
                )
                if crossed_answers:
                    issue_lines.append(
                        f"Filled answer crossed out: {roster_learner['name']} — "
                        f"questions {', '.join(map(str, sorted(crossed_answers)))}."
                    )
                if additional_answers:
                    issue_lines.append(
                        f"Multiple un-crossed answers: {roster_learner['name']} — "
                        f"questions {', '.join(map(str, sorted(additional_answers)))}."
                    )
                if blanks_by_student[index]:
                    issue_lines.append(
                        f"Blank answers: {roster_learner['name']} — "
                        f"questions {', '.join(map(str, sorted(blanks_by_student[index])))}."
                    )
            issue_lines.append("Item profile: " + ", ".join(
                f"Q{question + 1} {quality}" for question, quality in enumerate(item_qualities)
            ) + ".")
            archive.writestr("dummy-set-notes.txt", "\n".join(issue_lines) + "\n")
        output.seek(0)
        return send_file(
            output,
            mimetype="application/zip",
            as_attachment=True,
            download_name=f"{filename}-dummy-set-{count}-students.zip",
        )

    @app.post("/print/logo")
    @lti_course_required
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
    @lti_course_required
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

    @app.post("/print/generic.pdf")
    @lti_course_required
    def download_generic_sheet():
        context = active_course_context()
        if not secrets.compare_digest(request.form.get("csrf_token", ""), session.get("print_csrf", "")):
            abort(400, "The form expired. Reload the Print page and try again.")
        try:
            question_count = int(request.form.get("question_count", ""))
            choice_count = int(request.form.get("choice_count", ""))
            if not 1 <= question_count <= MAX_QUESTIONS or not 2 <= choice_count <= 8:
                raise ValueError
        except (TypeError, ValueError):
            abort(400, f"Choose 1–{MAX_QUESTIONS} questions and 2–8 choices.")
        design = {"title": "", "form_id": "", "question_count": question_count,
                  "choice_count": choice_count}
        with connect() as db:
            branding = db.execute(
                "SELECT logo FROM course_branding WHERE issuer=? AND context_id=?",
                (context["issuer"], context["context_id"]),
            ).fetchone()
        return send_file(
            make_answer_sheet(design, branding["logo"] if branding else None,
                              include_guide=True, generic=True),
            mimetype="application/pdf", as_attachment=True,
            download_name="generic-answer-sheet.pdf",
        )

    @app.get("/print/designs/<form_id>.pdf")
    @lti_course_required
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
    @lti_course_required
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

    def standalone_design(slug):
        with connect() as db:
            row = db.execute("SELECT * FROM standalone_designs WHERE slug=?", (slug,)).fetchone()
        return row

    @app.route("/standalone", methods=["GET", "POST"])
    def standalone_home():
        errors = []
        values = {"title": "", "question_count": 20, "choice_count": 4}
        if request.method == "POST":
            values = {
                "title": request.form.get("title", "").strip(),
                "question_count": request.form.get("question_count", ""),
                "choice_count": request.form.get("choice_count", ""),
            }
            if not values["title"] or len(values["title"]) > 120:
                errors.append("Enter an answer-sheet name of up to 120 characters.")
            try:
                question_count = int(values["question_count"])
                if not 1 <= question_count <= MAX_QUESTIONS: raise ValueError
            except (TypeError, ValueError):
                errors.append(f"Choose between 1 and {MAX_QUESTIONS} questions.")
                question_count = 20
            try:
                choice_count = int(values["choice_count"])
                if not 2 <= choice_count <= 8: raise ValueError
            except (TypeError, ValueError):
                errors.append("Choose between 2 and 8 answer choices.")
                choice_count = 4
            logo, logo_type = None, None
            upload = request.files.get("logo")
            if upload and upload.filename:
                logo = upload.stream.read(3 * 1024 * 1024 + 1)
                try:
                    image = Image.open(BytesIO(logo))
                    if len(logo) > 3 * 1024 * 1024 or image.format not in ("PNG", "JPEG") or image.width > 8000 or image.height > 8000:
                        raise ValueError
                    image.verify()
                    logo_type = "image/png" if image.format == "PNG" else "image/jpeg"
                except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                    errors.append("Upload a PNG or JPEG logo no larger than 3 MB.")
                    logo, logo_type = None, None
            if not errors:
                slug = secrets.token_urlsafe(18).replace("_", "").replace("-", "")
                form_id = str(uuid.uuid4())
                with connect() as db:
                    db.execute("INSERT INTO standalone_designs (slug, form_id, title, question_count, choice_count, logo, logo_type, created_at) VALUES (?,?,?,?,?,?,?,?)",
                               (slug, form_id, values["title"], question_count, choice_count, logo, logo_type, int(time.time())))
                return redirect(url_for("standalone_workspace", slug=slug, view="print"))
            values["question_count"], values["choice_count"] = question_count, choice_count
        return render_template("standalone.html", errors=errors, values=values)

    @app.get("/standalone/uol_legacy")
    def standalone_uol_legacy():
        view = request.args.get("view", "print")
        if view not in {"print", "scan", "grade"}:
            view = "print"
        return render_template(
            "standalone_uol_legacy.html", view=view,
            public_base_url=base_url(), current_year=datetime.now(timezone.utc).year,
        )

    @app.get("/standalone/<slug>")
    def standalone_workspace(slug):
        design = standalone_design(slug)
        if not design: abort(404)
        if request.args.get("format") == "json":
            return jsonify({"forms": [{"form_id": design["form_id"], "title": design["title"], "question_count": design["question_count"], "choice_count": design["choice_count"]}], "roster": [], "roster_available": True, "roster_error": ""})
        view = request.args.get("view", "print")
        if view == "print":
            return render_template("standalone_print.html", design=dict(design), slug=slug,
                                   public_base_url=base_url(), current_year=datetime.now(timezone.utc).year)
        context = {"issuer": "standalone", "context_id": slug, "course_title": design["title"]}
        runtime = {
            "standalone": True, "slug": slug,
            "forms_url": url_for("standalone_forms_manifest", slug=slug),
            "render_url": url_for("standalone_render_scan_page", slug=slug),
            "dummy_url": url_for("standalone_dummy_zip", slug=slug),
            "grade_url": url_for("standalone_workspace", slug=slug) + "?view=grade&format=json",
            "scan_url": url_for("standalone_workspace", slug=slug, view="scan"),
            "grade_path": url_for("standalone_workspace", slug=slug) + "?view=grade",
        }
        return render_template("scan.html", context=context, standalone=True, standalone_design=dict(design),
                               scan_runtime=runtime, initial_phase="grade" if view == "grade" else "scan",
                               dummy_forms=[], dummy_student_count=0, dummy_enrollment_error="",
                               current_year=datetime.now(timezone.utc).year)

    @app.get("/standalone/<slug>/forms.json")
    def standalone_forms_manifest(slug):
        design = standalone_design(slug)
        if not design: abort(404)
        return jsonify([{"form_id": design["form_id"], "title": design["title"], "question_count": design["question_count"], "choice_count": design["choice_count"], "legacy_layout_version": LEGACY_SHEET_LAYOUT_VERSION}])

    @app.get("/standalone/<slug>/answer-sheet.pdf")
    def standalone_answer_sheet(slug):
        design = standalone_design(slug)
        if not design: abort(404)
        filename = secure_filename(design["title"]) or "answer-sheet"
        return send_file(make_answer_sheet(design, design["logo"]), mimetype="application/pdf", as_attachment=True,
                         download_name=f"{filename}.pdf")

    @app.post("/standalone/<slug>/dummy.zip")
    def standalone_dummy_zip(slug):
        design = standalone_design(slug)
        if not design: abort(404)
        payload = request.get_json(silent=True) or {}
        raw_roster = payload.get("roster")
        if not isinstance(raw_roster, list) or not 1 <= len(raw_roster) <= 200:
            abort(400, "Import between 1 and 200 roster students before generating a dummy ZIP.")
        learners, seen = [], set()
        for item in raw_roster:
            student_id = str(item.get("student_id", "")) if isinstance(item, dict) else ""
            name = str(item.get("name", "")).strip() if isinstance(item, dict) else ""
            if not re.fullmatch(r"\d{9}", student_id) or student_id == "000000000" or student_id in seen:
                abort(400, "The imported roster contains an invalid or duplicate student number.")
            seen.add(student_id)
            learners.append({"student_id": student_id, "name": name or student_id, "sis_login_id": ""})
        question_count, choice_count = int(design["question_count"]), int(design["choice_count"])
        correct_answers = [(question + 1) % choice_count for question in range(question_count)]
        correct_answers[0] = [correct_answers[0], (correct_answers[0] + 1) % choice_count]
        rng = random.SystemRandom()
        score_counts = dummy_score_counts(len(learners), question_count, rng)
        correct_question_sets, item_qualities = dummy_correct_question_sets(
            score_counts, question_count, rng, multi_answer_question=1
        )
        output = BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            key = {"name": "Answer Sheet", "student_id": "000000000", "sis_login_id": ""}
            archive.writestr("000-Answer_Sheet.pdf", make_sample_response_pdf(
                design, key, design["logo"], sample_index=0, seed=1, answers=correct_answers,
                layout_version=SHEET_LAYOUT_VERSION).getvalue())
            for index, learner in enumerate(learners):
                answers = []
                for question, keyed in enumerate(correct_answers):
                    options = list(keyed) if isinstance(keyed, list) else [keyed]
                    if question + 1 in correct_question_sets[index]:
                        answers.append(options if question == 0 else options[0])
                    else:
                        answers.append(rng.choice([choice for choice in range(choice_count) if choice not in options]))
                filename = secure_filename(learner["name"]) or f"student-{index + 1}"
                archive.writestr(f"{index + 1:03d}-{filename}.pdf", make_sample_response_pdf(
                    design, learner, design["logo"], sample_index=index + 1, seed=1, answers=answers,
                    layout_version=SHEET_LAYOUT_VERSION).getvalue())
            archive.writestr("README.txt", "Dummy scan set generated from the imported roster. The answer key uses student number 000000000. Question 1 has two keyed answers. Scores follow a 40–90% bell-shaped profile with occasional outliers. Item difficulty and discrimination vary across the set.\n" + "Item profile: " + ", ".join(f"Q{number + 1} {quality}" for number, quality in enumerate(item_qualities)) + "\n")
        output.seek(0)
        filename = secure_filename(design["title"]) or "answer-sheet"
        return send_file(output, mimetype="application/zip", as_attachment=True,
                         download_name=f"{filename}-dummy-set.zip")

    @app.post("/standalone/<slug>/render-page")
    def standalone_render_scan_page(slug):
        if not standalone_design(slug): abort(404)
        request.max_content_length = 64 * 1024 * 1024
        if request.mimetype != "application/pdf" or request.headers.get("X-Scan-Render") != "1":
            abort(415, "A PDF scan is required.")
        page_number = request.args.get("page", type=int)
        pdf_bytes = request.get_data()
        if page_number is None or page_number < 1 or not pdf_bytes.startswith(b"%PDF-"):
            abort(400, "A valid PDF page is required.")
        try:
            with pymupdf.open(stream=pdf_bytes, filetype="pdf") as document:
                if page_number > len(document): abort(400, "The requested page does not exist.")
                page = document[page_number - 1]
                scale = min(2.8, 1600 / max(page.rect.width, page.rect.height))
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale), colorspace=pymupdf.csRGB, alpha=False)
                png = pixmap.tobytes("png")
        except (pymupdf.FileDataError, pymupdf.EmptyFileError, ValueError):
            abort(400, "The PDF page could not be rendered.")
        response = send_file(BytesIO(png), mimetype="image/png", download_name="scan-page.png")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/lti/config.json")
    def tool_config():
        base = base_url()
        return jsonify({
            "title": "Print Scan Grade",
            "description": "Create paper MCQ exams, scan completed forms, and sync grades to the VLE.",
            "oidc_initiation_url": base + "/oidc/login",
            "target_link_uri": base + "/lti/launch",
            "redirect_uris": [base + "/lti/launch"],
            "logo_uri": base + "/static/logo.svg",
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

    def registration_page(template, status=200, **context):
        response = make_response(render_template(template, **context), status)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.route("/lti/register", methods=["GET", "POST"])
    def lti_dynamic_registration():
        class NoRedirect(HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None

        opener = build_opener(NoRedirect())
        if request.method == "GET":
            openid_url = request.args.get("openid_configuration", "")
            registration_token = request.args.get("registration_token", "")
            if not openid_url:
                return registration_page(
                    "lti_registration_result.html",
                    success=False,
                    message="Give this URL to an LTI platform that supports 1EdTech LTI Dynamic Registration. The platform will open it with its OpenID configuration URL.",
            )
            try:
                if len(openid_url) > 4096 or len(registration_token) > 4096:
                    raise ValueError("The platform registration parameters are too long.")
                parsed_openid_url = urlparse(openid_url)
                query_values = parse_qsl(parsed_openid_url.query, keep_blank_values=True)
                if not registration_token:
                    registration_token = next(
                        (value for key, value in query_values if key == "registration_token"), ""
                    )
                if registration_token:
                    query_values = [(key, value) for key, value in query_values
                                    if key != "registration_token"]
                    query_values.append(("registration_token", registration_token))
                    openid_url = parsed_openid_url._replace(query=urlencode(query_values)).geturl()
                if len(registration_token) > 4096:
                    raise ValueError("The platform registration token is too long.")
                config_endpoint = _public_https_url(openid_url)
                metadata_headers = {
                    "Accept": "application/json",
                    "User-Agent": "PrintScanGrade-LTI/1.0 (+https://printscangrade.uniwebdev.co.uk)",
                }
                if registration_token:
                    metadata_headers["Authorization"] = "Bearer " + registration_token
                with opener.open(Request(openid_url, headers=metadata_headers), timeout=8) as response:
                    metadata = json.loads(response.read(1_048_577))
                if not isinstance(metadata, dict):
                    raise ValueError("The platform returned invalid OpenID configuration.")

                issuer_value = metadata.get("issuer")
                if not isinstance(issuer_value, str) or not issuer_value:
                    raise ValueError("The platform OpenID configuration has no issuer.")
                issuer = issuer_value.rstrip("/")
                issuer_endpoint = _public_https_url(issuer)
                same_authority = (issuer_endpoint.hostname.lower() == config_endpoint.hostname.lower() and
                                  issuer_endpoint.port == config_endpoint.port)
                issuer_path = issuer_endpoint.path.rstrip("/")
                issuer_matches_discovery = (
                    same_authority and config_endpoint.path.startswith(issuer_path + "/") and
                    not urlparse(issuer).query and not urlparse(issuer).fragment
                )
                canvas_public_url = os.getenv("CANVAS_PUBLIC_BASE_URL", "").strip().rstrip("/")
                canvas_public = urlparse(canvas_public_url) if canvas_public_url else None
                platform_configuration = metadata.get(
                    "https://purl.imsglobal.org/spec/lti-platform-configuration", {}
                )
                canvas_compatibility = (
                    isinstance(platform_configuration, dict) and
                    platform_configuration.get("product_family_code") == "canvas" and
                    canvas_public and canvas_public.scheme == "https" and
                    canvas_public.hostname and
                    canvas_public.hostname.lower() == config_endpoint.hostname.lower()
                )
                if not issuer_matches_discovery and not canvas_compatibility:
                    raise ValueError("The OpenID configuration URL does not match its issuer.")

                authorization_endpoint = metadata.get("authorization_endpoint", "")
                jwks_url = metadata.get("jwks_uri", "")
                token_endpoint = metadata.get("token_endpoint", "")
                registration_endpoint = metadata.get("registration_endpoint", "")
                for endpoint in (authorization_endpoint, jwks_url, token_endpoint, registration_endpoint):
                    _public_https_url(endpoint)

                request_id = secrets.token_urlsafe(32)
                now = int(time.time())
                with connect() as db:
                    db.execute("DELETE FROM lti_registration_requests WHERE created_at < ?", (now - 600,))
                    db.execute(
                        "INSERT INTO lti_registration_requests "
                        "(request_id, issuer, authorization_endpoint, jwks_url, token_endpoint, "
                        "registration_endpoint, registration_token, created_at) VALUES (?,?,?,?,?,?,?,?)",
                        (request_id, issuer, authorization_endpoint, jwks_url, token_endpoint,
                         registration_endpoint, registration_token, now),
                    )
                return registration_page(
                    "lti_registration_confirm.html",
                    issuer=issuer,
                    request_id=request_id,
                )
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError,
                    json.JSONDecodeError, sqlite3.Error) as exc:
                if isinstance(exc, HTTPError):
                    detail = f"Could not read the platform registration details (HTTP {exc.code})."
                    try:
                        error_body = json.loads(exc.read(4096))
                        if isinstance(error_body, dict):
                            explanation = error_body.get("error_description") or error_body.get("error")
                            if isinstance(explanation, str) and explanation.strip():
                                detail += " " + explanation.strip()[:300]
                    except (OSError, ValueError, TypeError):
                        pass
                elif isinstance(exc, ValueError) and str(exc):
                    detail = str(exc)
                else:
                    detail = "Could not read the platform registration details. Check its configuration and try again."
                return registration_page("lti_registration_result.html", 400, success=False, message=detail)

        request_id = request.form.get("request_id", "")
        if not re.fullmatch(r"[A-Za-z0-9_-]{40,64}", request_id):
            return registration_page(
                "lti_registration_result.html", 400, success=False,
                message="This registration request is invalid. Start again from your learning platform.",
            )
        now = int(time.time())
        try:
            with connect() as db:
                db.execute("BEGIN IMMEDIATE")
                registration = db.execute(
                    "SELECT * FROM lti_registration_requests WHERE request_id=? AND created_at>=?",
                    (request_id, now - 600),
                ).fetchone()
                if not registration:
                    db.rollback()
                    return registration_page(
                        "lti_registration_result.html", 400, success=False,
                        message="This registration request expired or has already been used. Start again from your learning platform.",
                    )
                registration = dict(registration)
                db.execute("DELETE FROM lti_registration_requests WHERE request_id=?", (request_id,))

            registration_endpoint = registration["registration_endpoint"]
            for endpoint in (registration_endpoint, registration["authorization_endpoint"],
                             registration["jwks_url"], registration["token_endpoint"]):
                _public_https_url(endpoint)
            base = base_url()
            configured_canvas = urlparse(
                os.getenv("CANVAS_PUBLIC_BASE_URL", "").strip().rstrip("/")
            )
            is_canvas_registration = bool(
                configured_canvas.hostname and
                urlparse(registration_endpoint).hostname and
                configured_canvas.hostname.lower() == urlparse(registration_endpoint).hostname.lower()
            )
            messages = [{
                "type": "LtiResourceLinkRequest",
                "target_link_uri": base + "/lti/launch",
                "label": "Print Scan Grade",
                "placements": ["course_navigation"],
            }] if is_canvas_registration else [{
                "type": "LtiDeepLinkingRequest",
                "target_link_uri": base + "/lti/launch",
                "label": "Add Print Scan Grade",
                "placements": ["course_navigation"],
            }]
            tool_registration = {
                "application_type": "web",
                "response_types": ["id_token"],
                "grant_types": ["implicit", "client_credentials"],
                "initiate_login_uri": base + "/oidc/login",
                "redirect_uris": [base + "/lti/launch"],
                "client_name": "Print Scan Grade",
                "client_uri": base,
                "jwks_uri": base + "/.well-known/jwks.json",
                "logo_uri": base + "/static/logo.svg",
                "token_endpoint_auth_method": "private_key_jwt",
                "scope": "openid " + NRPS_SCOPE,
                "https://purl.imsglobal.org/spec/lti-tool-configuration": {
                    "domain": urlparse(base).netloc,
                    "description": "Create paper MCQ exams, scan completed forms, and sync grades to the VLE.",
                    "target_link_uri": base + "/lti/launch",
                    "claims": [
                        "sub", "iss", "aud", "exp", "iat", "nonce", "name", "given_name",
                        "family_name", "email", LTI + "roles", LTI + "context",
                        LTI + "resource_link", LTI + "deployment_id", LTI + "message_type",
                        LTI + "version", LTI + "target_link_uri", LTI + "custom", NRPS_CLAIM,
                    ],
                    "messages": messages,
                },
            }
            if is_canvas_registration:
                tool_registration["https://purl.imsglobal.org/spec/lti-tool-configuration"].update({
                    "https://canvas.instructure.com/lti/tool_id": "print-scan-grade",
                    "https://canvas.instructure.com/lti/privacy_level": "public",
                })
            headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "PrintScanGrade-LTI/1.0 (+https://printscangrade.uniwebdev.co.uk)",
            }
            if registration["registration_token"]:
                headers["Authorization"] = "Bearer " + registration["registration_token"]
            request_data = Request(
                registration_endpoint,
                data=json.dumps(tool_registration).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with opener.open(request_data, timeout=10) as response:
                result = json.loads(response.read(1_048_577))
            client_id = result.get("client_id") if isinstance(result, dict) else None
            if not isinstance(client_id, str) or not client_id.strip():
                raise ValueError("The platform response did not include a client ID.")

            with connect() as db:
                db.execute(
                    "INSERT INTO lti_clients "
                    "(name, issuer, client_id, authorization_endpoint, jwks_url, token_endpoint, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(issuer, client_id) DO UPDATE SET name=excluded.name, "
                    "authorization_endpoint=excluded.authorization_endpoint, jwks_url=excluded.jwks_url, "
                    "token_endpoint=excluded.token_endpoint, enabled=1, updated_at=excluded.updated_at",
                    ("Print Scan Grade / " + registration["issuer"], registration["issuer"], client_id.strip(),
                     registration["authorization_endpoint"], registration["jwks_url"],
                     registration["token_endpoint"], now, now),
                )
            return registration_page(
                "lti_registration_result.html",
                success=True,
                message="Print Scan Grade was registered with your learning platform. You can close this window.",
            )
        except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, json.JSONDecodeError, sqlite3.Error) as exc:
            if isinstance(exc, HTTPError):
                detail = f"The platform rejected registration (HTTP {exc.code})."
            elif isinstance(exc, ValueError) and str(exc):
                detail = str(exc)
            else:
                detail = "The platform could not complete dynamic registration. Start again from your learning platform and try again."
            return registration_page("lti_registration_result.html", 400, success=False, message=detail)

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

    # Canvas submits its third-party initiated login request as a form POST.
    # Supporting GET as well keeps the endpoint compatible with platforms that
    # initiate the same request through a redirect.
    @app.route("/oidc/login", methods=["GET", "POST"])
    def oidc_login():
        login_params = request.values
        issuer = login_params.get("iss", "").rstrip("/")
        client_id = login_params.get("client_id", "")
        with connect() as db:
            if not known_client(db, issuer, client_id):
                abort(400, "Unknown LTI platform or client ID.")
        target = login_params.get("target_link_uri", "")
        if target and target.rstrip("/") != base_url() + "/lti/launch":
            abort(400, "Unexpected target link URI.")
        state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        session["lti_state"], session["lti_nonce"] = state, nonce
        session["lti_expires"] = int(time.time()) + 300
        params = {
            "response_type": "id_token", "response_mode": "form_post", "scope": "openid",
            "client_id": client_id, "redirect_uri": base_url() + "/lti/launch",
            "login_hint": login_params.get("login_hint", ""),
            "lti_message_hint": login_params.get("lti_message_hint", ""),
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
                # Canvas's Cloudflare edge rejects urllib's default user agent.
                # Identify this server-side LTI verification request explicitly.
                with urlopen(Request(platform["jwks_url"], headers={
                    "Accept": "application/json",
                    "User-Agent": "PrintScanGrade-LTI/1.0 (+https://printscangrade.uniwebdev.co.uk)",
                }), timeout=8) as response:
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
                configured_deployment = (
                    client_id in platform.get("client_ids", []) and
                    deployment_id in platform.get("deployment_ids", [])
                )
                if not registered and not configured_deployment:
                    # Dynamic registration returns a client ID but does not
                    # provide the deployment ID. Once the signed launch has
                    # proved the issuer, client ID, audience and nonce, retain
                    # Canvas's deployment ID for subsequent launches.
                    dynamic_client = db.execute(
                        "SELECT 1 FROM lti_clients WHERE issuer=? AND client_id=? AND enabled=1",
                        (issuer, client_id),
                    ).fetchone()
                    if not dynamic_client:
                        raise ValueError("Unregistered LTI deployment")
                    db.execute(
                        "INSERT OR IGNORE INTO deployments VALUES (?,?,?,?)",
                        (issuer, client_id, deployment_id, int(time.time())),
                    )
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
