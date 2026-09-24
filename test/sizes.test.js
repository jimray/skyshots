import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SIZE_PRESETS,
  fitCardTransform,
  cardBox,
  CARD_WIDTH,
  ORIGINAL_CARD_WIDTH,
  OUTER_PAD,
} from "../public/js/render-card.js";

const square = SIZE_PRESETS.find((s) => s.id === "square");
const original = SIZE_PRESETS.find((s) => s.id === "original");
const tall = SIZE_PRESETS.find((s) => s.id === "tall");

test("the three sizes are 9:16, Original and Square, in that order", () => {
  assert.deepEqual(SIZE_PRESETS.map((s) => s.id), ["tall", "original", "square"]);
  assert.equal(square.width, square.height, "Square should be 1:1");
  assert.ok(
    Math.abs(tall.width / tall.height - 9 / 16) < 1e-9,
    `9:16 preset is ${tall.width}x${tall.height}, ratio ${tall.width / tall.height}`,
  );
  assert.ok(tall.height > tall.width, "9:16 is portrait, not landscape");
});

test("9:16 is the default: every card opens on the first preset", () => {
  assert.equal(SIZE_PRESETS[0].id, "tall", "post-result-card and drawPreparedCard both default to SIZE_PRESETS[0]");
});

test("Original outputs 1200 wide whatever width its card was laid out at", () => {
  const t = fitCardTransform(840, original, ORIGINAL_CARD_WIDTH);
  assert.equal(t.width, 1200, "the output width is fixed even though the card is not");
  assert.equal(t.x, OUTER_PAD);
  assert.equal(t.y, OUTER_PAD);
});

test("Original scales its card up to the full card width, so its type is not the runt", () => {
  // It used to draw at 1:1, which made it the only size showing type at its
  // literal size while the others were enlarged to fit their frames.
  const t = fitCardTransform(840, original, ORIGINAL_CARD_WIDTH);
  assert.equal(t.scale, CARD_WIDTH / ORIGINAL_CARD_WIDTH);
  assert.ok(t.scale > 1.25 && t.scale < 1.35, `expected about 1.3x, got ${t.scale}`);
  assert.equal(t.height, Math.round(840 * t.scale + OUTER_PAD * 2), "and it gets taller to match");
});

test("Original's type lands where the square sizes' type lands", () => {
  // The three sizes should read as one family. Square and 9:16 are enlarged by
  // their frames; Original is enlarged by this scale.
  const originalScale = fitCardTransform(840, original, ORIGINAL_CARD_WIDTH).scale;
  const squareScale = fitCardTransform(738, square, 738).scale;
  assert.ok(
    Math.abs(originalScale - squareScale) < 0.15,
    `Original at ${originalScale}x against Square at ${squareScale}x`,
  );
});

