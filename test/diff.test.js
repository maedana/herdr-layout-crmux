import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumstat, diffSummary, diffTargets } from "../mods/crmux-list/diff.js";

test("numstat: ファイル数と追加・削除行の合計", () => {
  assert.deepEqual(parseNumstat("3\t1\tsrc/a.js\n10\t0\tREADME.md\n"), { files: 2, ins: 13, del: 1 });
});

test("numstat: バイナリ（- -）はファイル数に数え、行数は 0", () => {
  assert.deepEqual(parseNumstat("-\t-\timg.png\n2\t2\ta.txt"), { files: 2, ins: 2, del: 2 });
});

test("numstat: 空なら 0", () => {
  assert.deepEqual(parseNumstat(""), { files: 0, ins: 0, del: 0 });
});

const text = (parts) => parts.map((p) => p.text).join("");
const ZERO = { files: 0, ins: 0, del: 0 };

test("要約: 変更が無ければ no changes（薄い色）", () => {
  assert.deepEqual(diffSummary(ZERO, ZERO), [{ text: "no changes", color: "dim" }]);
});

test("要約: staged +N（緑）、modified ~N（黄）、行数は staged と unstaged の合計 (+追加 -削除)", () => {
  const parts = diffSummary({ files: 2, ins: 5, del: 1 }, { files: 3, ins: 10, del: 4 });
  assert.equal(text(parts), "+2 ~3 (+15 -5)");
  assert.deepEqual(parts.filter((p) => p.color === "add").map((p) => p.text), ["+2", "+15"]);
  assert.deepEqual(parts.filter((p) => p.color === "mod").map((p) => p.text), ["~3"]);
  assert.deepEqual(parts.filter((p) => p.color === "del").map((p) => p.text), ["-5"]);
  assert.deepEqual(parts.filter((p) => p.color === "dim").map((p) => p.text), ["(", " ", ")"]);
});

test("要約: staged が無ければ +N を、modified が無ければ ~N を出さない", () => {
  assert.equal(text(diffSummary(ZERO, { files: 1, ins: 0, del: 2 })), "~1 (+0 -2)");
  assert.equal(text(diffSummary({ files: 1, ins: 3, del: 0 }, ZERO)), "+1 (+3 -0)");
});

test("要約: git リポジトリでない（staged が取れない）なら null、unstaged が取れなければ 0 扱い", () => {
  assert.equal(diffSummary(null, ZERO), null);
  assert.equal(text(diffSummary({ files: 1, ins: 1, del: 1 }, null)), "+1 (+1 -1)");
});

test("取得先: 同じマシンの同じ cwd は 1 回、cwd が無いものは除く（key はカードが結果を引くのに使う）", () => {
  assert.deepEqual(diffTargets([
    { cwd: "/src/a", machine: null },
    { cwd: "/src/b", machine: null },
    { cwd: "/src/a", machine: null },
    { cwd: "/src/a", machine: "vps" },
    { cwd: null, machine: null },
  ]), [
    { key: "\0/src/a", cwd: "/src/a", machine: null },
    { key: "\0/src/b", cwd: "/src/b", machine: null },
    { key: "vps\0/src/a", cwd: "/src/a", machine: "vps" },
  ]);
});
