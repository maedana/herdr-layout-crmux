// Pure functions for the hint labels (f in Normal: vimium-style labels on every card, preview and tab; typing one jumps
// there). crmux-list owns the keys and publishes the labels in shared("crmux.hints"); each mod draws its own

// The easiest keys first: the home row, then the top row, then the bottom row. h/j/k/l are labels too (nothing moves in
// hint mode)
const KEYS = "asdfghjklqwertyuiopzxcvbnm".split("");

// n labels, all the same length so no label is a prefix of another: one letter each up to 26, two up to 26 * 26, then
// three, and so on (as many letters as it takes)
export function hintLabels(n) {
  let labels = [...KEYS];
  while (labels.length < n) labels = labels.flatMap((prefix) => KEYS.map((k) => prefix + k));
  return labels.slice(0, n);
}

// Labels for the cards (addresses in list order), the shown previews (addresses) and the tabs (how many), in that order so
// the easiest keys go to the cards and previews. Keyed for the mod drawing each (cards / previews by address, tabs by
// position); targets is the flat list hintKey matches against; typed is what has been typed of a two-letter label
export function buildHints({ cards, previews, tabs }) {
  const targets = [
    ...cards.map((key) => ({ kind: "card", key })),
    ...previews.map((key) => ({ kind: "preview", key })),
    ...Array.from({ length: tabs }, (_, key) => ({ kind: "tab", key })),
  ];
  const labels = hintLabels(targets.length);
  targets.forEach((t, i) => { t.label = labels[i]; });
  const of = (kind) => Object.fromEntries(targets.filter((t) => t.kind === kind).map((t) => [t.key, t.label]));
  return { cards: of("card"), previews: of("preview"), tabs: of("tab"), targets, typed: "" };
}

// A key typed in hint mode after typed: { target } when it completes a label, { typed } when it starts one (the first of
// two letters), else { cancel: true } (Esc or a key no label has)
export function hintKey(targets, typed, key) {
  const next = typed + key;
  const target = targets.find((t) => t.label === next);
  if (target) return { target };
  if (key.length === 1 && targets.some((t) => t.label.startsWith(next))) return { typed: next };
  return { cancel: true };
}

// Previews on screen: every listed one in a multi-pane arrangement (previewTree), else only the selection (Single, also
// with one or none)
export function shownPreviews(arrange, addresses, selected) {
  const multi = ["MainV", "MainH", "Grid", "EvenH", "EvenV"].includes(arrange) && addresses.length > 1;
  if (multi) return addresses;
  return selected ? [selected] : [];
}
