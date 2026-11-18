import * as pdfjsLib from "./vendor/pdf.min.mjs";
import { mapLegacyPoint, readLegacyStudentPage } from "./legacy-reader.mjs?v=3";
import { createAnalysisDashboard } from "./grade-analysis.mjs?v=1";
import { confirmedId, completeKey, pageScore, rosterRows, analysisData, analysisItems } from "./uol-grade-model.mjs?v=1";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = "print-scan-grade-uol-legacy-v1";
const PREVIEW_DATABASE = "print-scan-grade-uol-legacy-pages-v6";
const PREVIEW_VERSION = 6;
const READER_VERSION = 6;
const PREVIEW_RENDER_WIDTH = 1240;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const rosterFile = $("#uol-roster-file");
const rosterMapping = $("#uol-roster-mapping");
const rosterMessage = $("#uol-roster-message");
const rosterStatus = $("#uol-roster-status");
const uploadPanel = $("#uol-upload-panel");
const scanFile = $("#uol-scan-file");
const scanButton = $("#uol-scan-button");
const fileName = $("#uol-file-name");
const progress = $("#uol-progress");
const progressBar = $("#uol-progress-bar");
const progressLabel = $("#uol-progress-label");
const scanMessage = $("#uol-scan-message");
const keyField = $("#uol-key-field");
const keySelect = $("#uol-key-select");
const keyHelp = $("#uol-key-help");
const gradeMessage = $("#uol-grade-message");
const previewDialog = $("#uol-preview-dialog");
const previewTitle = $("#uol-preview-title");
const previewMeta = $("#uol-preview-meta");
const previewImageToggle = $("#uol-preview-image-toggle");
const previewImagePanel = $("#uol-preview-image-panel");
const previewImage = $("#uol-preview-image");
const previewContent = $("#uol-preview-content");
const previewPrevious = $("#uol-preview-previous");
const previewNext = $("#uol-preview-next");
const previewClose = $("#uol-preview-close");
const roster = [];
let results = [];
let scanning = false;
let keyPageId = "";
let previewPageId = "";
let previewImageUrl = "";
let previewNameImageUrl = "";
let previewZoom = 1;
let analysisScheme = "undergraduate";
let analysisDashboard = null;
let sortKey = "name", sortDirection = "asc";
let identifyPageId = "", identifyImageUrl = "";
let identifyIdImageUrl = "";
const identifyDialog = $("#uol-identify-dialog");
const identifySearch = $("#uol-identify-search"), identifyMatch = $("#uol-identify-match");
const identifyAssign = $("#uol-identify-assign");

function readSaved() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(state.roster)) roster.push(...state.roster);
    if (Array.isArray(state.results)) results = state.results;
    keyPageId = String(state.keyPageId || "");
    analysisScheme = state.analysisScheme === "masters" ? "masters" : "undergraduate";
  } catch (_) { /* Ignore malformed local state. */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ roster, results, keyPageId, analysisScheme }));
}

function previewStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PREVIEW_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pages");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePreview(id, blob) {
  if (!blob) return;
  const database = await previewStore();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction("pages", "readwrite");
    transaction.objectStore("pages").put(blob, id);
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadPreview(id) {
  const database = await previewStore();
  const blob = await new Promise((resolve, reject) => {
    const request = database.transaction("pages").objectStore("pages").get(id);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
  database.close(); return blob;
}

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(value.trim()); value = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += ch;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerIndex(headers, names) {
  const normalized = headers.map((header) => String(header || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  const exact = normalized.findIndex((header) => names.includes(header));
  return exact >= 0 ? exact : normalized.findIndex((header) => names.some((name) => header.includes(name)));
}

function nineDigitId(value) { return String(value || "").match(/(?<!\d)\d{9}(?!\d)/)?.[0] || ""; }

function tellRoster(message, error = false) {
  rosterMessage.textContent = message;
  rosterMessage.hidden = false;
  rosterMessage.classList.toggle("legacy-scan-warning", error);
}

function enableScanning() {
  const ready = roster.length > 0;
  uploadPanel.hidden = !ready;
  rosterStatus.textContent = ready ? `${roster.length} students imported` : "Roster required before scanning";
}

rosterFile?.addEventListener("change", async () => {
  const file = rosterFile.files?.[0];
  $("#uol-roster-file-name").textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Choose a CSV with student names and nine-digit student numbers.";
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { tellRoster("CSV files must be 4 MB or smaller.", true); return; }
  const rows = parseCsv(await file.text());
  if (rows.length < 2) { tellRoster("Choose a CSV with a header row and at least one student.", true); return; }
  rosterMapping.replaceChildren();
  const headers = rows[0], dataRows = rows.slice(1);
  const field = (label, index, suggestions) => {
    const wrapper = document.createElement("label"); wrapper.className = "scan-key-field";
    wrapper.append(document.createTextNode(label));
    const select = document.createElement("select"); select.className = "review-select";
    headers.forEach((header, column) => select.add(new Option(header || `Column ${column + 1}`, String(column))));
    const guessed = index >= 0 ? index : headerIndex(headers, suggestions);
    select.value = String(Math.max(0, guessed)); wrapper.append(select); rosterMapping.append(wrapper); return select;
  };
  const nameSelect = field("Student name", headerIndex(headers, ["fullname", "studentname", "learnername", "name"]), ["fullname", "studentname", "learnername", "name"]);
  const idSelect = field("Student number", headerIndex(headers, ["studentid", "studentnumber", "sisid", "candidateid", "idnumber", "id"]), ["studentid", "studentnumber", "sisid", "candidateid", "idnumber", "id"]);
  const loginIndex = headerIndex(headers, ["sisloginid", "loginid", "email", "username"]);
  const preview = document.createElement("p"); preview.className = "field-help";
  const updatePreview = () => {
    preview.textContent = `Preview: ${dataRows.slice(0, 4).map((row) => `${row[Number(nameSelect.value)] || "Unnamed"} · ${nineDigitId(row[Number(idSelect.value)]) || "no nine-digit ID"}`).join(" | ")}`;
  };
  nameSelect.addEventListener("change", updatePreview); idSelect.addEventListener("change", updatePreview);
  const confirm = document.createElement("button"); confirm.type = "button"; confirm.className = "primary-button"; confirm.textContent = "Import roster";
  confirm.addEventListener("click", () => {
    const imported = [], seen = new Set(), duplicates = new Set();
    for (const row of dataRows) {
      const student_id = nineDigitId(row[Number(idSelect.value)]);
      if (!student_id) continue;
      if (seen.has(student_id)) { duplicates.add(student_id); continue; }
      seen.add(student_id);
      imported.push({ student_id, name: String(row[Number(nameSelect.value)] || student_id).trim() || student_id,
        sis_login_id: loginIndex >= 0 ? String(row[loginIndex] || "").trim() : "" });
    }
    if (!imported.length || duplicates.size) {
      tellRoster(duplicates.size ? `Duplicate student IDs: ${[...duplicates].join(", ")}. Fix the CSV before importing.` : "No nine-digit student numbers were found in the selected column.", true);
      return;
    }
    roster.splice(0, roster.length, ...imported); saveState(); enableScanning();
    tellRoster(`Imported ${roster.length} students. Rows without a nine-digit ID were skipped.`);
  });
  rosterMapping.append(preview, confirm); rosterMapping.hidden = false; rosterMessage.hidden = true; updatePreview();
});

scanFile?.addEventListener("change", () => {
  const file = scanFile.files?.[0];
  fileName.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : "A PDF can contain multiple pages; a ZIP can contain multiple PDFs.";
  scanButton.disabled = !file || scanning;
});
scanButton?.addEventListener("click", () => scanFileBatch());

async function scanFileBatch() {
  const file = scanFile.files?.[0];
  if (!file || !roster.length || scanning) return;
  const name = file.name.toLowerCase();
  const isZip = name.endsWith(".zip");
  if (!isZip && !name.endsWith(".pdf")) return tellScan("Choose a PDF or ZIP containing PDFs.", true);
  if (isZip && file.size > MAX_ZIP_BYTES) return tellScan("The ZIP exceeds the 256 MB limit.", true);
  scanning = true; scanButton.disabled = true; progress.hidden = false; scanMessage.hidden = true;
  try {
    let entries;
    if (isZip) {
      const zip = await window.JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".pdf"))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ name: entry.name, size: entry._data?.uncompressedSize || 0, read: () => entry.async("uint8array") }));
      if (!entries.length) throw new Error("No PDF files were found in the ZIP.");
    } else entries = [{ name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }];

    const documents = [], issues = [];
    for (const entry of entries) {
      if (entry.size > MAX_PDF_BYTES) { issues.push(`${entry.name}: exceeds 64 MB`); continue; }
      const bytes = await entry.read();
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d)) { issues.push(`${entry.name}: not a readable PDF`); continue; }
      const task = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false,
        wasmUrl: new URL("./vendor/pdfjs-wasm/", import.meta.url).toString(), stopAtErrors: true });
      const pdf = await task.promise; documents.push({ name: entry.name, task, pdf });
    }
    const totalPages = documents.reduce((sum, item) => sum + item.pdf.numPages, 0);
    if (!totalPages) throw new Error(issues[0] || "No readable PDF pages were found.");
    progressBar.max = totalPages; progressBar.value = 0;
    const batch = [];
    for (const document of documents) {
      for (let pageNo = 1; pageNo <= document.pdf.numPages; pageNo += 1) {
        progressBar.value += 1; progressLabel.textContent = `Reading ${document.name} · page ${pageNo} of ${document.pdf.numPages}`;
        try {
          const record = await readStudentPage(document.pdf, pageNo, document.name);
          try { await savePreview(record.id, record.rawPage); }
          catch (_) { issues.push(`${document.name} · page ${pageNo}: annotated preview could not be saved`); }
          delete record.rawPage;
          batch.push(record);
        }
        catch (error) { issues.push(`${document.name} · page ${pageNo}: ${error.message || "could not be read"}`); }
      }
      await document.task.destroy().catch(() => {});
    }
    if (!batch.length) throw new Error(issues[0] || "No readable answer-sheet pages were found.");
    results = batch; keyPageId = ""; saveState();
    tellScan(`Read ${batch.length} page${batch.length === 1 ? "" : "s"}.${issues.length ? ` ${issues.length} file/page issue(s): ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? "…" : ""}` : ""}`, Boolean(issues.length));
    window.location.href = new URL("?view=grade", window.location.href).toString();
  } catch (error) { tellScan(error.message || "The PDF files could not be read.", true); }
  finally { scanning = false; progress.hidden = true; scanButton.disabled = !scanFile.files?.length; scanFile.value = ""; }
}

