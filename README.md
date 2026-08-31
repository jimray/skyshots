# Bluesky Post Screenshots

A small web app that turns a list of Bluesky post links into shareable
screenshot images — a Bluesky-style post card rendered on a decorative
background, exported as a PNG.

It checks two separate signals that an author would rather not be shown. If
either applies, the screenshots are still rendered but sit behind a
dismissible cover, and downloading and zooming are disabled until the reader
dismisses it.

## The two opt-out signals, and how they actually work

**Logged-out visibility.** **Settings → Moderation → Logged-out visibility**
("Discourage apps from showing my account to logged-out users") on bsky.app
doesn't gate Bluesky's own API — `public.api.bsky.app` will happily hand back
the post either way. What it does is set a `!no-unauthenticated`
[self-label](https://docs.bsky.app/docs/advanced-guides/moderation) on the
author's profile record. Bluesky's official apps read that label and hide the
content from logged-out visitors; it's up to every other client to do the
same. This tool checks `post.author.labels` for that value — for the post
itself, and separately for any quote-posted content embedded inside it.

**Content visibility declaration.** `app.bsky.actor.contentVisibilityDeclaration`
is a record in the author's own repo under the literal key `self`, with a
required boolean `hideFromAlgorithmicRecommendations`. It is not carried on
the post view, so it costs one `com.atproto.repo.getRecord` per author (DIDs
are deduplicated, and the requests run alongside the post fetch rather than
after it). The lexicon requires that a **missing record be read as false**,
which arrives as an XRPC `RecordNotFound`; any *other* failure is read as
hidden, because a cover the reader can dismiss is the cheaper mistake.

Both signals are turned into a reason by `restrictionFor` in
`public/js/atproto.js`.

Note that `hideFromAlgorithmicRecommendations` is, by its own description,
about *content discovery surfaces*. Treating it as "don't screenshot me" is a
deliberately stricter reading than the field strictly requires.

The logged-out label was verified against two real accounts that have the
setting enabled (found via a public GitHub issue referencing the label,
confirmed live against the API). The declaration record was verified against
the published lexicon and against the live `RecordNotFound` response; no
sampled account has one set yet, so the `true` path is covered by fixtures
rather than by live data.

## How it works

- **No login required.** Everything is read through Bluesky's public,
  unauthenticated AppView (`public.api.bsky.app`), which already sends
  permissive CORS headers — the browser calls it directly.
- **Rendering is 100% Canvas 2D**, hand-drawn to look like a Bluesky post:
  avatar, name/handle, rich text (mentions/links colored using the post's
  real facets, with correct UTF-8 byte-offset handling), image grids,
  external link cards, video thumbnails with a play badge, quote-post cards
  (which get the same logged-out-visibility check), and a stats row using
  Bluesky's own reply/repost/like icons.
- **Backgrounds**: two cloud photographs (light is the default, dark second)
  and five gradients, or upload your own image. Uploads are blurred and dimmed
  so the card stays readable; the built-in cloud images are not, since they are
  designed as backdrops. Both cloud images are composed as a band of cloud
  under a nearly flat sky, so they are scaled to the frame width with the
  bottom edge pinned and the space above filled with a sky colour sampled from
  the image itself (`backgroundImageLayout` in `render-card.js`). That fits any
  aspect ratio with no cropping or distortion.
- **Sizes**: each result has buttons to switch output size -- **Original**
  (1200 wide, grows to fit the post), **Square** (1200x1200) for Instagram,
  and **16:9** (1920x1080). The card is drawn at its natural size and fitted
  into the chosen frame, scaling down only when it is too tall, never up.
  Sizes are a data list (`SIZE_PRESETS` in `render-card.js`), so another frame
  is one entry.

  16:9 is 1920x1080 rather than 1200x675 because a 675-tall frame leaves only
  531px of padded height, which would shrink almost every card; at 1080 the
  card sits at 1:1 unless it is taller than 936.

  Rendering is split three ways so switching is cheap: `preparePostCard` loads
  the post's images and measures the layout, `resolveBackground` loads the
  background, and `drawPreparedCard` is a synchronous draw. Both halves are
  cached per result, so changing size touches no network at all and changing
  background reloads only the background.
- **Zoom**: clicking (or tabbing to and pressing Enter on) a preview opens it
  enlarged and centered, with its size, dimensions and a download button. It
  is a native `<dialog>` opened with `showModal()`, so Esc, the focus trap and
  the backdrop are the browser's, not reimplemented. The image is capped at
  its own pixel width, so a screenshot is never upscaled.
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
| 🔒 covered previews | The author opted out via either signal — rendered, but covered until dismissed; download and zoom stay off while covered |
| ⚠️ "Post not found" | Deleted post, bad rkey, or an unresolvable handle |
| ⚠️ parse error | The line isn't a recognizable `bsky.app` post link or `at://` URI |

## Testing notes

`npm test` runs the unit tests (`node --test`, no dependencies): background
preset order and hues, the size-fitting and background-image geometry,
icon/logo placement, download filenames, and the opt-out logic (with `fetch`
stubbed: record present/absent/unreadable, DID deduplication, and which signal
wins). Canvas is absent in Node, so the icon tests stub `Path2D`
and record the context calls.

The zoom overlay has no unit test: its behaviour is `<dialog>` and CSS, which
a test without a browser could only restate.

The icon and logo path data was checked by flattening each path (beziers and
elliptical arcs) and rasterizing it to ASCII, which confirms the shape and
that it fills its viewBox. That check is not automated -- it exists to catch a
mistyped path when one is replaced.

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
- The opt-out cover is a DOM layer over a preview that has already been
  rendered, not a redaction of the pixels. It gates the app's own download and
  zoom paths, and a reader can dismiss it deliberately — it is a speed bump
  and a notice, not an enforcement boundary.
