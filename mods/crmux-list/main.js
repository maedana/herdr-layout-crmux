// crmux-style card list (left) and Normal mode key handling.
// The preview on the right is the layout's agent / terminal blocks (real terminals); the arrangement is swapped with layout.set.
// Switching layouts recreates this mod, so state to keep (selection, arrangement, transition records, marks, tabs, tab bar) lives in shared.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import {
  agents, terminals, panes, spaces, run, hc, exec, shared, setShared, theme, settings, layout, checking, nextCommand,
  setAgentOrder, focused,
} from "herdr";
import {
  formatElapsed, shouldPulse, trackStatuses, statusKind, statusIcon, projectName, parseRepo, sortByProject, cardLabel, cycle,
  pickSelected, exitedTerminals, neighbour,
} from "./cards.js";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree } from "./arrange.js";
import {
  buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabBarLabels, toggleMark, pruneMarks,
  markPrefix,
} from "./tabs.js";
import { parseNumstat, diffSummary, diffTargets, diffKey, keepRepos } from "./diff.js";
import { normalKey, scrollKey, scrollStep, scrollView, previewFocus, focusAction } from "./keys.js";

const LAYOUT = "crmux";
const DEFAULT_ARRANGE = "MainV";
// An Esc right after returning from Insert with Esc (within this time) sends esc esc to the selected agent
const ESC_FORWARD_MS = 1500;
// Time to wait for the 2nd keystroke of g g
const GG_MS = 800;
// Delay before reclaiming the keyboard for the list after it moved to a right-side block (e.g. on selection change) (same as hop's switchTo)
const REFOCUS_AFTER_MS = [16, 150];
// While the keyboard is moved programmatically (keepFocus, i), where it is now is not a click
const SETTLE_MS = 300;
// Pulse for waiting-for-input / just-finished (crmux swings the border between 50-100% with sin(t*16), a period of about 0.4s)
const PULSE = { from: 0.5, to: 1, period: 400 };
const EMOJI_FONT = "Noto Color Emoji";
// Interval to refresh the git diff summary (5 seconds, same as crmux app.rs)
const DIFF_MS = 5000;
// diffSummary color role -> theme color name (ansi1 red, ansi2 green, ansi3 yellow)
const DIFF_COLORS = { add: "ansi2", mod: "ansi3", del: "ansi1", dim: "muted" };

