import { test } from "node:test";
import assert from "node:assert/strict";
import { hintLabels, buildHints, hintKey, shownPreviews } from "../mods/crmux-list/hints.js";

// f in Normal: vimium-style labels on every card, preview and tab; typing one jumps there

test("labels: one letter each, the easiest keys first (home row, then the top row, then the bottom row)", () => {
  assert.deepEqual(hintLabels(5), ["a", "s", "d", "f", "g"]);
  assert.equal(hintLabels(26).length, 26);
  assert.equal(new Set(hintLabels(26)).size, 26);
  assert.equal(hintLabels(26)[25], "m");
});

test("labels: more than 26 targets switch every label to two letters (no label is a prefix of another)", () => {
  const labels = hintLabels(30);
  assert.equal(labels.length, 30);
  assert.ok(labels.every((l) => l.length === 2));
  assert.deepEqual(labels.slice(0, 3), ["aa", "as", "ad"]);
  assert.equal(new Set(labels).size, 30);
});

test("labels: past 26 * 26 every label grows to three letters (as many letters as it takes, all the same length)", () => {
  assert.ok(hintLabels(676).every((l) => l.length === 2));
  const labels = hintLabels(700);
  assert.equal(labels.length, 700);
  assert.ok(labels.every((l) => l.length === 3));
  assert.equal(labels[0], "aaa");
  assert.equal(new Set(labels).size, 700);
});

test("labels: none for no targets", () => {
  assert.deepEqual(hintLabels(0), []);
});

test("hints: cards first, then previews, then tabs, each keyed for the mod that draws it", () => {
  const h = buildHints({ cards: ["t1", "t2"], previews: ["t2"], tabs: 2 });
  assert.deepEqual(h.cards, { t1: "a", t2: "s" });
  assert.deepEqual(h.previews, { t2: "d" });
  assert.deepEqual(h.tabs, { 0: "f", 1: "g" });
  assert.deepEqual(h.targets, [
    { kind: "card", key: "t1", label: "a" }, { kind: "card", key: "t2", label: "s" },
    { kind: "preview", key: "t2", label: "d" },
    { kind: "tab", key: 0, label: "f" }, { kind: "tab", key: 1, label: "g" },
  ]);
  assert.equal(h.typed, "");
});

test("key: a full label picks its target", () => {
  const { targets } = buildHints({ cards: ["t1", "t2"], previews: [], tabs: 0 });
  assert.deepEqual(hintKey(targets, "", "s"), { target: { kind: "card", key: "t2", label: "s" } });
});

test("key: the first letter of two-letter labels waits for the second", () => {
  const targets = [{ kind: "card", key: "t1", label: "aa" }, { kind: "card", key: "t2", label: "as" }];
  assert.deepEqual(hintKey(targets, "", "a"), { typed: "a" });
  assert.deepEqual(hintKey(targets, "a", "s"), { target: targets[1] });
});

test("key: a key that matches no label cancels", () => {
  const targets = [{ kind: "card", key: "t1", label: "a" }];
  assert.deepEqual(hintKey(targets, "", "z"), { cancel: true });
  assert.deepEqual(hintKey(targets, "", "escape"), { cancel: true });
});

test("shown previews: every listed one in a multi-pane arrangement, only the selection in Single (or with one)", () => {
  assert.deepEqual(shownPreviews("MainV", ["t1", "t2"], "t2"), ["t1", "t2"]);
  assert.deepEqual(shownPreviews("Single", ["t1", "t2"], "t2"), ["t2"]);
  assert.deepEqual(shownPreviews("Grid", ["t1"], "t1"), ["t1"]);
  assert.deepEqual(shownPreviews("Single", [], null), []);
});
