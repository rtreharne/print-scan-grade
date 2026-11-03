import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#scan-file");
const scanButton = $("#scan-button");
const fileName = $("#file-name");
const dummyZipForm = $("#dummy-zip-form");
const dummyFormSelect = $("#dummy-form-select");
const dummyStudentCount = $("#dummy-student-count");
const dummyStudentLimit = $("#dummy-student-limit");
const dummyZipButton = $("#dummy-zip-button");
const dummyZipError = $("#dummy-zip-error");
const progressBox = $("#scan-progress");
const progressBar = $("#progress-bar");
const progressLabel = $("#progress-label");
const rescanFileInput = $("#rescan-file");
const rescanProgressBox = $("#rescan-progress");
const rescanProgressBar = $("#rescan-progress-bar");
const rescanProgressLabel = $("#rescan-progress-label");
const rescanResultMessage = $("#rescan-result-message");
const csvButton = $("#download-csv");
const courseRoster = [];
const setKeyField = $("#set-key-field");
const setKeySelect = $("#set-key-select");
const rosterRows = $("#roster-rows");
const gradeSummary = $("#grade-summary");
const gradeRosterMessage = $("#grade-roster-message");
const gradeFormList = $("#grade-form-list");
const gradeSetList = $("#grade-set-list");
const gradeDetail = $("#grade-detail");
const gradeBack = $("#grade-back");
const gradeSetBack = $("#grade-set-back");
const deleteScanSetButton = $("#delete-scan-set-button");
const scanPreviewDialog = $("#scan-preview-dialog");
const scanPreviewTitle = $("#scan-preview-title");
const scanPreviewMeta = $("#scan-preview-meta");
const scanPreviewContent = $("#scan-preview-content");
const originalScanToggle = $("#original-scan-toggle");
const originalScanPanel = $("#original-scan-panel");
const originalScanImage = $("#original-scan-image");
const scanDashboard = $("#scan-dashboard");
const gradeDashboard = $("#grade-dashboard");
const gradeLink = document.querySelector("[data-grade-link]");
const courseKeyElement = document.querySelector("#scan-course-key");
const courseKeyData = JSON.parse(courseKeyElement?.textContent || "{}");
const scanStorageKey = `${courseKeyData.issuer || "unknown"}::${courseKeyData.context_id || "unknown"}`;
const scanDatabaseName = "print-scan-grade-browser-data";
let originalScanObjectUrl = "";
let previewedSheetId = "";
const A4 = { width: 595.2756, height: 841.8898 };
const MARK_MARGIN = 16;
const CURRENT_MARK_MARGIN = 21;
const ANSWER_READER_VERSION = 5;
const CURRENT_SHEET_LAYOUT_VERSION = 4;
const PREVIEW_CONTRAST_VERSION = 2;
const REGISTRATION_MARK_THRESHOLD = 160;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const formsById = new Map();

async function initializeDummyZipForm() {
  if (!dummyZipForm) return;
  try {
    const response = await fetch("/scan/dummy-options.json", {
      headers: { Accept: "application/json" }, credentials: "same-origin"
    });
    const options = await response.json();
    if (!response.ok) throw new Error(options.error || "Could not load course enrollment.");
    dummyFormSelect.replaceChildren();
    for (const form of options.forms) {
      const option = document.createElement("option");
      option.value = form.form_id;
      option.textContent = form.title;
      dummyFormSelect.append(option);
    }
    if (!options.forms.length) {
      dummyFormSelect.add(new Option("No saved answer sheets", ""));
      dummyStudentLimit.textContent = "Create an answer sheet in Print first.";
      return;
    }
    if (options.student_count < 1) {
      dummyStudentLimit.textContent = "No enrolled students were found for this course.";
      return;
    }
    dummyStudentCount.max = String(options.student_count);
    dummyStudentCount.value = String(Math.min(options.student_count, 5));
    dummyStudentLimit.textContent = `Choose from 1 to ${options.student_count} enrolled students.`;
    dummyStudentCount.disabled = false;
    dummyZipButton.disabled = false;
  } catch (error) {
    dummyFormSelect.replaceChildren(new Option("Answer sheets unavailable", ""));
    dummyStudentLimit.textContent = "Course enrollment could not be loaded.";
    dummyZipError.textContent = error.message;
    dummyZipError.hidden = false;
  }
}

dummyZipForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formId = dummyFormSelect.value;
  const count = Number(dummyStudentCount.value);
  const max = Number(dummyStudentCount.max);
  if (!formId || !Number.isInteger(count) || count < 1 || count > max) {
    dummyZipError.textContent = `Choose a number from 1 to ${max}.`;
    dummyZipError.hidden = false;
    return;
  }
  dummyZipError.hidden = true;
  window.location.assign(`/scan/${encodeURIComponent(formId)}/dummy.zip?count=${count}` +
    `&scanner_layout_version=${CURRENT_SHEET_LAYOUT_VERSION}`);
});

initializeDummyZipForm();

let sheetResults = [];
let pageIssues = [];
let guidePagesSkipped = 0;
let scanSets = [];
let answerKeyByScanSet = {};
let gradeDashboardData = null;
let selectedGradeFormId = "";
let selectedScanSetId = "";
let rescanTargetScanSetId = "";
let scanInProgress = false;
let formsManifestLoaded = false;
let persistenceReady = false;
let persistenceWarning = "";
let persistenceLoadPromise = null;
let formsManifestPromise = null;
let bubbleRefreshPromise = null;

async function loadFormsManifest() {
  if (formsManifestLoaded) return;
  if (formsManifestPromise) return formsManifestPromise;
  formsManifestPromise = (async () => {
    const response = await fetch("/scan/forms.json", {
      headers: { Accept: "application/json" }, credentials: "same-origin"
    });
    if (!response.ok) throw new Error("Saved sheet settings could not be loaded. Reopen the app from the course and try again.");
    const manifest = await response.json();
    formsById.clear();
    for (const form of manifest) formsById.set(form.form_id.toLowerCase(), form);
    formsManifestLoaded = true;
  })().catch((error) => {
    formsManifestPromise = null;
    throw error;
  });
  return formsManifestPromise;
}

function openScanDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scanDatabaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("courses")) db.createObjectStore("courses", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser storage could not be opened."));
  });
}

async function loadPersistedScanState() {
  if (persistenceReady) return;
  if (persistenceLoadPromise) return persistenceLoadPromise;
  persistenceLoadPromise = loadPersistedScanStateOnce();
  return persistenceLoadPromise;
}

async function loadPersistedScanStateOnce() {
  try {
    const db = await openScanDatabase();
    const state = await new Promise((resolve, reject) => {
      const request = db.transaction("courses", "readonly").objectStore("courses").get(scanStorageKey);
      request.onsuccess = () => resolve(request.result?.state || null);
      request.onerror = () => reject(request.error || new Error("Saved scan data could not be read."));
    });
    db.close();
    if (state && state.version === 1) {
      sheetResults.splice(0, sheetResults.length, ...(Array.isArray(state.sheetResults) ? state.sheetResults : []));
      pageIssues.splice(0, pageIssues.length, ...(Array.isArray(state.pageIssues) ? state.pageIssues : []));
      guidePagesSkipped = Number(state.guidePagesSkipped || 0);
      scanSets = Array.isArray(state.scanSets) ? state.scanSets : [];
      answerKeyByScanSet = state.answerKeyByScanSet && typeof state.answerKeyByScanSet === "object"
        ? state.answerKeyByScanSet : {};
      const legacyKeyByScan = state.gradeKeyByScan && typeof state.gradeKeyByScan === "object"
        ? state.gradeKeyByScan : {};
      for (const [index, sheet] of sheetResults.entries()) {
        if (!sheet.id) sheet.id = `sheet-${index + 1}`;
        sheet.studentId ||= "";
        if (!sheet.scanSetId) {
          let legacySet = scanSets.find((set) => set.legacy && set.formId === sheet.formId);
          if (!legacySet) {
            legacySet = {
              id: `legacy-${sheet.formId}`,
              formId: sheet.formId,
              sourceName: "Previously scanned sheets",
              createdAt: Number(state.savedAt || 0),
              legacy: true,
            };
            scanSets.push(legacySet);
          }
          sheet.scanSetId = legacySet.id;
        }
      }
      for (const scanSet of scanSets) {
        if (answerKeyByScanSet[scanSet.id]) continue;
        const existing = sheetResults.find((sheet) => sheet.scanSetId === scanSet.id && legacyKeyByScan[sheet.id]);
        const legacyKey = existing ? legacyKeyByScan[existing.id] : state.answerKeyId;
        if (legacyKey && sheetResults.some((sheet) => sheet.id === legacyKey && sheet.formId === scanSet.formId)) {
          answerKeyByScanSet[scanSet.id] = legacyKey;
        }
      }
    }
    persistenceReady = true;
  } catch (error) {
    persistenceWarning = "Browser storage is unavailable; scan results will last only until this page is closed.";
    persistenceReady = true;
    console.warn("Could not load saved scan results", error);
  }
}

async function persistScanState() {
  if (!persistenceReady) return;
  try {
    const db = await openScanDatabase();
    const state = {
      version: 1,
      sheetResults,
      scanSets,
      pageIssues,
      guidePagesSkipped,
      answerKeyByScanSet,
      savedAt: Date.now(),
    };
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("courses", "readwrite");
      transaction.objectStore("courses").put({ key: scanStorageKey, state });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Saved scan data could not be written."));
      transaction.onabort = () => reject(transaction.error || new Error("Saved scan data could not be written."));
    });
    db.close();
    persistenceWarning = "";
  } catch (error) {
    persistenceWarning = "Browser storage could not save scan results; keep this page open until results are exported.";
    console.warn("Could not save scan results", error);
  }
}

gradeLink.addEventListener("click", (event) => {
  event.preventDefault();
  showGradeDashboard(true).catch((error) => showGradeLoadError(error));
});
document.querySelectorAll("[data-scan-link]").forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  showScanDashboard(true);
}));
window.addEventListener("popstate", () => {
  if (window.location.pathname.replace(/\/$/, "").endsWith("/grade")) {
    showGradeDashboard(false).catch((error) => showGradeLoadError(error));
  } else {
    showScanDashboard(false);
  }
});

