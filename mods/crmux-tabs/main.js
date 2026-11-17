// Top edge of the crmux layout: the tab bar. The labels and the current index are placed in shared by crmux-list
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, theme, settings } from "herdr";
import { tabBarWindow } from "./tabbar.js";

// Horizontal padding of the bar, and the width of one character used to estimate the tab bar's characters (half-width of a 12px monospace font)
const PAD = 12;
const CHAR_PX = 7.2;

export default class CrmuxTabs extends View {
  init() {
    // Until the first on_size_change, show every tab (no < / > window)
    this.width = Infinity;
  }

  render() {
    const t = theme();
    const bar = shared("crmux.tabbar");
    const chars = Math.floor((this.width - PAD * 2) / CHAR_PX);
    const segs = bar ? tabBarWindow(bar.labels, bar.index, chars) : [];
    return h_flex().id("crmux-tabs").size_full().px(PAD).items_center().overflow_hidden().whitespace_nowrap()
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .on_size_change((size, cx) => {
        // Used to estimate the tab bar's character count
        if (Math.abs(size.width - this.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .children(segs.map((s) => div().flex_none().whitespace_nowrap()
        .text_color(s.selected ? t.chrome : t.muted)
        .when(s.selected, (d) => d.bg(t.foreground))
        .child(s.text)));
  }
}
