# Print Scan Grade

A standalone LTI 1.3 app for paper MCQ exams. Course instructors can create and download course-scoped bubble answer sheets, then scan completed sheets locally in their browser. Answer-key grading and gradebook sync are future work.

## Open in VS Code

```sh
code /home/robert/print-scan-grade
```

## Run locally with MiniVLE

MiniVLE should be running on host port 8001. Start the app with:

```sh
docker compose up --build -d
```

The app source is mounted into the container for local development. Template, CSS, and JavaScript edits appear after refreshing the page. Python changes are picked up automatically by Gunicorn's reload mode.

Open http://localhost:8004 for the public landing page. In MiniVLE, import `http://localhost:8004/lti/config.json` as an LTI 1.3 tool, then deploy it to a course. From a course, add Print Scan Grade as a tool placement; the app completes Deep Linking and displays its Print workspace to course instructors. The LTI launch validates the platform signature, state, nonce, client ID, and deployment.

The Print workspace saves designs to their MiniVLE course. Configure a title, 1–80 questions, and 2–8 choices to download a two-page A4 portrait PDF: the answer sheet is page 1 and the student completion guide is page 2. Staff can upload or replace a course-wide PNG or JPEG university logo (up to 3 MB); it appears on both pages. Each answer bubble contains its choice letter in light gray, and students are asked to shade over the letter. Scan thresholds ignore the light guide ink while reading the marked choice. The guide explains name-box boundaries, matching written and bubbled IDs, single-answer marking and dark shading. Its guide QR code lets Scan skip page 2; the sample-response PDFs remain single-page for scanning. Course staff can delete saved designs; deleted forms are removed from that course's Scan manifest, so existing printed copies are no longer recognized. The answer sheet includes the 9-digit student-number grid with written digit boxes aligned over each column and 0–9 row labels, a student name box, registration marks, a QR form identifier, and a printscangrade.com footer.

The Scan workspace reads ZIP archives of completed PDFs locally in the instructor's browser. Instructors can download a ZIP with one completed sample per active learner in the course, for each saved design. Sample sheets use real roster names and nine-digit student numbers; MiniVLE's SIS login IDs are read transiently from NRPS to match the associated student number. The roster is used in memory to generate the ZIP and is not saved by this app. Uploaded PDFs and scan results are not sent to or stored by the app. It aligns pages using registration marks, reads the form QR code, extracts answer bubbles, flags ambiguous marks for review, and exports a CSV. Blank answers are marked incorrect; selected responses are not graded until an answer key is added. See `app/static/vendor/VENDOR-LICENSES.md` and `app/fonts/README.md` for locally bundled browser and handwriting fonts.

This project uses port 8004 and its own `data/` directory, so it can run alongside Critical Mass Attendance. MiniVLE's deployment callback uses the secret in `.env` to register course deployments. The app's signing key is generated at `data/tool-private.pem` and its public key is exposed at `/.well-known/jwks.json`.

For a hosted deployment, set `TOOL_BASE_URL` to the public HTTPS origin, set `COOKIE_SECURE=true`, configure the platform endpoints in `docker-compose.yml`, and use a persistent secret in `.env`. The `.com` domain is the product name; this local setup does not publish or configure that domain.
