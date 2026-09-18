import { test } from "node:test";
import assert from "node:assert/strict";

import { imagesGridHeight } from "../public/js/render-card.js";

const W = 960; // CONTENT_WIDTH, the width an embed is drawn into.
const ar = (width, height) => ({ aspectRatio: { width, height } });
const loaded = (naturalWidth, naturalHeight) => ({ naturalWidth, naturalHeight });

test("a single image keeps its own aspect ratio", () => {
  assert.equal(imagesGridHeight([ar(1000, 1000)], [null], W), W, "square should be square");
  assert.equal(imagesGridHeight([ar(1000, 1250)], [null], W), W * 1.25, "4:5 portrait");
  assert.equal(imagesGridHeight([ar(3000, 1000)], [null], W), W / 3, "3:1 panorama");
});

test("a tall image is not cropped, however tall it is", () => {
  const h = imagesGridHeight([ar(1080, 1920)], [null], W);
  assert.equal(h, W / (1080 / 1920));
  assert.ok(h > 1700, `a 9:16 image should be over 1700px tall at ${W} wide, got ${h}`);
});

test("a landscape screenshot is about what the old fixed box gave", () => {
  // The old box was width * 0.6. Landscape screenshots arrive near 1.677,
  // which is why only squarish images looked wrong.
  const h = imagesGridHeight([ar(3300, 1968)], [null], W);
  assert.ok(Math.abs(h - W * 0.6) < W * 0.02, `expected close to ${W * 0.6}, got ${h}`);
});

test("without aspectRatio it falls back to the decoded image's own size", () => {
  assert.equal(imagesGridHeight([{}], [loaded(800, 800)], W), W);
  assert.equal(imagesGridHeight([{}], [loaded(1000, 1250)], W), W * 1.25);
});

test("with nothing to go on it falls back to the old landscape box", () => {
  assert.equal(imagesGridHeight([{}], [null], W), W * 0.6);
  assert.equal(imagesGridHeight([{}], [], W), W * 0.6);
});

test("a nonsense aspect ratio cannot produce an infinite or negative height", () => {
  for (const bad of [ar(0, 0), ar(100, 0), ar(0, 100), ar(-4, 3), ar(NaN, NaN)]) {
    const h = imagesGridHeight([bad], [null], W);
    assert.ok(Number.isFinite(h), `${JSON.stringify(bad.aspectRatio)} gave ${h}`);
    assert.ok(h > 0, `${JSON.stringify(bad.aspectRatio)} gave ${h}`);
  }
});

test("a broken aspect ratio still prefers the decoded image over the default", () => {
  assert.equal(imagesGridHeight([ar(0, 0)], [loaded(1000, 1000)], W), W);
});

test("multi-image grids keep their fixed tile height", () => {
  assert.equal(imagesGridHeight([ar(1000, 1000), ar(1000, 1000)], [null, null], W), W * 0.42);
  assert.equal(imagesGridHeight([{}, {}, {}], [null, null, null], W), W * 0.42);
  assert.equal(imagesGridHeight([{}, {}, {}, {}], [null, null, null, null], W), W * 0.42);
});

test("no images at all has no height", () => {
  assert.equal(imagesGridHeight([], [], W), 0);
});
