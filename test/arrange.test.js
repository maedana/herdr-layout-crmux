import { test } from "node:test";
import assert from "node:assert/strict";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree } from "../mods/crmux-list/arrange.js";

test("arrangements cycle MainV -> Single -> Grid -> EvenH -> EvenV -> MainH -> MainV", () => {
  const seen = ["MainV"];
  for (let i = 0; i < 6; i++) seen.push(nextArrange(seen[seen.length - 1]));
  assert.deepEqual(seen, ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH", "MainV"]);
});

test("the next of an unknown arrangement is MainV (crmux's default)", () => {
  assert.equal(nextArrange(undefined), "MainV");
});

const FOCUSED = { id: "preview", type: "block", content: { agent: "focused" } };

test("Single is one agent block (selection is switched with agent.focus)", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1"), FOCUSED);
});

// A shell is not an agent (agent.focus cannot show it), so an exited selection is shown as its terminal
const EXITED = (address) => ({ id: "preview", type: "block", content: { terminal: address } });

test("Single with an exited selection shows that terminal instead of the focused agent", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t2", ["t2"]), EXITED("t2"));
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1", ["t2"]), FOCUSED);
});

test("with one item or fewer, an exited selection is also shown as its terminal", () => {
  assert.deepEqual(previewTree("MainV", ["t1"], "t1", ["t1"]), EXITED("t1"));
});

test("with one agent or fewer, every arrangement is the same as Single", () => {
  assert.deepEqual(previewTree("MainV", ["t1"], "t1"), FOCUSED);
  assert.deepEqual(previewTree("Grid", [], null), FOCUSED);
});

// Blocks for multi-pane display: bordered, selected one gets an accent border
const cell = (address, selected, extra = {}) => ({
  id: `pv-${address}`, type: "block", ...extra,
  border: { width: 1, color: selected ? "accent" : "border" },
  content: { terminal: address },
});

test("EvenH splits horizontally in list order", () => {
  assert.deepEqual(previewTree("EvenH", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [cell("t1", false), cell("t2", true), cell("t3", false)],
  });
});

test("EvenV splits vertically in list order", () => {
  assert.deepEqual(previewTree("EvenV", ["t1", "t2"], "t1"), {
    id: "preview", type: "column", gap: 4,
    children: [cell("t1", true), cell("t2", false)],
  });
});

test("block ids replace non-alphanumerics (such as the / in another machine's machine/t7) with _", () => {
  const tree = previewTree("EvenH", ["vps/t7", "t1"], "t1");
  assert.equal(tree.children[0].id, "pv-vps_t7");
  assert.deepEqual(tree.children[0].content, { terminal: "vps/t7" });
});

test("MainV: selected as the left main (70%), the rest stacked vertically on the right in list order", () => {
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [
      cell("t2", true, { size: { weight: 7 } }),
      { id: "pv-rest", type: "column", gap: 4, size: { weight: 3 }, children: [cell("t1", false), cell("t3", false)] },
    ],
  });
});

test("MainH: selected as the top main (60%), the rest side by side below", () => {
  assert.deepEqual(previewTree("MainH", ["t1", "t2", "t3"], "t3"), {
    id: "preview", type: "column", gap: 4,
    children: [
      cell("t3", true, { size: { weight: 6 } }),
      { id: "pv-rest", type: "row", gap: 4, size: { weight: 4 }, children: [cell("t1", false), cell("t2", false)] },
    ],
  });
});

test("Main variants: if the selection is not in the list, the first becomes the main", () => {
  const tree = previewTree("MainV", ["t1", "t2"], "t9");
  assert.deepEqual(tree.children[0].content, { terminal: "t1" });
  assert.deepEqual(tree.children[1].children.map((c) => c.content.terminal), ["t2"]);
});

const gridShape = (tree) => tree.children.map((row) => row.children.map((c) => c.content.terminal));

test("Grid: columns are ceil(sqrt(n)), rows fill from the top, the remainder goes in the last row", () => {
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4", "t5"], "t1")), [["t1", "t2", "t3"], ["t4", "t5"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4"], "t1")), [["t1", "t2"], ["t3", "t4"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3"], "t1")), [["t1", "t2"], ["t3"]]);
});

test("Grid: outer is a vertical stack of rows, each row is horizontal (id is pv-row-<row number>)", () => {
  assert.deepEqual(previewTree("Grid", ["t1", "t2"], "t2"), {
    id: "preview", type: "column", gap: 4,
    children: [{ id: "pv-row-0", type: "row", gap: 4, children: [cell("t1", false), cell("t2", true)] }],
  });
});

test("whole layout: root is a column: header (tab bar) on top, body (list on the left, preview on the right) in the middle, footer at the bottom", () => {
  const preview = previewTree("Single", [], null);
  const root = crmuxLayout(preview);
  assert.equal(root.id, "root");
  assert.equal(root.type, "column");
  assert.deepEqual(root.children.map((c) => c.id), ["header", "body", "footer"]);
  const [header, body, footer] = root.children;
  assert.deepEqual(header, {
    id: "header", type: "block", size: { px: 28 }, background: "chrome", window_drag: true, content: { mod: "crmux-tabs" },
  });
  assert.equal(body.type, "row");
  assert.deepEqual(body.children[0].content, { mod: "crmux-list" });
  assert.equal(body.children[1], preview);
  assert.deepEqual(footer.content, { mod: "crmux-footer" });
});

test("layouts/crmux.json (the initial layout) is the same as Single's crmuxLayout", async () => {
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(new URL("../layouts/crmux.json", import.meta.url), "utf8"));
  assert.deepEqual(file, crmuxLayout(previewTree("Single", [], null)));
});

test("findNode finds a node by id (null if missing)", () => {
  const root = crmuxLayout(previewTree("EvenH", ["t1", "t2"], "t1"));
  assert.equal(findNode(root, "pv-t2").content.terminal, "t2");
  assert.equal(findNode(root, "nope"), null);
  assert.equal(findNode(null, "x"), null);
});

test("sameTree: true if the contents are the same even when key order or number notation differs", () => {
  const a = { id: "p", type: "row", gap: 4, children: [{ id: "x", size: { weight: 7 } }] };
  const b = { children: [{ size: { weight: 7.0 }, id: "x" }], type: "row", id: "p", gap: 4 };
  assert.equal(sameTree(a, b), true);
});

test("sameTree: false if the contents differ", () => {
  assert.equal(sameTree(previewTree("EvenH", ["t1", "t2"], "t1"), previewTree("EvenH", ["t1", "t2"], "t2")), false);
  assert.equal(sameTree(previewTree("EvenH", ["t1", "t2"], "t1"), null), false);
});