async function showGradeDashboard(pushHistory) {
  await loadPersistedScanState();
  if (!gradeDashboardData) {
    gradeSummary.textContent = "Loading the course roster and saved sheets…";
    const response = await fetch("/grade?format=json", { headers: { Accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) throw new Error(`Grade dashboard could not load (${response.status}). Reopen the app from the course and try again.`);
    gradeDashboardData = await response.json();
    courseRoster.splice(0, courseRoster.length, ...(gradeDashboardData.roster || []));
    renderGradeDashboardSheets(gradeDashboardData.forms || []);
    if (!gradeDashboardData.roster_available || gradeDashboardData.roster_error) {
      gradeRosterMessage.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = gradeDashboardData.roster_available ? "Course roster unavailable" : "Course roster access is not enabled";
      gradeRosterMessage.append(heading, document.createElement("br"), document.createTextNode(
        gradeDashboardData.roster_error || "Update the MiniVLE registration to grant the LTI membership-read scope, then reopen this page."
      ));
      gradeRosterMessage.hidden = false;
    } else {
      gradeRosterMessage.hidden = true;
    }
  }
  if (persistenceWarning) {
    gradeSummary.textContent = `${gradeSummary.textContent} ${persistenceWarning}`;
  }
  gradeDetail.hidden = true;
  gradeSetList.hidden = true;
  gradeFormList.hidden = false;
  selectedGradeFormId = "";
  selectedScanSetId = "";
  renderGradeDashboardSheets(gradeDashboardData?.forms || []);
  renderGradeWorkspace();
  scanDashboard.hidden = true;
  gradeDashboard.hidden = false;
  updatePhaseNavigation("grade");
  if (pushHistory && window.location.pathname !== "/grade") window.history.pushState({}, "", "/grade");
  window.scrollTo(0, 0);
  refreshSavedBubbleIdsInBackground().then(() => {
    if (window.location.pathname.replace(/\/$/, "").endsWith("/grade")) {
      renderGradeDashboardSheets(gradeDashboardData?.forms || []);
      renderGradeWorkspace();
    }
  });
}

function refreshSavedBubbleIdsInBackground() {
  if (bubbleRefreshPromise) return bubbleRefreshPromise;
  bubbleRefreshPromise = refreshSavedBubbleIds()
    .catch((error) => console.warn("Saved scan readings could not be refreshed", error))
    .finally(() => { bubbleRefreshPromise = null; });
  return bubbleRefreshPromise;
}

function showScanDashboard(pushHistory) {
  gradeDashboard.hidden = true;
  scanDashboard.hidden = false;
  updatePhaseNavigation("scan");
  if (persistenceWarning) {
    const notice = document.createElement("p");
    notice.className = "scan-errors roster-error";
    notice.textContent = persistenceWarning;
    const panel = scanDashboard.querySelector(".scan-panel");
    if (panel && !panel.querySelector("[data-persistence-warning]")) {
      notice.dataset.persistenceWarning = "true";
      panel.prepend(notice);
    }
  }
  if (pushHistory && window.location.pathname !== "/scan") window.history.pushState({}, "", "/scan");
  window.scrollTo(0, 0);
}

function updatePhaseNavigation(activePhase) {
  document.querySelectorAll(".phase-nav a").forEach((link) => {
    const active = activePhase === "grade" ? link === gradeLink : link.getAttribute("href") === "/scan";
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function renderGradeDashboardSheets(forms) {
  gradeFormList.replaceChildren();
  const scannedForms = forms.filter((form) => scanSets.some((scanSet) => scanSet.formId === form.form_id));
  if (!scannedForms.length) {
    const empty = document.createElement("div");
    empty.className = pageIssues.length ? "scan-errors" : "field-help";
    const message = document.createElement("p");
    message.textContent = pageIssues.length
      ? `No answer sheets were identified in saved scan data. ${pageIssues.length} file or page issue(s) need attention.`
      : "No scanned answer sheets saved for this course yet. Scan completed sheets to start grading.";
    empty.append(message);
    if (pageIssues.length) {
      const list = document.createElement("ul");
      for (const issue of pageIssues) {
        const item = document.createElement("li");
        item.textContent = `${issue.file}${issue.page === "—" ? "" : ` · page ${issue.page}`}: ${issue.reason}`;
        list.append(item);
      }
      empty.append(list);
    }
    gradeFormList.append(empty);
    return;
  }
  for (const form of scannedForms) {
    const card = document.createElement("article");
    card.className = "saved-sheet-card grade-form-card";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = form.title;
    const meta = document.createElement("small");
    const sets = scanSets.filter((scanSet) => scanSet.formId === form.form_id);
    const scanCount = sheetResults.filter((sheet) => sheet.formId === form.form_id && !isDummyAnswerKey(sheet)).length;
    meta.textContent = `${form.question_count} questions · ${form.choice_count} choices · ${sets.length} scan set${sets.length === 1 ? "" : "s"} · ${scanCount} student scan${scanCount === 1 ? "" : "s"}`;
    details.append(title, meta);
    const open = document.createElement("button");
    open.className = "primary-button";
    open.type = "button";
    open.textContent = "Open scan sets";
    open.addEventListener("click", () => openGradeForm(form.form_id));
    card.append(details, open);
    gradeFormList.append(card);
  }
}

function openGradeForm(formId) {
  selectedGradeFormId = formId;
  gradeFormList.hidden = true;
  gradeSetList.hidden = false;
  gradeDetail.hidden = true;
  renderScanSetList();
  window.scrollTo(0, 0);
}

gradeBack.addEventListener("click", () => {
  selectedScanSetId = "";
  gradeDetail.hidden = true;
  gradeSetList.hidden = false;
  renderScanSetList();
  window.scrollTo(0, 0);
});

gradeSetBack.addEventListener("click", () => {
  selectedGradeFormId = "";
  selectedScanSetId = "";
  gradeSetList.hidden = true;
  gradeFormList.hidden = false;
  renderGradeDashboardSheets(gradeDashboardData?.forms || []);
  window.scrollTo(0, 0);
});

deleteScanSetButton.addEventListener("click", deleteSelectedScanSet);

function renderScanSetList() {
  const cards = $("#grade-set-cards");
  cards.replaceChildren();
  const sets = scanSets.filter((scanSet) => scanSet.formId === selectedGradeFormId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!sets.length) {
    const empty = document.createElement("p");
    empty.className = "field-help";
    empty.textContent = "No scan sets for this answer sheet.";
    cards.append(empty);
    return;
  }
  for (const scanSet of sets) {
    const card = document.createElement("article");
    card.className = "saved-sheet-card grade-set-card";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = scanSet.sourceName || "Scanned sheets";
    const meta = document.createElement("small");
    const count = sheetResults.filter((sheet) => sheet.scanSetId === scanSet.id && !isDummyAnswerKey(sheet)).length;
    const when = scanSet.createdAt ? new Date(scanSet.createdAt).toLocaleString() : "Date unavailable";
    meta.textContent = `${count} student scan${count === 1 ? "" : "s"} · ${when}`;
    details.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "scan-set-actions";
    const open = document.createElement("button");
    open.className = "primary-button";
    open.type = "button";
    open.textContent = "Open students";
    open.addEventListener("click", () => openScanSet(scanSet.id));
    const rescan = document.createElement("button");
    rescan.className = "download-button";
    rescan.type = "button";
    rescan.textContent = "Re-scan";
    rescan.disabled = scanInProgress;
    rescan.addEventListener("click", () => chooseRescanFile(scanSet.id));
    const remove = document.createElement("button");
    remove.className = "delete-scan-button";
    remove.type = "button";
    remove.textContent = "Delete set";
    remove.addEventListener("click", () => deleteScanSet(scanSet.id));
    actions.append(open, rescan, remove);
    card.append(details, actions);
    cards.append(card);
  }
}

function openScanSet(scanSetId) {
  selectedScanSetId = scanSetId;
  gradeSetList.hidden = true;
  gradeDetail.hidden = false;
  renderSetAnswerKeyOptions();
  renderGradeWorkspace();
  window.scrollTo(0, 0);
}

async function deleteSelectedScanSet() {
  if (selectedScanSetId) await deleteScanSet(selectedScanSetId);
}

async function deleteScanSet(scanSetId) {
  const scanSet = scanSets.find((item) => item.id === scanSetId);
  if (!scanSet) return;
  const count = sheetResults.filter((sheet) => sheet.scanSetId === scanSetId).length;
  const label = scanSet.sourceName || "Scanned sheets";
  if (!window.confirm(`Delete this scan set?\n\n${label} · ${count} student scan(s)\n\nAll scans, saved page previews, and grades in this set will be removed from this browser.`)) return;
  const removedIds = new Set(sheetResults.filter((sheet) => sheet.scanSetId === scanSetId).map((sheet) => sheet.id));
  sheetResults = sheetResults.filter((sheet) => sheet.scanSetId !== scanSetId);
  scanSets = scanSets.filter((item) => item.id !== scanSetId);
  delete answerKeyByScanSet[scanSetId];
  for (const [setId, keyId] of Object.entries(answerKeyByScanSet)) {
    if (removedIds.has(keyId)) delete answerKeyByScanSet[setId];
  }
  await persistScanState();
  if (selectedScanSetId === scanSetId) {
    selectedScanSetId = "";
    gradeDetail.hidden = true;
    gradeSetList.hidden = false;
  }
  renderGradeDashboardSheets(gradeDashboardData?.forms || []);
  renderScanSetList();
  renderGradeWorkspace();
}

$("#scan-preview-close").addEventListener("click", () => scanPreviewDialog.close());
originalScanToggle.addEventListener("click", () => {
  originalScanPanel.hidden = !originalScanPanel.hidden;
  originalScanToggle.textContent = originalScanPanel.hidden ? "View enhanced scan" : "Hide enhanced scan";
});
scanPreviewDialog.addEventListener("close", resetOriginalScanPreview);
scanPreviewDialog.addEventListener("click", (event) => {
  if (event.target === scanPreviewDialog) scanPreviewDialog.close();
});

function showGradeLoadError(error) {
  gradeRosterMessage.textContent = error.message || "Grade dashboard could not load.";
  gradeRosterMessage.hidden = false;
  scanDashboard.hidden = true;
  gradeDashboard.hidden = false;
  updatePhaseNavigation("grade");
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  fileName.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "PDFs and ZIPs are processed locally and are not uploaded.";
  scanButton.disabled = !file;
});

scanButton.addEventListener("click", () => scanFile());
rescanFileInput.addEventListener("change", () => {
  const file = rescanFileInput.files?.[0];
  if (file && rescanTargetScanSetId) scanFile(file, rescanTargetScanSetId, rescanFileInput);
});
rescanFileInput.addEventListener("cancel", () => {
  rescanTargetScanSetId = "";
});
csvButton.addEventListener("click", downloadCsv);

function chooseRescanFile(scanSetId) {
  rescanTargetScanSetId = scanSetId;
  rescanResultMessage.hidden = true;
  rescanFileInput.value = "";
  rescanFileInput.click();
}

async function scanFile(file = fileInput.files?.[0], targetScanSetId = "", sourceInput = fileInput) {
  if (!file || scanInProgress) return;
  const fileType = getScanFileType(file);
  const scanSetsForUpload = new Map();
  const rescannedSheets = [];
  const issueCountBefore = pageIssues.length;
  const targetScanSet = targetScanSetId ? scanSets.find((item) => item.id === targetScanSetId) : null;
  if (targetScanSetId && !targetScanSet) return;
  if (!targetScanSet) {
    // Page issues describe the upload currently being processed. Keeping old
    // failures here made a successful retry continue to report stale errors.
    pageIssues = [];
    guidePagesSkipped = 0;
  }
  scanInProgress = true;
  sourceInput.value = "";
  const isRescan = Boolean(targetScanSet);
  if (isRescan) {
    rescanTargetScanSetId = "";
    renderScanSetList();
    rescanProgressBox.hidden = false;
    rescanProgressBar.value = 0;
    rescanProgressBar.max = 1;
  } else {
    scanButton.disabled = true;
    progressBox.hidden = false;
    progressBar.value = 0;
    progressBar.max = 1;
  }
  setProgress(fileType === "pdf" ? "Opening PDF locally…" : fileType === "zip" ? "Opening ZIP locally…" : "Checking file…");

  try {
    if (bubbleRefreshPromise) {
      setProgress("Finishing saved scan refresh…");
      await bubbleRefreshPromise;
    }
    if (!fileType) throw new Error("Select a PDF or ZIP file to scan.");
    await loadFormsManifest();
    let pdfEntries;
    if (fileType === "pdf") {
      pdfEntries = [{ name: file.name, _data: { uncompressedSize: file.size }, async: async () => new Uint8Array(await file.arrayBuffer()) }];
    } else {
      if (file.size > MAX_ZIP_BYTES) {
        throw new Error(`This ZIP is larger than the ${formatBytes(MAX_ZIP_BYTES)} browser limit. Split it into smaller ZIPs and try again.`);
      }
      const zip = await window.JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      pdfEntries = Object.values(zip.files)
        .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".pdf"))
        .sort((a, b) => a.name.localeCompare(b.name));
      const skipped = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.toLowerCase().endsWith(".pdf")).length;
      if (skipped) pageIssues.push({ file: file.name, page: "—", reason: `${skipped} non-PDF file(s) skipped` });
      if (!pdfEntries.length) throw new Error("No PDF files were found in this ZIP.");
    }

    progressBar.max = pdfEntries.length;
    if (isRescan) rescanProgressBar.max = pdfEntries.length;
    for (let fileIndex = 0; fileIndex < pdfEntries.length; fileIndex += 1) {
      const entry = pdfEntries[fileIndex];
      const advertisedSize = entry._data?.uncompressedSize || 0;
      if (advertisedSize > MAX_PDF_BYTES) {
        pageIssues.push({ file: entry.name, page: "—", reason: `PDF exceeds the ${formatBytes(MAX_PDF_BYTES)} per-file limit` });
        progressBar.value = fileIndex + 1;
        if (isRescan) rescanProgressBar.value = fileIndex + 1;
        continue;
      }
      setProgress(`Reading ${entry.name}…`);
      let bytes;
      let pdf;
      let loadingTask;
      try {
        bytes = await entry.async("uint8array");
        if (!hasPdfHeader(bytes)) throw new Error("The file does not contain a readable PDF.");
        loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false });
        pdf = await loadingTask.promise;
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
          setProgress(`Scanning ${entry.name} · page ${pageNo} of ${pdf.numPages}`);
          try {
            const result = await scanPage(pdf, pageNo, entry.name);
            if (result?.guidePage) guidePagesSkipped += 1;
            else {
              result.id = globalThis.crypto?.randomUUID?.() || `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              result.studentId = result.studentId || "";
              if (isRescan) {
                if (result.formId !== targetScanSet.formId) {
                  pageIssues.push({ file: entry.name, page: pageNo, reason: "This page belongs to a different saved answer sheet and was not added to the selected scan set." });
                  continue;
                }
                result.scanSetId = targetScanSet.id;
                rescannedSheets.push(result);
                continue;
              }
              let scanSet = scanSetsForUpload.get(result.formId);
              if (!scanSet) {
                scanSet = {
                  id: globalThis.crypto?.randomUUID?.() || `set-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  formId: result.formId,
                  sourceName: file.name,
                  createdAt: Date.now(),
                };
                scanSetsForUpload.set(result.formId, scanSet);
                scanSets.push(scanSet);
              }
              result.scanSetId = scanSet.id;
              sheetResults.push(result);
            }
          } catch (error) {
            pageIssues.push({ file: entry.name, page: pageNo, reason: error.message || "Page could not be read" });
          }
        }
      } catch (error) {
        pageIssues.push({ file: entry.name, page: "—", reason: error.message || "PDF could not be opened" });
      } finally {
        if (loadingTask) {
          try {
            await loadingTask.destroy();
          } catch (_) {
            // A damaged PDF may also fail while PDF.js is being torn down.
            // Keep processing the remaining entries in the ZIP.
          }
        }
        bytes = null;
      }
      progressBar.value = fileIndex + 1;
      if (isRescan) rescanProgressBar.value = fileIndex + 1;
    }
  } catch (error) {
    pageIssues.push({ file: file.name, page: "—", reason: error.message || `${fileType === "pdf" ? "PDF" : "ZIP"} could not be read` });
  }

  if (!isRescan) {
    for (const scanSet of scanSetsForUpload.values()) {
      const answerSheet = sheetResults.find((sheet) =>
        sheet.scanSetId === scanSet.id && isDummyAnswerKey(sheet));
      if (answerSheet) answerKeyByScanSet[scanSet.id] = answerSheet.id;
    }
  }

  sourceInput.value = "";
  scanInProgress = false;
  if (isRescan) {
    rescanProgressBox.hidden = true;
    renderScanSetList();
    if (rescannedSheets.length) {
      const removedIds = new Set(sheetResults.filter((sheet) => sheet.scanSetId === targetScanSet.id).map((sheet) => sheet.id));
      sheetResults = sheetResults.filter((sheet) => sheet.scanSetId !== targetScanSet.id);
      sheetResults.push(...rescannedSheets);
      targetScanSet.sourceName = file.name;
      targetScanSet.createdAt = Date.now();
      for (const [setId, keyId] of Object.entries(answerKeyByScanSet)) {
        if (removedIds.has(keyId)) delete answerKeyByScanSet[setId];
      }
      const issue = pageIssues.length > issueCountBefore ? ` Some pages were skipped: ${pageIssues[issueCountBefore].reason}` : "";
      rescanResultMessage.textContent = `Re-scanned ${rescannedSheets.length} page${rescannedSheets.length === 1 ? "" : "s"} into “${file.name}”.${issue} Select an answer sheet for this updated set again if needed.`;
      rescanResultMessage.hidden = false;
      renderScanSetList();
      renderGradeDashboardSheets(gradeDashboardData?.forms || []);
      renderGradeWorkspace();
    } else {
      const issue = pageIssues.length > issueCountBefore ? ` ${pageIssues[issueCountBefore].reason}` : "";
      rescanResultMessage.textContent = `No readable pages for this answer sheet were found. The existing scan set was kept.${issue}`;
      rescanResultMessage.hidden = false;
    }
    await persistScanState();
    return;
  }
  fileName.textContent = "Processing finished. Select another PDF or ZIP to start a new scan.";
  progressBox.hidden = true;
  scanButton.disabled = true;
  finishScan();
  await persistScanState();
  await showGradeDashboard(true).catch(showGradeLoadError);
}

