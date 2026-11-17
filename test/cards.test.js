import { test } from "node:test";
import assert from "node:assert/strict";
import { formatElapsed, statusKind, shouldPulse, trackStatuses, projectName, parseRepo, sortByProject, cardLabel, statusIcon, cycle, pickSelected, exitedTerminals, neighbour } from "../mods/crmux-list/cards.js";

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

test("visual state: exited (an agent's shell after the agent ended) stays exited", () => {
  assert.equal(statusKind("exited"), "exited");
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

test("exited does not pulse even right after a working period", () => {
  assert.equal(shouldPulse("exited", 10, true), false);
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

test("count again from now when an agent becomes exited (time since it exited)", () => {
  const prev = { t1: { kind: "idle", since: 1000, hasWorked: true } };
  assert.deepEqual(trackStatuses(prev, [{ address: "t1", status: "exited", seenAt: 0 }], 9000), {
    t1: { kind: "exited", since: 9000, hasWorked: true },
  });
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

test("parseRepo: a normal repository gives the repo name and no worktree", () => {
  const out = "/x/dotfiles/.git\n/x/dotfiles/.git\n/x/dotfiles\n";
  assert.deepEqual(parseRepo(out), { project: "dotfiles", worktree: null });
});

test("parseRepo: a worktree is grouped under the original repo and keeps the worktree directory name", () => {
  const out = [
    "/home/maedana/src/github.com/SonicGarden/ga-pms/.git",
    "/home/maedana/src/github.com/SonicGarden/ga-pms/.git/worktrees/pii-one-year-limit",
    "/home/maedana/src/github.com/SonicGarden/ga-pms/.claude/worktrees/pii-one-year-limit",
  ].join("\n");
  assert.deepEqual(parseRepo(out), { project: "ga-pms", worktree: "pii-one-year-limit" });
});

test("parseRepo: a common dir not ending in .git (bare) uses its basename without a trailing .git", () => {
  assert.deepEqual(parseRepo("/srv/repos/foo.git\n/srv/repos/foo.git\n/srv/work/foo\n"), { project: "foo", worktree: null });
  assert.deepEqual(parseRepo("/srv/repos/bar\n/srv/repos/bar\n/srv/work/bar\n"), { project: "bar", worktree: null });
});

test("parseRepo: a bare repository in repo/.bare (worktrees beside it) uses the folder holding it", () => {
  const out = "/x/myrepo/.bare\n/x/myrepo/.bare/worktrees/feat\n/x/myrepo/feat\n";
  assert.deepEqual(parseRepo(out), { project: "myrepo", worktree: "feat" });
});

test("parseRepo: null unless all three lines are absolute paths (old git echoes --path-format back)", () => {
  assert.equal(parseRepo("--path-format=absolute\n.git\n.git\n/x/foo\n"), null);
});

test("parseRepo: null when lines are missing or empty", () => {
  assert.equal(parseRepo(""), null);
  assert.equal(parseRepo("/x/a/.git\n/x/a/.git\n"), null);
  assert.equal(parseRepo("/x/a/.git\n/x/a/.git"), null);
  assert.equal(parseRepo("\n\n\n"), null);
  assert.equal(parseRepo(null), null);
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

test("card top: with no branch, a worktree is shown as /worktree (crmux format_title)", () => {
  assert.equal(cardLabel({ selected: false, index: 0, project: "ga-pms", branch: null, worktree: "wt" }), "1.ga-pms/wt");
  assert.equal(cardLabel({ selected: false, index: 0, project: "ga-pms", branch: "feat", worktree: "wt" }), "1.ga-pms/feat");
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

test("state icon: exited ⏹", () => {
  assert.equal(statusIcon("exited"), "⏹");
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

// terminals() as hc ls --json gives them (status is a plain word, null for a plain shell)
const term = (address, extra = {}) => ({ address, agent: "zsh", status: null, turn: 2, state: "live", ...extra });
const paneOf = (terminal, pane = `p-${terminal}`) => ({ pane, terminal, tab: "tab1", title: "zsh", cwd: "/w", branch: "main" });

test("exited terminals: a live shell with no status that has had a turn and is shown in a pane, with that pane", () => {
  const p = paneOf("t2");
  assert.deepEqual(exitedTerminals([term("t2")], [paneOf("t1"), p]), [{ address: "t2", pane: p }]);
});

test("exited terminals: agents (with a status) and plain shells that never had a turn are left out", () => {
  const terms = [term("t1", { status: "idle", agent: "claude" }), term("t2", { turn: 0 }), term("t3", { turn: undefined })];
  assert.deepEqual(exitedTerminals(terms, [paneOf("t1"), paneOf("t2"), paneOf("t3")]), []);
});

test("exited terminals: terminals that are not live or have no pane (e.g. parked) are left out", () => {
  const terms = [term("t1", { state: "exited" }), term("t2")];
  assert.deepEqual(exitedTerminals(terms, [paneOf("t1"), { pane: "m1", terminal: null, mod: "x", tab: "tab1" }]), []);
});

test("exited terminals: in terminals() order", () => {
  const terms = [term("t3"), term("t1")];
  const panes = [paneOf("t1"), paneOf("t3")];
  assert.deepEqual(exitedTerminals(terms, panes).map((e) => e.address), ["t3", "t1"]);
});

test("exited terminals: nothing when terminals() or panes() is empty or missing", () => {
  assert.deepEqual(exitedTerminals([], []), []);
  assert.deepEqual(exitedTerminals(undefined, undefined), []);
});

test("selection after closing: the next one in the list, else the previous one, else none", () => {
  assert.equal(neighbour(["t1", "t2", "t3"], "t2"), "t3");
  assert.equal(neighbour(["t1", "t2", "t3"], "t3"), "t2");
  assert.equal(neighbour(["t1"], "t1"), null);
  assert.equal(neighbour(["t1", "t2"], "t9"), null);
});

test("exited terminals: left out while the shell runs something in front (vim, a server, an agent starting up)", () => {
  const busy = { ...paneOf("t2"), program: { key: "nvim", shell: false } };
  const atPrompt = { ...paneOf("t3"), program: { key: "shell", shell: true } };
  assert.deepEqual(exitedTerminals([term("t2"), term("t3")], [busy, atPrompt]), [{ address: "t3", pane: atPrompt }]);
});

test("leaving exited starts hasWorked over, so an agent relaunched in that shell does not pulse as just finished", () => {
  const prev = { t1: { kind: "exited", since: 1000, hasWorked: true } };
  assert.deepEqual(trackStatuses(prev, [{ address: "t1", status: "idle", seenAt: 0 }], 9000), {
    t1: { kind: "idle", since: 9000, hasWorked: false },
  });
});
