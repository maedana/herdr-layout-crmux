import { test } from "node:test";
import assert from "node:assert/strict";
import { formatElapsed, statusKind, shouldPulse, trackStatuses, projectName, sortByProject, cardLabel, statusIcon, cycle, pickSelected } from "../mods/crmux-list/cards.js";

test("under 60 seconds is shown as seconds, right-aligned to 2 digits", () => {
  assert.equal(formatElapsed(5), " 5s");
});

test("60 seconds to under 1 hour is minutes", () => {
  assert.equal(formatElapsed(60), " 1m");
  assert.equal(formatElapsed(3599), "59m");
});

test("1 hour or more is hours, capped at 99h", () => {
  assert.equal(formatElapsed(3600), " 1h");
  assert.equal(formatElapsed(100 * 3600), "99h");
});

test("fractions of a second are truncated, negative values are 0 seconds", () => {
  assert.equal(formatElapsed(59.9), "59s");
  assert.equal(formatElapsed(-3), " 0s");
});

test("visual state: done and idle are both idle, working and blocked stay as they are", () => {
  assert.equal(statusKind("working"), "working");
  assert.equal(statusKind("blocked"), "blocked");
  assert.equal(statusKind("done"), "idle");
  assert.equal(statusKind("idle"), "idle");
});

test("waiting for input always pulses regardless of elapsed time or work history", () => {
  assert.equal(shouldPulse("blocked", 0, false), true);
  assert.equal(shouldPulse("blocked", 1000, true), true);
});

test("an agent that has worked pulses for only 5-15 seconds after becoming idle / done", () => {
  assert.equal(shouldPulse("idle", 4, true), false);
  assert.equal(shouldPulse("idle", 5, true), true);
  assert.equal(shouldPulse("done", 15, true), true);
  assert.equal(shouldPulse("done", 16, true), false);
});

test("an agent that has not worked does not pulse even when idle", () => {
  assert.equal(shouldPulse("idle", 10, false), false);
});

test("working does not pulse", () => {
  assert.equal(shouldPulse("working", 10, true), false);
});

test("an agent seen for the first time counts from the time it was seen (seenAt), and is marked as having worked if it is working", () => {
  const r = trackStatuses({}, [
    { address: "t1", status: "working", seenAt: 1000 },
    { address: "t2", status: "idle", seenAt: 2000 },
  ], 5000);
  assert.deepEqual(r, {
    t1: { kind: "working", since: 1000, hasWorked: true },
    t2: { kind: "idle", since: 2000, hasWorked: false },
  });
});

test("count from now if there is no seenAt", () => {
  const r = trackStatuses({}, [{ address: "t1", status: "blocked", seenAt: null }], 5000);
  assert.deepEqual(r, { t1: { kind: "blocked", since: 5000, hasWorked: false } });
});

test("count again from now when the state changes, and keep the work history once it has been working", () => {
  const prev = { t1: { kind: "idle", since: 1000, hasWorked: false } };
  const working = trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 3000);
  assert.deepEqual(working, { t1: { kind: "working", since: 3000, hasWorked: true } });
  const done = trackStatuses(working, [{ address: "t1", status: "done", seenAt: 0 }], 4000);
  assert.deepEqual(done, { t1: { kind: "idle", since: 4000, hasWorked: true } });
});

test("no recount from done to idle (the same visual Idle)", () => {
  const prev = { t1: { kind: "idle", since: 1000, hasWorked: true } };
  assert.equal(trackStatuses(prev, [{ address: "t1", status: "idle", seenAt: 0 }], 9000), prev);
});

test("return the same object when nothing changed (no write to shared needed)", () => {
  const prev = { t1: { kind: "working", since: 1000, hasWorked: true } };
  assert.equal(trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 9000), prev);
});

test("remove records of agents that are gone", () => {
  const prev = { t1: { kind: "working", since: 1000, hasWorked: true }, t2: { kind: "idle", since: 1, hasWorked: false } };
  assert.deepEqual(trackStatuses(prev, [{ address: "t1", status: "working", seenAt: 0 }], 9000), {
    t1: { kind: "working", since: 1000, hasWorked: true },
  });
});

test("project name is the last element of cwd", () => {
  assert.equal(projectName("/home/me/src/crmux"), "crmux");
  assert.equal(projectName("/home/me/src/crmux/"), "crmux");
});

test("project name is an empty string when there is no cwd, and / for the root", () => {
  assert.equal(projectName(null), "");
  assert.equal(projectName("/"), "/");
});

test("sort ascending by project name, keeping the original order for the same name", () => {
  const list = [
    { address: "t1", project: "zeta" },
    { address: "t2", project: "alpha" },
    { address: "t3", project: "zeta" },
    { address: "t4", project: "beta" },
  ];
  assert.deepEqual(sortByProject(list).map((a) => a.address), ["t2", "t4", "t1", "t3"]);
});

test("sorting does not change the original array", () => {
  const list = [{ project: "b" }, { project: "a" }];
  sortByProject(list);
  assert.deepEqual(list.map((a) => a.project), ["b", "a"]);
});

test("card top: > if selected, numbers start at 1, branch follows after /", () => {
  assert.equal(cardLabel({ selected: true, index: 0, project: "crmux", branch: "main" }), "> 1.crmux/main");
  assert.equal(cardLabel({ selected: false, index: 2, project: "dotfiles", branch: null }), "3.dotfiles");
});

test("card top: no number from the 10th on (cannot be selected with keys 1-9)", () => {
  assert.equal(cardLabel({ selected: false, index: 9, project: "x", branch: "b" }), "x/b");
});

test("state icons: working ⚡, waiting for input ⚠, idle / done 💤", () => {
  assert.equal(statusIcon("working"), "⚡");
  assert.equal(statusIcon("blocked"), "⚠");
  assert.equal(statusIcon("done"), "💤");
  assert.equal(statusIcon("idle"), "💤");
});

test("selection movement wraps around at the ends", () => {
  assert.equal(cycle(0, 1, 3), 1);
  assert.equal(cycle(2, 1, 3), 0);
  assert.equal(cycle(0, -1, 3), 2);
});

test("selection movement: 0 if the list is empty", () => {
  assert.equal(cycle(0, 1, 0), 0);
});

test("how selection is decided: the remembered selection if it is in the list", () => {
  assert.equal(pickSelected(["t1", "t2"], "t2", "t1"), "t2");
});

test("how selection is decided: if there is no remembered selection, herdr's focused agent, and if none, the first", () => {
  assert.equal(pickSelected(["t1", "t2"], "t9", "t2"), "t2");
  assert.equal(pickSelected(["t1", "t2"], null, "t9"), "t1");
  assert.equal(pickSelected([], "t1", "t1"), null);
});