function getScanFileType(file) {
  if (!file || typeof file.name !== "string") return "";
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed") return "zip";
  return "";
}

function hasPdfHeader(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

async function scanPage(pdf, pageNo, sourceFile) {
  const page = await pdf.getPage(pageNo);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.8, 1600 / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = Math.ceil(viewport.width);
  sourceCanvas.height = Math.ceil(viewport.height);
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceContext.fillStyle = "white";
  sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  await page.render({ canvasContext: sourceContext, viewport, background: "#ffffff" }).promise;
  page.cleanup();

  // Scanner apps often produce a pale gray page. Use a maximally contrasted
  // black/white copy for structural detection, while retaining the original
  // grayscale page for bubble analysis and the saved preview.
  const detectionCanvas = createBinarizedCanvas(sourceCanvas);
  const marks = findRegistrationMarks(detectionCanvas);
  detectionCanvas.width = 0;
  detectionCanvas.height = 0;
  if (!marks) {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    throw new Error("The four page-registration marks could not be found. Check that the page is not cropped.");
  }
  let alignedCanvas = null;
  let singleFormFallbackCanvas = null;
  let qr = null;
  // Registration marks are symmetric, so try each physical page orientation.
  // A valid form QR in the expected top-right area identifies the upright one.
  for (let rotation = 0; rotation < 4; rotation += 1) {
    const points = marks.map((_, index) => marks[(index + rotation) % marks.length]);
    let candidate = rectifyPage(sourceCanvas, points);
    if (!candidate) continue;
    let qrCanvas = createBinarizedCanvas(candidate);
    let decoded = decodeFormQr(qrCanvas) || decodeFormQr(candidate);
    qrCanvas.width = 0;
    qrCanvas.height = 0;
    const preliminaryForm = decoded && !decoded.data.startsWith("PSGGUIDE|")
      ? identifyScannedForm(decoded) : null;
    if (preliminaryForm?.ok && preliminaryForm.layoutVersion === 4) {
      candidate.width = 0;
      candidate = rectifyPage(sourceCanvas, points, CURRENT_MARK_MARGIN);
      if (!candidate) continue;
      qrCanvas = createBinarizedCanvas(candidate);
      decoded = decodeFormQr(qrCanvas) || decodeFormQr(candidate);
      qrCanvas.width = 0;
      qrCanvas.height = 0;
    }
    if (decoded) {
      alignedCanvas = candidate;
      qr = decoded;
      break;
    }
    if (rotation === 0 && formsById.size === 1) {
      singleFormFallbackCanvas = candidate;
    } else {
      candidate.width = 0;
      candidate.height = 0;
    }
  }
  if (alignedCanvas && singleFormFallbackCanvas && singleFormFallbackCanvas !== alignedCanvas) {
    singleFormFallbackCanvas.width = 0;
    singleFormFallbackCanvas.height = 0;
  }
  if (!alignedCanvas && singleFormFallbackCanvas) {
    const design = formsById.values().next().value;
    alignedCanvas = singleFormFallbackCanvas;
    // Layout 3 and 4 share answer and ID geometry. Existing pale sheets use
    // layout 3; clean layout-4 sheets remain identified from their QR above.
    qr = {
      data: `PSG1|${design.form_id}|${design.question_count}|${design.choice_count}|3`,
      pageTopRatio: 0.28,
    };
  }
  if (!alignedCanvas) {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    throw new Error("The page could not be aligned or its form QR code could not be read.");
  }
  try {
    if (qr.data.startsWith("PSGGUIDE|")) {
      const guideFormId = qr.data.split("|")[1]?.toLowerCase();
      if (!formsById.has(guideFormId)) {
        throw new Error("This instruction page belongs to a form that is not saved in the active course.");
      }
      return { guidePage: true };
    }
    const form = identifyScannedForm(qr);
    if (!form.ok) throw new Error(form.reason);
    let originalPage = null;
    try {
      originalPage = await createLocalPagePreview(sourceCanvas, true);
    } catch (error) {
      console.warn("Could not create a locally saved original-page preview", error);
    }
    setProgress(`Reading answer and student-number bubbles - ${sourceFile} - page ${pageNo}`);
    const answers = readAnswers(alignedCanvas, form.design, form.layoutVersion);
    const bubbleId = readStudentId(alignedCanvas, form.layoutVersion);
    const idMatch = resolveStudentId(bubbleId);
    return {
      sourceFile,
      pageNo,
      originalPage,
      previewContrastVersion: PREVIEW_CONTRAST_VERSION,
      formId: form.design.form_id,
      formTitle: form.design.title,
      layoutVersion: form.layoutVersion,
      questionCount: form.design.question_count,
      studentId: idMatch.studentId,
      bubbleStudentId: bubbleId.studentId,
      bubbleIdRaw: bubbleId.raw,
      bubbleIdUncertainColumns: bubbleId.uncertainColumns,
      writtenStudentId: "",
      digitOCR: "",
      printedName: "",
      answerReaderVersion: ANSWER_READER_VERSION,
      idMatchStatus: idMatch.status,
      ocrError: "",
      sampleExpectedAnswers: form.sampleSeed
        ? Array.from({ length: form.design.question_count }, (_, index) =>
          String.fromCharCode(65 + ((index + 1 + form.sampleSeed) % form.design.choice_count)))
        : null,
      answers,
    };
  } finally {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    alignedCanvas.width = 0;
    alignedCanvas.height = 0;
  }
}

function createBinarizedCanvas(sourceCanvas) {
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const image = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const histogram = new Uint32Array(256);
  const grayscale = new Uint8Array(sourceCanvas.width * sourceCanvas.height);
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    const gray = Math.round((image.data[offset] * 299 + image.data[offset + 1] * 587 +
      image.data[offset + 2] * 114) / 1000);
    grayscale[pixel] = gray;
    histogram[gray] += 1;
  }
  // Otsu's method selects the split that maximizes separation between paper
  // and ink, adapting automatically to gray or low-contrast scans.
  const total = grayscale.length;
  let weightedTotal = 0;
  for (let value = 0; value < 256; value += 1) weightedTotal += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundTotal = 0;
  let bestVariance = -1;
  let threshold = 180;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundTotal += value * histogram[value];
    const backgroundMean = backgroundTotal / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundTotal) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }
  const output = document.createElement("canvas");
  output.width = sourceCanvas.width;
  output.height = sourceCanvas.height;
  const outputContext = output.getContext("2d", { willReadFrequently: true });
  const contrasted = outputContext.createImageData(output.width, output.height);
  // PDF.js can render pale scanner ink around 240/255 even when desktop PDF
  // viewers show it as dark gray. Keep a high structural floor so those marks
  // become black; this copy is never used to judge student answer shading.
  const structuralThreshold = Math.max(threshold, 250);
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const tone = grayscale[pixel] <= structuralThreshold ? 0 : 255;
    const offset = pixel * 4;
    contrasted.data[offset] = tone;
    contrasted.data[offset + 1] = tone;
    contrasted.data[offset + 2] = tone;
    contrasted.data[offset + 3] = 255;
  }
  outputContext.putImageData(contrasted, 0, 0);
  return output;
}

function restorePaleScanContrast(image) {
  let darkPixels = 0;
  let paleInkPixels = 0;
  let sampledPixels = 0;
  // Sampling is sufficient to classify the page and avoids another complete
  // pass before enhancement. Normal PDFs contain substantially more genuinely
  // dark ink than mixed-raster scans whose foreground mask PDF.js has lost.
  for (let offset = 0; offset < image.data.length; offset += 16) {
    const gray = Math.round((image.data[offset] * 299 + image.data[offset + 1] * 587 +
      image.data[offset + 2] * 114) / 1000);
    if (gray < 170) darkPixels += 1;
    else if (gray < 254) paleInkPixels += 1;
    sampledPixels += 1;
  }
  const darkRatio = darkPixels / Math.max(1, sampledPixels);
  const paleInkRatio = paleInkPixels / Math.max(1, sampledPixels);
  if (darkRatio >= 0.025 || paleInkRatio < 0.01) return false;

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const gray = Math.round((image.data[offset] * 299 + image.data[offset + 1] * 587 +
      image.data[offset + 2] * 114) / 1000);
    const value = gray >= 254 ? 255 : Math.max(0, 255 - (254 - gray) * 10);
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
  }
  return true;
}

