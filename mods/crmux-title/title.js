// Pure functions for crmux-title (no rendering, no herdr dependency)

// Theme color name for the preview's name (N.project/branch): cyan (ansi6) for a worktree agent, muted for an exited
// shell (status null: not in agents()), else foreground. The state itself is shown by statusIndicator
export function titleColorKey({ status, worktree }) {
  if (!status || status === "exited") return "muted";
  return worktree ? "ansi6" : "foreground";
}

// Indicator at the right end of the title row, the same as herdr-app's pane header: a spinner while working, a
// "Needs you" badge while blocked, a dot when done (herdr's done: finished while you were not looking); none otherwise
export function statusIndicator(status) {
  return status === "working" || status === "blocked" || status === "done" ? status : null;
}

// Address the title row shows: the one in its props (a multi-pane preview), else the list's selection (Single, whose
// agent block shows the selected agent), else the agent herdr focuses (before the list has stored a selection)
export function titleAddress({ address, selected, focusedAgent }) {
  return address ?? selected ?? focusedAgent ?? null;
}
