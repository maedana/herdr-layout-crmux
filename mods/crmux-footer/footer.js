// Footer text (crmux ui.rs footer_spans adapted for herdr). The renderer decorates using bold / app

// pinned: the shown tab has its own order (R drops it)
export function footerParts(mode, nextArrange, pinned = false) {
  if (mode === "insert") {
    return [{ text: "-- INSERT --", bold: true }, { text: " | Typing goes to the agent. Esc:Back" }];
  }
  if (mode === "hint") {
    return [{ text: "-- HINT --", bold: true }, { text: " | Type a label to jump. Esc:Cancel" }];
  }
  if (mode === "scroll") {
    return [
      { text: "-- SCROLL --", bold: true },
      { text: " | j/k:Line C-u/C-d:HalfPage gg:Top G:Bottom i:Insert Esc:Back" },
    ];
  }
  return [
    { text: "crmux", app: true },
    { text: ` | hjkl/1-9/t:Nav f:Hint C-u:ScrollUp Space:Mark x:Close(shell) v:${nextArrange} i:Insert q:Main${pinned ? " R:Unpin" : ""}` },
  ];
}
