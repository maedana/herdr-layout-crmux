// Title row above each preview terminal in the crmux layout, in the look of herdr-app's own pane header (mods/pane):
// the program's icon, "N.project/branch", the terminal title and the status indicator. The card label and worktree are
// placed in shared by crmux-list (crmux.titles); the terminal title and state change often, so they are read here from
// agents() / panes(). A click selects that agent in the list (the selection itself is shown by the preview's border)
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, shared, agents, panes, focused, theme, run } from "herdr";
import { titleColorKey, statusIndicator, titleAddress } from "./title.js";

// The same as the pane header's icon(): a one-color glyph is tinted, others are drawn as they are
function icon(program, size, color) {
  if (!program?.icon) return null;
  return program.tint ? svg(program.icon).size(size).flex_none().text_color(color) : image(program.icon).w(size).h(size).flex_none();
}

// The same as the pane header's status indicator
function indicator(t, kind) {
  if (kind === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
  if (kind === "blocked") {
    return div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold()
      .text_color(t.blocked).child("Needs you");
  }
  return div().size(7).flex_none().rounded(4).bg(t.done);
}

export default class CrmuxTitle extends View {
  render() {
    const t = theme();
    const selected = shared("crmux.selected");
    // A multi-pane preview is given its address; Single's is not and follows the selection
    const address = titleAddress({ address: props()?.address, selected, focusedAgent: focused()?.agent });
    const fixed = address ? shared("crmux.titles")?.[address] : null;
    const agent = address ? agents().find((a) => a.address === address) : null;
    // An exited shell is not in agents(): take the icon and title from the pane showing it
    const pane = address ? panes().find((p) => p.terminal === address) : null;
    const title = agent ? agent.title : pane?.title;
    const pic = icon(agent?.program ?? pane?.program, 14, t.dim);
    const kind = statusIndicator(agent?.status);
    const nameColor = t[titleColorKey({ status: agent?.status, worktree: fixed?.worktree })] ?? t.foreground;
    // The top corners are rounded to sit inside the preview's rounded frame (radius 6 less its 1px border)
    return h_flex().id("crmux-title").size_full().px(10).gap(8).items_center().bg(t.background).rounded_t(5).border_b(1).border_color(t.border).text_size(12)
      // Mouse-down stops here (as on a card) so the press does not reach the blocks around it
      .when(address !== null, (el) => el.cursor_pointer()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => run(`crmux-list.pick-${address}`)))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_medium().text_color(nameColor).child(fixed?.label ?? " "))
      .child(div().flex_1().truncate().text_color(t.dim ?? t.muted).child(title || " "))
      .when(kind !== null, (el) => el.child(indicator(t, kind)));
  }
}
