// Pure functions for the preview arrangement (crmux LayoutMode) and the crmux layout tree

// Cycling order for v (crmux state.rs LayoutMode::next)
export const ARRANGES = ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"];

export function nextArrange(arrange) {
  return ARRANGES[(ARRANGES.indexOf(arrange) + 1) % ARRANGES.length];
}

// Tree for the right side (id "preview"). addresses is in list order, selected is the selected address
const GAP = 4;

// Borders show where the keyboard is. Every preview is one rounded 1px frame around its title row and terminal (like
// herdr-app's own pane; 1px always, so nothing resizes). The layout's `focus` does not light up for a terminal block inside
// the column, so the color follows the list's mode instead: accent on the preview being typed into in Insert, a light frame
// on the selected one in a multi-pane display otherwise (so you can see which one i enters), gray for the rest
const frame = (color) => ({ width: 1, color });
// Corner radius of the frame (herdr's pane radius). The terminal block inside is rounded by 1px less (the frame's border
// width) so its corners stay inside the frame's arc
const RADIUS = 6;
// Height of the title row above each preview terminal (the same as herdr-app's own pane header)
const TITLE_PX = 30;

// A preview: a column of the title row (crmux-title mod, icon, N.project/branch, terminal title and status like the pane header)
// and the terminal block. The size and the frame go on the column, so the frame surrounds the title row too. The column
// paints the background inside its rounded frame; the title row has no square background of its own (the mod rounds its
// top corners). titleProps is what the title row is given ({} follows crmux.selected)
function titled(id, titleProps, content, color, extra = {}) {
  return {
    id, type: "column", ...extra, border: frame(color), radius: RADIUS, background: "background",
    children: [
      { id: `${id}-title`, type: "block", size: { px: TITLE_PX }, content: { mod: "crmux-title", ...titleProps } },
      { id: `${id}-body`, type: "block", radius: RADIUS - 1, content },
    ],
  };
}

// Single's title row is given no address: it follows crmux.selected, so a j/k (agent.focus) does not need a layout.set
const single = (insert, content = { agent: "focused" }) => titled("preview", {}, content, insert ? "accent" : "border");

// Preview for one agent. The selected one is accent in Insert, light otherwise
function cell(address, selected, insert, extra = {}) {
  const id = `pv-${address.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const color = address !== selected ? "border" : insert ? "accent" : "foreground";
  return titled(id, { props: { address } }, { terminal: address }, color, extra);
}

const split = (type, children, extra = {}) => ({ type, gap: GAP, ...extra, children });

// exited: addresses of exited shells (not agents, so agent.focus cannot put them in the Single agent block; show the terminal itself).
// insert: the list is in Insert (the selected preview is being typed into, so its frame is accent)
// main: the address shown large in MainV / MainH (defaults to selected). Separate from selected so that clicking a
// preview can select it in place without moving it into the main slot; borders always follow selected
export function previewTree(arrange, addresses, selected, exited = [], insert = false, main = selected) {
  if (arrange === "Single" || addresses.length <= 1) {
    return exited.includes(selected) ? single(insert, { terminal: selected }) : single(insert);
  }
  const cells = addresses.map((a) => cell(a, selected, insert));
  if (arrange === "EvenH") return split("row", cells, { id: "preview" });
  if (arrange === "EvenV") return split("column", cells, { id: "preview" });
  if (arrange === "MainV" || arrange === "MainH") return mainTree(arrange, addresses, selected, insert, main);
  if (arrange === "Grid") return gridTree(cells);
  return single(insert);
}

// MainV / MainH: the main agent (normally the selected one; crmux moves the selected one to the front) as the main pane. The main ratio is
// picked by crmux's MainV from the content width (60-80%); here the width is unknown, so it is fixed at 70%. MainH is 60%
const MAIN = {
  MainV: { type: "row", rest: "column", main: 7, other: 3 },
  MainH: { type: "column", rest: "row", main: 6, other: 4 },
};

function mainTree(arrange, addresses, selected, insert, wanted) {
  const m = MAIN[arrange];
  // main if listed, else the selection, else the first
  const main = [wanted, selected].find((a) => addresses.includes(a)) ?? addresses[0];
  const rest = addresses.filter((a) => a !== main).map((a) => cell(a, selected, insert));
  return split(m.type, [
    cell(main, selected, insert, { size: { weight: m.main } }),
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

// Whole crmux layout passed to layout.set (only preview is swapped). layouts/crmux.json is the same as this with Single in Normal.
// The list is a mod block, which does not honor `focus`, so it draws its own border (accent while it has the keyboard)
export function crmuxLayout(preview) {
  return {
    id: "root", type: "column", titlebar: "none", traffic_lights: [12, 16],
    background: "canvas", terminal_padding: [14, 12], divider: { width: 1, color: "border" },
    children: [
      { id: "header", type: "block", size: { px: 34 }, background: "chrome", window_drag: true, content: { mod: "crmux-tabs" } },
      {
        id: "body", type: "row", gap: 6, padding: 6,
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
