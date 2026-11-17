// Pure function for the tab bar header (crmux-tabs)

const len = (s) => [...s].length;
const slice = (s, from, to) => [...s].slice(from, to).join("");

// Visible range of the tab bar (crmux ui.rs draw_tab_bar). width is in characters.
// Returns parts from the left: { text, selected } (tab) / { text: " " } (separator) / { text, arrow: true } (< and >)
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
  // Center the selected tab
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
