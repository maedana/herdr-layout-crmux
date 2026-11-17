// Bottom edge of the crmux layout: mode indicator and key hints. The mode and the next arrangement are placed in shared by crmux-list
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, theme, settings } from "herdr";
import { footerParts } from "./footer.js";

export default class CrmuxFooter extends View {
  render() {
    const t = theme();
    const parts = footerParts(shared("crmux.mode"), shared("crmux.next") ?? "Single", shared("crmux.pinned") === true);
    return h_flex().size_full().px(12).items_center().overflow_hidden().whitespace_nowrap()
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12).text_color(t.muted)
      .children(parts.map((p) => div().flex_none()
        .when(p.bold, (el) => el.font_bold().text_color(t.foreground))
        .when(p.app, (el) => el.text_color(t.foreground))
        .child(p.text)));
  }
}
