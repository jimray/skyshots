import { test } from "node:test";
import assert from "node:assert/strict";

import { BACKGROUND_PRESETS } from "../public/js/render-card.js";
import { BLUESKY_LOGO_ASPECT, blueskyLogoWidth } from "../public/js/bluesky-logo.js";

/** Pull every #rrggbb / #rgb literal out of a CSS swatch string. */
function hexColors(swatch) {
  return (swatch.match(/#[0-9a-f]{3,6}/gi) ?? []).map((hex) => {
    const h = hex.slice(1);
    const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  });
}

/** Hue in degrees, plus saturation, for an [r,g,b] triple. */
function hueAndSaturation([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  let hue;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return { hue: ((hue * 60) % 360 + 360) % 360, saturation: delta / max };
}

/** Minimal stand-in for a canvas 2D context, enough to exercise paint(). */
function fakeContext() {
  const stops = [];
  const gradient = { __gradient: true, stops };
  return {
    stops,
    createLinearGradient: () => ({
      ...gradient,
      addColorStop: (offset, color) => stops.push({ offset, color }),
    }),
  };
}

test("the Bluesky blue gradient is still the first of the gradients", () => {
  // The cloud images come first overall now; blue leads the gradients.
  const firstGradient = BACKGROUND_PRESETS.find((p) => !p.src);
  assert.equal(firstGradient.id, "sky");
  assert.equal(firstGradient.label, "Bluesky");
});

test("no preset is a red gradient", () => {
  for (const preset of BACKGROUND_PRESETS) {
    // Image presets carry no colour literals; their swatch is a url().
    for (const rgb of hexColors(preset.swatch)) {
      const { hue, saturation } = hueAndSaturation(rgb);
      const isRed = saturation > 0.35 && (hue >= 335 || hue <= 25);
      assert.equal(isRed, false, `${preset.id} swatch contains a red hue (${Math.round(hue)}deg)`);
    }
  }
});

test("every gradient preset paints a multi-stop gradient", () => {
  for (const preset of BACKGROUND_PRESETS.filter((p) => !p.src)) {
    const ctx = fakeContext();
    const result = preset.paint(ctx, 1200, 900);
    assert.equal(result.__gradient, true, `${preset.id} did not return a gradient`);
    assert.ok(ctx.stops.length >= 2, `${preset.id} needs at least two color stops`);
  }
});

test("preset ids are unique", () => {
  const ids = BACKGROUND_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the logo keeps the aspect ratio of its viewBox", () => {
  assert.equal(BLUESKY_LOGO_ASPECT.toFixed(4), (568 / 501).toFixed(4));
  assert.equal(blueskyLogoWidth(501), 568);
});
