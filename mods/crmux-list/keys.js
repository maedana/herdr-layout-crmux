// Key -> act() name for each mode of the list (crmux event_handler.rs handle_normal_mode / handle_scroll_mode).
// gg: true when this g is the second of g g.

// Normal mode
const NORMAL = {
  j: "down", down: "down", k: "up", up: "up", t: "toggle", i: "insert", v: "arrange", q: "main",
  h: "tab-prev", left: "tab-prev", l: "tab-next", right: "tab-next", space: "mark",
  x: "close", n: "shell", f: "hint", escape: "esc",
};
// Scroll mode (entered with C-u / gg): j/k scroll the preview instead of moving the selection; other keys are ignored
const SCROLL = {
  j: "line-down", down: "line-down", k: "line-up", up: "line-up", i: "insert", escape: "esc",
};
const CTRL = { u: "scroll-up", d: "scroll-down" };

function lookup(table, k, m, gg) {
  if (m.control) return CTRL[k] ?? null;
  if (k === "G" || (k === "g" && m.shift)) return "bottom";
  if (table === NORMAL && (k === "R" || (k === "r" && m.shift))) return "unpin";
  if (m.shift) return null;
  if (gg) return "top";
  return table[k] ?? null;
}

export function normalKey(k, m, gg) {
  if (!m.control && !m.shift && /^[1-9]$/.test(k)) return `select-${k}`;
  return lookup(NORMAL, k, m, gg);
}

export function scrollKey(k, m, gg) {
  return lookup(SCROLL, k, m, gg);
}

// Preview scroll in Scroll mode. Herdr does not report the position of the crmux preview's view
// (panes().scroll is the main layout's view), so like crmux's preview_scroll, count the lines scrolled up
// (up: 0 = at the bottom, never above view.max). Reaching 0 sends to: bottom so the view lands exactly at the end.
export function scrollStep(name, up, view) {
  const half = Math.floor(view.page / 2);
  const toward = (delta, args) => {
    const next = Math.min(view.max, Math.max(0, up + delta));
    return { up: next, args: next === 0 ? { to: "bottom" } : args };
  };
  if (name === "scroll-up") return toward(half, { lines: -half });
  if (name === "line-up") return toward(1, { lines: -1 });
  if (name === "scroll-down") return toward(-half, { lines: half });
  if (name === "line-down") return toward(-1, { lines: 1 });
  if (name === "top") return { up: view.max, args: { to: "top" } };
  return { up: 0, args: { to: "bottom" } };
}

// Rows of one page and how far up the history goes, from the agent's pane (defaults when there is no scroll info)
export function scrollView(panes, pane) {
  const s = panes.find((p) => p.pane === pane)?.scroll;
  return s ? { page: s.len, max: Math.max(0, s.total - s.len) } : { page: 40, max: 0 };
}

// The keyboard is in a preview terminal block (e.g. it was clicked): that preview's address, else null.
// focused is herdr's focused(): a layout terminal block has a terminal and no pane. Only listed agents count (not another tab's)
export function previewFocus(focused, addresses) {
  if (!focused || focused.pane !== null) return null;
  return addresses.includes(focused.terminal) ? focused.terminal : null;
}

// What to do when the keyboard moved without the list's keys (a click). focusedPreview is previewFocus(), listFocused
// whether the list holds the keyboard, selected the current selection.
// Insert: the list has it -> { type: "leave" } (Normal); a different listed preview has it -> { type: "select", address }.
// Normal: a listed preview has it and the list does not -> { type: "enter", address } (Insert on it). Otherwise null
export function focusAction({ insert, focusedPreview, listFocused, selected }) {
  if (insert) {
    if (listFocused) return { type: "leave" };
    return focusedPreview && focusedPreview !== selected ? { type: "select", address: focusedPreview } : null;
  }
  return focusedPreview && !listFocused ? { type: "enter", address: focusedPreview } : null;
}
