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

// Tab list (crmux state.rs rebuild_tabs): All -> Agents -> Marked (if any marks) -> @space (if 2 or more) -> +project.
// Agents is always there (even with no shell to leave out), so tab-select-1 / tab-select-2 stay on All / Agents
export function buildTabs(agents, marks) {
  const marked = agents.some((a) => marks.includes(a.address));
  const spaces = spaceTabs(agents);
  return [
    { kind: "all" },
    { kind: "agents" },
    ...(marked ? [{ kind: "marked" }] : []),
    ...(spaces.length >= 2 ? spaces : []),
    ...uniqSorted(agents.map((a) => a.project)).map((value) => ({ kind: "project", value })),
  ];
}

// Agents filtered by tab (crmux state.rs filtered_sessions). Agents leaves the plain shells (status "exited") out
export function filterByTab(agents, tab, marks) {
  if (tab.kind === "agents") return agents.filter((a) => a.status !== "exited");
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
    : tab.kind === "agents" ? "Agents"
    : tab.kind === "space" ? `@${tab.name}`
    : tab.kind === "project" ? `+${tab.value}`
    : "All";
  return count === undefined ? name : `${name}(${count})`;
}

// Labels for the tab bar: each tab with the number of agents it shows, and a pin when it has its own order (orders:
// shared("crmux.orders"))
export function tabBarLabels(tabs, agents, marks, orders = {}) {
  return tabs.map((tab) => tabLabel(tab, filterByTab(agents, tab, marks).length) + (orders[tabKey(tab)] ? PIN : ""));
}

// --- A tab's own order (array of addresses per tab in shared("crmux.orders"): { [tabKey]: [addresses] }) ---
// crmux-list.swap-* swaps previews, which saves the tab's shown order; R drops it (back to the list's automatic order)

const PIN = "📌";

// Key of a tab in crmux.orders (the space by its id, which a rename does not change; the project by its name)
export function tabKey(tab) {
  return tab.kind === "space" || tab.kind === "project" ? `${tab.kind}:${tab.value}` : tab.kind;
}

// The tab's list in its own order: the saved ones first, in the saved order, then the ones not saved yet (newcomers) in the
// list's order. The list itself when the tab has no order
export function applyOrder(items, order) {
  if (!order) return items;
  const at = new Map(order.map((address, i) => [address, i]));
  const saved = items.filter((a) => at.has(a.address)).sort((x, y) => at.get(x.address) - at.get(y.address));
  return [...saved, ...items.filter((a) => !at.has(a.address))];
}

// The shown order (addresses) with a and b trading places
export function swapInOrder(addresses, a, b) {
  return addresses.map((x) => (x === a ? b : x === b ? a : x));
}

// Drop terminals that are gone from every order, and the order of a tab left with none. Returns the same object if
// unchanged (=== lets callers skip writing to shared), empty if nothing is saved
export function pruneOrders(orders, items) {
  if (!orders) return {};
  const alive = new Set(items.map((a) => a.address));
  let changed = false;
  const next = {};
  for (const [key, order] of Object.entries(orders)) {
    const kept = order.filter((a) => alive.has(a));
    if (kept.length !== order.length) changed = true;
    if (kept.length) next[key] = kept;
  }
  return changed ? next : orders;
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
