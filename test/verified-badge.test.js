import { test } from "node:test";
import assert from "node:assert/strict";

/** Canvas isn't available in Node, so stand in for the two objects the badge touches. */
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
    beginPath: () => calls.push(["beginPath"]),
    arc: (...a) => calls.push(["arc", ...a]),
    fill: (path) => calls.push(["fill", path]),
    set fillStyle(v) {
      calls.push(["fillStyle", v]);
    },
  };
}

const { drawVerifiedBadge, badgePlacement, checkPathData, BADGE_BLUE } = await import(
  "../public/js/verified-badge.js"
);

test("the badge is Bluesky's verification blue, not the brand blue of the logo", () => {
  assert.equal(BADGE_BLUE, "#006AFF");
});

test("the check is a single closed path on the 24-unit grid", () => {
  const d = checkPathData();
  assert.match(d, /^M/, "should start with a moveto");
  assert.match(d, /[Zz]$/, "should be a closed path");
  assert.equal(d.match(/[Mm]/g).length, 1, "the check is one solid shape, not an outline");
});

test("the badge draws a blue disc with a white check on top of it", () => {
  const ctx = fakeContext();
  drawVerifiedBadge(ctx, 0, 0, 24);

  const fills = ctx.calls.filter((c) => c[0] === "fillStyle").map((c) => c[1]);
  assert.deepEqual(fills, [BADGE_BLUE, "#ffffff"], "blue first, then the check over it");

  const arc = ctx.calls.find((c) => c[0] === "arc");
  assert.deepEqual(arc.slice(1, 4), [12, 12, 11.5], "disc centered on the grid, radius 11.5");

  const checkFill = ctx.calls.filter((c) => c[0] === "fill").at(-1);
  assert.equal(checkFill[1].d, checkPathData(), "the last fill is the check path");
});

test("the badge is placed from its top-left corner and scales off the 24-unit grid", () => {
  const ctx = fakeContext();
  drawVerifiedBadge(ctx, 200, 50, 12);
  assert.deepEqual(ctx.calls.find((c) => c[0] === "translate"), ["translate", 200, 50]);
  assert.deepEqual(ctx.calls.find((c) => c[0] === "scale"), ["scale", 0.5, 0.5]);
  assert.deepEqual(ctx.calls.at(-1), ["restore"], "should leave the context as it found it");
});

test("the badge sits after the name, sized and spaced off the name's font size", () => {
  const p = badgePlacement({ nameX: 100, nameWidth: 240, baseline: 300, fontSize: 28 });
  assert.ok(p.x > 340, `should start past the end of the name, got ${p.x}`);
  assert.ok(p.x - 340 < 28, "the gap should be a gap, not a gulf");
  assert.ok(p.size < 28 && p.size > 28 * 0.7, `should be a little smaller than the name, got ${p.size}`);
});

test("the badge is centered on the name's letters, not hung off the baseline", () => {
  // The baseline sits under the letters, so a badge centered on it would ride
  // low. Its center belongs at roughly half the cap height above the baseline.
  const fontSize = 28;
  const baseline = 300;
  const p = badgePlacement({ nameX: 0, nameWidth: 100, baseline, fontSize });
  const center = p.y + p.size / 2;
  assert.ok(center < baseline, "the badge's center should be above the baseline");
  assert.ok(
    Math.abs(center - (baseline - fontSize * 0.355)) < 1,
    `center ${center} should be about half a cap height above the baseline ${baseline}`,
  );
});

test("placement scales with the font, so changing the name size does not need new numbers", () => {
  const small = badgePlacement({ nameX: 0, nameWidth: 100, baseline: 100, fontSize: 14 });
  const big = badgePlacement({ nameX: 0, nameWidth: 100, baseline: 100, fontSize: 28 });
  assert.ok(big.size > small.size, "a bigger name should get a bigger badge");
  assert.ok(big.x > small.x, "and be pushed further out by a bigger gap");
});
