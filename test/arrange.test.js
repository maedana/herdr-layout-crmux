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

// Every preview is a column of a title row (crmux-title mod) and the terminal block, in one rounded 1px frame around both
// (like herdr-app's own pane). Its color follows the list's mode, not the layout's `focus` (which does not light up for a
// terminal block inside the column): accent on the preview being typed into in Insert. The list draws its own border
const frame = (color) => ({ width: 1, color });
const TITLE_PX = 30;
// The frame is rounded (6, herdr's pane radius) and paints the background; the title row paints its own (rounded at the
// top) and the terminal block is rounded 5 (6 minus the 1px border), so no square corner pokes out of the frame
const titled = (id, titleProps, content, extra) => ({
  id, type: "column", radius: 6, background: "background", ...extra,
  children: [
    { id: `${id}-title`, type: "block", size: { px: TITLE_PX }, content: { mod: "crmux-title", ...titleProps } },
    { id: `${id}-body`, type: "block", radius: 5, content },
  ],
});
// Single's title row gets no address and follows crmux.selected, so moving the selection does not change the tree
const FOCUSED = titled("preview", {}, { agent: "focused" }, { border: frame("border") });

test("Single is one agent block (selection is switched with agent.focus)", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1"), FOCUSED);
});

// A shell is not an agent (agent.focus cannot show it), so an exited selection is shown as its terminal
const EXITED = (address) => titled("preview", {}, { terminal: address }, { border: frame("border") });

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

// Previews for multi-pane display: the selected one has a light frame in Normal (accent in Insert), the others gray.
// The title row is given the address it shows
const cell = (address, color, extra = {}) => titled(`pv-${address}`, { props: { address } }, { terminal: address }, {
  ...extra,
  border: frame(color),
});
const body = (node) => node.children[1];

test("EvenH splits horizontally in list order", () => {
  assert.deepEqual(previewTree("EvenH", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [cell("t1", "border"), cell("t2", "foreground"), cell("t3", "border")],
  });
});

test("EvenV splits vertically in list order", () => {
  assert.deepEqual(previewTree("EvenV", ["t1", "t2"], "t1"), {
    id: "preview", type: "column", gap: 4,
    children: [cell("t1", "foreground"), cell("t2", "border")],
  });
});

test("block ids replace non-alphanumerics (such as the / in another machine's machine/t7) with _", () => {
  const tree = previewTree("EvenH", ["vps/t7", "t1"], "t1");
  assert.equal(tree.children[0].id, "pv-vps_t7");
  assert.equal(tree.children[0].children[0].id, "pv-vps_t7-title");
  assert.deepEqual(tree.children[0].children[0].content.props, { address: "vps/t7" });
  assert.deepEqual(body(tree.children[0]), { id: "pv-vps_t7-body", type: "block", radius: 5, content: { terminal: "vps/t7" } });
});

test("the title row is a fixed 30px strip (the height of herdr's pane header) above the terminal; size and the frame are on the column around both", () => {
  const main = previewTree("MainV", ["t1", "t2"], "t1").children[0];
  assert.equal(main.type, "column");
  assert.deepEqual(main.size, { weight: 7 });
  assert.deepEqual(main.border, { width: 1, color: "foreground" });
  const [title, term] = main.children;
  assert.deepEqual(title, {
    id: "pv-t1-title", type: "block", size: { px: 30 }, content: { mod: "crmux-title", props: { address: "t1" } },
  });
  assert.equal("border" in term, false);
  assert.equal("focus" in term, false);
});

test("frames are rounded like herdr's panes; the terminal block's corners stay inside the 1px frame", () => {
  const main = previewTree("MainV", ["t1", "t2"], "t1").children[0];
  assert.equal(main.radius, 6);
  assert.equal(main.background, "background");
  // The title row paints no square background of its own (the mod rounds its top corners)
  assert.equal("background" in main.children[0], false);
  assert.equal(main.children[1].radius, 5);
  assert.equal(previewTree("Single", ["t1"], "t1").radius, 6);
});

