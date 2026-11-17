// Title row above each preview terminal in the crmux layout: "> N.project/branch - title" in the card's color (crmux draws it
// on the preview's top border). The card label and worktree are placed in shared by crmux-list (crmux.titles); the terminal
// title and state change often, so they are read here from agents() / panes(). A click selects that agent in the list
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, shared, agents, panes, focused, theme, settings, run } from "herdr";
import { previewTitle, titleColorKey, titleAddress } from "./title.js";

export default class CrmuxTitle extends View {
  render() {
    const t = theme();
    const selected = shared("crmux.selected");
    // A multi-pane preview is given its address; Single's is not and follows the selection
    const address = titleAddress({ address: props()?.address, selected, focusedAgent: focused()?.agent });
    const fixed = address ? shared("crmux.titles")?.[address] : null;
    const agent = address ? agents().find((a) => a.address === address) : null;
    // An exited shell is not in agents(): take the title from the pane showing it
    const title = agent ? agent.title : address ? panes().find((p) => p.terminal === address)?.title : null;
    const text = previewTitle({ selected: address !== null && address === selected, label: fixed?.label, title });
    const color = t[titleColorKey({ status: agent?.status, worktree: fixed?.worktree })] ?? t.foreground;
    return h_flex().id("crmux-title").size_full().px(8).items_center().overflow_hidden().bg(t.background ?? t.chrome)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12).text_color(color)
      // Mouse-down stops here (as on a card) so the press does not reach the blocks around it
      .when(address !== null, (el) => el.cursor_pointer()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run(`crmux-list.pick-${address}`)))
      .child(div().flex_1().min_w(0).truncate().font_bold().child(text || " "));
  }
}
