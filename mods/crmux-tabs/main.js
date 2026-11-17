// Top edge of the crmux layout: the tab bar. The labels and the current index are placed in shared by crmux-list
import { View, div } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { shared, theme, settings, run } from "herdr";
import { tabParts } from "./tabbar.js";

// Horizontal padding of the bar
const PAD = 12;

// A hint label (f): the letters still to type of label, on the accent color; nothing when there is no label or it no longer
// matches what has been typed (typed)
function hintBadge(t, label, typed = "") {
  if (!label || !label.startsWith(typed)) return null;
  return div().flex_none().px(4).rounded(3).bg(t.accent ?? t.foreground).text_color(t.accent_foreground ?? t.background)
    .font_bold().text_size(11).child(label.slice(typed.length));
}

export default class CrmuxTabs extends View {
  init() {
    // Scroll position of the tab row; the selected tab is scrolled into view when the index changes
    this.scroll = ScrollHandle.new();
    this.scrolledTo = null;
  }

  render() {
    const t = theme();
    const bar = shared("crmux.tabbar");
    const parts = bar ? tabParts(bar.labels, bar.index) : [];
    // Reveal the selected tab with the smallest scroll (consumed after layout). Only when its position changes (tabs
    // appearing before it shift it too), so scrolling the row by hand is not undone by a later redraw or a count change
    if (parts[bar?.index] && bar.index !== this.scrolledTo) {
      this.scrolledTo = bar.index;
      this.scroll.scroll_to_item(bar.index);
    }
    // The row only scrolls and does not fill the header, so empty space to its right still drags the window
    return h_flex().id("crmux-tabs").size_full().px(PAD).items_center().overflow_hidden()
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .child(h_flex().id("crmux-tabs-row").gap(4).items_center().min_w_0().overflow_x_scroll().track_scroll(this.scroll)
        .children(parts.map((p, i) => this.tab(p, i, t, shared("crmux.hints")))));
  }

  // One tab: a rounded box. A click sends crmux-list.tab-<n> to the list
  // hints: crmux.hints while the hint labels (f) are up, whose label for this tab is drawn before its name
  tab(p, i, t, hints) {
    const badge = hints ? hintBadge(t, hints.tabs?.[i], hints.typed) : null;
    // Mouse-down stops here so the header's window_drag does not turn a press on a tab into a window move
    return div().id(`tab-${i}`).flex_none().whitespace_nowrap().px(8).py(2).rounded(5).border_1()
      // Selected: inverted (filled). Others: muted, and on hover a background and a stronger text
      .when(p.selected, (d) => d.bg(t.foreground).border_color(t.foreground).text_color(t.chrome))
      .when(!p.selected, (d) => d.border_color(t.border ?? t.muted).text_color(t.muted)
        .hover((h) => h.bg(t.hover).text_color(t.foreground)))
      .cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run(`crmux-list.${p.command}`))
      .when(Boolean(badge), (d) => d.flex().items_center().gap(4).child(badge))
      .child(p.text);
  }
}
