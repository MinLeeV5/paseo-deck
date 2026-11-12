import test from "node:test";
import assert from "node:assert/strict";
import { chooseFlyoutSide } from "../plugin/shared/toolbar.ts";
const area = { x: 0, y: 0, width: 1600, height: 1000 };
const input = (x, width = 200, menuWidth = 200) => ({
  placement: "right",
  triggerRect: { x, y: 80, width, height: 28 },
  contentSize: { width: menuWidth, height: 220 },
  displayArea: area,
  offset: 8,
});
test("a submenu near the right edge opens left instead of covering its parent", () => {
  assert.equal(chooseFlyoutSide(input(1394)), "left");
});
test("a submenu with room on the right keeps the normal direction", () => {
  assert.equal(chooseFlyoutSide(input(700)), "right");
});
test("nested wide settings flyout uses its measured width", () => {
  assert.equal(chooseFlyoutSide(input(1193, 186, 380)), "left");
});
test("an oversized flyout uses the side with more available room", () => {
  assert.equal(chooseFlyoutSide(input(1200, 186, 1500)), "left");
  assert.equal(chooseFlyoutSide(input(100, 186, 1500)), "right");
});
