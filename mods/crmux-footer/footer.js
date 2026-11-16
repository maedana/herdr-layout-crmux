// フッターの文言（crmux ui.rs footer_spans を herdr 向けに）。描画側は bold / app を見て装飾する

export function footerParts(mode, nextArrange) {
  if (mode === "insert") {
    return [{ text: "-- INSERT --", bold: true }, { text: " | Typing goes to the agent. Esc:Back" }];
  }
  return [
    { text: "crmux", app: true },
    { text: ` | j/k/1-9/t:Nav C-u:ScrollUp v:${nextArrange} i:Insert q:Main` },
  ];
}
