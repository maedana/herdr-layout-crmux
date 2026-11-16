import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabTitle, tabBarWindow, toggleMark, pruneMarks, markPrefix } from "../mods/crmux-list/tabs.js";

// Agents in the list (part of the shape of items() in main.js)
const agent = (address, project, space = "s1", spaceName = "main", spaceIndex = 1) =>
  ({ address, project, space, spaceName, spaceIndex });

test("tabs: All and a +project per project (ascending, no duplicates)", () => {
  const tabs = buildTabs([agent("t1", "zeta"), agent("t2", "alpha"), agent("t3", "zeta")], []);
  assert.deepEqual(tabs, [
    { kind: "all" },
    { kind: "project", value: "alpha" },
    { kind: "project", value: "zeta" },
  ]);
});

test("tabs: if a present agent has a mark, Marked comes right after All", () => {
  const list = [agent("t1", "a"), agent("t2", "b")];
  assert.deepEqual(buildTabs(list, ["t2"]).map((t) => t.kind), ["all", "marked", "project", "project"]);
});

test("tabs: Marked is not shown if only agents that are gone have marks", () => {
  assert.deepEqual(buildTabs([agent("t1", "a")], ["t9"]).map((t) => t.kind), ["all", "project"]);
});

test("tabs: with 2 or more spaces that have agents, @space comes in space order between Marked and +project", () => {
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

test("tabs: with only 1 space, @space is not shown", () => {
  const list = [agent("t1", "a", "s1"), agent("t2", "b", "s1")];
  assert.equal(buildTabs(list, []).some((t) => t.kind === "space"), false);
});

const addrs = (list) => list.map((a) => a.address);
const LIST = [agent("t1", "a", "s1"), agent("t2", "b", "s2"), agent("t3", "a", "s2")];

test("filter: All is everything, Marked is the marked ones, @space is that space, +project is that project (order unchanged)", () => {
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "all" }, [])), ["t1", "t2", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "marked" }, ["t3", "t1"])), ["t1", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "space", value: "s2", name: "x" }, [])), ["t2", "t3"]);
  assert.deepEqual(addrs(filterByTab(LIST, { kind: "project", value: "a" }, [])), ["t1", "t3"]);
});

const TABS = [{ kind: "all" }, { kind: "marked" }, { kind: "project", value: "a" }, { kind: "project", value: "b" }];

test("current tab: position of the tab matching the saved kind and value", () => {
  assert.equal(tabIndex(TABS, { kind: "project", value: "b" }), 3);
  assert.equal(tabIndex(TABS, { kind: "marked" }), 1);
});

test("current tab: All (0) if nothing is saved or the tab is gone", () => {
  assert.equal(tabIndex(TABS, null), 0);
  assert.equal(tabIndex(TABS, { kind: "project", value: "gone" }), 0);
  assert.equal(tabIndex(TABS, { kind: "space", value: "s1" }), 0);
});

test("tab switching: next / previous, wrapping around at the ends", () => {
  assert.deepEqual(cycleTab(TABS, { kind: "all" }, 1), { kind: "marked" });
  assert.deepEqual(cycleTab(TABS, { kind: "project", value: "b" }, 1), { kind: "all" });
  assert.deepEqual(cycleTab(TABS, { kind: "all" }, -1), { kind: "project", value: "b" });
});

test("tab switching: if the current tab is gone, count from All", () => {
  assert.deepEqual(cycleTab(TABS, { kind: "project", value: "gone" }, 1), { kind: "marked" });
});

test("selection after tab switch: keep the same agent if it is in the new tab, otherwise the first, null if empty", () => {
  assert.equal(keepSelection(["t1", "t3"], "t3"), "t3");
  assert.equal(keepSelection(["t1", "t3"], "t2"), "t1");
  assert.equal(keepSelection([], "t2"), null);
});

test("tab labels: All / Marked / @space / +project", () => {
  assert.equal(tabLabel({ kind: "all" }), "All");
  assert.equal(tabLabel({ kind: "marked" }), "Marked");
  assert.equal(tabLabel({ kind: "space", value: "s1", name: "work" }), "@work");
  assert.equal(tabLabel({ kind: "project", value: "crmux" }), "+crmux");
});

test("list heading (crmux frame title): tab and count", () => {
  assert.equal(tabTitle({ kind: "all" }, 4), "All Sessions (4)");
  assert.equal(tabTitle({ kind: "marked" }, 2), "Marked (2)");
  assert.equal(tabTitle({ kind: "space", value: "s1", name: "work" }, 3), "Workspace @work (3)");
  assert.equal(tabTitle({ kind: "project", value: "crmux" }, 1), "Project crmux (1)");
});

const barText = (segs) => segs.map((s) => s.text).join("");

test("tab bar: all if they fit, the selected one is [name] with selected, one space between", () => {
  const segs = tabBarWindow(["All", "Marked", "+a"], 1, 40);
  assert.equal(barText(segs), "All [Marked] +a");
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[Marked]"]);
  assert.equal(segs.some((s) => s.arrow), false);
});

const LONG = ["All", "+alpha", "+beta", "+gamma", "+delta"];

test("tab bar: if they do not fit, cut out around the selected one and show < and > at both ends", () => {
  const segs = tabBarWindow(LONG, 2, 16);
  assert.equal(barText(segs), "< ha [+beta] + >");
  assert.deepEqual(segs.filter((s) => s.arrow).map((s) => s.text), ["< ", " >"]);
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[+beta]"]);
});

test("tab bar: no left < when the first tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 0, 16)), "[All] +alpha + >");
});

test("tab bar: no right > when the last tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 4, 16)), "< a [+delta]");
});

test("marks: add if absent, remove if present (the original array is not changed)", () => {
  const marks = ["t1"];
  assert.deepEqual(toggleMark(marks, "t2"), ["t1", "t2"]);
  assert.deepEqual(toggleMark(marks, "t1"), []);
  assert.deepEqual(marks, ["t1"]);
});

test("marks: start from empty if nothing is saved", () => {
  assert.deepEqual(toggleMark(undefined, "t1"), ["t1"]);
});

test("marks: drop marks of agents that are gone", () => {
  assert.deepEqual(pruneMarks(["t1", "t9", "t2"], [agent("t1", "a"), agent("t2", "b")]), ["t1", "t2"]);
});

test("marks: return the same array if there is nothing to drop (no write to shared needed), empty if nothing is saved", () => {
  const marks = ["t1"];
  assert.equal(pruneMarks(marks, [agent("t1", "a")]), marks);
  assert.deepEqual(pruneMarks(undefined, [agent("t1", "a")]), []);
});

test("start of the card body: * if marked, otherwise 2 spaces (crmux ui.rs mark_indicator)", () => {
  assert.equal(markPrefix(true), "* ");
  assert.equal(markPrefix(false), "  ");
});
