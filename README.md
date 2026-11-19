# PrintScanGrade

PrintScanGrade turns paper multiple-choice exams into reviewable grades and item analysis. Create answer sheets, read scanned PDFs, match students to a roster, select an answer key, inspect annotated responses, and export results.

Use it as a standalone workspace embedded in your VLE, or launch it from a course through LTI 1.3. A separate workspace reads existing University of Liverpool MCQ sheets.

## Workspaces

| Workspace | Entry point | Intended use |
| --- | --- | --- |
| Standalone | `/standalone` | Create an answer-sheet design and get a reusable workspace and iframe code. |
| UoL legacy | `/standalone/uol_legacy` | Read existing University of Liverpool five-choice sheets with up to 120 questions. |
| LTI | Launch from your learning platform | Manage course answer sheets and use the platform's course roster. |

Standalone workspaces do not require an LTI registration. LTI course workspaces require an instructor or administrator launch. Canvas is supported through LTI; there is no separate personal API-token login.

## Quick start

You need Docker with Docker Compose. Run commands from the repository root.

For a new installation:

```bash
cp .env.sample .env
```

Edit `.env` before starting. Replace `FLASK_SECRET_KEY` and `ADMIN_PASSWORD` with separate random values. You can generate each value with:

```bash
openssl rand -hex 32
```

For local HTTP development, use:

```dotenv
DOMAIN=
COOKIE_SECURE=false
```

Then build and start the app:

```bash
docker compose up --build -d
```

