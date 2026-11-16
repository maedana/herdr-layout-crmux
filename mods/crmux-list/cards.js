// crmux-list の純粋関数（描画や herdr に依存しない）

const pad2 = (n) => String(n).padStart(2);

// 状態が変わってからの経過秒を crmux（ui.rs format_elapsed）と同じ書式にする: " 5s" / "12m" / " 3h"（上限 99h）
export function formatElapsed(secs) {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${pad2(s)}s`;
  if (s < 3600) return `${pad2(Math.floor(s / 60))}m`;
  return `${pad2(Math.min(99, Math.floor(s / 3600)))}h`;
}

// herdr の status（working / blocked / done / idle）を crmux の見た目の 3 状態にする。
// done は「見ていない間に終わった」で、見れば idle になる。どちらも crmux の Idle。
export function statusKind(status) {
  return status === "working" || status === "blocked" ? status : "idle";
}

// 完了の点滅は crmux（ui.rs should_pulse）と同じく作業中を経験した後の 5〜15 秒だけ
export const PULSE_FROM_SECS = 5;
export const PULSE_UNTIL_SECS = 15;

export function shouldPulse(status, elapsedSecs, hasWorked) {
  const kind = statusKind(status);
  if (kind === "blocked") return true;
  return kind === "idle" && hasWorked && elapsedSecs >= PULSE_FROM_SECS && elapsedSecs <= PULSE_UNTIL_SECS;
}

// 状態遷移の記録を更新する。records: { [address]: { kind, since, hasWorked } }。
// list: [{ address, status, seenAt }]（seenAt: 初めて見るときに since とする時刻。null なら now）。
// 何も変わらなければ records そのものを返す（呼び出し側は === で比べて shared への書き込みを省ける）。
export function trackStatuses(records, list, now) {
  const next = {};
  let changed = Object.keys(records).length !== list.length;
  for (const { address, status, seenAt } of list) {
    const kind = statusKind(status);
    const prev = records[address];
    if (prev && prev.kind === kind) {
      next[address] = prev;
      continue;
    }
    changed = true;
    next[address] = prev
      ? { kind, since: now, hasWorked: prev.hasWorked || kind === "working" }
      : { kind, since: seenAt ?? now, hasWorked: kind === "working" };
  }
  return changed ? next : records;
}

// project 名 = cwd の basename（crmux と同じく一覧の並びと見出しに使う）
export function projectName(cwd) {
  if (!cwd) return "";
  const parts = cwd.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}

// project 名の昇順（crmux state.rs の sort_by）。同名は元の順（agents() の space, tab, pane 順）
export function sortByProject(list) {
  return [...list].sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0));
}

// 番号キー 1〜9 で選べる数（crmux の MAX_NUMBER_KEYS）
export const MAX_NUMBER_KEYS = 9;

// カード上辺の見出し: "> 1.project/branch"（crmux ui.rs format_title）
export function cardLabel({ selected, index, project, branch }) {
  const number = index < MAX_NUMBER_KEYS ? `${index + 1}.` : "";
  return `${selected ? "> " : ""}${number}${project}${branch ? `/${branch}` : ""}`;
}

const ICONS = { working: "⚡", blocked: "⚠", idle: "💤" };

// カード下辺右の状態アイコン（crmux ui.rs state_label）
export function statusIcon(status) {
  return ICONS[statusKind(status)];
}

// i から delta 進めた位置（端で反対側へ回る）
export function cycle(i, delta, n) {
  if (n <= 0) return 0;
  return (((i + delta) % n) + n) % n;
}

// 選択中のアドレス: 覚えている選択 → herdr の focused agent → 先頭
export function pickSelected(addresses, remembered, focusedAgent) {
  if (addresses.includes(remembered)) return remembered;
  if (addresses.includes(focusedAgent)) return focusedAgent;
  return addresses[0] ?? null;
}