async function createLocalPagePreview(sourceCanvas, restoreContrast = false) {
  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / sourceCanvas.width);
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  preview.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const context = preview.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, preview.width, preview.height);
  context.drawImage(sourceCanvas, 0, 0, preview.width, preview.height);
  if (restoreContrast) {
    const image = context.getImageData(0, 0, preview.width, preview.height);
    if (restorePaleScanContrast(image)) context.putImageData(image, 0, 0);
  }
  const blob = await new Promise((resolve, reject) => {
    preview.toBlob((imageBlob) => imageBlob ? resolve(imageBlob) : reject(new Error("The local scan preview could not be saved.")), "image/jpeg", 0.88);
  });
  preview.width = 0;
  preview.height = 0;
  return blob;
}

function findRegistrationMarks(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const visited = new Uint8Array(canvas.width * canvas.height);
  const expectedSize = canvas.width * 8 / A4.width;
  const corners = [
    { name: "topLeft", x0: 0, y0: 0, x1: 0.06, y1: 0.06, expectedX: 16 / A4.width, expectedY: 16 / A4.height },
    { name: "topRight", x0: 0.94, y0: 0, x1: 1, y1: 0.06, expectedX: (A4.width - 16) / A4.width, expectedY: 16 / A4.height },
    { name: "bottomRight", x0: 0.94, y0: 0.94, x1: 1, y1: 1, expectedX: (A4.width - 16) / A4.width, expectedY: (A4.height - 16) / A4.height },
    { name: "bottomLeft", x0: 0, y0: 0.94, x1: 0.06, y1: 1, expectedX: 16 / A4.width, expectedY: (A4.height - 16) / A4.height },
  ];
  const result = {};
  for (const corner of corners) {
    let found = findCornerSquare(data, visited, canvas.width, canvas.height, corner, expectedSize) ||
      findCornerDarkPatch(data, canvas.width, canvas.height, corner, expectedSize);
    if (found) {
      const distance = Math.hypot(
        found.x - corner.expectedX * canvas.width,
        found.y - corner.expectedY * canvas.height,
      );
      if (distance > expectedSize * 1.85) found = null;
    }
    // If scanner contrast has erased a mark completely, a full A4 page still
    // has a reliable nominal corner. QR validation later prevents an unrelated
    // PDF from being accepted on the strength of these inferred points.
    result[corner.name] = found || {
      x: corner.expectedX * canvas.width,
      y: corner.expectedY * canvas.height,
      inferred: true,
    };
  }
  return [result.topLeft, result.topRight, result.bottomRight, result.bottomLeft];
}

function findCornerSquare(image, visited, width, height, corner, expectedSize) {
  const minX = Math.floor(corner.x0 * width);
  const maxX = Math.ceil(corner.x1 * width);
  const minY = Math.floor(corner.y0 * height);
  const maxY = Math.ceil(corner.y1 * height);
  const lowSize = Math.max(4, expectedSize * 0.4);
  const highSize = Math.max(lowSize + 2, expectedSize * 1.8);
  let best = null;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const index = y * width + x;
      if (visited[index] || grayAt(image.data, index) >= REGISTRATION_MARK_THRESHOLD) continue;
      const stack = [index];
      visited[index] = 1;
      let count = 0;
      let left = x;
      let right = x;
      let top = y;
      let bottom = y;
      while (stack.length) {
        const current = stack.pop();
        const cx = current % width;
        const cy = Math.floor(current / width);
        count += 1;
        if (cx < left) left = cx;
        if (cx > right) right = cx;
        if (cy < top) top = cy;
        if (cy > bottom) bottom = cy;
        if (count > highSize * highSize * 3) continue;
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue;
          const next = ny * width + nx;
          if (!visited[next] && grayAt(image.data, next) < REGISTRATION_MARK_THRESHOLD) {
            visited[next] = 1;
            stack.push(next);
          }
        }
      }
      const boxWidth = right - left + 1;
      const boxHeight = bottom - top + 1;
      const ratio = boxWidth / boxHeight;
      const fill = count / (boxWidth * boxHeight);
      if (boxWidth < lowSize || boxWidth > highSize || boxHeight < lowSize || boxHeight > highSize ||
          ratio < 0.5 || ratio > 1.8 || fill < 0.45) continue;
      const expectedX = corner.expectedX * width;
      const expectedY = corner.expectedY * height;
      const centerX = (left + right + 1) / 2;
      const centerY = (top + bottom + 1) / 2;
      const distance = Math.hypot(centerX - expectedX, centerY - expectedY);
      const sizeError = Math.abs(boxWidth - expectedSize) / expectedSize;
      const score = distance / Math.hypot(width * 0.1, height * 0.1) + sizeError * 0.35 + (1 - fill) * 0.2;
      if (!best || score < best.score) best = { x: centerX, y: centerY, score };
    }
  }
  return best;
}

function findCornerDarkPatch(image, width, height, corner, expectedSize) {
  const minX = Math.floor(corner.x0 * width);
  const maxX = Math.ceil(corner.x1 * width);
  const minY = Math.floor(corner.y0 * height);
  const maxY = Math.ceil(corner.y1 * height);
  const regionWidth = maxX - minX;
  const regionHeight = maxY - minY;
  const stride = regionWidth + 1;
  const integral = new Uint32Array((regionWidth + 1) * (regionHeight + 1));
  // Build an integral image of dark pixels. A high threshold deliberately
  // reconnects scanner-antialiased registration ink without changing answer
  // bubble thresholds elsewhere.
  for (let y = 0; y < regionHeight; y += 1) {
    let rowTotal = 0;
    for (let x = 0; x < regionWidth; x += 1) {
      const dark = grayAt(image.data, (minY + y) * width + minX + x) < 220 ? 1 : 0;
      rowTotal += dark;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowTotal;
    }
  }
  const expectedX = corner.expectedX * width;
  const expectedY = corner.expectedY * height;
  const minSize = Math.max(4, Math.floor(expectedSize * 0.4));
  const maxSize = Math.max(minSize, Math.ceil(expectedSize * 1.35));
  const regionDiagonal = Math.hypot(regionWidth, regionHeight);
  let best = null;
  for (let size = minSize; size <= maxSize; size += 2) {
    for (let y = 0; y <= regionHeight - size; y += 2) {
      for (let x = 0; x <= regionWidth - size; x += 2) {
        const x2 = x + size;
        const y2 = y + size;
        const darkPixels = integral[y2 * stride + x2] - integral[y * stride + x2] -
          integral[y2 * stride + x] + integral[y * stride + x];
        const fill = darkPixels / (size * size);
        if (fill < 0.42) continue;
        const centerX = minX + x + size / 2;
        const centerY = minY + y + size / 2;
        const distance = Math.hypot(centerX - expectedX, centerY - expectedY);
        const sizeError = Math.abs(size - expectedSize) / expectedSize;
        const score = fill - distance / regionDiagonal * 0.4 - sizeError * 0.12;
        if (!best || score > best.score) best = { x: centerX, y: centerY, score };
      }
    }
  }
  return best;
}

function grayAt(rgba, pixelIndex) {
  const offset = pixelIndex * 4;
  return (rgba[offset] * 299 + rgba[offset + 1] * 587 + rgba[offset + 2] * 114) / 1000;
}

function rectifyPage(sourceCanvas, registrationPoints, markMargin = MARK_MARGIN) {
  const outputWidth = 1500;
  const outputHeight = Math.round(outputWidth * A4.height / A4.width);
  const scale = outputWidth / A4.width;
  const inset = markMargin * scale;
  const source = registrationPoints.map((point) => [point.x, point.y]);
  const destination = [
    [inset, inset],
    [outputWidth - inset, inset],
    [outputWidth - inset, outputHeight - inset],
    [inset, outputHeight - inset],
  ];
  const forward = solveHomography(source, destination);
  const inverse = forward && invertHomography(forward);
  if (!inverse) return null;

  const sourceImage = sourceCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  const outputImage = outputContext.createImageData(outputWidth, outputHeight);
  const out = outputImage.data;
  const input = sourceImage.data;
  for (let y = 0, offset = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1, offset += 4) {
      const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
      const sx = (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator;
      const sy = (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix >= 0 && ix < sourceCanvas.width && iy >= 0 && iy < sourceCanvas.height) {
        const sourceOffset = (iy * sourceCanvas.width + ix) * 4;
        out[offset] = input[sourceOffset];
        out[offset + 1] = input[sourceOffset + 1];
        out[offset + 2] = input[sourceOffset + 2];
        out[offset + 3] = 255;
      } else {
        out[offset] = 255;
        out[offset + 1] = 255;
        out[offset + 2] = 255;
        out[offset + 3] = 255;
      }
    }
  }
  outputContext.putImageData(outputImage, 0, 0);
  return outputCanvas;
}

function solveHomography(source, target) {
  const matrix = [];
  for (let index = 0; index < 4; index += 1) {
    const [x, y] = source[index];
    const [u, v] = target[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    }
    if (Math.abs(matrix[pivot][column]) < 1e-9) return null;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    const divisor = matrix[column][column];
    for (let cell = column; cell <= 8; cell += 1) matrix[column][cell] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let cell = column; cell <= 8; cell += 1) matrix[row][cell] -= factor * matrix[column][cell];
    }
  }
  return [...matrix.map((row) => row[8]), 1];
}

function invertHomography(m) {
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (Math.abs(det) < 1e-12) return null;
  return [
    (m[4] * m[8] - m[5] * m[7]) / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    (m[5] * m[6] - m[3] * m[8]) / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    (m[3] * m[7] - m[4] * m[6]) / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
}

function decodeFormQr(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // Layout 3 places a relatively small QR beneath the name box. Scanner
  // antialiasing can make it disappear inside the broad fallback crop, so try
  // a focused 2x nearest-neighbour crop first.
  const focusedLeft = Math.floor(canvas.width * 0.8);
  const focusedTop = Math.floor(canvas.height * 0.23);
  const focusedWidth = Math.ceil(canvas.width * 0.19);
  const focusedHeight = Math.ceil(canvas.height * 0.15);
  const focused = document.createElement("canvas");
  focused.width = focusedWidth * 3;
  focused.height = focusedHeight * 3;
  const focusedContext = focused.getContext("2d", { willReadFrequently: true });
  focusedContext.imageSmoothingEnabled = false;
  focusedContext.drawImage(canvas, focusedLeft, focusedTop, focusedWidth, focusedHeight,
    0, 0, focused.width, focused.height);
  const focusedData = focusedContext.getImageData(0, 0, focused.width, focused.height);
  let focusedDecoded = window.jsQR(focusedData.data, focused.width, focused.height,
    { inversionAttempts: "attemptBoth" });
  if (!focusedDecoded) {
    const grayscale = new Uint8Array(focused.width * focused.height);
    for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
      const offset = pixel * 4;
      grayscale[pixel] = Math.round((focusedData.data[offset] * 299 +
        focusedData.data[offset + 1] * 587 + focusedData.data[offset + 2] * 114) / 1000);
    }
    // Scanner PDFs can contain very pale QR ink. Try a short set of high local
    // thresholds against this crop rather than applying one threshold to the
    // entire answer sheet and amplifying paper texture everywhere.
    for (const threshold of [240, 245, 248, 250, 252]) {
      const contrasted = new Uint8ClampedArray(focusedData.data.length);
      for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
        const offset = pixel * 4;
        const tone = grayscale[pixel] <= threshold ? 0 : 255;
        contrasted[offset] = tone;
        contrasted[offset + 1] = tone;
        contrasted[offset + 2] = tone;
        contrasted[offset + 3] = 255;
      }
      focusedDecoded = window.jsQR(contrasted, focused.width, focused.height,
        { inversionAttempts: "attemptBoth" });
      if (focusedDecoded) break;
    }
  }
  focused.width = 0;
  focused.height = 0;
  if (focusedDecoded) {
    const focusedCorners = ["topLeftCorner", "topRightCorner", "bottomLeftCorner", "bottomRightCorner"]
      .map((name) => focusedDecoded.location?.[name]).filter(Boolean);
    if (focusedCorners.length) {
      focusedDecoded.pageTopRatio = (focusedTop +
        Math.min(...focusedCorners.map((point) => point.y)) / 3) / canvas.height;
    }
    return focusedDecoded;
  }
  const left = Math.floor(canvas.width * 0.5);
  const top = Math.floor(canvas.height * 0.01);
  const width = canvas.width - left;
  const height = Math.floor(canvas.height * 0.42);
  const data = ctx.getImageData(left, top, width, height);
  const decoded = window.jsQR(data.data, width, height, { inversionAttempts: "attemptBoth" });
  if (decoded?.location) {
    const corners = ["topLeftCorner", "topRightCorner", "bottomLeftCorner", "bottomRightCorner"]
      .map((name) => decoded.location[name]).filter(Boolean);
    decoded.pageTopRatio = (top + Math.min(...corners.map((point) => point.y))) / canvas.height;
  }
  return decoded;
}

