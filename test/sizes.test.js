import { test } from "node:test";
import assert from "node:assert/strict";

import { SIZE_PRESETS, fitCardTransform, CARD_WIDTH, OUTER_PAD } from "../public/js/render-card.js";

const square = SIZE_PRESETS.find((s) => s.id === "square");
const original = SIZE_PRESETS.find((s) => s.id === "original");
const wide = SIZE_PRESETS.find((s) => s.id === "wide");

test("the three sizes are Original, Square and 16:9, in that order", () => {
  assert.deepEqual(SIZE_PRESETS.map((s) => s.id), ["original", "square", "wide"]);
  assert.equal(square.width, square.height, "Square should be 1:1");
  assert.ok(
    Math.abs(wide.width / wide.height - 16 / 9) < 1e-9,
    `16:9 preset is ${wide.width}x${wide.height}, ratio ${wide.width / wide.height}`,
  );
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

test("the 16:9 frame is wider than the card and must not blow it up", () => {
  // The square's padded width happens to equal CARD_WIDTH exactly, so the
  // square alone cannot tell whether the no-upscale clamp works. 16:9 is
  // genuinely wider than the card, so it can.
  const t = fitCardTransform(400, wide);
  assert.equal(t.scale, 1, "a small card in a big frame should stay at 1:1");
  assert.equal(t.x, (wide.width - CARD_WIDTH) / 2, "and be centered, not stretched");
});

test("a card too tall for the 16:9 frame scales down to fit it", () => {
  const t = fitCardTransform(1500, wide);
  const availH = wide.height - OUTER_PAD * 2;
  assert.equal(t.scale, availH / 1500);
  assert.ok(t.y >= OUTER_PAD - 1e-9, "should keep its padding");
  assert.ok(t.x + CARD_WIDTH * t.scale <= wide.width + 1e-9, "should stay inside the frame");
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
