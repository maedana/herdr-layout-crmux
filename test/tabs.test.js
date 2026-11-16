import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabTitle, tabBarWindow, toggleMark, pruneMarks, markPrefix } from "../mods/crmux-list/tabs.js";

// 一覧のエージェント（main.js の items() の形の一部）
const agent = (address, project, space = "s1", spaceName = "main", spaceIndex = 1) =>
  ({ address, project, space, spaceName, spaceIndex });

test("タブ: All と、project ごとの +project（昇順・重複なし）", () => {
  const tabs = buildTabs([agent("t1", "zeta"), agent("t2", "alpha"), agent("t3", "zeta")], []);
  assert.deepEqual(tabs, [
    { kind: "all" },
    { kind: "project", value: "alpha" },
    { kind: "project", value: "zeta" },
  ]);
});

test("タブ: いるエージェントにマークがあれば All の次に Marked", () => {
  const list = [agent("t1", "a"), agent("t2", "b")];
  assert.deepEqual(buildTabs(list, ["t2"]).map((t) => t.kind), ["all", "marked", "project", "project"]);
});

test("タブ: マークがいないエージェントのものだけなら Marked は出さない", () => {
  assert.deepEqual(buildTabs([agent("t1", "a")], ["t9"]).map((t) => t.kind), ["all", "project"]);
});

test("タブ: エージェントのいるスペースが 2 つ以上なら、Marked と +project の間にスペースの順で @space", () => {
  const list = [agent("t1", "a", "s2", "work", 2), agent("t2", "b", "s1", "home", 1), agent("t3", "c", "s2", "work", 2)];
  assert.deepEqual(buildTabs(list, ["t1"]), [
    { kind: "all" },
    { kind: "marked" },
    { kind: "space", value: "s1", name: "home" },
    { kind: "space", value: "s2", name: "work" },
    { kind: "project", value: "a" },
    { kind: "project", value: "b" },
    { kind: "project", value: "c" },
  ]);
});

test("タブ: スペースが 1 つなら @space は出さない", () => {
  const list = [agent("t1", "a", "s1"), agent("t2", "b", "s1")];
  assert.equal(buildTabs(list, []).some((t) => t.kind === "space"), false);
});

const addrs = (list) => list.map((a) => a.address);
const LIST = [agent("t1", "a", "s1"), agent("t2", "b", "s2"), agent("t3", "a", "s2")];

test("絞り込み: All は全部、Marked はマーク済み、@space はそのスペース、+project はその project（順はそのまま）", () => {
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "all" }, [])), ["t1", "t2", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "marked" }, ["t3", "t1"])), ["t1", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "space", value: "s2", name: "x" }, [])), ["t2", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "project", value: "a" }, [])), ["t1", "t3"]);
});

const TABS = [{ kind: "all" }, { kind: "marked" }, { kind: "project", value: "a" }, { kind: "project", value: "b" }];

test("今のタブ: 保存した種類と値が一致するタブの位置", () => {
  assert.equal(tabIndex(TABS, { kind: "project", value: "b" }), 3);
  assert.equal(tabIndex(TABS, { kind: "marked" }), 1);
});

test("今のタブ: 保存が無い・無くなったタブなら All（0）", () => {
  assert.equal(tabIndex(TABS, null), 0);
  assert.equal(tabIndex(TABS, { kind: "project", value: "gone" }), 0);
  assert.equal(tabIndex(TABS, { kind: "space", value: "s1" }), 0);
});

test("タブ切り替え: 次・前へ、端で反対側に回る", () => {
  assert.deepEqual(cycleTab(TABS, { kind: "all" }, 1), { kind: "marked" });
  assert.deepEqual(cycleTab(TABS, { kind: "project", value: "b" }, 1), { kind: "all" });
  assert.deepEqual(cycleTab(TABS, { kind: "all" }, -1), { kind: "project", value: "b" });
});