function identifyScannedForm(qr) {
  const form = identifyForm(qr.data);
  // The redesigned sheet was briefly emitted with a v2 QR before its layout
  // number was bumped. Its QR sits beneath the name box, unlike true v2 sheets.
  if (form.ok && form.layoutVersion === 2 && qr.pageTopRatio > 0.22) {
    return { ...form, layoutVersion: 3 };
  }
  return form;
}

function identifyForm(payload) {
  let formId = payload;
  let q = null;
  let c = null;
  let layoutVersion = null;
  let sampleSeed = 0;
  if (payload.startsWith("PSGSAMPLE|")) {
    const parts = payload.split("|");
    if (parts.length !== 6) return { ok: false, reason: "The sample QR code has an unsupported format." };
    [, formId, q, c, layoutVersion, sampleSeed] = parts;
    q = Number(q);
    c = Number(c);
    layoutVersion = Number(layoutVersion);
    sampleSeed = Number(sampleSeed);
    if (!Number.isInteger(sampleSeed) || sampleSeed < 1 || sampleSeed > 100) {
      return { ok: false, reason: "The sample answer pattern is not supported." };
    }
  } else if (payload.startsWith("PSG1|")) {
    const parts = payload.split("|");
    if (parts.length !== 5) return { ok: false, reason: "The QR code has an unsupported format." };
    [, formId, q, c, layoutVersion] = parts;
    q = Number(q);
    c = Number(c);
    layoutVersion = Number(layoutVersion);
  }
  const design = formsById.get(String(formId).toLowerCase());
  if (!design) return { ok: false, reason: `Form ${formId} is not saved in the active course. Open Scan from the correct MiniVLE course.` };
  if (q !== null && (q !== design.question_count || c !== design.choice_count)) {
    return { ok: false, reason: "The QR code settings don’t match the saved form. Re-download the sheet from Print." };
  }
  if (layoutVersion === null) layoutVersion = design.legacy_layout_version;
  if (![1, 2, 3, 4].includes(layoutVersion)) return { ok: false, reason: "This answer-sheet layout version is not supported." };
  return { ok: true, design, layoutVersion, sampleSeed };
}

function readAnswers(canvas, design, layoutVersion) {
  const questionBottom = 38;
  const questionCount = Number(design.question_count);
  const choiceCount = Number(design.choice_count);
  const currentLayout = [3, 4].includes(layoutVersion);
  const questionTop = layoutVersion === 1 ? 589 : currentLayout ? 460 : 507;
  const columns = Math.min(4, Math.max(1, Math.ceil(questionCount / (currentLayout ? 15 : 20))));
  const rowsPerColumn = currentLayout ? 15 : Math.ceil(questionCount / columns);
  const columnWidth = (A4.width - 54) / columns;
  const rowPitch = currentLayout
    ? Math.min(31, Math.max(12, (questionTop - questionBottom) / Math.max(1, rowsPerColumn - 1)))
    : Math.min(28.5, Math.max(12, (questionTop - questionBottom) / rowsPerColumn));
  const rowOffset = (questionTop - questionBottom - (rowsPerColumn - 1) * rowPitch) / 2;
  const answerPitch = Math.min(20.5, (columnWidth - (currentLayout ? 34 : 37)) / Math.max(1, choiceCount - 1));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / A4.width;
  const answers = [];
  for (let column = 0; column < columns; column += 1) {
    // Sample the bubble interior, clear of its outline and faint guide letter.
    // Keep sampling centered on the printed bubble so its outline does not
    // leak into the interior sample and look like a faint student mark.
    const x = 27 + column * columnWidth + (currentLayout ? 30 : 33);
    for (let row = 0; row < rowsPerColumn; row += 1) {
      const question = column * rowsPerColumn + row + 1;
      if (question > questionCount) break;
      const y = questionTop - rowOffset - row * rowPitch;
      const bubbles = [];
      for (let choice = 0; choice < choiceCount; choice += 1) {
        bubbles.push(sampleBubble(image, canvas.width, canvas.height,
          (x + choice * answerPitch) * scale, (A4.height - y) * scale,
          (currentLayout ? 6.8 : Math.min(5, Math.max(3.6, rowPitch * 0.28))) * scale,
          String.fromCharCode(65 + choice)));
      }
      answers.push(resolveQuestion(question, bubbles));
    }
  }
  return answers;
}

function readStudentId(canvas, layoutVersion) {
  if (![2, 3, 4].includes(layoutVersion)) return { studentId: "", raw: "", uncertainColumns: [] };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / A4.width;
  const firstBubbleX = 27 + 2 + 34;
  const firstRowY = A4.height - (A4.height - 145 - 13);
  const rowPitch = [3, 4].includes(layoutVersion) ? 14.5 : 9.1;
  let digits = "";
  const uncertainColumns = [];
  for (let column = 0; column < 9; column += 1) {
    const bubbles = [];
    for (let digit = 0; digit < 10; digit += 1) {
      const bubble = sampleIdBubble(
        image, canvas.width, canvas.height,
        (firstBubbleX + column * 20.5) * scale,
        (firstRowY + digit * rowPitch) * scale,
        ([3, 4].includes(layoutVersion) ? 6.8 : 3.9) * scale, String(digit),
      );
      bubbles.push(bubble);
    }
    const ranked = [...bubbles].sort((a, b) => b.signal - a.signal);
    const top = ranked[0];
    const second = ranked[1];
    const signalGap = top.signal - second.signal;
    const clearWinner = top.signal >= 0.28 && signalGap >= 0.07;
    if (clearWinner) digits += top.label;
    else digits += "?";
    const ambiguous = !clearWinner || second.signal >= top.signal * 0.88;
    if (ambiguous) uncertainColumns.push(column + 1);
  }
  return { studentId: /^\d{9}$/.test(digits) ? digits : "", raw: digits, uncertainColumns };
}

function sampleIdBubble(image, width, height, centerX, centerY, radius, label) {
  const analysis = analyzeCircle(image, width, height, centerX, centerY, radius, 0.12);
  let mark = "blank";
  let confidence = 0.92;
  if (analysis.fillRatio >= 0.3 && analysis.normalizedContrast >= 0.22) {
    mark = "shaded";
    confidence = Math.min(0.99, 0.62 + analysis.signal * 0.35);
  } else if (analysis.fillRatio >= 0.14 && analysis.normalizedContrast >= 0.1) {
    mark = "uncertain";
    confidence = 0.48;
  }
  return { label, mark, confidence, fillRatio: analysis.fillRatio, crossScore: 0,
    signal: analysis.signal, centerX: analysis.cx, centerY: analysis.cy };
}

function resolveStudentId(bubbleId) {
  const bubbled = bubbleId.studentId;
  if (bubbled) {
    return {
      studentId: bubbled,
      status: bubbleId.uncertainColumns.length
        ? `Bubble ID read; check column(s) ${bubbleId.uncertainColumns.join(", ")} because another faint mark was detected.`
        : "Student number read from the ID bubbles.",
    };
  }
  return { studentId: "", status: "Student number could not be read from the ID bubbles." };
}

async function readWrittenIdentity(canvas, layoutVersion) {
  // Retained only so older persisted callers fail safe. Runtime identity now
  // comes exclusively from the student-number bubble grid.
  return { printedName: "", writtenStudentId: "", digitOCR: "" };
  if (![2, 3, 4].includes(layoutVersion)) return { printedName: "", writtenStudentId: "", digitOCR: "" };
  const worker = await getOcrWorker();
  const scale = canvas.width / A4.width;
  const firstBubbleX = 27 + 2 + 34;
  const boxTop = 117;
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_WORD,
    classify_bln_numeric_mode: "1",
    user_defined_dpi: "300",
    load_system_dawg: "0",
    load_freq_dawg: "0",
  });
  const digitCrops = [];
  for (let column = 0; column < 9; column += 1) {
    const centerX = firstBubbleX + column * 20.5;
    digitCrops.push(cropForOcr(canvas,
      (centerX - 8.5) * scale, (boxTop + 1.5) * scale,
      17 * scale, 25 * scale, 5, null));
  }
  let digitOCR = "";
  const strip = stitchOcrCrops(digitCrops);
  try {
    const lineCandidates = [];
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_WORD });
    const wordLine = await worker.recognize(strip);
    lineCandidates.push(parseDigitLineCandidate(wordLine.data));
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.RAW_LINE });
    const rawLine = await worker.recognize(strip);
    lineCandidates.push(parseDigitLineCandidate(rawLine.data));
    digitOCR = chooseDigitLineCandidate(lineCandidates);
    if (!/^\d{9}$/.test(digitOCR)) {
      digitOCR = await readDigitCropsIndividually(worker, digitCrops);
    }
  } finally {
    strip.width = 0;
    strip.height = 0;
    for (const crop of digitCrops) {
      crop.width = 0;
      crop.height = 0;
    }
  }
  const writtenStudentId = /^\d{9}$/.test(digitOCR) ? digitOCR : "";

  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'- ",
    tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_LINE,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });
  const nameX = 287;
  const nameY = A4.height - (620 + 36);
  const nameCrop = cropForOcr(canvas,
    (nameX + 7) * scale, (nameY + 4) * scale,
    (281 - 14) * scale, 28 * scale, 3.5, null);
  let printedName = "";
  try {
    const first = await worker.recognize(nameCrop);
    const candidates = [parseNameCandidate(first.data)];
    if (!candidates[0].text || candidates[0].confidence < 82) {
      const binary = thresholdOcrCrop(nameCrop);
      try {
        const second = await worker.recognize(binary);
        candidates.push(parseNameCandidate(second.data));
      } finally {
        binary.width = 0;
        binary.height = 0;
      }
    }
    printedName = chooseNameCandidate(candidates).text;
  } finally {
    nameCrop.width = 0;
    nameCrop.height = 0;
  }
  return { printedName, writtenStudentId, digitOCR };
}

function cropForOcr(source, x, y, width, height, upscale, threshold = null) {
  const crop = document.createElement("canvas");
  crop.width = Math.max(1, Math.round(width * upscale));
  crop.height = Math.max(1, Math.round(height * upscale));
  const context = crop.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, crop.width, crop.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, x, y, width, height, 0, 0, crop.width, crop.height);
  const image = context.getImageData(0, 0, crop.width, crop.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = Math.round(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114);
    // Mixed-raster scanner PDFs can reach this point with handwriting around
    // 235â€“250 gray because PDF.js lost their masked foreground layer. Expand
    // darkness from the paper white point while retaining grayscale edges.
    const enhanced = gray >= 254 ? 255 : Math.max(0, 255 - (254 - gray) * 8);
    const value = threshold === null ? enhanced : enhanced < threshold ? 0 : 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return crop;
}

function stitchOcrCrops(crops) {
  const trimmed = crops.map(trimDigitCrop);
  const gap = Math.max(8, Math.round(crops[0]?.height * 0.14 || 24));
  const strip = document.createElement("canvas");
  strip.width = trimmed.reduce((total, crop) => total + crop.width, 0) + gap * Math.max(0, trimmed.length - 1);
  strip.height = Math.max(1, ...crops.map((crop) => crop.height));
  const context = strip.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "white";
  context.fillRect(0, 0, strip.width, strip.height);
  let x = 0;
  for (const crop of trimmed) {
    context.drawImage(crop, x, 0);
    x += crop.width + gap;
  }
  for (const crop of trimmed) {
    crop.width = 0;
    crop.height = 0;
  }
  return strip;
}

function trimDigitCrop(crop) {
  const context = crop.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, crop.width, crop.height);
  let left = crop.width;
  let right = -1;
  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      if (image.data[(y * crop.width + x) * 4] < 242) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < left) {
    const blank = document.createElement("canvas");
    blank.width = crop.width;
    blank.height = crop.height;
    blank.getContext("2d").fillStyle = "white";
    blank.getContext("2d").fillRect(0, 0, blank.width, blank.height);
    return blank;
  }
  const padding = Math.round(crop.height * 0.1);
  left = Math.max(0, left - padding);
  right = Math.min(crop.width - 1, right + padding);
  const trimmed = document.createElement("canvas");
  trimmed.width = right - left + 1;
  trimmed.height = crop.height;
  const trimmedContext = trimmed.getContext("2d");
  trimmedContext.fillStyle = "white";
  trimmedContext.fillRect(0, 0, trimmed.width, trimmed.height);
  trimmedContext.drawImage(crop, left, 0, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
  return trimmed;
}