// Every frame on the right side (any node with a border), for checking all arrangements at once
const frames = (node) => [...(node.border ? [node] : []), ...(node.children ?? []).flatMap(frames)];

test("no preview uses the layout's `focus` (it does not light up for a terminal inside the column); the mode drives the color", () => {
  for (const arrange of ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"]) {
    for (const insert of [false, true]) {
      const all = frames(previewTree(arrange, ["t1", "t2", "t3"], "t2", [], insert));
      assert.ok(all.length > 0);
      for (const f of all) assert.equal("focus" in f, false, `${arrange} insert=${insert}`);
    }
  }
});

test("Insert: the selected preview's frame is accent (the one being typed into), the others stay gray", () => {
  assert.deepEqual(previewTree("EvenH", ["t1", "t2", "t3"], "t2", [], true), {
    id: "preview", type: "row", gap: 4,
    children: [cell("t1", "border"), cell("t2", "accent"), cell("t3", "border")],
  });
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2", [], true), {
    id: "preview", type: "row", gap: 4,
    children: [
      cell("t2", "accent", { size: { weight: 7 } }),
      { id: "pv-rest", type: "column", gap: 4, size: { weight: 3 }, children: [cell("t1", "border"), cell("t3", "border")] },
    ],
  });
});

test("Single: an accent frame in Insert, gray in Normal (also for an exited shell's terminal)", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1", [], true), titled("preview", {}, { agent: "focused" }, { border: frame("accent") }));
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1", [], false), FOCUSED);
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t2", ["t2"], true), titled("preview", {}, { terminal: "t2" }, { border: frame("accent") }));
  assert.deepEqual(previewTree("MainV", ["t1"], "t1", [], true).border, frame("accent"));
});

test("switching Normal / Insert only recolors frames: every frame stays 1px, so nothing resizes", () => {
  for (const arrange of ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"]) {
    const normal = previewTree(arrange, ["t1", "t2", "t3"], "t2", [], false);
    const insert = previewTree(arrange, ["t1", "t2", "t3"], "t2", [], true);
    for (const f of [...frames(normal), ...frames(insert)]) assert.equal(f.border.width, 1);
    const strip = (n) => JSON.parse(JSON.stringify(n, (k, v) => (k === "color" ? undefined : v)));
    assert.deepEqual(strip(insert), strip(normal), arrange);
  }
});

test("Single: moving the selection keeps the same tree (the title row follows crmux.selected)", () => {
  assert.deepEqual(previewTree("Single", ["t1", "t2"], "t1"), previewTree("Single", ["t1", "t2"], "t2"));
});

test("MainV: selected as the left main (70%), the rest stacked vertically on the right in list order", () => {
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2"), {
    id: "preview", type: "row", gap: 4,
    children: [
      cell("t2", "foreground", { size: { weight: 7 } }),
      { id: "pv-rest", type: "column", gap: 4, size: { weight: 3 }, children: [cell("t1", "border"), cell("t3", "border")] },
    ],
  });
});

test("MainH: selected as the top main (60%), the rest side by side below", () => {
  assert.deepEqual(previewTree("MainH", ["t1", "t2", "t3"], "t3"), {
    id: "preview", type: "column", gap: 4,
    children: [
      cell("t3", "foreground", { size: { weight: 6 } }),
      { id: "pv-rest", type: "row", gap: 4, size: { weight: 4 }, children: [cell("t1", "border"), cell("t2", "border")] },
    ],
  });
});

test("Main variants: if the selection is not in the list, the first becomes the main", () => {
  const tree = previewTree("MainV", ["t1", "t2"], "t9");
  assert.deepEqual(body(tree.children[0]).content, { terminal: "t1" });
  assert.deepEqual(tree.children[1].children.map((c) => body(c).content.terminal), ["t2"]);
});

