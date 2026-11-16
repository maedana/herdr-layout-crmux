import { test } from "node:test";
import assert from "node:assert/strict";
import { footerParts } from "../mods/crmux-footer/footer.js";

const text = (parts) => parts.map((p) => p.text).join("");

test("Normal: アプリ名とキーヒント、v には次の並べ方", () => {
  assert.equal(text(footerParts("normal", "Single")),
    "crmux | j/k/1-9/t:Nav C-u:ScrollUp v:Single i:Insert q:Main");
});

test("Insert: -- INSERT -- を太字で、Esc で戻ることを示す", () => {
  const parts = footerParts("insert", "Grid");
  assert.equal(text(parts), "-- INSERT -- | Typing goes to the agent. Esc:Back");
  assert.deepEqual(parts[0], { text: "-- INSERT --", bold: true });
});

test("モードが分からなければ Normal として表示", () => {
  assert.equal(text(footerParts(undefined, "MainV")), text(footerParts("normal", "MainV")));
});