function tellScan(message, error = false) {
  scanMessage.textContent = message; scanMessage.hidden = false; scanMessage.classList.toggle("legacy-scan-warning", error);
}

async function readStudentPage(pdf, pageNo, sourceFile) {
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  if (Math.abs(base.width / base.height - 704 / 996) > 0.02) { page.cleanup(); throw new Error("Expected an upright A4 portrait page."); }
  const viewport = page.getViewport({ scale: PREVIEW_RENDER_WIDTH / base.width });
  const canvas = document.createElement("canvas");
  // Scanner PDFs can split the raw page between a background and a masked
  // foreground. Render both original layers; neither alone is the raw scan.
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: context, viewport }).promise;
  const read = readLegacyStudentPage(context.getImageData(0, 0, canvas.width, canvas.height), 70);
  const rawPage = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  page.cleanup();
  const result = { id: globalThis.crypto?.randomUUID?.() || `uol-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sourceFile, pageNo, studentId: read.studentId, partialId: read.partialId, frame: read.frame,
    answers: read.answers.map((answer) => answer.response), name: "", previewVersion: PREVIEW_VERSION,
    readerVersion: READER_VERSION, rawPage };
  result.name = roster.find((student) => student.student_id === result.studentId)?.name || "";
  canvas.width = 0; canvas.height = 0;
  return result;
}

function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

function selectedKey() { return results.find((result) => result.id === keyPageId) || null; }

function scoreResult(result, key) {
  return pageScore(result, key);
}

function studentFor(result) { return roster.find((student) => student.student_id === confirmedId(result)) || null; }

function resultLabel(result) {
  return `${result.sourceFile} · page ${result.pageNo}${result.studentId ? ` · ${result.studentId}` : ""}`;
}

function showGradeMessage(message) {
  if (!gradeMessage) return;
  gradeMessage.textContent = message;
  gradeMessage.hidden = !message;
}

function answerPoint(frame, index, choice) {
  const columns = [75, 242, 408, 583];
  const column = Math.floor(index / 30), row = index % 30;
  const y = 319 + (row % 5) * 16.2 + Math.floor(row / 5) * 110.5;
  return mapLegacyPoint(frame, columns[column] + choice * 16.7, y);
}

function addRosterAssignment(cell, result) {
  const note = document.createElement("small"); note.className = "roster-identity-note";
  note.textContent = result.studentId || result.partialId || "No bubble ID detected";
  cell.append(note);
  const assignment = document.createElement("div"); assignment.className = "roster-assignment";
  const label = document.createElement("label"); label.textContent = "Assign from roster — type to search, then press Enter";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search name, login or number"; search.autocomplete = "off";
  const select = document.createElement("select"); select.className = "review-select";
  const assign = document.createElement("button"); assign.type = "button"; assign.className = "download-button"; assign.textContent = "Assign";
  let matches = [];
  const updateMatches = () => {
    const query = search.value.trim().toLocaleLowerCase();
    matches = roster.filter((person) => rosterSearchLabel(person).toLocaleLowerCase().includes(query));
    select.replaceChildren(new Option(matches.length ? "Choose student" : "No matching students", ""));
    for (const person of matches) select.add(new Option(rosterSearchLabel(person), person.student_id));
    select.disabled = !matches.length;
    if (matches.length === 1) select.value = matches[0].student_id;
    assign.disabled = !select.value;
  };
  const commit = () => {
    const person = roster.find((item) => item.student_id === select.value);
    if (!person) return;
    result.manualStudentId = person.student_id;
    saveState(); renderResults();
  };
  search.addEventListener("input", updateMatches);
  select.addEventListener("change", () => { assign.disabled = !select.value; });
  assign.addEventListener("click", commit);
  search.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } });
  select.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } });
  label.append(search); assignment.append(label, select, assign); cell.append(assignment);
  updateMatches();
}

function rosterSearchLabel(person) {
  return [person.name, person.sis_login_id, person.student_id].filter(Boolean).join(" · ");
}

function unidentifiedPages() { return results.filter((page) => page.id !== keyPageId && !studentFor(page)); }

function renderRoster() {
  const rows = $("#uol-result-rows"), key = selectedKey();
  if (!rows) return;
  const data = rosterRows(roster, results, keyPageId);
  const numeric = (row) => row.pages.length ? scoreResult(row.pages[0], key) : null;
  data.sort((a, b) => {
    const left = sortKey === "name" ? a.name : numeric(a), right = sortKey === "name" ? b.name : numeric(b);
    if (left === null || right === null) return left === right ? a.name.localeCompare(b.name) : left === null ? 1 : -1;
    const comparison = typeof left === "string" ? left.localeCompare(right, undefined, { sensitivity: "base" }) : left - right;
    return (sortDirection === "asc" ? comparison : -comparison) || a.name.localeCompare(b.name);
  });
  rows.replaceChildren();
  const scoreText = (page) => { const score = scoreResult(page, key); return score === null ? "—" : `${score}/70`; };
  const percentText = (page) => { const score = scoreResult(page, key); return score === null ? "—" : `${(score / 70 * 100).toFixed(1)}%`; };
  for (const row of data) {
    const tr = document.createElement("tr"), student = document.createElement("td");
    const scores = document.createElement("td"), percentage = document.createElement("td");
    if (row.pages.length) {
      const link = document.createElement("a"); link.href = "#scan-preview"; link.className = "roster-student-link"; link.textContent = row.name;
      link.addEventListener("click", (event) => { event.preventDefault(); row.person ? openPreview(row.pages[0].id) : openIdentification(row.pages[0].id); });
      student.append(link);
      if (!row.person) {
        const review = document.createElement("a"); review.href = "#scan-preview"; review.className = "unidentified-preview-link"; review.textContent = "Review scan";
        review.addEventListener("click", (event) => { event.preventDefault(); openPreview(row.pages[0].id); }); student.append(review);
        addRosterAssignment(percentage, row.pages[0]);
      } else if (row.pages.length > 1) {
        for (const [index, page] of row.pages.entries()) {
          const review = document.createElement("a"); review.href = "#scan-preview"; review.className = "unidentified-preview-link";
          review.textContent = `Scan ${index + 1} · ${page.sourceFile} · page ${page.pageNo}`;
          review.addEventListener("click", (event) => { event.preventDefault(); openPreview(page.id); }); student.append(review);
        }
      }
    } else student.textContent = row.name;
    scores.textContent = row.pages.length ? row.pages.map(scoreText).join("; ") : "—";
    const percentages = document.createElement("div"); percentages.textContent = row.pages.length ? row.pages.map(percentText).join("; ") : "—";
    percentage.prepend(percentages); tr.append(student, scores, percentage); rows.append(tr);
  }
  const unknown = unidentifiedPages().length;
  $("#uol-matching-summary").textContent = `${roster.length} roster students · ${unknown} unidentified scan${unknown === 1 ? "" : "s"}`;
  $("#uol-resolve-students").disabled = unknown === 0;
  for (const button of document.querySelectorAll("[data-uol-sort]")) {
    const active = button.dataset.uolSort === sortKey;
    button.textContent = `${button.dataset.label} ${active ? sortDirection === "asc" ? "↑" : "↓" : "↕"}`;
    button.closest("th").setAttribute("aria-sort", active ? sortDirection === "asc" ? "ascending" : "descending" : "none");
  }
}

function updateIdentificationMatches() {
  const words = identifySearch.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = roster.filter((person) => words.every((word) => rosterSearchLabel(person).toLocaleLowerCase().includes(word)));
  identifyMatch.replaceChildren(new Option(matches.length ? "Choose student" : "No matching students", ""));
  for (const person of matches) identifyMatch.add(new Option(rosterSearchLabel(person), person.student_id));
  if (matches.length === 1) identifyMatch.value = matches[0].student_id;
  identifyMatch.disabled = !matches.length; identifyAssign.disabled = !identifyMatch.value;
}

function clearIdentificationImage() {
  if (identifyImageUrl) URL.revokeObjectURL(identifyImageUrl);
  if (identifyIdImageUrl) URL.revokeObjectURL(identifyIdImageUrl);
  identifyImageUrl = ""; $("#uol-identify-image")?.removeAttribute("src");
  identifyIdImageUrl = ""; $("#uol-identify-id-image")?.removeAttribute("src");
}

// Crop at integer source coordinates with a one-to-one pixel copy. Separate
// name/ID images avoid shrinking faint handwriting with the whole page header.
async function createIdentityCrops(blob) {
  const bitmap = await createImageBitmap(blob);
  const crop = async (left, top, width, height) => {
    const x = Math.floor(bitmap.width * left), y = Math.floor(bitmap.height * top);
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(bitmap.width - x, Math.ceil(bitmap.width * width));
    canvas.height = Math.min(bitmap.height - y, Math.ceil(bitmap.height * height));
    canvas.getContext("2d").drawImage(bitmap, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const result = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!result) throw new Error("Name preview unavailable.");
    return result;
  };
  try {
    return { name: await crop(.06, .09, .60, .055), writtenId: await crop(.71, .108, .26, .035) };
  } finally { bitmap.close(); }
}

async function openIdentification(id) {
  const page = results.find((item) => item.id === id && item.id !== keyPageId);
  if (!page || !identifyDialog) return;
  identifyPageId = id; clearIdentificationImage();
  $("#uol-identify-title").textContent = studentFor(page) ? "Change student match" : "Student not identified";
  $("#uol-identify-meta").textContent = `${resultLabel(page)} · read ID ${page.partialId || page.studentId || "unreadable"}`;
  const status = $("#uol-identify-status"); status.textContent = "Loading name and ID…"; status.hidden = false;
  identifySearch.value = ""; updateIdentificationMatches();
  if (!identifyDialog.open) identifyDialog.showModal();
  identifySearch.focus();
  try {
    const blob = page.previewVersion === PREVIEW_VERSION ? await loadPreview(id) : null;
    if (!blob) throw new Error("Name preview unavailable. Use Review scan to inspect the page.");
    const crops = await createIdentityCrops(blob);
    if (identifyPageId !== id) return;
    identifyImageUrl = URL.createObjectURL(crops.name); $("#uol-identify-image").src = identifyImageUrl;
    identifyIdImageUrl = URL.createObjectURL(crops.writtenId); $("#uol-identify-id-image").src = identifyIdImageUrl;
    status.hidden = true;
  } catch (error) { if (identifyPageId === id) { status.textContent = error.message; status.hidden = false; } }
}

function assignIdentification() {
  const page = results.find((item) => item.id === identifyPageId);
  const person = roster.find((item) => item.student_id === identifyMatch.value);
  if (!page || !person) return;
  const queue = unidentifiedPages(), index = queue.findIndex((item) => item.id === page.id);
  const next = index >= 0 ? queue[index + 1] : queue[0];
  page.manualStudentId = person.student_id;
  saveState(); renderResults();
  if (next && next.id !== page.id) openIdentification(next.id);
  else identifyDialog.close();
}

for (const button of document.querySelectorAll("[data-uol-sort]")) button.addEventListener("click", () => {
  sortDirection = sortKey === button.dataset.uolSort && sortDirection === "asc" ? "desc" : "asc";
  sortKey = button.dataset.uolSort; renderRoster();
});
$("#uol-resolve-students")?.addEventListener("click", () => { const page = unidentifiedPages()[0]; if (page) openIdentification(page.id); });
identifySearch?.addEventListener("input", updateIdentificationMatches);
identifySearch?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); assignIdentification(); }
  else if (event.key === "ArrowDown") { event.preventDefault(); identifyMatch.focus(); if (!identifyMatch.value && identifyMatch.options.length > 1) identifyMatch.selectedIndex = 1; identifyAssign.disabled = !identifyMatch.value; }
});
identifyMatch?.addEventListener("change", () => { identifyAssign.disabled = !identifyMatch.value; });
identifyMatch?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); assignIdentification(); } });
identifyAssign?.addEventListener("click", assignIdentification);
$("#uol-identify-skip")?.addEventListener("click", () => {
  const queue = unidentifiedPages(), index = queue.findIndex((page) => page.id === identifyPageId);
  const next = index >= 0 ? queue[index + 1] : queue[0];
  if (next) openIdentification(next.id);
  else identifyDialog.close();
});
$("#uol-identify-close")?.addEventListener("click", () => identifyDialog.close());
identifyDialog?.addEventListener("close", () => { identifyPageId = ""; clearIdentificationImage(); });
$("#uol-preview-reassign")?.addEventListener("click", () => { const id = previewPageId; previewDialog.close(); openIdentification(id); });

function setGradeTab(tab) {
  const analysis = tab === "analysis";
  for (const name of ["students", "analysis"]) {
    const selected = name === (analysis ? "analysis" : "students");
    $(`#${name}-tab`).classList.toggle("is-active", selected);
    $(`#${name}-tab`).setAttribute("aria-selected", String(selected));
    $(`#${name}-panel`).hidden = !selected;
  }
  if (analysis) analysisDashboard?.render();
}
$("#students-tab")?.addEventListener("click", () => setGradeTab("students"));
$("#analysis-tab")?.addEventListener("click", () => setGradeTab("analysis"));