test("a card laid out at the full width is still drawn at 1:1", () => {
  // The default, which is what every caller that does not care about width gets.
  const t = fitCardTransform(840, original);
  assert.equal(t.scale, 1);
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

test("the square never scales a card up: its padded width is exactly the card width", () => {
  for (const cardHeight of [10, 100, 500, 1055, 1056]) {
    assert.equal(fitCardTransform(cardHeight, square).scale, 1, `height ${cardHeight}`);
  }
});

test("a card is fitted to the width of the 9:16 frame, whatever its height", () => {
  // The frame is narrower than the card, so width is what decides, and the
  // post is left centered in the tall space that remains.
  const t = fitCardTransform(400, tall);
  const availW = tall.width - OUTER_PAD * 2;
  assert.equal(t.scale, availW / CARD_WIDTH, "width is the limit");
  assert.equal(Math.round(CARD_WIDTH * t.scale), availW, "scaled width should fill the padded box");
  assert.equal(t.x, OUTER_PAD, "filling the width means it lands on the padding");
  assert.equal(t.y, (tall.height - 400 * t.scale) / 2, "and stays centered vertically");
});

test("the 9:16 card touches the padding on one axis at every height, and stays inside on the other", () => {
  const availW = tall.width - OUTER_PAD * 2;
  const availH = tall.height - OUTER_PAD * 2;
  for (let cardHeight = 100; cardHeight <= 4000; cardHeight += 100) {
    const t = fitCardTransform(cardHeight, tall);
    const w = CARD_WIDTH * t.scale;
    const h = cardHeight * t.scale;
    assert.ok(w <= availW + 0.001, `height ${cardHeight}: card is wider than the padded frame`);
    assert.ok(h <= availH + 0.001, `height ${cardHeight}: card is taller than the padded frame`);
    assert.ok(
      Math.abs(w - availW) < 0.001 || Math.abs(h - availH) < 0.001,
      `height ${cardHeight}: card fills neither axis (${w}x${h} in ${availW}x${availH})`,
    );
    assert.ok(t.x >= OUTER_PAD - 0.001, `height ${cardHeight}: x ${t.x} inside the padding`);
    assert.ok(t.y >= OUTER_PAD - 0.001, `height ${cardHeight}: y ${t.y} inside the padding`);
  }
});

test("a card too tall even for the 9:16 frame scales down to fit it", () => {
  // 9:16 leaves 1776px of padded height, so this takes a very long post.
  const t = fitCardTransform(3000, tall);
  const availH = tall.height - OUTER_PAD * 2;
  assert.equal(t.scale, availH / 3000, "height should be the limit now, not width");
  assert.ok(t.y >= OUTER_PAD - 1e-9, "should keep its padding");
  assert.ok(t.x + CARD_WIDTH * t.scale <= tall.width + 1e-9, "should stay inside the frame");
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

// --- The square preset draws a square card, not a rectangle in a square frame ---

test("a short post's card is padded out to a square in the Square preset", () => {
  const box = cardBox(560, square);
  assert.equal(box.height, CARD_WIDTH, "a square card's height is its width");
});

test("the padding a square card gains is split evenly above and below the content", () => {
  const natural = 560;
  const box = cardBox(natural, square);
  assert.equal(box.contentOffset, (CARD_WIDTH - natural) / 2);
  assert.equal(
    box.height - natural - box.contentOffset,
    box.contentOffset,
    "the space below should match the space above",
  );
});

test("a square card fills the square frame exactly, at 1:1", () => {
  // The frame's padded box is 1200 - 72*2 = 1056, which is CARD_WIDTH. A
  // square card is therefore the exact size of the padded frame.
  const box = cardBox(560, square);
  const t = fitCardTransform(box.height, square);
  assert.equal(t.scale, 1, "no scaling should be needed");
  assert.equal(t.x, OUTER_PAD);
  assert.equal(t.y, OUTER_PAD);
});

test("a post taller than the card is wide keeps its own shape", () => {
  const box = cardBox(1500, square);
  assert.equal(box.height, 1500, "no cropping and no shrinking to force a square");
  assert.equal(box.contentOffset, 0, "and no offset, so it draws exactly as it does today");
});

test("Original is the only size that leaves the card's own shape alone", () => {
  const box = cardBox(560, original);
  assert.equal(box.height, 560, "Original should leave the card's natural height alone");
  assert.equal(box.contentOffset, 0, "Original should not offset the content");
  assert.deepEqual(cardBox(560, undefined), { height: 560, contentOffset: 0 }, "no preset means no change");
});

test("9:16 squares the card too, and only the frame around it stays long", () => {
  assert.ok(tall.squareCard, "9:16 should square its card");
  const box = cardBox(560, tall, 640);
  assert.equal(box.height, 640, "a short post should be padded out to a square");
  assert.equal(box.contentOffset, (640 - 560) / 2, "and centered in it");
});

test("a squared card is scaled up to fill the 9:16 frame's width", () => {
  // This is the point of squaring it here: the card is narrower than the
  // frame, so the frame enlarges it, and the text comes out bigger than it
  // would have at full card width.
  const side = 678;
  const t = fitCardTransform(side, tall, side);
  const availW = tall.width - OUTER_PAD * 2;
  assert.ok(t.scale > 1, `a ${side}px card in a ${availW}px frame should be enlarged, got ${t.scale}`);
  assert.equal(t.scale, availW / side, "width is what limits it, not the long height");
  assert.equal(t.x, OUTER_PAD, "so it lands on the padding");
  assert.ok(t.y > OUTER_PAD, "and floats in the middle of the tall frame");
});

test("the squared 9:16 card is bigger than the full-width card it replaces", () => {
  const wasScale = fitCardTransform(560, tall, CARD_WIDTH).scale;
  const nowScale = fitCardTransform(678, tall, 678).scale;
  assert.ok(nowScale > wasScale, `squaring should enlarge the text: ${wasScale} -> ${nowScale}`);
});

test("a square card is never shorter than its content", () => {
  for (let natural = 100; natural <= 4000; natural += 100) {
    const box = cardBox(natural, square);
    assert.ok(box.height >= natural, `natural ${natural}: card would clip its own content`);
    assert.ok(box.height >= CARD_WIDTH, `natural ${natural}: card is wider than it is tall`);
    assert.ok(box.contentOffset >= 0, `natural ${natural}: content pushed off the top`);
  }
});
