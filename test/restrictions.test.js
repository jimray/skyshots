import { test } from "node:test";
import assert from "node:assert/strict";

import { fetchContentVisibility, restrictionFor } from "../public/js/atproto.js";

const DECLARATION = "app.bsky.actor.contentVisibilityDeclaration";

/**
 * Stands in for the network. `routes` maps a DID to the response the record
 * fetch should give: a boolean value, "missing", or an HTTP status number.
 */
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    const did = u.searchParams.get("repo");
    calls.push({ did, collection: u.searchParams.get("collection"), rkey: u.searchParams.get("rkey") });

    const outcome = routes[did];
    if (outcome === "missing") {
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: "RecordNotFound", message: `Could not locate record: ${did}` }),
      };
    }
    if (typeof outcome === "number") {
      return { ok: false, status: outcome, text: async () => "upstream exploded" };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        uri: `at://${did}/${DECLARATION}/self`,
        value: { $type: DECLARATION, hideFromAlgorithmicRecommendations: outcome },
      }),
    };
  };
  return calls;
}

const postBy = (handle, labels = []) => ({ author: { handle, labels } });

test("an account that set the flag is hidden", async () => {
  stubFetch({ "did:plc:aaa": true });
  const seen = await fetchContentVisibility(["did:plc:aaa"]);
  assert.equal(seen.get("did:plc:aaa"), true);
});

test("an account that set the flag to false is not hidden", async () => {
  stubFetch({ "did:plc:aaa": false });
  const seen = await fetchContentVisibility(["did:plc:aaa"]);
  assert.equal(seen.get("did:plc:aaa"), false);
});

test("no record at all means not hidden, as the lexicon requires", async () => {
  stubFetch({ "did:plc:aaa": "missing" });
  const seen = await fetchContentVisibility(["did:plc:aaa"]);
  assert.equal(seen.get("did:plc:aaa"), false, "RecordNotFound must read as false, not as a failure");
});

test("a failure that isn't RecordNotFound fails closed", async () => {
  stubFetch({ "did:plc:aaa": 500 });
  const seen = await fetchContentVisibility(["did:plc:aaa"]);
  assert.equal(seen.get("did:plc:aaa"), true, "an unreadable declaration should cover, not reveal");
});

test("the record is asked for by its literal:self key", async () => {
  const calls = stubFetch({ "did:plc:aaa": "missing" });
  await fetchContentVisibility(["did:plc:aaa"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].collection, DECLARATION);
  assert.equal(calls[0].rkey, "self");
});

test("one request per author, however many posts they wrote", async () => {
  const calls = stubFetch({ "did:plc:aaa": "missing", "did:plc:bbb": true });
  const seen = await fetchContentVisibility(["did:plc:aaa", "did:plc:bbb", "did:plc:aaa", "did:plc:aaa"]);
  assert.equal(calls.length, 2, "duplicate DIDs should collapse into one request each");
  assert.equal(seen.get("did:plc:bbb"), true);
});

test("no authors means no requests", async () => {
  const calls = stubFetch({});
  const seen = await fetchContentVisibility([]);
  assert.equal(calls.length, 0);
  assert.equal(seen.size, 0);
});

test("the logged-out label restricts a post", () => {
  const r = restrictionFor(postBy("jimray.net", [{ val: "!no-unauthenticated" }]), false);
  assert.equal(r?.id, "logged-out");
  assert.match(r.message, /jimray\.net/, "the message should name the account");
});

test("the discovery declaration restricts a post", () => {
  const r = restrictionFor(postBy("jimray.net"), true);
  assert.equal(r?.id, "recommendations");
  assert.match(r.message, /jimray\.net/);
});

test("an unrestricted post has no restriction", () => {
  assert.equal(restrictionFor(postBy("jimray.net"), false), null);
  assert.equal(restrictionFor(postBy("jimray.net", [{ val: "porn" }]), false), null);
});

test("when both apply, the stronger signal decides the message", () => {
  const r = restrictionFor(postBy("jimray.net", [{ val: "!no-unauthenticated" }]), true);
  assert.equal(r?.id, "logged-out", "should be deterministic, not whichever was checked last");
});

test("a post with no author data is not mistaken for unrestricted", () => {
  assert.equal(restrictionFor({}, true)?.id, "recommendations");
  assert.equal(restrictionFor(undefined, false), null);
});
