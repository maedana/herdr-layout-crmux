import { test } from "node:test";
import assert from "node:assert/strict";
import { footerParts } from "../mods/crmux-footer/footer.js";

const text = (parts) => parts.map((p) => p.text).join("");

test("Normal: app name and key hints (including h/l tab switching, Space for marks, n for a new shell and x to close a shell), v shows the next arrangement", () => {
  assert.equal(text(footerParts("normal", "Single")),
    "crmux | hjkl/1-9/t:Nav C-u:ScrollUp Space:Mark n:Shell x:Close(shell) v:Single i:Insert q:Main");
});

test("Insert: -- INSERT -- in bold, showing that Esc goes back", () => {
  const parts = footerParts("insert", "Grid");
  assert.equal(text(parts), "-- INSERT -- | Typing goes to the agent. Esc:Back");
  assert.deepEqual(parts[0], { text: "-- INSERT --", bold: true });
});

test("Scroll: -- SCROLL -- in bold with the scroll keys (crmux footer_spans InputMode::Scroll)", () => {
  const parts = footerParts("scroll", "Grid");
  assert.equal(text(parts), "-- SCROLL -- | j/k:Line C-u/C-d:HalfPage gg:Top G:Bottom i:Insert Esc:Back");
  assert.deepEqual(parts[0], { text: "-- SCROLL --", bold: true });
});

test("show as Normal when the mode is unknown", () => {
  assert.equal(text(footerParts(undefined, "MainV")), text(footerParts("normal", "MainV")));
});

test("Normal on a tab with its own order: R to drop it is shown", () => {
  assert.equal(text(footerParts("normal", "Single", true)),
    "crmux | hjkl/1-9/t:Nav C-u:ScrollUp Space:Mark n:Shell x:Close(shell) v:Single i:Insert q:Main R:Unpin");
});
