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
- **Punctuation is smartened** in everything the card draws as prose -- the
  post body, a quoted post's text, a link card's title. Straight quotes become
  curly, `--` becomes an em dash, `---` an en dash, `...` an ellipsis. The
  rules are SmartyPants', vendored at `public/js/vendor/smartypants.js`
  (BSD-3-Clause, licence beside it): this app has no build step and no
  dependencies, so the module is copied in and served as it is, and the header
  on the file says how to update it.

  `smart-quotes.js` is the wrapper, and exists because SmartyPants was written
  for HTML and a post is plain text. Two things follow. It skips the contents
  of `pre`, `code`, `kbd`, `script` and `math` tags, so a post that merely
  mentions `<code>` would otherwise lose its smartening from that word on --
  every `<` is hidden behind a control character for the duration of the call.
  And it reads the characters either side of a mark to tell an opening quote
  from a closing one, so text handed to it in isolation always reads as the
  start of a sentence -- a stand-in character is prefixed to give it the
  context, then sliced back off.

  Text inside a link, mention or hashtag is left exactly as the record has it:
  those are addresses, where a dash is a dash and a dot is a dot. The pass also
  runs after facets have been resolved to byte offsets, since every mark it
  makes is a different length in bytes than what it replaces.
- **Type** is one table, `TYPE` in `render-card.js`: every size the card draws,
  from the post body down to the domain on a link card. The line heights,
  baselines and fixed box heights that have to move with them sit beside it,
  and `test/typography.test.js` checks the text still fits what it is drawn
  inside -- that the header band holds the name and handle, that a two-line
  link title stays in its card, that no block sets its lines closer together
  than the type is tall.
- **Rendering is 100% Canvas 2D**, hand-drawn to look like a Bluesky post:
  avatar, name/handle, the blue verification check, rich text (mentions/links
  colored using the post's
  real facets, with correct UTF-8 byte-offset handling), image grids,
  external link cards, video thumbnails with a play badge, quote-post cards
  (which get the same logged-out-visibility check), and a stats row using
  Bluesky's own reply/repost/like icons. A post with a single image gets its
  true aspect ratio, however tall that is, so squarish and portrait images are
  shown whole rather than cropped into a landscape box; multi-image grids stay
  fixed-height cropped tiles, as they are in the Bluesky app.
- **Verification**: a verified account gets the app's blue check after its
  display name. The post view already carries `author.verification`, so this
  costs no extra request. Only the account's own `verifiedStatus` earns the
  check; `trustedVerifierStatus`, which marks an account that verifies others,
  gets a differently shaped badge in the app that this tool does not draw, so a
  verifier that is not itself verified (bsky.app, for one) shows no badge.
  `verificationBadgeFor` in `atproto.js` decides; `verified-badge.js` draws.

- **Backgrounds**: chosen per post -- each result carries its own picker, so
  several posts in one batch can take different backgrounds. Two cloud
  photographs (light is the default, dark second) and five gradients, or upload
  your own image. Uploads are blurred and dimmed
  so the card stays readable; the built-in cloud images are not, since they are
  designed as backdrops. Both cloud images are composed as a band of cloud
  under a nearly flat sky, so they are scaled to the frame width with the
  bottom edge pinned and the space above filled by stretching the image's own
  top row upward (`backgroundImageLayout` and `skyStripLayout` in
  `render-card.js`). That fits any aspect ratio with no cropping or distortion.

  The top row rather than a sampled colour, because a cloud photograph's top
  row is not one colour: clouds-light runs from rgb(196,227,245) on the left to
  rgb(171,216,240) on the right, so any single fill matches in the middle of
  the frame and is out by a dozen values at the edges, which shows as a seam.
  Repeating the row gives every column its own colour and the join matches by
  construction, whatever image is dropped in. Each preset still carries a flat
  `sky` colour, used only if the image fails to load.
- **The post URL** is shown as a link to the post, with a one-click Copy
  button. Copy always yields the canonical
  `https://bsky.app/profile/<handle>/post/<rkey>`, built from the resolved post
  rather than echoed from the input, so an `at://` URI comes back as something
  shareable. An unresolvable handle falls back to the DID, which still resolves
  on bsky.app.
- **Sizes**: a rail down the left of each preview switches output size --
  **9:16** (1080x1920) for stories and reels, **Original** (1200 wide, grows to
  fit the post), and **Square** (1200x1200) for Instagram. The card is drawn at
  its natural size and fitted into the chosen frame: it is scaled until it
  touches the padding on whichever axis runs out first, then centered. Sizes
  are a data list (`SIZE_PRESETS` in `render-card.js`), so another frame is one
  entry, and the first entry is the default a result opens on.

  Every size lays its card out narrower than it draws it, so the type comes out
  the same size in all three. Original lays out at 812px and is scaled 1.3x to
  the full 1200px width; Square and 9:16 narrow their card until the post fills
  a square and their frames enlarge it. Before that, Original was the only size
  drawn at 1:1, and its text looked small beside the others.

  9:16 squares its card as well, and only the frame around it stays long. No
  post is ever as tall as 9:16, so rather than stretch the card at a shape it
  cannot reach, the post is squared and left floating in the middle of a long
  background. Squaring narrows the card, and the frame -- 936px of padded width
  -- then enlarges it to fit, so the text comes out bigger in 9:16 than in any
  other size. The background above and below is the cloud image, which is built
  for it: the cloud band on the bottom edge, its own top row extended upward.

  Fitting scales up as well as down. The square's padded width is exactly the
  card width, so there a card is never enlarged and one that fits is left at
  1:1; a preset wider than the card would enlarge a short card to fill it
  rather than leaving it adrift in the middle.

  Square and 9:16 square the card itself, not just the frame around it, and do so
  by narrowing the card rather than by padding it. A card gets taller as it
  narrows -- the header and footer are a fixed cost, the body takes more lines
  -- so `squarestCardWidth` binary-searches between 640px and the full 1056px
  for the width whose measured height comes closest to that width. Most posts
  come out square on their own, with no padding at all. The card is then scaled
  up to fill the frame, so a narrow card means larger text in the output, not
  smaller.

  The two ends of that search are answers in their own right. A post already
  taller than the card is wide has nothing to gain from narrowing and keeps the
  full width. A post too short to reach a square even at 640 stops there, and
  `cardBox` pads what is left over, split evenly above and below so the post
  sits in the middle. Nothing is ever cropped or shrunk to force a square.

  Solving this means the same post is laid out at a dozen widths, so measuring
  had to come out of `preparePostCard`: it now loads the images and returns
  `layoutAt(cardWidth)`, with layouts cached per width. Loading is still done
  once per post, so switching size or background still touches no network.

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
icon/logo placement, download filenames, canonical post URLs, and the opt-out
logic (with `fetch` stubbed: record present/absent/unreadable, DID
deduplication, and which signal wins).

`parsePostReference` -- the input parser -- has no tests yet, which is the
largest untested piece of logic left.

## A note on caching

There is no build step and so no content-hashed filenames. index.html and the
modules have to move together -- the HTML says which elements exist and
main.js reaches for them while loading -- so code and markup are always served
`no-cache`, and only images are allowed to sit in the browser cache. Getting
this wrong once produced a page that silently did nothing: a cached old
main.js threw on an element the new HTML no longer had, so its submit listener
was never attached and the form fell through to a native GET. See
`cache-policy.js`. Canvas is absent in Node, so the icon tests stub `Path2D`
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
