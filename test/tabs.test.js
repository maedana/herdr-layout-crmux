import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTabs, filterByTab, tabIndex, cycleTab, keepSelection, tabLabel, tabBarLabels, toggleMark, pruneMarks, markPrefix, tabKey, applyOrder, swapInOrder, pruneOrders } from "../mods/crmux-list/tabs.js";

// Agents in the list (part of the shape of items() in main.js)
const agent = (address, project, space = "s1", spaceName = "main", spaceIndex = 1) =>
  ({ address, project, space, spaceName, spaceIndex });

test("tabs: All, Agents (always, so ctrl-t 2 stays put) and a +project per project (ascending, no duplicates)", () => {
  const tabs = buildTabs([agent("t1", "zeta"), agent("t2", "alpha"), agent("t3", "zeta")], []);
  assert.deepEqual(tabs, [
    { kind: "all" },
    { kind: "agents" },
    { kind: "project", value: "alpha" },
    { kind: "project", value: "zeta" },
  ]);
});

test("tabs: if a present agent has a mark, Marked comes right after All and Agents", () => {
  const list = [agent("t1", "a"), agent("t2", "b")];
  assert.deepEqual(buildTabs(list, ["t2"]).map((t) => t.kind), ["all", "agents", "marked", "project", "project"]);
});

test("tabs: Marked is not shown if only agents that are gone have marks", () => {
  assert.deepEqual(buildTabs([agent("t1", "a")], ["t9"]).map((t) => t.kind), ["all", "agents", "project"]);
});

test("tabs: with 2 or more spaces that have agents, @space comes in space order between Marked and +project", () => {
  const list = [agent("t1", "a", "s2", "work", 2), agent("t2", "b", "s1", "home", 1), agent("t3", "c", "s2", "work", 2)];
  assert.deepEqual(buildTabs(list, ["t1"]), [
    { kind: "all" },
    { kind: "agents" },
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

test("filter: Agents leaves the plain shells out", () => {
  const list = [agent("t1", "a"), { ...agent("t2", "a"), status: "exited" }, { ...agent("t3", "b"), status: "working" }];
  assert.deepEqual(addrs(filterByTab(list, { kind: "agents" }, [])), ["t1", "t3"]);
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
  assert.equal(tabLabel({ kind: "agents" }), "Agents");
  assert.equal(tabLabel({ kind: "space", value: "s1", name: "work" }), "@work");
  assert.equal(tabLabel({ kind: "project", value: "crmux" }), "+crmux");
});

test("tab labels with a count: name(N)", () => {
  assert.equal(tabLabel({ kind: "all" }, 4), "All(4)");
  assert.equal(tabLabel({ kind: "marked" }, 2), "Marked(2)");
  assert.equal(tabLabel({ kind: "space", value: "s1", name: "work" }, 3), "@work(3)");
  assert.equal(tabLabel({ kind: "project", value: "crmux" }, 0), "+crmux(0)");
});

test("tabBarLabels: each tab with the number of agents it shows", () => {
  const agents = [agent("t1", "crmux", "s1", "home", 1), agent("t2", "dotfiles", "s1", "home", 1), agent("t3", "crmux", "s2", "work", 2)];
  const tabs = buildTabs(agents, ["t2"]);
  assert.deepEqual(tabBarLabels(tabs, agents, ["t2"]), ["All(3)", "Agents(3)", "Marked(1)", "@home(2)", "@work(1)", "+crmux(2)", "+dotfiles(1)"]);
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

// --- A tab's own order (alt-shift-h/j/k/l swaps previews; shared("crmux.orders"): { [tabKey]: [addresses] }) ---

test("tab key: one per tab, stable across renders (the space by its id, the project by its name)", () => {
  assert.equal(tabKey({ kind: "all" }), "all");
  assert.equal(tabKey({ kind: "marked" }), "marked");
  assert.equal(tabKey({ kind: "agents" }), "agents");
  assert.equal(tabKey({ kind: "space", value: "s1", name: "work" }), "space:s1");
  assert.equal(tabKey({ kind: "project", value: "todotxt" }), "project:todotxt");
});

test("order: the saved ones first in the saved order, newcomers after them in the list's order", () => {
  const items = [agent("t1", "p"), agent("t2", "p"), agent("t3", "p"), agent("t4", "p")];
  assert.deepEqual(applyOrder(items, ["t3", "t1"]).map((a) => a.address), ["t3", "t1", "t2", "t4"]);
});

test("order: none saved keeps the list as it is; saved addresses not in the list are skipped", () => {
  const items = [agent("t1", "p"), agent("t2", "p")];
  assert.equal(applyOrder(items, undefined), items);
  assert.deepEqual(applyOrder(items, ["t9", "t2"]).map((a) => a.address), ["t2", "t1"]);
});

test("swap: the two trade places in the shown order", () => {
  assert.deepEqual(swapInOrder(["t2", "t1", "t3"], "t1", "t3"), ["t2", "t3", "t1"]);
});

test("orders: gone terminals are dropped, a tab left with none loses its order, the same object back if unchanged", () => {
  const items = [agent("t1", "p"), agent("t3", "p")];
  const orders = { "project:p": ["t3", "t2", "t1"], "project:q": ["t2"] };
  assert.deepEqual(pruneOrders(orders, items), { "project:p": ["t3", "t1"] });
  const kept = { "project:p": ["t3", "t1"] };
  assert.equal(pruneOrders(kept, items), kept);
  assert.deepEqual(pruneOrders(undefined, items), {});
});

test("tab bar: a tab with its own order carries a pin", () => {
  const tabs = [{ kind: "all" }, { kind: "project", value: "p" }];
  const agents = [agent("t1", "p"), agent("t2", "p")];
  assert.deepEqual(tabBarLabels(tabs, agents, [], { "project:p": ["t2", "t1"] }), ["All(2)", "+p(2)📌"]);
  assert.deepEqual(tabBarLabels(tabs, agents, []), ["All(2)", "+p(2)"]);
});
