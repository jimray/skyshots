import { test } from "node:test";
import assert from "node:assert/strict";

import { BACKGROUND_PRESETS, backgroundImageLayout } from "../public/js/render-card.js";

const LIGHT = { w: 1100, h: 656 };
const FRAMES = [
  { name: "original, short post", w: 1200, h: 900 },
  { name: "original, long post", w: 1200, h: 2400 },
  { name: "square", w: 1200, h: 1200 },
  { name: "16:9", w: 1920, h: 1080 },
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

test("a wide frame the image overflows needs no sky and keeps the clouds", () => {
  // 1100x656 scaled to 1920 wide is 1145 tall, taller than a 1080 frame.
  const l = backgroundImageLayout(LIGHT.w, LIGHT.h, 1920, 1080);
  assert.equal(l.skyHeight, 0, "nothing to fill when the image overflows");
  assert.ok(l.y < 0, "the overflow should be off the top, not the bottom");
  assert.ok(Math.abs(l.y + l.height - 1080) < 1e-9, "clouds still pinned to the bottom");
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
