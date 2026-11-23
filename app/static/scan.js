import * as pdfjsLib from "./vendor/pdf.min.mjs";
import { readLegacyAnswerImage, mapLegacyPoint } from "./legacy-reader.mjs?v=113";
import { rosterCandidatesForPartialId, rosterCandidatesNearId } from "./id-roster-match.mjs?v=114";

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
const dummyZipButtonText = dummyZipButton?.textContent || "Download dummy ZIP";
const progressBox = $("#scan-progress");
const progressBar = $("#progress-bar");
const progressLabel = $("#progress-label");
const progressStageBar = $("#progress-stage-bar");
const progressStageLabel = $("#progress-stage-label");
const rescanFileInput = $("#rescan-file");
const rescanProgressBox = $("#rescan-progress");
const rescanProgressBar = $("#rescan-progress-bar");
const rescanProgressLabel = $("#rescan-progress-label");
const rescanStageBar = $("#rescan-stage-bar");
const rescanStageLabel = $("#rescan-stage-label");
const rescanResultMessage = $("#rescan-result-message");
const csvButton = $("#download-csv");
const annotatedSheetsButton = $("#download-annotated-sheets");
const backToTopButton = $("#back-to-top");
const courseRoster = [];
const setKeyField = $("#set-key-field");
const setKeySelect = $("#set-key-select");
const answerKeyRules = $("#answer-key-rules");
const answerKeyRuleList = $("#answer-key-rule-list");
const rosterRows = $("#roster-rows");
const matchingSummary = $("#matching-summary");
const resolveStudentsButton = $("#resolve-students");
const rosterSortButtons = [...document.querySelectorAll("[data-roster-sort]")];
let rosterSortKey = "name";
let rosterSortDirection = "asc";
const gradeSummary = $("#grade-summary");
const gradeRosterMessage = $("#grade-roster-message");
const gradeFormList = $("#grade-form-list");
const gradeSetList = $("#grade-set-list");
const gradeDetail = $("#grade-detail");
const studentsTab = $("#students-tab");
const analysisTab = $("#analysis-tab");
const studentsPanel = $("#students-panel");
const analysisPanel = $("#analysis-panel");
const analysisUnavailable = $("#analysis-unavailable");
const analysisContent = $("#analysis-content");
const analysisSummaryCards = $("#analysis-summary-cards");
const analysisTooltip = $("#analysis-tooltip");
const analysisPdfExport = $("#analysis-pdf-export");
const analysisSchemeSelect = $("#analysis-scheme-select");
const analysisScaleSelects = {
  score: $("#score-scale-select"), item: $("#item-scale-select"),
  discrimination: $("#discrimination-scale-select"), option: $("#option-scale-select"),
};
const analysisCharts = {
  score: $("#score-distribution-chart"), item: $("#item-correct-chart"),
  discrimination: $("#discrimination-chart"), option: $("#option-distribution-chart"),
};
const gradeBack = $("#grade-back");
const gradeSetBack = $("#grade-set-back");
const deleteScanSetButton = $("#delete-scan-set-button");
const clearWorkspaceScansButton = $("#clear-workspace-scans");
const scanPreviewDialog = $("#scan-preview-dialog");
const scanPreviewTitle = $("#scan-preview-title");
const scanPreviewMeta = $("#scan-preview-meta");
const scanPreviewContent = $("#scan-preview-content");
const scanPreviewStale = $("#scan-preview-stale");
const scanPreviewRescan = $("#scan-preview-rescan");
const scanPreviewPrevious = $("#scan-preview-previous");
const scanPreviewNext = $("#scan-preview-next");
const originalScanToggle = $("#original-scan-toggle");
const scanPreviewSaveAnswers = $("#scan-preview-save-answers");
const originalScanPanel = $("#original-scan-panel");
const originalScanDescription = $("#original-scan-description");
const originalScanImage = $("#original-scan-image");
const unidentifiedDialog = $("#unidentified-dialog");
const unidentifiedDialogTitle = $("#unidentified-dialog-title");
const unidentifiedDialogMeta = $("#unidentified-dialog-meta");
const unidentifiedRemaining = $("#unidentified-remaining");
const unidentifiedIdImage = $("#unidentified-id-image");
const unidentifiedNameImage = $("#unidentified-name-image");
const unidentifiedNameStatus = $("#unidentified-name-status");
const unidentifiedSearch = $("#unidentified-search");
const unidentifiedMatch = $("#unidentified-match");
const unidentifiedAssign = $("#unidentified-assign");
let unidentifiedDialogSheet = null;
let unidentifiedDialogNextId = "";
let unidentifiedNameObjectUrl = "";
let unidentifiedIdObjectUrl = "";
const scanDashboard = $("#scan-dashboard");
const gradeDashboard = $("#grade-dashboard");
const gradeLink = document.querySelector("[data-grade-link]");
const scanLink = document.querySelector("[data-scan-link]");
const courseKeyElement = document.querySelector("#scan-course-key");
const courseKeyData = JSON.parse(courseKeyElement?.textContent || "{}");
const runtimeElement = document.querySelector("#scan-runtime-config");
const scanRuntime = JSON.parse(runtimeElement?.textContent || "{}");
const standaloneMode = Boolean(scanRuntime.standalone);
const scanStorageKey = `${courseKeyData.issuer || "unknown"}::${courseKeyData.context_id || "unknown"}`;
const scanDatabaseName = "print-scan-grade-browser-data";
let originalScanObjectUrl = "";
let previewedSheetId = "";
const pendingPreviewAnswers = new Map();
const A4 = { width: 595.2756, height: 841.8898 };
const MARK_MARGIN = 16;
const CURRENT_MARK_MARGIN = 21;
const ANSWER_READER_VERSION = 5;
const RAW_SCAN_VERSION = 2;
const ANNOTATION_VERSION = 16;
const CURRENT_SHEET_LAYOUT_VERSION = 7;
const REGISTRATION_MARK_THRESHOLD = 160;
const MAX_PDF_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_BYTES = 256 * 1024 * 1024;
const formsById = new Map();
let genericScanTitle = "";
const standaloneRosterFile = $("#standalone-roster-file");
const standaloneRosterFileName = $("#standalone-roster-file-name");
const standaloneRosterMapping = $("#standalone-roster-mapping");
const standaloneRosterMessage = $("#standalone-roster-message");
const copyStandaloneIframe = $("#copy-standalone-iframe");
const standaloneIframeCode = $("#standalone-iframe-code");
const standaloneDummyZip = $("#standalone-dummy-zip");
const legacyScanFile = $("#legacy-scan-file");
const legacyScanButton = $("#legacy-scan-button");
const legacyFileName = $("#legacy-file-name");
const legacyProgress = $("#legacy-scan-progress");
const legacyProgressBar = $("#legacy-progress-bar");
const legacyProgressLabel = $("#legacy-progress-label");
const legacyMessage = $("#legacy-scan-message");
const legacyResults = $("#legacy-results");
const legacyKeySelect = $("#legacy-key-select");
const legacyKeySummary = $("#legacy-key-summary");
const legacyKeyAnswerPreview = $("#legacy-key-answer-preview");
const legacySummary = $("#legacy-summary");
const legacyResultRows = $("#legacy-result-rows");
const legacyCsvButton = $("#legacy-download-csv");
let legacyPages = [];
let legacyBatchName = "";
let legacyKeyPageId = "";

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value.trim()); value = ""; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function rosterHeaderScore(header, kinds) {
  const normalized = String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return kinds.some((kind) => normalized === kind || normalized.includes(kind));
}

function extractNineDigitId(value) {
  return String(value || "").match(/(?<!\d)(\d{9})(?!\d)/)?.[1] || "";
}

function rosterNamePartsFromValue(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) return { first: "", last: "" };
  if (name.includes(",")) {
    const [last, ...firstParts] = name.split(",");
    return { first: firstParts.join(",").trim(), last: last.trim() };
  }
  const parts = name.split(" ");
  return { first: parts.slice(0, -1).join(" "), last: parts.at(-1) };
}

function showStandaloneRosterMapping(rows) {
  if (!standaloneRosterMapping || !rows.length) return;
  const headers = rows[0]; const dataRows = rows.slice(1).filter((row) => row.some(Boolean));
  const suggestion = (kinds) => Math.max(0, headers.findIndex((header) => rosterHeaderScore(header, kinds)));
  const fullNameSuggestion = headers.findIndex((header) => ["fullname", "studentname", "learnername", "name"].includes(String(header || "").toLowerCase().replace(/[^a-z0-9]/g, "")));
  const fields = [["first", "First name", ["firstname", "givenname", "forename", "first"]], ["last", "Last name", ["lastname", "surname", "familyname", "last"]], ["id", "Student ID", ["studentid", "studentnumber", "sisid", "candidateid", "idnumber", "id"]]];
  standaloneRosterMapping.replaceChildren();
  const selects = {}; const mappingFields = {};
  const nameModeField = document.createElement("label"); nameModeField.className = "scan-key-field";
  nameModeField.append(document.createTextNode("Name format"));
  const nameMode = document.createElement("select"); nameMode.className = "review-select";
  nameMode.add(new Option("Separate first name and last name columns", "separate"));
  nameMode.add(new Option("One full-name column", "full"));
  nameMode.value = fullNameSuggestion >= 0 ? "full" : "separate";
  nameModeField.append(nameMode); standaloneRosterMapping.append(nameModeField);
  for (const [key, label, names] of fields) {
    const field = document.createElement("label"); field.className = "scan-key-field";
    field.append(document.createTextNode(label));
    const select = document.createElement("select"); select.className = "review-select";
    headers.forEach((header, index) => select.add(new Option(header || `Column ${index + 1}`, String(index))));
    select.value = String(suggestion(names)); selects[key] = select; mappingFields[key] = field; field.append(select); standaloneRosterMapping.append(field);
  }
  const fullNameField = document.createElement("label"); fullNameField.className = "scan-key-field";
  fullNameField.append(document.createTextNode("Full name in one column (optional)"));
  const fullNameSelect = document.createElement("select"); fullNameSelect.className = "review-select";
  fullNameSelect.add(new Option("Use separate first and last name columns", ""));
  headers.forEach((header, index) => fullNameSelect.add(new Option(header || `Column ${index + 1}`, String(index))));
  fullNameSelect.value = fullNameSuggestion >= 0 ? String(fullNameSuggestion) : "";
  selects.full = fullNameSelect; fullNameField.append(fullNameSelect); standaloneRosterMapping.append(fullNameField);
  const applyNameMode = () => {
    const useFullName = nameMode.value === "full";
    mappingFields.first.hidden = useFullName; mappingFields.last.hidden = useFullName;
    fullNameField.hidden = !useFullName;
    selects.first.disabled = useFullName; selects.last.disabled = useFullName; selects.full.disabled = !useFullName;
  };
  const nameParts = (row) => nameMode.value === "full"
    ? rosterNamePartsFromValue(row[Number(selects.full.value)])
    : { first: String(row[Number(selects.first.value)] || "").trim(), last: String(row[Number(selects.last.value)] || "").trim() };
  const preview = document.createElement("div"); preview.className = "field-help";
  const updatePreview = () => {
    const samples = dataRows.slice(0, 5).map((row) => {
      const { first, last } = nameParts(row);
      const studentId = extractNineDigitId(row[Number(selects.id.value)]);
      return `${[first, last].filter(Boolean).join(" ") || "Unnamed"} · ${studentId || "no nine-digit ID found"}`;
    });
    preview.textContent = `Preview: ${samples.join(" | ")}`;
  };
  Object.values(selects).forEach((select) => select.addEventListener("change", updatePreview));
  nameMode.addEventListener("change", () => { applyNameMode(); updatePreview(); });
  const confirm = document.createElement("button"); confirm.type = "button"; confirm.className = "primary-button roster-import-confirm"; confirm.textContent = "Confirm roster import";
  confirm.addEventListener("click", async () => {
    const duplicateIds = new Set(); const seen = new Set(); const roster = [];
    for (const row of dataRows) {
      const student_id = extractNineDigitId(row[Number(selects.id.value)]);
      if (!student_id) continue;
      if (seen.has(student_id)) { duplicateIds.add(student_id); continue; }
      seen.add(student_id);
      const { first, last } = nameParts(row);
      roster.push({ student_id, name: [first, last].filter(Boolean).join(" ") || student_id, first_name: first, last_name: last });
    }
    if (duplicateIds.size || !roster.length) {
      standaloneRosterMessage.textContent = duplicateIds.size ? `Cannot import: duplicate IDs ${[...duplicateIds].join(", ")}.` : "No nine-digit student IDs were found with this mapping.";
      standaloneRosterMessage.hidden = false; return;
    }
    courseRoster.splice(0, courseRoster.length, ...roster);
    await persistScanState();
    if (standaloneDummyZip) standaloneDummyZip.setAttribute("aria-disabled", "false");
    standaloneRosterMessage.textContent = `Imported ${roster.length} students. ${dataRows.length - roster.length} row(s) without a unique nine-digit ID were skipped.`;
    standaloneRosterMessage.hidden = false;
    renderRosterTable();
    renderLegacyResults();
  });
  applyNameMode(); updatePreview();
  standaloneRosterMapping.append(preview, confirm); standaloneRosterMapping.hidden = false;
}

standaloneRosterFile?.addEventListener("change", async () => {
  const file = standaloneRosterFile.files?.[0]; if (!file) return;
  if (standaloneRosterFileName) standaloneRosterFileName.textContent = `${file.name} · ${formatBytes(file.size)}`;
  if (file.size > 4 * 1024 * 1024) { standaloneRosterMessage.textContent = "CSV files must be 4 MB or smaller."; standaloneRosterMessage.hidden = false; return; }
  const rows = parseCsv(await file.text());
  if (rows.length < 2) { standaloneRosterMessage.textContent = "Choose a CSV with a header row and at least one student."; standaloneRosterMessage.hidden = false; return; }
  standaloneRosterMessage.hidden = true; showStandaloneRosterMapping(rows);
});

copyStandaloneIframe?.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(standaloneIframeCode.value); copyStandaloneIframe.textContent = "Iframe code copied"; }
  catch (_) { standaloneIframeCode.focus(); standaloneIframeCode.select(); document.execCommand("copy"); copyStandaloneIframe.textContent = "Iframe code copied"; }
});

standaloneDummyZip?.addEventListener("click", async (event) => {
  event.preventDefault();
  if (standaloneDummyZip.getAttribute("aria-disabled") === "true") return;
  if (!courseRoster.length || !scanRuntime.dummy_url) return;
  standaloneDummyZip.setAttribute("aria-disabled", "true");
  const originalText = standaloneDummyZip.textContent;
  standaloneDummyZip.textContent = "Generating dummy ZIP…";
  try {
    const response = await fetch(scanRuntime.dummy_url, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/zip" },
      body: JSON.stringify({ roster: courseRoster }),
    });
    if (!response.ok) throw new Error(await response.text() || "Could not generate the dummy ZIP.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = "dummy-student-sheets.zip";
    document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    standaloneRosterMessage.textContent = error.message || "Could not generate the dummy ZIP.";
    standaloneRosterMessage.hidden = false;
  } finally {
    standaloneDummyZip.setAttribute("aria-disabled", "false");
    standaloneDummyZip.textContent = originalText;
  }
});

async function initializeDummyZipForm() {
  if (!dummyZipForm) return;
  let genericLayout = null;
  try { genericLayout = JSON.parse(localStorage.getItem("print-scan-grade-generic-layout") || "null"); } catch { genericLayout = null; }
  const hasGenericLayout = Number.isInteger(Number(genericLayout?.question_count)) &&
    Number.isInteger(Number(genericLayout?.choice_count));
  if (hasGenericLayout && ![...dummyFormSelect.options].some((option) => option.value === "generic")) {
    dummyFormSelect.add(new Option(`Generic sheet · ${genericLayout.question_count} questions · ${genericLayout.choice_count} choices`, "generic"));
  }
  if (dummyZipForm.dataset.enrollmentReady === "true") return;
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    const response = await fetch("/scan/dummy-forms.json", {
      headers: { Accept: "application/json" }, credentials: "same-origin", signal: controller.signal,
    });
    window.clearTimeout(timeout);
    const options = await response.json();
    if (!response.ok) throw new Error(options.error || "Could not load saved answer sheets.");
    const existingFormIds = new Set([...dummyFormSelect.options].map((option) => option.value));
    if (!existingFormIds.size || (existingFormIds.size === 1 && !dummyFormSelect.value)) {
      dummyFormSelect.replaceChildren();
      for (const form of options.forms) {
        const option = document.createElement("option");
        option.value = form.form_id;
        option.textContent = form.title;
        dummyFormSelect.append(option);
      }
    }
    if (hasGenericLayout && ![...dummyFormSelect.options].some((option) => option.value === "generic")) {
      dummyFormSelect.add(new Option(`Generic sheet · ${genericLayout.question_count} questions · ${genericLayout.choice_count} choices`, "generic"));
    }
    if (!options.forms.length && !genericLayout) {
      dummyFormSelect.add(new Option("No answer sheets available", ""));
      dummyStudentLimit.textContent = "Create or download an answer sheet in Print first.";
      return;
    }
  } catch (error) {
    dummyFormSelect.replaceChildren(new Option("Answer sheets unavailable", ""));
    dummyStudentLimit.textContent = "Saved answer sheets could not be loaded.";
    dummyZipError.textContent = error.name === "AbortError"
      ? "Saved answer sheets did not respond within 10 seconds. Reload the course page and try again."
      : (error.message || "Could not load saved answer sheets.");
    dummyZipError.hidden = false;
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    const response = await fetch("/scan/dummy-options.json", {
      headers: { Accept: "application/json" }, credentials: "same-origin", signal: controller.signal,
    });
    window.clearTimeout(timeout);
    const options = await response.json();
    if (!response.ok) throw new Error(options.error || "Could not load course enrollment.");
    if (options.student_count < 1) {
      dummyStudentLimit.textContent = "No enrolled students were found for this course.";
      return;
    }
    dummyStudentCount.max = String(options.student_count);
    dummyStudentCount.value = String(Math.min(options.student_count, 5));
    dummyStudentLimit.textContent = options.synthetic_student_ids
      ? `Choose from 1 to ${options.student_count} students. Missing student IDs will use generated test IDs.`
      : `Choose from 1 to ${options.student_count} enrolled students.`;
    dummyStudentCount.disabled = false;
    dummyZipButton.disabled = false;
  } catch (error) {
    dummyStudentLimit.textContent = "Course enrollment could not be loaded.";
    dummyZipError.textContent = error.name === "AbortError"
      ? "Course roster lookup took more than 20 seconds. Reload and try again."
      : (error.message || "Could not load course enrollment.");
    dummyZipError.hidden = false;
  }
}

function setDummyZipDownloadState(preparing) {
  if (!dummyZipButton) return;
  dummyZipButton.disabled = preparing;
  dummyZipButton.classList.toggle("is-loading", preparing);
  dummyZipButton.setAttribute("aria-busy", String(preparing));
  dummyZipButton.textContent = preparing ? "Preparing dummy ZIP…" : dummyZipButtonText;
}

function downloadFilename(response) {
  const header = response.headers.get("Content-Disposition") || "";
  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] || "dummy-student-sheets.zip";
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
  setDummyZipDownloadState(true);
  try {
    let url = `/scan/${encodeURIComponent(formId)}/dummy.zip?count=${count}` +
      `&scanner_layout_version=${CURRENT_SHEET_LAYOUT_VERSION}`;
    if (formId === "generic") {
      const layout = JSON.parse(localStorage.getItem("print-scan-grade-generic-layout") || "null");
      url += `&question_count=${encodeURIComponent(layout.question_count)}&choice_count=${encodeURIComponent(layout.choice_count)}`;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => setDummyZipDownloadState(false), 2500);
  } catch (error) {
    dummyZipError.textContent = error.message || "Could not create the dummy ZIP.";
    dummyZipError.hidden = false;
    setDummyZipDownloadState(false);
  }
});

initializeDummyZipForm();

let sheetResults = [];
let pageIssues = [];
let guidePagesSkipped = 0;
let scanSets = [];
let answerKeyByScanSet = {};
let answerRulesByScanSet = {};
let answerRulesByAnswerKey = {};
let questionDiscountsByScanSet = {};
let analysisConfigByForm = {};
let manualStudentMatches = {};

function hasActiveGradingWork() {
  return sheetResults.length > 0 || Object.keys(answerKeyByScanSet).length > 0 ||
    Object.keys(answerRulesByAnswerKey).length > 0 || Object.keys(questionDiscountsByScanSet).length > 0;
}

window.addEventListener("beforeunload", (event) => {
  // A refresh interrupts review, and can cause users to lose track of the
  // answer-key and multiple-answer rules currently applied to their grades.
  if (!hasActiveGradingWork()) return;
  event.preventDefault();
  event.returnValue = "";
});
const DEFAULT_ANALYSIS_CLASSES = { first: 70, upperSecond: 60, lowerSecond: 50, third: 40, compensatory: 35 };
const DEFAULT_MASTERS_CLASSES = { scheme: "masters", first: 70, upperSecond: 60, lowerSecond: 50, third: 0, compensatory: 0 };
let gradeDetailTab = "students";
const analysisScaleState = { score: "fit", item: "fit", discrimination: "fit", option: "fit" };
let gradeDashboardData = null;
let selectedGradeFormId = "";
let selectedScanSetId = "";
let rescanTargetScanSetId = "";
let scanInProgress = false;
let formsManifestLoaded = false;
let persistenceReady = false;
let persistenceWarning = "";
let persistenceLoadPromise = null;
let persistenceSaveQueue = Promise.resolve();
let formsManifestPromise = null;
let annotationRefreshPromise = null;
let pendingUnidentifiedFocusId = "";

function updateBackToTopVisibility() {
  if (!backToTopButton) return;
  backToTopButton.hidden = window.scrollY < 520;
}

backToTopButton?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
updateBackToTopVisibility();

async function loadFormsManifest() {
  if (formsManifestLoaded) return;
  if (formsManifestPromise) return formsManifestPromise;
  formsManifestPromise = (async () => {
    const response = await fetch(scanRuntime.forms_url || "/scan/forms.json", {
      headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store"
    });
    if (!response.ok) throw new Error("Saved sheet settings could not be loaded. Reopen the app from the course and try again.");
    const manifest = await response.json();
    formsById.clear();
    for (const form of manifest) {
      formsById.set(form.form_id.toLowerCase(), form);
      for (const acceptedFormId of form.accepted_form_ids || []) {
        formsById.set(String(acceptedFormId).toLowerCase(), form);
      }
    }
    formsManifestLoaded = true;
  })().catch((error) => {
    formsManifestPromise = null;
    throw error;
  });
  return formsManifestPromise;
}

function openScanDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(scanDatabaseName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("courses")) db.createObjectStore("courses", { keyPath: "key" });
      if (!db.objectStoreNames.contains("scan-sheets")) {
        const sheets = db.createObjectStore("scan-sheets", { keyPath: "key" });
        sheets.createIndex("courseKey", "courseKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Browser storage could not be opened."));
  });
}

function sheetStorageKey(sheetId) {
  return `${scanStorageKey}::${sheetId}`;
}

async function loadPersistedScanState() {
  if (persistenceReady) return;
  if (persistenceLoadPromise) return persistenceLoadPromise;
  persistenceLoadPromise = loadPersistedScanStateOnce();
  return persistenceLoadPromise;
}

