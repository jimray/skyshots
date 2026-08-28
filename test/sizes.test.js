import { test } from "node:test";
import assert from "node:assert/strict";

import { SIZE_PRESETS, fitCardTransform, CARD_WIDTH, OUTER_PAD } from "../public/js/render-card.js";

const square = SIZE_PRESETS.find((s) => s.id === "square");
const original = SIZE_PRESETS.find((s) => s.id === "original");

test("Original is the first size and Square is 1:1", () => {
  assert.equal(SIZE_PRESETS[0].id, "original");
  assert.equal(square.width, square.height);
});

test("Original keeps today's framing: full width, fixed padding, no scaling", () => {
  const t = fitCardTransform(840, original);
  assert.equal(t.scale, 1);
  assert.equal(t.x, OUTER_PAD);
  assert.equal(t.y, OUTER_PAD);
  assert.equal(t.width, 1200);
  assert.equal(t.height, 840 + OUTER_PAD * 2);
});

test("a card that fits the square is not scaled, and lands at the same x as Original", () => {
  const t = fitCardTransform(600, square);
  assert.equal(t.scale, 1);
  assert.equal(t.x, OUTER_PAD, "short cards should frame horizontally like Original");
  assert.equal(t.y, (1200 - 600) / 2, "and sit centered vertically");
});

test("a card taller than the square is scaled down to fit and centered", () => {
  const t = fitCardTransform(1400, square);
  const avail = 1200 - OUTER_PAD * 2;
  assert.equal(t.scale, avail / 1400);
  assert.equal(Math.round(1400 * t.scale), avail, "scaled height should fill the padded box");
  assert.equal(t.y, OUTER_PAD, "vertically centered means it lands on the padding");
  assert.equal(t.x, (1200 - CARD_WIDTH * t.scale) / 2);
});

test("the card is never scaled up past 1:1", () => {
  for (const cardHeight of [10, 100, 500, 1055, 1056]) {
    assert.equal(fitCardTransform(cardHeight, square).scale, 1, `height ${cardHeight}`);
  }
});

test("a frame wider than the card does not blow the card up to fill it", () => {
  // Nothing ships at this size yet. It is here because the square's padded
  // width happens to equal CARD_WIDTH exactly, so the square alone cannot
  // tell whether the no-upscale clamp works -- and the next size preset
  // added may well be wider than the card.
  const wide = { id: "wide", label: "Wide", width: 1920, height: 1080 };
  const t = fitCardTransform(400, wide);
  assert.equal(t.scale, 1, "a small card in a big frame should stay at 1:1");
  assert.equal(t.x, (1920 - CARD_WIDTH) / 2, "and be centered, not stretched");
});

test("the card always stays inside the square, at every height", () => {
  for (let cardHeight = 100; cardHeight <= 4000; cardHeight += 100) {
    const t = fitCardTransform(cardHeight, square);
    assert.ok(t.x >= 0, `height ${cardHeight}: x ${t.x} off the left edge`);
    assert.ok(t.y >= 0, `height ${cardHeight}: y ${t.y} off the top edge`);
    assert.ok(
      t.x + CARD_WIDTH * t.scale <= 1200 + 0.001,
      `height ${cardHeight}: card runs past the right edge`,
    );
    assert.ok(
      t.y + cardHeight * t.scale <= 1200 + 0.001,
      `height ${cardHeight}: card runs past the bottom edge`,
    );
  }
});

test("the square leaves the padding intact on the constrained axis", () => {
  const t = fitCardTransform(3000, square);
  assert.ok(t.y >= OUTER_PAD - 0.001, "a very tall card should still be inset by the padding");
});