export default class CrmuxList extends View {
  init(_props, cx) {
    this.acx = cx;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.insert = false;
    this.switches = 0;
    this.escFromInsertAt = 0;
    this.lastEscAt = 0;
    this.gAt = 0;
    this.scrolledTo = null;
    // Lines the selected preview is scrolled up (Scroll mode while > 0)
    this.scrollUp = 0;
    this.tickSig = "";
    // Whether the last render drew the list as having the keyboard (its border is accent then)
    this.drawnFocus = false;
    // Until this time the keyboard being in a preview is not treated as a click (init also reclaims the keyboard a little later)
    this.settleUntil = Date.now() + 2 * SETTLE_MS;
    // git diff summary: diffKey(machine, cwd) -> diffSummary result (kept only inside the mod)
    this.diffs = {};
    this.diffSig = "";
    if (checking()) return;

    setShared("crmux.mode", "normal");
    setShared("crmux.next", nextArrange(this.arrange()));
    this.handle.focus();
    // Focus may not take effect right after init (re-acquire a little later, as hop does), and layout() still returns the previous layout, so
    // restoring the arrangement (layout.set rewrites the file, so right after install.sh etc. it is back to Single) is also done a little later
    cx.timer.after(300, () => {
      if (this.applyLayout()) this.reclaim();
      else this.refocus();
    });
    // Refresh the display when elapsed time / pulse starts or ends, and re-arrange as agents come and go
    cx.timer.every(1000, (cx) => this.tick(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c);
        cx.notify();
      }
    });
    // Refresh the git diff summary every 5 seconds and redraw only when it changed (also resolves repositories not known yet)
    cx.spawn(async (cx) => {
      for (;;) {
        await Promise.all([this.refreshRepos(cx).catch(() => {}), this.refreshDiffs(cx).catch(() => {})]);
        await cx.sleep(DIFF_MS);
      }
    });
  }

  // --- State (shared) ---

  arrange() {
    return shared("crmux.arrange") ?? DEFAULT_ARRANGE;
  }

  // Repository of each cwd: diffKey(machine, cwd) -> { project, worktree }, or false outside git. Answers from git are kept
  // for good, in shared so that the first render after a layout switch already groups by repository (and keeps a +project tab)
  repos() {
    return shared("crmux.repos") ?? {};
  }

  // All agents, plus the shells of agents that have exited (status "exited"), ascending by project name
  // (within a project, live agents come before exited ones)
  items() {
    const allPanes = panes();
    const allSpaces = spaces();
    const byPane = new Map(allPanes.map((p) => [p.pane, p]));
    const bySpace = new Map(allSpaces.map((s) => [s.id, s]));
    const byTab = new Map(allSpaces.flatMap((s) => (s.tabs ?? []).map((t) => [t.id, s])));
    const repos = this.repos();
    const item = (a, p, s) => {
      const repo = p?.cwd ? repos[diffKey(s?.machine ?? null, p.cwd)] : null;
      return {
        address: a.address, pane: a.pane, tab: a.tab, status: a.status, title: a.title,
        project: repo?.project ?? (projectName(p?.cwd) || a.space_name), branch: p?.branch ?? null,
        worktree: repo?.worktree ?? null,
        space: a.space, spaceName: a.space_name, spaceIndex: s?.index ?? 0,
        cwd: p?.cwd ?? null, machine: s?.machine ?? null,
      };
    };
    // An exited shell is not in agents(), so take what agents() would give from its pane and the space holding its tab
    // (skipped while that space is not known, e.g. the tab is closing, so no nameless @space tab appears)
    const exited = exitedTerminals(terminals(), allPanes).flatMap(({ address, pane: p }) => {
      const s = byTab.get(p.tab);
      if (!s) return [];
      return [item({ address, pane: p.pane, tab: p.tab, status: "exited", title: p.title, space: s.id, space_name: s.name }, p, s)];
    });
    return sortByProject([...agents().map((a) => item(a, byPane.get(a.pane), bySpace.get(a.space))), ...exited]);
  }

  // Whether address is an exited shell (only what that needs, not the whole items() list)
  isExited(address) {
    return exitedTerminals(terminals(), panes()).some((e) => e.address === address);
  }

  marks() {
    return shared("crmux.marks") ?? [];
  }

  // Tab list, current tab, and the agents filtered by that tab (targets of the list, numbers, j/k, t, and the preview)
  view() {
    const all = this.items();
    const marks = this.marks();
    const tabs = buildTabs(all, marks);
    const index = tabIndex(tabs, shared("crmux.tab"));
    const tab = tabs[index];
    return { all, marks, tabs, index, tab, items: filterByTab(all, tab, marks) };
  }

  addresses() {
    return this.view().items.map((a) => a.address);
  }

  selected(addresses = this.addresses()) {
    return pickSelected(addresses, shared("crmux.selected"), focused()?.agent);
  }

  // --- Actions ---

  command(c) {
    if (c === "focus") {
      // pane.go moved onto the list (or a popup over it closed): take the keyboard, but not away from Insert's terminal
      if (!this.insert) this.handle.focus();
      return;
    }
    if (c === "normal") {
      // The escape in keys.json for layout:crmux. If we are in the right terminal, go back to the list (Insert -> Normal).
      // This command may also arrive while in the list (Esc in Normal)
      if (this.insert || !this.handle.is_focused()) return this.toNormal();
      return this.esc();
    }
    this.act(c);
  }

  // Normal mode actions. Called from both keys and herdr-app do crmux-list.<name>
  act(name) {
    const list = this.addresses();
    const sel = this.selected(list);
    const at = Math.max(0, list.indexOf(sel));
    const select = /^select-([1-9])$/.exec(name);
    // Leaving Scroll mode with i puts the preview back at the bottom (crmux reset_preview_scroll)
    if (name === "insert" && this.scrolling()) this.scrollPreview(sel, "bottom");
    if (name === "down") this.select(list[cycle(at, 1, list.length)]);
    else if (name === "up") this.select(list[cycle(at, -1, list.length)]);
    else if (select) this.select(list[Number(select[1]) - 1]);
    else if (name === "toggle") this.select(shared("crmux.prev"));
    else if (name === "insert") this.toInsert();
    else if (name === "arrange") this.setArrange(nextArrange(this.arrange()));
    else if (name === "main") this.switchToMain(sel);
    else if (/^(scroll-up|scroll-down|line-up|line-down|top|bottom)$/.test(name)) this.scrollPreview(sel, name);
    else if (name === "esc") this.esc();
    else if (name === "mark") this.markSelected(sel);
    else if (name === "tab-next") this.switchTab(1, sel);
    else if (name === "tab-prev") this.switchTab(-1, sel);
    else if (name === "close") this.closeExited(sel, list);
  }

  select(address) {
    const list = this.addresses();
    const cur = this.selected(list);
    if (!address || address === cur || !list.includes(address)) return;
    // Selecting another one (e.g. by clicking a card) leaves Scroll mode (crmux resets the scroll on selection)
    if (this.scrolling()) this.scrollPreview(cur, "bottom");
    setShared("crmux.prev", cur);
    this.focusAgent(address);
  }

  focusAgent(address) {
    setShared("crmux.selected", address);
    // agent.focus switches the contents of the Single agent block (also keeps herdr's focused agent in sync for multi-pane display).
    // An exited shell is not an agent: the Single preview shows its terminal block instead (previewTree)
    const exited = this.isExited(address);
    this.keepFocus(() => {
      if (!exited) run("agent.focus", { terminal: address });
      this.applyLayout();
    });
  }

  // x: close the selected exited shell's terminal (its pane, or its tab if it is the last pane, goes too) and select the
  // next one in the list (else the previous one). A live agent is never closed, so a running agent cannot be killed by mistake
  closeExited(sel, list) {
    if (!sel || !this.isExited(sel)) return;
    const next = neighbour(list, sel);
    run("terminal.kill", { terminal: sel });
    if (next) this.focusAgent(next);
    else this.keepFocus(() => this.applyLayout());
  }

  // Space: toggle the mark on the selected one. An agent unmarked in the Marked tab disappears from the list
  // (removing the last mark removes the Marked tab and returns to All)
  markSelected(sel) {
    if (!sel) return;
    setShared("crmux.marks", toggleMark(this.marks(), sel));
    this.refilter(sel);
  }

  // h / l: cycle tabs
  switchTab(dir, sel) {
    const v = this.view();
    const next = cycleTab(v.tabs, v.tab, dir);
    setShared("crmux.tab", { kind: next.kind, value: next.value ?? null });
    this.refilter(sel);
  }

  // After the filter changes: keep the selected agent if it remains, otherwise the first (crmux switch_tab)
  refilter(before) {
    const next = keepSelection(this.addresses(), before);
    if (next && next !== before) this.focusAgent(next);
    else this.keepFocus(() => this.applyLayout());
  }

  setArrange(arrange) {
    setShared("crmux.arrange", arrange);
    setShared("crmux.next", nextArrange(arrange));
    this.keepFocus(() => this.applyLayout());
  }

  // Build the right side from the arrangement, list (items: the current tab's, from view()), and selection, and swap it
  // via layout.set if it differs from the current layout. Returns whether it sent layout.set (which moves the keyboard to a
  // right-side block, so the caller reclaims it: keepFocus, or reclaim() outside it)
  applyLayout(items = this.view().items) {
    if (shared("layout") !== LAYOUT) return false;
    const list = items.map((a) => a.address);
    const exited = items.filter((a) => a.status === "exited").map((a) => a.address);
    const want = previewTree(this.arrange(), list, this.selected(list), exited);
    if (sameTree(want, findNode(layout(), "preview"))) return false;
    run("layout.set", { layout: crmuxLayout(want) });
    return true;
  }

  // Selection moves and layout.set move the keyboard to a right-side block, so put it back where the mode says
  keepFocus(fn) {
    fn();
    this.reclaim();
  }

  // Put the keyboard back where the mode says (immediately, and again after things settle); until then where it is now is not a click
  reclaim() {
    const n = ++this.switches;
    this.settleUntil = Date.now() + SETTLE_MS;
    this.refocus();
    for (const ms of REFOCUS_AFTER_MS) {
      this.acx.timer.after(ms, () => {
        if (n === this.switches) this.refocus();
      });
    }
  }

  // The list in Normal / Scroll; in Insert the selected agent's terminal being typed into
  refocus() {
    if (!this.insert) return this.handle.focus();
    const sel = this.selected();
    if (sel) run("pane.focus", { terminal: sel });
  }

  // Keep the mode and selection in step with where the keyboard is when it moved without the list's keys (a click), but not
  // while a programmatic move is settling (focusAction decides). Returns whether the mode or selection changed
  syncFocus(addresses) {
    if (Date.now() < this.settleUntil) return false;
    const focusedPreview = previewFocus(focused(), addresses);
    // is_focused() is asked only when it matters: in Insert, or once focused() points at a listed preview
    const listFocused = (this.insert || focusedPreview !== null) && this.handle.is_focused();
    const cur = focusedPreview ? this.selected(addresses) : null;
    const action = focusAction({ insert: this.insert, focusedPreview, listFocused, selected: cur });
    if (!action) return false;
    // The list holds the keyboard while it thinks it is Insert (a card or the margin was clicked): back to Normal
    if (action.type === "leave") return this.leaveInsert();
    if (action.address !== cur) {
      setShared("crmux.prev", cur);
      setShared("crmux.selected", action.address);
    }
    // In Insert another preview was clicked: it is now the one being typed into, so only the selection follows
    if (action.type === "select") return true;
    // A preview holds it while the list thinks it is Normal (the user clicked it): Insert on that preview.
    // Like toInsert from Scroll mode, the preview goes back to the bottom
    if (this.scrolling()) this.scrollPreview(cur, "bottom");
    this.insert = true;
    setShared("crmux.mode", "insert");
    // The keyboard is already there, but the new selection re-sets the layout (e.g. the main slot), which may move it
    if (action.address !== cur) this.keepFocus(() => this.applyLayout());
    return true;
  }

  // Insert -> Normal. Nothing to do outside Insert. Returns whether it acted (the keyboard is then reclaimed for the list)
  leaveInsert() {
    if (!this.insert) return false;
    this.toList();
    return true;
  }

  // Normal, with the keyboard reclaimed for the list
  toList() {
    this.insert = false;
    setShared("crmux.mode", "normal");
    this.keepFocus(() => {});
  }

  toInsert() {
    const sel = this.selected();
    if (!sel) return;
    this.insert = true;
    // The keyboard is still in the list until pane.focus takes effect, which is not a click
    this.settleUntil = Date.now() + SETTLE_MS;
    setShared("crmux.mode", "insert");
    run("pane.focus", { terminal: sel });
  }

  // Esc from a terminal. Also from Normal while the keyboard is in a terminal anyway (a clicked preview syncFocus has not seen yet)
  toNormal() {
    this.escFromInsertAt = Date.now();
    this.toList();
  }

  // Esc in Normal: right after returning from Insert, send Esc Esc to the selected agent to go back to Insert
  // (this layout uses the terminal's Esc to return to Normal, so like crmux the second one passes through)
  esc() {
    const now = Date.now();
    // Prevent double handling when it reaches both the keys.json escape (normal command) and on_key_down
    if (now - this.lastEscAt < 100) return;
    this.lastEscAt = now;
    const sel = this.selected();
    // Esc in Scroll mode: back to the bottom and Normal
    if (this.scrolling()) return this.scrollPreview(sel, "bottom");
    if (!sel || now - this.escFromInsertAt > ESC_FORWARD_MS) return;
    this.escFromInsertAt = 0;
    hc(["keys", sel, "esc", "esc"]).catch(() => {});
    this.toInsert();
  }

  switchToMain(sel) {
    const a = this.items().find((x) => x.address === sel);
    run("layout.switch", { name: "main" });
    if (a) run("pane.focus", { pane: a.pane });
  }

  // --- Scroll mode (crmux InputMode::Scroll) ---

  scrolling() {
    return shared("crmux.mode") === "scroll";
  }

  // Scrolling up enters Scroll mode and coming back to the bottom returns to Normal (crmux handle_scroll_mode)
  scrollPreview(sel, name) {
    if (!sel) return;
    const pane = this.items().find((a) => a.address === sel)?.pane;
    const step = scrollStep(name, this.scrollUp, scrollView(panes(), pane));
    this.scrollUp = step.up;
    run("terminal.scroll", { terminal: sel, ...step.args });
    setShared("crmux.mode", step.up > 0 ? "scroll" : "normal");
  }

  // Normal mode keys (delivered only when the list has focus)
  onKey(e, cx) {
    const m = e.modifiers;
    const k = e.key;
    if (m.alt || m.platform) return;
    // A key reached the list = Normal (e.g. returned by a click)
    this.leaveInsert();
    if (k !== "escape") this.escFromInsertAt = 0;
    const plainG = k === "g" && !m.shift && !m.control;
    const gg = plainG && Date.now() - this.gAt < GG_MS;
    this.gAt = plainG && !gg ? Date.now() : 0;
    const name = (this.scrolling() ? scrollKey : normalKey)(k, m, gg);
    if (!name && !plainG) return;
    if (name) this.act(name);
    cx.stop_propagation();
    cx.notify();
  }

  // Every second: redraw only when the display (elapsed time, pulse presence, the list's border) changed. Re-arrange as
  // agents come and go
  tick(cx) {
    const { items } = this.view();
    const moved = this.syncFocus(items.map((a) => a.address));
    // Agents came or went: layout.set moved the keyboard, so reclaim it (only then, not every second)
    if (this.applyLayout(items)) this.reclaim();
    const now = Date.now();
    const records = shared("crmux.records") ?? {};
    const sig = Object.entries(records).map(([a, r]) => {
      const secs = (now - r.since) / 1000;
      return `${a}:${formatElapsed(secs)}:${shouldPulse(r.kind, Math.floor(secs), r.hasWorked)}`;
    }).join("|");
    // A focus change does not necessarily render, so redraw the border when it went stale
    if (sig === this.tickSig && !moved && this.handle.is_focused() === this.drawnFocus) return;
    this.tickSig = sig;
    cx.notify();
  }

  // Resolve the repository of each agent cwd not asked yet (when git could not answer, e.g. a timeout, it is asked again on the next round)
  async refreshRepos(cx) {
    const all = diffTargets(this.items());
    const targets = all.filter((t) => !Object.hasOwn(this.repos(), t.key));
    if (!targets.length) return;
    const results = await Promise.all(targets.map((t) => gitRepo(t)));
    const answered = targets.map((t, i) => [t.key, results[i]]).filter(([, r]) => r !== null);
    if (!answered.length) return;
    setShared("crmux.repos", keepRepos(this.repos(), all.map((t) => t.key), answered));
    cx.notify();
  }

  // Refresh git diff for each agent cwd (once per distinct cwd) (crmux state.rs resolve_git_diff)
  async refreshDiffs(cx) {
    const targets = diffTargets(this.items());
    const results = await Promise.all(targets.map((t) => gitDiff(t)));
    const next = Object.fromEntries(targets.map((t, i) => [t.key, results[i]]));
    const sig = JSON.stringify(next);
    if (sig === this.diffSig) return;
    this.diffSig = sig;
    this.diffs = next;
    cx.notify();
  }

  // --- Rendering ---

  // Update the state-transition records (write to shared only when changed)
  records(items) {
    const old = shared("crmux.records") ?? {};
    const changedAt = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t.changed_at]));
    const next = trackStatuses(old, items.map((a) => ({
      address: a.address, status: a.status, seenAt: changedAt.get(a.tab) ?? null,
    })), Date.now());
    if (next !== old && !checking()) setShared("crmux.records", next);
    return next;
  }

  // Drop marks of agents that are gone (write to shared only when changed; do nothing when agents could not be fetched)
  dropGoneMarks(all) {
    const marks = this.marks();
    const next = pruneMarks(marks, all);
    if (next !== marks && all.length && !checking()) setShared("crmux.marks", next);
  }

  // If the current tab is gone, go back to All (and clear the saved one)
  resetTab(v) {
    const stored = shared("crmux.tab");
    if (stored && v.tab.kind === "all" && stored.kind !== "all" && v.all.length && !checking()) {
      setShared("crmux.tab", null);
    }
  }

  // Publish the tab bar (labels with each tab's count, and the current index) for crmux-tabs to draw
  // (it replaces crmux's heading, so it is shown even with a single tab). Written to shared only when changed
  publishTabBar(v) {
    if (checking()) return;
    const bar = { labels: tabBarLabels(v.tabs, v.all, v.marks), index: v.index };
    if (JSON.stringify(bar) === JSON.stringify(shared("crmux.tabbar"))) return;
    setShared("crmux.tabbar", bar);
  }

  // git diff summary at the card's bottom-left
  diff(t, a) {
    const parts = a.cwd ? this.diffs[diffKey(a.machine, a.cwd)] : null;
    return h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap()
      .children((parts ?? []).map((p) => div().flex_none().whitespace_nowrap()
        // An exited card is dimmed, its diff summary included
        .text_color(a.status === "exited" ? t.muted : t[DIFF_COLORS[p.color]] ?? t.muted).child(p.text)));
  }

  card(t, a, index, selected, record, now, marked) {
    const kind = statusKind(a.status);
    // An exited shell is drawn dimmed (frame, title and text in muted)
    const exited = kind === "exited";
    const color = exited ? t.muted ?? t.foreground : t[kind] ?? t.foreground;
    // Top-edge title: cyan for a worktree agent (crmux ui.rs format_title); body text: foreground. Both dimmed when exited
    const titleColor = !exited && a.worktree ? t.ansi6 ?? color : color;
    const textColor = exited ? color : t.foreground;
    const secs = Math.floor((now - (record?.since ?? now)) / 1000);
    const pulse = shouldPulse(a.status, secs, record?.hasWorked ?? false);
    const frame = div().id(`frame-${a.address}`).absolute().top(0).left(0).size_full()
      .rounded(6).border_1().border_color(color)
      .when(pulse, (el) => el.loop("opacity", PULSE));
    return div().id(`card-${a.address}`).relative().flex_none().w_full().rounded(6)
      .when(selected, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        // Leave Insert before selecting: in Insert, keepFocus puts the keyboard back in the terminal, not the list
        // (leaving Insert already reclaims the keyboard for the list)
        if (!this.leaveInsert()) this.handle.focus();
        this.select(a.address);
        cx.notify();
      })
      .child(frame)
      .child(v_flex().px(9).py(5).gap(2)
        .child(div().truncate().font_bold().text_color(titleColor)
          .child(cardLabel({ selected, index, project: a.project, branch: a.branch, worktree: a.worktree })))
        // Body: mark (* is green and bold, otherwise 2 spaces) and the terminal title (crmux ui.rs mark_span)
        .child(h_flex().min_w(0)
          .child(div().flex_none().whitespace_nowrap().font_bold().text_color(t.ansi2 ?? t.foreground).child(markPrefix(marked)))
          .child(div().flex_1().min_w(0).truncate().text_color(textColor).child(a.title || " ")))
        // Bottom edge: git diff summary on the left, state icon and elapsed time on the right
        .child(h_flex().justify_between().gap(6)
          .child(this.diff(t, a))
          .child(h_flex().flex_none().gap(6).text_color(color)
            // With the monospace fallback font (Cica), 💤 becomes a different monochrome glyph, so draw it with an emoji font
            .child(div().when(kind === "idle", (el) => el.font_family(EMOJI_FONT)).child(statusIcon(a.status)))
            .child(formatElapsed(secs)))));
  }

  render() {
    const t = theme();
    const v = this.view();
    const { items, marks } = v;
    const list = items.map((a) => a.address);
    this.syncFocus(list);
    const sel = this.selected(list);
    // Clean up state-transition records and marks using all agents before filtering (so filtering does not drop records)
    const records = this.records(v.all);
    this.dropGoneMarks(v.all);
    this.resetTab(v);
    this.publishTabBar(v);
    const now = Date.now();
    setAgentOrder(v.all.map((a) => a.address));
    const at = list.indexOf(sel);
    const listAt = `${tabLabel(v.tab)}:${at}`;
    if (at >= 0 && listAt !== this.scrolledTo) {
      this.scrolledTo = listAt;
      this.scroll.scroll_to_item(at);
    }
    // A mod block does not honor the layout's `focus` border, so the list draws its own: accent while it has the keyboard
    this.drawnFocus = this.handle.is_focused();
    return v_flex().id("crmux-list").track_focus(this.handle).size_full().min_h(0)
      .border_1().border_color(this.drawnFocus ? t.accent ?? t.foreground : t.border ?? t.muted)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", (_e, cx) => {
        // A click on the list's margin also returns to Normal (window_drag still works as is)
        if (!this.leaveInsert()) this.handle.focus();
        cx.notify();
      })
      .child(v_flex().id("crmux-cards").flex_1().min_h(0).p(8).gap(6).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(!items.length, (el) => el.child(div().p(4).text_color(t.muted).child("No agents")))
        .children(items.map((a, i) => this.card(t, a, i, a.address === sel, records[a.address], now, marks.includes(a.address)))));
  }
}

