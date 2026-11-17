// Pure functions for tabs (All / Marked / @space / +project) (crmux state.rs TabState)
import { cycle } from "./cards.js";

const uniqSorted = (values) => [...new Set(values)].sort();

// Spaces that have agents (in herdr's space order)
function spaceTabs(agents) {
  const byId = new Map();
  for (const a of agents) {
    if (!byId.has(a.space)) byId.set(a.space, { kind: "space", value: a.space, name: a.spaceName, index: a.spaceIndex });
  }
  return [...byId.values()].sort((x, y) => x.index - y.index).map(({ index, ...tab }) => tab);
}

// Tab list (crmux state.rs rebuild_tabs): All -> Marked (if any marks) -> @space (if 2 or more) -> +project
export function buildTabs(agents, marks) {
  const marked = agents.some((a) => marks.includes(a.address));
  const spaces = spaceTabs(agents);
  return [
    { kind: "all" },
    ...(marked ? [{ kind: "marked" }] : []),
    ...(spaces.length >= 2 ? spaces : []),
    ...uniqSorted(agents.map((a) => a.project)).map((value) => ({ kind: "project", value })),
  ];
}

// Agents filtered by tab (crmux state.rs filtered_sessions)
export function filterByTab(agents, tab, marks) {
  if (tab.kind === "marked") return agents.filter((a) => marks.includes(a.address));
  if (tab.kind === "space") return agents.filter((a) => a.space === tab.value);
  if (tab.kind === "project") return agents.filter((a) => a.project === tab.value);
  return agents;
}

const sameTab = (a, b) => a.kind === b?.kind && (a.value ?? null) === (b?.value ?? null);

// Position of the saved tab ({ kind, value }). All (0) if it no longer exists
export function tabIndex(tabs, stored) {
  return Math.max(0, tabs.findIndex((t) => sameTab(t, stored)));
}

// h / l: the tab dir (1 / -1) steps from the current one (wraps at the ends; crmux select_next_tab / select_prev_tab)
export function cycleTab(tabs, current, dir) {
  return tabs[cycle(tabIndex(tabs, current), dir, tabs.length)];
}

// Selection after switching tabs (crmux event_handler.rs switch_tab): keep it if it is in the new tab, otherwise the first
export function keepSelection(addresses, selected) {
  return addresses.includes(selected) ? selected : addresses[0] ?? null;
}

// Tab bar labels (crmux ui.rs draw_tab_bar), with the number of agents as "name(N)" when count is given
// (crmux showed the count only in a heading for the current tab; here every tab carries it instead)
export function tabLabel(tab, count) {
  const name = tab.kind === "marked" ? "Marked"
    : tab.kind === "space" ? `@${tab.name}`
    : tab.kind === "project" ? `+${tab.value}`
    : "All";
  return count === undefined ? name : `${name}(${count})`;
}

// Labels for the tab bar: each tab with the number of agents it shows
export function tabBarLabels(tabs, agents, marks) {
  return tabs.map((tab) => tabLabel(tab, filterByTab(agents, tab, marks).length));
}

const len = (s) => [...s].length;
const slice = (s, from, to) => [...s].slice(from, to).join("");

// Visible range of the tab bar (crmux ui.rs draw_tab_bar). width is in characters.
// Returns parts from the left: { text, selected } (tab) / { text: " " } (separator) / { text, arrow: true } (< and >)
export function tabBarWindow(labels, selected, width) {
  if (width <= 0 || !labels.length) return [];
  const texts = labels.map((l, i) => (i === selected ? `[${l}]` : l));
  const positions = [];
  let pos = 0;
  texts.forEach((t, i) => {
    if (i > 0) pos += 1;
    positions.push([pos, pos + len(t)]);
    pos += len(t);
  });
  const total = pos;
  if (total <= width) {
    return texts.flatMap((text, i) => [...(i > 0 ? [{ text: " " }] : []), { text, selected: i === selected }]);
  }
  // Center the selected tab
  const [selStart, selEnd] = positions[selected];
  const viewStart = Math.max(0, Math.floor((selStart + selEnd) / 2) - Math.floor(width / 2));
  const viewEnd = viewStart + width;
  const hasLeft = viewStart > 0;
  const hasRight = viewEnd < total;
  const from = hasLeft ? viewStart + 2 : viewStart;
  const to = hasRight ? viewEnd - 2 : viewEnd;
  const segs = hasLeft ? [{ text: "< ", arrow: true }] : [];
  texts.forEach((text, i) => {
    const [start, end] = positions[i];
    if (i > 0 && start - 1 >= from && start - 1 < to) segs.push({ text: " " });
    if (end > from && start < to) {
      const visible = slice(text, Math.max(0, from - start), end > to ? to - start : len(text));
      if (visible) segs.push({ text: visible, selected: i === selected });
    }
  });
  if (hasRight) segs.push({ text: " >", arrow: true });
  return segs;
}

// --- Marks (array of addresses in shared("crmux.marks")) ---

// Space: toggle the mark on the selected one (crmux state.rs toggle_mark)
export function toggleMark(marks, address) {
  const list = marks ?? [];
  return list.includes(address) ? list.filter((a) => a !== address) : [...list, address];
}

// Drop marks of agents that are gone. Returns the same array if unchanged (=== lets callers skip writing to shared)
export function pruneMarks(marks, agents) {
  if (!marks) return [];
  const alive = new Set(agents.map((a) => a.address));
  const kept = marks.filter((a) => alive.has(a));
  return kept.length === marks.length ? marks : kept;
}

// Start of the card body (crmux ui.rs mark_indicator)
export function markPrefix(marked) {
  return marked ? "* " : "  ";
}