async function readDigitCropsIndividually(worker, crops) {
  const digits = [];
  for (const crop of crops) {
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_WORD });
    const word = await worker.recognize(crop);
    const candidates = [parseDigitCandidate(word.data)];
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_CHAR });
    const character = await worker.recognize(crop);
    candidates.push(parseDigitCandidate(character.data));
    await worker.setParameters({ tessedit_pageseg_mode: window.Tesseract.PSM.SINGLE_WORD });
    if (candidates.some((candidate) => !candidate || candidate.confidence < 58)) {
      const binary = thresholdOcrCrop(crop);
      try {
        const result = await worker.recognize(binary);
        candidates.push(parseDigitCandidate(result.data));
      } finally {
        binary.width = 0;
        binary.height = 0;
      }
    }
    digits.push(chooseDigitCandidate(candidates).digit);
  }
  return digits.join("");
}

function thresholdOcrCrop(source) {
  const crop = document.createElement("canvas");
  crop.width = source.width;
  crop.height = source.height;
  const context = crop.getContext("2d", { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, crop.width, crop.height);
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index];
    histogram[gray] += 1;
    count += 1;
  }
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = -1;
  let threshold = 180;
  for (let value = 0; value < 256; value += 1) {
    weightBackground += histogram[value];
    if (!weightBackground) continue;
    const weightForeground = count - weightBackground;
    if (!weightForeground) break;
    sumBackground += value * histogram[value];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }
  threshold = Math.max(100, Math.min(225, threshold));
  for (let index = 0; index < image.data.length; index += 4) {
    const value = image.data[index] < threshold ? 0 : 255;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return crop;
}

function parseDigitCandidate(data) {
  const token = String(data?.text || "").replace(/\s/g, "");
  if (!/^\d$/.test(token)) return null;
  return { digit: token, confidence: Number(data.confidence) || 0 };
}

function parseDigitLineCandidate(data) {
  const digits = String(data?.text || "").replace(/\D/g, "");
  if (!/^\d{9}$/.test(digits)) return null;
  return { digits, confidence: Number(data?.confidence) || 0 };
}

function chooseDigitLineCandidate(candidates) {
  const valid = candidates.filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  if (!valid.length) return "";
  if (valid.length > 1 && valid[0].digits !== valid[1].digits &&
      valid[0].confidence - valid[1].confidence < 18) return "";
  return valid[0].confidence >= 30 ? valid[0].digits : "";
}

function chooseDigitCandidate(candidates) {
  const valid = candidates.filter(Boolean).sort((a, b) => b.confidence - a.confidence);
  if (!valid.length) return { digit: "?", confidence: 0 };
  const counts = new Map();
  for (const candidate of valid) {
    const group = counts.get(candidate.digit) || { count: 0, confidence: 0 };
    group.count += 1;
    group.confidence = Math.max(group.confidence, candidate.confidence);
    counts.set(candidate.digit, group);
  }
  const ranked = [...counts.entries()].sort((a, b) =>
    b[1].count - a[1].count || b[1].confidence - a[1].confidence);
  const [digit, best] = ranked[0];
  const runnerUp = ranked[1]?.[1];
  if (runnerUp && best.count === runnerUp.count && best.confidence - runnerUp.confidence < 18) {
    return { digit: "?", confidence: best.confidence };
  }
  return best.confidence >= 35 ? { digit, confidence: best.confidence } : { digit: "?", confidence: best.confidence };
}

function parseNameCandidate(data) {
  const text = String(data?.text || "")
    .replace(/[^\p{L}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, confidence: Number(data?.confidence) || 0 };
}

function chooseNameCandidate(candidates) {
  const valid = candidates.filter((candidate) => candidate.text).sort((a, b) => b.confidence - a.confidence);
  if (valid.length > 1 && valid[0].text !== valid[1].text &&
      valid[0].confidence - valid[1].confidence < 12) {
    return { text: valid[0].text, confidence: valid[0].confidence, uncertain: true };
  }
  return valid[0] || { text: "", confidence: 0, uncertain: true };
}

async function getOcrWorker() {
  if (ocrUnavailableReason) throw new Error(ocrUnavailableReason);
  if (!window.Tesseract) {
    ocrUnavailableReason = "Local handwriting recognition is unavailable.";
    throw new Error(ocrUnavailableReason);
  }
  if (!ocrWorkerPromise) {
    const assetUrl = (path) => new URL(path, import.meta.url).toString();
    const langPath = assetUrl("./vendor/tesseract/lang").replace(/\/$/, "");
    ocrWorkerPromise = window.Tesseract.createWorker("eng", window.Tesseract.OEM.LSTM_ONLY, {
      workerPath: assetUrl("./vendor/tesseract/worker.min.js"),
      corePath: assetUrl("./vendor/tesseract/tesseract-core-lstm.wasm.js"),
      langPath,
      gzip: true,
      cacheMethod: "none",
    });
  }
  try {
    return await ocrWorkerPromise;
  } catch (error) {
    ocrUnavailableReason = error.message || "Local handwriting recognition could not start.";
    ocrWorkerPromise = null;
    throw error;
  }
}

async function releaseOcrWorker() {
  const workerPromise = ocrWorkerPromise;
  ocrWorkerPromise = null;
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch (_) {
    // OCR may have failed to initialize; PDF and bubble scanning can still finish.
  }
}

function sampleBubble(image, width, height, centerX, centerY, radius, label) {
  const analysis = analyzeCircle(image, width, height, centerX, centerY, radius);
  const crossScore = relativeDiagonalCoverage(
    image, width, height, analysis.cx, analysis.cy, radius,
    analysis.darkThreshold,
  );
  const denseFill = analysis.fillRatio >= 0.5 || analysis.normalizedContrast >= 0.72;
  const crossed = crossScore >= 0.52 && !denseFill;
  let mark = "blank";
  let confidence = 0.9;
  if (crossed) {
    mark = "crossed";
    confidence = Math.min(0.99, 0.55 + crossScore * 0.4);
  } else if (analysis.fillRatio >= 0.28 && analysis.normalizedContrast >= 0.2) {
    mark = "shaded";
    confidence = Math.min(0.99, 0.58 + analysis.signal * 0.42);
  } else if (analysis.fillRatio >= 0.14 && analysis.normalizedContrast >= 0.1) {
    mark = "uncertain";
    confidence = 0.45;
  }
  return {
    label, mark, confidence, fillRatio: analysis.fillRatio, crossScore,
    signal: analysis.signal, centerX: analysis.cx, centerY: analysis.cy,
  };
}

function analyzeCircle(image, width, height, expectedX, expectedY, radius, searchScale = 0.32) {
  const r = Math.max(4, radius);
  const search = Math.max(1, Math.round(r * searchScale));
  const offsets = [-search, 0, search];
  let best = null;
  for (const dy of offsets) {
    for (const dx of offsets) {
      const cx = Math.round(expectedX + dx);
      const cy = Math.round(expectedY + dy);
      const ring = radialGraySamples(image, width, height, cx, cy, r, 0.78, 1.12);
      const outside = radialGraySamples(image, width, height, cx, cy, r, 1.3, 1.62);
      if (!ring.length || !outside.length) continue;
      const paper = percentile(outside, 0.75);
      const outline = percentile(ring, 0.2);
      const offsetPenalty = Math.hypot(dx, dy) / r * 0.35;
      const score = paper - outline - offsetPenalty;
      if (!best || score > best.score) best = { cx, cy, score, ring, outside };
    }
  }
  if (!best) {
    best = {
      cx: Math.round(expectedX), cy: Math.round(expectedY), score: 0,
      ring: [], outside: [],
    };
  }
  const inside = radialGraySamples(image, width, height, best.cx, best.cy, r, 0, 0.62);
  const paper = percentile(best.outside, 0.75) || 255;
  const outline = percentile(best.ring, 0.2) || Math.max(0, paper - 16);
  const outlineSpan = Math.max(2, paper - outline);
  const darkThreshold = paper - Math.max(1.5, outlineSpan * 0.28);
  const darkPixels = inside.filter((gray) => gray < darkThreshold).length;
  const fillRatio = darkPixels / Math.max(1, inside.length);
  const insideMean = inside.reduce((total, gray) => total + gray, 0) / Math.max(1, inside.length);
  const normalizedContrast = Math.max(0, Math.min(1.5, (paper - insideMean) / outlineSpan));
  const signal = Math.min(1, fillRatio * 0.72 + Math.min(1, normalizedContrast) * 0.28);
  return {
    cx: best.cx, cy: best.cy, fillRatio, normalizedContrast, signal,
    darkThreshold, paper, outline,
  };
}

function radialGraySamples(image, width, height, cx, cy, radius, innerScale, outerScale) {
  const samples = [];
  const inner = radius * innerScale;
  const outer = radius * outerScale;
  const limit = Math.ceil(outer);
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const distance = Math.hypot(dx, dy);
      if (distance < inner || distance > outer) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      samples.push(grayAt(image.data, py * width + px));
    }
  }
  return samples;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

function relativeDiagonalCoverage(image, width, height, cx, cy, radius, darkThreshold) {
  const start = Math.max(2, Math.round(radius * 0.5));
  const end = Math.round(radius * 1.5);
  let weakerDiagonal = 1;
  for (const direction of [1, -1]) {
    let hits = 0;
    let samples = 0;
    for (const sign of [-1, 1]) {
      for (let distance = start; distance <= end; distance += 1) {
        const dx = Math.round(distance / Math.sqrt(2)) * sign;
        const dy = Math.round(distance / Math.sqrt(2)) * sign * direction;
        let dark = false;
        for (let offset = -1; offset <= 1; offset += 1) {
          const px = cx + dx + offset;
          const py = cy + dy - offset * direction;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          if (grayAt(image.data, py * width + px) < darkThreshold) dark = true;
        }
        if (dark) hits += 1;
        samples += 1;
      }
    }
    weakerDiagonal = Math.min(weakerDiagonal, samples ? hits / samples : 0);
  }
  return weakerDiagonal;
}

function sampleBubbleLegacy(image, width, height, centerX, centerY, radius, label) {
  const cx = Math.round(centerX);
  const cy = Math.round(centerY);
  const r = Math.max(4, Math.round(radius));
  const backgroundSamples = [];
  let interiorPixels = 0;
  let interiorDark = 0;
  let interiorGray = 0;
  for (let dy = -Math.ceil(r * 1.65); dy <= Math.ceil(r * 1.65); dy += 1) {
    for (let dx = -Math.ceil(r * 1.65); dx <= Math.ceil(r * 1.65); dx += 1) {
      const distance = Math.hypot(dx, dy);
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const gray = grayAt(image.data, py * width + px);
      if (distance >= r * 1.2 && distance <= r * 1.55) backgroundSamples.push(gray);
      if (distance <= r * 0.68) {
        interiorPixels += 1;
        interiorGray += gray;
        if (gray < 185) interiorDark += 1;
      }
    }
  }
  const background = median(backgroundSamples) || 250;
  // Answer bubbles now contain light-gray printed letters. Keep the fill threshold
  // below that ink so an unmarked guide letter is not read as a student response.
  const darkThreshold = Math.min(180, background - 65);
  let darkAtThreshold = 0;
  let inner = 0;
  let innerDark = 0;
  for (let dy = -Math.ceil(r * 0.68); dy <= Math.ceil(r * 0.68); dy += 1) {
    for (let dx = -Math.ceil(r * 0.68); dx <= Math.ceil(r * 0.68); dx += 1) {
      if (dx * dx + dy * dy > r * r * 0.68 * 0.68) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const gray = grayAt(image.data, py * width + px);
      inner += 1;
      if (gray < darkThreshold) darkAtThreshold += 1;
      if (gray < 185) innerDark += 1;
    }
  }
  const fillRatio = inner ? darkAtThreshold / inner : 0;
  const lightAdjustedFill = inner ? innerDark / inner : 0;
  const diagonalA = diagonalCoverage(image, width, height, cx, cy, r, 1);
  const diagonalB = diagonalCoverage(image, width, height, cx, cy, r, -1);
  const crossScore = Math.min(diagonalA, diagonalB);
  const interiorContrast = background - interiorGray / Math.max(1, interiorPixels);
  const shaded = fillRatio >= 0.28 || (lightAdjustedFill >= 0.34 && interiorContrast >= 35);
  // A dense fill is dark along both diagonals too. Only classify an X when
  // diagonal strokes are present without the heavily filled centre of a
  // deliberately shaded bubble.
  const denseFill = fillRatio >= 0.5 || lightAdjustedFill >= 0.58;
  const crossed = crossScore >= 0.55 && !denseFill;
  let mark = "blank";
  let confidence = 0.9;
  if (crossed) {
    mark = "crossed";
    confidence = Math.min(0.99, 0.55 + crossScore * 0.4);
  } else if (shaded) {
    mark = "shaded";
    confidence = Math.min(0.99, 0.58 + Math.max(fillRatio, lightAdjustedFill) * 0.45);
  // The light-gray A–H glyph printed inside every answer bubble creates a
  // small contrast against the paper even when the student left it blank.
  // Contrast alone therefore cannot make a bubble uncertain; require enough
  // dark pixels to indicate a student mark (or a clear correction stroke).
  } else if (fillRatio > 0.08 || lightAdjustedFill > 0.12 || crossScore > 0.25) {
    mark = "uncertain";
    confidence = 0.45;
  }
  return { label, mark, confidence, fillRatio, crossScore };
}