// The main slot and the selection are separate: clicking a preview selects it in place (the main stays), while a pick
// from the list moves both. Borders follow the selection, the large pane follows main
test("MainV: with main != selected, main stays large and the selected cell gets the light border (accent in Insert)", () => {
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2", [], false, "t1"), {
    id: "preview", type: "row", gap: 4,
    children: [
      cell("t1", "border", { size: { weight: 7 } }),
      { id: "pv-rest", type: "column", gap: 4, size: { weight: 3 }, children: [cell("t2", "foreground"), cell("t3", "border")] },
    ],
  });
  assert.deepEqual(previewTree("MainV", ["t1", "t2", "t3"], "t2", [], true, "t1").children[1].children[0], cell("t2", "accent"));
});

test("MainH: with main != selected, main stays the top pane and the selected one keeps its place below", () => {
  assert.deepEqual(previewTree("MainH", ["t1", "t2", "t3"], "t3", [], false, "t2"), {
    id: "preview", type: "column", gap: 4,
    children: [
      cell("t2", "border", { size: { weight: 6 } }),
      { id: "pv-rest", type: "row", gap: 4, size: { weight: 4 }, children: [cell("t1", "border"), cell("t3", "foreground")] },
    ],
  });
});

test("Main variants: main defaults to selected, and falls back to selected (then the first) when it is not in the list", () => {
  const mainOf = (tree) => body(tree.children[0]).content.terminal;
  assert.equal(mainOf(previewTree("MainV", ["t1", "t2"], "t2")), "t2");
  assert.equal(mainOf(previewTree("MainV", ["t1", "t2"], "t2", [], false, undefined)), "t2");
  assert.equal(mainOf(previewTree("MainV", ["t1", "t2"], "t2", [], false, "t9")), "t2");
  assert.equal(mainOf(previewTree("MainV", ["t1", "t2"], "t9", [], false, "t8")), "t1");
});

test("main does not affect the other arrangements", () => {
  for (const arrange of ["Single", "Grid", "EvenH", "EvenV"]) {
    assert.deepEqual(previewTree(arrange, ["t1", "t2", "t3"], "t2", [], false, "t1"), previewTree(arrange, ["t1", "t2", "t3"], "t2"), arrange);
  }
});

const gridShape = (tree) => tree.children.map((row) => row.children.map((c) => body(c).content.terminal));

test("Grid: columns are ceil(sqrt(n)), rows fill from the top, the remainder goes in the last row", () => {
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4", "t5"], "t1")), [["t1", "t2", "t3"], ["t4", "t5"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3", "t4"], "t1")), [["t1", "t2"], ["t3", "t4"]]);
  assert.deepEqual(gridShape(previewTree("Grid", ["t1", "t2", "t3"], "t1")), [["t1", "t2"], ["t3"]]);
});

test("Grid: outer is a vertical stack of rows, each row is horizontal (id is pv-row-<row number>)", () => {
  assert.deepEqual(previewTree("Grid", ["t1", "t2"], "t2"), {
    id: "preview", type: "column", gap: 4,
    children: [{ id: "pv-row-0", type: "row", gap: 4, children: [cell("t1", "border"), cell("t2", "foreground")] }],
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
    id: "header", type: "block", size: { px: 34 }, background: "chrome", window_drag: true, content: { mod: "crmux-tabs" },
  });
  assert.equal(body.type, "row");
  // A small gap between the list and the preview
  assert.equal(body.gap, 6);
  // ...and the same space inside its edge, so the list's and previews' frames do not sit on the dividers or the window edge
  assert.equal(body.padding, 6);
  assert.deepEqual(body.children[0].content, { mod: "crmux-list" });
  // A mod block does not honor `focus`, so the list draws its own border (accent while it has the keyboard)
  assert.equal("border" in body.children[0], false);
  assert.equal("focus" in body.children[0], false);
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
  assert.equal(findNode(root, "pv-t2-body").content.terminal, "t2");
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
