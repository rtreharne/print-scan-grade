// Grade/review adapters for the fixed 70-question, single-answer UoL form.
export const QUESTION_COUNT = 70;
export const confirmedId = (page) => page.manualStudentId || page.studentId || "";
export const completeKey = (key) => Array.isArray(key?.answers) && key.answers.length === QUESTION_COUNT
  && Array.from(key.answers).every((a) => /^[ABCDE]$/.test(a));
export function pageScore(page, key) {
  if (!completeKey(key)) return null;
  return key.answers.reduce((sum, answer, index) => sum + (page.answers?.[index] === answer ? 1 : 0), 0);
}
export function rosterRows(roster, pages, keyId) {
  const groups = new Map(roster.map((person) => [person.student_id, { name: person.name, person, pages: [] }]));
  const unknown = [];
  for (const page of pages) {
    if (page.id === keyId) continue;
    const group = groups.get(confirmedId(page));
    if (group) group.pages.push(page);
    else unknown.push({ name: "Student not identified", person: null, pages: [page] });
  }
  return [...groups.values(), ...unknown];
}
export function analysisData(pages, key) {
  if (!completeKey(key)) return { key: null, records: [], questionCount: QUESTION_COUNT };
  const records = pages.filter((page) => page.id !== key.id).map((sheet, index) => ({
    sheet, index, percentage: pageScore(sheet, key) / QUESTION_COUNT * 100,
  }));
  return { key, records, questionCount: QUESTION_COUNT };
}
export function analysisItems({ key, records, questionCount }) {
  const ranked = [...records].sort((a, b) => b.percentage - a.percentage || String(a.sheet.id).localeCompare(String(b.sheet.id)));
  const groupSize = Math.max(1, Math.floor(ranked.length * .27));
  const upper = ranked.slice(0, groupSize), lower = ranked.slice(Math.max(groupSize, ranked.length - groupSize));
  return Array.from({ length: questionCount }, (_, index) => {
    const valid = records.filter((r) => /^[ABCDE]$/.test(r.sheet.answers?.[index] || ""));
    const hits = (group) => group.filter((r) => r.sheet.answers?.[index] === key.answers[index]).length;
    const groupRate = (group) => {
      const usable = group.filter((r) => /^[ABCDE]$/.test(r.sheet.answers?.[index] || ""));
      return usable.length ? { rate: hits(usable) / usable.length, valid: usable.length } : null;
    };
    const upperRate = groupRate(upper), lowerRate = groupRate(lower);
    const options = Object.fromEntries([..."ABCDE"].map((answer) => [answer, valid.filter((r) => r.sheet.answers[index] === answer).length]));
    return { question: index + 1, keyedAnswers: [key.answers[index]], rule: "all", options,
      validCount: valid.length, unresolvedCount: records.length - valid.length, correctCount: hits(valid),
      percentage: valid.length ? hits(valid) / valid.length * 100 : null,
      discrimination: upperRate && lowerRate ? upperRate.rate - lowerRate.rate : null,
      upperRate, lowerRate, groupSize, cohortSize: records.length };
  });
}
