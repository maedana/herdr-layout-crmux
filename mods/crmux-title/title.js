// Pure functions for crmux-title (no rendering, no herdr dependency)

// Title row above a preview terminal: "> 1.project/branch - title" (crmux ui.rs format_title). label is the card label
// without the selection mark (published by crmux-list); no " - " part when the terminal title is empty
export function previewTitle({ selected, label, title }) {
  const head = label ? `${selected ? "> " : ""}${label}` : "";
  if (!title) return head;
  return head ? `${head} - ${title}` : title;
}

// Theme color name for the title, the same rule as the card's top-edge title (crmux-list main.js card(); copied, since a
// mod cannot import another mod's files): the state's color (done counts as idle), cyan (ansi6) for a worktree agent,
// muted for an exited shell (status null: not in agents())
export function titleColorKey({ status, worktree }) {
  if (!status || status === "exited") return "muted";
  if (worktree) return "ansi6";
  return status === "working" || status === "blocked" ? status : "idle";
}

// Address the title row shows: the one in its props (a multi-pane preview), else the list's selection (Single, whose
// agent block shows the selected agent), else the agent herdr focuses (before the list has stored a selection)
export function titleAddress({ address, selected, focusedAgent }) {
  return address ?? selected ?? focusedAgent ?? null;
}
