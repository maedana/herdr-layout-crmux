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
// exited (not a herdr status: the shell left behind after an agent ended, see exitedTerminals) stays its own state
export function statusKind(status) {
  return status === "working" || status === "blocked" || status === "exited" ? status : "idle";
}

// Terminals that were agents and are now plain shells: no status, at least one turn (herdr-core keeps turn after
// the agent exits; a shell that never ran an agent has turn 0), live, shown in a pane (parked ones have none), and with
// the shell itself in front (not vim, a server, or an agent still starting up, which x must not kill).
// Returns [{ address, pane }] in terminals() order, where pane is the panes() entry showing it
export function exitedTerminals(terminals, panes) {
  const byTerminal = new Map((panes ?? []).filter((p) => p.terminal).map((p) => [p.terminal, p]));
  return (terminals ?? [])
    .filter((t) => !t.status && (t.turn ?? 0) >= 1 && t.state === "live" && byTerminal.has(t.address))
    .filter((t) => byTerminal.get(t.address).program?.shell !== false)
    .map((t) => ({ address: t.address, pane: byTerminal.get(t.address) }));
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
      // Leaving exited means an agent was started again in that shell: its work starts over
      ? { kind, since: now, hasWorked: (prev.kind !== "exited" && prev.hasWorked) || kind === "working" }
      : { kind, since: seenAt ?? now, hasWorked: kind === "working" };
  }
  return changed ? next : records;
}

// Basename of cwd (fallback project name when the repository is not known: outside git, or before it is fetched)
export function projectName(cwd) {
  if (!cwd) return "";
  const parts = cwd.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}

// Parse the 3-line output of `git rev-parse --path-format=absolute --git-common-dir --git-dir --show-toplevel`
// into { project, worktree } (null when it cannot be read; all three must be absolute paths, since git before 2.31
// echoes the unknown --path-format back as a line).
// project: the repository name (worktrees are grouped under the original repository; repo/.git and repo/.bare give "repo").
// worktree: the worktree directory name when git dir differs from the common dir, otherwise null
export function parseRepo(stdout) {
  const [common, gitDir, top] = String(stdout ?? "").split("\n").map((l) => l.trim());
  if (![common, gitDir, top].every((l) => l?.startsWith("/"))) return null;
  const parts = common.split("/").filter(Boolean);
  const last = parts.pop();
  const project = last === ".git" || last === ".bare" ? parts.pop() : last?.replace(/\.git$/, "");
  if (!project) return null;
  const worktree = gitDir !== common ? projectName(top) : null;
  return { project, worktree };
}

// Ascending by project name (crmux state.rs sort_by). Same names keep their original order (agents() space, tab, pane order)
export function sortByProject(list) {
  return [...list].sort((a, b) => (a.project < b.project ? -1 : a.project > b.project ? 1 : 0));
}

// Number of agents selectable with number keys 1-9 (crmux MAX_NUMBER_KEYS)
export const MAX_NUMBER_KEYS = 9;

// Card top-edge title: "> 1.project/branch" (crmux ui.rs format_title). Without a branch, a worktree is shown as "/worktree"
export function cardLabel({ selected, index, project, branch, worktree }) {
  const number = index < MAX_NUMBER_KEYS ? `${index + 1}.` : "";
  const suffix = branch || worktree;
  return `${selected ? "> " : ""}${number}${project}${suffix ? `/${suffix}` : ""}`;
}

// Fixed part of each preview's title row, published as crmux.titles for crmux-title: { [address]: { label, worktree } }.
// label is the card label without the selection mark (a preview shows the selection by its frame). items is the current tab's list
export function previewLabels(items) {
  return Object.fromEntries(items.map((a, index) => [a.address, {
    label: cardLabel({ selected: false, index, project: a.project, branch: a.branch, worktree: a.worktree }),
    worktree: a.worktree ?? null,
  }]));
}

const ICONS = { working: "⚡", blocked: "⚠", idle: "💤", exited: "⏹" };

// State icon at the right of the card's bottom edge (crmux ui.rs state_label)
export function statusIcon(status) {
  return ICONS[statusKind(status)];
}

// Position delta steps from i (wraps around at the ends)
export function cycle(i, delta, n) {
  if (n <= 0) return 0;
  return (((i + delta) % n) + n) % n;
}

// Selection after address leaves the list (e.g. closed with x): the next one, else the previous one, else null
export function neighbour(addresses, address) {
  const i = addresses.indexOf(address);
  if (i < 0) return null;
  return addresses[i + 1] ?? addresses[i - 1] ?? null;
}

// Selected address: remembered selection -> herdr's focused agent -> first
export function pickSelected(addresses, remembered, focusedAgent) {
  if (addresses.includes(remembered)) return remembered;
  if (addresses.includes(focusedAgent)) return focusedAgent;
  return addresses[0] ?? null;
}

// What a selection writes. current: { selected, main, prev } as kept in shared (crmux.selected / crmux.main / crmux.prev,
// where t goes back to) and focusedAgent (herdr's, which resolves an unset selection). list: the current tab's addresses.
// promote: address becomes the main too (a pick from the list); otherwise the main slot stays as it is (a preview
// clicked in place): when the selection moves it is pinned to the main shown, in case it is unset or gone and would
// follow. remember: false when the old selection is going away (closed, or filtered out), so t keeps its earlier target.
// Returns the new { selected, main, prev } (each the same as current where it does not change) and whether the
// selection or the main shown changed
export function nextSelection({ selected, main, prev, focusedAgent }, list, { address, promote = false, remember = true }) {
  const cur = pickSelected(list, selected, focusedAgent);
  const shown = list.includes(main) ? main : cur;
  const pinned = promote ? address : address !== cur ? shown : null;
  return {
    selected: address,
    main: pinned ?? main,
    prev: address !== selected && remember && address !== cur ? cur : prev,
    changed: address !== cur || (pinned !== null && pinned !== shown),
  };
}