// git diff summary for cwd (crmux state.rs resolve_git_diff). null (not shown) when it is not a git repository, git is missing, etc.
// --no-optional-locks: do not take index.lock on the 5-second fetch (to avoid clashing with the user's own git operations)
async function gitDiff({ cwd, machine }) {
  const opts = gitOpts(machine);
  const git = (args) => exec("git", ["--no-optional-locks", "-C", cwd, "diff", ...args, "--numstat"], opts);
  try {
    const staged = await git(["--cached"]);
    if (staged.code !== 0) return null;
    const unstaged = await git([]).catch(() => null);
    return diffSummary(parseNumstat(staged.stdout), unstaged?.code === 0 ? parseNumstat(unstaged.stdout) : null);
  } catch {
    return null;
  }
}

// Repository name and worktree of cwd (crmux tmux.rs resolve_project_name). false when git says it is not a repository
// (exit 128), null when git could not answer (missing, timed out, machine unreachable, etc.; asked again next round)
async function gitRepo({ cwd, machine }) {
  try {
    const r = await exec("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--git-dir", "--show-toplevel"], gitOpts(machine));
    if (r.code === 0) return parseRepo(r.stdout) ?? false;
    return r.code === 128 ? false : null;
  } catch {
    return null;
  }
}

// exec options for git on the agent's machine
function gitOpts(machine) {
  return { timeout: DIFF_MS, ...(machine ? { on: machine } : {}) };
}
