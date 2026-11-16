// crmux 風のカード一覧（左）と Normal モードのキー処理。
// 右のプレビューは layout の agent / terminal ブロック（本物のターミナル）で、並べ方は layout.set で差し替える。
// layout の切り替えでこの mod は作り直されるので、残したい状態（選択・並べ方・状態遷移の記録）は shared に置く。
import { View, div } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import {
  agents, panes, spaces, run, hc, shared, setShared, theme, settings, layout, checking, nextCommand, setAgentOrder,
  focused,
} from "herdr";
import {
  formatElapsed, shouldPulse, trackStatuses, statusKind, statusIcon, projectName, sortByProject, cardLabel, cycle,
  pickSelected,
} from "./cards.js";
import { nextArrange, previewTree, crmuxLayout, findNode, sameTree } from "./arrange.js";

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
  escape: "esc",
};
const CTRL_KEYS = { u: "scroll-up", d: "scroll-down" };

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
  }

  // --- 状態（shared） ---

  arrange() {
    return shared("crmux.arrange") ?? DEFAULT_ARRANGE;
  }

  // 一覧に出すエージェント（project 名の昇順）
  items() {
    const byPane = new Map(panes().map((p) => [p.pane, p]));
    return sortByProject(agents().map((a) => {
      const p = byPane.get(a.pane);
      return {
        address: a.address, pane: a.pane, tab: a.tab, status: a.status, title: a.title,
        project: projectName(p?.cwd) || a.space_name, branch: p?.branch ?? null,
      };
    }));
  }

  addresses() {
    return this.items().map((a) => a.address);
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
  }

  select(address) {
    const list = this.addresses();
    const cur = this.selected(list);
    if (!address || address === cur || !list.includes(address)) return;
    setShared("crmux.prev", cur);
    setShared("crmux.selected", address);
    // agent.focus は Single の agent ブロックの中身を切り替える（複数表示でも herdr の focused agent を揃える）
    this.keepFocus(() => {
      run("agent.focus", { terminal: address });
      this.applyLayout();
    });
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

  card(t, a, index, selected, record, now) {
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
        .child(div().truncate().text_color(t.foreground).child(a.title || " "))
        .child(h_flex().justify_end().gap(6).text_color(color)
          // 💤 は等幅フォントのフォールバック（Cica）だと別物の単色グリフになるので絵文字フォントで描く
          .child(div().when(kind === "idle", (el) => el.font_family(EMOJI_FONT)).child(statusIcon(a.status)))
          .child(formatElapsed(secs))));
  }

  render() {
    const t = theme();
    const items = this.items();
    const list = items.map((a) => a.address);
    const sel = this.selected(list);
    const records = this.records(items);
    const now = Date.now();
    setAgentOrder(list);
    const at = list.indexOf(sel);
    if (at >= 0 && at !== this.scrolledTo) {
      this.scrolledTo = at;
      this.scroll.scroll_to_item(at);
    }
    return v_flex().id("crmux-list").track_focus(this.handle).size_full().min_h(0)
      .font_family(settings().font_family ?? "JetBrains Mono").text_size(12)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .on_mouse_down("left", (_e, cx) => {
        // 一覧の余白のクリックでも Normal に戻る（window_drag はそのまま効かせる）
        this.insert = false;
        setShared("crmux.mode", "normal");
        this.handle.focus();
        cx.notify();
      })
      .child(v_flex().id("crmux-cards").flex_1().min_h(0).p(8).gap(6).overflow_y_scrollbar().track_scroll(this.scroll)
        .when(!items.length, (el) => el.child(div().p(4).text_color(t.muted).child("No agents")))
        .children(items.map((a, i) => this.card(t, a, i, a.address === sel, records[a.address], now))));
  }
}
