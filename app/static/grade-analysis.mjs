// Analysis charts and print layout follow the standalone grade workspace.
export function createAnalysisDashboard({ getData, getItems, getScheme, saveScheme, getTitle }) {
  const $ = (selector) => document.querySelector(selector);
  const analysisPanel = $("#analysis-panel");
  if (!analysisPanel) return { render() {} };
  const analysisUnavailable = $("#analysis-unavailable"), analysisContent = $("#analysis-content");
  const analysisSummaryCards = $("#analysis-summary-cards"), analysisTooltip = $("#analysis-tooltip");
  const analysisSchemeSelect = $("#analysis-scheme-select");
  const analysisScaleState = { score: "fit", item: "fit", discrimination: "fit", option: "fit" };
  const analysisCharts = { score: $("#score-distribution-chart"), item: $("#item-correct-chart"),
    discrimination: $("#discrimination-chart"), option: $("#option-distribution-chart") };
  function render() {
    hideAnalysisTooltip();
    const data = getData();
    analysisUnavailable.hidden = Boolean(data.key);
    analysisContent.hidden = !data.key;
    if (!data.key) { analysisUnavailable.textContent = "Select a complete master answer sheet to view analysis."; return; }
    const scheme = getScheme() === "masters" ? "masters" : "undergraduate";
    analysisSchemeSelect.value = scheme;
    const config = { scheme, first: 70, upperSecond: 60, lowerSecond: 50, third: 40, compensatory: 35 };
    renderAnalysisSummary(data, config);
    const items = getItems(data);
    renderScoreDistribution(data, config); renderItemChart(items); renderDiscriminationChart(items); renderOptionChart(items);
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
  const median = values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : 0;
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
  const title = getTitle();
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
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><header class="report-header"><div class="report-brand"><img src="${escapeHtml(brandLogo)}" alt=""><div><strong>Print Scan Grade</strong><p>${escapeHtml(courseTitle)}</p></div></div><div><h1>${escapeHtml(title)}</h1><p>Landscape analysis report</p></div></header>${report.innerHTML}</body></html>`);
  printWindow.document.close();
  // Some browsers do not dispatch iframe load after document.write; retain a
  // short fallback while keeping the export within the user click gesture.
  window.setTimeout(startPrint, 900);
}


  $("#analysis-pdf-export").addEventListener("click", exportAnalysisPdf);
  for (const name of Object.keys(analysisScaleState)) {
    const id = name === "score" ? "#score-scale-select" : name === "item" ? "#item-scale-select" : name === "discrimination" ? "#discrimination-scale-select" : "#option-scale-select";
    $(id).addEventListener("change", (event) => { analysisScaleState[name] = event.target.value; render(); });
  }
  analysisSchemeSelect.addEventListener("change", () => { saveScheme(analysisSchemeSelect.value); render(); });
  return { render };
}