async function loadPersistedScanStateOnce() {
  let migrateLegacyState = false;
  try {
    const db = await openScanDatabase();
    const { state, storedSheets } = await new Promise((resolve, reject) => {
      const transaction = db.transaction(["courses", "scan-sheets"], "readonly");
      const stateRequest = transaction.objectStore("courses").get(scanStorageKey);
      const sheetsRequest = transaction.objectStore("scan-sheets").index("courseKey").getAll(scanStorageKey);
      let savedState = null;
      let savedSheets = [];
      stateRequest.onsuccess = () => { savedState = stateRequest.result?.state || null; };
      sheetsRequest.onsuccess = () => { savedSheets = sheetsRequest.result || []; };
      transaction.oncomplete = () => resolve({ state: savedState, storedSheets: savedSheets });
      transaction.onerror = () => reject(transaction.error || new Error("Saved scan data could not be read."));
      transaction.onabort = () => reject(transaction.error || new Error("Saved scan data could not be read."));
    });
    db.close();
    if (state && (state.version === 1 || state.version === 2)) {
      migrateLegacyState = state.version === 1;
      const savedResults = state.version === 2
        ? storedSheets.map((record) => record.sheet).filter(Boolean)
        : Array.isArray(state.sheetResults) ? state.sheetResults : [];
      sheetResults.splice(0, sheetResults.length, ...savedResults);
      pageIssues.splice(0, pageIssues.length, ...(Array.isArray(state.pageIssues) ? state.pageIssues : []));
      guidePagesSkipped = Number(state.guidePagesSkipped || 0);
      scanSets = Array.isArray(state.scanSets) ? state.scanSets : [];
      answerKeyByScanSet = state.answerKeyByScanSet && typeof state.answerKeyByScanSet === "object"
        ? state.answerKeyByScanSet : {};
      answerRulesByScanSet = state.answerRulesByScanSet && typeof state.answerRulesByScanSet === "object"
        ? state.answerRulesByScanSet : {};
      answerRulesByAnswerKey = state.answerRulesByAnswerKey && typeof state.answerRulesByAnswerKey === "object"
        ? state.answerRulesByAnswerKey : {};
      questionDiscountsByScanSet = state.questionDiscountsByScanSet && typeof state.questionDiscountsByScanSet === "object"
        ? state.questionDiscountsByScanSet : {};
      analysisConfigByForm = state.analysisConfigByForm && typeof state.analysisConfigByForm === "object"
        ? state.analysisConfigByForm : {};
      manualStudentMatches = state.manualStudentMatches && typeof state.manualStudentMatches === "object"
        ? state.manualStudentMatches : {};
      if (standaloneMode && Array.isArray(state.standaloneRoster)) {
        courseRoster.splice(0, courseRoster.length, ...state.standaloneRoster);
        if (standaloneDummyZip && courseRoster.length) standaloneDummyZip.setAttribute("aria-disabled", "false");
      }
      if (standaloneMode) {
        legacyPages = Array.isArray(state.legacyPages) ? state.legacyPages : [];
        legacyBatchName = String(state.legacyBatchName || "");
        legacyKeyPageId = String(state.legacyKeyPageId || "");
      }
      const legacyKeyByScan = state.gradeKeyByScan && typeof state.gradeKeyByScan === "object"
        ? state.gradeKeyByScan : {};
      for (const [index, sheet] of sheetResults.entries()) {
        if (!sheet.id) sheet.id = `sheet-${index + 1}`;
        sheet.studentId ||= "";
        if (sheet.manualStudentId && !manualStudentMatches[sheet.id]) {
          manualStudentMatches[sheet.id] = {
            student_id: sheet.manualStudentId,
            name: sheet.manualStudentName || "",
            sis_login_id: sheet.manualStudentSisLoginId || "",
          };
        }
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
      for (const scanSet of scanSets) {
        const keyId = answerKeyByScanSet[scanSet.id];
        const legacyRules = answerRulesByScanSet[scanSet.id];
        if (keyId && legacyRules && !answerRulesByAnswerKey[keyId] &&
            Object.values(legacyRules).every((rule) => rule === "all" || rule === "any")) {
          answerRulesByAnswerKey[keyId] = { ...legacyRules };
        }
      }
    }
    persistenceReady = true;
    if (migrateLegacyState) await persistScanState();
    if (standaloneMode) renderLegacyResults();
  } catch (error) {
    persistenceWarning = "Browser storage is unavailable; scan results will last only until this page is closed.";
    persistenceReady = true;
    console.warn("Could not load saved scan results", error);
  }
}

function persistScanState() {
  if (!persistenceReady) return Promise.resolve(false);
  // IndexedDB transactions complete asynchronously. Serializing saves stops a
  // slow, old snapshot overwriting newer annotated-page blobs.
  const save = persistenceSaveQueue.catch(() => {}).then(async () => {
    let db;
    try {
      db = await openScanDatabase();
      for (const [index, sheet] of sheetResults.entries()) {
        if (!sheet.id) sheet.id = `sheet-${index + 1}`;
      }
      const sheets = [...sheetResults].filter((sheet) => sheet?.id);
      const state = {
        version: 2,
        scanSets,
        pageIssues,
        guidePagesSkipped,
        answerKeyByScanSet,
        answerRulesByScanSet,
        answerRulesByAnswerKey,
        standaloneRoster: standaloneMode ? courseRoster : undefined,
        legacyPages: standaloneMode ? legacyPages : undefined,
        legacyBatchName: standaloneMode ? legacyBatchName : undefined,
        legacyKeyPageId: standaloneMode ? legacyKeyPageId : undefined,
        questionDiscountsByScanSet,
        analysisConfigByForm,
        manualStudentMatches,
        savedAt: Date.now(),
      };
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(["courses", "scan-sheets"], "readwrite");
        const courseStore = transaction.objectStore("courses");
        const sheetStore = transaction.objectStore("scan-sheets");
        const existingKeys = sheetStore.index("courseKey").getAllKeys(scanStorageKey);
        existingKeys.onsuccess = () => {
          const currentKeys = new Set(sheets.map((sheet) => sheetStorageKey(sheet.id)));
          for (const key of existingKeys.result || []) {
            if (!currentKeys.has(key)) sheetStore.delete(key);
          }
          for (const sheet of sheets) {
            sheetStore.put({ key: sheetStorageKey(sheet.id), courseKey: scanStorageKey, sheet });
          }
          courseStore.put({ key: scanStorageKey, state });
        };
        existingKeys.onerror = () => reject(existingKeys.error || new Error("Saved scan data could not be written."));
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Saved scan data could not be written."));
        transaction.onabort = () => reject(transaction.error || new Error("Saved scan data could not be written."));
      });
      persistenceWarning = "";
      return true;
    } catch (error) {
      persistenceWarning = "Browser storage could not save scan results; keep this page open until results are exported.";
      console.warn("Could not save scan results", error);
      return false;
    } finally {
      db?.close();
    }
  });
  persistenceSaveQueue = save;
  return save;
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
  if (standaloneMode ? new URLSearchParams(window.location.search).get("view") === "grade" : window.location.pathname.replace(/\/$/, "").endsWith("/grade")) {
    showGradeDashboard(false).catch((error) => showGradeLoadError(error));
  } else {
    showScanDashboard(false);
  }
});

