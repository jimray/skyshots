import { test } from "node:test";
import assert from "node:assert/strict";

import { verificationBadgeFor } from "../public/js/atproto.js";

/**
 * These fixtures are the shapes the live AppView returns for
 * app.bsky.feed.getPosts, trimmed to the verification field. They were taken
 * from real accounts, named here so a future change can be checked against
 * them again.
 */
const verified = {
  // nytimes.com: verified, and also a verifier.
  handle: "nytimes.com",
  verification: {
    verifications: [{ issuerHandle: "bsky.app", isValid: true }],
    verifiedStatus: "valid",
    trustedVerifierStatus: "valid",
  },
};

const verifiedOnly = {
  // jimray.bsky.team: verified by Bluesky, not a verifier.
  handle: "jimray.bsky.team",
  verification: {
    verifications: [{ issuerHandle: "bsky.app", isValid: true }],
    verifiedStatus: "valid",
    trustedVerifierStatus: "none",
  },
};

const verifierOnly = {
  // bsky.app: issues verifications, carries none of its own.
  handle: "bsky.app",
  verification: { verifications: [], verifiedStatus: "none", trustedVerifierStatus: "valid" },
};

const unverified = {
  handle: "someone.bsky.social",
  verification: { verifications: [], verifiedStatus: "none", trustedVerifierStatus: "none" },
};

test("a verified account gets the check", () => {
  assert.equal(verificationBadgeFor(verified), "verified");
  assert.equal(verificationBadgeFor(verifiedOnly), "verified");
});

test("an unverified account gets nothing", () => {
  assert.equal(verificationBadgeFor(unverified), null);
});

test("a trusted verifier is not itself verified, and gets no check", () => {
  // The app gives verifiers a differently shaped badge, which this tool does
  // not draw. Borrowing the round check for them would claim something the
  // account's own verifiedStatus does not.
  assert.equal(verificationBadgeFor(verifierOnly), null);
});

test("a revoked or invalid verification gets nothing", () => {
  const revoked = {
    handle: "was-verified.bsky.social",
    verification: {
      verifications: [{ issuerHandle: "bsky.app", isValid: false }],
      verifiedStatus: "invalid",
      trustedVerifierStatus: "none",
    },
  };
  assert.equal(verificationBadgeFor(revoked), null);
});

test("an author with no verification field at all is not a crash", () => {
  assert.equal(verificationBadgeFor({ handle: "old.bsky.social" }), null);
  assert.equal(verificationBadgeFor({}), null);
  assert.equal(verificationBadgeFor(null), null);
  assert.equal(verificationBadgeFor(undefined), null);
});

test("an unknown status is read as unverified, not as verified", () => {
  // verifiedStatus is an open union in the lexicon: a value added later must
  // not accidentally badge an account.
  const future = { handle: "x.bsky.social", verification: { verifiedStatus: "pending" } };
  assert.equal(verificationBadgeFor(future), null);
});
