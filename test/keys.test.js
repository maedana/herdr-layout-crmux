import { test } from "node:test";
import assert from "node:assert/strict";
import { normalKey, scrollKey, scrollStep, scrollView } from "../mods/crmux-list/keys.js";

const plain = { control: false, shift: false };
const ctrl = { control: true, shift: false };
const shift = { control: false, shift: true };

test("Normal: j/k move the selection, C-u/C-d scroll the preview by half a page", () => {
  assert.equal(normalKey("j", plain, false), "down");
  assert.equal(normalKey("k", plain, false), "up");
  assert.equal(normalKey("u", ctrl, false), "scroll-up");
  assert.equal(normalKey("d", ctrl, false), "scroll-down");
});

test("Normal: 1-9 select by number, gg goes to the top, G to the bottom", () => {
  assert.equal(normalKey("3", plain, false), "select-3");
  assert.equal(normalKey("g", plain, true), "top");
  assert.equal(normalKey("G", plain, false), "bottom");
  assert.equal(normalKey("g", shift, false), "bottom");
});

test("Normal: unknown keys and other shifted keys do nothing", () => {
  assert.equal(normalKey("x", plain, false), null);
  assert.equal(normalKey("j", shift, false), null);
  assert.equal(normalKey("x", ctrl, false), null);
});

test("Scroll: j/k scroll the preview by one line instead of moving the selection (crmux handle_scroll_mode)", () => {
  assert.equal(scrollKey("j", plain, false), "line-down");
  assert.equal(scrollKey("down", plain, false), "line-down");
  assert.equal(scrollKey("k", plain, false), "line-up");
  assert.equal(scrollKey("up", plain, false), "line-up");
});

test("Scroll: C-u/C-d half page, gg top, G bottom, Esc back, i Insert", () => {
  assert.equal(scrollKey("u", ctrl, false), "scroll-up");
  assert.equal(scrollKey("d", ctrl, false), "scroll-down");
  assert.equal(scrollKey("g", plain, true), "top");
  assert.equal(scrollKey("G", plain, false), "bottom");
  assert.equal(scrollKey("escape", plain, false), "esc");
  assert.equal(scrollKey("i", plain, false), "insert");
});

test("Scroll: selection, tab, mark and arrangement keys are ignored", () => {
  for (const k of ["h", "l", "t", "v", "q", "space", "1"]) assert.equal(scrollKey(k, plain, false), null, k);
});

// Like crmux's preview_scroll, count how many lines the preview is scrolled up (0 = at the bottom)
const view = { page: 40, max: 1000 };

test("C-u scrolls up half a page and k one line, counting the lines", () => {
  assert.deepEqual(scrollStep("scroll-up", 0, view), { up: 20, args: { lines: -20 } });
  assert.deepEqual(scrollStep("line-up", 20, view), { up: 21, args: { lines: -1 } });
});

test("j / C-d scroll down by a line / half a page while still above the bottom", () => {
  assert.deepEqual(scrollStep("line-down", 21, view), { up: 20, args: { lines: 1 } });
  assert.deepEqual(scrollStep("scroll-down", 30, view), { up: 10, args: { lines: 20 } });
});

test("reaching the bottom sends to: bottom so the view lands exactly at the end", () => {
  assert.deepEqual(scrollStep("line-down", 1, view), { up: 0, args: { to: "bottom" } });
  assert.deepEqual(scrollStep("scroll-down", 5, view), { up: 0, args: { to: "bottom" } });
  assert.deepEqual(scrollStep("scroll-down", 0, view), { up: 0, args: { to: "bottom" } });
});

test("gg goes to the top of the history and G to the bottom", () => {
  assert.deepEqual(scrollStep("top", 3, view), { up: 1000, args: { to: "top" } });
  assert.deepEqual(scrollStep("bottom", 300, view), { up: 0, args: { to: "bottom" } });
});

test("scrolling up stops counting at the top of the history", () => {
  assert.deepEqual(scrollStep("scroll-up", 990, view), { up: 1000, args: { lines: -20 } });
  assert.deepEqual(scrollStep("line-up", 1000, view), { up: 1000, args: { lines: -1 } });
});

test("no history (alternate screen) never leaves the bottom", () => {
  assert.equal(scrollStep("scroll-up", 0, { page: 40, max: 0 }).up, 0);
  assert.equal(scrollStep("top", 0, { page: 40, max: 0 }).up, 0);
});

test("view: page is the terminal's rows and max the history above one page; defaults without scroll info", () => {
  const panes = [
    { pane: "p1", scroll: { total: 4742, offset: 4663, len: 79, from_bottom: 0 } },
    { pane: "p2", scroll: null },
  ];
  assert.deepEqual(scrollView(panes, "p1"), { page: 79, max: 4663 });
  assert.deepEqual(scrollView(panes, "p2"), { page: 40, max: 0 });
  assert.deepEqual(scrollView(panes, "missing"), { page: 40, max: 0 });
});