async function showGradeDashboard(pushHistory) {
  await loadPersistedScanState();
  if (!gradeDashboardData) {
    gradeSummary.textContent = "Loading the course roster and saved sheets…";
    const response = await fetch(scanRuntime.grade_url || "/grade?format=json", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`Grade dashboard could not load (${response.status}). Reopen the app from the course and try again.`);
    gradeDashboardData = await response.json();
    if (!standaloneMode) courseRoster.splice(0, courseRoster.length, ...(gradeDashboardData.roster || []));
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
  if (pushHistory) window.history.pushState({}, "", scanRuntime.grade_path || "/grade");
  window.scrollTo(0, 0);
}

function refreshSavedAnnotationsInBackground(sheetIds = null) {
  if (sheetIds) {
    return refreshSavedAnnotations(sheetIds)
      .catch((error) => console.warn("Saved raw scan annotations could not be refreshed", error));
  }
  if (annotationRefreshPromise) return annotationRefreshPromise;
  annotationRefreshPromise = refreshSavedAnnotations()
    .catch((error) => console.warn("Saved raw scan annotations could not be refreshed", error))
    .finally(() => { annotationRefreshPromise = null; });
  return annotationRefreshPromise;
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
  if (pushHistory) window.history.pushState({}, "", scanRuntime.scan_url || "/scan");
  window.scrollTo(0, 0);
}

function updatePhaseNavigation(activePhase) {
  document.querySelectorAll(".phase-nav a").forEach((link) => {
    const active = activePhase === "grade" ? link === gradeLink : link === scanLink;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function renderGradeDashboardSheets(forms) {
  gradeFormList.replaceChildren();
  const scannedIds = new Set(scanSets.map((scanSet) => scanSet.formId));
  const scannedForms = forms.filter((form) => scannedIds.has(form.form_id));
  for (const sheet of sheetResults) {
    if (sheet.generic && !scannedForms.some((form) => form.form_id === sheet.formId)) {
      scannedForms.push({ form_id: sheet.formId, title: sheet.formTitle,
        question_count: sheet.questionCount, choice_count: sheet.choiceCount, generic: true });
    }
  }
  if (!scannedForms.length) {
    const empty = document.createElement("div");
    empty.className = pageIssues.length ? "scan-errors" : "field-help";
    const message = document.createElement("p");
    message.textContent = pageIssues.length
      ? `No answer sheets were identified in saved scan data. ${pageIssues.length} file or page issue(s) need attention.`
      : "No scanned answer sheets saved for this course yet. Scan completed sheets to review their circles.";
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
clearWorkspaceScansButton?.addEventListener("click", clearWorkspaceScans);

async function clearWorkspaceScans() {
  if (scanInProgress) return;
  await loadPersistedScanState();
  const count = sheetResults.length + legacyPages.length;
  if (!count && !scanSets.length) return;
  const label = courseKeyData.course_title || "this workspace";
  if (!window.confirm(`Delete all ${count} saved scan page${count === 1 ? "" : "s"} in ${label}?\n\n` +
      "This also removes answer-key scans, saved grades, and manual answer edits. " +
      "The answer-sheet design and imported roster will be kept.")) return;
  if (annotationRefreshPromise) await annotationRefreshPromise;
  sheetResults = [];
  scanSets = [];
  legacyPages = [];
  legacyBatchName = "";
  legacyKeyPageId = "";
  pageIssues = [];
  guidePagesSkipped = 0;
  answerKeyByScanSet = {};
  answerRulesByScanSet = {};
  answerRulesByAnswerKey = {};
  questionDiscountsByScanSet = {};
  manualStudentMatches = {};
  selectedGradeFormId = "";
  selectedScanSetId = "";
  rescanTargetScanSetId = "";
  if (scanPreviewDialog.open) scanPreviewDialog.close();
  if (!await persistScanState()) {
    window.alert("The browser could not save this deletion. Reload the page and try again.");
    return;
  }
  renderLegacyResults();
  gradeDetail.hidden = true;
  gradeSetList.hidden = true;
  gradeFormList.hidden = false;
  renderGradeDashboardSheets(gradeDashboardData?.forms || []);
  renderGradeWorkspace();
}

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
  for (const sheetId of removedIds) delete manualStudentMatches[sheetId];
  scanSets = scanSets.filter((item) => item.id !== scanSetId);
  delete answerKeyByScanSet[scanSetId];
  delete answerRulesByScanSet[scanSetId];
  delete questionDiscountsByScanSet[scanSetId];
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
scanPreviewPrevious?.addEventListener("click", () => moveScanPreview(-1));
scanPreviewNext?.addEventListener("click", () => moveScanPreview(1));
originalScanToggle.addEventListener("click", () => {
  originalScanPanel.hidden = !originalScanPanel.hidden;
  const sheet = sheetResults.find((item) => item.id === previewedSheetId);
  originalScanToggle.textContent = originalScanPanel.hidden
    ? (isStaleStandaloneScan(sheet) ? "View old faded preview" : "View raw annotated scan")
    : "Hide scan preview";
});
scanPreviewRescan?.addEventListener("click", () => {
  const sheet = sheetResults.find((item) => item.id === previewedSheetId);
  if (!sheet?.scanSetId) return;
  scanPreviewDialog.close();
  gradeDetail.hidden = true;
  gradeSetList.hidden = false;
  renderScanSetList();
  chooseRescanFile(sheet.scanSetId);
});
scanPreviewSaveAnswers?.addEventListener("click", savePendingPreviewAnswers);
scanPreviewDialog.addEventListener("close", () => {
  pendingPreviewAnswers.clear();
  if (scanPreviewSaveAnswers) scanPreviewSaveAnswers.hidden = true;
  resetOriginalScanPreview();
});
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
annotatedSheetsButton?.addEventListener("click", downloadAnnotatedSheets);

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
    rescanStageBar.removeAttribute("value");
    rescanStageLabel.textContent = "Preparing";
  } else {
    scanButton.disabled = true;
    progressBox.hidden = false;
    progressBar.value = 0;
    progressBar.max = 1;
    progressStageBar.removeAttribute("value");
    progressStageLabel.textContent = "Preparing";
  }
  setProgress(fileType === "pdf" ? "Preparing PDF…" : fileType === "zip" ? "Opening ZIP…" : "Checking file…");

  try {
    if (annotationRefreshPromise) {
      setProgress("Finishing saved scan refresh…");
      await annotationRefreshPromise;
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
        loadingTask = pdfjsLib.getDocument({ data: standaloneMode ? bytes.slice() : bytes,
          isEvalSupported: false, useWorkerFetch: false });
        pdf = await loadingTask.promise;
        if (!isRescan) progressBar.max += Math.max(0, pdf.numPages - 1);
        else rescanProgressBar.max += Math.max(0, pdf.numPages - 1);
        // A downloaded batch normally contains one form repeated for every
        // student. Keep a cheap QR fingerprint so only the first page needs
        // full QR decoding; a changed, rotated, or skewed page falls back.
        const qrCache = {};
        let renderedPages = null;
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
          const pageProgress = fileIndex + pageNo - 1;
          if (isRescan) rescanProgressBar.value = pageProgress;
          else progressBar.value = pageProgress;
          setStageProgress("Rendering and analyzing page");
          setProgress(`Scanning ${entry.name} · page ${pageNo} of ${pdf.numPages}`);
          try {
            if (standaloneMode && (pageNo - 1) % 25 === 0) {
              const lastPage = Math.min(pdf.numPages, pageNo + 24);
              setStageProgress(`Rendering pages ${pageNo}–${lastPage}`);
              renderedPages = await loadFaithfulScanPages(bytes, pageNo, lastPage);
            }
            const renderedPage = renderedPages?.file(`${pageNo}.png`);
            if (standaloneMode && !renderedPage) throw new Error("The rendered page is missing from the scan batch.");
            let result;
            try {
              result = await scanPage(pdf, pageNo, entry.name, qrCache, renderedPage);
            } catch (error) {
              if (!standaloneMode || !/registration marks|QR code/.test(error.message || "")) throw error;
              // Small QR modules on photocopies can decode at one raster size
              // but not another. Only retry a page whose alignment failed.
              setStageProgress("Retrying page at alternate resolution");
              const alternate = await loadFaithfulScanPages(bytes, pageNo, pageNo, 1400);
              result = await scanPage(pdf, pageNo, entry.name, qrCache, alternate.file(`${pageNo}.png`));
            }
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
          if (isRescan) rescanProgressBar.value += 1;
          else progressBar.value += 1;
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
      if (isRescan) rescanProgressBar.value = Math.max(rescanProgressBar.value, fileIndex + 1);
      else progressBar.value = Math.max(progressBar.value, fileIndex + 1);
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
      delete answerRulesByScanSet[targetScanSet.id];
      delete questionDiscountsByScanSet[targetScanSet.id];
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
  scanButton.disabled = true;
  finishScan();
  setProgress("Saving scan results…");
  setStageProgress("Writing results to this browser");
  await persistScanState();
  setProgress("Loading course roster and grades…");
  setStageProgress("Waiting for course roster");
  await showGradeDashboard(true).catch(showGradeLoadError);
  progressBox.hidden = true;
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

// The legacy Liverpool form has no QR code. Its A4 artwork uses a fixed,
// four-column 120 × 5 answer grid and a separate 9-column student-number grid.
// Render each PDF page to the form's reference dimensions and sample the
// printed response locations directly; the normal QR/form scanner is untouched.
legacyScanFile?.addEventListener("change", () => {
  const file = legacyScanFile.files?.[0];
  legacyFileName.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "PDF pages are read locally and saved in this browser.";
  legacyScanButton.disabled = !file;
});
legacyScanButton?.addEventListener("click", () => scanLegacyFile());
legacyKeySelect?.addEventListener("change", async () => {
  legacyKeyPageId = legacyKeySelect.value;
  await persistScanState();
  renderLegacyResults();
});
legacyCsvButton?.addEventListener("click", downloadLegacyCsv);

async function scanLegacyFile(file = legacyScanFile?.files?.[0]) {
  if (!file || scanInProgress) return;
  const fileType = getScanFileType(file);
  if (!fileType) return showLegacyMessage("Choose a PDF or ZIP containing legacy answer-sheet PDFs.");
  if (fileType === "zip" && file.size > MAX_ZIP_BYTES) return showLegacyMessage(`This ZIP is larger than the ${formatBytes(MAX_ZIP_BYTES)} browser limit.`);
  scanInProgress = true;
  legacyScanButton.disabled = true;
  legacyProgress.hidden = false;
  legacyProgressLabel.textContent = "Opening legacy sheets…";
  legacyMessage.hidden = true;
  legacyProgressBar.value = 0;
  legacyProgressBar.max = 1;
  const pages = [];
  const issues = [];
  try {
    let entries;
    if (fileType === "pdf") {
      entries = [{ name: file.name, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }];
    } else {
      const zip = await window.JSZip.loadAsync(file, { checkCRC32: false, createFolders: false });
      entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".pdf"))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => ({ name: entry.name, size: entry._data?.uncompressedSize || 0, read: () => entry.async("uint8array") }));
      if (!entries.length) throw new Error("No PDF files were found in this ZIP.");
    }
    let totalPages = 0;
    const documents = [];
    for (const entry of entries) {
      if (entry.size > MAX_PDF_BYTES) { issues.push(`${entry.name}: file exceeds ${formatBytes(MAX_PDF_BYTES)}`); continue; }
      const bytes = await entry.read();
      if (!hasPdfHeader(bytes)) { issues.push(`${entry.name}: not a readable PDF`); continue; }
      const loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false });
      const pdf = await loadingTask.promise;
      documents.push({ name: entry.name, pdf, loadingTask });
      totalPages += pdf.numPages;
    }
    if (!totalPages) throw new Error(issues[0] || "No readable PDF pages were found.");
    legacyProgressBar.max = totalPages;
    let done = 0;
    for (const document of documents) {
      for (let pageNo = 1; pageNo <= document.pdf.numPages; pageNo += 1) {
        done += 1;
        legacyProgressBar.value = done;
        legacyProgressLabel.textContent = `Reading ${document.name} · page ${pageNo} of ${document.pdf.numPages}`;
        try {
          const record = await readLegacyPage(document.pdf, pageNo, document.name);
          pages.push(record);
        } catch (error) {
          issues.push(`${document.name} · page ${pageNo}: ${error.message || "page could not be read"}`);
        }
      }
      await document.loadingTask.destroy().catch(() => {});
    }
    if (!pages.length) throw new Error(issues[0] || "No legacy answer sheets could be read.");
    legacyPages = pages;
    legacyBatchName = file.name;
    legacyKeyPageId = "";
    await persistScanState();
    renderLegacyResults();
    showLegacyMessage(`Read ${pages.length} page${pages.length === 1 ? "" : "s"}.${issues.length ? ` ${issues.length} page/file issue(s): ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? "…" : ""}` : ""}`, Boolean(issues.length));
  } catch (error) {
    showLegacyMessage(error.message || "The legacy scan could not be processed.");
  } finally {
    scanInProgress = false;
    legacyProgress.hidden = true;
    legacyScanButton.disabled = !legacyScanFile?.files?.length;
    if (legacyScanFile) legacyScanFile.value = "";
  }
}

async function readLegacyPage(pdf, pageNo, sourceFile) {
  const page = await pdf.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = 703 / base.width;
  const viewport = page.getViewport({ scale });
  if (Math.abs(viewport.width / viewport.height - 704 / 996) > 0.015) {
    page.cleanup();
    throw new Error("Expected an upright A4 portrait page.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: context, viewport }).promise;
  page.cleanup();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { answers, questionCount, frame } = readLegacyAnswerImage(image);
  const idXs = Array.from({ length: 9 }, (_, column) => 517 + column * 16.8);
  const idYs = Array.from({ length: 10 }, (_, row) => 137 + row * 13.0);
  let studentId = "";
  let partialId = "";
  const uncertainColumns = [];
  for (let column = 0; column < 9; column += 1) {
    const signals = idYs.map((y, digit) => {
      const point = mapLegacyPoint(frame, idXs[column], y);
      const analysis = analyzeCircle(image, canvas.width, canvas.height, point.x, point.y, 3.9, 0.12);
      return { digit, fill: analysis.fillRatio, contrast: analysis.normalizedContrast };
    });
    const marked = signals.filter((signal) => signal.fill >= 0.25 && signal.contrast >= 0.15);
    const strongest = [...signals].sort((a, b) => b.fill - a.fill)[0];
    if (marked.length === 1) partialId += String(marked[0].digit);
    else {
      partialId += "?";
      if (marked.length > 1 || strongest.fill >= 0.14) uncertainColumns.push(column + 1);
    }
  }
  if (!partialId.includes("?") && /^\d{9}$/.test(partialId)) studentId = partialId;
  const rawPage = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  canvas.width = 0;
  canvas.height = 0;
  if (!rawPage) throw new Error("Could not save the local page preview.");
  return { id: globalThis.crypto?.randomUUID?.() || `legacy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sourceFile, pageNo, answers, questionCount, readerVersion: 2, studentId, partialId, uncertainColumns, rawPage };
}

function showLegacyMessage(message, issue = false) {
  if (!legacyMessage) return;
  legacyMessage.textContent = message;
  legacyMessage.hidden = false;
  legacyMessage.classList.toggle("legacy-scan-warning", issue);
}

function legacyKeyInfo(key) {
  const count = Number(key?.questionCount);
  const ready = key?.readerVersion === 2 && Number.isInteger(count) && count > 0 && count <= 120 &&
    key.answers?.length === 120 && key.answers.slice(0, count).every((answer) => answer.selected.length === 1);
  return { count: ready ? count : 0, ready };
}

function legacyScore(student, key, count) {
  return student.answers.slice(0, count).reduce((sum, answer, index) =>
    sum + (answer.selected.length === 1 && answer.selected[0] === key.answers[index].selected[0] ? 1 : 0), 0);
}

function renderLegacyResults() {
  if (!legacyResults || !legacyKeySelect || !legacyResultRows) return;
  legacyResults.hidden = !legacyPages.length;
  legacyKeySelect.replaceChildren();
  for (const page of legacyPages) {
    const label = `${page.sourceFile} · page ${page.pageNo}${page.studentId ? ` · ${page.studentId}` : ""}`;
    legacyKeySelect.add(new Option(label, page.id));
  }
  if (legacyPages.length) {
    if (!legacyPages.some((page) => page.id === legacyKeyPageId)) legacyKeyPageId = legacyPages[0].id;
    legacyKeySelect.value = legacyKeyPageId;
  }
  const key = legacyPages.find((page) => page.id === legacyKeyPageId);
  const { count, ready: keyReady } = legacyKeyInfo(key);
  const keyFlags = key?.answers?.slice(0, count || 120).filter((answer) => answer.status !== "marked").length || 0;
  legacyKeySummary.textContent = `Preview master answers · ${count || "?"} test questions · ${keyFlags} item${keyFlags === 1 ? "" : "s"} to check`;
  legacyKeyAnswerPreview.textContent = key?.answers?.map((answer) => `${answer.question}:${answer.selected.join("") || (answer.status === "uncertain" ? "?" : "–")}`).join(" · ") || "";
  const students = legacyPages.filter((page) => page.id !== legacyKeyPageId);
  legacySummary.textContent = `${legacyBatchName || "Legacy batch"} · ${students.length} student page${students.length === 1 ? "" : "s"}${keyReady ? ` · ${count}-question key complete` : key?.readerVersion !== 2 ? " · rescan with updated reader" : " · key needs review"}`;
  legacyResultRows.replaceChildren();
  for (const student of students) {
    const learner = courseRoster.find((item) => item.student_id === student.studentId);
    const score = keyReady ? legacyScore(student, key, count) : null;
    const flags = student.answers.slice(0, count || 120).filter((answer) => answer.status === "multiple" || answer.status === "uncertain").length;
    const tr = document.createElement("tr");
    const pageCell = document.createElement("th"); pageCell.scope = "row"; pageCell.textContent = `${student.sourceFile} · ${student.pageNo}`;
    const nameCell = document.createElement("td");
    if (courseRoster.length) {
      const select = document.createElement("select"); select.className = "review-select legacy-roster-select";
      select.add(new Option(learner ? rosterDisplayName(learner) : "Assign from roster…", ""));
      for (const person of courseRoster) select.add(new Option(rosterDisplayName(person), person.student_id));
      select.value = learner?.student_id || "";
      select.addEventListener("change", async () => { student.studentId = select.value; student.partialId = select.value || student.partialId; await persistScanState(); renderLegacyResults(); });
      nameCell.append(select);
    } else nameCell.textContent = learner ? rosterDisplayName(learner) : "Roster not imported";
    const idCell = document.createElement("td"); idCell.textContent = student.studentId || student.partialId || "Not read";
    const scoreCell = document.createElement("td"); scoreCell.textContent = score === null ? "Key incomplete" : `${score}/${count} (${(score / count * 100).toFixed(1)}%)`;
    const answerCell = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary"); summary.textContent = `${flags} answer flag${flags === 1 ? "" : "s"} · view answers`;
    const answerText = document.createElement("small"); answerText.className = "legacy-answer-preview";
    answerText.textContent = student.answers.slice(0, count || 120).map((answer) => `${answer.question}:${answer.selected.join("") || (answer.status === "uncertain" ? "?" : "–")}`).join(" · ");
    details.append(summary, answerText); answerCell.append(details);
    tr.append(pageCell, nameCell, idCell, scoreCell, answerCell); legacyResultRows.append(tr);
  }
}

async function downloadLegacyCsv() {
  const key = legacyPages.find((page) => page.id === legacyKeyPageId);
  const { count, ready: keyReady } = legacyKeyInfo(key);
  const rows = [["student_id", "student_name", "score", "total", "percentage", "review_flags", ...Array.from({ length: count || 120 }, (_, i) => `Q${i + 1}`)]];
  for (const student of legacyPages.filter((page) => page.id !== legacyKeyPageId)) {
    const learner = courseRoster.find((item) => item.student_id === student.studentId);
    const score = keyReady ? legacyScore(student, key, count) : "";
    const flags = student.answers.slice(0, count || 120).filter((answer) => answer.status === "multiple" || answer.status === "uncertain").length;
    rows.push([student.studentId || student.partialId, learner ? rosterDisplayName(learner) : "", score, keyReady ? count : "", keyReady ? (score / count * 100).toFixed(1) : "", flags,
      ...student.answers.slice(0, count || 120).map((answer) => answer.selected.join("+") || (answer.status === "uncertain" ? "?" : ""))]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blobUrl = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = blobUrl; link.download = "legacy-mcq-results.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

async function loadFaithfulScanPages(bytes, first, last, height = 1600) {
  const url = new URL(scanRuntime.render_batch_url, window.location.href);
  url.searchParams.set("first", first);
  url.searchParams.set("last", last);
  url.searchParams.set("height", height);
  const response = await fetch(url, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/pdf", "X-Scan-Render": "1" },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Faithful PDF rendering failed (HTTP ${response.status}).`);
  return window.JSZip.loadAsync(await response.arrayBuffer(), { checkCRC32: false });
}

async function scanPage(pdf, pageNo, sourceFile, qrCache = null, renderedPage = null) {
  const sourceCanvas = document.createElement("canvas");
  if (renderedPage) {
    setStageProgress("Loading faithfully rendered page");
    const bitmap = await createImageBitmap(await renderedPage.async("blob"));
    sourceCanvas.width = bitmap.width;
    sourceCanvas.height = bitmap.height;
    sourceCanvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
    bitmap.close();
  } else {
    const page = await pdf.getPage(pageNo);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.8, 1350 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    setStageProgress("Rendering page in browser");
    sourceCanvas.width = Math.ceil(viewport.width);
    sourceCanvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: sourceCanvas.getContext("2d", { willReadFrequently: true }),
      viewport }).promise;
    page.cleanup();
  }
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  // This page never changes after it has been rendered. Keep one readback and
  // share it with structural detection and every rectification candidate.
  const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  setStageProgress("Detecting answer and ID bubbles");

  // The normal case has clear black registration marks, so inspect the source
  // directly. Only pale scans need a second, binarized full-page canvas.
  let marks = findRegistrationMarks(sourceCanvas);
  if (marks.some((mark) => mark.inferred)) {
    const detectionCanvas = createBinarizedCanvas(sourceCanvas, sourceImage);
    marks = findRegistrationMarks(detectionCanvas);
    detectionCanvas.width = 0;
    detectionCanvas.height = 0;
  }
  if (!marks) {
    let genericLayout = null;
    try { genericLayout = JSON.parse(localStorage.getItem("print-scan-grade-generic-layout") || "null"); } catch { genericLayout = null; }
    if (pageNo > 1 && genericLayout) {
      sourceCanvas.width = 0;
      sourceCanvas.height = 0;
      return { guidePage: true };
    }
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    throw new Error("The four page-registration marks could not be found. Check that the page is not cropped.");
  }
  let alignedCanvas = null;
  let singleFormFallbackCanvas = null;
  // Most PDFs are already upright. Reading their QR directly avoids creating
  // a large rectified canvas for every page. Rotated or skewed pages retain
  // the rectification fallback below.
  const qrFingerprint = createQrFingerprint(sourceImage, sourceCanvas.width, sourceCanvas.height);
  const cachedQrMatches = qrCache?.fingerprint && qrCache?.qr &&
    qrFingerprintsMatch(qrFingerprint, qrCache.fingerprint);
  let qr = cachedQrMatches ? { ...qrCache.qr } : decodeFormQr(sourceCanvas);
  let selectedRegistrationPoints = qr ? marks : null;
  // Registration marks are symmetric, so try each physical page orientation.
  // A valid form QR in the expected top-right area identifies the upright one.
  for (let rotation = 0; !qr && rotation < 4; rotation += 1) {
    const points = marks.map((_, index) => marks[(index + rotation) % marks.length]);
    let candidate = rectifyPage(sourceCanvas, points, MARK_MARGIN, sourceImage);
    if (!candidate) continue;
    // The QR reader already has a focused local threshold fallback. Only make
    // a full-page binary copy when the untouched candidate cannot be read.
    let decoded = decodeFormQr(candidate);
    if (!decoded) {
      const qrCanvas = createBinarizedCanvas(candidate);
      decoded = decodeFormQr(qrCanvas);
      qrCanvas.width = 0;
      qrCanvas.height = 0;
    }
    const preliminaryForm = decoded && !decoded.data.startsWith("PSGGUIDE|")
      ? identifyScannedForm(decoded) : null;
    if (preliminaryForm?.ok && preliminaryForm.layoutVersion >= 4) {
      candidate.width = 0;
      candidate = rectifyPage(sourceCanvas, points, CURRENT_MARK_MARGIN, sourceImage);
      if (!candidate) continue;
      decoded = decodeFormQr(candidate);
      if (!decoded) {
        const qrCanvas = createBinarizedCanvas(candidate);
        decoded = decodeFormQr(qrCanvas);
        qrCanvas.width = 0;
        qrCanvas.height = 0;
      }
    }
    if (decoded) {
      alignedCanvas = candidate;
      qr = decoded;
      selectedRegistrationPoints = points;
      break;
    }
    if (rotation === 0 && (formsById.size === 1 || localStorage.getItem("print-scan-grade-generic-layout"))) {
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
  if (!qr && singleFormFallbackCanvas) {
    let layout;
    try { layout = JSON.parse(localStorage.getItem("print-scan-grade-generic-layout") || "null"); } catch { layout = null; }
    let design = layout ? null : (formsById.size === 1 ? formsById.values().next().value : null);
    if (!design) {
      const q = Number(layout?.question_count), c = Number(layout?.choice_count);
      if (!Number.isInteger(q) || q < 1 || q > 60 || !Number.isInteger(c) || c < 2 || c > 8) {
        singleFormFallbackCanvas.width = 0;
        singleFormFallbackCanvas.height = 0;
        throw new Error("No QR code was found. Open Print in this browser to set up a generic sheet, or scan a saved answer sheet.");
      }
      const formId = `generic-${q}-${c}`;
      design = formsById.get(formId);
      if (!design) {
        genericScanTitle = window.prompt("This generic sheet is not linked to a saved answer sheet. Enter a title for these grades:", genericScanTitle || "");
        if (!genericScanTitle?.trim()) {
          singleFormFallbackCanvas.width = 0;
          singleFormFallbackCanvas.height = 0;
          throw new Error("A title is required to save grades for a generic answer sheet.");
        }
        genericScanTitle = genericScanTitle.trim();
        design = { form_id: formId, title: genericScanTitle, question_count: q, choice_count: c,
          generic: true, legacy_layout_version: 7 };
        formsById.set(formId, design);
      }
    }
    alignedCanvas = singleFormFallbackCanvas;
    selectedRegistrationPoints = marks;
    // Layout 3 and 4 share answer and ID geometry. Existing pale sheets use
    // layout 3; clean layout-4 sheets remain identified from their QR above.
    const fallbackLayout = design.generic ? 7 : 3;
    qr = {
      data: `PSG1|${design.form_id}|${design.question_count}|${design.choice_count}|${fallbackLayout}`,
      pageTopRatio: 0.28,
    };
  }
  if (!qr) {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    throw new Error("The page could not be aligned or its form QR code could not be read.");
  }
  try {
    const cachedForm = !qr.data.startsWith("PSGGUIDE|") ? identifyScannedForm(qr) : null;
    if (qrCache && cachedForm?.ok) {
      qrCache.qr = { data: qr.data, pageTopRatio: qr.pageTopRatio };
      qrCache.fingerprint = qrFingerprint;
    }
    if (qr.data.startsWith("PSGGUIDE|")) {
      const guideFormId = qr.data.split("|")[1]?.toLowerCase();
      if (!formsById.has(guideFormId)) {
        throw new Error("This instruction page belongs to a form that is not saved in the active course.");
      }
      return { guidePage: true };
    }
    const form = identifyScannedForm(qr);
    if (!form.ok) throw new Error(form.reason);
    setProgress(`Annotating raw scan circles - ${sourceFile} - page ${pageNo}`);
    setStageProgress("Analyzing detected bubbles");
    const rawMapping = createTemplateToRawMapping(
      selectedRegistrationPoints,
      form.layoutVersion >= 4 ? CURRENT_MARK_MARGIN : MARK_MARGIN,
    );
    if (!rawMapping) throw new Error("The scan registration geometry could not be mapped to the raw page.");
    const annotations = detectRawBubbleAnnotations(
      sourceCanvas, form.design, form.layoutVersion, rawMapping,
    );
    // ID bubbles are analysed as part of the same raw-page pass. Do not read
    // the same 90 circles again from the rectified canvas.
    const bubbleIdentity = readStudentIdFromSignals(annotations.idSignals, form.layoutVersion);
    // This is a preview/archive image only: answers above have already been
    // read from the lossless in-memory canvas. JPEG avoids PNG compression
    // becoming a per-page bottleneck on large scanned batches.
    const rawPage = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!rawPage) throw new Error("The scanned page image could not be saved in browser storage format.");
    const idMatch = resolveStudentIdentity(bubbleIdentity);
    return {
      sourceFile,
      pageNo,
      rawPage,
      // The overlay is generated only when this saved scan is opened. Making
      // it for every page during upload doubled image encoding work.
      annotatedPage: null,
      rawScanVersion: RAW_SCAN_VERSION,
      renderEngine: standaloneMode ? "pymupdf" : "pdfjs",
      annotationVersion: ANNOTATION_VERSION,
      annotationKeyId: "",
      formId: form.design.form_id,
      formTitle: form.design.title,
      generic: Boolean(form.design.generic),
      choiceCount: form.design.choice_count,
      layoutVersion: form.layoutVersion,
      questionCount: form.design.question_count,
      studentId: idMatch.studentId,
      bubbleStudentId: bubbleIdentity.studentId,
      bubbleIdRaw: bubbleIdentity.raw,
      bubbleIdUncertainColumns: bubbleIdentity.uncertainColumns,
      idMatchStatus: idMatch.status,
      annotations: annotations.annotations,
      annotationCounts: annotations.counts,
      answers: annotations.answers,
      answerCounts: annotations.answerCounts,
    };
  } finally {
    sourceCanvas.width = 0;
    sourceCanvas.height = 0;
    if (alignedCanvas && alignedCanvas !== sourceCanvas) {
      alignedCanvas.width = 0;
      alignedCanvas.height = 0;
    }
  }
}

function createBinarizedCanvas(sourceCanvas, suppliedImage = null) {
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const image = suppliedImage || sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
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

async function createLocalPagePreview(sourceCanvas) {
  const preview = document.createElement("canvas");
  preview.width = sourceCanvas.width;
  preview.height = sourceCanvas.height;
  const context = preview.getContext("2d");
  context.drawImage(sourceCanvas, 0, 0);
  const blob = await new Promise((resolve, reject) => {
    preview.toBlob((imageBlob) => imageBlob ? resolve(imageBlob) : reject(new Error("The local raw scan could not be saved.")), "image/png");
  });
  preview.width = 0;
  preview.height = 0;
  return blob;
}

function detectRawBubbleAnnotations(sourceCanvas, design, layoutVersion, mapping) {
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const image = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const scale = 1500 / A4.width;
  const currentLayout = [3, 4, 5, 6, 7].includes(layoutVersion);
  const spaciousChoiceLayout = layoutVersion >= 5;
  const columnGutterLayout = layoutVersion >= 6;
  const adaptiveBubbleLayout = layoutVersion >= 7;
  const questionCount = Number(design.question_count);
  const choiceCount = Number(design.choice_count);
  const questionTop = layoutVersion === 1 ? 589 : currentLayout ? 460 : 507;
  const columns = Math.min(4, Math.max(1, Math.ceil(questionCount / (currentLayout ? 15 : 20))));
  const rowsPerColumn = currentLayout ? 15 : Math.ceil(questionCount / columns);
  const columnWidth = (A4.width - 54) / columns;
  const rowPitch = currentLayout
    ? Math.min(31, Math.max(12, (questionTop - 38) / Math.max(1, rowsPerColumn - 1)))
    : Math.min(28.5, Math.max(12, (questionTop - 38) / rowsPerColumn));
  const rowOffset = (questionTop - 38 - (rowsPerColumn - 1) * rowPitch) / 2;
  const answerStart = currentLayout ? (spaciousChoiceLayout ? 35 : 30) : 33;
  const standardAnswerRadius = currentLayout ? 6.8 : Math.min(5, Math.max(3.6, rowPitch * 0.28));
  const maxAnswerRadius = (columnWidth - 35 - 8 - Math.max(0, choiceCount - 1) * 0.75) /
    (2 * choiceCount - 1);
  const answerRadius = adaptiveBubbleLayout
    ? Math.max(5.5, Math.min(standardAnswerRadius, maxAnswerRadius))
    : standardAnswerRadius;
  const requestedTrailingGap = columnGutterLayout ? 8 : 0;
  const minimumPitch = answerRadius * 2 + 0.75;
  const trailingGap = spaciousChoiceLayout ? Math.max(0, Math.min(requestedTrailingGap,
    columnWidth - answerStart - answerRadius - Math.max(0, choiceCount - 1) * minimumPitch)) : 0;
  const answerPitch = spaciousChoiceLayout
    ? Math.min(20.5, (columnWidth - answerStart - answerRadius - trailingGap) /
      Math.max(1, choiceCount - 1))
    : Math.min(20.5, (columnWidth - (currentLayout ? 34 : 37)) / Math.max(1, choiceCount - 1));
  const annotations = [];
  const idSignals = [];
  const inspect = (kind, label, question, templateX, templateY, templateRadius, offset = null) => {
    const [x, y, radius] = rawBubbleGeometry(mapping, templateX * scale, templateY * scale, templateRadius * scale, sourceCanvas.width / A4.width);
    // Registration marks correct page-level rotation and perspective. A wider
    // local search then absorbs small residual print/scan distortions at each
    // bubble, while remaining well inside the gap to neighboring circles.
    // Photocopied pencil hatching can be medium gray. Keep it in the fill
    // measurement, then judge answers relative to the other choices in their
    // row so the faint printed A–D guide letters do not become selections.
    const analysis = analyzeCircle(image, sourceCanvas.width, sourceCanvas.height,
      x + (offset?.x || 0), y + (offset?.y || 0), radius, 0.46, standaloneMode ? 205 : null);
    let idSignal = null;
    if (kind === "student_id") {
      // ID selection follows the same strict central-ink evidence as answers.
      // Contrast alone is not meaningful for an empty printed circle.
      idSignal = { label, signal: analysis.fillRatio, fillRatio: analysis.fillRatio,
        normalizedContrast: analysis.normalizedContrast, column: Math.floor(idSignals.length / 10) };
      idSignals.push(idSignal);
    }
    // A real printed bubble has a local circular ring. This gate prevents the
    // overlay from marking every expected location when a scan is blank/cropped.
    if (analysis.score < Math.max(3, analysis.paper * 0.012)) return;
    // Sample only the central 55% of the bubble and count only genuinely dark
    // ink. A printed A-D guide letter, pale photocopy grain, or the outline
    // cannot cover 30% of that central disc, so every non-mark is blue rather
    // than becoming an ambiguous or false-green result.
    const status = analysis.fillRatio >= (standaloneMode && kind === "answer" ? 0.32 : 0.3)
      ? "filled" : "blank";
    const crossDarkThreshold = standaloneMode && kind === "answer"
      ? Math.min(analysis.darkThreshold, 140) : analysis.darkThreshold;
    const crossScore = status === "filled"
      ? relativeDiagonalCoverage(image, sourceCanvas.width, sourceCanvas.height,
        analysis.cx, analysis.cy, radius, crossDarkThreshold)
      : 0;
    const crossExtensionStats = status === "filled"
      ? diagonalCoverageStats(image, sourceCanvas.width, sourceCanvas.height,
        analysis.cx, analysis.cy, radius, crossDarkThreshold, 0.8, 1.8, 3,
        standaloneMode && kind === "answer" ? 12 : 0)
      : { min: 0, max: 0, average: 0 };
    const crossOuterStats = status === "filled"
      ? diagonalCoverageStats(image, sourceCanvas.width, sourceCanvas.height,
        analysis.cx, analysis.cy, radius, crossDarkThreshold, 1.0, 1.8, 3,
        standaloneMode && kind === "answer" ? 12 : 0)
      : { min: 0, max: 0, average: 0 };
    // An imperfect X can have unequal, slightly skewed strokes. Both
    // diagonals still need ink beyond the printed ring; one long slash or
    // dark shading alone must not cancel an answer.
    const crossed = status === "filled" && (standaloneMode && kind === "answer"
      ? crossExtensionStats.min >= 0.42 && crossOuterStats.min >= 0.3 &&
        crossExtensionStats.max >= 0.52 && crossOuterStats.max >= 0.42
      : crossExtensionStats.max >= 0.5 &&
        (crossOuterStats.max >= 0.5 || crossScore >= 0.75));
    // Only a pronounced X in both diagonals can cancel an ID bubble. Solid
    // filled circles sometimes resemble an X under the looser answer rule.
    if (idSignal) idSignal.crossed = crossExtensionStats.min >= 0.65 && crossOuterStats.min >= 0.6;
    annotations.push({ kind, label, question, x: analysis.cx, y: analysis.cy,
      radius, status, fillRatio: analysis.fillRatio, crossed, crossScore,
      crossExtensionScore: crossExtensionStats.min,
      crossExtensionMax: crossExtensionStats.max,
      crossOuterScore: crossOuterStats.min,
      crossOuterMax: crossOuterStats.max,
      confidence: Math.min(1, analysis.score / 35) });
  };
  for (let column = 0; column < columns; column += 1) {
    const x = 27 + column * columnWidth + answerStart;
    for (let row = 0; row < rowsPerColumn; row += 1) {
      const question = column * rowsPerColumn + row + 1;
      if (question > questionCount) break;
      const y = questionTop - rowOffset - row * rowPitch;
      const radius = answerRadius;
      for (let choice = 0; choice < choiceCount; choice += 1) {
        inspect("answer", String.fromCharCode(65 + choice), question,
          x + choice * answerPitch, A4.height - y, radius);
      }
    }
  }
  if ([2, 3, 4, 5, 6, 7].includes(layoutVersion)) {
    const firstBubbleX = 27 + 2 + 34;
    const firstRowY = A4.height - (A4.height - 145 - 13);
    const rowPitchId = currentLayout ? 14.5 : 9.1;
    const idRadius = currentLayout ? 6.8 : 3.9;
    const idGridShift = standaloneMode
      ? findIdGridShift(image, sourceCanvas.width, sourceCanvas.height, mapping,
        firstBubbleX, firstRowY, rowPitchId, idRadius, scale)
      : null;
    for (let column = 0; column < 9; column += 1) {
      for (let digit = 0; digit < 10; digit += 1) {
        inspect("student_id", String(digit), null,
          firstBubbleX + column * 20.5, firstRowY + digit * rowPitchId,
          idRadius, idGridShift);
      }
    }
  }
  if (standaloneMode) {
    const answersByQuestion = new Map();
    for (const annotation of annotations) {
      if (annotation.kind !== "answer") continue;
      if (!answersByQuestion.has(annotation.question)) answersByQuestion.set(annotation.question, []);
      answersByQuestion.get(annotation.question).push(annotation);
    }
    for (const row of answersByQuestion.values()) {
      const ranked = [...row].sort((a, b) => b.fillRatio - a.fillRatio);
      const [strongest, runnerUp] = ranked;
      if (strongest?.status === "blank" && strongest.fillRatio >= 0.22 &&
          strongest.fillRatio - (runnerUp?.fillRatio || 0) >= 0.10 && strongest.confidence >= 0.35) {
        strongest.status = "filled";
      }
    }
  }
  const counts = { total: annotations.length, filled: 0, blank: 0, uncertain: 0 };
  for (const annotation of annotations) counts[annotation.status] += 1;
  const answerData = resolveTemplateAnswers(annotations, questionCount);
  return { annotations, counts, idSignals, answers: answerData.answers,
    answerCounts: answerData.counts };
}

function findIdGridShift(image, width, height, mapping, firstX, firstY, pitch, radius, scale) {
  // Corner marks align the page globally, but a photocopier can move the ID
  // block relative to those corners. Use the printed rings (not the shading)
  // to locate this entire grid, so a dark digit cannot pull one circle onto
  // its neighbor. A few rows across all columns make the fit robust to marks.
  const anchors = [];
  for (const column of [0, 2, 4, 6, 8]) {
    for (const digit of [0, 3, 6, 9]) {
      const [x, y, r] = rawBubbleGeometry(mapping,
        (firstX + column * 20.5) * scale, (firstY + digit * pitch) * scale,
        radius * scale, width / A4.width);
      anchors.push({ x, y, radius: r });
    }
  }
  const averageRadius = anchors.reduce((sum, item) => sum + item.radius, 0) / anchors.length;
  const maxX = Math.min(19, Math.round(averageRadius * 1.35));
  const maxY = Math.min(23, Math.round(averageRadius * 1.7));
  let best = { x: 0, y: 0, score: -Infinity };
  for (let dy = -maxY; dy <= maxY; dy += 2) {
    for (let dx = -maxX; dx <= maxX; dx += 2) {
      let score = 0;
      for (const anchor of anchors) {
        score += idRingContrast(image.data, width, height,
          Math.round(anchor.x + dx), Math.round(anchor.y + dy), anchor.radius);
      }
      score = score / anchors.length - Math.hypot(dx, dy) * 0.12;
      if (score > best.score) best = { x: dx, y: dy, score };
    }
  }
  return best.score >= 5 ? { x: best.x, y: best.y } : { x: 0, y: 0 };
}

function idRingContrast(pixels, width, height, cx, cy, radius) {
  let contrast = 0;
  let count = 0;
  for (let step = 0; step < 12; step += 1) {
    const angle = step * Math.PI / 6;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const toneAt = (distance) => {
      const x = Math.round(cx + cos * distance);
      const y = Math.round(cy + sin * distance);
      return x >= 0 && x < width && y >= 0 && y < height
        ? pixels[(y * width + x) * 4] : 255;
    };
    const ring = Math.min(toneAt(radius * 0.86), toneAt(radius), toneAt(radius * 1.1));
    contrast += toneAt(radius * 1.45) - ring;
    count += 1;
  }
  return contrast / count;
}

function resolveTemplateAnswers(annotations, questionCount) {
  const byQuestion = new Map();
  for (const annotation of annotations) {
    if (annotation.kind !== "answer" || !Number.isInteger(annotation.question)) continue;
    if (!byQuestion.has(annotation.question)) byQuestion.set(annotation.question, []);
    byQuestion.get(annotation.question).push(annotation);
  }
  const answers = [];
  const counts = { selected: 0, not_selected: 0, multiple: 0, crossed: 0 };
  for (let question = 1; question <= questionCount; question += 1) {
    const row = byQuestion.get(question) || [];
    const green = row.filter((bubble) => bubble.status === "filled");
    const uncrossedGreen = green.filter((bubble) => !bubble.crossed);
    counts.crossed += green.filter((bubble) => bubble.crossed).length;
    let response = "";
    let status = "not_selected";
    let reason = "No green filled circle was identified in this row.";
    if (uncrossedGreen.length === 1) {
      response = uncrossedGreen[0].label;
      status = "selected";
      reason = `Green filled circle identified: ${response}.`;
      if (green.length > 1) {
        const crossedLabels = green.filter((bubble) => bubble.crossed).map((bubble) => bubble.label).join(", ");
        reason += ` Crossed green circle${crossedLabels ? ` (${crossedLabels})` : ""} excluded.`;
      }
    } else if (uncrossedGreen.length > 1) {
      response = uncrossedGreen.map((bubble) => bubble.label).join(", ");
      status = "multiple";
      reason = `More than one uncrossed green filled circle identified (${response}).`;
    } else if (green.length) {
      reason = "All green filled circles in this row are crossed out.";
    }
    const corrected = status === "selected" && green.some((bubble) => bubble.crossed);
    counts[status] += 1;
    answers.push({ question, response, selectedLabels: uncrossedGreen.map((bubble) => bubble.label), status, corrected, reason,
      bubbles: row.map((bubble) => ({ label: bubble.label, status: bubble.status,
        crossed: Boolean(bubble.crossed), crossScore: bubble.crossScore || 0 })) });
  }
  return { answers, counts };
}

async function createAnnotatedBubblePreview(sourceCanvas, annotationData, correctAnswers = null) {
  const preview = document.createElement("canvas");
  preview.width = sourceCanvas.width;
  preview.height = sourceCanvas.height;
  const context = preview.getContext("2d", { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0);

  // The source pixels remain untouched; this canvas is only the diagnostic copy.

  const scale = preview.width / sourceCanvas.width;
  const drawBubble = (bubble) => {
    if (!bubble || !Number.isFinite(bubble.x) || !Number.isFinite(bubble.y)) return;
    // The current raw detector has a binary result: strict central ink is
    // green, everything else is blue. Keep the preview binary too, so stale
    // or imported metadata can never introduce an amber diagnostic circle.
    const isExpectedAnswer = bubble.kind === "answer" &&
      correctAnswers?.get(bubble.question)?.includes(bubble.label);
    const color = bubble.status === "filled" ? "#00a878" : "#2878c8";
    context.beginPath();
    context.arc(bubble.x * scale, bubble.y * scale, bubble.radius * scale, 0, Math.PI * 2);
    context.lineWidth = Math.max(2, scale * 1.5);
    context.strokeStyle = color;
    context.globalAlpha = bubble.status === "blank" ? 0.72 : 0.95;
    context.stroke();
    if (bubble.status === "filled" || isExpectedAnswer) {
      context.beginPath();
      context.arc(bubble.x * scale, bubble.y * scale, Math.max(2, bubble.radius * scale * 0.42), 0, Math.PI * 2);
      context.fillStyle = color;
      context.globalAlpha = bubble.status === "filled" ? 0.9 : 0.82;
      context.fill();
    }
    if (bubble.crossed) {
      context.beginPath();
      context.moveTo((bubble.x - bubble.radius * 0.72) * scale, (bubble.y - bubble.radius * 0.72) * scale);
      context.lineTo((bubble.x + bubble.radius * 0.72) * scale, (bubble.y + bubble.radius * 0.72) * scale);
      context.moveTo((bubble.x + bubble.radius * 0.72) * scale, (bubble.y - bubble.radius * 0.72) * scale);
      context.lineTo((bubble.x - bubble.radius * 0.72) * scale, (bubble.y + bubble.radius * 0.72) * scale);
      context.lineWidth = Math.max(2, scale * 1.8);
      context.strokeStyle = "#d9534f";
      context.globalAlpha = 0.95;
      context.stroke();
    }
  };

  for (const bubble of annotationData?.annotations || []) drawBubble(bubble);

  // Keep a compact legend on the diagnostic copy so the colours are useful
  // even when someone views the image without the answer list beside it.
  const fontSize = Math.max(14, Math.round(scale * 7));
  context.globalAlpha = 0.94;
  context.fillStyle = "rgba(255,255,255,0.88)";
  context.fillRect(preview.width - scale * 375, scale * 18, scale * 360, scale * 34);
  context.font = `bold ${fontSize}px sans-serif`;
  context.fillStyle = "#111";
  context.fillText("green selected  blue solid correct  blue outline blank  red X crossed", preview.width - scale * 365, scale * 39);
  context.globalAlpha = 1;

  const blob = await new Promise((resolve, reject) => {
    preview.toBlob((imageBlob) => imageBlob
      ? resolve(imageBlob)
      : reject(new Error("The annotated scan preview could not be saved.")), "image/png");
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
      // Photocopiers commonly add 10–25 pt of white border around a reduced
      // page. The marks remain real squares, but their centres can be several
      // mark-widths from the original 16 pt template positions. Rejecting
      // them here silently substituted nominal corners and shifted every
      // answer and ID bubble on that sheet.
      if (distance > expectedSize * 4.5) found = null;
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

function createTemplateToRawMapping(registrationPoints, markMargin = MARK_MARGIN) {
  if (!registrationPoints || registrationPoints.length !== 4) return null;
  const outputWidth = 1500;
  const outputHeight = Math.round(outputWidth * A4.height / A4.width);
  const inset = markMargin * outputWidth / A4.width;
  const destination = [
    [inset, inset],
    [outputWidth - inset, inset],
    [outputWidth - inset, outputHeight - inset],
    [inset, outputHeight - inset],
  ];
  const forward = solveHomography(registrationPoints.map((point) => [point.x, point.y]), destination);
  return forward && invertHomography(forward);
}

function mapTemplatePoint(mapping, x, y) {
  const denominator = mapping[6] * x + mapping[7] * y + mapping[8];
  return {
    x: (mapping[0] * x + mapping[1] * y + mapping[2]) / denominator,
    y: (mapping[3] * x + mapping[4] * y + mapping[5]) / denominator,
  };
}

function mapTemplateRadius(mapping, x, y, radius) {
  const center = mapTemplatePoint(mapping, x, y);
  const horizontal = mapTemplatePoint(mapping, x + radius, y);
  const vertical = mapTemplatePoint(mapping, x, y + radius);
  return (Math.hypot(horizontal.x - center.x, horizontal.y - center.y) +
    Math.hypot(vertical.x - center.x, vertical.y - center.y)) / 2;
}

function rawBubbleGeometry(mapping, x, y, radius, scale) {
  if (!mapping) return [x, y, radius];
  const center = mapTemplatePoint(mapping, x, y);
  return [center.x, center.y, mapTemplateRadius(mapping, x, y, radius)];
}

function rectifyPage(sourceCanvas, registrationPoints, markMargin = MARK_MARGIN, suppliedImage = null) {
  // This canvas is used only to locate and read the QR code. Answer analysis
  // maps directly onto the original page, so 960 px is ample for QR modules
  // and avoids repeatedly sampling a 3.2-megapixel temporary image.
  const outputWidth = 960;
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

  const sourceImage = suppliedImage || sourceCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });
  const outputImage = outputContext.createImageData(outputWidth, outputHeight);
  const out = outputImage.data;
  const input = sourceImage.data;
  for (let y = 0, offset = 0; y < outputHeight; y += 1) {
    const rowDenominator = inverse[7] * y + inverse[8];
    const rowSourceX = inverse[1] * y + inverse[2];
    const rowSourceY = inverse[4] * y + inverse[5];
    for (let x = 0; x < outputWidth; x += 1, offset += 4) {
      const denominator = inverse[6] * x + rowDenominator;
      const sx = (inverse[0] * x + rowSourceX) / denominator;
      const sy = (inverse[3] * x + rowSourceY) / denominator;
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

function createQrFingerprint(image, width, height) {
  // This low-detail QR-region fingerprint does not score answers. It only
  // proves that a cached, already decoded QR belongs to the current page.
  const columns = 20;
  const rows = 20;
  const left = Math.floor(width * 0.8);
  const top = Math.floor(height * 0.23);
  const regionWidth = Math.max(columns, Math.ceil(width * 0.19));
  const regionHeight = Math.max(rows, Math.ceil(height * 0.15));
  const fingerprint = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const startX = left + Math.floor(column * regionWidth / columns);
      const endX = Math.min(width, left + Math.ceil((column + 1) * regionWidth / columns));
      const startY = top + Math.floor(row * regionHeight / rows);
      const endY = Math.min(height, top + Math.ceil((row + 1) * regionHeight / rows));
      let total = 0;
      let samples = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4;
          total += image.data[offset] * 299 + image.data[offset + 1] * 587 + image.data[offset + 2] * 114;
          samples += 1;
        }
      }
      fingerprint[row * columns + column] = samples && total / samples / 1000 < 190 ? 1 : 0;
    }
  }
  return fingerprint;
}

function qrFingerprintsMatch(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) return false;
  let differences = 0;
  for (let index = 0; index < left.length; index += 1) differences += left[index] === right[index] ? 0 : 1;
  return differences <= left.length * 0.14;
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
  const normalizedFormId = String(formId).toLowerCase();
  let design = formsById.get(normalizedFormId);
  if (!design) {
    // Imported legacy standalone sheets may only have the shortened FORM code
    // printed on the page. It is the beginning of the full QR form ID.
    const matches = [...new Set(formsById.values())].filter((candidate) =>
      (candidate.accepted_form_ids || []).some((acceptedFormId) =>
        normalizedFormId.startsWith(String(acceptedFormId).toLowerCase())));
    if (matches.length === 1) [design] = matches;
  }
  if (!design) return { ok: false, reason: `Form ${formId} is not saved in the active course. Open Scan from the correct MiniVLE course.` };
  if (q !== null && (q !== design.question_count || c !== design.choice_count)) {
    return { ok: false, reason: "The QR code settings don’t match the saved form. Re-download the sheet from Print." };
  }
  if (layoutVersion === null) layoutVersion = design.legacy_layout_version;
  if (![1, 2, 3, 4, 5, 6, 7].includes(layoutVersion)) return { ok: false, reason: "This answer-sheet layout version is not supported." };
  return { ok: true, design, layoutVersion, sampleSeed };
}

function readAnswers(canvas, design, layoutVersion, coordinateMap = null) {
  const questionBottom = 38;
  const questionCount = Number(design.question_count);
  const choiceCount = Number(design.choice_count);
  const currentLayout = [3, 4, 5, 6, 7].includes(layoutVersion);
  const spaciousChoiceLayout = layoutVersion >= 5;
  const columnGutterLayout = layoutVersion >= 6;
  const adaptiveBubbleLayout = layoutVersion >= 7;
  const questionTop = layoutVersion === 1 ? 589 : currentLayout ? 460 : 507;
  const columns = Math.min(4, Math.max(1, Math.ceil(questionCount / (currentLayout ? 15 : 20))));
  const rowsPerColumn = currentLayout ? 15 : Math.ceil(questionCount / columns);
  const columnWidth = (A4.width - 54) / columns;
  const rowPitch = currentLayout
    ? Math.min(31, Math.max(12, (questionTop - questionBottom) / Math.max(1, rowsPerColumn - 1)))
    : Math.min(28.5, Math.max(12, (questionTop - questionBottom) / rowsPerColumn));
  const rowOffset = (questionTop - questionBottom - (rowsPerColumn - 1) * rowPitch) / 2;
  const answerStart = currentLayout ? (spaciousChoiceLayout ? 35 : 30) : 33;
  const standardAnswerRadius = currentLayout ? 6.8 : Math.min(5, Math.max(3.6, rowPitch * 0.28));
  const maxAnswerRadius = (columnWidth - 35 - 8 - Math.max(0, choiceCount - 1) * 0.75) /
    (2 * choiceCount - 1);
  const answerRadius = adaptiveBubbleLayout
    ? Math.max(5.5, Math.min(standardAnswerRadius, maxAnswerRadius))
    : standardAnswerRadius;
  const requestedTrailingGap = columnGutterLayout ? 8 : 0;
  const minimumPitch = answerRadius * 2 + 0.75;
  const trailingGap = spaciousChoiceLayout ? Math.max(0, Math.min(requestedTrailingGap,
    columnWidth - answerStart - answerRadius - Math.max(0, choiceCount - 1) * minimumPitch)) : 0;
  const answerPitch = spaciousChoiceLayout
    ? Math.min(20.5, (columnWidth - answerStart - answerRadius - trailingGap) /
      Math.max(1, choiceCount - 1))
    : Math.min(20.5, (columnWidth - (currentLayout ? 34 : 37)) / Math.max(1, choiceCount - 1));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / A4.width;
  const templateScale = coordinateMap ? 1500 / A4.width : scale;
  const answers = [];
  for (let column = 0; column < columns; column += 1) {
    // Sample the bubble interior, clear of its outline and faint guide letter.
    // Keep sampling centered on the printed bubble so its outline does not
    // leak into the interior sample and look like a faint student mark.
    const x = 27 + column * columnWidth + answerStart;
    for (let row = 0; row < rowsPerColumn; row += 1) {
      const question = column * rowsPerColumn + row + 1;
      if (question > questionCount) break;
      const y = questionTop - rowOffset - row * rowPitch;
      const bubbles = [];
      for (let choice = 0; choice < choiceCount; choice += 1) {
        const templateX = (x + choice * answerPitch) * templateScale;
        const templateY = (A4.height - y) * templateScale;
        const radiusPoints = answerRadius;
        const center = coordinateMap ? mapTemplatePoint(coordinateMap, templateX, templateY)
          : { x: templateX, y: templateY };
        const radius = coordinateMap
          ? mapTemplateRadius(coordinateMap, templateX, templateY, radiusPoints * templateScale)
          : radiusPoints * scale;
        bubbles.push(sampleBubble(image, canvas.width, canvas.height,
          center.x, center.y, radius,
          String.fromCharCode(65 + choice)));
      }
      answers.push(resolveQuestion(question, bubbles));
    }
  }
  return answers;
}

function readStudentIdFromSignals(idSignals, layoutVersion) {
  if (![2, 3, 4, 5, 6, 7].includes(layoutVersion) || !Array.isArray(idSignals) || idSignals.length < 90) {
    return { studentId: "", raw: "", uncertainColumns: [] };
  }
  let digits = "";
  const uncertainColumns = [];
  for (let column = 0; column < 9; column += 1) {
    const bubbles = idSignals.slice(column * 10, column * 10 + 10);
    const uncrossed = bubbles.filter((bubble) => !bubble.crossed)
      .sort((a, b) => b.signal - a.signal);
    const correction = bubbles.some((bubble) => bubble.crossed && bubble.signal >= 0.4) &&
      uncrossed[0]?.signal >= 0.42 &&
      uncrossed[0].signal - (uncrossed[1]?.signal || 0) >= 0.12;
    const ranked = correction ? uncrossed : [...bubbles].sort((a, b) => b.signal - a.signal);
    const top = ranked[0];
    const second = ranked[1];
    const signalGap = top.signal - second.signal;
    // A crossed-out old digit can still be darker than the replacement.
    // Never turn two substantially shaded ID rows into a confident identity
    // just because one happens to have the greater fill ratio.
    const competingMark = standaloneMode && second.signal >= 0.3 &&
      second.signal >= top.signal * 0.5;
    const clearWinner = top.signal >= 0.28 && signalGap >= 0.07 && !competingMark;
    digits += clearWinner ? top.label : "?";
    if (!clearWinner || second.signal >= top.signal * 0.88) uncertainColumns.push(column + 1);
  }
  return {
    studentId: /^\d{9}$/.test(digits) ? digits : "",
    raw: digits,
    uncertainColumns,
    bubbles: idSignals,
  };
}

function resolveStudentIdentity(bubbleIdentity) {
  if (bubbleIdentity?.studentId) {
    return { studentId: bubbleIdentity.studentId, status: "Student number read from the ID bubbles." };
  }
  if (bubbleIdentity?.raw) {
    return { studentId: "", status: `Student-number bubbles need review (${bubbleIdentity.raw}).` };
  }
  return { studentId: "", status: "Student-number bubbles could not be read." };
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

function analyzeCircle(image, width, height, expectedX, expectedY, radius, searchScale = 0.32,
  idInkThreshold = null) {
  const r = Math.max(4, radius);
  const search = Math.max(1, Math.round(r * searchScale));
  let candidates;
  if (searchScale > 0.4) {
    // Sample a compact 5x5 lattice inside the search disk. This covers
    // arbitrary local displacement more reliably than only checking the four
    // diagonal corners of a square, without approaching adjacent bubbles.
    const half = Math.max(1, Math.round(search / 2));
    const positions = [...new Set([-search, -half, 0, half, search])];
    candidates = [];
    for (const dy of positions) {
      for (const dx of positions) {
        if (Math.hypot(dx, dy) <= search + 0.01) candidates.push([dx, dy]);
      }
    }
  } else {
    const offsets = [-search, 0, search];
    candidates = offsets.flatMap((dy) => offsets.map((dx) => [dx, dy]));
  }
  let best = null;
  for (const [dx, dy] of candidates) {
    const cx = Math.round(expectedX + dx);
    const cy = Math.round(expectedY + dy);
    const edgeSamples = radialRingStats(image, width, height, cx, cy, r);
    if (!edgeSamples.ringCount || !edgeSamples.outsideCount) continue;
    const paper = histogramPercentile(edgeSamples.outsideHistogram,
      edgeSamples.outsideCount, 0.75);
    const outline = histogramPercentile(edgeSamples.ringHistogram,
      edgeSamples.ringCount, 0.2);
    const offsetPenalty = Math.hypot(dx, dy) / r * 0.35;
    const score = paper - outline - offsetPenalty;
    if (!best || score > best.score) best = { cx, cy, score, edgeSamples };
  }
  if (!best) {
    best = {
      cx: Math.round(expectedX), cy: Math.round(expectedY), score: 0,
      edgeSamples: { ringHistogram: new Uint32Array(256), ringCount: 0,
        outsideHistogram: new Uint32Array(256), outsideCount: 0 },
    };
  }
  // Match the reviewed detector: inspect only the central part of the circle.
  const inside = radialStats(image, width, height, best.cx, best.cy, r, 0, 0.55);
  const paper = histogramPercentile(best.edgeSamples.outsideHistogram,
    best.edgeSamples.outsideCount, 0.75) || 255;
  const outline = histogramPercentile(best.edgeSamples.ringHistogram,
    best.edgeSamples.ringCount, 0.2) || Math.max(0, paper - 16);
  const outlineSpan = Math.max(2, paper - outline);
  // Judge ink against the local paper and the printed bubble outline. This
  // keeps a native black PDF and a PaperCut-style charcoal scan comparable
  // without changing either page's pixels. A guide letter remains much closer
  // to the paper than a shaded response, even when a scanner has softened all
  // of the printed ink.
  const outlineContrast = Math.max(0, paper - outline);
  const darkThreshold = idInkThreshold === null
    ? Math.max(70, Math.min(paper - 24, paper - Math.max(38, outlineContrast * 0.56)))
    : Math.max(70, Math.min(idInkThreshold, paper - 35));
  const darkPixels = histogramCountBelow(inside.histogram, darkThreshold);
  const fillRatio = darkPixels / Math.max(1, inside.count);
  const insideMean = inside.sum / Math.max(1, inside.count);
  const normalizedContrast = Math.max(0, Math.min(1.5, (paper - insideMean) / outlineSpan));
  const signal = Math.min(1, fillRatio * 0.72 + Math.min(1, normalizedContrast) * 0.28);
  return {
    cx: best.cx, cy: best.cy, score: best.score, fillRatio, normalizedContrast, signal,
    darkThreshold, paper, outline,
  };
}

function radialRingStats(image, width, height, cx, cy, radius) {
  const ringHistogram = new Uint32Array(256);
  const outsideHistogram = new Uint32Array(256);
  const ringInner = radius * 0.78;
  const ringOuter = radius * 1.12;
  const outsideInner = radius * 1.3;
  const outsideOuter = radius * 1.62;
  const ringInner2 = ringInner * ringInner;
  const ringOuter2 = ringOuter * ringOuter;
  const outsideInner2 = outsideInner * outsideInner;
  const outsideOuter2 = outsideOuter * outsideOuter;
  const limit = Math.ceil(outsideOuter);
  let ringCount = 0;
  let outsideCount = 0;
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const distance2 = dx * dx + dy * dy;
      const inRing = distance2 >= ringInner2 && distance2 <= ringOuter2;
      const outside = distance2 >= outsideInner2 && distance2 <= outsideOuter2;
      if (!inRing && !outside) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const gray = Math.max(0, Math.min(255, Math.round(grayAt(image.data, py * width + px))));
      if (inRing) {
        ringHistogram[gray] += 1;
        ringCount += 1;
      } else {
        outsideHistogram[gray] += 1;
        outsideCount += 1;
      }
    }
  }
  return { ringHistogram, ringCount, outsideHistogram, outsideCount };
}

function radialStats(image, width, height, cx, cy, radius, innerScale, outerScale) {
  const histogram = new Uint32Array(256);
  const inner = radius * innerScale;
  const outer = radius * outerScale;
  const inner2 = inner * inner;
  const outer2 = outer * outer;
  const limit = Math.ceil(outer);
  let count = 0;
  let sum = 0;
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const distance2 = dx * dx + dy * dy;
      if (distance2 < inner2 || distance2 > outer2) continue;
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const gray = Math.max(0, Math.min(255, Math.round(grayAt(image.data, py * width + px))));
      histogram[gray] += 1;
      sum += gray;
      count += 1;
    }
  }
  return { histogram, count, sum };
}

function histogramPercentile(histogram, count, fraction) {
  if (!count) return 0;
  const target = Math.floor((count - 1) * fraction);
  let seen = 0;
  for (let gray = 0; gray < histogram.length; gray += 1) {
    seen += histogram[gray];
    if (seen > target) return gray;
  }
  return histogram.length - 1;
}

function histogramCountBelow(histogram, threshold) {
  let count = 0;
  const limit = Math.max(0, Math.min(histogram.length, Math.ceil(threshold)));
  for (let gray = 0; gray < limit; gray += 1) count += histogram[gray];
  return count;
}

function relativeDiagonalCoverage(image, width, height, cx, cy, radius, darkThreshold,
  startScale = 0.5, endScale = 1.5) {
  return diagonalCoverageStats(image, width, height, cx, cy, radius, darkThreshold,
    startScale, endScale).min;
}

function diagonalCoverageStats(image, width, height, cx, cy, radius, darkThreshold,
  startScale = 0.5, endScale = 1.5, lineHalfWidth = 1, angleTolerance = 0) {
  const start = Math.max(2, Math.round(radius * startScale));
  const end = Math.round(radius * endScale);
  const diagonalRatios = [];
  for (const direction of [1, -1]) {
    let bestRatio = 0;
    for (const skew of angleTolerance ? [-angleTolerance, 0, angleTolerance] : [0]) {
      const angle = Math.PI / 4 + skew * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let hits = 0;
      let samples = 0;
      for (const sign of [-1, 1]) {
        for (let distance = start; distance <= end; distance += 1) {
          const dx = Math.round(distance * cos) * sign;
          const dy = Math.round(distance * sin) * sign * direction;
          let dark = false;
          for (let offset = -lineHalfWidth; offset <= lineHalfWidth; offset += 1) {
            const px = cx + dx + offset;
            const py = cy + dy - offset * direction;
            if (px < 0 || px >= width || py < 0 || py >= height) continue;
            if (grayAt(image.data, py * width + px) < darkThreshold) dark = true;
          }
          if (dark) hits += 1;
          samples += 1;
        }
      }
      bestRatio = Math.max(bestRatio, samples ? hits / samples : 0);
    }
    diagonalRatios.push(bestRatio);
  }
  const min = Math.min(...diagonalRatios);
  const max = Math.max(...diagonalRatios);
  return { min, max, average: (min + max) / 2 };
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
  if (clearWinner) top.mark = "shaded";
  const active = clearWinner ? [top] : bubbles.filter((bubble) => bubble.mark === "shaded");
  const crossed = bubbles.filter((bubble) => bubble.mark === "crossed");
  const uncertain = clearWinner ? [] : bubbles.filter((bubble) => bubble.mark === "uncertain");
  let response = "";
  let status = "incorrect_blank";
  let reason = "No answer bubble was shaded.";
  if (uncertain.length) {
    status = "review";
    reason = "A mark could not be classified confidently.";
    response = active.length === 1 ? active[0].label : "";
  } else if (active.length > 1) {
    response = active.map((bubble) => bubble.label).join(", ");
    status = "multiple";
    reason = `More than one active answer was detected (${response}).`;
  } else if (active.length === 1) {
    response = active[0].label;
    status = crossed.length ? "detected_corrected" : "detected";
    reason = crossed.length ? "Selected bubble detected after an X correction." : "Selected bubble detected; correctness is not graded.";
  } else if (crossed.length) {
    status = "incorrect_blank";
    reason = "All marked bubbles appear crossed out; no active answer remains.";
  }
  return { question, response, selectedLabels: active.map((bubble) => bubble.label), status, reason, bubbles };
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
}

function renderSetAnswerKeyOptions() {
  const scanSet = scanSets.find((item) => item.id === selectedScanSetId);
  if (!scanSet) return;
  setKeySelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose answer sheet";
  setKeySelect.append(placeholder);
  const candidates = sheetResults.filter((result) => result.formId === scanSet.formId);
  setKeyField.hidden = candidates.length === 0;
  for (const candidate of candidates) {
    const option = document.createElement("option");
    option.value = candidate.id;
    const otherSet = candidate.scanSetId !== scanSet.id ? " · another scan set" : "";
    const complete = completeAnswerKeyAnswers(candidate);
    option.disabled = !complete;
    option.textContent = `${studentNameFor(candidate)} · ${candidate.sourceFile} · page ${candidate.pageNo}${otherSet}` +
      (complete ? "" : " · incomplete answers");
    setKeySelect.append(option);
  }
  const selectedKey = candidates.find((candidate) => candidate.id === answerKeyByScanSet[scanSet.id]);
  if (selectedKey && !completeAnswerKeyAnswers(selectedKey)) {
    delete answerKeyByScanSet[scanSet.id];
    persistScanState();
  }
  setKeySelect.value = answerKeyByScanSet[scanSet.id] || "";
  setKeySelect.onchange = async () => {
    const candidate = candidates.find((item) => item.id === setKeySelect.value);
    if (candidate && completeAnswerKeyAnswers(candidate)) {
      answerKeyByScanSet[scanSet.id] = candidate.id;
    } else {
      delete answerKeyByScanSet[scanSet.id];
    }
    await persistScanState();
    await refreshSavedAnnotationsInBackground();
    renderGradeWorkspace();
  };
  renderAnswerKeyRules(scanSet, selectedKey);
}

function selectedLabelsForAnswer(answer) {
  const labels = Array.isArray(answer?.selectedLabels)
    ? answer.selectedLabels
    : String(answer?.response || "").split(",");
  return [...new Set(labels.map((label) => String(label).trim()).filter((label) => /^[A-Z]$/.test(label)))].sort();
}

function setManualAnswerSelection(answer, labels) {
  const selectedLabels = [...new Set(labels)].sort();
  answer.selectedLabels = selectedLabels;
  answer.response = selectedLabels.join(", ");
  answer.status = selectedLabels.length === 0 ? "incorrect_blank"
    : selectedLabels.length === 1 ? "selected" : "multiple";
  answer.reason = selectedLabels.length
    ? `Manually selected: ${selectedLabels.join(" + ")}.`
    : "Manually cleared; no answer selected.";
  answer.corrected = false;
  answer.manual = true;
}

async function savePendingPreviewAnswers() {
  const sheet = sheetResults.find((item) => item.id === previewedSheetId);
  if (!sheet || pendingPreviewAnswers.size === 0) return;
  if (scanPreviewSaveAnswers) {
    scanPreviewSaveAnswers.disabled = true;
    scanPreviewSaveAnswers.textContent = isStaleStandaloneScan(sheet)
      ? "Saving answer changes…" : "Updating annotated scan…";
  }
  for (const answer of sheet.answers || []) {
    if (!pendingPreviewAnswers.has(answer.question)) continue;
    const selected = pendingPreviewAnswers.get(answer.question);
    setManualAnswerSelection(answer, selected);
  }
  pendingPreviewAnswers.clear();
  // A faithful page can be re-annotated after a manual correction. The old
  // browser-rendered pages cannot safely be re-read from their faded pixels.
  if (!isStaleStandaloneScan(sheet)) sheet.annotationVersion = 0;
  await persistScanState();
  if (!isStaleStandaloneScan(sheet)) await refreshSavedAnnotations(new Set([sheet.id]));
  renderGradeWorkspace();
  openScanPreview(sheet);
}

function choiceLabelsForSheet(sheet) {
  const count = Number(sheet?.choiceCount || formsById.get(String(sheet?.formId).toLowerCase())?.choice_count);
  return Array.from({ length: Number.isInteger(count) && count > 0 ? count : 4 }, (_, index) =>
    String.fromCharCode(65 + index)
  );
}

function isResolvedAnswer(answer) {
  return ["selected", "multiple", "detected", "detected_corrected"].includes(answer?.status) &&
    selectedLabelsForAnswer(answer).length > 0;
}

function formatAnswerSet(labels) {
  return (labels || []).join(" + ") || "Not selected";
}

function completeAnswerKeyAnswers(sheet) {
  const questionCount = Number(sheet?.questionCount);
  if (!Number.isInteger(questionCount) || questionCount < 1 || !Array.isArray(sheet?.answers)) return null;
  const answers = new Map();
  for (let question = 1; question <= questionCount; question += 1) {
    const answer = sheet.answers.find((item) => item.question === question);
    if (!answer || !isResolvedAnswer(answer)) return null;
    answers.set(question, selectedLabelsForAnswer(answer));
  }
  return answers;
}

function ruleForQuestion(scanSetId, question, keyedAnswers) {
  if ((keyedAnswers || []).length < 2) return "all";
  const keyId = answerKeyByScanSet[scanSetId];
  return answerRulesByAnswerKey[keyId]?.[question] === "any" ? "any" : "all";
}

function isQuestionDiscountedForAll(scanSetId, question) {
  return Boolean(questionDiscountsByScanSet[scanSetId]?.[question]);
}

function isQuestionDiscountedForStudent(sheet, question) {
  return Array.isArray(sheet?.discountedQuestions) && sheet.discountedQuestions.includes(question);
}

function setQuestionDiscountForStudent(sheet, question, discounted) {
  const current = new Set(Array.isArray(sheet.discountedQuestions) ? sheet.discountedQuestions : []);
  if (discounted) current.add(question);
  else current.delete(question);
  sheet.discountedQuestions = [...current].sort((left, right) => left - right);
}

function evaluateAnswerSet(answer, keyedAnswers, rule) {
  const selected = selectedLabelsForAnswer(answer);
  if (!isResolvedAnswer(answer)) return { status: answer?.status === "review" ? "review" : "incorrect", selected };
  const keyed = new Set(keyedAnswers || []);
  if (selected.some((label) => !keyed.has(label))) return { status: "incorrect", selected };
  const correct = rule === "any"
    ? selected.some((label) => keyed.has(label))
    : selected.length === keyed.size && [...keyed].every((label) => selected.includes(label));
  return { status: correct ? "correct" : "incorrect", selected };
}

function renderAnswerKeyRules(scanSet, key) {
  if (!answerKeyRules || !answerKeyRuleList) return;
  const keyed = completeAnswerKeyAnswers(key);
  const multiQuestions = keyed ? [...keyed.entries()].filter(([, labels]) => labels.length > 1) : [];
  answerKeyRules.hidden = multiQuestions.length === 0;
  answerKeyRuleList.replaceChildren();
  if (!multiQuestions.length) return;
  answerRulesByAnswerKey[key.id] ||= {};
  for (const [question, labels] of multiQuestions) {
    const row = document.createElement("label");
    row.className = "answer-key-rule-row";
    const title = document.createElement("span");
    title.innerHTML = `<strong>Question ${question}</strong><small>Keyed answers: ${formatAnswerSet(labels)}</small>`;
    const select = document.createElement("select");
    select.className = "review-select";
    select.setAttribute("aria-label", `Marking rule for question ${question}`);
    select.add(new Option("All keyed answers required", "all"));
    select.add(new Option("Any keyed answer accepted", "any"));
    select.value = ruleForQuestion(scanSet.id, question, labels);
    select.addEventListener("change", async () => {
      answerRulesByAnswerKey[key.id][question] = select.value === "any" ? "any" : "all";
      await persistScanState();
      renderGradeWorkspace();
    });
    row.append(title, select);
    answerKeyRuleList.append(row);
  }
}

function rosterCandidates(sheet) {
  const identifiers = new Set([sheet.studentId, sheet.bubbleStudentId, sheet.writtenStudentId].filter(Boolean));
  return courseRoster.filter((learner) => identifiers.has(learner.student_id));
}

function partialIdCandidates(sheet) {
  if (!sheet || sheet.studentId || sheet.bubbleStudentId || sheet.writtenStudentId ||
      sheet.manualStudentId || isDummyAnswerKey(sheet)) return [];
  return rosterCandidatesForPartialId(sheet.bubbleIdRaw, courseRoster);
}

function inferredRosterLearner(sheet) {
  if (!sheet || sheet.manualStudentId || isDummyAnswerKey(sheet) || rosterCandidates(sheet).length) return null;
  const raw = sheet.bubbleIdRaw || sheet.studentId || sheet.bubbleStudentId || "";
  const partial = /^\d{0,8}\?\d{0,8}$/.test(raw) && raw.length === 9;
  const candidates = partial ? partialIdCandidates(sheet)
    : /^\d{9}$/.test(raw) ? nearIdCandidates(sheet) : [];
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  // Two pages claiming the same student need review, even if one is close.
  const alreadyRead = sheetResults.some((other) => other.id !== sheet.id &&
    other.scanSetId === sheet.scanSetId &&
    [other.studentId, other.bubbleStudentId, other.writtenStudentId, other.manualStudentId]
      .includes(candidate.student_id));
  return alreadyRead ? null : candidate;
}

function nearIdCandidates(sheet) {
  if (!sheet || sheet.manualStudentId || isDummyAnswerKey(sheet) ||
      rosterCandidates(sheet).length || partialIdCandidates(sheet).length) return [];
  return rosterCandidatesNearId(sheet.bubbleIdRaw || sheet.studentId || sheet.bubbleStudentId, courseRoster);
}

function suggestedRosterCandidates(sheet) {
  const partial = partialIdCandidates(sheet);
  return partial.length ? partial : nearIdCandidates(sheet);
}

function manuallyMatchedLearner(sheet) {
  const savedMatch = sheet && manualStudentMatches[sheet.id];
  const studentId = sheet?.manualStudentId || savedMatch?.student_id;
  if (!studentId) return null;
  return courseRoster.find((learner) => learner.student_id === studentId) || savedMatch || null;
}

function saveManualStudentMatch(sheet, learner) {
  if (!sheet || !learner?.student_id) return;
  sheet.manualStudentId = learner.student_id;
  sheet.manualStudentName = learner.name || "";
  sheet.manualStudentSisLoginId = learner.sis_login_id || "";
  manualStudentMatches[sheet.id] = {
    student_id: learner.student_id,
    name: learner.name || "",
    sis_login_id: learner.sis_login_id || "",
  };
}

function matchedLearner(sheet) {
  const manualMatch = manuallyMatchedLearner(sheet);
  if (manualMatch) return manualMatch;
  const matches = rosterCandidates(sheet);
  if (matches.length === 1) return matches[0];
  return matches.length ? null : inferredRosterLearner(sheet);
}

function rosterNameParts(learner) {
  const name = String(learner?.name || "").trim().replace(/\s+/g, " ");
  if (!name) return { first: "", last: "" };
  if (name.includes(",")) {
    const [last, ...firstParts] = name.split(",");
    return { first: firstParts.join(",").trim(), last: last.trim() };
  }
  const parts = name.split(" ");
  return parts.length > 1
    ? { first: parts.slice(0, -1).join(" "), last: parts.at(-1) }
    : { first: "", last: name };
}

function rosterDisplayName(learner) {
  const { first, last } = rosterNameParts(learner);
  return first ? `${last}, ${first}` : last;
}

function compareRosterLearners(left, right) {
  const leftParts = rosterNameParts(left);
  const rightParts = rosterNameParts(right);
  return leftParts.last.localeCompare(rightParts.last, undefined, { sensitivity: "base" }) ||
    leftParts.first.localeCompare(rightParts.first, undefined, { sensitivity: "base" });
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
  const manuallyMatched = manuallyMatchedLearner(sheet);
  const inferred = inferredRosterLearner(sheet);
  const partialCandidates = learner ? [] : partialIdCandidates(sheet);
  const nearCandidates = learner ? [] : nearIdCandidates(sheet);
  const recognizedStudentId = sheet.studentId || sheet.bubbleStudentId || sheet.writtenStudentId;
  const parts = [
    learner ? `${manuallyMatched ? "Roster identity assigned manually" : inferred ? "Roster identity inferred automatically from eight matching ID digits" : "Roster identity confirmed"}: ${learner.name}` : `Printed name: ${sheet.printedName || "not read"}`,
    inferred ? `ID bubbles read: ${sheet.bubbleIdRaw || recognizedStudentId || "not read"}` : `Student number: ${recognizedStudentId || "not read"}`,
    sheet.idMatchStatus || "",
  ];
  if (learner) parts.push(`Matched SIS number: ${learner.student_id}`);
  if (partialCandidates.length === 1) {
    parts.push(`Possible roster match (not assigned): ${rosterSearchLabel(partialCandidates[0])}`);
  } else if (partialCandidates.length > 1) {
    parts.push(`${partialCandidates.length} roster students fit partial ID ${sheet.bubbleIdRaw}`);
  }
  if (nearCandidates.length) parts.push(`${nearCandidates.length} roster ID${nearCandidates.length === 1 ? "" : "s"} differ by one read digit; confirm against the scan`);
  if (!learner) parts.push("Review the raw annotated scan if manual identification is needed");
  return parts.filter(Boolean).join(" · ");
}

function renderGradeWorkspace() {
  if (clearWorkspaceScansButton) {
    clearWorkspaceScansButton.hidden = !sheetResults.length && !scanSets.length && !legacyPages.length;
    clearWorkspaceScansButton.disabled = scanInProgress;
  }
  csvButton.disabled = true;
  csvButton.hidden = true;
  if (annotatedSheetsButton) {
    annotatedSheetsButton.disabled = true;
    annotatedSheetsButton.hidden = true;
  }
  if (!selectedGradeFormId) {
    const scannedFormCount = (gradeDashboardData?.forms || []).filter((form) =>
      sheetResults.some((sheet) => sheet.formId === form.form_id)).length;
    gradeSummary.textContent = scannedFormCount
      ? `${scannedFormCount} answer sheet${scannedFormCount === 1 ? "" : "s"} have scans. Choose one to review raw circle annotations.`
      : "No scanned answer sheets saved for this course yet. Scan completed sheets to review their circles.";
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
  csvButton.disabled = studentSheets.length === 0;
  csvButton.hidden = studentSheets.length === 0;
  if (annotatedSheetsButton) {
    const exportableSheets = studentSheets.filter((sheet) => sheet.annotatedPage instanceof Blob ||
      (sheet.rawScanVersion === RAW_SCAN_VERSION && sheet.rawPage instanceof Blob && !isStaleStandaloneScan(sheet)));
    annotatedSheetsButton.disabled = exportableSheets.length === 0;
    annotatedSheetsButton.hidden = exportableSheets.length === 0;
  }
  const issueNote = pageIssues.length ? ` · ${pageIssues.length} page/file issue(s) reported during scan` : "";
  if (!formSheets.length) {
    gradeSummary.textContent = `${scanSet.sourceName || "Scan set"}: no student scans.${issueNote}`;
  } else {
    gradeSummary.textContent = `${scanSet.sourceName || "Scan set"} · ${studentSheets.length} student scan(s) ready for answer review.${issueNote}`;
  }
  renderSetAnswerKeyOptions();
  setGradeDetailTab(gradeDetailTab);
}

function analysisConfigForForm(formId) {
  const stored = analysisConfigByForm[formId];
  const scheme = stored?.scheme === "masters" ? "masters" : "undergraduate";
  return { ...(scheme === "masters" ? DEFAULT_MASTERS_CLASSES : DEFAULT_ANALYSIS_CLASSES), scheme };
}

function validAnalysisAnswer(answer) {
  return isResolvedAnswer(answer);
}

function analysisRecords() {
  const scanSet = scanSets.find((item) => item.id === selectedScanSetId);
  if (!scanSet) return { key: null, records: [], questionCount: 0 };
  const keyId = answerKeyByScanSet[scanSet.id];
  const key = sheetResults.find((sheet) => sheet.id === keyId && sheet.formId === scanSet.formId) || null;
  const keyAnswers = completeAnswerKeyAnswers(key);
  if (!keyAnswers) return { key: null, records: [], questionCount: 0 };
  const sheets = sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId && !isDummyAnswerKey(sheet) && sheet.id !== key.id);
  const records = sheets.map((sheet, index) => {
    const grade = gradeForSheet(sheet, key);
    const total = grade.total;
    return { sheet, grade, total, percentage: total ? (grade.correct / total) * 100 : 0, index,
      name: studentNameFor(sheet) };
  });
  const questionCount = [...keyAnswers.keys()].filter((question) => !isQuestionDiscountedForAll(scanSet.id, question)).length;
  return { scanSet, key, keyAnswers, records, questionCount };
}

function analysisClassForPercentage(value, config) {
  if (config.scheme === "masters") {
    if (value >= config.first) return { label: "Distinction", className: "first" };
    if (value >= config.upperSecond) return { label: "Merit", className: "upper-second" };
    if (value >= config.lowerSecond) return { label: "Pass", className: "lower-second" };
    return { label: "Fail", className: "fail" };
  }
  if (value >= config.first) return { label: "1st", className: "first" };
  if (value >= config.upperSecond) return { label: "II.1", className: "upper-second" };
  if (value >= config.lowerSecond) return { label: "II.2", className: "lower-second" };
  if (value >= config.third) return { label: "3rd", className: "third" };
  if (value >= config.compensatory) return { label: "Compensatory pass", className: "compensatory" };
  return { label: "Fail", className: "fail" };
}

function analysisClassDefinitions(config) {
  if (config.scheme === "masters") return [[config.first, "Distinction"], [config.upperSecond, "Merit"], [config.lowerSecond, "Pass"]];
  return [[config.first, "1st"], [config.upperSecond, "II.1"], [config.lowerSecond, "II.2"], [config.third, "3rd"], [config.compensatory, "Compensatory pass"]];
}

function analysisItems(data) {
  const { scanSet, records, keyAnswers, questionCount } = data;
  const ranked = [...records].sort((a, b) => b.percentage - a.percentage || String(a.sheet.id).localeCompare(String(b.sheet.id)) || a.index - b.index);
  const groupSize = Math.max(1, Math.floor(ranked.length * 0.27));
  const upper = ranked.slice(0, groupSize);
  const lower = ranked.slice(Math.max(groupSize, ranked.length - groupSize));
  return Array.from({ length: questionCount }, (_, offset) => offset + 1)
    .filter((question) => !isQuestionDiscountedForAll(scanSet.id, question)).map((question) => {
    const keyedAnswers = keyAnswers.get(question) || [];
    const rule = ruleForQuestion(scanSet.id, question, keyedAnswers);
    const valid = records.filter((record) => validAnalysisAnswer(record.sheet.answers?.find((answer) => answer.question === question)));
    const correct = valid.filter((record) => evaluateAnswerSet(
      record.sheet.answers.find((answer) => answer.question === question), keyedAnswers, rule,
    ).status === "correct").length;
    const options = {};
    for (const record of valid) {
      const response = record.sheet.answers.find((answer) => answer.question === question);
      for (const label of selectedLabelsForAnswer(response)) options[label] = (options[label] || 0) + 1;
    }
    const groupRate = (group) => {
      const groupValid = group.filter((record) => validAnalysisAnswer(record.sheet.answers?.find((answer) => answer.question === question)));
      if (!groupValid.length) return null;
      const hits = groupValid.filter((record) => evaluateAnswerSet(
        record.sheet.answers.find((answer) => answer.question === question), keyedAnswers, rule,
      ).status === "correct").length;
      return { rate: hits / groupValid.length, valid: groupValid.length };
    };
    const upperRate = groupRate(upper); const lowerRate = groupRate(lower);
    const discrimination = upperRate && lowerRate ? upperRate.rate - lowerRate.rate : null;
    return { question, keyedAnswers, rule, validCount: valid.length, unresolvedCount: records.length - valid.length,
      correctCount: correct, percentage: valid.length ? (correct / valid.length) * 100 : null, options,
      discrimination, upperRate, lowerRate, groupSize, cohortSize: records.length };
  });
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function chartSvg(container, width, height) {
  container.replaceChildren();
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", focusable: "false" });
  container.append(svg);
  return svg;
}

function chartText(svg, text, x, y, attrs = {}) {
  const node = svgElement("text", { x, y, ...attrs }); node.textContent = text; svg.append(node); return node;
}

function chartGrid(svg, left, top, plotWidth, plotHeight, max, ticks, format = (value) => String(value)) {
  for (let index = 0; index <= ticks; index += 1) {
    const value = max * index / ticks; const y = top + plotHeight - (value / max) * plotHeight;
    svg.append(svgElement("line", { x1: left, x2: left + plotWidth, y1: y, y2: y, class: "analysis-grid-line" }));
    chartText(svg, format(value), left - 8, y + 4, { class: "analysis-axis-label", "text-anchor": "end" });
  }
}

function bindChartMark(mark, tooltipData) {
  mark.tabIndex = 0;
  mark.setAttribute("tabindex", "0");
  mark.setAttribute("role", "img");
  const show = (event) => showAnalysisTooltip(event, tooltipData);
  mark.addEventListener("pointerenter", show); mark.addEventListener("focus", show);
  mark.addEventListener("pointerleave", hideAnalysisTooltip); mark.addEventListener("blur", hideAnalysisTooltip);
  const title = svgElement("title"); title.textContent = tooltipData.title; mark.append(title);
}

function showAnalysisTooltip(event, data) {
  if (!analysisTooltip) return;
  analysisTooltip.replaceChildren();
  const title = document.createElement("strong"); title.textContent = data.title; analysisTooltip.append(title);
  for (const line of data.lines || []) { const p = document.createElement("span"); p.textContent = line; analysisTooltip.append(p); }
  analysisTooltip.hidden = false;
  const panelRect = analysisPanel.getBoundingClientRect(); const target = event.currentTarget?.getBoundingClientRect?.();
  if (target) { analysisTooltip.style.left = `${Math.max(8, target.left - panelRect.left + target.width / 2)}px`; analysisTooltip.style.top = `${Math.max(8, target.top - panelRect.top - 8)}px`; }
}
function hideAnalysisTooltip() { if (analysisTooltip) analysisTooltip.hidden = true; }

function renderAnalysisSummary(data, config) {
  const values = data.records.map((record) => record.percentage).sort((a, b) => a - b);
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const median = values.length ? values[Math.floor(values.length / 2)] : 0;
  const deviation = values.length ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) : 0;
  const classes = [...analysisClassDefinitions(config).map(([, label]) => label), "Fail"].map((label) => ({ label, count: data.records.filter((record) => analysisClassForPercentage(record.percentage, config).label === label).length }));
  analysisSummaryCards.replaceChildren();
  for (const metric of [["Students", values.length], ["Mean", `${mean.toFixed(1)}%`], ["Median", `${median.toFixed(1)}%`], ["Spread (SD)", `${deviation.toFixed(1)}%`]]) {
    const card = document.createElement("div"); card.className = "analysis-summary-card"; card.innerHTML = `<span>${metric[0]}</span><strong>${metric[1]}</strong>`; analysisSummaryCards.append(card);
  }
  const classCard = document.createElement("div"); classCard.className = "analysis-summary-card analysis-class-summary";
  const heading = document.createElement("span"); heading.textContent = "Class proportions"; classCard.append(heading);
  const list = document.createElement("div"); list.className = "analysis-class-list";
  for (const item of classes) { const line = document.createElement("span"); line.textContent = `${item.label}: ${values.length ? ((item.count / values.length) * 100).toFixed(1) : "0.0"}%`; list.append(line); }
  classCard.append(list); analysisSummaryCards.append(classCard);
}

function renderScoreDistribution(data, config) {
  const width = Math.max(320, analysisCharts.score.clientWidth || 680), height = 250, left = 48, top = 40, bottom = 42, plotHeight = height - top - bottom, plotWidth = width - left - 18;
  const bins = Array.from({ length: 10 }, (_, index) => ({ index, count: 0 }));
  for (const record of data.records) {
    const index = Math.min(9, Math.max(0, Math.floor(record.percentage / 10)));
    bins[index].count += 1;
  }
  const max = analysisScaleState.score === "cohort" ? Math.max(1, data.records.length) : Math.max(1, ...bins.map((bin) => bin.count));
  const svg = chartSvg(analysisCharts.score, width, height);
  chartGrid(svg, left, top, plotWidth, plotHeight, max, 4, (value) => `${Math.round(value)}`);
  const thresholds = analysisClassDefinitions(config);
  const thresholdRows = [];
  for (const [threshold, label] of [...thresholds].sort((a, b) => a[0] - b[0])) {
    const x = left + (threshold / 100) * plotWidth;
    svg.append(svgElement("line", { x1: x, x2: x, y1: top, y2: top + plotHeight, class: "analysis-threshold-line" }));
    const text = `${label === "Compensatory pass" ? "Comp." : label} ${threshold}%`;
    const estimatedWidth = Math.max(34, text.length * 5.8);
    let row = thresholdRows.findIndex((end) => x - estimatedWidth / 2 > end + 4);
    if (row < 0) { row = thresholdRows.length; thresholdRows.push(0); }
    thresholdRows[row] = x + estimatedWidth / 2;
    const labelX = Math.max(left + estimatedWidth / 2, Math.min(left + plotWidth - estimatedWidth / 2, x));
    chartText(svg, text, labelX, 14 + row * 14, { class: "analysis-threshold-label", "text-anchor": "middle" });
  }
  const slot = plotWidth / bins.length; const barWidth = Math.max(8, slot - 8);
  bins.forEach((bin) => { const x = left + bin.index * slot + 4; const barHeight = bin.count / max * plotHeight; const rect = svgElement("rect", { x, y: top + plotHeight - barHeight, width: barWidth, height: Math.max(1, barHeight), rx: 4, class: "analysis-bar histogram" }); svg.append(rect); const range = bin.index === 9 ? "90–100%" : `${bin.index * 10}–${bin.index * 10 + 9}%`; bindChartMark(rect, { title: range, lines: [`${bin.count} student${bin.count === 1 ? "" : "s"}`] }); chartText(svg, `${bin.index * 10}%`, x + barWidth / 2, height - 14, { class: "analysis-axis-label", "text-anchor": "middle" }); });
}

function renderItemChart(items) {
  const width = Math.max(680, items.length * 34 + 70), height = 260, left = 44, top = 18, bottom = 42, plotHeight = height - top - bottom, plotWidth = width - left - 14;
  const svg = chartSvg(analysisCharts.item, width, height); const values = items.map((item) => item.percentage).filter((value) => Number.isFinite(value)); const max = analysisScaleState.item === "full" ? 100 : Math.max(10, Math.ceil(Math.max(...values, 1) / 10) * 10);
  chartGrid(svg, left, top, plotWidth, plotHeight, max, 5, (value) => `${Math.round(value)}%`); const slot = plotWidth / Math.max(items.length, 1); const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const avgY = top + plotHeight - (average / max) * plotHeight; svg.append(svgElement("line", { x1: left, x2: left + plotWidth, y1: avgY, y2: avgY, class: "analysis-average-line" })); chartText(svg, `Average ${average.toFixed(1)}%`, left + plotWidth - 4, Math.max(top + 12, avgY - 5), { class: "analysis-axis-label", "text-anchor": "end" });
  items.forEach((item, index) => { const value = item.percentage ?? 0; const barHeight = value / max * plotHeight; const rect = svgElement("rect", { x: left + index * slot + 5, y: top + plotHeight - barHeight, width: Math.max(10, slot - 10), height: barHeight, rx: 3, class: "analysis-bar item" }); svg.append(rect); bindChartMark(rect, { title: `Question ${item.question}`, lines: [`${item.percentage === null ? "No valid responses" : `${value.toFixed(1)}% correct`}`, `Valid responses: ${item.validCount}`, `Excluded: ${item.unresolvedCount}`] }); chartText(svg, String(item.question), left + index * slot + slot / 2, height - 14, { class: "analysis-axis-label", "text-anchor": "middle" }); });
}

function discriminationBand(value) { if (value === null) return "insufficient"; if (value >= 0.35) return "excellent"; if (value >= 0.25) return "good"; if (value >= 0.20) return "acceptable"; return "poor"; }
function renderDiscriminationChart(items) {
  const width = Math.max(680, items.length * 34 + 70), height = 280, left = 44, top = 18, bottom = 42, plotHeight = height - top - bottom, plotWidth = width - left - 14;
  const svg = chartSvg(analysisCharts.discrimination, width, height); const values = items.map((item) => item.discrimination ?? 0); const maxAbs = analysisScaleState.discrimination === "full" ? 1 : Math.max(0.1, Math.ceil(Math.max(...values.map((value) => Math.abs(value)), 0.1) * 10) / 10); const zeroY = top + plotHeight / 2;
  for (let index = -2; index <= 2; index += 1) { const value = maxAbs * index / 2; const y = zeroY - (value / maxAbs) * (plotHeight / 2); svg.append(svgElement("line", { x1: left, x2: left + plotWidth, y1: y, y2: y, class: index === 0 ? "analysis-zero-line" : "analysis-grid-line" })); chartText(svg, value.toFixed(1), left - 8, y + 4, { class: "analysis-axis-label", "text-anchor": "end" }); }
  const slot = plotWidth / Math.max(items.length, 1); items.forEach((item, index) => { const value = item.discrimination ?? 0; const barHeight = Math.abs(value / maxAbs) * plotHeight / 2; const rect = svgElement("rect", { x: left + index * slot + 5, y: value >= 0 ? zeroY - barHeight : zeroY, width: Math.max(10, slot - 10), height: Math.max(1, barHeight), rx: 3, class: `analysis-bar discrimination ${discriminationBand(item.discrimination)}` }); svg.append(rect); const band = discriminationBand(item.discrimination); bindChartMark(rect, { title: `Question ${item.question}`, lines: [item.discrimination === null ? "Insufficient data" : `Discrimination: ${value.toFixed(3)} · ${band}`, `Upper valid: ${item.upperRate?.valid || 0}`, `Lower valid: ${item.lowerRate?.valid || 0}`, `Excluded from item: ${item.unresolvedCount}`] }); chartText(svg, String(item.question), left + index * slot + slot / 2, height - 14, { class: "analysis-axis-label", "text-anchor": "middle" }); });
}

function renderOptionChart(items) {
  const width = Math.max(680, items.length * 34 + 70), height = 280, left = 44, top = 18, bottom = 42, plotHeight = height - top - bottom, plotWidth = width - left - 14, slot = plotWidth / Math.max(items.length, 1);
  const svg = chartSvg(analysisCharts.option, width, height); chartGrid(svg, left, top, plotWidth, plotHeight, 100, 5, (value) => `${Math.round(value)}%`);
  items.forEach((item, index) => { let y = top + plotHeight; const options = Object.entries(item.options).sort((a, b) => a[0].localeCompare(b[0])); for (const [option, count] of options) { const percent = item.validCount ? count / item.validCount * 100 : 0; const h = percent / 100 * plotHeight; y -= h; const keyed = item.keyedAnswers.includes(option); const rect = svgElement("rect", { x: left + index * slot + 5, y, width: Math.max(10, slot - 10), height: Math.max(h, 1), class: `analysis-option ${keyed ? "keyed" : ""}` }); svg.append(rect); bindChartMark(rect, { title: `Question ${item.question} · ${option}`, lines: [`${percent.toFixed(1)}% (${count})`, keyed ? `Keyed answer · ${item.rule === "any" ? "any keyed" : "all keyed"}` : "Distractor", `Valid responses: ${item.validCount}`, `Excluded: ${item.unresolvedCount}`] }); } chartText(svg, String(item.question), left + index * slot + slot / 2, height - 14, { class: "analysis-axis-label", "text-anchor": "middle" }); });
}

function renderAnalysisThresholds(formId) {
  const config = analysisConfigForForm(formId);
  if (analysisSchemeSelect) analysisSchemeSelect.value = config.scheme;
}

function renderAnalysisWorkspace() {
  if (!analysisPanel) return;
  const data = analysisRecords();
  if (!data.key) { analysisUnavailable.textContent = "Analysis is unavailable until a complete answer key is selected for this scan set."; analysisUnavailable.hidden = false; analysisContent.hidden = true; return; }
  analysisUnavailable.hidden = true; analysisContent.hidden = false;
  const config = analysisConfigForForm(data.key.formId); renderAnalysisThresholds(data.key.formId); renderAnalysisSummary(data, config);
  const items = analysisItems(data); renderScoreDistribution(data, config); renderItemChart(items); renderDiscriminationChart(items); renderOptionChart(items);
}

function exportAnalysisPdf() {
  if (!analysisContent || analysisContent.hidden) return;
  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("title", "Analysis PDF export");
  printFrame.setAttribute("aria-hidden", "true");
  Object.assign(printFrame.style, {
    position: "fixed", left: "-12000px", top: "0", width: "1120px", height: "800px",
    border: "0", opacity: "0", pointerEvents: "none",
  });
  document.body.append(printFrame);
  const printWindow = printFrame.contentWindow;
  if (!printWindow) { printFrame.remove(); return; }
  const report = analysisContent.cloneNode(true);
  report.hidden = false;
  report.querySelector(".analysis-thresholds")?.remove();
  report.querySelectorAll(".analysis-card-heading label").forEach((label) => label.remove());
  const scanSet = scanSets.find((item) => item.id === selectedScanSetId);
  const workspaceTitle = courseKeyData.course_title || "Workspace";
  const reportTitle = `${workspaceTitle} · Analysis`;
  // Browser print dialogs use the document title as the suggested PDF name.
  const pdfDocumentTitle = gradingExportFilename("analysis", "pdf");
  const workspaceLink = workspaceUrl();
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const brandLogo = document.querySelector(".brand img")?.src || new URL("/static/logo.svg", window.location.href).href;
  const courseTitle = document.querySelector(".course-badge")?.textContent?.trim() || "";
  const styles = `
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #172532; font-family: Inter, system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { padding: 0; }
    .report-header { display: flex; justify-content: space-between; align-items: end; gap: 8mm; border-bottom: 2px solid #159c90; padding: 0 0 5mm; margin-bottom: 7mm; }
    .report-brand { display: flex; align-items: center; gap: 4mm; }
    .report-brand img { width: 15mm; height: 15mm; }
    .report-brand strong { display: block; color: #08786f; font-size: 12pt; }
    .report-brand p { margin: 1mm 0 0; color: #526474; font-size: 8pt; }
    .report-header > div:last-child { min-width: 0; flex: 1; text-align: right; }
    .report-header h1 { margin: 0; max-width: 100%; font-size: 24pt; line-height: 1.08; letter-spacing: -.02em; overflow-wrap: anywhere; }
    .report-header > div:last-child p { margin: 1mm 0 0; color: #526474; font-size: 9pt; }
    .report-workspace-url { overflow-wrap: anywhere; }
    .analysis-toolbar { display: none !important; }
    .analysis-summary-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm; margin-bottom: 7mm; }
    .analysis-summary-card { background: #f5f8fa; border: 1px solid #8da1af; border-radius: 3mm; padding: 4mm; min-height: 20mm; }
    .analysis-summary-card span { display: block; color: #526474; font-size: 8pt; }
    .analysis-summary-card strong { display: block; font-size: 16pt; margin-top: 1mm; }
    .analysis-class-summary { grid-column: span 2; }
    .analysis-class-list { display: flex; flex-wrap: wrap; gap: 1mm 4mm; color: #263b4a; font-size: 8pt; margin-top: 2mm; }
    .analysis-card { background: #fff; border: 1px solid #8da1af; border-radius: 3mm; padding: 5mm; margin: 0; break-inside: avoid; page-break-inside: avoid; }
    .analysis-card + .analysis-card { break-before: page; page-break-before: always; }
    .analysis-card-heading { display: block; }
    .analysis-card h4 { margin: 0 0 1mm; font-size: 15pt; }
    .analysis-card-heading p { margin: 0; color: #526474; font-size: 8pt; }
    .analysis-legend { display: flex; gap: 4mm; margin-top: 2mm; font-size: 8pt; }
    .analysis-chart { min-height: 0; margin-top: 4mm; overflow: visible; }
    .analysis-chart svg { width: 100% !important; min-width: 0 !important; max-height: 145mm; }
    .analysis-tooltip { display: none !important; }
    .analysis-axis-label { fill: #263b4a; font-size: 9px; }
    .analysis-grid-line { stroke: #d6e0e6; stroke-width: 1; }
    .analysis-zero-line { stroke: #526474; stroke-width: 1.2; }
    .analysis-average-line { stroke: #b66a00; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .analysis-threshold-line { stroke: #b66a00; stroke-width: 1.2; stroke-dasharray: 4 3; }
    .analysis-threshold-label { fill: #8a4f00; font-size: 8px; font-weight: 700; }
    .analysis-bar.histogram, .analysis-bar.item { fill: #159c90; }
    .analysis-bar.discrimination.excellent { fill: #08786f; }
    .analysis-bar.discrimination.good { fill: #247ca0; }
    .analysis-bar.discrimination.acceptable { fill: #a66b00; }
    .analysis-bar.discrimination.poor { fill: #b13c49; }
    .analysis-bar.discrimination.insufficient { fill: #647684; }
    .analysis-option { fill: #8aa9c4; stroke: transparent; stroke-width: 2; }
    .analysis-option.keyed { stroke: #b66a00; stroke-width: 2; }
    .analysis-method-note { margin-top: 5mm; padding: 3mm; border-left: 1mm solid #159c90; background: #f2f6f8; color: #263b4a; break-inside: avoid; page-break-inside: avoid; overflow-wrap: anywhere; }
    .analysis-method-note strong { color: #08786f; }
    .analysis-method-note p { margin: 1mm 0 0; line-height: 1.35; }
  `;
  let printed = false;
  let cleaned = false;
  const cleanup = () => { if (!cleaned) { cleaned = true; printFrame.remove(); } };
  const startPrint = () => {
    if (printed) return;
    printed = true;
    printWindow.focus();
    printWindow.print();
    window.setTimeout(cleanup, 60000);
  };
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  printFrame.addEventListener("load", () => window.setTimeout(startPrint, 300), { once: true });
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(pdfDocumentTitle)}</title><style>${styles}</style></head><body><header class="report-header"><div class="report-brand"><img src="${escapeHtml(brandLogo)}" alt=""><div><strong>Print Scan Grade</strong><p>${escapeHtml(courseTitle)}</p></div></div><div><h1>${escapeHtml(reportTitle)}</h1><p>Landscape analysis report${scanSet?.sourceName ? ` · ${escapeHtml(scanSet.sourceName)}` : ""}</p><p class="report-workspace-url">Workspace: ${escapeHtml(workspaceLink)}</p></div></header>${report.innerHTML}</body></html>`);
  printWindow.document.close();
  // Some browsers do not dispatch iframe load after document.write; retain a
  // short fallback while keeping the export within the user click gesture.
  window.setTimeout(startPrint, 900);
}

function setGradeDetailTab(tab) {
  gradeDetailTab = tab === "analysis" ? "analysis" : "students";
  const isAnalysis = gradeDetailTab === "analysis";
  studentsTab?.classList.toggle("is-active", !isAnalysis); analysisTab?.classList.toggle("is-active", isAnalysis);
  studentsTab?.setAttribute("aria-selected", String(!isAnalysis)); analysisTab?.setAttribute("aria-selected", String(isAnalysis));
  studentsPanel.hidden = isAnalysis; analysisPanel.hidden = !isAnalysis;
  if (isAnalysis) renderAnalysisWorkspace(); else renderRosterTable();
}

studentsTab?.addEventListener("click", () => setGradeDetailTab("students"));
analysisTab?.addEventListener("click", () => setGradeDetailTab("analysis"));
analysisPdfExport?.addEventListener("click", exportAnalysisPdf);
for (const [key, select] of Object.entries(analysisScaleSelects)) select?.addEventListener("change", () => { analysisScaleState[key] = select.value; renderAnalysisWorkspace(); });
analysisSchemeSelect?.addEventListener("change", async () => {
  if (selectedGradeFormId) {
    analysisConfigByForm[selectedGradeFormId] = { scheme: analysisSchemeSelect.value === "masters" ? "masters" : "undergraduate" };
    await persistScanState();
    renderAnalysisWorkspace();
  }
});

function getGradeKeyForScan(sheet) {
  const keyId = answerKeyByScanSet[sheet.scanSetId];
  const key = sheetResults.find((candidate) => candidate.id === keyId && candidate.formId === sheet.formId) || null;
  return completeAnswerKeyAnswers(key) ? key : null;
}

function correctAnswersForPreview(sheet) {
  const answerKey = getGradeKeyForScan(sheet);
  if (!answerKey || answerKey.id === sheet.id) return null;
  return completeAnswerKeyAnswers(answerKey);
}

function scoreLabelForScan(sheet) {
  const answerKey = getGradeKeyForScan(sheet);
  if (sheet.rawScanVersion !== RAW_SCAN_VERSION || !answerKey || answerKey.id === sheet.id || !Array.isArray(sheet.answers)) return "—";
  const grade = gradeForSheet(sheet, answerKey);
  return `${grade.correct}/${grade.total}`;
}

function percentageLabelForScan(sheet) {
  const answerKey = getGradeKeyForScan(sheet);
  if (sheet.rawScanVersion !== RAW_SCAN_VERSION || !answerKey || answerKey.id === sheet.id || !Number(sheet.questionCount)) return "—";
  const grade = gradeForSheet(sheet, answerKey);
  return grade.total ? `${((grade.correct / grade.total) * 100).toFixed(1)}%` : "—";
}

function rosterNumericScore(sheetRecords) {
  const sheet = sheetRecords.find((item) => getGradeKeyForScan(item) && item.rawScanVersion === RAW_SCAN_VERSION);
  if (!sheet) return null;
  const grade = gradeForSheet(sheet, getGradeKeyForScan(sheet));
  return grade.total ? grade.correct / grade.total : null;
}

function compareRosterRows(left, right) {
  const leftValue = rosterSortKey === "name" ? left.name : rosterNumericScore(left.sheetRecords);
  const rightValue = rosterSortKey === "name" ? right.name : rosterNumericScore(right.sheetRecords);
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue === null && rightValue === null) return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  const comparison = typeof leftValue === "string"
    ? leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" })
    : leftValue - rightValue;
  return rosterSortDirection === "asc" ? comparison : -comparison;
}

function updateRosterSortIndicators() {
  for (const button of rosterSortButtons) {
    const active = button.dataset.rosterSort === rosterSortKey;
    button.textContent = `${button.dataset.label} ${active ? (rosterSortDirection === "asc" ? "↑" : "↓") : "↕"}`;
    button.setAttribute("aria-label", `Sort by ${button.dataset.label} ${active && rosterSortDirection === "desc" ? "ascending" : "descending"}`);
    button.closest("th")?.setAttribute("aria-sort", active ? (rosterSortDirection === "asc" ? "ascending" : "descending") : "none");
  }
}

for (const button of rosterSortButtons) {
  button.addEventListener("click", () => {
    const key = button.dataset.rosterSort;
    if (key === rosterSortKey) rosterSortDirection = rosterSortDirection === "asc" ? "desc" : "asc";
    else {
      rosterSortKey = key;
      rosterSortDirection = "asc";
    }
    updateRosterSortIndicators();
    renderRosterTable();
  });
}
updateRosterSortIndicators();

function renderRosterTable() {
  rosterRows.replaceChildren();
  const learnerScans = new Map(courseRoster.map((learner) => [learner.student_id, []]));
  const unidentified = unidentifiedSheetsForSelectedScanSet();
  const inferredCount = sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId &&
    inferredRosterLearner(sheet)).length;
  for (const sheet of sheetResults) {
    if (sheet.scanSetId !== selectedScanSetId) continue;
    if (isDummyAnswerKey(sheet)) continue;
    const learner = matchedLearner(sheet);
    if (learner) {
      if (!learnerScans.has(learner.student_id)) learnerScans.set(learner.student_id, []);
      learnerScans.get(learner.student_id).push(sheet);
    }
  }
  if (matchingSummary) matchingSummary.textContent = `${courseRoster.length} roster students · ${unidentified.length} unidentified scan${unidentified.length === 1 ? "" : "s"} remaining${inferredCount ? ` · ${inferredCount} automatically matched from ID` : ""}`;
  if (resolveStudentsButton) resolveStudentsButton.disabled = unidentified.length === 0;
  if (!courseRoster.length && !unidentified.length) {
    appendRosterMessage("No active students are available from the course roster.");
    return;
  }
  const rows = courseRoster.map((learner) => {
    const scans = learnerScans.get(learner.student_id) || [];
    return { name: rosterDisplayName(learner), learner, sheetRecords: scans, unidentified: false };
  });
  for (const [studentId, scans] of learnerScans) {
    if (courseRoster.some((learner) => learner.student_id === studentId) || !scans.length) continue;
    const learner = manuallyMatchedLearner(scans[0]);
    if (learner) rows.push({ name: rosterDisplayName(learner), learner, sheetRecords: scans, unidentified: false });
  }
  for (const [index, sheet] of unidentified.entries()) {
    const candidates = rosterCandidates(sheet);
    const partialCandidates = partialIdCandidates(sheet);
    const nearCandidates = nearIdCandidates(sheet);
    const rosterNote = candidates.length > 1
      ? `IDs match multiple roster students: ${candidates.map((learner) => learner.name).join(", ")}`
      : !courseRoster.length ? "Course roster unavailable for cross-reference"
        : partialCandidates.length === 1
            ? `Possible roster match for ${sheet.bubbleIdRaw}: ${rosterSearchLabel(partialCandidates[0])} — confirm before assigning`
            : partialCandidates.length > 1
              ? `${partialCandidates.length} roster IDs match ${sheet.bubbleIdRaw}; review before assigning`
              : nearCandidates.length
                ? `${nearCandidates.length} possible roster ID${nearCandidates.length === 1 ? "" : "s"} differ by one digit; confirm against the scan`
                : sheet.studentId ? `ID ${sheet.studentId} not on course roster` : "No confirmed roster ID";
    const idNote = [sheet.idMatchStatus,
      sheet.bubbleStudentId ? `ID bubbles ${sheet.bubbleStudentId}`
        : sheet.bubbleIdRaw ? `ID bubbles ${sheet.bubbleIdRaw}`
          : sheet.writtenStudentId ? `ID boxes ${sheet.writtenStudentId}` : "ID unreadable",
      rosterNote]
      .filter(Boolean).join(" · ");
    rows.push({ name: "Student not identified", sheet, sheetRecords: [sheet], idNote,
      nextSheetId: unidentified[index + 1]?.id || "", unidentified: true });
  }
  rows.sort(compareRosterRows);
  for (const rowData of rows) {
    if (rowData.unidentified) {
      appendUnidentifiedRosterRow(rowData.sheet, rowData.idNote, rowData.nextSheetId);
      continue;
    }
    const scans = rowData.sheetRecords;
    appendRosterRow(rowData.name, scans.length ? scans.map(scoreLabelForScan).join("; ") : "—",
      scans.length ? scans.map(percentageLabelForScan).join("; ") : "—", scans);
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

function appendRosterRow(name, score, percentage, sheetRecords = []) {
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
    const inferredSheet = sheetRecords.find((sheet) => inferredRosterLearner(sheet));
    if (inferredSheet) {
      const note = document.createElement("small");
      note.className = "roster-identity-note";
      note.textContent = `Automatically matched from eight ID digits (${inferredSheet.bubbleIdRaw}); change if incorrect.`;
      const confirmLink = document.createElement("a");
      confirmLink.href = "#roster-assignment";
      confirmLink.className = "unidentified-preview-link";
      confirmLink.textContent = "Change match";
      confirmLink.addEventListener("click", (event) => {
        event.preventDefault();
        openUnidentifiedDialog(inferredSheet);
      });
      nameCell.append(note, confirmLink);
    }
  } else {
    nameCell.textContent = name;
  }
  const scoreCell = document.createElement("td");
  scoreCell.textContent = score;
  const percentageCell = document.createElement("td");
  percentageCell.textContent = percentage;
  row.append(nameCell, scoreCell, percentageCell);
  rosterRows.append(row);
}

function rosterSearchLabel(learner) {
  const sisLogin = learner.sis_login_id || "no SIS login";
  return `${rosterDisplayName(learner)} · ${sisLogin} · ${learner.student_id}`;
}

let unidentifiedDialogMatches = [];

function unidentifiedSheetsForSelectedScanSet() {
  return sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId &&
    !isDummyAnswerKey(sheet) && !matchedLearner(sheet));
}

resolveStudentsButton?.addEventListener("click", () => {
  const unidentified = unidentifiedSheetsForSelectedScanSet();
  if (unidentified.length) openUnidentifiedDialog(unidentified[0], unidentified[1]?.id || "");
});

function updateUnidentifiedDialogMatches() {
  const query = unidentifiedSearch.value.trim().toLocaleLowerCase();
  const narrowed = query ? [] : suggestedRosterCandidates(unidentifiedDialogSheet);
  unidentifiedDialogMatches = (narrowed.length ? narrowed : courseRoster).filter((learner) =>
    rosterSearchLabel(learner).toLocaleLowerCase().includes(query));
  unidentifiedMatch.replaceChildren(new Option(
    unidentifiedDialogMatches.length ? "Choose student" : "No matching students", ""));
  for (const learner of unidentifiedDialogMatches) {
    unidentifiedMatch.add(new Option(rosterSearchLabel(learner), learner.student_id));
  }
  unidentifiedMatch.disabled = unidentifiedDialogMatches.length === 0;
  if (unidentifiedDialogMatches.length === 1) unidentifiedMatch.value = unidentifiedDialogMatches[0].student_id;
  unidentifiedAssign.disabled = !unidentifiedMatch.value;
}

async function createIdentityAreaPreviews(sheet) {
  if (!(sheet?.rawPage instanceof Blob)) return null;
  const bitmap = await createImageBitmap(sheet.rawPage);
  const scale = bitmap.width / A4.width;
  const crop = (left, top, width, height) => {
    const sourceX = Math.max(0, Math.round(left * scale));
    const sourceY = Math.max(0, Math.round(top * scale));
    const sourceWidth = Math.max(1, Math.min(bitmap.width - sourceX, Math.round(width * scale)));
    const sourceHeight = Math.max(1, Math.min(bitmap.height - sourceY, Math.round(height * scale)));
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    canvas.getContext("2d").drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, sourceWidth, sourceHeight);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The identity preview could not be created.")), "image/png");
    });
  };
  try {
    return {
      writtenId: await crop(48, 119, 230, 70),
      name: await crop(287 - 14, A4.height - 620 - 36 - 20, 281 + 28, 36 + 34),
    };
  } finally { bitmap.close(); }
}

function closeUnidentifiedDialog() {
  if (unidentifiedNameObjectUrl) URL.revokeObjectURL(unidentifiedNameObjectUrl);
  if (unidentifiedIdObjectUrl) URL.revokeObjectURL(unidentifiedIdObjectUrl);
  unidentifiedNameObjectUrl = "";
  unidentifiedIdObjectUrl = "";
  unidentifiedNameImage.removeAttribute("src");
  unidentifiedIdImage?.removeAttribute("src");
  unidentifiedDialogSheet = null;
  unidentifiedDialog.close();
}

async function openUnidentifiedDialog(sheet, nextSheetId = "") {
  unidentifiedDialogSheet = sheet;
  unidentifiedDialogNextId = nextSheetId;
  const inferred = inferredRosterLearner(sheet);
  unidentifiedDialogTitle.textContent = inferred ? "Change inferred student match" : "Student not identified";
  const unidentified = unidentifiedSheetsForSelectedScanSet();
  const position = unidentified.findIndex((item) => item.id === sheet.id);
  if (unidentifiedRemaining) unidentifiedRemaining.textContent =
    inferred ? `${unidentified.length} unidentified scans remain · This match was accepted automatically`
      : `Reviewing ${position < 0 ? 1 : position + 1} of ${unidentified.length} unidentified scans · ${unidentified.length} remain`;
  const partialCandidates = partialIdCandidates(sheet);
  const nearCandidates = nearIdCandidates(sheet);
  const suggestion = partialCandidates.length === 1
    ? ` · Eight ID digits match ${rosterSearchLabel(partialCandidates[0])}`
    : partialCandidates.length > 1
      ? ` · ${partialCandidates.length} roster IDs fit ${sheet.bubbleIdRaw}; review the scan`
      : nearCandidates.length
        ? ` · ${nearCandidates.length} roster ID${nearCandidates.length === 1 ? "" : "s"} differ by one digit from ${sheet.bubbleIdRaw || sheet.studentId}`
      : "";
  unidentifiedDialogMeta.textContent = `${sheet.sourceFile} · page ${sheet.pageNo}${suggestion}`;
  unidentifiedSearch.value = "";
  updateUnidentifiedDialogMatches();
  unidentifiedNameStatus.hidden = true;
  unidentifiedNameImage.alt = "Name area from unidentified scanned sheet";
  if (unidentifiedNameObjectUrl) URL.revokeObjectURL(unidentifiedNameObjectUrl);
  if (unidentifiedIdObjectUrl) URL.revokeObjectURL(unidentifiedIdObjectUrl);
  unidentifiedNameObjectUrl = "";
  unidentifiedIdObjectUrl = "";
  unidentifiedNameImage.removeAttribute("src");
  unidentifiedIdImage?.removeAttribute("src");
  unidentifiedDialog.showModal();
  queueMicrotask(() => unidentifiedSearch.focus());
  try {
    const preview = await createIdentityAreaPreviews(sheet);
    if (unidentifiedDialogSheet !== sheet) return;
    if (!preview) {
      unidentifiedNameStatus.textContent = "Identity preview is unavailable; use Review scan for the full page.";
      unidentifiedNameStatus.hidden = false;
      return;
    }
    unidentifiedIdObjectUrl = URL.createObjectURL(preview.writtenId);
    if (unidentifiedIdImage) unidentifiedIdImage.src = unidentifiedIdObjectUrl;
    unidentifiedNameObjectUrl = URL.createObjectURL(preview.name);
    unidentifiedNameImage.src = unidentifiedNameObjectUrl;
  } catch (error) {
    if (unidentifiedDialogSheet !== sheet) return;
    unidentifiedNameStatus.textContent = error.message;
    unidentifiedNameStatus.hidden = false;
  }
}

async function assignUnidentifiedDialogStudent() {
  const learner = courseRoster.find((candidate) => candidate.student_id === unidentifiedMatch.value);
  if (!learner || !unidentifiedDialogSheet) return;
  const assignedSheet = unidentifiedDialogSheet;
  const nextSheet = sheetResults.find((sheet) => sheet.id === unidentifiedDialogNextId);
  saveManualStudentMatch(assignedSheet, learner);
  await persistScanState();
  closeUnidentifiedDialog();
  renderRosterTable();
  if (nextSheet) queueMicrotask(() => openUnidentifiedDialog(nextSheet, findNextUnidentifiedSheetId(nextSheet.id)));
}

function findNextUnidentifiedSheetId(currentId) {
  const unidentified = unidentifiedSheetsForSelectedScanSet();
  const index = unidentified.findIndex((sheet) => sheet.id === currentId);
  return index >= 0 ? unidentified[index + 1]?.id || "" : "";
}

unidentifiedSearch?.addEventListener("input", updateUnidentifiedDialogMatches);
unidentifiedSearch?.addEventListener("keydown", async (event) => {
  if (event.key === "ArrowDown" && unidentifiedDialogMatches.length > 1) {
    event.preventDefault();
    unidentifiedMatch.focus();
  } else if (event.key === "Enter") {
    event.preventDefault();
    await assignUnidentifiedDialogStudent();
  }
});
unidentifiedMatch?.addEventListener("change", () => { unidentifiedAssign.disabled = !unidentifiedMatch.value; });
unidentifiedMatch?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await assignUnidentifiedDialogStudent();
});
unidentifiedAssign?.addEventListener("click", assignUnidentifiedDialogStudent);
$("#unidentified-skip")?.addEventListener("click", () => {
  if (!unidentifiedDialogSheet) return;
  const nextId = findNextUnidentifiedSheetId(unidentifiedDialogSheet.id);
  const next = sheetResults.find((sheet) => sheet.id === nextId);
  closeUnidentifiedDialog();
  if (next) queueMicrotask(() => openUnidentifiedDialog(next, findNextUnidentifiedSheetId(next.id)));
});
$("#unidentified-dialog-close")?.addEventListener("click", closeUnidentifiedDialog);
unidentifiedDialog?.addEventListener("cancel", () => {
  if (unidentifiedNameObjectUrl) URL.revokeObjectURL(unidentifiedNameObjectUrl);
  if (unidentifiedIdObjectUrl) URL.revokeObjectURL(unidentifiedIdObjectUrl);
  unidentifiedNameObjectUrl = "";
  unidentifiedIdObjectUrl = "";
  unidentifiedNameImage.removeAttribute("src");
  unidentifiedIdImage?.removeAttribute("src");
  unidentifiedDialogSheet = null;
});

function appendUnidentifiedRosterRow(sheet, idNote, nextSheetId = "") {
  const row = document.createElement("tr");
  const nameCell = document.createElement("td");
  const nameLink = document.createElement("a");
  nameLink.href = "#roster-assignment";
  nameLink.className = "roster-student-link";
  nameLink.textContent = "Student not identified";
  nameLink.setAttribute("aria-label", "Identify this scanned student");
  nameLink.addEventListener("click", (event) => {
    event.preventDefault();
    openUnidentifiedDialog(sheet, nextSheetId);
  });
  const previewLink = document.createElement("a");
  previewLink.href = "#scan-preview";
  previewLink.className = "unidentified-preview-link";
  previewLink.textContent = "Review scan";
  previewLink.addEventListener("click", (event) => {
    event.preventDefault();
    openStudentScans("Student not identified", [sheet]);
  });
  const identityNote = document.createElement("small");
  identityNote.className = "roster-identity-note";
  identityNote.textContent = idNote;
  nameCell.append(nameLink, previewLink, identityNote);

  const scoreCell = document.createElement("td");
  scoreCell.textContent = scoreLabelForScan(sheet);

  const percentageCell = document.createElement("td");
  const percentageText = document.createElement("div");
  percentageText.textContent = percentageLabelForScan(sheet);
  const assignment = document.createElement("div");
  assignment.className = "roster-assignment";
  const label = document.createElement("label");
  label.textContent = "Assign from roster — type to search, then press Enter";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search name, login or number";
  search.autocomplete = "off";
  search.setAttribute("aria-label", "Search course roster");
  const select = document.createElement("select");
  select.className = "review-select";
  select.setAttribute("aria-label", "Matching roster student");
  const assignButton = document.createElement("button");
  assignButton.type = "button";
  assignButton.className = "download-button";
  assignButton.textContent = "Assign";

  let matches = [];
  const updateMatches = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const narrowed = query ? [] : suggestedRosterCandidates(sheet);
    matches = (narrowed.length ? narrowed : courseRoster).filter((learner) =>
      rosterSearchLabel(learner).toLocaleLowerCase().includes(query));
    select.replaceChildren(new Option(matches.length ? "Choose student" : "No matching students", ""));
    for (const learner of matches) select.add(new Option(rosterSearchLabel(learner), learner.student_id));
    select.disabled = matches.length === 0;
    if (matches.length === 1) select.value = matches[0].student_id;
    assignButton.disabled = !select.value;
  };
  search.addEventListener("input", updateMatches);
  select.addEventListener("change", () => { assignButton.disabled = !select.value; });
  const assignSelectedStudent = async () => {
    const learner = courseRoster.find((candidate) => candidate.student_id === select.value);
    if (!learner) return false;
    saveManualStudentMatch(sheet, learner);
    pendingUnidentifiedFocusId = nextSheetId;
    await persistScanState();
    renderRosterTable();
    return true;
  };
  assignButton.addEventListener("click", assignSelectedStudent);
  search.addEventListener("keydown", async (event) => {
    if (event.key === "ArrowDown" && matches.length > 1) {
      event.preventDefault();
      select.focus();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    await assignSelectedStudent();
  });
  select.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await assignSelectedStudent();
  });
  updateMatches();
  label.append(search);
  assignment.append(label, select, assignButton);
  percentageCell.append(percentageText, assignment);
  row.append(nameCell, scoreCell, percentageCell);
  rosterRows.append(row);
  if (pendingUnidentifiedFocusId === sheet.id) {
    pendingUnidentifiedFocusId = "";
    queueMicrotask(() => search.focus());
  }
}

function openStudentScans(name, sheetRecords) {
  if (sheetRecords.length === 1) {
    openScanPreview(sheetRecords[0]);
    return;
  }
  scanPreviewTitle.textContent = `${name} · scanned sheets`;
  scanPreviewMeta.textContent = "Choose a scanned sheet to preview its detected answers.";
  previewedSheetId = "";
  if (scanPreviewSaveAnswers) scanPreviewSaveAnswers.hidden = true;
  updateScanPreviewNavigation(null);
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
  pendingPreviewAnswers.clear();
  if (scanPreviewSaveAnswers) {
    scanPreviewSaveAnswers.hidden = false;
    scanPreviewSaveAnswers.disabled = true;
    scanPreviewSaveAnswers.textContent = "Save answer changes";
  }
  previewedSheetId = sheet.id;
  updateScanPreviewNavigation(sheet);
  scanPreviewTitle.textContent = `${studentNameFor(sheet)} · ${sheet.formTitle}`;
  const answerKey = getGradeKeyForScan(sheet);
  const sheetGrade = answerKey && answerKey.id !== sheet.id ? gradeForSheet(sheet, answerKey) : null;
  const gradeSummaryText = sheetGrade
    ? ` · ${sheetGrade.correct}/${sheetGrade.total} correct`
    : "";
  scanPreviewMeta.textContent = `${sheet.sourceFile} · page ${sheet.pageNo} · ${identitySummary(sheet)}${gradeSummaryText}`;
  const staleStandaloneScan = isStaleStandaloneScan(sheet);
  if (scanPreviewStale) scanPreviewStale.hidden = !staleStandaloneScan;
  originalScanDescription.textContent = staleStandaloneScan
    ? "Old saved browser preview only. It is not the original PDF and may be too faded for reliable reading. Overlays may not reflect manual answer edits."
    : "This is the original scan with diagnostic circle overlays only. Green indicates filled, blue indicates blank, and a red X marks a crossed-out response.";
  originalScanToggle.hidden = false;
  originalScanToggle.disabled = true;
  const hasCurrentRawPage = sheet.rawScanVersion === RAW_SCAN_VERSION && sheet.rawPage instanceof Blob;
  originalScanToggle.textContent = hasCurrentRawPage
    ? "Preparing annotated scan..."
    : "Original scan unavailable · rescan required";
  originalScanToggle.title = hasCurrentRawPage
    ? "Show the scan with detected bubbles annotated."
    : "This scan was saved before original-page previews were added. Scan the PDF again to save its page image.";
  const expectedAnnotationKeyId = correctAnswersForPreview(sheet) ? answerKeyByScanSet[sheet.scanSetId] : "";
  if (staleStandaloneScan && hasCurrentRawPage) {
    showOriginalScanBlob(sheet, sheet.annotatedPage instanceof Blob ? sheet.annotatedPage : sheet.rawPage);
  } else if (hasCurrentRawPage && sheet.annotationVersion === ANNOTATION_VERSION &&
      (sheet.annotationKeyId || "") === expectedAnnotationKeyId && sheet.annotatedPage instanceof Blob) {
    showOriginalScanBlob(sheet, sheet.annotatedPage, sheet.rawPage);
  } else if (hasCurrentRawPage) {
    showOriginalScanBlob(sheet, sheet.rawPage);
    refreshSavedAnnotationsInBackground(new Set([sheet.id])).then(() => {
      if (previewedSheetId === sheet.id && sheet.annotatedPage instanceof Blob) {
        showOriginalScanBlob(sheet, sheet.annotatedPage, sheet.rawPage);
      }
    });
  }
  scanPreviewContent.replaceChildren();
  if (sheet.rawScanVersion !== RAW_SCAN_VERSION) {
    const legacyNotice = document.createElement("p");
    legacyNotice.className = "field-help";
    legacyNotice.textContent = "This saved scan was created by the retired reader; rescan it to create a current answer result.";
    scanPreviewContent.append(legacyNotice);
  }
  if (sheet.rawScanVersion === RAW_SCAN_VERSION && Array.isArray(sheet.answers) && sheet.answers.length) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "scan-results-table-wrap";
    const table = document.createElement("table");
    table.className = "scan-results-table";
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of ["Question", "Scanned answer", "Correct answer", "Result", "Discount"]) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headerRow.append(cell);
    }
    header.append(headerRow);
    const body = document.createElement("tbody");
    const gradedAnswers = sheetGrade?.gradedAnswers || [];
    for (const [index, answer] of sheet.answers.entries()) {
      const row = document.createElement("tr");
      const question = document.createElement("th");
      question.scope = "row";
      question.textContent = String(answer.question);
      const grade = gradedAnswers[index];
      const scanned = document.createElement("td");
      const select = document.createElement("select");
      select.className = "scan-answer-select";
      const selected = selectedLabelsForAnswer(answer);
      const isMultiple = selected.length > 1 || (grade?.keyedAnswers?.length || 0) > 1;
      select.multiple = isMultiple;
      select.size = isMultiple ? Math.min(choiceLabelsForSheet(sheet).length, 4) : 1;
      select.setAttribute("aria-label", `${isMultiple ? "Scanned answers" : "Scanned answer"} for question ${answer.question}`);
      if (!isMultiple) select.add(new Option("No answer", ""));
      for (const label of choiceLabelsForSheet(sheet)) {
        select.add(new Option(label, label));
      }
      if (isMultiple) {
        for (const option of select.options) option.selected = selected.includes(option.value);
      } else {
        select.value = selected[0] || "";
      }
      select.addEventListener("change", () => {
        const values = [...select.selectedOptions].map((option) => option.value).filter(Boolean).sort();
        if (values.length === selected.length && values.every((value, position) => value === selected[position])) {
          pendingPreviewAnswers.delete(answer.question);
        } else {
          pendingPreviewAnswers.set(answer.question, values);
        }
        if (scanPreviewSaveAnswers) {
          scanPreviewSaveAnswers.disabled = pendingPreviewAnswers.size === 0;
        }
      });
      scanned.append(select);
      scanned.className = `scan-answer-status ${answer.status}`;
      const correct = document.createElement("td");
      correct.textContent = grade ? `${formatAnswerSet(grade.keyedAnswers)}${grade.keyedAnswers?.length > 1 ? ` · ${grade.rule === "any" ? "any keyed" : "all keyed"}` : ""}` : "—";
      const result = document.createElement("td");
      result.textContent = grade ? gradeResultLabel(grade.status, answer.corrected) : "Not graded";
      result.className = `scan-answer-result ${grade?.status || "ungraded"}`;
      result.title = answer.reason;
      const discount = document.createElement("td");
      if (sheetGrade && grade) {
        const label = document.createElement("label");
        label.className = "student-question-discount";
        const select = document.createElement("select");
        select.className = "student-question-discount-select";
        select.setAttribute("aria-label", `Score treatment for question ${answer.question}`);
        select.add(new Option("Include in score", "include"));
        select.add(new Option("Exclude for this student", "student"));
        select.add(new Option("Exclude for all students", "all"));
        select.value = grade.status === "discounted_all" ? "all"
          : grade.status === "discounted_student" ? "student" : "include";
        label.append(document.createTextNode("Score: "), select);
        select.addEventListener("change", async () => {
          questionDiscountsByScanSet[sheet.scanSetId] ||= {};
          if (select.value === "all") {
            questionDiscountsByScanSet[sheet.scanSetId][answer.question] = true;
            setQuestionDiscountForStudent(sheet, answer.question, false);
          } else {
            delete questionDiscountsByScanSet[sheet.scanSetId][answer.question];
            setQuestionDiscountForStudent(sheet, answer.question, select.value === "student");
          }
          await persistScanState();
          renderGradeWorkspace();
          openScanPreview(sheet);
        });
        discount.append(label);
      } else {
        discount.textContent = "—";
      }
      row.append(question, scanned, correct, result, discount);
      body.append(row);
    }
    table.append(header, body);
    tableWrap.append(table);
    scanPreviewContent.append(tableWrap);
  }
  if (sheet.rawScanVersion !== RAW_SCAN_VERSION) {
    if (!scanPreviewDialog.open) scanPreviewDialog.showModal();
    return;
  }
  if (!scanPreviewDialog.open) scanPreviewDialog.showModal();
}

function previewableStudentGroups(sheet) {
  const groups = new Map();
  for (const candidate of sheetResults.filter((item) => item.scanSetId === sheet.scanSetId && !isDummyAnswerKey(item))) {
    const learner = matchedLearner(candidate);
    // Keep separate unidentified pages separate: there is no reliable way to
    // know whether two of them belong to the same student.
    const id = learner ? `learner:${learner.student_id}` : `scan:${candidate.id}`;
    if (!groups.has(id)) groups.set(id, { id, name: learner ? rosterDisplayName(learner) : "Student not identified", sheets: [] });
    groups.get(id).sheets.push(candidate);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, sheets: group.sheets.sort((left, right) =>
      String(left.sourceFile || "").localeCompare(String(right.sourceFile || ""), undefined, { numeric: true }) ||
      Number(left.pageNo || 0) - Number(right.pageNo || 0)) }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

function updateScanPreviewNavigation(sheet) {
  if (!scanPreviewPrevious || !scanPreviewNext) return;
  if (!sheet) {
    scanPreviewPrevious.hidden = true;
    scanPreviewNext.hidden = true;
    return;
  }
  const groups = previewableStudentGroups(sheet);
  const index = groups.findIndex((group) => group.sheets.some((candidate) => candidate.id === sheet.id));
  const previous = index > 0 ? groups[index - 1] : null;
  const next = index >= 0 && index < groups.length - 1 ? groups[index + 1] : null;
  scanPreviewPrevious.hidden = false;
  scanPreviewNext.hidden = false;
  scanPreviewPrevious.disabled = !previous;
  scanPreviewNext.disabled = !next;
  scanPreviewPrevious.title = previous ? `Open ${previous.name}` : "This is the first student";
  scanPreviewNext.title = next ? `Open ${next.name}` : "This is the last student";
}

function moveScanPreview(direction) {
  const current = sheetResults.find((sheet) => sheet.id === previewedSheetId);
  if (!current) return;
  const groups = previewableStudentGroups(current);
  const index = groups.findIndex((group) => group.sheets.some((sheet) => sheet.id === current.id));
  const target = groups[index + direction];
  if (target) openScanPreview(target.sheets[0]);
}

function showOriginalScanBlob(sheet, blob, fallbackBlob = null) {
  if (previewedSheetId !== sheet.id) return;
  const previousUrl = originalScanObjectUrl;
  const imageUrl = URL.createObjectURL(blob);
  originalScanObjectUrl = imageUrl;
  originalScanImage.onload = () => {
    if (previousUrl && previousUrl !== imageUrl) URL.revokeObjectURL(previousUrl);
    if (originalScanObjectUrl !== imageUrl) URL.revokeObjectURL(imageUrl);
  };
  originalScanImage.onerror = () => {
    if (originalScanObjectUrl !== imageUrl) return;
    URL.revokeObjectURL(imageUrl);
    originalScanObjectUrl = "";
    if (fallbackBlob instanceof Blob && fallbackBlob !== blob) {
      showOriginalScanBlob(sheet, fallbackBlob);
      return;
    }
    originalScanToggle.disabled = true;
    originalScanToggle.textContent = "Annotated scan unavailable";
  };
  originalScanImage.src = imageUrl;
  originalScanImage.alt = `Annotated scanned page from ${sheet.sourceFile}, page ${sheet.pageNo}`;
  originalScanToggle.disabled = false;
  originalScanToggle.textContent = isStaleStandaloneScan(sheet) ? "View old faded preview" : "View raw annotated scan";
}

function isStaleStandaloneScan(sheet) {
  return Boolean(standaloneMode && sheet && sheet.rawScanVersion === RAW_SCAN_VERSION &&
    sheet.renderEngine !== "pymupdf");
}

function answerDisplayValue(response) {
  return response || "Not selected";
}

function gradeResultLabel(status, corrected = false) {
  if (status === "correct") return corrected ? "Correct (crossed correction)" : "Correct";
  if (status === "review") return "Review";
  return "Incorrect";
}

async function prepareReadableScanPreview(sheet) {
  if (sheet.annotatedPage instanceof Blob) {
    showOriginalScanBlob(sheet, sheet.annotatedPage);
    return;
  }
  if (sheet.rawPage instanceof Blob) showOriginalScanBlob(sheet, sheet.rawPage);
}

function resetOriginalScanPreview() {
  releaseOriginalScanUrl();
  originalScanToggle.hidden = true;
  originalScanToggle.disabled = false;
  originalScanPanel.hidden = true;
  originalScanToggle.textContent = "View raw annotated scan";
  originalScanImage.removeAttribute("src");
}

function releaseOriginalScanUrl() {
  if (originalScanObjectUrl) URL.revokeObjectURL(originalScanObjectUrl);
  originalScanObjectUrl = "";
}

function gradeForSheet(sheet, key) {
  if (sheet.id === key.id) {
    const activeResponses = sheet.answers.filter((response) => !isQuestionDiscountedForAll(sheet.scanSetId, response.question));
    return {
      correct: activeResponses.length,
      review: 0,
      total: activeResponses.length,
      gradedAnswers: sheet.answers.map((response) => ({
        response,
        correctAnswer: response,
        keyedAnswers: selectedLabelsForAnswer(response),
        rule: "all",
        status: isQuestionDiscountedForAll(sheet.scanSetId, response.question) ? "discounted_all" : "correct",
      })),
    };
  }
  let correct = 0;
  let review = 0;
  let total = 0;
  const gradedAnswers = [];
  for (let index = 0; index < sheet.answers.length; index += 1) {
    const response = sheet.answers[index];
    const correctAnswer = key.answers.find((answer) => answer.question === response.question);
    const keyedAnswers = selectedLabelsForAnswer(correctAnswer);
    const rule = ruleForQuestion(sheet.scanSetId, response.question, keyedAnswers);
    const discountedForAll = isQuestionDiscountedForAll(sheet.scanSetId, response.question);
    const discountedForStudent = !discountedForAll && isQuestionDiscountedForStudent(sheet, response.question);
    const evaluation = discountedForAll || discountedForStudent
      ? { status: discountedForAll ? "discounted_all" : "discounted_student", selected: selectedLabelsForAnswer(response) }
      : evaluateAnswerSet(response, keyedAnswers, rule);
    if (!discountedForAll && !discountedForStudent) total += 1;
    if (evaluation.status === "review") review += 1;
    if (evaluation.status === "correct") correct += 1;
    gradedAnswers.push({ response, correctAnswer, keyedAnswers, rule, selectedAnswers: evaluation.selected, status: evaluation.status });
  }
  return { correct, review, total, gradedAnswers };
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
    multiple: "Multiple selected · not graded",
    discounted_all: "Excluded for all students",
    discounted_student: "Excluded for this student",
    detected_manual: "Reviewed · not graded",
    correct: "Correct",
    incorrect: "Incorrect",
    incorrect_blank: "Incorrect · blank",
    review: "Needs review",
  };
  pill.textContent = labels[status] || status;
  return pill;
}

function xlsxEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character]));
}

function xlsxColumn(index) {
  let value = "";
  for (let current = index + 1; current; current = Math.floor((current - 1) / 26)) value = String.fromCharCode(65 + (current - 1) % 26) + value;
  return value;
}

function xlsxCell(value, style = 0) { return { value, style }; }
function xlsxFormula(formula, style = 0) { return { formula, style }; }

function xlsxSheet(rows, { freeze = "A2", filter = "" } = {}) {
  const columnCount = Math.max(1, ...rows.map((row) => row.length));
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((item, columnIndex) => {
      if (item === null || item === undefined || item === "") return "";
      const cell = item && typeof item === "object" && ("value" in item || "formula" in item) ? item : { value: item, style: 0 };
      const ref = `${xlsxColumn(columnIndex)}${rowIndex + 1}`;
      const style = cell.style ? ` s="${cell.style}"` : "";
      if (cell.formula) return `<c r="${ref}"${style}><f>${xlsxEscape(cell.formula)}</f></c>`;
      if (typeof cell.value === "number" && Number.isFinite(cell.value)) return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xlsxEscape(cell.value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const dimension = `A1:${xlsxColumn(columnCount - 1)}${Math.max(1, rows.length)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="${freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rowXml}</sheetData>${filter ? `<autoFilter ref="${filter}"/>` : ""}</worksheet>`;
}

async function createXlsxWorkbook(sheets) {
  if (typeof JSZip === "undefined") throw new Error("The workbook export library is unavailable. Reload and try again.");
  const zip = new JSZip();
  const sheetEntries = sheets.map((sheet, index) => `<sheet name="${xlsxEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDAF0EE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="1" applyFont="1" applyFill="1"/><xf xfId="0" numFmtId="164" applyNumberFormat="1"/><xf xfId="0" fontId="1" applyFont="1"/></cellXfs></styleSheet>`);
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, xlsxSheet(sheet.rows, sheet.options)));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function sampleVariance(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function medianValue(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function exportStudentName(sheet) {
  const matchedName = matchedLearner(sheet)?.name || studentNameFor(sheet);
  if (matchedName === "Student not identified") return matchedName;
  return rosterDisplayName({ name: matchedName });
}

async function downloadCsv() {
  const data = analysisRecords();
  if (!data.key || !data.records.length) {
    window.alert("Select a complete answer key and scan at least one student sheet before exporting an XLSX workbook.");
    return;
  }
  const originalLabel = csvButton.textContent;
  csvButton.disabled = true;
  csvButton.textContent = "Building XLSX…";
  try {
    const items = analysisItems(data);
    const questions = items.map((item) => item.question);
    const matrixRows = data.records.map((record) => {
      const byQuestion = new Map(record.grade.gradedAnswers.map((item) => [item.response.question, item]));
      return {
        studentId: matchedLearner(record.sheet)?.student_id || record.sheet.studentId || record.sheet.bubbleStudentId || record.sheet.writtenStudentId || "",
        name: exportStudentName(record.sheet),
        marks: questions.map((question) => {
          const item = byQuestion.get(question);
          if (!item || item.status === "discounted_student" || item.status === "discounted_all") return null;
          return item.status === "correct" ? 1 : 0;
        }),
      };
    });
    const rawHeader = [xlsxCell("Student ID", 1), xlsxCell("Student name", 1), ...questions.map((question) => xlsxCell(`Q${question}`, 1)), xlsxCell("Total", 1), xlsxCell("Percentage", 1)];
    const totalColumn = xlsxColumn(questions.length + 2);
    const percentageColumn = xlsxColumn(questions.length + 3);
    const firstQuestionColumn = xlsxColumn(2);
    const lastQuestionColumn = xlsxColumn(questions.length + 1);
    const rawRows = [rawHeader, ...matrixRows.map((row, index) => {
      const excelRow = index + 2;
      return [row.studentId, row.name, ...row.marks, xlsxFormula(`SUM(${firstQuestionColumn}${excelRow}:${lastQuestionColumn}${excelRow})`), xlsxFormula(`IF(COUNT(${firstQuestionColumn}${excelRow}:${lastQuestionColumn}${excelRow})=0,\"\",${totalColumn}${excelRow}/COUNT(${firstQuestionColumn}${excelRow}:${lastQuestionColumn}${excelRow})`, 2)];
    })];
    const gradesRows = [
      [xlsxCell("Student ID", 1), xlsxCell("Student name", 1), xlsxCell("Total", 1), xlsxCell("Percentage", 1)],
      ...matrixRows.map((_, index) => {
      const row = index + 2;
      return [xlsxFormula(`'Raw matrix'!A${row}`), xlsxFormula(`'Raw matrix'!B${row}`), xlsxFormula(`'Raw matrix'!${totalColumn}${row}`), xlsxFormula(`'Raw matrix'!${percentageColumn}${row}`, 2)];
      }),
    ];
    const completeRows = matrixRows.filter((row) => row.marks.every((mark) => Number.isFinite(mark)));
    const totalScores = completeRows.map((row) => row.marks.reduce((sum, mark) => sum + mark, 0));
    const itemVariances = questions.map((_, index) => sampleVariance(completeRows.map((row) => row.marks[index])) || 0);
    const totalVariance = sampleVariance(totalScores);
    const cronbach = questions.length > 1 && totalVariance > 0 && completeRows.length > 1
      ? questions.length / (questions.length - 1) * (1 - itemVariances.reduce((sum, value) => sum + value, 0) / totalVariance) : null;
    const questionRows = [[xlsxCell("Cronbach's alpha", 3), cronbach ?? "Not available"], ["Complete student records used", completeRows.length], [], [xlsxCell("Question", 1), xlsxCell("Mark scheme", 1), xlsxCell("Rule", 1), xlsxCell("Valid n", 1), xlsxCell("Correct n", 1), xlsxCell("Difficulty", 1), xlsxCell("Kelley discrimination", 1), xlsxCell("Upper 27%", 1), xlsxCell("Lower 27%", 1)]];
    for (const item of items) questionRows.push([item.question, item.keyedAnswers.join(" + "), item.rule === "any" ? "Any keyed answer" : "All keyed answers", item.validCount, item.correctCount, item.percentage === null ? "" : item.percentage / 100, item.discrimination ?? "", item.upperRate?.rate ?? "", item.lowerRate?.rate ?? ""]);
    const rawPercentageRange = `'Raw matrix'!$${percentageColumn}$2:$${percentageColumn}$${rawRows.length}`;
    const descriptiveRows = [[xlsxCell("Student grade descriptive statistics", 3), ""],
      ["Students", xlsxFormula(`COUNT(${rawPercentageRange})`)],
      ["Mean", xlsxFormula(`IFERROR(AVERAGE(${rawPercentageRange}),\"\")`, 2)],
      ["Median", xlsxFormula(`IFERROR(MEDIAN(${rawPercentageRange}),\"\")`, 2)],
      ["Sample SD", xlsxFormula(`IF(COUNT(${rawPercentageRange})>1,STDEV(${rawPercentageRange}),\"\")`, 2)],
      ["Minimum", xlsxFormula(`IF(COUNT(${rawPercentageRange}),MIN(${rawPercentageRange}),\"\")`, 2)],
      ["Maximum", xlsxFormula(`IF(COUNT(${rawPercentageRange}),MAX(${rawPercentageRange}),\"\")`, 2)],
      ["Questions included", xlsxFormula(`COUNTA('Raw matrix'!${firstQuestionColumn}$1:${lastQuestionColumn}$1)`)],
      [], [xlsxCell("Grade band", 1), xlsxCell("Students", 1)]];
    const config = analysisConfigForForm(data.key.formId);
    const definitions = analysisClassDefinitions(config);
    for (const [index, [threshold, label]] of definitions.entries()) {
      const criteria = `\">=${threshold / 100}\"`;
      const upperThreshold = definitions[index - 1]?.[0];
      const formula = upperThreshold === undefined
        ? `COUNTIF(${rawPercentageRange},${criteria})`
        : `COUNTIFS(${rawPercentageRange},${criteria},${rawPercentageRange},\"<${upperThreshold / 100}\")`;
      descriptiveRows.push([label, xlsxFormula(formula)]);
    }
    descriptiveRows.push(["Fail", xlsxFormula(`COUNTIF(${rawPercentageRange},\"<${definitions.at(-1)[0] / 100}\")`)]);
    const workbook = await createXlsxWorkbook([
      { name: "Grades", rows: gradesRows, options: { filter: `A1:D${gradesRows.length}` } },
      { name: "Raw matrix", rows: rawRows, options: { filter: `A1:${percentageColumn}${rawRows.length}` } },
      { name: "Question analysis", rows: questionRows, options: { freeze: "A5", filter: `A4:I${questionRows.length}` } },
      { name: "Grade statistics", rows: descriptiveRows, options: { freeze: "A11", filter: `A10:B${descriptiveRows.length}` } },
    ]);
    const url = URL.createObjectURL(workbook);
    const link = document.createElement("a");
    link.href = url;
    link.download = gradingExportFilename("grades", "xlsx");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Could not export XLSX workbook", error);
    window.alert(`XLSX export failed: ${error.message || "please try again."}`);
  } finally {
    csvButton.textContent = originalLabel;
    csvButton.disabled = false;
  }
}

function exportFilenamePart(value, fallback) {
  const cleaned = String(value || "").trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function exportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function gradingExportFilename(kind, extension, date = new Date()) {
  const workspace = exportFilenamePart(courseKeyData.course_title, "workspace");
  return `${workspace}-${kind}-${exportTimestamp(date)}.${extension}`;
}

function workspaceUrl() {
  try {
    return new URL(scanRuntime.grade_path || window.location.href, window.location.origin).href;
  } catch (_) {
    return window.location.href;
  }
}

function studentExportIdentity(sheet) {
  const learner = matchedLearner(sheet);
  const extractedId = sheet.studentId || sheet.bubbleStudentId || sheet.writtenStudentId || "";
  return {
    name: learner?.name || studentNameFor(sheet),
    id: learner?.student_id || extractedId || "student-id-not-read",
    extractedId,
    matched: Boolean(learner),
  };
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("The export page could not be created.")), type, quality));
}

