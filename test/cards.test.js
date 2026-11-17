import { test } from "node:test";
import assert from "node:assert/strict";
import { formatElapsed, statusKind, shouldPulse, trackStatuses, projectName, parseRepo, sortByProject, cardLabel, previewLabels, statusIcon, cycle, pickSelected, nextSelection, exitedTerminals, closable, neighbour, findNewShell } from "../mods/crmux-list/cards.js";

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

test("preview labels: each listed agent's card label without the selection mark, and its worktree, by address", () => {
  const items = [
    { address: "t1", project: "crmux", branch: "main", worktree: null },
    { address: "vps/t7", project: "app", branch: null, worktree: "wt" },
  ];
  assert.deepEqual(previewLabels(items), {
    t1: { label: "1.crmux/main", worktree: null },
    "vps/t7": { label: "2.app/wt", worktree: "wt" },
  });
  assert.deepEqual(previewLabels([]), {});
});

test("state icons: working ⚡, waiting for input ⚠, idle / done 💤", () => {
  assert.equal(statusIcon("working"), "⚡");
  assert.equal(statusIcon("blocked"), "⚠");
  assert.equal(statusIcon("done"), "💤");
  assert.equal(statusIcon("idle"), "💤");
});

test("state icon: none for a shell (its card shows no state or elapsed time: that is for agents)", () => {
  assert.equal(statusIcon("exited"), null);
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

test("exited terminals: agents (with a status) are left out", () => {
  const terms = [term("t1", { status: "idle", agent: "claude" })];
  assert.deepEqual(exitedTerminals(terms, [paneOf("t1")]), []);
});

test("exited terminals: plain shells that never ran an agent are in too (any shell can be used from crmux)", () => {
  const terms = [term("t2", { turn: 0 }), term("t3", { turn: undefined })];
  assert.deepEqual(exitedTerminals(terms, [paneOf("t2"), paneOf("t3")]).map((e) => e.address), ["t2", "t3"]);
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

test("exited terminals: kept whatever runs in front, so the card does not blink out while herdr-app catches up on the pane's program", () => {
  // Right after an agent exits, the core already reports a plain shell but the pane's program can still say "claude"
  const lagging = { ...paneOf("t2"), program: { key: "claude", shell: false, agent: true } };
  const atPrompt = { ...paneOf("t3"), program: { key: "shell", shell: true } };
  assert.deepEqual(exitedTerminals([term("t2"), term("t3")], [lagging, atPrompt]), [
    { address: "t2", pane: lagging }, { address: "t3", pane: atPrompt },
  ]);
});

test("closable: x closes an exited shell only while the shell itself is in front (not vim, a server, or an agent starting up)", () => {
  assert.equal(closable({ program: { key: "shell", shell: true } }), true);
  assert.equal(closable({ program: { key: "nvim", shell: false } }), false);
  assert.equal(closable({ program: { key: "claude", shell: false, agent: true } }), false);
  // Unknown program: allowed (as before)
  assert.equal(closable({}), true);
  assert.equal(closable(undefined), false);
});

test("leaving exited starts hasWorked over, so an agent relaunched in that shell does not pulse as just finished", () => {
  const prev = { t1: { kind: "exited", since: 1000, hasWorked: true } };
  assert.deepEqual(trackStatuses(prev, [{ address: "t1", status: "idle", seenAt: 0 }], 9000), {
    t1: { kind: "idle", since: 9000, hasWorked: false },
  });
});

// nextSelection: what a selection writes. current is what shared holds (crmux.selected / main / prev) plus herdr's focused
// agent (which resolves an unset selection, like pickSelected). It returns the new { selected, main, prev } (equal to
// current where nothing changes) and whether the selection or the main shown changed
const LIST = ["t1", "t2", "t3"];

test("a pick from the list: the address becomes selected and main, the old selection becomes prev (where t goes back to)", () => {
  assert.deepEqual(nextSelection({ selected: "t1", main: "t1", prev: "t3" }, LIST, { address: "t2", promote: true }), {
    selected: "t2", main: "t2", prev: "t1", changed: true,
  });
});

test("a pick from the list of the one already selected (clicked in place earlier) only moves it into the main slot", () => {
  assert.deepEqual(nextSelection({ selected: "t2", main: "t1", prev: "t3" }, LIST, { address: "t2", promote: true }), {
    selected: "t2", main: "t2", prev: "t3", changed: true,
  });
});

test("a preview clicked in place: selected moves, main stays where it is", () => {
  assert.deepEqual(nextSelection({ selected: "t1", main: "t3", prev: null }, LIST, { address: "t2" }), {
    selected: "t2", main: "t3", prev: "t1", changed: true,
  });
});

test("a preview clicked in place with main unset (or gone): main is pinned to the old selection so it does not follow", () => {
  assert.deepEqual(nextSelection({ selected: "t1", main: undefined, prev: undefined }, LIST, { address: "t2" }), {
    selected: "t2", main: "t1", prev: "t1", changed: true,
  });
  assert.deepEqual(nextSelection({ selected: "t1", main: "t9", prev: undefined }, LIST, { address: "t2" }).main, "t1");
});

test("remember: false (the old selection is going away) keeps prev as it was", () => {
  assert.deepEqual(nextSelection({ selected: "t1", main: "t1", prev: "t3" }, LIST, { address: "t2", promote: true, remember: false }), {
    selected: "t2", main: "t2", prev: "t3", changed: true,
  });
});

test("selecting what is already selected and shown as main changes nothing", () => {
  const current = { selected: "t2", main: "t2", prev: "t1" };
  assert.deepEqual(nextSelection(current, LIST, { address: "t2", promote: true }), { ...current, changed: false });
  assert.deepEqual(nextSelection(current, LIST, { address: "t2" }), { ...current, changed: false });
});

test("an unset selection resolves to herdr's focused agent: selecting it stores it, but nothing shown changes and prev stays", () => {
  assert.deepEqual(
    nextSelection({ selected: undefined, main: undefined, prev: undefined, focusedAgent: "t2" }, LIST, { address: "t2" }),
    { selected: "t2", main: undefined, prev: undefined, changed: false },
  );
});

// The shell n opened: herdr gives no address back, so it is found as the first shell in that space that was not there before
const shellItem = (address, extra = {}) => ({ address, status: "exited", space: "s1", ...extra });

test("new shell: the first shell in the space that was not listed when n was pressed", () => {
  const items = [shellItem("t1"), { address: "t2", status: "idle", space: "s1" }, shellItem("t3", { space: "s2" }), shellItem("t4"), shellItem("t5")];
  assert.equal(findNewShell({ space: "s1", known: ["t1"] }, items), "t4");
});

test("new shell: none yet (still starting, or only agents / other spaces are new)", () => {
  const items = [shellItem("t1"), { address: "t2", status: "working", space: "s1" }, shellItem("t3", { space: "s2" })];
  assert.equal(findNewShell({ space: "s1", known: ["t1"] }, items), null);
  assert.equal(findNewShell(null, items), null);
});