function diagonalCoverage(image, width, height, cx, cy, radius, direction) {
  const start = Math.max(2, Math.round(radius * 0.55));
  const end = Math.round(radius * 1.55);
  let hits = 0;
  let samples = 0;
  for (let sign of [-1, 1]) {
    for (let distance = start; distance <= end; distance += 1) {
      const dx = Math.round(distance / Math.sqrt(2)) * sign;
      const dy = Math.round(distance / Math.sqrt(2)) * sign * direction;
      let dark = false;
      for (let offset = -1; offset <= 1; offset += 1) {
        const px = cx + dx + offset;
        const py = cy + dy - offset * direction;
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        if (grayAt(image.data, py * width + px) < 155) dark = true;
      }
      if (dark) hits += 1;
      samples += 1;
    }
  }
  return samples ? hits / samples : 0;
}

function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function resolveQuestion(question, bubbles) {
  const ranked = [...bubbles].sort((a, b) => (b.signal || 0) - (a.signal || 0));
  const top = ranked[0];
  const second = ranked[1] || { signal: 0 };
  const clearWinner = top.mark !== "crossed" && top.signal >= 0.28 &&
    top.signal - second.signal >= 0.09;
  const active = clearWinner ? [top] : bubbles.filter((bubble) => bubble.mark === "shaded");
  const crossed = bubbles.filter((bubble) => bubble.mark === "crossed");
  const uncertain = clearWinner ? [] : bubbles.filter((bubble) => bubble.mark === "uncertain");
  let response = "";
  let status = "incorrect_blank";
  let reason = "No answer bubble was shaded.";
  if (uncertain.length || active.length > 1) {
    status = "review";
    reason = active.length > 1 ? "More than one answer appears to be active." : "A mark could not be classified confidently.";
    response = active.length === 1 ? active[0].label : "";
  } else if (active.length === 1) {
    response = active[0].label;
    status = crossed.length ? "detected_corrected" : "detected";
    reason = crossed.length ? "Selected bubble detected after an X correction." : "Selected bubble detected; correctness is not graded.";
  } else if (crossed.length) {
    status = "incorrect_blank";
    reason = "All marked bubbles appear crossed out; no active answer remains.";
  }
  return { question, response, status, reason, bubbles };
}

function finishScan() {
  if (!sheetResults.length) {
    if (!pageIssues.length) {
      pageIssues.push({
        file: "Selected file",
        page: "—",
        reason: guidePagesSkipped
          ? "Only student guide pages were found; include the answer sheet page to scan responses."
          : "No pages could be scanned.",
      });
    }
  }
  renderGradeDashboardSheets(gradeDashboardData?.forms || []);
  persistScanState();
}

function renderSetAnswerKeyOptions() {
  const scanSet = scanSets.find((item) => item.id === selectedScanSetId);
  if (!scanSet) return;
  setKeySelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose answer sheet";
  setKeySelect.append(placeholder);
  for (const candidate of sheetResults.filter((result) => result.formId === scanSet.formId)) {
    const option = document.createElement("option");
    option.value = candidate.id;
    const otherSet = candidate.scanSetId !== scanSet.id ? " · another scan set" : "";
    option.textContent = `${studentNameFor(candidate)} · ${candidate.sourceFile} · page ${candidate.pageNo}${otherSet}`;
    setKeySelect.append(option);
  }
  setKeySelect.value = answerKeyByScanSet[scanSet.id] || "";
  setKeySelect.onchange = async () => {
    if (setKeySelect.value) answerKeyByScanSet[scanSet.id] = setKeySelect.value;
    else delete answerKeyByScanSet[scanSet.id];
    await persistScanState();
    renderGradeWorkspace();
  };
}

function rosterCandidates(sheet) {
  const identifiers = new Set([sheet.studentId, sheet.bubbleStudentId, sheet.writtenStudentId].filter(Boolean));
  return courseRoster.filter((learner) => identifiers.has(learner.student_id));
}

function matchedLearner(sheet) {
  const matches = rosterCandidates(sheet);
  return matches.length === 1 ? matches[0] : null;
}

function studentNameFor(sheet) {
  if (isDummyAnswerKey(sheet)) return "Answer Sheet";
  return matchedLearner(sheet)?.name || "Student not identified";
}

function isDummyAnswerKey(sheet) {
  return sheet?.studentId === "000000000" || sheet?.bubbleStudentId === "000000000" ||
    sheet?.writtenStudentId === "000000000";
}

function identitySummary(sheet) {
  const learner = matchedLearner(sheet);
  if (learner && sheet.bubbleStudentId === learner.student_id) {
    const parts = [
      `Roster identity confirmed: ${learner.name}`,
      `Nine-digit bubble ID matches SIS login: ${learner.student_id}`,
    ];
    if (sheet.bubbleIdUncertainColumns?.length) {
      parts.push(`The scan flagged faint marks in ${sheet.bubbleIdUncertainColumns.length} digit column(s), but its decoded nine-digit ID matches this roster entry`);
    }
    return parts.join(" · ");
  }
  const parts = [
    `ID bubbles: ${sheet.bubbleIdRaw || "not read"}`,
    sheet.idMatchStatus || "",
  ];
  if (learner) parts.push(`Matched SIS number: ${learner.student_id}`);
  if (!learner) parts.push("Use the enhanced scan to check the handwritten name if manual identification is needed");
  return parts.filter(Boolean).join(" · ");
}

function renderGradeWorkspace() {
  csvButton.disabled = !sheetResults.some((sheet) => sheet.scanSetId === selectedScanSetId);
  if (!selectedGradeFormId) {
    const scannedFormCount = (gradeDashboardData?.forms || []).filter((form) =>
      sheetResults.some((sheet) => sheet.formId === form.form_id)).length;
    gradeSummary.textContent = scannedFormCount
      ? `${scannedFormCount} answer sheet${scannedFormCount === 1 ? "" : "s"} have scans. Choose one to view its scan details and grades.`
      : "No scanned answer sheets saved for this course yet. Scan completed sheets to start grading.";
    return;
  }
  if (!selectedScanSetId) {
    const selectedForm = (gradeDashboardData?.forms || []).find((form) => form.form_id === selectedGradeFormId);
    const setCount = scanSets.filter((scanSet) => scanSet.formId === selectedGradeFormId).length;
    gradeSummary.textContent = `${selectedForm?.title || "Answer sheet"} · ${setCount} scan set${setCount === 1 ? "" : "s"}. Choose a scan set to view student results.`;
    return;
  }
  const scanSet = scanSets.find((item) => item.id === selectedScanSetId);
  if (!scanSet) return;
  const formSheets = sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId);
  const studentSheets = formSheets.filter((sheet) => !isDummyAnswerKey(sheet));
  const sampleMemory = formSheets.filter((sheet) => sheet.sampleExpectedAnswers).map((sheet) => {
    const check = samplePatternCheck(sheet);
    return `${check.matched}/${check.total} sample answers matched`;
  });
  const sampleNote = sampleMemory.length ? ` · ${sampleMemory.join("; ")}` : "";
  const issueNote = pageIssues.length ? ` · ${pageIssues.length} page/file issue(s) reported during scan` : "";
  if (!formSheets.length) {
    gradeSummary.textContent = `${scanSet.sourceName || "Scan set"}: no student scans.${issueNote}`;
  } else {
    const key = getGradeKeyForScan(formSheets[0]);
    const gradeCount = studentSheets.filter((sheet) => getGradeKeyForScan(sheet)).length;
    gradeSummary.textContent = `${scanSet.sourceName || "Scan set"} · ${studentSheets.length} student scan(s) · ${key ? `answer sheet: ${studentNameFor(key)} · ${gradeCount} scan(s) graded` : "choose an answer sheet above"}.${sampleNote}${issueNote}`;
  }
  renderRosterTable();
}

function getGradeKeyForScan(sheet) {
  const keyId = answerKeyByScanSet[sheet.scanSetId];
  return sheetResults.find((candidate) => candidate.id === keyId && candidate.formId === sheet.formId) || null;
}

function gradeLabelForScan(sheet) {
  const key = getGradeKeyForScan(sheet);
  if (!key) return "No answer sheet assigned";
  const grade = gradeForSheet(sheet, key);
  return `${grade.correct}/${grade.total}${grade.review ? ` · ${grade.review} review` : ""}`;
}

function renderRosterTable() {
  rosterRows.replaceChildren();
  const learnerScans = new Map(courseRoster.map((learner) => [learner.student_id, []]));
  const unidentified = [];
  for (const sheet of sheetResults) {
    if (sheet.scanSetId !== selectedScanSetId) continue;
    if (isDummyAnswerKey(sheet)) continue;
    const learner = matchedLearner(sheet);
    if (learner) learnerScans.get(learner.student_id).push(sheet);
    else unidentified.push(sheet);
  }
  if (!courseRoster.length && !unidentified.length) {
    appendRosterMessage("No active students are available from the course roster.");
    return;
  }
  for (const learner of courseRoster) {
    const scans = learnerScans.get(learner.student_id) || [];
    appendRosterRow(learner.name, learner.sis_login_id, scans.length
      ? scans.map(gradeLabelForScan).join("; ")
      : "—", scans);
  }
  for (const sheet of unidentified) {
    const candidates = rosterCandidates(sheet);
    const rosterNote = candidates.length > 1
      ? `IDs match multiple roster students: ${candidates.map((learner) => learner.name).join(", ")}`
      : !courseRoster.length ? "Course roster unavailable for cross-reference"
        : sheet.studentId ? `ID ${sheet.studentId} not on course roster` : "No confirmed roster ID";
    const idNote = [sheet.idMatchStatus, sheet.bubbleStudentId ? `Bubble ID ${sheet.bubbleStudentId}` : "Bubble ID unreadable",
      rosterNote]
      .filter(Boolean).join(" · ");
    appendRosterRow("Student not identified", idNote,
      gradeLabelForScan(sheet), [sheet]);
  }
}

function appendRosterMessage(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 3;
  cell.textContent = message;
  row.append(cell);
  rosterRows.append(row);
}

function appendRosterRow(name, sisLoginId, grade, sheetRecords = []) {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  if (sheetRecords.length) {
    const nameLink = document.createElement("a");
    nameLink.href = "#scan-preview";
    nameLink.className = "roster-student-link";
    nameLink.textContent = name;
    nameLink.setAttribute("aria-label", `Preview scanned sheet${sheetRecords.length === 1 ? "" : "s"} for ${name}`);
    nameLink.addEventListener("click", (event) => {
      event.preventDefault();
      openStudentScans(name, sheetRecords);
    });
    nameCell.append(nameLink);
  } else {
    nameCell.textContent = name;
  }
  const idCell = document.createElement("td");
  idCell.textContent = sisLoginId || "—";
  const gradeCell = document.createElement("td");
  gradeCell.textContent = grade;
  row.append(nameCell, idCell, gradeCell);
  rosterRows.append(row);
}

