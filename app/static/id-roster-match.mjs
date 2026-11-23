// A partial bubble reading can narrow the roster, but it is not a confirmed ID.
export function rosterCandidatesForPartialId(rawId, roster, minimumKnownDigits = 6) {
  const pattern = String(rawId || "");
  if (!/^[?\d]{9}$/.test(pattern) ||
      !pattern.includes("?") || pattern.replaceAll("?", "").length < minimumKnownDigits) {
    return [];
  }
  const seen = new Set();
  return roster.filter((learner) => {
    const id = learner?.student_id;
    if (!/^\d{9}$/.test(id) || seen.has(id)) return false;
    const matches = [...pattern].every((digit, column) => digit === "?" || digit === id[column]);
    if (matches) seen.add(id);
    return matches;
  });
}

// A one-digit contradiction may be a misbubbled number or a reading error.
// Offer it for human review; it must never become an automatic identity.
export function rosterCandidatesNearId(rawId, roster, minimumKnownDigits = 7) {
  const pattern = String(rawId || "");
  if (!/^[?\d]{9}$/.test(pattern) ||
      pattern.replaceAll("?", "").length < minimumKnownDigits) return [];
  const seen = new Set();
  return roster.filter((learner) => {
    const id = learner?.student_id;
    if (!/^\d{9}$/.test(id) || seen.has(id)) return false;
    const differences = [...pattern].filter((digit, column) => digit !== "?" && digit !== id[column]).length;
    if (differences === 1) seen.add(id);
    return differences === 1;
  });
}
