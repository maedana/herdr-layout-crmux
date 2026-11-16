// crmux 風のカード一覧（左）と Normal モードのキー処理。
// 右のプレビューは layout の agent / terminal ブロック（本物のターミナル）で、並べ方は layout.set で差し替える。
// layout の切り替えでこの mod は作り直されるので、残したい状態（選択・並べ方・状態遷移の記録・マーク・タブ）は shared に置く。
import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import {
  agents, panes, spaces, run, hc, exec, shared, setShared, theme, settings, layout, checking, nextCommand, setAgentOrder,
  focused,
} from "herdr";
import {
  formatElapsed, shouldPulse, trackStatuses, statusKind, statusIcon, projectName, sortByProject, cardLabel, cycle,
  pickSelected,
} from "./cards.js";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree } from "./arrange.js";
import {
  buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabTitle, tabBarWindow, toggleMark, pruneMarks,
  markPrefix,
} from "./tabs.js";
import { parseNumstat, diffSummary, diffTargets, diffKey } from "./diff.js";

const LAYOUT = "crmux";
const DEFAULT_ARRANGE = "MainV";
// Insert から Esc で戻った直後の Esc（この時間内）は選択中のエージェントへ esc esc を送る
const ESC_FORWARD_MS = 1500;
// g g の 2 打鍵目を待つ時間
const GG_MS = 800;
// 選択移動などでキーボードが右のブロックへ移ったとき、一覧へ取り直すまでの遅延（hop の switchTo と同じ）
const REFOCUS_AFTER_MS = [16, 150];
// 入力待ち・完了直後のパルス（crmux は sin(t*16) ≒ 0.4 秒周期で枠を 50〜100% に揺らす）
const PULSE = { from: 0.5, to: 1, period: 400 };
const EMOJI_FONT = "Noto Color Emoji";
// Normal モードのキー → act() の名前（crmux event_handler.rs handle_normal_mode）
const KEYS = {
  j: "down", down: "down", k: "up", up: "up", t: "toggle", i: "insert", v: "arrange", q: "main",
  h: "tab-prev", left: "tab-prev", l: "tab-next", right: "tab-next", space: "mark",
  escape: "esc",
};
const CTRL_KEYS = { u: "scroll-up", d: "scroll-down" };
// git diff 要約を取り直す間隔（crmux app.rs と同じ 5 秒）
const DIFF_MS = 5000;
// 一覧の幅（layout の list ブロック）と、タブバーの文字数の見積もりに使う 1 文字の幅（12px の等幅フォントの半角）
const LIST_PX = 280;
const LIST_PAD = 8;
const CHAR_PX = 7.2;
// diffSummary の色の役割 → テーマの色名（ansi1 赤、ansi2 緑、ansi3 黄）
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
    this.tickSig = "";
    this.width = LIST_PX;
    // git diff 要約: diffKey(machine, cwd) → diffSummary の結果（mod の中だけに持つ）
    this.diffs = {};
    this.diffSig = "";
    if (checking()) return;

    setShared("crmux.mode", "normal");
    setShared("crmux.next", nextArrange(this.arrange()));
    this.handle.focus();
    // init 直後は focus が効かないことがあり（hop と同じく少し後に取り直す）、layout() もまだ前の layout を返すので、
    // 並べ方の復元（layout.set はファイルを書き換えるので、install.sh 直後などは Single に戻っている）も少し後に
    cx.timer.after(300, () => {
      this.refocus();
      this.applyLayout();
    });
    // 経過時間・パルスの開始/終了の表示更新と、エージェントの増減に合わせた並べ直し
    cx.timer.every(1000, (cx) => this.tick(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        this.command(c);
        cx.notify();
      }
    });
    // git diff 要約を 5 秒ごとに取り直し、変わったときだけ描き直す
    cx.spawn(async (cx) => {
      for (;;) {
        await this.refreshDiffs(cx).catch(() => {});
        await cx.sleep(DIFF_MS);
      }
    });
  }

  // --- 状態（shared） ---

  arrange() {
    return shared("crmux.arrange") ?? DEFAULT_ARRANGE;
  }

  // すべてのエージェント（project 名の昇順）
  items() {
    const byPane = new Map(panes().map((p) => [p.pane, p]));
    const bySpace = new Map(spaces().map((s) => [s.id, s]));
    return sortByProject(agents().map((a) => {
      const p = byPane.get(a.pane);
      const s = bySpace.get(a.space);
      return {
        address: a.address, pane: a.pane, tab: a.tab, status: a.status, title: a.title,
        project: projectName(p?.cwd) || a.space_name, branch: p?.branch ?? null,
        space: a.space, spaceName: a.space_name, spaceIndex: s?.index ?? 0,
        cwd: p?.cwd ?? null, machine: s?.machine ?? null,
      };
    }));
  }

  marks() {
    return shared("crmux.marks") ?? [];
  }

  // タブ一覧・今のタブと、そのタブで絞り込んだエージェント（一覧・番号・j/k・t・プレビューの対象）
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

  // --- 操作 ---

  command(c) {
    if (c === "focus") return this.refocus();
    if (c === "normal") {
      // keys.json の layout:crmux の escape。右のターミナルにいれば一覧へ戻る（Insert → Normal）。
      // 一覧にいるとき（Normal の Esc）にもこのコマンドで届くことがある
      if (this.insert || !this.handle.is_focused()) return this.toNormal();
      return this.esc();
    }
    this.act(c);
  }

  // Normal モードの操作。キーと herdr-app do crmux-list.<name> の両方から呼ぶ
  act(name) {
    const list = this.addresses();
    const sel = this.selected(list);
    const at = Math.max(0, list.indexOf(sel));
    const select = /^select-([1-9])$/.exec(name);
    if (name === "down") this.select(list[cycle(at, 1, list.length)]);
    else if (name === "up") this.select(list[cycle(at, -1, list.length)]);
    else if (select) this.select(list[Number(select[1]) - 1]);
    else if (name === "toggle") this.select(shared("crmux.prev"));
    else if (name === "insert") this.toInsert();
    else if (name === "arrange") this.setArrange(nextArrange(this.arrange()));
    else if (name === "main") this.switchToMain(sel);
    else if (name === "scroll-up") this.scrollPreview(sel, { pages: -0.5 });
    else if (name === "scroll-down") this.scrollPreview(sel, { pages: 0.5 });
    else if (name === "top") this.scrollPreview(sel, { to: "top" });
    else if (name === "bottom") this.scrollPreview(sel, { to: "bottom" });
    else if (name === "esc") this.esc();
    else if (name === "mark") this.markSelected(sel);
    else if (name === "tab-next") this.switchTab(1, sel);
    else if (name === "tab-prev") this.switchTab(-1, sel);
  }

  select(address) {
    const list = this.addresses();
    const cur = this.selected(list);
    if (!address || address === cur || !list.includes(address)) return;
    setShared("crmux.prev", cur);
    this.focusAgent(address);
  }

  focusAgent(address) {
    setShared("crmux.selected", address);
    // agent.focus は Single の agent ブロックの中身を切り替える（複数表示でも herdr の focused agent を揃える）
    this.keepFocus(() => {
      run("agent.focus", { terminal: address });
      this.applyLayout();
    });
  }

  // Space: 選択中のマークを切り替える。Marked タブで外したエージェントは一覧から消える
  // （最後のマークを外すと Marked タブが無くなり All に戻る）
  markSelected(sel) {
    if (!sel) return;
    setShared("crmux.marks", toggleMark(this.marks(), sel));
    this.refilter(sel);
  }

  // h / l: タブを回す
  switchTab(dir, sel) {
    const v = this.view();
    const next = cycleTab(v.tabs, v.tab, dir);
    setShared("crmux.tab", { kind: next.kind, value: next.value ?? null });
    this.refilter(sel);
  }

  // 絞り込みが変わった後: 選択していたエージェントが残っていれば維持、いなければ先頭（crmux switch_tab）
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

  // 並べ方・一覧・選択から右側を組み、今の layout と違えば layout.set で差し替える
  applyLayout() {
    if (shared("layout") !== LAYOUT) return;
    const list = this.addresses();
    const want = previewTree(this.arrange(), list, this.selected(list));
    if (sameTree(want, findNode(layout(), "preview"))) return;
    run("layout.set", { layout: crmuxLayout(want) });
  }

  // 選択移動や layout.set でキーボードが右のブロックへ移るので、一覧へ取り直す（すぐと、落ち着いた後）
  keepFocus(fn) {
    const n = ++this.switches;
    fn();
    this.refocus();
    for (const ms of REFOCUS_AFTER_MS) {
      this.acx.timer.after(ms, () => {
        if (n === this.switches) this.refocus();
      });
    }
  }

  // Insert 中（右のターミナルで入力中）は取り直さない
  refocus() {
    if (!this.insert) this.handle.focus();
  }

  toInsert() {
    const sel = this.selected();
    if (!sel) return;
    this.insert = true;
    setShared("crmux.mode", "insert");
    run("pane.focus", { terminal: sel });
  }

  toNormal() {
    this.insert = false;
    this.escFromInsertAt = Date.now();
    setShared("crmux.mode", "normal");
    this.keepFocus(() => {});
  }

  // Normal の Esc: Insert から戻った直後なら、選択中のエージェントへ Esc Esc を送って Insert へ戻る
  // （この layout ではターミナルの Esc を Normal へ戻るのに使うので、crmux と同じく 2 回目で通す）
  esc() {
    const now = Date.now();
    // keys.json の escape（normal コマンド）と on_key_down の両方に届いたときの 2 重処理を防ぐ
    if (now - this.lastEscAt < 100) return;
    this.lastEscAt = now;
    const sel = this.selected();
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

  scrollPreview(sel, args) {
    if (sel) run("terminal.scroll", { terminal: sel, ...args });
  }

  // Normal モードのキー（一覧にフォーカスがあるときだけ届く）
  onKey(e, cx) {
    const m = e.modifiers;
    const k = e.key;
    if (m.alt || m.platform) return;
    // 一覧にキーが届いた = Normal（クリックで戻ってきた場合など）
    if (this.insert) {
      this.insert = false;
      setShared("crmux.mode", "normal");
    }
    if (k !== "escape") this.escFromInsertAt = 0;
    const plainG = k === "g" && !m.shift && !m.control;
    const gg = plainG && Date.now() - this.gAt < GG_MS;
    this.gAt = plainG && !gg ? Date.now() : 0;
    const name = m.control ? CTRL_KEYS[k] : (k === "G" || (k === "g" && m.shift)) ? "bottom" : m.shift ? null
      : gg ? "top" : /^[1-9]$/.test(k) ? `select-${k}` : KEYS[k];
    if (!name && !plainG) return;
    if (name) this.act(name);
    cx.stop_propagation();
    cx.notify();
  }

  // 1 秒ごと: 表示（経過時間・パルスの有無）が変わったときだけ描き直す。エージェントの増減で並べ直す
  tick(cx) {
    this.applyLayout();
    const now = Date.now();
    const records = shared("crmux.records") ?? {};
    const sig = Object.entries(records).map(([a, r]) => {
      const secs = (now - r.since) / 1000;
      return `${a}:${formatElapsed(secs)}:${shouldPulse(r.kind, Math.floor(secs), r.hasWorked)}`;
    }).join("|");
    if (sig === this.tickSig) return;
    this.tickSig = sig;
    cx.notify();
  }

  // 全エージェントの cwd（同じものは 1 回）で git diff を取り直す（crmux state.rs resolve_git_diff）
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

  // --- 描画 ---

  // 状態遷移の記録を更新（変わったときだけ shared へ）
  records(items) {
    const old = shared("crmux.records") ?? {};
    const changedAt = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t.changed_at]));
    const next = trackStatuses(old, items.map((a) => ({
      address: a.address, status: a.status, seenAt: changedAt.get(a.tab) ?? null,
    })), Date.now());
    if (next !== old && !checking()) setShared("crmux.records", next);
    return next;
  }

  // マークを捨てる: いなくなったエージェントの分（変わったときだけ shared へ。エージェントが取れていないときは触らない）
  dropGoneMarks(all) {
    const marks = this.marks();
    const next = pruneMarks(marks, all);
    if (next !== marks && all.length && !checking()) setShared("crmux.marks", next);
  }

  // 今のタブが無くなっていれば All に戻す（保存も消す）
  resetTab(v) {
    const stored = shared("crmux.tab");
    if (stored && v.tab.kind === "all" && stored.kind !== "all" && v.all.length && !checking()) {
      setShared("crmux.tab", null);
    }
  }

  // 見出し（crmux の枠タイトル）とタブバー（タブが 2 つ以上のとき）
  header(t, v) {
    const chars = Math.floor((this.width - LIST_PAD * 2) / CHAR_PX);
    const segs = tabBarWindow(v.tabs.map(tabLabel), v.index, chars);
    return v_flex().flex_none().px(LIST_PAD + 1).pt(LIST_PAD).gap(2)
      .child(div().truncate().font_bold().text_color(t.foreground).child(tabTitle(v.tab, v.items.length)))
      .when(v.tabs.length > 1, (el) => el.child(h_flex().overflow_hidden().whitespace_nowrap()
        .children(segs.map((s) => div().flex_none().whitespace_nowrap()
          .text_color(s.selected ? t.chrome : t.muted)
          .when(s.selected, (d) => d.bg(t.foreground))
          .child(s.text)))));
  }

  // カード下辺左の git diff 要約
  diff(t, a) {
    const parts = a.cwd ? this.diffs[diffKey(a.machine, a.cwd)] : null;
    return h_flex().flex_1().min_w(0).overflow_hidden().whitespace_nowrap()
      .children((parts ?? []).map((p) => div().flex_none().whitespace_nowrap()
        .text_color(t[DIFF_COLORS[p.color]] ?? t.muted).child(p.text)));
  }

  card(t, a, index, selected, record, now, marked) {
    const kind = statusKind(a.status);
    const color = t[kind] ?? t.foreground;
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
        this.handle.focus();
        this.select(a.address);
        cx.notify();
      })
      .child(frame)
      .child(v_flex().px(9).py(5).gap(2)
        .child(div().truncate().font_bold().text_color(color)
          .child(cardLabel({ selected, index, project: a.project, branch: a.branch })))
        // 本文: マーク（* は緑・太字、無ければ空白 2 つ）とターミナルのタイトル（crmux ui.rs mark_span）
        .child(h_flex().min_w(0)
          .child(div().flex_none().whitespace_nowrap().font_bold().text_color(t.ansi2 ?? t.foreground).child(markPrefix(marked)))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(a.title || " ")))
        // 下辺: 左に git diff 要約、右に状態アイコンと経過時間
        .child(h_flex().justify_between().gap(6)
          .child(this.diff(t, a))
          .child(h_flex().flex_none().gap(6).text_color(color)
            // 💤 は等幅フォントのフォールバック（Cica）だと別物の単色グリフになるので絵文字フォントで描く
            .child(div().when(kind === "idle", (el) => el.font_family(EMOJI_FONT)).child(statusIcon(a.status)))
            .child(formatElapsed(secs)))));
  }

  render() {
    const t = theme();
    const v = this.view();
    const { items, marks } = v;
    const list = items.map((a) => a.address);
    const sel = this.selected(list);
    // 状態遷移の記録とマークの掃除は絞り込み前の全エージェントで（絞り込みで記録が消えないように）
    const records = this.records(v.all);
    this.dropGoneMarks(v.all);
    this.resetTab(v);
    const now = Date.now();
    setAgentOrder(v.all.map((a) => a.address));
    const at = list.indexOf(sel);
    const scrollKey = `${tabLabel(v.tab)}:${at}`;
    if (at >= 0 && scrollKey !== this.scrolledTo) {
      this.scrolledTo = scrollKey;
      this.scroll.scroll_to_item(at);
    }
    return v_flex().id("crmux-list").track_focus(this.handle).size_full().min_h(0)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .on_size_change((size, cx) => {
        // タブバーの文字数の見積もりに使う
        if (Math.abs(size.width - this.width) < 1) return;
        this.width = size.width;
        cx.notify();
      })
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", (_e, cx) => {
        // 一覧の余白のクリックでも Normal に戻る（window_drag はそのまま効かせる）
        this.insert = false;
        setShared("crmux.mode", "normal");
        this.handle.focus();
        cx.notify();
      })
      .child(this.header(t, v))
      .child(v_flex().id("crmux-cards").flex_1().min_h(0).p(8).gap(6).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(!items.length, (el) => el.child(div().p(4).text_color(t.muted).child("No agents")))
        .children(items.map((a, i) => this.card(t, a, i, a.address === sel, records[a.address], now, marks.includes(a.address)))));
  }
}

// cwd の git diff 要約（crmux state.rs resolve_git_diff）。git リポジトリでない・git が無いなどは null（表示しない）。
// --no-optional-locks: 5 秒ごとの取得で index.lock を取らない（利用者の git 操作とぶつからないように）
async function gitDiff({ cwd, machine }) {
  const opts = { timeout: DIFF_MS, ...(machine ? { on: machine } : {}) };
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