function openStudentScans(name, sheetRecords) {
  if (sheetRecords.length === 1) {
    openScanPreview(sheetRecords[0]);
    return;
  }
  scanPreviewTitle.textContent = `${name} · scanned sheets`;
  scanPreviewMeta.textContent = "Choose a scanned sheet to preview its detected answers.";
  previewedSheetId = "";
  resetOriginalScanPreview();
  scanPreviewContent.replaceChildren();
  for (const sheet of sheetRecords) {
    const button = document.createElement("button");
    button.className = "scan-preview-button";
    button.type = "button";
    button.textContent = `${sheet.formTitle} · ${sheet.sourceFile} · page ${sheet.pageNo}`;
    button.addEventListener("click", () => openScanPreview(sheet));
    scanPreviewContent.append(button);
  }
  scanPreviewDialog.showModal();
}

function openScanPreview(sheet) {
  resetOriginalScanPreview();
  previewedSheetId = sheet.id;
  scanPreviewTitle.textContent = `${studentNameFor(sheet)} · ${sheet.formTitle}`;
  scanPreviewMeta.textContent = `${sheet.sourceFile} · page ${sheet.pageNo} · ${identitySummary(sheet)}`;
  originalScanToggle.hidden = false;
  originalScanToggle.disabled = true;
  originalScanToggle.textContent = sheet.originalPage instanceof Blob
    ? "Preparing enhanced scan..."
    : "Original scan unavailable · rescan required";
  originalScanToggle.title = sheet.originalPage instanceof Blob
    ? "Show a contrast-restored rendering of the uploaded PDF page."
    : "This scan was saved before original-page previews were added. Scan the PDF again to save its page image.";
  if (sheet.originalPage instanceof Blob) {
    prepareReadableScanPreview(sheet).catch((error) => {
      console.warn("Could not restore stored scan contrast", error);
      if (previewedSheetId !== sheet.id) return;
      showOriginalScanBlob(sheet, sheet.originalPage);
    });
  }
  scanPreviewContent.replaceChildren();
  const answerKey = getGradeKeyForScan(sheet);
  const grading = answerKey ? gradeForSheet(sheet, answerKey) : null;
  for (const [index, answer] of sheet.answers.entries()) {
    const row = document.createElement("article");
    row.className = "scan-preview-answer";
    const question = document.createElement("strong");
    question.textContent = `Question ${answer.question}`;
    const gradedAnswer = grading?.gradedAnswers[index];
    const displayStatus = gradedAnswer?.status || answer.status;
    const choice = document.createElement("span");
    choice.className = "scan-preview-choice";
    if (gradedAnswer?.status === "correct") {
      choice.textContent = `${answer.response} · Correct`;
    } else if (gradedAnswer?.status === "incorrect") {
      choice.textContent = answer.response
        ? `${answer.response} · Incorrect (key: ${gradedAnswer.correctAnswer?.response || "blank"})`
        : `No answer · Incorrect (key: ${gradedAnswer.correctAnswer?.response || "blank"})`;
    } else if (answer.response) {
      choice.textContent = `${answer.response}${answer.status === "review" ? " · Needs review" : grading ? " · Not graded" : " · Detected"}`;
    } else {
      choice.textContent = answer.status === "incorrect_blank" ? "No answer · Incorrect" : "Needs review";
    }
    const bubbleList = document.createElement("span");
    bubbleList.className = "scan-preview-bubbles";
    for (const bubble of answer.bubbles || []) {
      const mark = document.createElement("span");
      mark.className = `scan-preview-bubble ${bubble.mark || ""}`;
      mark.textContent = bubble.label;
      bubbleList.append(mark);
    }
    row.append(question, choice, bubbleList, statusPill(displayStatus));
    const reason = gradedAnswer?.status === "correct"
      ? `Matches the answer sheet (${gradedAnswer.correctAnswer?.response || answer.response}).`
      : gradedAnswer?.status === "incorrect"
        ? `The answer sheet has ${gradedAnswer.correctAnswer?.response || "no answer"}.`
        : answer.reason;
    if (reason) {
      const detail = document.createElement("small");
      detail.textContent = reason;
      row.append(detail);
    }
    scanPreviewContent.append(row);
  }
  if (!scanPreviewDialog.open) scanPreviewDialog.showModal();
}

function showOriginalScanBlob(sheet, blob) {
  if (previewedSheetId !== sheet.id) return;
  releaseOriginalScanUrl();
  originalScanObjectUrl = URL.createObjectURL(blob);
  originalScanImage.src = originalScanObjectUrl;
  originalScanImage.alt = `Enhanced scanned page from ${sheet.sourceFile}, page ${sheet.pageNo}`;
  originalScanToggle.disabled = false;
  originalScanToggle.textContent = "View enhanced scan";
}

async function prepareReadableScanPreview(sheet) {
  if (sheet.previewContrastVersion === PREVIEW_CONTRAST_VERSION) {
    showOriginalScanBlob(sheet, sheet.originalPage);
    return;
  }
  const bitmap = await createImageBitmap(sheet.originalPage);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
  bitmap.close();
  try {
    sheet.originalPage = await createLocalPagePreview(canvas, true);
    sheet.previewContrastVersion = PREVIEW_CONTRAST_VERSION;
    await persistScanState();
    showOriginalScanBlob(sheet, sheet.originalPage);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function resetOriginalScanPreview() {
  releaseOriginalScanUrl();
  originalScanToggle.hidden = true;
  originalScanToggle.disabled = false;
  originalScanPanel.hidden = true;
  originalScanToggle.textContent = "View enhanced scan";
  originalScanImage.removeAttribute("src");
}

function releaseOriginalScanUrl() {
  if (originalScanObjectUrl) URL.revokeObjectURL(originalScanObjectUrl);
  originalScanObjectUrl = "";
}

function gradeForSheet(sheet, key) {
  if (sheet.id === key.id) {
    return {
      correct: sheet.questionCount,
      review: 0,
      total: sheet.questionCount,
      gradedAnswers: sheet.answers.map((response) => ({
        response,
        correctAnswer: response,
        status: "correct",
      })),
    };
  }
  let correct = 0;
  let review = 0;
  const gradedAnswers = [];
  for (let index = 0; index < sheet.answers.length; index += 1) {
    const response = sheet.answers[index];
    const correctAnswer = key.answers[index];
    let status = "incorrect";
    if (response.status === "review" || correctAnswer?.status === "review") {
      status = "review";
      review += 1;
    } else if (response.response && response.response === correctAnswer?.response) {
      status = "correct";
      correct += 1;
    }
    gradedAnswers.push({ response, correctAnswer, status });
  }
  return { correct, review, total: sheet.questionCount, gradedAnswers };
}

function samplePatternCheck(sheet) {
  const expected = sheet.sampleExpectedAnswers || [];
  const matched = sheet.answers.reduce((total, answer, index) =>
    total + (answer.status !== "review" && answer.response === expected[index] ? 1 : 0), 0);
  return { matched, total: expected.length };
}

function statusPill(status) {
  const pill = document.createElement("span");
  pill.className = `status-pill ${status === "correct" ? "correct" : status.startsWith("incorrect") ? "incorrect" : status === "review" ? "review" : "detected"}`;
  const labels = {
    detected: "Detected · not graded",
    detected_corrected: "Corrected · not graded",
    detected_manual: "Reviewed · not graded",
    correct: "Correct",
    incorrect: "Incorrect",
    incorrect_blank: "Incorrect · blank",
    review: "Needs review",
  };
  pill.textContent = labels[status] || status;
  return pill;
}

function downloadCsv() {
  const formSheets = sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId);
  const rows = [["student_name", "sis_login_id", "student_number", "id_bubbles", "id_match_status", "source_pdf", "page", "form_id", "form_title", "answer_key_scan", "answer_key_page", "question", "answer", "correct_answer", "grade", "sample_expected_answer", "sample_pattern_check", "status", "note"]];
  for (const sheet of formSheets) {
    const learner = matchedLearner(sheet);
    const key = getGradeKeyForScan(sheet);
    const grade = key ? gradeForSheet(sheet, key) : null;
    for (const [index, answer] of sheet.answers.entries()) {
      const item = grade?.gradedAnswers[index];
      const expectedSampleAnswer = sheet.sampleExpectedAnswers?.[index] || "";
      const sampleCheck = expectedSampleAnswer
        ? (answer.status !== "review" && answer.response === expectedSampleAnswer ? "match" : "mismatch")
        : "";
      rows.push([studentNameFor(sheet), learner?.sis_login_id || "", learner?.student_id || sheet.studentId,
        sheet.bubbleIdRaw || "", sheet.idMatchStatus || "", sheet.sourceFile, sheet.pageNo, sheet.formId, sheet.formTitle,
        key ? `${studentNameFor(key)} · ${key.sourceFile}` : "", key?.pageNo || "", answer.question,
        answer.response, item?.correctAnswer?.response || "", item?.status || "not_graded",
        expectedSampleAnswer, sampleCheck, answer.status, answer.reason]);
    }
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blobUrl = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = "print-scan-grade-grades.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function setProgress(message) {
  progressLabel.textContent = message;
  rescanProgressLabel.textContent = message;
}

async function refreshSavedBubbleIds() {
  await loadFormsManifest();
  let changed = false;
  for (const sheet of sheetResults) {
    if (!(sheet.originalPage instanceof Blob)) continue;
    let bitmap;
    let sourceCanvas;
    try {
      bitmap = await createImageBitmap(sheet.originalPage);
      sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = bitmap.width;
      sourceCanvas.height = bitmap.height;
      sourceCanvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
      const marks = findRegistrationMarks(sourceCanvas);
      if (!marks) continue;
      for (let rotation = 0; rotation < 4; rotation += 1) {
        const points = marks.map((_, index) => marks[(index + rotation) % marks.length]);
        let candidate = rectifyPage(sourceCanvas, points);
        if (!candidate) continue;
        const qr = decodeFormQr(candidate);
        let form = qr ? identifyScannedForm(qr) : null;
        if ((!form || !form.ok) && rotation === 0) {
          const design = formsById.get(sheet.formId);
          if (design) {
            form = { ok: true, design, layoutVersion: sheet.layoutVersion || 3 };
          }
        }
        if (!form?.ok || form.design.form_id !== sheet.formId || ![2, 3, 4].includes(form.layoutVersion)) {
          candidate.width = 0;
          candidate.height = 0;
          continue;
        }
        if (form.layoutVersion === 4) {
          candidate.width = 0;
          candidate.height = 0;
          candidate = rectifyPage(sourceCanvas, points, CURRENT_MARK_MARGIN);
          if (!candidate) continue;
        }
        const bubbleId = readStudentId(candidate, form.layoutVersion);
        const answers = sheet.answerReaderVersion === ANSWER_READER_VERSION
          ? sheet.answers
          : readAnswers(candidate, form.design, form.layoutVersion);
        candidate.width = 0;
        candidate.height = 0;
        const idMatch = resolveStudentId(bubbleId);
        if (sheet.bubbleStudentId !== bubbleId.studentId ||
            sheet.bubbleIdRaw !== bubbleId.raw ||
            JSON.stringify(sheet.bubbleIdUncertainColumns || []) !== JSON.stringify(bubbleId.uncertainColumns) ||
            sheet.studentId !== idMatch.studentId || sheet.idMatchStatus !== idMatch.status ||
            sheet.digitOCR || sheet.writtenStudentId || sheet.printedName || sheet.ocrError ||
            sheet.answerReaderVersion !== ANSWER_READER_VERSION ||
            JSON.stringify(sheet.answers) !== JSON.stringify(answers)) {
          sheet.bubbleStudentId = bubbleId.studentId;
          sheet.bubbleIdRaw = bubbleId.raw;
          sheet.bubbleIdUncertainColumns = bubbleId.uncertainColumns;
          sheet.writtenStudentId = "";
          sheet.digitOCR = "";
          sheet.printedName = "";
          sheet.ocrError = "";
          delete sheet.identityOcrVersion;
          sheet.answerReaderVersion = ANSWER_READER_VERSION;
          sheet.answers = answers;
          sheet.studentId = idMatch.studentId;
          sheet.idMatchStatus = idMatch.status;
          changed = true;
        }
        break;
      }
    } catch (error) {
      console.warn("Could not refresh the locally saved ID bubble reading", error);
    } finally {
      if (bitmap) bitmap.close();
      if (sourceCanvas) {
        sourceCanvas.width = 0;
        sourceCanvas.height = 0;
      }
    }
  }
  if (changed) await persistScanState();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

loadPersistedScanState().then(() => {
  if (window.location.pathname.replace(/\/$/, "").endsWith("/grade")) {
    showGradeDashboard(false).catch(showGradeLoadError);
  } else {
    renderGradeDashboardSheets([]);
    renderGradeWorkspace();
  }
});
