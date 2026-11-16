// タブ（All / Marked / @space / +project）の純粋関数（crmux state.rs TabState）
import { cycle } from "./cards.js";

const uniqSorted = (values) => [...new Set(values)].sort();

// エージェントのいるスペース（herdr のスペースの順）
function spaceTabs(agents) {
  const byId = new Map();
  for (const a of agents) {
    if (!byId.has(a.space)) byId.set(a.space, { kind: "space", value: a.space, name: a.spaceName, index: a.spaceIndex });
  }
  return [...byId.values()].sort((x, y) => x.index - y.index).map(({ index, ...tab }) => tab);
}

// タブ一覧（crmux state.rs rebuild_tabs）: All → Marked（マークがあれば）→ @space（2 つ以上なら）→ +project
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

// タブで絞り込んだエージェント（crmux state.rs filtered_sessions）
export function filterByTab(agents, tab, marks) {
  if (tab.kind === "marked") return agents.filter((a) => marks.includes(a.address));
  if (tab.kind === "space") return agents.filter((a) => a.space === tab.value);
  if (tab.kind === "project") return agents.filter((a) => a.project === tab.value);
  return agents;
}

const sameTab = (a, b) => a.kind === b?.kind && (a.value ?? null) === (b?.value ?? null);

// 保存したタブ（{ kind, value }）の位置。無くなっていれば All（0）
export function tabIndex(tabs, stored) {
  return Math.max(0, tabs.findIndex((t) => sameTab(t, stored)));
}

// h / l: 今のタブから dir（1 / -1）進めたタブ（端で回る。crmux select_next_tab / select_prev_tab）
export function cycleTab(tabs, current, dir) {
  return tabs[cycle(tabIndex(tabs, current), dir, tabs.length)];
}

// タブ切り替え後の選択（crmux event_handler.rs switch_tab）: 新しいタブにいれば維持、いなければ先頭
export function keepSelection(addresses, selected) {
  return addresses.includes(selected) ? selected : addresses[0] ?? null;
}

// タブバーの表記（crmux ui.rs draw_tab_bar）
export function tabLabel(tab) {
  if (tab.kind === "marked") return "Marked";
  if (tab.kind === "space") return `@${tab.name}`;
  if (tab.kind === "project") return `+${tab.value}`;
  return "All";
}

// 一覧の見出し（crmux ui.rs draw_sessions_list の枠タイトル）
export function tabTitle(tab, count) {
  if (tab.kind === "marked") return `Marked (${count})`;
  if (tab.kind === "space") return `Workspace @${tab.name} (${count})`;
  if (tab.kind === "project") return `Project ${tab.value} (${count})`;
  return `All Sessions (${count})`;
}

const len = (s) => [...s].length;
const slice = (s, from, to) => [...s].slice(from, to).join("");

// タブバーの表示範囲（crmux ui.rs draw_tab_bar）。width は文字数。
// 返り値は左から順の部品: { text, selected }（タブ）/ { text: " " }（区切り）/ { text, arrow: true }（< と >）
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
  // 選択中のタブの中央を真ん中に
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

// --- マーク（shared("crmux.marks") のアドレスの配列） ---

// Space: 選択中のマークを切り替える（crmux state.rs toggle_mark）
export function toggleMark(marks, address) {
  const list = marks ?? [];
  return list.includes(address) ? list.filter((a) => a !== address) : [...list, address];
}

// いなくなったエージェントのマークを捨てる。変わらなければ同じ配列（=== で shared への書き込みを省ける）
export function pruneMarks(marks, agents) {
  if (!marks) return [];
  const alive = new Set(agents.map((a) => a.address));
  const kept = marks.filter((a) => alive.has(a));
  return kept.length === marks.length ? marks : kept;
}

// カード本文の先頭（crmux ui.rs mark_indicator）
export function markPrefix(marked) {
  return marked ? "* " : "  ";
}
