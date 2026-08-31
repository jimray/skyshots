import { test } from "node:test";
import assert from "node:assert/strict";

import { cacheControlFor } from "../cache-policy.js";

const revalidates = (value) => value.includes("no-cache") && !value.includes("max-age");

test("code and markup are never served from cache without checking", () => {
  // This is the regression guard for a real breakage: index.html was served
  // no-cache while the modules were cached for an hour, so a browser could run
  // an old main.js against new HTML. main.js threw on an element that no
  // longer existed, the submit handler was never attached, and the form did a
  // native GET -- the page appeared to do nothing at all.
  for (const ext of [".html", ".js", ".css", ".json"]) {
    assert.ok(revalidates(cacheControlFor(ext)), `${ext} must revalidate, got "${cacheControlFor(ext)}"`);
  }
});

test("images may be cached, since a stale one cannot break the page", () => {
  for (const ext of [".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]) {
    const value = cacheControlFor(ext);
    assert.match(value, /max-age=\d+/, `${ext} should be cacheable, got "${value}"`);
    assert.ok(!value.includes("no-cache"), `${ext} should not also say no-cache`);
  }
});

test("anything unrecognised revalidates rather than being cached", () => {
  for (const ext of ["", ".wasm", ".map", ".txt", undefined]) {
    assert.ok(revalidates(cacheControlFor(ext)), `${ext} should default to revalidating`);
  }
});

test("the extension check is case-insensitive", () => {
  assert.equal(cacheControlFor(".PNG"), cacheControlFor(".png"));
  assert.ok(revalidates(cacheControlFor(".JS")));
});
