import { test } from "node:test";
import assert from "node:assert/strict";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree } from "../mods/crmux-list/arrange.js";

test("並べ方は MainV → Single → Grid → EvenH → EvenV → MainH → MainV と回る", () => {
  const seen = ["MainV"];
  for (let i = 0; i < 6; i++) seen.push(nextArrange(seen[seen.length - 1]));
  assert.deepEqual(seen, ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH", "MainV"]);
});

test("知らない並べ方の次は MainV（crmux の初期値）", () => {
  assert.equal(nextArrange(undefined), "MainV");
});

const FOCUSED = { id: "preview", type: "block", content: { agent: "focused" } };

test("Single は agent ブロック 1 つ（選択は agent.focus で切り替える）", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1"), FOCUSED);
});

test("エージェントが 1 つ以下ならどの並べ方でも Single と同じ", () => {
  assert.deepEqual(previewTree("MainV", ["t1"], "t1"), FOCUSED);
  assert.deepEqual(previewTree("Grid", [], null), FOCUSED);
});

// 複数表示のブロック: 枠付き、選択中は accent の枠
const cell = (address, selected, extra = {}) => ({
  id: `pv-${address}`, type: "block", ...extra,
  border: { width: 1, color: selected ? "accent" : "border" },
  content: { terminal: address },
});

test("EvenH は一覧の順に横へ等分", () => {
  assert.deepEqual(previewTree("EvenH", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [cell("t1", false), cell("t2", true), cell("t3", false)],
  });
});

test("EvenV は一覧の順に縦へ等分", () => {
  assert.deepEqual(previewTree("EvenV", ["t1", "t2"], "t1"), {
    id: "preview", type: "column", gap: 4,
    children: [cell("t1", true), cell("t2", false)],
  });
});

test("ブロック id は英数字以外（別マシンの machine/t7 の / など）を _ にする", () => {
  const tree = previewTree("EvenH", ["vps/t7", "t1"], "t1");
  assert.equal(tree.children[0].id, "pv-vps_t7");
  assert.deepEqual(tree.children[0].content, { terminal: "vps/t7" });
});

test("MainV: 選択中を左のメイン（70%）、残りを一覧の順に右へ縦積み", () => {
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [
      cell("t2", true, { size: { weight: 7 } }),
      { id: "pv-rest", type: "column", gap: 4, size: { weight: 3 }, children: [cell("t1", false), cell("t3", false)] },
    ],
  });
});

test("MainH: 選択中を上のメイン（60%）、残りを下に横並び", () => {
  assert.deepEqual(previewTree("MainH", ["t1", "t2", "t3"], "t3"), {
    id: "preview", type: "column", gap: 4,
    children: [
      cell("t3", true, { size: { weight: 6 } }),
      { id: "pv-rest", type: "row", gap: 4, size: { weight: 4 }, children: [cell("t1", false), cell("t2", false)] },
    ],
  });
});

test("Main 系: 選択が一覧に無ければ先頭をメインにする", () => {
  const tree = previewTree("MainV", ["t1", "t2"], "t9");
  assert.deepEqual(tree.children[0].content, { terminal: "t1" });
  assert.deepEqual(tree.children[1].children.map((c) => c.content.terminal), ["t2"]);
});

const gridShape = (tree) => tree.children.map((row) => row.children.map((c) => c.content.terminal));

test("Grid: 列数は ceil(sqrt(n))、行を上から埋め、最後の行に余りを置く", () => {
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4", "t5"], "t1")), [["t1", "t2", "t3"], ["t4", "t5"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4"], "t1")), [["t1", "t2"], ["t3", "t4"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3"], "t1")), [["t1", "t2"], ["t3"]]);
});

test("Grid: 外側は行の縦積み、各行は横並び（id は pv-row-<行番号>）", () => {
  assert.deepEqual(previewTree("Grid", ["t1", "t2"], "t2"), {
    id: "preview", type: "column", gap: 4,
    children: [{ id: "pv-row-0", type: "row", gap: 4, children: [cell("t1", false), cell("t2", true)] }],
  });
});

test("layout 全体: root は column、上が body（左に一覧、右に preview）、下がフッター", () => {
  const preview = previewTree("Single", [], null);
  const root = crmuxLayout(preview);
  assert.equal(root.id, "root");
  assert.equal(root.type, "column");
  assert.deepEqual(root.children.map((c) => c.id), ["body", "footer"]);
  const [body, footer] = root.children;
  assert.equal(body.type, "row");
  assert.deepEqual(body.children[0].content, { mod: "crmux-list" });
  assert.equal(body.children[1], preview);
  assert.deepEqual(footer.content, { mod: "crmux-footer" });
});

test("layouts/crmux.json（初期 layout）は Single の crmuxLayout と同じ", async () => {
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(new URL("../layouts/crmux.json", import.meta.url), "utf8"));
  assert.deepEqual(file, crmuxLayout(previewTree("Single", [], null)));
});

test("findNode は id でノードを探す（無ければ null）", () => {
  const root = crmuxLayout(previewTree("EvenH", ["t1", "t2"], "t1"));
  assert.equal(findNode(root, "pv-t2").content.terminal, "t2");
  assert.equal(findNode(root, "nope"), null);
  assert.equal(findNode(null, "x"), null);
});

test("sameTree: キーの順や数値の書き方が違っても同じ中身なら true", () => {
  const a = { id: "p", type: "row", gap: 4, children: [{ id: "x", size: { weight: 7 } }] };
  const b = { children: [{ size: { weight: 7.0 }, id: "x" }], type: "row", id: "p", gap: 4 };
  assert.equal(sameTree(a, b), true);
});

test("sameTree: 中身が違えば false", () => {
  assert.equal(sameTree(previewTree("EvenH", ["t1", "t2"], "t1"), previewTree("EvenH", ["t1", "t2"], "t2")), false);
  assert.equal(sameTree(previewTree("EvenH", ["t1", "t2"], "t1"), null), false);
});
