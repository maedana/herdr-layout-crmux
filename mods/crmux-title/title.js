// Pure functions for crmux-title (no rendering, no herdr dependency)

// Theme color name for the preview's name (N.project/branch): cyan (ansi6) for a worktree agent, muted for an exited
// shell (status null: not in agents()), else foreground. The state itself is shown by statusIndicator
export function titleColorKey({ status, worktree }) {
  if (!status) return "muted";
  return worktree ? "ansi6" : "foreground";
}

// Indicator at the right end of the title row, the same as herdr-app's pane header: a spinner while working, a
// "Needs you" badge while blocked, a dot when done (herdr's done: finished while you were not looking); none otherwise
export function statusIndicator(status) {
  return status === "working" || status === "blocked" || status === "done" ? status : null;
}

// Address the title row shows: the one in its props (a multi-pane preview), else the selection the list shows (shown:
// crmux.shown, which crmux-list resolves like its own list, so Single's title matches the agent its block shows; null
// when the list shows none). Only before the list has published it: the stored selection, else the agent herdr focuses
export function titleAddress({ address, shown, selected, focusedAgent }) {
  if (address != null) return address;
  if (shown !== undefined) return shown;
  return selected ?? focusedAgent ?? null;
}