test("タブ切り替え: 今のタブが無くなっていれば All から数える", () => {
  assert.deepEqual(cycleTab(TABS, { kind: "project", value: "gone" }, 1), { kind: "marked" });
});

test("タブ切り替え後の選択: 同じエージェントが新しいタブにいれば維持、いなければ先頭、空なら null", () => {
  assert.equal(keepSelection(["t1", "t3"], "t3"), "t3");
  assert.equal(keepSelection(["t1", "t3"], "t2"), "t1");
  assert.equal(keepSelection([], "t2"), null);
});

test("タブの表記: All / Marked / @space / +project", () => {
  assert.equal(tabLabel({ kind: "all" }), "All");
  assert.equal(tabLabel({ kind: "marked" }), "Marked");
  assert.equal(tabLabel({ kind: "space", value: "s1", name: "work" }), "@work");
  assert.equal(tabLabel({ kind: "project", value: "crmux" }), "+crmux");
});

test("一覧の見出し（crmux の枠タイトル）: タブと件数", () => {
  assert.equal(tabTitle({ kind: "all" }, 4), "All Sessions (4)");
  assert.equal(tabTitle({ kind: "marked" }, 2), "Marked (2)");
  assert.equal(tabTitle({ kind: "space", value: "s1", name: "work" }, 3), "Workspace @work (3)");
  assert.equal(tabTitle({ kind: "project", value: "crmux" }, 1), "Project crmux (1)");
});

const barText = (segs) => segs.map((s) => s.text).join("");

test("タブバー: 幅に収まれば全部、選択中は [name] で selected、間は空白 1 つ", () => {
  const segs = tabBarWindow(["All", "Marked", "+a"], 1, 40);
  assert.equal(barText(segs), "All [Marked] +a");
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[Marked]"]);
  assert.equal(segs.some((s) => s.arrow), false);
});

const LONG = ["All", "+alpha", "+beta", "+gamma", "+delta"];

test("タブバー: 収まらなければ選択中を中心に切り出し、両端に < と > を出す", () => {
  const segs = tabBarWindow(LONG, 2, 16);
  assert.equal(barText(segs), "< ha [+beta] + >");
  assert.deepEqual(segs.filter((s) => s.arrow).map((s) => s.text), ["< ", " >"]);
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[+beta]"]);
});

test("タブバー: 先頭のタブを選んでいれば左の < は出さない", () => {
  assert.equal(barText(tabBarWindow(LONG, 0, 16)), "[All] +alpha + >");
});

test("タブバー: 末尾のタブを選んでいれば右の > は出さない", () => {
  assert.equal(barText(tabBarWindow(LONG, 4, 16)), "< a [+delta]");
});

test("マーク: 無ければ足し、あれば外す（元の配列は変えない）", () => {
  const marks = ["t1"];
  assert.deepEqual(toggleMark(marks, "t2"), ["t1", "t2"]);
  assert.deepEqual(toggleMark(marks, "t1"), []);
  assert.deepEqual(marks, ["t1"]);
});

test("マーク: 保存が無ければ空から", () => {
  assert.deepEqual(toggleMark(undefined, "t1"), ["t1"]);
});

test("マーク: いなくなったエージェントのマークは捨てる", () => {
  assert.deepEqual(pruneMarks(["t1", "t9", "t2"], [agent("t1", "a"), agent("t2", "b")]), ["t1", "t2"]);
});

test("マーク: 捨てるものが無ければ同じ配列を返す（shared に書かないで済む）、保存が無ければ空", () => {
  const marks = ["t1"];
  assert.equal(pruneMarks(marks, [agent("t1", "a")]), marks);
  assert.deepEqual(pruneMarks(undefined, [agent("t1", "a")]), []);
});

test("カード本文の先頭: マーク済みは * 、そうでなければ空白 2 つ（crmux ui.rs mark_indicator）", () => {
  assert.equal(markPrefix(true), "* ");
  assert.equal(markPrefix(false), "  ");
});
