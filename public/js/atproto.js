// Talks to Bluesky's public, unauthenticated AppView API. No login, no app
// password, no backend credential storage - this only ever reads what's
// already public.
const PUBLIC_API = "https://public.api.bsky.app";
const LOGGED_OUT_RESTRICTED_LABEL = "!no-unauthenticated";
const CONTENT_VISIBILITY_NSID = "app.bsky.actor.contentVisibilityDeclaration";

export class PostInputError extends Error {}

/**
 * Accepts either:
 *   https://bsky.app/profile/{handle-or-did}/post/{rkey}
 *   at://{did}/app.bsky.feed.post/{rkey}
 * and returns { actor, rkey } where actor is a handle or a did:... string.
 */
export function parsePostReference(raw) {
  const input = raw.trim();
  if (!input) throw new PostInputError("Empty input");

  const atUriMatch = input.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (atUriMatch) {
    return { actor: atUriMatch[1], rkey: atUriMatch[2] };
  }

  try {
    const url = new URL(input);
    if (!/(^|\.)bsky\.app$/.test(url.hostname)) {
      throw new PostInputError(`"${input}" isn't a bsky.app link or at:// URI`);
    }
    const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([^/]+)/);
    if (!match) {
      throw new PostInputError(`"${input}" doesn't look like a post link (expected /profile/<handle>/post/<id>)`);
    }
    return { actor: decodeURIComponent(match[1]), rkey: match[2] };
  } catch (err) {
    if (err instanceof PostInputError) throw err;
    throw new PostInputError(`Couldn't parse "${input}" as a URL or at:// URI`);
  }
}

