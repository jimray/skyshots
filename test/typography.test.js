import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TYPE,
  BODY_LINE_HEIGHT,
  QUOTE_LINE_HEIGHT,
  LINK_TITLE_LINE_HEIGHT,
  HEADER_HEIGHT,
  NAME_BASELINE,
  HANDLE_BASELINE,
  QUOTE_NOTICE_HEIGHT,
  QUOTE_NOTICE_BASELINE,
  LINK_CARD_HEIGHT,
  LINK_TITLE_BASELINE,
  LINK_TITLE_MAX_LINES,
  quoteBoxHeight,
} from "../public/js/render-card.js";

// These two ratios stand in for real font metrics, which Node has no way to
// measure. They are deliberately generous: a size that fails one of these
// would clip visibly, not marginally.
const ASCENT = 0.78;
const DESCENT = 0.25;

test("every piece of card text has a named size", () => {
  const named = [
    "body", "name", "handle", "timestamp", "stats",
    "quoteName", "quoteHandle", "quoteBody", "quoteNotice",
    "linkDomain", "linkTitle",
  ];
  for (const key of named) {
    assert.equal(typeof TYPE[key], "number", `${key} should be a named size`);
    assert.ok(TYPE[key] > 0, `${key} should be a real size`);
  }
});

test("the card type sizes are the ones we settled on", () => {
  // Bumped 2px across the card. Pinned so a future change is deliberate.
  assert.deepEqual(TYPE, {
    body: 33,
    name: 30,
    handle: 26,
    timestamp: 24,
    stats: 26,
    quoteName: 24,
    quoteHandle: 22,
    quoteBody: 26,
    quoteNotice: 24,
    linkDomain: 22,
    linkTitle: 26,
  });
});

test("no block of text sets its lines closer together than the type is tall", () => {
  const blocks = [
    ["post body", TYPE.body, BODY_LINE_HEIGHT],
    ["quoted post", TYPE.quoteBody, QUOTE_LINE_HEIGHT],
    ["link card title", TYPE.linkTitle, LINK_TITLE_LINE_HEIGHT],
  ];
  for (const [what, fontSize, lineHeight] of blocks) {
    assert.ok(
      lineHeight > fontSize,
      `${what}: ${fontSize}px type on a ${lineHeight}px line would overlap`,
    );
  }
});

test("the name and handle both fit inside the header band", () => {
  assert.ok(
    TYPE.name * ASCENT <= NAME_BASELINE,
    `a ${TYPE.name}px name on a ${NAME_BASELINE}px baseline would run off the top of the card`,
  );
  assert.ok(
    HANDLE_BASELINE + TYPE.handle * DESCENT <= HEADER_HEIGHT,
    `a ${TYPE.handle}px handle on a ${HANDLE_BASELINE}px baseline would spill past the ${HEADER_HEIGHT}px header`,
  );
  assert.ok(
    NAME_BASELINE + TYPE.name * DESCENT <= HANDLE_BASELINE - TYPE.handle * ASCENT,
    "the name's descenders and the handle's ascenders should not collide",
  );
});

test("the quote notice fits the pill it is drawn in", () => {
  assert.ok(
    QUOTE_NOTICE_BASELINE + TYPE.quoteNotice * DESCENT <= QUOTE_NOTICE_HEIGHT,
    `a ${TYPE.quoteNotice}px notice would spill out of its ${QUOTE_NOTICE_HEIGHT}px pill`,
  );
});

test("a link card's title fits the fixed-height card it is drawn in", () => {
  const bottom = LINK_TITLE_BASELINE + (LINK_TITLE_MAX_LINES - 1) * LINK_TITLE_LINE_HEIGHT + TYPE.linkTitle * DESCENT;
  assert.ok(
    bottom <= LINK_CARD_HEIGHT,
    `${LINK_TITLE_MAX_LINES} lines of ${TYPE.linkTitle}px title reach ${bottom}px in a ${LINK_CARD_HEIGHT}px card`,
  );
});

test("a quote box is measured and drawn from one formula", () => {
  // The measure pass and drawQuote used to compute this separately, so a
  // change to one silently misplaced everything under the quote.
  for (const lines of [0, 1, 3, 8]) {
    const height = quoteBoxHeight(lines);
    assert.ok(height > lines * QUOTE_LINE_HEIGHT, `${lines} lines should leave room for the author row`);
  }
  assert.equal(
    quoteBoxHeight(4) - quoteBoxHeight(3),
    QUOTE_LINE_HEIGHT,
    "each extra line should add exactly one line of height",
  );
});
