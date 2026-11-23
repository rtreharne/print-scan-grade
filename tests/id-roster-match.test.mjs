import assert from "node:assert/strict";
import test from "node:test";
import { rosterCandidatesForPartialId, rosterCandidatesNearId } from "../app/static/id-roster-match.mjs";

const roster = [
  { student_id: "201868167", name: "First student" },
  { student_id: "201868267", name: "Second student" },
  { student_id: "202020541", name: "Third student" },
];

test("suggests only a unique compatible roster ID", () => {
  assert.deepEqual(rosterCandidatesForPartialId("2018681?7", roster), [roster[0]]);
});

test("leaves multiple compatible IDs unresolved", () => {
  assert.deepEqual(rosterCandidatesForPartialId("201868?67", roster), roster.slice(0, 2));
});

test("requires six known digits and a nine-column partial reading", () => {
  assert.deepEqual(rosterCandidatesForPartialId("20186????", roster), []);
  assert.deepEqual(rosterCandidatesForPartialId("201868167", roster), []);
  assert.deepEqual(rosterCandidatesForPartialId("2018681X7", roster), []);
});

test("offers one-digit mismatches without treating them as exact matches", () => {
  assert.deepEqual(rosterCandidatesNearId("201868167", roster), [roster[1]]);
  assert.deepEqual(rosterCandidatesNearId("201868?67", roster), []);
  assert.deepEqual(rosterCandidatesNearId("20186????", roster), []);
});
