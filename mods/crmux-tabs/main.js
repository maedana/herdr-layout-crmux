// Top edge of the crmux layout: the tab bar. The labels and the current index are placed in shared by crmux-list
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, theme, settings, run } from "herdr";
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
      .children(segs.map((s) => this.part(s, t)));
  }

  // One part of the bar. Tabs and < / > are clickable: they send crmux-list.tab-<n> to the list
  part(s, t) {
    const el = div().flex_none().whitespace_nowrap()
      .text_color(s.selected ? t.chrome : t.muted)
      .when(s.selected, (d) => d.bg(t.foreground))
      .child(s.text);
    if (!s.command) return el;
    // The id follows the tab (or arrow), not its position, which shifts as the bar scrolls. Mouse-down stops here so the
    // header's window_drag does not turn a press on a tab into a window move
    return el.id(`tab-part-${s.arrow ?? s.command}`).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      // Hover: a slightly stronger text for the others (the selected one keeps its inverted style)
      .when(!s.selected, (d) => d.hover((h) => h.text_color(t.foreground)))
      .on_click(() => run(`crmux-list.${s.command}`));
  }
}