function renderResults() {
  const summary = $("#uol-results-summary"), rows = $("#uol-result-rows"), download = $("#uol-download-csv");
  if (!summary || !rows || !download) return;
  summary.textContent = results.length ? `${results.length} page${results.length === 1 ? "" : "s"} read` : "No pages scanned yet.";
  rows.replaceChildren();
  $("#uol-resolve-students").disabled = true;
  if (!results.length) { rows.innerHTML = '<tr><td colspan="3">Scan pages to see results.</td></tr>'; download.disabled = true; return; }
  if (results.some((result) => result.readerVersion !== READER_VERSION)) {
    summary.textContent = "Rescan required";
    keyField.hidden = true; keyHelp.hidden = true; download.disabled = true;
    rows.innerHTML = '<tr><td colspan="3">These pages were read by an earlier UoL reader. Upload the batch again from Scan to use the corrected reader.</td></tr>';
    showGradeMessage("Rescan the batch to restore the complete original page, including the scanner's foreground ink layer.");
    return;
  }
  for (const [index, result] of results.entries()) if (!result.id) result.id = `saved-${index}-${result.sourceFile}-${result.pageNo}`;
  if (!results.some((result) => result.id === keyPageId)) { keyPageId = (results.find((result) => /master|answer.?key/i.test(result.sourceFile)) || results[0]).id; saveState(); }
  if (keyField && keySelect) {
    keyField.hidden = false; keyHelp.hidden = false; keySelect.replaceChildren();
    for (const result of results) keySelect.add(new Option(resultLabel(result), result.id));
    keySelect.value = keyPageId;
  }
  const key = selectedKey();
  const students = results.filter((result) => result.id !== keyPageId);
  summary.textContent = `${students.length} student page${students.length === 1 ? "" : "s"} · 70-question key selected`;
  showGradeMessage("");
  renderRoster();
  if (!$("#analysis-panel").hidden) analysisDashboard?.render();
  download.disabled = !completeKey(key);
  download.onclick = () => {
    const header = ["File", "Page", "Student", "Student ID", "Score", "Total", "Percentage", ...Array.from({ length: 70 }, (_, i) => `Q${i + 1}`)];
    const lines = [header, ...students.map((result) => {
      const score = scoreResult(result, key), person = studentFor(result);
      return [result.sourceFile, result.pageNo, person?.name || "", confirmedId(result) || result.partialId || "", score, 70, (score / 70 * 100).toFixed(1), ...(result.answers || [])];
    })]
      .map((line) => line.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "uol-legacy-scan-results.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

async function openPreview(id) {
  const result = results.find((item) => item.id === id), key = selectedKey();
  if (!result || !key || !previewDialog) return;
  previewPageId = id;
  const student = studentFor(result);
  previewTitle.textContent = student?.name || result.name || "Unidentified student";
  previewMeta.textContent = `${resultLabel(result)} · ${scoreResult(result, key)}/70 (${(scoreResult(result, key) / 70 * 100).toFixed(1)}%)`;
  if (previewImageUrl) { URL.revokeObjectURL(previewImageUrl); previewImageUrl = ""; }
  if (previewNameImageUrl) { URL.revokeObjectURL(previewNameImageUrl); previewNameImageUrl = ""; }
  $("#uol-preview-name-image").removeAttribute("src");
  setPreviewZoom(1);
  previewImagePanel.hidden = true;
  previewImageToggle.hidden = false;
  previewImageToggle.disabled = true;
  previewImageToggle.textContent = "Preparing annotated scan…";
  const blob = result.previewVersion === PREVIEW_VERSION ? await loadPreview(result.id).catch(() => null) : null;
  if (blob && result.frame) {
    const crops = await createIdentityCrops(blob);
    if (previewPageId !== id) return;
    previewNameImageUrl = URL.createObjectURL(crops.name); $("#uol-preview-name-image").src = previewNameImageUrl;
    const source = new Image(); source.src = URL.createObjectURL(blob); await source.decode();
    const canvas = document.createElement("canvas"); canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
    const context = canvas.getContext("2d"); context.drawImage(source, 0, 0); URL.revokeObjectURL(source.src);
    const scale = canvas.width / 703;
    for (let index = 0; index < 70; index += 1) {
      const keyed = key.answers[index], chosen = result.answers[index];
      for (const [answer, color, width] of [[keyed, "#1769e0", 2], [chosen, "#00a884", 3]]) {
        if (!answer) continue;
        const point = answerPoint(result.frame, index, "ABCDE".indexOf(answer));
        context.beginPath(); context.arc(point.x, point.y, Math.max(4, 5 * scale), 0, Math.PI * 2);
        context.strokeStyle = color; context.lineWidth = width; context.stroke();
      }
    }
    const annotated = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (previewPageId !== id) return;
    if (annotated) {
      previewImageUrl = URL.createObjectURL(annotated); previewImage.src = previewImageUrl;
      previewImage.hidden = false; previewImageToggle.disabled = false; previewImageToggle.textContent = "View annotated scan";
    } else previewImageToggle.textContent = "Annotated scan unavailable";
  } else {
    previewImage.removeAttribute("src"); previewImage.hidden = true;
    previewImageToggle.disabled = true; previewImageToggle.textContent = "Annotated scan unavailable";
  }
  previewContent.replaceChildren();
  const tableWrap = document.createElement("div"); tableWrap.className = "scan-results-table-wrap";
  const table = document.createElement("table"); table.className = "scan-results-table";
  const head = document.createElement("thead"); const header = document.createElement("tr");
  for (const label of ["Question", "Scanned answer", "Correct answer", "Result"]) { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; header.append(cell); }
  head.append(header); const body = document.createElement("tbody");
  for (let index = 0; index < 70; index += 1) {
    const row = document.createElement("tr");
    const question = document.createElement("th"); question.scope = "row"; question.textContent = String(index + 1);
    const scanned = document.createElement("td"); scanned.textContent = result.answers[index] || "Blank"; scanned.className = `scan-answer-status ${result.answers[index] ? "marked" : "not_selected"}`;
    const correct = document.createElement("td"); correct.textContent = key.answers[index] || "—";
    const verdict = document.createElement("td"); const isCorrect = result.answers[index] && result.answers[index] === key.answers[index];
    verdict.textContent = isCorrect ? "Correct" : "Incorrect"; verdict.className = `scan-answer-result ${isCorrect ? "correct" : "incorrect"}`;
    row.append(question, scanned, correct, verdict); body.append(row);
  }
  table.append(head, body); tableWrap.append(table); previewContent.append(tableWrap);
  const studentPages = results.filter((item) => item.id !== keyPageId);
  const position = studentPages.findIndex((item) => item.id === id);
  previewPrevious.disabled = position <= 0; previewNext.disabled = position < 0 || position >= studentPages.length - 1;
  previewPrevious.onclick = () => openPreview(studentPages[position - 1].id);
  previewNext.onclick = () => openPreview(studentPages[position + 1].id);
  previewDialog.showModal();
}

keySelect?.addEventListener("change", () => { keyPageId = keySelect.value; saveState(); renderResults(); });
function setPreviewZoom(value) {
  previewZoom = Math.max(.5, Math.min(4, value));
  previewImage.style.width = `${previewZoom * 100}%`;
  $("#uol-preview-zoom-level").textContent = `${Math.round(previewZoom * 100)}%`;
  $("#uol-preview-zoom-out").disabled = previewZoom <= .5;
  $("#uol-preview-zoom-in").disabled = previewZoom >= 4;
}
$("#uol-preview-zoom-in")?.addEventListener("click", () => setPreviewZoom(previewZoom + .25));
$("#uol-preview-zoom-out")?.addEventListener("click", () => setPreviewZoom(previewZoom - .25));
$("#uol-preview-zoom-fit")?.addEventListener("click", () => setPreviewZoom(1));
previewClose?.addEventListener("click", () => previewDialog.close());
previewImageToggle?.addEventListener("click", () => {
  previewImagePanel.hidden = !previewImagePanel.hidden;
  previewImageToggle.textContent = previewImagePanel.hidden ? "View annotated scan" : "Hide annotated scan";
});
previewDialog?.addEventListener("close", () => {
  previewPageId = "";
  previewImagePanel.hidden = true;
  if (previewImageUrl) { URL.revokeObjectURL(previewImageUrl); previewImageUrl = ""; }
  previewImage.removeAttribute("src");
  if (previewNameImageUrl) { URL.revokeObjectURL(previewNameImageUrl); previewNameImageUrl = ""; }
  $("#uol-preview-name-image").removeAttribute("src");
});

$("#uol-copy-iframe")?.addEventListener("click", async (event) => {
  const field = $("#uol-iframe-code");
  try { await navigator.clipboard.writeText(field.value); }
  catch (_) { field.focus(); field.select(); document.execCommand("copy"); }
  event.currentTarget.textContent = "Iframe code copied";
});

readSaved();
analysisDashboard = createAnalysisDashboard({
  getData: () => analysisData(results.filter((page) => page.readerVersion === READER_VERSION), selectedKey()?.readerVersion === READER_VERSION ? selectedKey() : null),
  getItems: analysisItems, getScheme: () => analysisScheme,
  saveScheme: (scheme) => { analysisScheme = scheme; saveState(); },
  getTitle: () => "UoL legacy · Analysis",
});
if (rosterStatus) { enableScanning(); if (roster.length) tellRoster(`Loaded ${roster.length} saved students.`); }
renderResults();
