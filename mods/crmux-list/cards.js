// Pure functions for crmux-list (no rendering, no herdr dependency)

const pad2 = (n) => String(n).padStart(2);

// Format seconds since the last state change like crmux (ui.rs format_elapsed): " 5s" / "12m" / " 3h" (capped at 99h)
export function formatElapsed(secs) {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${pad2(s)}s`;
  if (s < 3600) return `${pad2(Math.floor(s / 60))}m`;
  return `${pad2(Math.min(99, Math.floor(s / 3600)))}h`;
}

// Map herdr status (working / blocked / done / idle) to crmux's 3 visual states.
// done means "finished while nobody was looking" and becomes idle once seen. Both are crmux Idle.
export function statusKind(status) {
  return status === "working" || status === "blocked" ? status : "idle";
}

// Like crmux (ui.rs should_pulse), the completion pulse runs only 5-15 seconds after a working period
export const PULSE_FROM_SECS = 5;
export const PULSE_UNTIL_SECS = 15;

export function shouldPulse(status, elapsedSecs, hasWorked) {
  const kind = statusKind(status);
  if (kind === "blocked") return true;
  return kind === "idle" && hasWorked && elapsedSecs >= PULSE_FROM_SECS && elapsedSecs <= PULSE_UNTIL_SECS;
}

// Update the state-transition records. records: { [address]: { kind, since, hasWorked } }.
// list: [{ address, status, seenAt }] (seenAt: the time used as since when first seen; null means now).
// Returns records itself when nothing changed (callers can compare with === to skip writing to shared).
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

// Project name = basename of cwd (used for list order and headings, as in crmux)
export function projectName(cwd) {
  if (!cwd) return "";
  const parts = cwd.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}

// Ascending by project name (crmux state.rs sort_by). Same names keep their original order (agents() space, tab, pane order)
export function sortByProject(list) {
  return [...list].sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0));
}

// Number of agents selectable with number keys 1-9 (crmux MAX_NUMBER_KEYS)
export const MAX_NUMBER_KEYS = 9;

// Card top-edge title: "> 1.project/branch" (crmux ui.rs format_title)
export function cardLabel({ selected, index, project, branch }) {
  const number = index < MAX_NUMBER_KEYS ? `${index + 1}.` : "";
  return `${selected ? "> " : ""}${number}${project}${branch ? `/${branch}` : ""}`;
}

const ICONS = { working: "⚡", blocked: "⚠", idle: "💤" };

// State icon at the right of the card's bottom edge (crmux ui.rs state_label)
export function statusIcon(status) {
  return ICONS[statusKind(status)];
}

// Position delta steps from i (wraps around at the ends)
export function cycle(i, delta, n) {
  if (n <= 0) return 0;
  return (((i + delta) % n) + n) % n;
}

// Selected address: remembered selection -> herdr's focused agent -> first
export function pickSelected(addresses, remembered, focusedAgent) {
  if (addresses.includes(remembered)) return remembered;
  if (addresses.includes(focusedAgent)) return focusedAgent;
  return addresses[0] ?? null;
}
