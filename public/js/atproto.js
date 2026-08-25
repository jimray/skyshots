// Talks to Bluesky's public, unauthenticated AppView API. No login, no app
// password, no backend credential storage - this only ever reads what's
// already public.
const PUBLIC_API = "https://public.api.bsky.app";
const LOGGED_OUT_RESTRICTED_LABEL = "!no-unauthenticated";

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
    throw new Error(`${nsid} failed (${res.status}): ${body.slice(0, 200)}`);
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

  const postByUri = new Map();
  const validUris = uris.filter(Boolean);
  for (let i = 0; i < validUris.length; i += 25) {
    const chunk = validUris.slice(i, i + 25);
    const { posts } = await xrpc("app.bsky.feed.getPosts", { uris: chunk });
    for (const post of posts) postByUri.set(post.uri, post);
  }

  return refs.map((ref, i) => ({
    ref,
    uri: uris[i],
    post: uris[i] ? postByUri.get(uris[i]) ?? null : null,
  }));
}

/**
 * The "discourage apps from showing my posts to logged-out users" setting
 * (Settings > Moderation > Logged-out visibility on bsky.app) sets a
 * !no-unauthenticated self-label on the author's profile record. Bluesky's
 * own APIs still return the content when queried unauthenticated - it's
 * each client's job to notice the label and respect it. We check it here so
 * this tool never turns that opt-out into a public screenshot.
 */
export function isLoggedOutRestricted(post) {
  const labels = post?.author?.labels ?? [];
  return labels.some((label) => label.val === LOGGED_OUT_RESTRICTED_LABEL);
}

export function proxiedImageUrl(originalUrl) {
  return `/api/image?url=${encodeURIComponent(originalUrl)}`;
}
