import test from "node:test";
import assert from "node:assert/strict";
import { placeVerticalMenu } from "../plugin/shared/menu-placement.ts";

const displayArea = { x: 120, y: 60, width: 500, height: 640 };
const place = (y, extra = {}) =>
  placeVerticalMenu({
    triggerRect: { x: 300, y: displayArea.y + y, width: 240, height: 40 },
    displayArea,
    ...extra,
  });

test("a menu opens below when its full height fits", () => {
  const menu = place(280);
  assert.equal(menu.side, "bottom");
  assert.equal(menu.top, 280 + 40 + 6);
  assert.equal(menu.height, 280);
});

test("a menu near the bottom opens fully above its trigger", () => {
  const menu = place(540);
  assert.equal(menu.side, "top");
  assert.equal(menu.top + menu.height, 540 - 6);
  assert.equal(menu.height, 280);
});

test("when neither side fits, the menu uses the larger space without clipping", () => {
  for (const y of [180, 340]) {
    const menu = place(y, { preferredHeight: 500 });
    assert.equal(menu.side, y === 180 ? "bottom" : "top");
    assert.ok(menu.height < 500);
    assert.ok(menu.top >= 8);
    assert.ok(menu.top + menu.height <= displayArea.height - 8);
    assert.ok(menu.top + menu.height <= y - 6 || menu.top >= y + 40 + 6);
  }
});

test("popup coordinates stay relative to the surface and inside horizontal bounds", () => {
  const menu = placeVerticalMenu({
    triggerRect: { x: 400, y: 260, width: 280, height: 40 },
    displayArea: { x: 120, y: 60, width: 250, height: 640 },
  });
  assert.equal(menu.width, 234);
  assert.equal(menu.left, 8);
  assert.equal(menu.top, 246);
});
