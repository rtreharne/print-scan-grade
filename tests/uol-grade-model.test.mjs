import test from "node:test";
import assert from "node:assert/strict";
import { completeKey, pageScore, rosterRows, analysisData, analysisItems } from "../app/static/uol-grade-model.mjs";

const key = { id: "key", answers: Array(70).fill("A") };
const correct = { id: "correct", studentId: "1", answers: Array(70).fill("A") };
const incorrect = { id: "incorrect", studentId: "bad", manualStudentId: "1", answers: Array(70).fill("B") };
const half = { id: "half", answers: Array.from({ length: 70 }, (_, i) => i % 2 ? "B" : "A") };
const blank = { id: "zblank", answers: Array(70).fill("") };

test("requires a complete key and grades exactly 70 single-answer questions", () => {
  assert(completeKey(key));
  for (const invalid of [null, { answers: ["A"] }, { answers: Array(70) }, { answers: Array(70).fill("AB") }]) {
    assert.equal(completeKey(invalid), false);
    assert.equal(pageScore(correct, invalid), null);
  }
  assert.deepEqual([correct, incorrect, half, blank].map((page) => pageScore(page, key)), [70, 0, 35, 0]);
});

test("full roster includes absent students, manual matches override scans, duplicate pages stay accessible", () => {
  const roster = [{ student_id: "1", name: "Matched" }, { student_id: "2", name: "Absent" }];
  const rows = rosterRows(roster, [key, correct, incorrect, half], key.id);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].pages.map((p) => p.id), ["correct", "incorrect"]);
  assert.equal(rows[1].pages.length, 0);
  assert.equal(rows[2].person, null);
});

test("analysis excludes master, includes unmatched scans, and counts blanks as unearned scores", () => {
  const data = analysisData([key, correct, incorrect, half, blank], key);
  assert.equal(data.records.length, 4);
  assert.deepEqual(data.records.map((r) => r.percentage), [100, 0, 50, 0]);
  const items = analysisItems(data);
  assert.equal(items.length, 70);
  assert.equal(items[0].validCount, 3);
  assert.equal(items[0].unresolvedCount, 1);
  assert(Math.abs(items[0].percentage - 200 / 3) < 1e-9);
  assert(Math.abs(items[1].percentage - 100 / 3) < 1e-9);
  assert.deepEqual(items[0].options, { A: 2, B: 1, C: 0, D: 0, E: 0 });
});

test("Kelley groups are disjoint and insufficient or blank groups produce no discrimination", () => {
  assert.equal(analysisItems(analysisData([key, correct, incorrect], key))[0].discrimination, 1);
  assert.equal(analysisItems(analysisData([key, correct], key))[0].discrimination, null);
  assert.equal(analysisItems(analysisData([key, correct, incorrect, half, blank], key))[0].discrimination, null);
  assert.equal(analysisItems(analysisData([key], key))[0].discrimination, null);
  assert.equal(analysisData([correct], null).key, null);
});
