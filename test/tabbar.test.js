import { test } from "node:test";
import assert from "node:assert/strict";
import { tabBarWindow } from "../mods/crmux-tabs/tabbar.js";

const barText = (segs) => segs.map((s) => s.text).join("");
// < and > are the parts that step to the neighbouring tab
const isArrow = (s) => s.arrow !== undefined;

test("tab bar: all if they fit, the selected one is [name] with selected, one space between", () => {
  const segs = tabBarWindow(["All", "Marked", "+a"], 1, 40);
  assert.equal(barText(segs), "All [Marked] +a");
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[Marked]"]);
  assert.equal(segs.some(isArrow), false);
});

const LONG = ["All", "+alpha", "+beta", "+gamma", "+delta"];

test("tab bar: if they do not fit, cut out around the selected one and show < and > at both ends", () => {
  const segs = tabBarWindow(LONG, 2, 16);
  assert.equal(barText(segs), "< ha [+beta] + >");
  assert.deepEqual(segs.filter(isArrow).map((s) => s.text), ["< ", " >"]);
  assert.deepEqual(segs.filter((s) => s.selected).map((s) => s.text), ["[+beta]"]);
});

test("tab bar: no left < when the first tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 0, 16)), "[All] +alpha + >");
});

test("tab bar: no right > when the last tab is selected", () => {
  assert.equal(barText(tabBarWindow(LONG, 4, 16)), "< a [+delta]");
});

// The crmux-list command each clickable part sends (separators send none)
const commands = (segs) => segs.map((s) => [s.text, s.command ?? null]);

test("tab bar: a tab part sends tab-<its position in labels>, separators send nothing", () => {
  assert.deepEqual(commands(tabBarWindow(["All", "Marked", "+a"], 1, 40)), [
    ["All", "tab-0"], [" ", null], ["[Marked]", "tab-1"], [" ", null], ["+a", "tab-2"],
  ]);
});

test("tab bar: when cut, a partly visible tab still sends its own position, and < / > send the neighbouring tab's position", () => {
  assert.deepEqual(commands(tabBarWindow(LONG, 2, 16)), [
    ["< ", "tab-1"], ["ha", "tab-1"], [" ", null], ["[+beta]", "tab-2"], [" ", null], ["+", "tab-3"], [" >", "tab-3"],
  ]);
  assert.deepEqual(tabBarWindow(LONG, 2, 16).filter(isArrow).map((s) => s.arrow), ["prev", "next"]);
});

test("tab bar: < / > send the tab just before / after the selected one", () => {
  assert.deepEqual(commands(tabBarWindow(LONG, 4, 16)).filter(([t]) => t === "< "), [["< ", "tab-3"]]);
  assert.deepEqual(commands(tabBarWindow(LONG, 0, 16)).filter(([t]) => t === " >"), [[" >", "tab-1"]]);
});
