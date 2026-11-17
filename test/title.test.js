import { test } from "node:test";
import assert from "node:assert/strict";
import { titleColorKey, statusIndicator, titleAddress } from "../mods/crmux-title/title.js";

test("name color: foreground for an ordinary agent whatever its state", () => {
  for (const status of ["working", "blocked", "done", "idle"]) {
    assert.equal(titleColorKey({ status, worktree: null }), "foreground");
  }
});

test("a worktree agent's name is cyan (ansi6) whatever its state", () => {
  assert.equal(titleColorKey({ status: "working", worktree: "feature-x" }), "ansi6");
  assert.equal(titleColorKey({ status: "idle", worktree: "feature-x" }), "ansi6");
});

test("an exited shell (no agent status) is muted, also in a worktree", () => {
  assert.equal(titleColorKey({ status: null, worktree: null }), "muted");
  assert.equal(titleColorKey({ status: undefined, worktree: "feature-x" }), "muted");
});

test("status indicator like the pane header: working / blocked / done, nothing for idle or an exited shell", () => {
  assert.equal(statusIndicator("working"), "working");
  assert.equal(statusIndicator("blocked"), "blocked");
  assert.equal(statusIndicator("done"), "done");
  assert.equal(statusIndicator("idle"), null);
  assert.equal(statusIndicator(null), null);
  assert.equal(statusIndicator(undefined), null);
});

// Single's title row is given no address: it shows the selection the list resolved and shows (crmux.shown, published by
// crmux-list), which is the agent Single's block shows
test("address shown: the one given in props (a multi-pane preview), else the selection the list shows", () => {
  assert.equal(titleAddress({ address: "t2", shown: "t1", selected: "t3", focusedAgent: "t4" }), "t2");
  assert.equal(titleAddress({ address: undefined, shown: "t1", selected: "t3", focusedAgent: "t4" }), "t1");
});

test("before the list has published what it shows: the stored selection, else the agent herdr focuses", () => {
  assert.equal(titleAddress({ selected: "t3", focusedAgent: "t4" }), "t3");
  assert.equal(titleAddress({ focusedAgent: "t4" }), "t4");
  assert.equal(titleAddress({}), null);
});

test("the list showing no selection (shown null) shows none, not a stale stored selection", () => {
  assert.equal(titleAddress({ shown: null, selected: "t3", focusedAgent: "t4" }), null);
});