async function blobToJpegPage(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const jpeg = await canvasBlob(canvas, "image/jpeg", 0.92);
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

function summaryAnswerRows(sheet, grade) {
  if (grade) return grade.gradedAnswers.map((item) => ({
    question: item.response.question,
    extracted: (item.selectedAnswers || selectedLabelsForAnswer(item.response)).join(", ") || "—",
    correct: item.keyedAnswers.join(", ") || "—",
    status: gradeResultLabel(item.status),
  }));
  return sheet.answers.map((response) => ({
    question: response.question,
    extracted: selectedLabelsForAnswer(response).join(", ") || "—",
    correct: "No answer key",
    status: "Not graded",
  }));
}

function abbreviatedText(context, value, width) {
  const text = String(value || "—");
  if (context.measureText(text).width <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > width) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

async function createAnnotationSummaryPage(sheet) {
  const canvas = document.createElement("canvas");
  canvas.width = 1684;
  canvas.height = 1190;
  const context = canvas.getContext("2d");
  const identity = studentExportIdentity(sheet);
  const key = getGradeKeyForScan(sheet);
  const grade = key && key.id !== sheet.id ? gradeForSheet(sheet, key) : null;
  const rows = summaryAnswerRows(sheet, grade);
  const score = grade ? `${grade.correct}/${grade.total} (${grade.total ? (grade.correct / grade.total * 100).toFixed(1) : "0.0"}%)` : "Not graded — no complete answer key selected";
  const workspaceLink = workspaceUrl();

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#08786f";
  context.fillRect(0, 0, canvas.width, 18);
  context.fillStyle = "#172532";
  context.font = "700 42px Inter, Arial, sans-serif";
  context.fillText("Print Scan Grade · annotated-sheet summary", 64, 84);
  context.fillStyle = "#526474";
  context.font = "28px Inter, Arial, sans-serif";
  context.fillText(`Workspace: ${abbreviatedText(context, courseKeyData.course_title || "Workspace", 1120)}`, 64, 130);

  const info = [
    ["Matched student", identity.matched ? identity.name : "No roster match"],
    ["Matched student ID", identity.matched ? identity.id : "—"],
    ["Extracted student ID", identity.extractedId || "Not read"],
    ["Source", `${sheet.sourceFile || "Scanned sheet"} · page ${sheet.pageNo || "—"}`],
    ["Score", score],
    ["Review flags", grade ? String(grade.review) : "—"],
  ];
  context.fillStyle = "#f2f6f8";
  context.fillRect(64, 158, canvas.width - 128, 172);
  for (const [index, [label, value]] of info.entries()) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 88 + column * 785;
    const y = 202 + row * 52;
    context.fillStyle = "#526474";
    context.font = "600 20px Inter, Arial, sans-serif";
    context.fillText(label.toUpperCase(), x, y);
    context.fillStyle = "#172532";
    context.font = "27px Inter, Arial, sans-serif";
    context.fillText(abbreviatedText(context, value, 670), x, y + 29);
  }

  context.fillStyle = "#172532";
  context.font = "700 30px Inter, Arial, sans-serif";
  context.fillText("Extracted answers and mark scheme", 64, 382);
  context.font = "22px Inter, Arial, sans-serif";
  context.fillStyle = "#526474";
  context.fillText(grade ? "Result compares each extracted response against the selected marking rule." : "Select a complete answer key in Grade to include correct answers and scores.", 64, 416);

  const columns = Math.max(3, Math.ceil(rows.length / 40));
  const tableGap = 28;
  const tableWidth = (canvas.width - 128 - tableGap * (columns - 1)) / columns;
  const tableTop = 458;
  const rowsPerColumn = Math.max(1, Math.ceil(rows.length / columns));
  const rowHeight = Math.max(16, Math.min(28, Math.floor((canvas.height - tableTop - 82) / (rowsPerColumn + 1))));
  for (let column = 0; column < columns; column += 1) {
    const x = 64 + column * (tableWidth + tableGap);
    context.fillStyle = "#e4edf1";
    context.fillRect(x, tableTop, tableWidth, rowHeight);
    context.fillStyle = "#263b4a";
    context.font = `${Math.min(17, rowHeight - 7)}px Inter, Arial, sans-serif`;
    const headerBaseline = tableTop + Math.min(rowHeight - 5, 19);
    context.fillText("Q", x + 10, headerBaseline);
    context.fillText("EXTRACTED", x + tableWidth * 0.10, headerBaseline);
    context.fillText("MARK SCHEME", x + tableWidth * 0.39, headerBaseline);
    context.fillText("RESULT", x + tableWidth * 0.72, headerBaseline);
    const start = column * rowsPerColumn;
    for (let index = 0; index < rowsPerColumn && start + index < rows.length; index += 1) {
      const item = rows[start + index];
      const y = tableTop + rowHeight * (index + 1);
      context.fillStyle = index % 2 ? "#f7fafb" : "#ffffff";
      context.fillRect(x, y, tableWidth, rowHeight);
      context.fillStyle = "#263b4a";
      context.font = `${Math.min(16, rowHeight - 7)}px Inter, Arial, sans-serif`;
      const baseline = y + Math.min(rowHeight - 5, 19);
      context.fillText(String(item.question), x + 10, baseline);
      context.fillText(abbreviatedText(context, item.extracted, tableWidth * 0.26), x + tableWidth * 0.10, baseline);
      context.fillText(abbreviatedText(context, item.correct, tableWidth * 0.29), x + tableWidth * 0.39, baseline);
      context.fillText(abbreviatedText(context, item.status, tableWidth * 0.25), x + tableWidth * 0.72, baseline);
    }
  }
  context.fillStyle = "#526474";
  context.font = "18px Inter, Arial, sans-serif";
  context.fillText(`Workspace: ${abbreviatedText(context, workspaceLink, canvas.width - 128)}`, 64, canvas.height - 28);
  return blobToJpegPage(await canvasBlob(canvas, "image/jpeg", 0.9));
}

function createImagePdf(pages) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let offset = 0;
  const append = (part) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    offset += bytes.length;
  };
  const imageIds = pages.map((_, index) => 3 + index * 3);
  const contentIds = pages.map((_, index) => 4 + index * 3);
  const pageIds = pages.map((_, index) => 5 + index * 3);
  const writeObject = (id, body) => {
    offsets[id] = offset;
    append(`${id} 0 obj\n`);
    for (const part of body) append(part);
    append("\nendobj\n");
  };
  append("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  writeObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  writeObject(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`]);
  pages.forEach((page, index) => {
    const imageId = imageIds[index];
    const contentId = contentIds[index];
    const pageId = pageIds[index];
    const margin = 18;
    const scale = Math.min((page.pageWidth - margin * 2) / page.width, (page.pageHeight - margin * 2) / page.height);
    const width = page.width * scale;
    const height = page.height * scale;
    const x = (page.pageWidth - width) / 2;
    const y = (page.pageHeight - height) / 2;
    writeObject(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      "\nendstream",
    ]);
    const commands = `q\n${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    writeObject(contentId, [`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`]);
    writeObject(pageId, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.pageWidth} ${page.pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
  });
  const xrefOffset = offset;
  append(`xref\n0 ${pageIds.at(-1) + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= pageIds.at(-1); id += 1) append(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  append(`trailer\n<< /Size ${pageIds.at(-1) + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

async function createAnnotatedStudentPdf(sheet) {
  const annotated = await blobToJpegPage(sheet.annotatedPage);
  const summary = await createAnnotationSummaryPage(sheet);
  return createImagePdf([
    { ...annotated, pageWidth: 595.28, pageHeight: 841.89 },
    { ...summary, pageWidth: 841.89, pageHeight: 595.28 },
  ]);
}

async function downloadAnnotatedSheets() {
  const studentSheets = sheetResults.filter((sheet) => sheet.scanSetId === selectedScanSetId && !isDummyAnswerKey(sheet));
  const refreshableIds = new Set(studentSheets
    .filter((sheet) => sheet.rawScanVersion === RAW_SCAN_VERSION && sheet.rawPage instanceof Blob && !isStaleStandaloneScan(sheet))
    .map((sheet) => sheet.id));
  if (!studentSheets.length) return;
  if (typeof JSZip === "undefined") {
    window.alert("The ZIP export library is unavailable. Reload the page and try again.");
    return;
  }
  const originalLabel = annotatedSheetsButton?.textContent || "Export annotated sheets";
  if (annotatedSheetsButton) {
    annotatedSheetsButton.disabled = true;
    annotatedSheetsButton.textContent = "Preparing annotated sheets…";
  }
  try {
    if (refreshableIds.size) await refreshSavedAnnotations(refreshableIds);
    const exportableSheets = studentSheets.filter((sheet) => sheet.annotatedPage instanceof Blob);
    if (!exportableSheets.length) {
      window.alert("No annotated scans are available. Re-scan the original PDF to create exportable annotated sheets.");
      return;
    }
    const zip = new JSZip();
    for (const [index, sheet] of exportableSheets.entries()) {
      const identity = studentExportIdentity(sheet);
      const page = String(sheet.pageNo || index + 1).padStart(2, "0");
      const name = `${exportFilenamePart(identity.name, "student")}-${exportFilenamePart(identity.id, "student-id")}-page-${page}.pdf`;
      zip.file(name, await createAnnotatedStudentPdf(sheet));
    }
    const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const archiveUrl = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = archiveUrl;
    link.download = gradingExportFilename("annotated-sheets", "zip");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(archiveUrl), 1000);
  } catch (error) {
    console.error("Could not export annotated sheets", error);
    window.alert(`Annotated-sheet export failed: ${error.message || "please try again."}`);
  } finally {
    if (annotatedSheetsButton) {
      annotatedSheetsButton.textContent = originalLabel;
      const stillExportable = sheetResults.some((sheet) => sheet.scanSetId === selectedScanSetId && !isDummyAnswerKey(sheet) &&
        (sheet.annotatedPage instanceof Blob || (sheet.rawScanVersion === RAW_SCAN_VERSION && sheet.rawPage instanceof Blob && !isStaleStandaloneScan(sheet))));
      annotatedSheetsButton.disabled = !stillExportable;
    }
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function setProgress(message) {
  progressLabel.textContent = message;
  rescanProgressLabel.textContent = message;
}

function setStageProgress(message) {
  progressStageLabel.textContent = message;
  rescanStageLabel.textContent = message;
  progressStageBar.removeAttribute("value");
  rescanStageBar.removeAttribute("value");
}

async function refreshSavedAnnotations(sheetIds = null) {
  await loadFormsManifest();
  let changed = false;
  for (const sheet of sheetResults) {
    if (sheetIds && !sheetIds.has(sheet.id)) continue;
    // Legacy records intentionally cannot be re-read: their originalPage may
    // be contrast-adjusted or already annotated rather than raw pixels.
    if (sheet.rawScanVersion !== RAW_SCAN_VERSION || !(sheet.rawPage instanceof Blob) ||
        isStaleStandaloneScan(sheet)) continue;
    const correctAnswers = correctAnswersForPreview(sheet);
    const annotationKeyId = correctAnswers ? answerKeyByScanSet[sheet.scanSetId] : "";
    if (sheet.annotationVersion === ANNOTATION_VERSION && sheet.annotationKeyId === annotationKeyId &&
        sheet.annotatedPage instanceof Blob) continue;
    let bitmap = null;
    let canvas = null;
    try {
      bitmap = await createImageBitmap(sheet.rawPage);
      canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d", { willReadFrequently: true }).drawImage(bitmap, 0, 0);
      const marks = findRegistrationMarks(canvas);
      const form = formsById.get(String(sheet.formId).toLowerCase());
      const mapping = form && marks ? createTemplateToRawMapping(marks, sheet.layoutVersion >= 4 ? CURRENT_MARK_MARGIN : MARK_MARGIN) : null;
      if (!mapping || !form) continue;
      const annotationData = detectRawBubbleAnnotations(canvas, form, sheet.layoutVersion, mapping);
      const manualAnswers = new Map((sheet.answers || [])
        .filter((answer) => answer.manual)
        .map((answer) => [answer.question, selectedLabelsForAnswer(answer)]));
      for (const answer of annotationData.answers) {
        const selectedLabels = manualAnswers.get(answer.question);
        if (selectedLabels) setManualAnswerSelection(answer, selectedLabels);
      }
      for (const annotation of annotationData.annotations) {
        const selectedLabels = manualAnswers.get(annotation.question);
        if (annotation.kind !== "answer" || !selectedLabels) continue;
        annotation.status = selectedLabels.includes(annotation.label) ? "filled" : "blank";
        annotation.crossed = false;
      }
      const previewWasMissing = !(sheet.annotatedPage instanceof Blob);
      sheet.annotatedPage = await createAnnotatedBubblePreview(canvas, annotationData, correctAnswers);
      if (previewWasMissing ||
          JSON.stringify(sheet.annotations || []) !== JSON.stringify(annotationData.annotations) ||
          JSON.stringify(sheet.annotationCounts || {}) !== JSON.stringify(annotationData.counts) ||
          JSON.stringify(sheet.answers || []) !== JSON.stringify(annotationData.answers) ||
          JSON.stringify(sheet.answerCounts || {}) !== JSON.stringify(annotationData.answerCounts) ||
          sheet.annotationVersion !== ANNOTATION_VERSION ||
          sheet.annotationKeyId !== annotationKeyId) {
        sheet.annotations = annotationData.annotations;
        sheet.annotationCounts = annotationData.counts;
        sheet.answers = annotationData.answers;
        sheet.answerCounts = annotationData.answerCounts;
        sheet.annotationVersion = ANNOTATION_VERSION;
        sheet.annotationKeyId = annotationKeyId;
        changed = true;
      }
    } catch (error) {
      console.warn("Could not refresh a raw scan annotation", error);
    } finally {
      if (bitmap) bitmap.close();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }
  if (changed) await persistScanState();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

loadPersistedScanState().then(() => {
  if (standaloneMode ? new URLSearchParams(window.location.search).get("view") === "grade" : window.location.pathname.replace(/\/$/, "").endsWith("/grade")) {
    showGradeDashboard(false).catch(showGradeLoadError);
  } else {
    renderGradeDashboardSheets([]);
    renderGradeWorkspace();
  }
});
