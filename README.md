# Bluesky Post Screenshots

A small web app that turns a list of Bluesky post links into shareable
screenshot images — a Bluesky-style post card rendered on a decorative
background, exported as a PNG.

Before rendering anything, it checks whether the post's author has enabled
**Settings → Moderation → Logged-out visibility** ("Discourage apps from
showing my account to logged-out users") on bsky.app. If they have, the app
shows an explanation instead of a screenshot.

## Why the logged-out check matters, and how it actually works

That setting doesn't gate Bluesky's own API — `public.api.bsky.app` will
happily hand back the post either way. What it does is set a
`!no-unauthenticated` [self-label](https://docs.bsky.app/docs/advanced-guides/moderation)
on the author's profile record. Bluesky's official apps read that label and
hide the content from logged-out visitors; it's up to every other client to
do the same. This tool checks `post.author.labels` for that value (see
`isLoggedOutRestricted` in `public/js/atproto.js`) and refuses to render a
screenshot when it's present — for the post itself, and separately for any
quote-posted content embedded inside it.

This was verified against two real accounts that currently have the setting
enabled (found via a public GitHub issue referencing the label, confirmed
live against the API), not just against the documented shape of the label.

## How it works

- **No login required.** Everything is read through Bluesky's public,
  unauthenticated AppView (`public.api.bsky.app`), which already sends
  permissive CORS headers — the browser calls it directly.
- **Rendering is 100% Canvas 2D**, hand-drawn to look like a Bluesky post:
  avatar, name/handle, rich text (mentions/links colored using the post's
  real facets, with correct UTF-8 byte-offset handling), image grids,
  external link cards, video thumbnails with a play badge, quote-post cards
  (which get the same logged-out-visibility check), and a stats row with
  hand-drawn reply/repost/like icons.
- **Backgrounds**: six built-in gradients, or upload your own image (used as
  a blurred backdrop behind the card).
- **The one bit of backend**: `cdn.bsky.app` (avatars, post images, video
  thumbnails) doesn't send `Access-Control-Allow-Origin`, so drawing those
  images into a `<canvas>` and then exporting it as a PNG would throw a
  `SecurityError` from a tainted canvas. `server.js` proxies just those image
  bytes through the same origin as the page (allowlisted to
  `cdn.bsky.app`/`video.bsky.app` only) so the export works. Everything else
  is static files.

No framework, no build step, no npm dependencies — vanilla JS, native Web
Components (`<post-result-card>`, `<background-picker>`), and Node's
built-in `http`/`fetch` for the tiny server.

## Running it

```bash
npm start
```

Then open http://localhost:8080, paste one or more `https://bsky.app/profile/<handle>/post/<id>`
links (or `at://did:.../app.bsky.feed.post/<id>` URIs), one per line, pick a
background, and click **Generate screenshots**. Each result gets its own
"Download PNG" button once rendering finishes.

## What each result state means

| State | Meaning |
|---|---|
| Rendered card + download button | Post fetched and drawn successfully |
| 🔒 restricted notice | The author has logged-out visibility restricted — nothing is rendered |
| ⚠️ "Post not found" | Deleted post, bad rkey, or an unresolvable handle |
| ⚠️ parse error | The line isn't a recognizable `bsky.app` post link or `at://` URI |

## Testing notes

This was exercised end-to-end with Playwright/Chromium against real Bluesky
data: real posts covering plain text, image grids, external link cards,
video, quote posts, and quote+media combos, plus a real account with
logged-out visibility restricted, a malformed input, and a nonexistent post.
Every case produced the expected UI state, and `canvas.toBlob()` succeeded
(proving the image proxy prevents canvas tainting) with real image bytes
drawn in — not placeholders.

(This sandbox's headless browser can't reach the open internet directly, so
the test mocked only the two `public.api.bsky.app` JSON calls with fixture
responses captured live via `curl` moments earlier; the `/api/image` proxy
requests were left to hit the real network through the actual Node server,
which does have real internet access — so the image-proxying and
canvas-export path was validated against real image bytes, not mocks.)

## Known limitations

- Only images/video/external-link/quote embeds are supported; other embed
  types fall back to just the post text.
- No batch "download all as ZIP" yet — each card downloads individually.
- Third-party clients that don't respect `!no-unauthenticated` can still
  show these posts elsewhere; this tool controls only what it itself
  generates.