Open [http://localhost:8004/standalone](http://localhost:8004/standalone) to create a workspace, or [http://localhost:8004/standalone/uol_legacy](http://localhost:8004/standalone/uol_legacy) to scan existing UoL sheets.

An LMS is not required to run the standalone workspaces.

## Configuration

[.env.sample](.env.sample) lists the supported settings and optional LTI platform configuration. Keep your existing `.env` when upgrading; do not overwrite it with the sample.

| Variable | Purpose |
| --- | --- |
| `DOMAIN` | Public hostname, without a scheme or path. Generated public URLs use HTTPS. |
| `COOKIE_SECURE` | Set to `true` for HTTPS deployments; `false` for local HTTP development. |
| `FLASK_SECRET_KEY` | Random secret used to sign session cookies. |
| `ADMIN_USERNAME` | Username for the LTI administration screen. |
| `ADMIN_PASSWORD` | Password for the LTI administration screen. |
| `CANVAS_PUBLIC_BASE_URL` | Optional institutional Canvas HTTPS origin, used for Canvas LTI registration and roster access. |
| `TOOL_BASE_URL` | Optional full origin when `DOMAIN` is empty. Defaults to `http://localhost:8004`. |

For example, a hosted installation can use:

```dotenv
DOMAIN=printscangrade.uniwebdev.co.uk
COOKIE_SECURE=true
```

`DOMAIN` takes precedence over `TOOL_BASE_URL`. Configure DNS, TLS and a reverse proxy separately; setting the hostname does not create them. Forward the original host and protocol to the app, which listens on port 8004.

Apply environment changes with:

```bash
docker compose up -d --no-deps print-scan-grade
```

The Compose service is named `print-scan-grade`; the application's name is **PrintScanGrade**.

## Standalone workflow

1. Open `/standalone` and create a design with a title, 1–60 questions and 2–8 answer choices. You can add a PNG or JPEG logo, or enter an earlier printed `FORM` code so the new workspace recognises those sheets.
2. For a newly created workspace, provide a responsible contact email, institution and school or department, then accept the usage policy and grading disclaimer.
3. Download the printable A4 PDF. Page 1 is the answer sheet; page 2 is the student guide. Copy the iframe code into your VLE if you want an embedded workspace.
4. Complete an answer-key sheet using student number `000000000`.
5. Open Scan. Import a roster CSV if you want student matching, then upload a PDF or ZIP containing PDFs. Multi-page documents are supported, and generated student-guide pages are skipped.
6. Open Grade, choose the scan set and confirm its answer key. Use student review to compare extracted answers with the annotated page.
7. Resolve unidentified students, inspect Analysis, and download the results CSV.

The roster importer lets you map the name and student-number fields. A nine-digit number can appear within a longer source value, such as a SIS login ID.

For questions with multiple keyed answers, the regular workspace offers marking rules. Each question is worth one mark; additional uncrossed selections outside the key are incorrect. Blank and unresolved responses earn no mark.

Dummy ZIP downloads provide an answer key and sample student pages for trying the workflow before using real scans.

## University of Liverpool legacy workflow

Open `/standalone/uol_legacy` for existing UoL answer sheets.

The Print step supplies iframe code; it does not create a replacement answer sheet.

1. Import the roster CSV and map the student name and nine-digit ID.
2. Upload a multi-page PDF or a ZIP containing PDFs. Include the completed master answer sheet.
3. In Results, select the master page. It supplies the keyed answers and is excluded from student results.
4. Check student matches and annotated scans. Each question uses the strongest detected response; the reader also attempts to read the nine-column ID bubble grid.
5. Review Analysis and export the results.

Colour and grayscale scans are supported. The preview preserves the original PDF page layers and adds answer circles, without a contrast adjustment. Preview images are saved as PNG.

The UoL reader supports up to 120 questions with choices A–E and assumes one answer per question. It reads the existing form rather than the configurable format used by generated sheets.

## Student review and matching

The roster lists every imported or enrolled student. Students without scans show “—”; unidentified pages appear separately. Sort by student, score or percentage.

Click **Student not identified**, or use **Resolve unidentified students** in UoL legacy, to open the matching dialog. Inspect the scanned name area, search the roster, choose a student and press Enter to assign. The dialog advances to the next unidentified page.

In UoL legacy, **Change student match** in the review dialog also lets you correct a page that was assigned to the wrong student.

Review annotations before relying on results, particularly for faint, erased or incomplete marks. A handwritten ID without corresponding bubble marks may need manual matching.

## Analysis and export

Both grading workspaces include:

- Score distribution and summary statistics: cohort size, mean, median and standard deviation.
- UG or PG grade-class proportions.
- Percentage correct by question.
- Kelley upper/lower 27% item discrimination.
- Answer-option distributions with the keyed options outlined.
- A landscape analysis print view; choose **Save as PDF** in the browser's print dialog.

Analysis uses the selected answer key and scanned pages. Roster students without scans do not enter the analysis. Item statistics exclude unresolved responses, while those responses remain unearned in total scores. UoL legacy treats duplicate student scans as separate observations.

Results can be downloaded as CSV. Automatic gradebook passback to the learning platform is not implemented.

## LTI setup

Register PrintScanGrade as an LTI 1.3 tool in your learning platform.

| Endpoint | Purpose |
| --- | --- |
| `/lti/register` | Dynamic registration for platforms that support it. Start this from the platform's registration interface. |
| `/lti/config.json` | Tool configuration, including launch URLs and requested scopes. |
| `/.well-known/jwks.json` | Public signing keys. |
| `/oidc/login` | Third-party initiated OIDC login; accepts GET and POST. |
| `/lti/launch` | Signed LTI launch endpoint. |
| `/admin/login` | Administrator sign-in. |
| `/admin/lti` | Manage LTI client registrations. |

Use the public HTTPS origin in your platform registration. For example, the dynamic registration URL is:

```text
https://printscangrade.uniwebdev.co.uk/lti/register
```

The app supports Deep Linking and instructor course launches. Launch verification checks the platform signature, audience, state, nonce and deployment. Course designs are scoped to the platform issuer and course.

Course rosters are fetched through the LTI Names and Role Provisioning Service (NRPS). Grant the requested roster-read scope and ensure the platform provides a course membership URL. For Canvas, set `CANVAS_PUBLIC_BASE_URL` to your institution's Canvas origin, such as `https://your-university.instructure.com`.

For manual platform bootstrap, configure `LTI_PLATFORM_ISSUER`, `LTI_PLATFORM_AUTHORIZATION_ENDPOINT`, `LTI_PLATFORM_JWKS_URL` and `LTI_PLATFORM_TOKEN_ENDPOINT`. Client registrations can also be managed through the admin screen.

The supplied Compose defaults target a MiniVLE development installation on host port 8001. Replace those endpoints for other deployments. `LTI_INTERNAL_PLATFORM_BASE_URL` controls internal service routing and defaults to `http://host.docker.internal:8001`; set it to the appropriate platform origin when using another deployment.

## Data and storage

The browser scan workflows decode uploaded PDFs, extract marks, grade answers and create review annotations locally. They do not upload scan files or grades to the server as part of normal scanning.

| Data | Where it lives |
| --- | --- |
| Scan results, previews, imported rosters and manual student matches | Browser storage: IndexedDB and/or localStorage. |
| Answer-sheet designs, uploaded logos and standalone workspace contact/usage-policy acceptance records | Server SQLite database. |
| LTI clients, deployments and registration state | Server SQLite database. |
| LTI course rosters | Fetched by the server and held in memory for use by the workspace; not saved as roster records in SQLite. |
| App secrets and administrator credentials | `.env`. |
| LTI private signing key | `data/tool-private.pem`. |

Browser results belong to the browser profile and site origin that created them. Clearing site data, using another browser or changing the hostname can make previous results unavailable. Export results before clearing browser storage.

The SQLite database is `data/print-scan-grade.sqlite3`. Back up `data/` and `.env` when maintaining the service. A server backup does not include results stored in an instructor's browser.

Browser libraries are bundled with the application; scanning does not load those libraries from a third-party CDN.

## Limits

- Generated sheets: 1–60 questions and 2–8 choices.
- UoL legacy sheets: up to 120 questions and five choices.
- Scan inputs: PDFs up to 64 MB each; ZIP files up to 256 MB.
- Logos: PNG or JPEG, up to 3 MB.
- Student-number matching: nine-digit IDs.

## Development and checks

The app uses Flask, Gunicorn, SQLite and ReportLab on the server, with JavaScript, PDF.js and JSZip for browser scanning.

Compose mounts `app/` into the container and runs Gunicorn with reload enabled. Refresh the browser after frontend changes. Rebuild the image after changing Python dependencies or the Dockerfile.

Useful commands:

```bash
docker compose logs -f print-scan-grade
docker compose up --build -d
docker compose down
```

Run server integration checks against an isolated temporary database inside the running app container:

```bash
docker compose exec -T print-scan-grade python < tests/test_entry_flows.py
```

Run the UoL grading-model checks with Node.js:

```bash
node --test tests/uol-grade-model.test.mjs
```

Key files:

| Path | Responsibility |
| --- | --- |
| [app/main.py](app/main.py) | Routes, LTI, design storage and PDF generation. |
| [app/static/scan.js](app/static/scan.js) | Regular standalone and LTI scan/review workflow. |
| [app/static/standalone-uol-legacy.js](app/static/standalone-uol-legacy.js) | UoL legacy upload, review, matching and export. |
| [app/static/legacy-reader.mjs](app/static/legacy-reader.mjs) | UoL mark and ID extraction. |
| [app/static/uol-grade-model.mjs](app/static/uol-grade-model.mjs) | UoL scoring, roster grouping and item statistics. |
| [app/static/grade-analysis.mjs](app/static/grade-analysis.mjs) | UoL analysis charts and print export. |
| [app/static/vendor/VENDOR-LICENSES.md](app/static/vendor/VENDOR-LICENSES.md) | Bundled browser-library licences. |
| [app/fonts/README.md](app/fonts/README.md) | Bundled font information. |
