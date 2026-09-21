import { test } from "node:test";
import assert from "node:assert/strict";

import { postUrl } from "../public/js/atproto.js";

const DID = "did:plc:7ditsi7667pzlxve5kr63u6c";
const post = (over = {}) => ({
  uri: `at://${DID}/app.bsky.feed.post/3mtwjgb6h5r27`,
  author: { did: DID, handle: "jimray.net" },
  ...over,
});

test("builds a shareable bsky.app link from the at:// uri", () => {
  assert.equal(
    postUrl(post()),
    "https://bsky.app/profile/jimray.net/post/3mtwjgb6h5r27",
  );
});

test("falls back to the DID when there is no handle", () => {
  assert.equal(
    postUrl(post({ author: { did: DID } })),
    `https://bsky.app/profile/${DID}/post/3mtwjgb6h5r27`,
  );
});

test("does not build a dead link out of an unresolvable handle", () => {
  // The AppView returns this placeholder when it cannot resolve the handle;
  // putting it in a URL would produce a link that 404s.
  const url = postUrl(post({ author: { did: DID, handle: "handle.invalid" } }));
  assert.ok(!url.includes("handle.invalid"), `got ${url}`);
  assert.ok(url.includes(DID), `should fall back to the DID, got ${url}`);
});

test("returns null rather than a broken URL when there is nothing to build from", () => {
  for (const bad of [undefined, {}, { uri: "" }, { uri: "not-a-uri" }, { uri: "https://bsky.app/x" }]) {
    assert.equal(postUrl(bad), null, `${JSON.stringify(bad)} should not produce a URL`);
  }
});

test("ignores at:// uris that aren't posts", () => {
  assert.equal(postUrl({ uri: `at://${DID}/app.bsky.actor.profile/self` }), null);
  assert.equal(postUrl({ uri: `at://${DID}/app.bsky.feed.like/abc` }), null);
});

test("the built URL has no doubled or missing separators", () => {
  const url = postUrl(post());
  assert.ok(!url.slice("https://".length).includes("//"), `doubled slash in ${url}`);
  assert.match(url, /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[^/]+$/);
});

test("an rkey is never allowed to smuggle in extra path or query", () => {
  const url = postUrl({
    uri: `at://${DID}/app.bsky.feed.post/abc/../../evil`,
    author: { handle: "jimray.net" },
  });
  assert.equal(url, null, "an rkey with path separators is not a valid post uri");
});