async function xrpc(nsid, params) {
  const url = new URL(`${PUBLIC_API}/xrpc/${nsid}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, v);
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`${nsid} failed (${res.status}): ${body.slice(0, 200)}`);
    err.status = res.status;
    // XRPC reports the reason as a code in the body; "RecordNotFound" in
    // particular is an ordinary answer, not a fault.
    try {
      err.xrpcError = JSON.parse(body).error;
    } catch {
      // Not JSON. Leave the code undefined.
    }
    throw err;
  }
  return res.json();
}

const handleToDidCache = new Map();

export async function resolveActorToDid(actor) {
  if (actor.startsWith("did:")) return actor;
  if (handleToDidCache.has(actor)) return handleToDidCache.get(actor);
  const { did } = await xrpc("com.atproto.identity.resolveHandle", { handle: actor });
  handleToDidCache.set(actor, did);
  return did;
}

/**
 * Resolves a batch of { actor, rkey } references to AT-URIs, fetches the
 * full post records (bio, text, embeds, counts, author labels - everything
 * needed to render or explain why a post can't be rendered), and returns a
 * Map keyed by the *original* at-uri built from the input.
 */
export async function fetchPosts(refs) {
  const dids = await Promise.all(
    refs.map(async (ref) => {
      try {
        return await resolveActorToDid(ref.actor);
      } catch {
        return null;
      }
    }),
  );

  const uris = refs.map((ref, i) => (dids[i] ? `at://${dids[i]}/app.bsky.feed.post/${ref.rkey}` : null));

  // The DIDs are known by this point, so the posts and the authors' visibility
  // declarations can be asked for at the same time rather than one after the
  // other.
  const [postByUri, hiddenByDid] = await Promise.all([
    fetchPostViews(uris.filter(Boolean)),
    fetchContentVisibility(dids),
  ]);

  return refs.map((ref, i) => ({
    ref,
    uri: uris[i],
    post: uris[i] ? postByUri.get(uris[i]) ?? null : null,
    hiddenFromRecommendations: hiddenByDid.get(dids[i]) ?? false,
  }));
}

/** Fetches post views in chunks of 25, the getPosts limit. */
async function fetchPostViews(uris) {
  const postByUri = new Map();
  for (let i = 0; i < uris.length; i += 25) {
    const { posts } = await xrpc("app.bsky.feed.getPosts", { uris: uris.slice(i, i + 25) });
    for (const post of posts) postByUri.set(post.uri, post);
  }
  return postByUri;
}

/**
 * Reads each author's app.bsky.actor.contentVisibilityDeclaration record.
 *
 * The record lives in the author's own repo under the literal key "self", so
 * it is one request per author rather than something the post view carries.
 * DIDs are deduplicated, so a batch of posts by one account asks once.
 *
 * The lexicon requires that a missing record be read as false, which arrives
 * as an XRPC "RecordNotFound". Any other failure is read as hidden: the cost
 * of being wrong that way is a cover the reader can dismiss, where the cost of
 * the opposite is a screenshot that should not have been shown.
 *
 * @param {string[]} dids
 * @returns {Promise<Map<string, boolean>>} DID -> hidden from recommendations.
 */
export async function fetchContentVisibility(dids) {
  const unique = [...new Set(dids.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (did) => {
      try {
        const { value } = await xrpc("com.atproto.repo.getRecord", {
          repo: did,
          collection: CONTENT_VISIBILITY_NSID,
          rkey: "self",
        });
        return [did, value?.hideFromAlgorithmicRecommendations === true];
      } catch (err) {
        if (err.xrpcError === "RecordNotFound") return [did, false];
        return [did, true];
      }
    }),
  );
  return new Map(entries);
}

/**
 * Works out whether an author has asked not to be shown, and why.
 *
 * Two independent signals, both of which this tool honours:
 *
 *  - "Discourage apps from showing my account to logged-out users" (Settings >
 *    Moderation > Logged-out visibility) puts a !no-unauthenticated self-label
 *    on the profile. Bluesky's own APIs still return the content when queried
 *    unauthenticated -- noticing the label is each client's job.
 *  - app.bsky.actor.contentVisibilityDeclaration, which asks to be kept out of
 *    content discovery surfaces.
 *
 * @param {object} post  A post view.
 * @param {boolean} hiddenFromRecommendations  From fetchContentVisibility.
 * @returns {{id: string, message: string}|null} null when nothing restricts it.
 */
export function restrictionFor(post, hiddenFromRecommendations) {
  const handle = post?.author?.handle;
  const who = handle ? `@${handle}` : "This account";
  const labels = post?.author?.labels ?? [];

  if (labels.some((label) => label.val === LOGGED_OUT_RESTRICTED_LABEL)) {
    return {
      id: "logged-out",
      message: `${who} has asked apps not to show their account to logged-out users.`,
    };
  }

  if (hiddenFromRecommendations) {
    return {
      id: "recommendations",
      message: `${who} has asked not to have their content shown in discovery surfaces.`,
    };
  }

  return null;
}

/**
 * Which verification badge, if any, an author has earned.
 *
 * The post view carries this already, so nothing extra is fetched. Only the
 * account's own `verifiedStatus` counts: `trustedVerifierStatus` marks an
 * account that issues verifications to others, which the app marks with a
 * differently shaped badge this tool does not draw. Anything other than a
 * literal "valid" -- "none", "invalid", a value added to the lexicon later, or
 * no verification object at all -- means no badge.
 *
 * @param {object} author  A post view's author.
 * @returns {"verified"|null}
 */
export function verificationBadgeFor(author) {
  return author?.verification?.verifiedStatus === "valid" ? "verified" : null;
}

// The AppView returns this in place of a handle it cannot resolve. Putting it
// in a profile URL would produce a link that 404s.
const UNRESOLVED_HANDLE = "handle.invalid";
const POST_URI = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/;

/**
 * The canonical bsky.app link for a post, built from its AT-URI.
 *
 * Preferring the handle keeps the link readable; the DID is used when the
 * handle is missing or unresolvable, which still resolves on bsky.app.
 *
 * @param {object} post  A post view.
 * @returns {string|null} null when there is no valid post URI to build from.
 */
export function postUrl(post) {
  const match = POST_URI.exec(post?.uri ?? "");
  if (!match) return null;
  const [, did, rkey] = match;
  const handle = post?.author?.handle;
  const actor = handle && handle !== UNRESOLVED_HANDLE ? handle : did;
  return `https://bsky.app/profile/${actor}/post/${rkey}`;
}

export function proxiedImageUrl(originalUrl) {
  return `/api/image?url=${encodeURIComponent(originalUrl)}`;
}
