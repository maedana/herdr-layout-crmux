// Footer text (crmux ui.rs footer_spans adapted for herdr). The renderer decorates using bold / app

export function footerParts(mode, nextArrange) {
  if (mode === "insert") {
    return [{ text: "-- INSERT --", bold: true }, { text: " | Typing goes to the agent. Esc:Back" }];
  }
  if (mode === "scroll") {
    return [
      { text: "-- SCROLL --", bold: true },
      { text: " | j/k:Line C-u/C-d:HalfPage gg:Top G:Bottom i:Insert Esc:Back" },
    ];
  }
  return [
    { text: "crmux", app: true },
    { text: ` | hjkl/1-9/t:Nav C-u:ScrollUp Space:Mark n:Shell x:Close(shell) v:${nextArrange} i:Insert q:Main` },
  ];
}
