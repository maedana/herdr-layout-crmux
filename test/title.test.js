import { test } from "node:test";
import assert from "node:assert/strict";
import { previewTitle, titleColorKey, titleAddress } from "../mods/crmux-title/title.js";

test("preview title: card label and terminal title joined by ' - ' (crmux ui.rs format_title)", () => {
  assert.equal(previewTitle({ selected: false, label: "2.app/main", title: "Fix the bug" }), "2.app/main - Fix the bug");
});

test("the selected preview's title starts with '> '", () => {
  assert.equal(previewTitle({ selected: true, label: "1.app/main", title: "Fix" }), "> 1.app/main - Fix");
});

test("no ' - ' part when the terminal title is empty", () => {
  assert.equal(previewTitle({ selected: false, label: "1.app/main", title: "" }), "1.app/main");
  assert.equal(previewTitle({ selected: true, label: "1.app/main", title: null }), "> 1.app/main");
});

test("without a label yet (the list has not published it), only the terminal title", () => {
  assert.equal(previewTitle({ selected: false, label: undefined, title: "Fix" }), "Fix");
  assert.equal(previewTitle({ selected: false, label: undefined, title: "" }), "");
});

test("color follows the state like the card title: working / blocked as is, idle and done as idle", () => {
  assert.equal(titleColorKey({ status: "working", worktree: null }), "working");
  assert.equal(titleColorKey({ status: "blocked", worktree: null }), "blocked");
  assert.equal(titleColorKey({ status: "idle", worktree: null }), "idle");
  assert.equal(titleColorKey({ status: "done", worktree: null }), "idle");
});

test("a worktree agent's title is cyan (ansi6) whatever its state", () => {
  assert.equal(titleColorKey({ status: "working", worktree: "feature-x" }), "ansi6");
  assert.equal(titleColorKey({ status: "idle", worktree: "feature-x" }), "ansi6");
});

test("an exited shell (no agent status) is muted, also in a worktree", () => {
  assert.equal(titleColorKey({ status: null, worktree: null }), "muted");
  assert.equal(titleColorKey({ status: undefined, worktree: "feature-x" }), "muted");
  assert.equal(titleColorKey({ status: "exited", worktree: "feature-x" }), "muted");
});

test("address shown: the one given in props, else the list's selection, else the agent herdr focuses", () => {
  assert.equal(titleAddress({ address: "t2", selected: "t1", focusedAgent: "t3" }), "t2");
  assert.equal(titleAddress({ address: null, selected: "t1", focusedAgent: "t3" }), "t1");
  assert.equal(titleAddress({ address: undefined, selected: undefined, focusedAgent: "t3" }), "t3");
  assert.equal(titleAddress({}), null);
});
