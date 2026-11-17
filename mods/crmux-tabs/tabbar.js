// Pure function for the tab bar header (crmux-tabs)

// Parts of the tab bar, in order: { text, selected, command }. command is the crmux-list command a click sends:
// tab-<position in labels>
export function tabParts(labels, selected) {
  return labels.map((text, i) => ({ text, selected: i === selected, command: `tab-${i}` }));
}
