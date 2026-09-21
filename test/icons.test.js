import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Canvas isn't available in Node, so stand in for the two objects the icon
 * modules touch: Path2D (which records the path it was handed) and a context
 * that logs the calls made on it.
 */
class FakePath2D {
  constructor(d) {
    this.d = d;
  }
}
globalThis.Path2D = FakePath2D;

function fakeContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (x, y) => calls.push(["translate", x, y]),
    scale: (x, y) => calls.push(["scale", x, y]),
    fill: (path) => calls.push(["fill", path]),
    set fillStyle(v) {
      calls.push(["fillStyle", v]);
    },
  };
}

const { ICON_NAMES, iconPathData, drawIcon } = await import("../public/js/bsky-icons.js");
const { drawBlueskyLogo, blueskyLogoWidth } = await import("../public/js/bluesky-logo.js");

test("the stats row has an icon for each of reply, repost and like", () => {
  assert.deepEqual([...ICON_NAMES].sort(), ["like", "reply", "repost"]);
});

test("each icon is a closed outline with a hollow middle", () => {
  for (const name of ICON_NAMES) {
    const d = iconPathData(name);
    assert.match(d, /^M/, `${name} should start with a moveto`);
    assert.match(d, /[Zz]$/, `${name} should be a closed path`);
    // Two subpaths (outer edge + inner cutout) are what makes these read as
    // outline icons rather than solid blobs.
    const subpaths = d.match(/[Mm]/g).length;
    assert.equal(subpaths, 2, `${name} should have an outer and an inner subpath`);
  }
});

test("asking for an icon that doesn't exist is an error, not a blank space", () => {
  assert.throws(() => iconPathData("bookmark"), /Unknown icon: bookmark/);
  assert.throws(() => drawIcon(fakeContext(), "bookmark", 0, 0, 24, "#000"), /Unknown icon/);
});

test("an icon is centered on the point it is given, at the size it is given", () => {
  const ctx = fakeContext();
  drawIcon(ctx, "repost", 100, 50, 24, "#536471");

  const translate = ctx.calls.find((c) => c[0] === "translate");
  const scale = ctx.calls.find((c) => c[0] === "scale");
  assert.deepEqual(translate, ["translate", 100 - 12, 50 - 12], "should offset by half the icon box");
  assert.deepEqual(scale, ["scale", 1, 1], "24px icon on a 24-unit grid is 1:1");
  assert.deepEqual(ctx.calls.at(-1), ["restore"], "should leave the context as it found it");
  assert.ok(
    ctx.calls.some((c) => c[0] === "fillStyle" && c[1] === "#536471"),
    "should fill with the color it was given",
  );
});

test("an icon drawn at a different size scales rather than clips", () => {
  const ctx = fakeContext();
  drawIcon(ctx, "like", 0, 0, 48, "#000");
  assert.deepEqual(ctx.calls.find((c) => c[0] === "scale"), ["scale", 2, 2]);
});

test("icons are filled, not stroked, so the baked-in outline shows", () => {
  const ctx = fakeContext();
  drawIcon(ctx, "reply", 10, 10, 24, "#000");
  const fill = ctx.calls.find((c) => c[0] === "fill");
  assert.ok(fill, "should fill the path");
  assert.equal(fill[1].d, iconPathData("reply"), "should fill this icon's own path");
  assert.equal(ctx.stroke, undefined, "nothing here should need a stroke");
});

test("the logo is drawn from its top-left corner at the requested height", () => {
  const ctx = fakeContext();
  drawBlueskyLogo(ctx, 200, 30, 501, "#1185fe");
  assert.deepEqual(ctx.calls.find((c) => c[0] === "translate"), ["translate", 200, 30]);
  assert.deepEqual(ctx.calls.find((c) => c[0] === "scale"), ["scale", 1, 1]);
  assert.equal(blueskyLogoWidth(501), 568);
});

const { HEADER_LOGO_HEIGHT, HEADER_HEIGHT } = await import("../public/js/render-card.js");

test("the butterfly in the card header is drawn at 40px", () => {
  // Bumped from 30: the mark was too quiet against a 28px display name.
  assert.equal(HEADER_LOGO_HEIGHT, 40);
});

test("the butterfly still fits inside the header band it is centered in", () => {
  assert.ok(
    HEADER_LOGO_HEIGHT <= HEADER_HEIGHT,
    `a ${HEADER_LOGO_HEIGHT}px logo would overflow the ${HEADER_HEIGHT}px header`,
  );
});
