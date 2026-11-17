import { test } from "node:test";
import assert from "node:assert/strict";
import { tabParts } from "../mods/crmux-tabs/tabbar.js";

test("tab parts: one part per label, text is the label as is (no brackets)", () => {
  assert.deepEqual(tabParts(["All(4)", "Marked(1)", "+a(2)"], 1).map((p) => p.text), ["All(4)", "Marked(1)", "+a(2)"]);
});

test("tab parts: only the selected tab has selected", () => {
  assert.deepEqual(tabParts(["All(4)", "Marked(1)", "+a(2)"], 1).map((p) => p.selected), [false, true, false]);
});

test("tab parts: a part sends tab-<its position in labels>", () => {
  assert.deepEqual(tabParts(["All(4)", "Marked(1)", "+a(2)"], 1).map((p) => p.command), ["tab-0", "tab-1", "tab-2"]);
});

test("tab parts: nothing is selected when the index is out of range", () => {
  assert.deepEqual(tabParts(["All(4)", "+a(2)"], 5).map((p) => p.selected), [false, false]);
});

test("tab parts: no labels, no parts", () => {
  assert.deepEqual(tabParts([], 0), []);
});
