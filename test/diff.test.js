import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumstat, diffSummary, diffTargets, diffKey, keepRepos } from "../mods/crmux-list/diff.js";

test("numstat: file count and total added/deleted lines", () => {
  assert.deepEqual(parseNumstat("3\t1\tsrc/a.js\n10\t0\tREADME.md\n"), { files: 2, ins: 13, del: 1 });
});

test("numstat: binary files (- -) count toward the file count, with 0 lines", () => {
  assert.deepEqual(parseNumstat("-\t-\timg.png\n2\t2\ta.txt"), { files: 2, ins: 2, del: 2 });
});

test("numstat: 0 when empty", () => {
  assert.deepEqual(parseNumstat(""), { files: 0, ins: 0, del: 0 });
});

const text = (parts) => parts.map((p) => p.text).join("");
const ZERO = { files: 0, ins: 0, del: 0 };

test("summary: no changes (dim) when there are no changes", () => {
  assert.deepEqual(diffSummary(ZERO, ZERO), [{ text: "no changes", color: "dim" }]);
});

test("summary: staged +N (green), modified ~N (yellow), lines are the sum of staged and unstaged (+added -deleted)", () => {
  const parts = diffSummary({ files: 2, ins: 5, del: 1 }, { files: 3, ins: 10, del: 4 });
  assert.equal(text(parts), "+2 ~3 (+15 -5)");
  assert.deepEqual(parts.filter((p) => p.color === "add").map((p) => p.text), ["+2", "+15"]);
  assert.deepEqual(parts.filter((p) => p.color === "mod").map((p) => p.text), ["~3"]);
  assert.deepEqual(parts.filter((p) => p.color === "del").map((p) => p.text), ["-5"]);
  assert.deepEqual(parts.filter((p) => p.color === "dim").map((p) => p.text), ["(", " ", ")"]);
});

test("summary: omit +N if nothing is staged, and ~N if nothing is modified", () => {
  assert.equal(text(diffSummary(ZERO, { files: 1, ins: 0, del: 2 })), "~1 (+0 -2)");
  assert.equal(text(diffSummary({ files: 1, ins: 3, del: 0 }, ZERO)), "+1 (+3 -0)");
});

test("summary: null if not a git repository (staged unavailable), unstaged unavailable is treated as 0", () => {
  assert.equal(diffSummary(null, ZERO), null);
  assert.equal(text(diffSummary({ files: 1, ins: 1, del: 1 }, null)), "+1 (+1 -1)");
});

test("targets: the same cwd on the same machine only once, those without cwd are excluded (key is used by cards to look up results)", () => {
  assert.deepEqual(diffTargets([
    { cwd: "/src/a", machine: null },
    { cwd: "/src/b", machine: null },
    { cwd: "/src/a", machine: null },
    { cwd: "/src/a", machine: "vps" },
    { cwd: null, machine: null },
  ]), [
    { key: "/src/a", cwd: "/src/a", machine: null },
    { key: "/src/b", cwd: "/src/b", machine: null },
    { key: "vps:/src/a", cwd: "/src/a", machine: "vps" },
  ]);
});

test("diffKey: the cwd on this machine, machine:cwd on another; no NUL, since shared keys are cut at one", () => {
  assert.equal(diffKey(null, "/src/a"), "/src/a");
  assert.equal(diffKey(undefined, "/src/a"), "/src/a");
  assert.equal(diffKey("vps", "/src/a"), "vps:/src/a");
  assert.notEqual(diffKey("vps", "/src/a"), diffKey(null, "/src/a"));
});

test("keepRepos: adds the new answers and keeps only the cwds still in use", () => {
  const repos = { "/src/a": { project: "a", worktree: null }, "/gone": { project: "g", worktree: null }, "": { project: "x", worktree: null } };
  const next = keepRepos(repos, ["/src/a", "/tmp"], [["/tmp", false]]);
  assert.deepEqual(next, { "/src/a": { project: "a", worktree: null }, "/tmp": false });
});
