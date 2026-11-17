// Pure functions for the preview arrangement (crmux LayoutMode) and the crmux layout tree

// Cycling order for v (crmux state.rs LayoutMode::next)
export const ARRANGES = ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"];

export function nextArrange(arrange) {
  return ARRANGES[(ARRANGES.indexOf(arrange) + 1) % ARRANGES.length];
}

// Tree for the right side (id "preview"). addresses is in list order, selected is the selected address
const GAP = 4;

// Borders show where the keyboard is: every preview block keeps a 1px border (so nothing resizes) that turns accent while
// the focused pane is inside it (node-level focus). The selected preview in a multi-pane display has a light border instead
const border = (color) => ({ width: 1, color });
const FOCUS = { border: { width: 1, color: "accent" } };

const single = (content = { agent: "focused" }) => ({
  id: "preview", type: "block", border: border("border"), focus: FOCUS, content,
});

// Terminal block for one agent. The selected one has a light border (accent only while the keyboard is inside)
function cell(address, selected, extra = {}) {
  return {
    id: `pv-${address.replace(/[^A-Za-z0-9_-]/g, "_")}`, type: "block", ...extra,
    border: border(address === selected ? "foreground" : "border"),
    focus: FOCUS,
    content: { terminal: address },
  };
}

const split = (type, children, extra = {}) => ({ type, gap: GAP, ...extra, children });

// exited: addresses of exited shells (not agents, so agent.focus cannot put them in the Single agent block; show the terminal itself)
export function previewTree(arrange, addresses, selected, exited = []) {
  if (arrange === "Single" || addresses.length <= 1) {
    return exited.includes(selected) ? single({ terminal: selected }) : single();
  }
  const cells = addresses.map((a) => cell(a, selected));
  if (arrange === "EvenH") return split("row", cells, { id: "preview" });
  if (arrange === "EvenV") return split("column", cells, { id: "preview" });
  if (arrange === "MainV" || arrange === "MainH") return mainTree(arrange, addresses, selected);
  if (arrange === "Grid") return gridTree(cells);
  return single();
}

// MainV / MainH: selected agent as the main pane (crmux moves the selected one to the front). The main ratio is
// picked by crmux's MainV from the content width (60-80%); here the width is unknown, so it is fixed at 70%. MainH is 60%
const MAIN = {
  MainV: { type: "row", rest: "column", main: 7, other: 3 },
  MainH: { type: "column", rest: "row", main: 6, other: 4 },
};

function mainTree(arrange, addresses, selected) {
  const m = MAIN[arrange];
  const main = addresses.includes(selected) ? selected : addresses[0];
  const rest = addresses.filter((a) => a !== main).map((a) => cell(a, selected));
  return split(m.type, [
    cell(main, selected, { size: { weight: m.main } }),
    split(m.rest, rest, { id: "pv-rest", size: { weight: m.other } }),
  ], { id: "preview" });
}

// Grid: crmux decides the column count with a minimum of 80 columns; here the width is unknown, so ceil(sqrt(n)) columns.
// Fill rows from the top, with the remainder in the last row (crmux ui.rs grid_row_items)
function gridTree(cells) {
  const cols = Math.ceil(Math.sqrt(cells.length));
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(split("row", cells.slice(i, i + cols), { id: `pv-row-${rows.length}` }));
  }
  return split("column", rows, { id: "preview" });
}

// Whole crmux layout passed to layout.set (only preview is swapped). layouts/crmux.json is the same as this with Single.
// The list is a mod block, which does not honor `focus`, so it draws its own border (accent while it has the keyboard)
export function crmuxLayout(preview) {
  return {
    id: "root", type: "column", titlebar: "none", traffic_lights: [12, 16],
    background: "canvas", terminal_padding: [14, 12], divider: { width: 1, color: "border" },
    children: [
      { id: "header", type: "block", size: { px: 28 }, background: "chrome", window_drag: true, content: { mod: "crmux-tabs" } },
      {
        id: "body", type: "row",
        children: [
          { id: "list", type: "block", size: { px: 280 }, background: "chrome", window_drag: true, content: { mod: "crmux-list" } },
          preview,
        ],
      },
      { id: "footer", type: "block", size: { px: 28 }, background: "chrome", content: { mod: "crmux-footer" } },
    ],
  };
}

// Find the node with the given id in the layout tree
export function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// Whether the contents are the same regardless of key order (compares the tree layout() returns with the built tree)
export function sameTree(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => sameTree(a[k], b[k]));
}
