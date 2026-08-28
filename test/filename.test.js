import { test } from "node:test";
import assert from "node:assert/strict";

import { screenshotFilename } from "../public/js/download-canvas.js";

test("a filename names the account, the size and the moment", () => {
  const name = screenshotFilename("jimray.bsky.team", "square", 1756300000000);
  assert.equal(name, "bluesky-jimray.bsky.team-square-1756300000000.png");
});

test("the two sizes of one post never collide", () => {
  const at = 1756300000000;
  assert.notEqual(
    screenshotFilename("jimray.net", "original", at),
    screenshotFilename("jimray.net", "square", at),
  );
});

test("a missing handle still produces a usable name", () => {
  for (const handle of [undefined, null, ""]) {
    assert.equal(screenshotFilename(handle, "square", 1), "bluesky-post-square-1.png");
  }
});

test("nothing in a filename can escape the downloads folder", () => {
  const name = screenshotFilename("../../etc/passwd", "square", 1);
  assert.ok(!name.includes("/"), `path separator survived: ${name}`);
  assert.ok(!name.includes(".."), `parent-directory hop survived: ${name}`);
});

test("characters that don't belong in a filename are replaced, not dropped", () => {
  assert.equal(screenshotFilename("a b", "square", 1), "bluesky-a-b-square-1.png");
  assert.equal(screenshotFilename("who?", "square", 1), "bluesky-who--square-1.png");
});

test("ordinary handle punctuation is left alone", () => {
  assert.match(screenshotFilename("some-one.bsky.social", "original", 1), /some-one\.bsky\.social/);
});
