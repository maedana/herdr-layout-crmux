import { test } from "node:test";
import assert from "node:assert/strict";
import { tabBarWindow } from "../mods/crmux-tabs/tabbar.js";

const barText = (segs) => segs.map((s) => s.text).join("");

test("tab bar: all if they fit, the selected one is [name] with selected, one space between", () => {
  const segs = tabBarWindow(["All", "Marked", "+a"], 1, 40);
  assert.equal(barText(segs), "All [Marked] +a");
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[Marked]"]);
  assert.equal(segs.some((s) => s.arrow), false);
});

const LONG = ["All", "+alpha", "+beta", "+gamma", "+delta"];

test("tab bar: if they do not fit, cut out around the selected one and show < and > at both ends", () => {
  const segs = tabBarWindow(LONG, 2, 16);
  assert.equal(barText(segs), "< ha [+beta] + >");
  assert.deepEqual(segs.filter((s) => s.arrow).map((s) => s.text), ["< ", " >"]);
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[+beta]"]);
});

test("tab bar: no left < when the first tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 0, 16)), "[All] +alpha + >");
});

test("tab bar: no right > when the last tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 4, 16)), "< a [+delta]");
});
