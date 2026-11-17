// crmux-style card list (left) and Normal mode key handling.
// The preview on the right is the layout's agent / terminal blocks (real terminals); the arrangement is swapped with layout.set.
// Switching layouts recreates this mod, so state to keep (selection, arrangement, transition records, marks, tabs, tab bar) lives in shared.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import {
  agents, terminals, panes, spaces, run, hc, exec, shared, setShared, theme, settings, layout, checking, nextCommand,
  setAgentOrder, focused,
} from "herdr";
import {
  formatElapsed, shouldPulse, trackStatuses, statusKind, statusIcon, projectName, parseRepo, sortByProject, cardLabel, cycle,
  pickSelected, nextSelection, exitedTerminals, closable, neighbour, previewLabels, findNewShell, shellCommand,
} from "./cards.js";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree, goTarget, shownOrder } from "./arrange.js";
import {
  buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabBarLabels, toggleMark, pruneMarks,
  markPrefix, tabKey, applyOrder, swapInOrder, pruneOrders,
} from "./tabs.js";
import { parseNumstat, diffSummary, diffTargets, diffKey, keepRepos } from "./diff.js";
import { normalKey, scrollKey, scrollStep, scrollView, previewFocus, focusAction } from "./keys.js";
import { buildHints, hintKey, shownPreviews } from "./hints.js";

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
// How long openShell (crmux-list.shell / split-*) waits for the shell it opened to show up before giving up on selecting it
const NEW_SHELL_MS = 10000;
// Size of the program icon before a card's label (the preview's title row uses 14 for 12px text)
const ICON_PX = 14;
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
    // The shell openShell opened, until it shows up in the list: { space, known, until } (see findNewShell)
    this.pendingShell = null;
    // Hint mode (f): buildHints' result while the labels are up, else null
    this.hints = null;
    if (checking()) return;

    this.setInsert(false);
    // Labels left up when the app quit mid-hint
    this.publishHints();
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
        // The program's icon, as the preview's title row (and herdr's pane header) shows it: the agent's, else the pane's
        program: a.program ?? p?.program ?? null,
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

  // Each tab's own order (crmux-list.swap-*): { [tabKey]: [addresses] }
  orders() {
    return shared("crmux.orders") ?? {};
  }

  // Tab list, current tab, and the agents filtered by that tab (targets of the list, numbers, j/k, t, and the preview), in
  // the tab's own order when it has one (pinned; key: the tab's key in crmux.orders)
  view() {
    const all = this.items();
    const marks = this.marks();
    const tabs = buildTabs(all, marks);
    const index = tabIndex(tabs, shared("crmux.tab"));
    const tab = tabs[index];
    const key = tabKey(tab);
    const order = this.orders()[key];
    return { all, marks, tabs, index, tab, key, pinned: Boolean(order), items: applyOrder(filterByTab(all, tab, marks), order) };
  }

  addresses() {
    return this.view().items.map((a) => a.address);
  }

  selected(addresses = this.addresses()) {
    return pickSelected(addresses, shared("crmux.selected"), focused()?.agent);
  }

  // The agent shown large in MainV / MainH. Kept apart from the selection: a pick from the list moves both, but clicking a
  // preview only selects it in place (setSelection), so the terminal clicked does not jump into the main slot.
  // Falls back to the selection when unset or no longer in the list (as nextSelection resolves it; previewTree takes it as is).
  // A tab with its own order keeps its first one there, whatever is selected
  main(addresses = this.addresses()) {
    if (this.view().pinned) return addresses[0] ?? null;
    const main = shared("crmux.main");
    return addresses.includes(main) ? main : this.selected(addresses);
  }

  // --- Actions ---

  command(c) {
    if (c === "focus") {
      // pane.go moved onto the list (or a popup over it closed): take the keyboard, but not away from Insert's terminal
      if (!this.insert) this.handle.focus();
      return;
    }
    if (c === "normal" && this.hints) {
      // The escape in keys.json reaches here before the list's own keys: it cancels the hints
      return this.endHints();
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
    const v = this.view();
    const list = v.items.map((a) => a.address);
    const sel = this.selected(list);
    const at = Math.max(0, list.indexOf(sel));
    const select = /^select-([1-9])$/.exec(name);
    const tabNo = /^tab-(\d+)$/.exec(name);
    // tab-select-<n>: like herdr-app's tab.select (from 1), for a key bound under layout:crmux in keys.json. Like h / l it
    // keeps the mode (tab-<n> is a click, which leaves Insert)
    const tabSelect = /^tab-select-([1-9]\d*)$/.exec(name);
    // pick-<address> (a click on a preview's title row); the address may contain / (another machine's machine/t7)
    const pick = /^pick-(.+)$/.exec(name);
    // go-<direction>: the stand-in for herdr-app's pane.go (which fails from a layout block), for a key bound under layout:crmux
    const go = /^go-(left|right|up|down)$/.exec(name);
    // split-<direction>: herdr-app's pane.split on the selected one's pane, for a key bound under layout:crmux
    const split = /^split-(right|down)$/.exec(name);
    // swap-<direction>: the stand-in for herdr-app's pane.swap, for a key bound under layout:crmux
    const swap = /^swap-(left|right|up|down)$/.exec(name);
    // Leaving Scroll mode with i puts the preview back at the bottom (crmux reset_preview_scroll)
    if (name === "insert" && this.scrolling()) this.scrollPreview(sel, "bottom");
    if (name === "down") this.select(list[cycle(at, 1, list.length)], v.items);
    else if (name === "up") this.select(list[cycle(at, -1, list.length)], v.items);
    else if (select) this.select(list[Number(select[1]) - 1], v.items);
    else if (name === "toggle") this.select(shared("crmux.prev"), v.items);
    else if (name === "insert") this.toInsert();
    else if (name === "arrange") this.setArrange(nextArrange(this.arrange()));
    else if (name === "main") this.switchToMain(sel);
    else if (/^(scroll-up|scroll-down|line-up|line-down|top|bottom)$/.test(name)) this.scrollPreview(sel, name);
    else if (name === "esc") this.esc();
    else if (name === "mark") this.markSelected(sel);
    else if (name === "tab-next") this.switchTab(1, sel);
    else if (name === "tab-prev") this.switchTab(-1, sel);
    else if (tabNo) this.clickTab(v.tabs[Number(tabNo[1])], sel);
    else if (tabSelect) this.selectTab(v.tabs[Number(tabSelect[1]) - 1], sel);
    else if (name === "close") this.closeExited(sel, list);
    else if (name === "shell") this.openShell("tab", sel, v.all);
    else if (split) this.openShell(split[1], sel, v.all);
    else if (pick) this.pick(pick[1], v.items);
    else if (go) this.go(go[1], sel, v.items);
    else if (swap) this.swap(swap[1], sel, v);
    else if (name === "unpin") this.unpin(v);
    else if (name === "hint") this.startHints(v, sel);
  }

  // A click on a card or a preview's title row: select that agent. Leave Insert first: in Insert, keepFocus puts the
  // keyboard back in the terminal, not the list. Leaving Insert does not re-lay out here: the selection does (once, and
  // its reclaim puts the keyboard in the list); only when the selection changes nothing is the layout re-set for the mode.
  // items: the current tab's list (view().items) when the caller has it
  pick(address, items = this.view().items) {
    const left = this.insert;
    if (left) this.setInsert(false);
    else this.handle.focus();
    if (!this.select(address, items) && left) this.relayout(items);
  }

  // A selection from the list (j/k, numbers, t, card / title-row pick): it becomes the main too. Returns whether the
  // selection or the main changed (then it has re-laid out). items: the current tab's list (view().items)
  select(address, items = this.view().items) {
    const list = items.map((a) => a.address);
    if (!address || !list.includes(address)) return false;
    const cur = this.selected(list);
    // Selecting another one (e.g. by clicking a card) leaves Scroll mode (crmux resets the scroll on selection)
    if (address !== cur && this.scrolling()) this.scrollPreview(cur, "bottom");
    if (!this.setSelection(address, { promote: true, list })) return false;
    // Already selected (e.g. a preview was clicked in place): it only moved into the main slot
    if (address === cur) this.relayout(items);
    else this.focusAgent(address, items);
    return true;
  }

  // The one place that writes the selection (crmux.selected, and crmux.prev, where t goes back to) and the main slot
  // (crmux.main), each only when its value changes; nextSelection decides what (promote / remember are its options).
  // list: the current tab's addresses when the caller has them. Returns whether the selection or the main shown changed
  setSelection(address, { promote = false, remember = true, list = this.addresses() } = {}) {
    const current = { selected: shared("crmux.selected"), main: shared("crmux.main"), prev: shared("crmux.prev") };
    const next = nextSelection({ ...current, focusedAgent: focused()?.agent }, list, { address, promote, remember });
    for (const key of ["main", "prev", "selected"]) {
      if (next[key] !== current[key]) setShared(`crmux.${key}`, next[key]);
    }
    return next.changed;
  }

  // Show address in the Single agent block and re-lay out. agent.focus switches the contents of the Single agent block
  // (also keeps herdr's focused agent in sync for multi-pane display).
  // An exited shell is not an agent: the Single preview shows its terminal block instead (previewTree).
  // items: the current tab's list for applyLayout when the caller has it
  focusAgent(address, items) {
    const exited = this.isExited(address);
    this.keepFocus(() => {
      if (!exited) run("agent.focus", { terminal: address });
      this.applyLayout(items);
    });
  }

  // x: close the selected exited shell's terminal (its pane, or its tab if it is the last pane, goes too) and select the
  // next one in the list (else the previous one). A live agent is never closed, so a running agent cannot be killed by mistake
  closeExited(sel, list) {
    if (!sel || !this.isExited(sel) || !closable(panes().find((p) => p.terminal === sel))) return;
    const next = neighbour(list, sel);
    run("terminal.kill", { terminal: sel });
    if (!next) return this.relayout();
    this.setSelection(next, { promote: true, remember: false });
    this.focusAgent(next);
  }

  // A new plain shell for the selected one (to start a server or run a command outside the agents). how: "tab" (crmux-list.shell:
  // a background tab in its space, in its folder) or "right" / "down" (crmux-list.split-*: split the pane it is in, in the
  // tab it came from). The app gives no address back, so tick picks the shell up when it shows up in that space
  // (adoptNewShell), selects it and enters Insert
  openShell(how, sel, all) {
    const a = all.find((i) => i.address === sel) ?? null;
    const cmd = shellCommand(how, a, focused()?.space ?? null);
    if (!cmd) return;
    const space = a?.space ?? cmd.args.space;
    this.pendingShell = { space, known: all.map((i) => i.address), until: Date.now() + NEW_SHELL_MS };
    run(cmd.name, cmd.args);
  }

  // The shell openShell opened has shown up: select it and type into it. Returns whether it acted (it has re-laid out then).
  // Given up after NEW_SHELL_MS, and when it is not in the current tab (e.g. Marked) it is only listed, not selected
  adoptNewShell() {
    if (!this.pendingShell) return false;
    if (Date.now() > this.pendingShell.until) {
      this.pendingShell = null;
      return false;
    }
    const v = this.view();
    const address = findNewShell(this.pendingShell, v.all);
    if (!address) return false;
    this.pendingShell = null;
    if (!v.items.some((a) => a.address === address)) return false;
    this.select(address, v.items);
    this.toInsert();
    return true;
  }

  // The stand-in for herdr-app's pane.go: pane.go does not work from a layout terminal block, so the list moves the keyboard
  // between the previews itself. In Insert: to the preview next to the one being typed into (selected in place, like a
  // click; it stays Insert), or back to the list going left from the leftmost (or from Single). In Normal: right enters
  // the selected preview (like i); the other directions do nothing
  go(dir, sel, items) {
    if (!this.insert) {
      if (dir !== "right") return;
      if (this.scrolling()) this.scrollPreview(sel, "bottom");
      return this.toInsert();
    }
    const target = goTarget(this.previewFor(items), sel, dir);
    if (target) {
      this.setSelection(target, { list: items.map((a) => a.address) });
      this.relayout(items);
    } else if (dir === "left") this.toList();
  }

  // The stand-in for herdr-app's pane.swap: the selected preview trades places with its neighbour in dir, and the tab keeps that
  // order from then on (pinned: its first one stays in the main slot whatever is selected; newcomers go last). It starts
  // from the order shown (MainV / MainH: the main first), so pinning keeps what is in the main slot
  swap(dir, sel, v) {
    const target = goTarget(this.previewFor(v.items), sel, dir);
    if (!target) return;
    const list = v.items.map((a) => a.address);
    const shown = shownOrder(this.arrange(), list, this.main(list));
    setShared("crmux.orders", { ...this.orders(), [v.key]: swapInOrder(shown, sel, target) });
    this.relayout();
  }

  // R: drop the tab's own order (back to the automatic order, and a list pick moves into the main slot again)
  unpin(v) {
    if (!v.pinned) return;
    const { [v.key]: _dropped, ...rest } = this.orders();
    setShared("crmux.orders", rest);
    this.relayout();
  }

  // f: label every card, shown preview and tab (crmux.hints, which each mod draws; the footer shows -- HINT --). The keyboard
  // stays in the list, whose onKey takes the typed letters (hintKey)
  startHints(v, sel) {
    const list = v.items.map((a) => a.address);
    this.hints = buildHints({ cards: list, previews: shownPreviews(this.arrange(), list, sel), tabs: v.tabs.length });
    this.publishHints();
    setShared("crmux.mode", "hint");
  }

  publishHints() {
    const h = this.hints;
    setShared("crmux.hints", h ? { cards: h.cards, previews: h.previews, tabs: h.tabs, typed: h.typed } : null);
  }

  // Take the labels down (back to Normal)
  endHints() {
    this.hints = null;
    this.publishHints();
    setShared("crmux.mode", this.insert ? "insert" : "normal");
  }

  // A key in hint mode: wait for the next letter of a longer label, jump when one is complete, cancel otherwise
  hintKeyDown(k, m) {
    const res = m.control || m.shift ? { cancel: true } : hintKey(this.hints.targets, this.hints.typed, k);
    if (res.typed !== undefined) {
      this.hints.typed = res.typed;
      return this.publishHints();
    }
    this.endHints();
    if (res.target) this.jump(res.target);
  }

  // Where a label goes: a card is a pick from the list (like j/k), a preview is entered (like clicking it: selected in place,
  // then Insert), a tab is switched to (like h / l)
  jump(target) {
    const v = this.view();
    const sel = this.selected(v.items.map((a) => a.address));
    if (target.kind === "card") this.select(target.key, v.items);
    else if (target.kind === "tab") this.selectTab(v.tabs[target.key], sel);
    else if (target.kind === "preview") {
      if (this.scrolling()) this.scrollPreview(sel, "bottom");
      this.setSelection(target.key, { list: v.items.map((a) => a.address) });
      this.toInsert();
    }
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
    this.selectTab(cycleTab(v.tabs, v.tab, dir), sel);
  }

  // Switch to the tab (h / l and crmux-list.tab-next / tab-prev). Insert stays as it was (e.g. tab-next from a shell)
  selectTab(tab, sel) {
    if (!tab) return;
    setShared("crmux.tab", { kind: tab.kind, value: tab.value ?? null });
    this.refilter(sel, true);
  }

  // A click on the tab bar (crmux-list.tab-<n>): a list action, like a card click, so it leaves Insert first (the tab
  // switch re-lays out and reclaims the keyboard for the list). Out of range (the tabs changed since the click) gives
  // undefined, which does nothing
  clickTab(tab, sel) {
    if (!tab) return;
    if (this.insert) this.setInsert(false);
    this.selectTab(tab, sel);
  }

  // After the filter changes: keep the selected agent if it remains, otherwise the first (crmux switch_tab); always re-lays out.
  // promote: a tab switch also brings the selected agent to the main slot (a mark toggle leaves the arrangement alone,
  // unless the selected one left the list)
  refilter(before, promote = false) {
    const { items } = this.view();
    const list = items.map((a) => a.address);
    const next = keepSelection(list, before);
    if (next) this.setSelection(next, { promote: promote || next !== before, remember: false, list });
    if (next && next !== before) this.focusAgent(next, items);
    else this.relayout(items);
  }

  setArrange(arrange) {
    setShared("crmux.arrange", arrange);
    setShared("crmux.next", nextArrange(arrange));
    this.relayout();
  }

  // Build the right side from the arrangement, list (items: the current tab's, from view()), selection and mode (the frame
  // of the preview being typed into in Insert is accent), and swap it via layout.set if it differs from the current layout.
  // Returns whether it sent layout.set (which moves the keyboard to a right-side block, so the caller reclaims it: keepFocus,
  // or reclaim() outside it)
  applyLayout(items = this.view().items) {
    if (shared("layout") !== LAYOUT) return false;
    const want = this.previewFor(items);
    if (sameTree(want, findNode(layout(), "preview"))) return false;
    run("layout.set", { layout: crmuxLayout(want) });
    return true;
  }

  // The right side's tree for the current tab's list, arrangement, selection and mode
  previewFor(items) {
    const list = items.map((a) => a.address);
    const exited = items.filter((a) => a.status === "exited").map((a) => a.address);
    return previewTree(this.arrange(), list, this.selected(list), { exited, insert: this.insert, main: this.main(list) });
  }

  // Selection moves and layout.set move the keyboard to a right-side block, so put it back where the mode says
  keepFocus(fn) {
    fn();
    this.reclaim();
  }

  // Re-set the layout for the current state (selection, main, arrangement, mode) and put the keyboard back.
  // items: the current tab's list when the caller has it
  relayout(items) {
    this.keepFocus(() => this.applyLayout(items));
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
    // A clicked preview is selected in place (the main slot stays as it is)
    if (action.address !== cur) this.setSelection(action.address, { list: addresses });
    // A preview holds it while the list thinks it is Normal (the user clicked it): Insert on that preview.
    // Like toInsert from Scroll mode, the preview goes back to the bottom
    if (action.type === "enter") {
      if (this.scrolling()) this.scrollPreview(cur, "bottom");
      this.setInsert(true);
    }
    // Entering Insert, or (in Insert) another preview was clicked and is now the one being typed into: the accent frame moves
    // there. The keyboard is already there, but layout.set may move it, and the reclaim (pane.focus on the new selection)
    // keeps syncFocus from reading that move as a click
    this.relayout();
    return true;
  }

  // Normal / Insert: the field and crmux.mode (which crmux-footer shows). The selected preview's frame follows the mode,
  // so the caller re-lays out
  setInsert(on) {
    // Anything that changes the mode (a click on a preview, i) takes the labels down
    if (this.hints) {
      this.hints = null;
      this.publishHints();
    }
    this.insert = on;
    setShared("crmux.mode", on ? "insert" : "normal");
  }

  // Insert -> Normal. Nothing to do outside Insert. Returns whether it acted (the keyboard is then reclaimed for the list)
  leaveInsert() {
    if (!this.insert) return false;
    this.toList();
    return true;
  }

  // Normal, with the keyboard reclaimed for the list (the accent frame leaves the preview, so the layout is re-set first)
  toList() {
    this.setInsert(false);
    this.relayout();
  }

  // Insert on the selected agent: its frame turns accent (layout.set), then the reclaim puts the keyboard in its terminal
  // (refocus in Insert is pane.focus on the selection). Until that takes effect the keyboard is still in the list (or
  // wherever layout.set left it), which the settle window keeps syncFocus from reading as a click
  toInsert() {
    if (!this.selected()) return;
    this.setInsert(true);
    this.relayout();
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
    // Hint mode takes every key
    if (this.hints) {
      this.hintKeyDown(k, m);
      cx.stop_propagation();
      return cx.notify();
    }
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
    if (this.adoptNewShell()) return cx.notify();
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

  // Drop terminals that are gone from the tabs' own orders (like marks; not while nothing is listed, e.g. at start)
  dropGoneOrders(all) {
    const orders = this.orders();
    const next = pruneOrders(orders, all);
    if (next !== orders && all.length && !checking()) setShared("crmux.orders", next);
  }

  // If the current tab is gone, go back to All (and clear the saved one)
  resetTab(v) {
    const stored = shared("crmux.tab");
    if (stored && v.tab.kind === "all" && stored.kind !== "all" && v.all.length && !checking()) {
      setShared("crmux.tab", null);
    }
  }

  // Publish the tab bar (labels with each tab's count, and the current index) for crmux-tabs to draw
  // (it replaces crmux's heading, so it is shown even with a single tab)
  publishTabBar(v) {
    publishIfChanged("crmux.tabbar", { labels: tabBarLabels(v.tabs, v.all, v.marks, this.orders()), index: v.index });
    // Whether the shown tab has its own order, for the footer's R:Unpin
    publishIfChanged("crmux.pinned", v.pinned);
  }

  // Publish the fixed part of each preview's title row (card label without the mark, worktree) for crmux-title to draw.
  // The terminal title and state change often, so crmux-title reads those from agents() / panes() itself
  publishTitles(items) {
    publishIfChanged("crmux.titles", previewLabels(items));
  }

  // git diff summary at the card's bottom-left
  diff(t, a) {
    const parts = a.cwd ? this.diffs[diffKey(a.machine, a.cwd)] : null;
    return h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap()
      .children((parts ?? []).map((p) => div().flex_none().whitespace_nowrap()
        // An exited card is dimmed, its diff summary included
        .text_color(a.status === "exited" ? t.muted : t[DIFF_COLORS[p.color]] ?? t.muted).child(p.text)));
  }

  // badge: the hint label (f) drawn at the top right, or null
  card(t, a, index, selected, record, now, marked, badge = null) {
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
        this.pick(a.address);
        cx.notify();
      })
      .child(frame)
      .when(Boolean(badge), (el) => el.child(div().absolute().top(4).right(8).child(badge)))
      .child(v_flex().px(9).py(5).gap(2)
        // Top: the program's icon (tells an agent from a shell at a glance), then the label
        .child(h_flex().min_w(0).gap(6).items_center()
          .when(Boolean(a.program?.icon), (el) => el.child(programIcon(a.program, ICON_PX, exited ? color : t.dim ?? t.muted)))
          .child(div().flex_1().min_w(0).truncate().font_bold().text_color(titleColor)
            .child(cardLabel({ selected, index, project: a.project, branch: a.branch, worktree: a.worktree }))))
        // Body: mark (* is green and bold, otherwise 2 spaces) and the terminal title (crmux ui.rs mark_span)
        .child(h_flex().min_w(0)
          .child(div().flex_none().whitespace_nowrap().font_bold().text_color(t.ansi2 ?? t.foreground).child(markPrefix(marked)))
          .child(div().flex_1().min_w(0).truncate().text_color(textColor).child(a.title || " ")))
        // Bottom edge: git diff summary on the left, state icon and elapsed time on the right (agents only: a shell has
        // no state, its icon at the top already tells it apart)
        .child(h_flex().justify_between().gap(6)
          .child(this.diff(t, a))
          .when(!exited, (el) => el.child(h_flex().flex_none().gap(6).text_color(color)
            // With the monospace fallback font (Cica), 💤 becomes a different monochrome glyph, so draw it with an emoji font
            .child(div().when(kind === "idle", (el) => el.font_family(EMOJI_FONT)).child(statusIcon(a.status)))
            .child(formatElapsed(secs))))));
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
    this.dropGoneOrders(v.all);
    this.resetTab(v);
    this.publishTabBar(v);
    this.publishTitles(items);
    // The selection the list resolved and shows (stored -> herdr's focused agent -> first), for Single's title row, whose
    // agent block shows that one
    publishIfChanged("crmux.shown", sel);
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
      .rounded(6).border_1().border_color(this.drawnFocus ? t.accent ?? t.foreground : t.border ?? t.muted)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", (_e, cx) => {
        // A click on the list's margin also returns to Normal (window_drag still works as is)
        if (!this.leaveInsert()) this.handle.focus();
        cx.notify();
      })
      .child(v_flex().id("crmux-cards").flex_1().min_h(0).p(8).gap(6).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(!items.length, (el) => el.child(div().p(4).text_color(t.muted).child("No agents")))
        .children(items.map((a, i) => this.card(t, a, i, a.address === sel, records[a.address], now, marks.includes(a.address),
          this.hints ? hintBadge(t, this.hints.cards[a.address], this.hints.typed) : null))));
  }
}

// Write value to shared for the other mods to draw, only when it changed (every write re-renders every mod; compared as
// JSON) and not while herdr-app check renders the mod
function publishIfChanged(key, value) {
  if (checking() || JSON.stringify(value) === JSON.stringify(shared(key))) return;
  setShared(key, value);
}

// A hint label (f): the letters still to type of label, on the accent color; nothing when there is no label or it no longer
// matches what has been typed (typed)
function hintBadge(t, label, typed = "") {
  if (!label || !label.startsWith(typed)) return null;
  return div().flex_none().px(4).rounded(3).bg(t.accent ?? t.foreground).text_color(t.accent_foreground ?? t.background)
    .font_bold().text_size(11).child(label.slice(typed.length));
}

// The program's icon, the same as the preview's title row and herdr's pane header: a one-color glyph is tinted, others are
// drawn as they are
function programIcon(program, size, color) {
  return program.tint ? svg(program.icon).size(size).flex_none().text_color(color) : image(program.icon).w(size).h(size).flex_none();
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
