import { test } from "node:test";
import assert from "node:assert/strict";

import { BACKGROUND_PRESETS, backgroundImageLayout, skyStripLayout } from "../public/js/render-card.js";

const LIGHT = { w: 1100, h: 656 };
const FRAMES = [
  { name: "original, short post", w: 1200, h: 900 },
  { name: "original, long post", w: 1200, h: 2400 },
  { name: "square", w: 1200, h: 1200 },
  { name: "9:16", w: 1080, h: 1920 },
];

test("the image always fills the frame width exactly, never cropped sideways", () => {
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    assert.equal(l.x, 0, `${f.name}: should start at the left edge`);
    assert.equal(l.width, f.w, `${f.name}: should span the full width`);
  }
});

test("the image is never distorted", () => {
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    assert.ok(
      Math.abs(l.width / l.height - LIGHT.w / LIGHT.h) < 1e-9,
      `${f.name}: aspect ratio drifted`,
    );
  }
});

test("the cloud band sits on the bottom edge in every frame", () => {
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    assert.ok(Math.abs(l.y + l.height - f.h) < 1e-9, `${f.name}: bottom edge not pinned`);
  }
});

test("the sky fill covers exactly the space the image doesn't", () => {
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    assert.equal(l.skyHeight, Math.max(0, f.h - l.height), `${f.name}: gap left unpainted`);
    assert.ok(l.skyHeight + Math.min(l.height, f.h) >= f.h - 1e-9, `${f.name}: frame not fully covered`);
  }
});

test("a tall frame needs sky above the clouds", () => {
  const l = backgroundImageLayout(LIGHT.w, LIGHT.h, 1200, 2400);
  assert.ok(l.skyHeight > 1500, `expected a lot of sky, got ${l.skyHeight}`);
});

test("a frame the image overflows needs no sky and keeps the clouds", () => {
  // No preset is this shape now that 16:9 is gone, but the geometry has to
  // hold for any frame: 1100x656 scaled to 1920 wide is 1145 tall, taller
  // than a 1080 frame.
  const l = backgroundImageLayout(LIGHT.w, LIGHT.h, 1920, 1080);
  assert.equal(l.skyHeight, 0, "nothing to fill when the image overflows");
  assert.ok(l.y < 0, "the overflow should be off the top, not the bottom");
  assert.ok(Math.abs(l.y + l.height - 1080) < 1e-9, "clouds still pinned to the bottom");
});

test("the 9:16 frame is mostly sky, with the clouds along the bottom", () => {
  // 1100x656 scaled to 1080 wide is only 644 tall, a third of a 1920 frame.
  // The rest is the sky colour sampled from the image, so the band reads as
  // sky rather than as a letterbox.
  const l = backgroundImageLayout(LIGHT.w, LIGHT.h, 1080, 1920);
  assert.ok(l.skyHeight > 1200, `expected a tall band of sky, got ${l.skyHeight}`);
  assert.ok(Math.abs(l.y + l.height - 1920) < 1e-9, "clouds pinned to the bottom");
});

test("clouds-light is the default background and clouds-dark is second", () => {
  assert.equal(BACKGROUND_PRESETS[0].id, "clouds-light");
  assert.equal(BACKGROUND_PRESETS[1].id, "clouds-dark");
});

test("every image preset declares both a source and a sampled sky colour", () => {
  const imagePresets = BACKGROUND_PRESETS.filter((p) => p.src);
  assert.ok(imagePresets.length >= 2, "expected the two cloud presets");
  for (const preset of imagePresets) {
    assert.match(preset.src, /^\/img\/.+\.png$/, `${preset.id}: needs a served path`);
    assert.match(preset.sky, /^#|^rgb/, `${preset.id}: needs a sky colour to extend with`);
    assert.equal(typeof preset.paint, "undefined", `${preset.id}: image presets don't paint gradients`);
  }
});

test("the gradient presets still work and are unaffected", () => {
  const gradients = BACKGROUND_PRESETS.filter((p) => !p.src);
  assert.equal(gradients.length, 5, "the five gradients should still be there");
  assert.ok(gradients.every((p) => typeof p.paint === "function"));
});

// --- Extending the sky without a seam ---

test("the sky is extended from the image's own top row, not from a flat colour", () => {
  // A single colour cannot match a top row that runs from rgb(196,227,245) on
  // the left to rgb(171,216,240) on the right, which is what clouds-light
  // does. Stretching that row upward matches every column by construction.
  const strip = skyStripLayout(LIGHT.w, LIGHT.h, 1200, 2400);
  assert.equal(strip.source.y, 0, "should read the very top of the image");
  assert.equal(strip.source.height, 1, "one row, repeated -- not a slice of cloud");
  assert.equal(strip.source.width, LIGHT.w, "the whole row, so the gradient carries across");
});

test("the extended sky meets the image exactly, with no gap and no overlap", () => {
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    const strip = skyStripLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    if (l.skyHeight <= 0) continue;
    assert.equal(strip.dest.y, 0, `${f.name}: should start at the top of the frame`);
    assert.ok(
      Math.abs(strip.dest.y + strip.dest.height - l.y) < 1e-9,
      `${f.name}: strip ends at ${strip.dest.y + strip.dest.height}, image starts at ${l.y}`,
    );
  }
});

test("the strip is scaled across exactly like the image, so the columns line up", () => {
  // If the strip and the image were scaled differently, the seam would come
  // back as a horizontal smear instead of a line.
  for (const f of FRAMES) {
    const l = backgroundImageLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    const strip = skyStripLayout(LIGHT.w, LIGHT.h, f.w, f.h);
    if (l.skyHeight <= 0) continue;
    assert.equal(strip.dest.x, l.x, `${f.name}: strip starts at a different x than the image`);
    assert.equal(strip.dest.width, l.width, `${f.name}: strip is a different width than the image`);
  }
});

test("a frame the image already covers gets no strip at all", () => {
  // 1100x656 scaled to 1920 wide overflows a 1080-tall frame, so there is no
  // sky to extend and nothing should be drawn.
  assert.equal(skyStripLayout(LIGHT.w, LIGHT.h, 1920, 1080), null);
});

test("the tall frame's sky band is all strip", () => {
  const l = backgroundImageLayout(LIGHT.w, LIGHT.h, 1080, 1920);
  const strip = skyStripLayout(LIGHT.w, LIGHT.h, 1080, 1920);
  assert.equal(strip.dest.height, l.skyHeight, "every pixel of sky should come from the image");
  assert.ok(strip.dest.height > 1200, "and in 9:16 that is most of the frame");
});
