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
  assert.equal(titleColorKey({ status: "exited", worktree: "feature-x" }), "muted");
});

test("status indicator like the pane header: working / blocked / done, nothing for idle or an exited shell", () => {
  assert.equal(statusIndicator("working"), "working");
  assert.equal(statusIndicator("blocked"), "blocked");
  assert.equal(statusIndicator("done"), "done");
  assert.equal(statusIndicator("idle"), null);
  assert.equal(statusIndicator("exited"), null);
  assert.equal(statusIndicator(null), null);
  assert.equal(statusIndicator(undefined), null);
});

test("address shown: the one given in props, else the list's selection, else the agent herdr focuses", () => {
  assert.equal(titleAddress({ address: "t2", selected: "t1", focusedAgent: "t3" }), "t2");
  assert.equal(titleAddress({ address: null, selected: "t1", focusedAgent: "t3" }), "t1");
  assert.equal(titleAddress({ address: undefined, selected: undefined, focusedAgent: "t3" }), "t3");
  assert.equal(titleAddress({}), null);
});
