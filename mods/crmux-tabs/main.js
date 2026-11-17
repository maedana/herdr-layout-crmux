// Top edge of the crmux layout: the tab bar. The labels and the current index are placed in shared by crmux-list
import { View, div } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { shared, theme, settings, run } from "herdr";
import { tabParts } from "./tabbar.js";

// Horizontal padding of the bar
const PAD = 12;

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
    // Reveal the selected tab with the smallest scroll (consumed after layout). Only when the index changes, so scrolling
    // the row by hand is not undone by a later redraw
    if (bar && bar.index !== this.scrolledTo && bar.index >= 0 && bar.index < parts.length) {
      this.scrolledTo = bar.index;
      this.scroll.scroll_to_item(bar.index);
    }
    // The row only scrolls and does not fill the header, so empty space to its right still drags the window
    return h_flex().id("crmux-tabs").size_full().px(PAD).items_center()
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .child(h_flex().id("crmux-tabs-row").gap(4).items_center().min_w_0().overflow_x_scroll().track_scroll(this.scroll)
        .children(parts.map((p, i) => this.tab(p, i, t))));
  }

  // One tab: a rounded box. A click sends crmux-list.tab-<n> to the list
  tab(p, i, t) {
    // Mouse-down stops here so the header's window_drag does not turn a press on a tab into a window move
    return div().id(`tab-${i}`).flex_none().whitespace_nowrap().px(8).py(2).rounded(5).border_1()
      .text_color(p.selected ? t.chrome : t.muted).border_color(p.selected ? t.foreground : t.border)
      .when(p.selected, (d) => d.bg(t.foreground))
      // Hover: the others get a background and a stronger text (the selected one keeps its inverted style)
      .when(!p.selected, (d) => d.hover((h) => h.bg(t.hover).text_color(t.foreground)))
      .cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run(`crmux-list.${p.command}`))
      .child(p.text);
  }
}
