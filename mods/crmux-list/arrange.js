// Pure functions for the preview arrangement (crmux LayoutMode) and the crmux layout tree

// Cycling order for v (crmux state.rs LayoutMode::next)
export const ARRANGES = ["MainV", "Single", "Grid", "EvenH", "EvenV", "MainH"];

export function nextArrange(arrange) {
  return ARRANGES[(ARRANGES.indexOf(arrange) + 1) % ARRANGES.length];
}

const GAP = 4;
// Corner radius of a preview's frame (herdr's pane radius). The terminal block and the title row's top corners inside are
// rounded by 1px less (the frame's border width) so their corners stay inside the frame's arc
const RADIUS = 6;
const RADIUS_INNER = RADIUS - 1;
// Height of the title row above each preview terminal (the same as herdr-app's own pane header)
const TITLE_PX = 30;

// A preview: a column of the title row (crmux-title mod, icon, N.project/branch, terminal title and status like the pane header)
// and the terminal block. The size and the frame go on the column, so the frame surrounds the title row too. The column
// paints the background inside its rounded frame; the title row has no square background of its own (the mod rounds its
// top corners by the radius it is given, the same as the terminal block's). address is what the title row shows (null:
// Single's, which follows the list's shown selection; it is left out so the tree does not change with the selection).
// Borders show where the keyboard is. The frame is one rounded 1px border (like herdr-app's own pane; 1px always, so nothing
// resizes). The layout's `focus` does not light up for a terminal block inside the column, so the color follows the list's
// mode instead: accent on the preview being typed into in Insert, a light frame on the selected one in a multi-pane display
// otherwise (so you can see which one i enters), gray for the rest
function titled(id, address, content, color, extra = {}) {
  const props = address === null ? { radius: RADIUS_INNER } : { address, radius: RADIUS_INNER };
  return {
    id, type: "column", ...extra, border: { width: 1, color }, radius: RADIUS, background: "background",
    children: [
      { id: `${id}-title`, type: "block", size: { px: TITLE_PX }, content: { mod: "crmux-title", props } },
      { id: `${id}-body`, type: "block", radius: RADIUS_INNER, content },
    ],
  };
}

// Preview for one agent. The selected one is accent in Insert, light otherwise
function cell(address, selected, insert, extra = {}) {
  const id = `pv-${address.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const color = address !== selected ? "border" : insert ? "accent" : "foreground";
  return titled(id, address, { terminal: address }, color, extra);
}

const split = (type, children, extra = {}) => ({ type, gap: GAP, ...extra, children });

// Tree for the right side (id "preview"). addresses is in list order, selected is the selected address.
// exited: addresses of exited shells (not agents, so agent.focus cannot put them in the Single agent block; show the terminal itself).
// insert: the list is in Insert (the selected preview is being typed into, so its frame is accent)
// main: the address shown large in MainV / MainH (defaults to selected; the list resolves an unset or gone one). Separate
// from selected so that clicking a preview can select it in place without moving it into the main slot; borders always
// follow selected
export function previewTree(arrange, addresses, selected, { exited = [], insert = false, main = selected } = {}) {
  if (addresses.length > 1) {
    const cells = addresses.map((a) => cell(a, selected, insert));
    if (arrange === "EvenH") return split("row", cells, { id: "preview" });
    if (arrange === "EvenV") return split("column", cells, { id: "preview" });
    if (arrange === "MainV" || arrange === "MainH") return mainTree(arrange, addresses, selected, insert, main);
    if (arrange === "Grid") return gridTree(cells);
  }
  // Single (also with one agent or fewer): the agent block herdr focuses, or an exited selection's terminal. Its title row
  // is given no address: it follows the list's shown selection (crmux.shown), so a j/k (agent.focus) does not need a layout.set
  const content = exited.includes(selected) ? { terminal: selected } : { agent: "focused" };
  return titled("preview", null, content, insert ? "accent" : "border");
}

// MainV / MainH: the main agent (normally the selected one; crmux moves the selected one to the front) as the main pane. The main ratio is
// picked by crmux's MainV from the content width (60-80%); here the width is unknown, so it is fixed at 70%. MainH is 60%
const MAIN = {
  MainV: { type: "row", rest: "column", main: 7, other: 3 },
  MainH: { type: "column", rest: "row", main: 6, other: 4 },
};

function mainTree(arrange, addresses, selected, insert, wanted) {
  const m = MAIN[arrange];
  // wanted if listed, else the first
  const main = addresses.includes(wanted) ? wanted : addresses[0];
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

// --- Moving between previews (the main layout's pane keys, alt-h/j/k/l) ---

const EPS = 1e-9;

// Where each addressed preview sits in the right side, as fractions of it: { address: { x0, y0, x1, y1 } }. A row splits its
// width and a column its height by the children's weights (1 unless given); gaps are left out. A preview is a column whose
// first child is the crmux-title row; Single's has no address and is left out
function cellRects(node, rect = { x0: 0, y0: 0, x1: 1, y1: 1 }, out = {}) {
  const title = node?.children?.[0]?.content;
  if (title?.mod === "crmux-title") {
    if (title.props?.address) out[title.props.address] = rect;
    return out;
  }
  const children = node?.children ?? [];
  const weights = children.map((c) => c.size?.weight ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let at = 0;
  children.forEach((child, i) => {
    const from = at / total;
    at += weights[i];
    const to = at / total;
    const lerp = (a, b, f) => a + (b - a) * f;
    const part = node.type === "row"
      ? { ...rect, x0: lerp(rect.x0, rect.x1, from), x1: lerp(rect.x0, rect.x1, to) }
      : { ...rect, y0: lerp(rect.y0, rect.y1, from), y1: lerp(rect.y0, rect.y1, to) };
    cellRects(child, part, out);
  });
  return out;
}

// How far r lies from cur in dir (null if it is not that way) and how much it overlaps cur across that direction
function towards(cur, r, dir) {
  const across = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  if (dir === "right" && r.x0 >= cur.x1 - EPS) return { gap: r.x0 - cur.x1, overlap: across(cur.y0, cur.y1, r.y0, r.y1) };
  if (dir === "left" && r.x1 <= cur.x0 + EPS) return { gap: cur.x0 - r.x1, overlap: across(cur.y0, cur.y1, r.y0, r.y1) };
  if (dir === "down" && r.y0 >= cur.y1 - EPS) return { gap: r.y0 - cur.y1, overlap: across(cur.x0, cur.x1, r.x0, r.x1) };
  if (dir === "up" && r.y1 <= cur.y0 + EPS) return { gap: cur.y0 - r.y1, overlap: across(cur.x0, cur.x1, r.x0, r.x1) };
  return null;
}

// The preview next to from in dir ("left" | "right" | "up" | "down") in the right side's tree (previewTree): the nearest one
// that way that lines up with it, the one most in line on a tie (then the first). null when there is none that way (left
// of the leftmost means the list), in Single, or when from is not shown
export function goTarget(tree, from, dir) {
  const rects = cellRects(tree);
  const cur = rects[from];
  if (!cur) return null;
  let best = null;
  for (const [address, r] of Object.entries(rects)) {
    if (address === from) continue;
    const t = towards(cur, r, dir);
    if (!t || t.overlap <= EPS) continue;
    if (!best || t.gap < best.gap - EPS || (Math.abs(t.gap - best.gap) <= EPS && t.overlap > best.overlap + EPS)) {
      best = { address, ...t };
    }
  }
  return best?.address ?? null;
}
