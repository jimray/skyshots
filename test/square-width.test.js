import { test } from "node:test";
import assert from "node:assert/strict";

import { squarestCardWidth, MIN_SQUARE_CARD_WIDTH, CARD_WIDTH } from "../public/js/render-card.js";

const bounds = { min: MIN_SQUARE_CARD_WIDTH, max: CARD_WIDTH };

/**
 * A card's height falls as it is widened: the fixed header and footer stay put
 * while the body text takes fewer lines. `fixed + area / width` is that shape
 * in closed form, so a test can say exactly which width is square.
 */
const card = (fixed, area) => (width) => fixed + area / width;

test("finds the width at which the card is as tall as it is wide", () => {
  // 300 + 400000/w = w  =>  w = 800.
  const width = squarestCardWidth(card(300, 400000), bounds);
  assert.ok(Math.abs(width - 800) < 1, `expected about 800, got ${width}`);
});

test("the width it returns really is the squarest one", () => {
  const heightAt = card(300, 400000);
  const width = squarestCardWidth(heightAt, bounds);
  const error = Math.abs(heightAt(width) - width);
  for (const other of [640, 700, 750, 850, 900, 1056]) {
    assert.ok(
      error <= Math.abs(heightAt(other) - other) + 1,
      `${other} would be squarer than the chosen ${width}`,
    );
  }
});

test("a post already taller than the card is wide is left at full width", () => {
  // Narrowing a long post only makes it longer, so there is nothing to gain.
  assert.equal(squarestCardWidth(() => 2000, bounds), CARD_WIDTH);
});

test("a post too short to ever be square stops at the narrowest allowed card", () => {
  // Rather than shrinking the card to nothing chasing a square it cannot
  // reach. What is left over is padded, as before.
  assert.equal(squarestCardWidth(() => 200, bounds), MIN_SQUARE_CARD_WIDTH);
});

test("the answer always stays inside the bounds it was given", () => {
  for (const fixed of [100, 300, 500, 900]) {
    for (const area of [50_000, 200_000, 400_000, 900_000]) {
      const width = squarestCardWidth(card(fixed, area), bounds);
      assert.ok(width >= bounds.min, `${width} is under the floor`);
      assert.ok(width <= bounds.max, `${width} is over the card width`);
    }
  }
});

test("the card is never narrowed past the point of being square", () => {
  // Overshooting would make the card taller than it is wide, which is the
  // shape the narrowing was supposed to fix.
  const heightAt = card(300, 400000);
  const width = squarestCardWidth(heightAt, bounds);
  assert.ok(heightAt(width) <= width + 1, `card ${width} wide is ${heightAt(width)} tall`);
});

test("real line wrapping steps rather than glides, and is still solved", () => {
  // Text height moves a whole line at a time, so no width makes the card
  // exactly square. The answer should be the closest step, not a miss.
  const LINE = 44;
  const heightAt = (width) => 300 + Math.ceil(9000 / width) * LINE;
  const width = squarestCardWidth(heightAt, bounds);
  const error = Math.abs(heightAt(width) - width);
  for (let other = bounds.min; other <= bounds.max; other += 4) {
    assert.ok(error <= Math.abs(heightAt(other) - other) + 1, `${other} beats ${width}`);
  }
});

test("solving is cheap enough to run on every square render", () => {
  let calls = 0;
  const heightAt = (width) => {
    calls++;
    return card(300, 400000)(width);
  };
  squarestCardWidth(heightAt, bounds);
  assert.ok(calls <= 40, `${calls} measurement passes is too many for a redraw`);
});

// --- Which layout each size asks for ---

import { layoutForSize, SIZE_PRESETS } from "../public/js/render-card.js";

/** Stands in for a prepared post, recording the widths it is asked to lay out. */
function fakePrepared(heightAt) {
  const asked = [];
  return {
    asked,
    layoutAt(cardWidth) {
      const width = Math.round(cardWidth);
      asked.push(width);
      return { cardWidth: width, cardHeight: heightAt(width), drawCard() {} };
    },
  };
}

const square = SIZE_PRESETS.find((s) => s.id === "square");

test("a size that does not square its card is laid out at the one width it asks for", () => {
  for (const size of SIZE_PRESETS.filter((s) => !s.squareCard)) {
    const prepared = fakePrepared(() => 560);
    const layout = layoutForSize(prepared, size);
    const expected = size.cardWidth ?? CARD_WIDTH;
    assert.equal(layout.cardWidth, expected, `${size.id} should use its own width`);
    assert.deepEqual(prepared.asked, [expected], `${size.id} should not go looking for another width`);
  }
});

test("the square size narrows the card until the post fills it", () => {
  const prepared = fakePrepared(card(300, 400000));
  const layout = layoutForSize(prepared, square);
  assert.ok(layout.cardWidth < CARD_WIDTH, "should have narrowed");
  assert.ok(
    Math.abs(layout.cardHeight - layout.cardWidth) < 20,
    `card is ${layout.cardWidth}x${layout.cardHeight}, which is not square`,
  );
});

test("a long post is not narrowed, because narrowing would only lengthen it", () => {
  const prepared = fakePrepared(() => 2000);
  assert.equal(layoutForSize(prepared, square).cardWidth, CARD_WIDTH);
});

test("solving reuses layouts rather than measuring the same width twice", () => {
  const prepared = fakePrepared(card(300, 400000));
  layoutForSize(prepared, square);
  // The fake has no cache of its own, so this counts the calls the solver
  // makes. The real prepared card caches, so repeats cost nothing.
  assert.ok(prepared.asked.length <= 40, `${prepared.asked.length} layout passes is too many`);
});
