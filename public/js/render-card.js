import { proxiedImageUrl, verificationBadgeFor } from "./atproto.js";
import { drawVerifiedBadge, badgePlacement } from "./verified-badge.js";
import { drawBlueskyLogo, blueskyLogoWidth } from "./bluesky-logo.js";
import { drawIcon } from "./bsky-icons.js";

const BRAND_BLUE = "#1185fe";
const TEXT_DARK = "#0f1419";
const TEXT_GRAY = "#536471";
const BORDER = "#e1e8ed";

export const BACKGROUND_PRESETS = [
  {
    id: "clouds-light",
    label: "Clouds",
    swatch: "url(/img/clouds-light.png) center/cover",
    src: "/img/clouds-light.png",
    // Sampled from the image's own top row. If the file is replaced, re-sample:
    // this is what fills the frame above the clouds.
    sky: "#b7ddf2",
  },
  {
    id: "clouds-dark",
    label: "Night clouds",
    swatch: "url(/img/clouds-dark.png) center/cover",
    src: "/img/clouds-dark.png",
    sky: "#10141d",
  },
  {
    id: "sky",
    label: "Bluesky",
    swatch: "linear-gradient(135deg,#8ec5ff,#1185fe)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#a7d4ff");
      g.addColorStop(1, "#1185fe");
      return g;
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "linear-gradient(135deg,#00c6fb,#005bea)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#4facfe");
      g.addColorStop(1, "#00437a");
      return g;
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    swatch: "linear-gradient(135deg,#43e97b,#38f9d7,#667eea)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#43e97b");
      g.addColorStop(0.5, "#38f9d7");
      g.addColorStop(1, "#667eea");
      return g;
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg,#232526,#0f2027)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#2c3e50");
      g.addColorStop(1, "#0f1419");
      return g;
    },
  },
  {
    id: "paper",
    label: "Soft Gray",
    swatch: "linear-gradient(135deg,#f5f7fa,#c3cfe2)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#f5f7fa");
      g.addColorStop(1, "#c3cfe2");
      return g;
    },
  },
];

export const CANVAS_WIDTH = 1200;
export const OUTER_PAD = 72;
const CARD_PAD = 48;
export const CARD_WIDTH = CANVAS_WIDTH - OUTER_PAD * 2;

/**
 * The narrowest a card may be laid out at while chasing a square.
 *
 * Below this the body is a column of three or four words, and the header --
 * whose avatar and type are fixed sizes -- starts to dwarf the post it belongs
 * to. A card this narrow is scaled up 1.65x to fill the square frame, so the
 * text ends up larger than it is in any other size, not smaller.
 */
export const MIN_SQUARE_CARD_WIDTH = 640;

/**
 * Finds the card width whose laid-out height comes closest to that width.
 *
 * A card gets taller as it narrows: the header and footer are a fixed cost and
 * the body text takes more lines. `heightAt` is therefore a falling function of
 * width, which is what makes a binary search valid here.
 *
 * The two ends are answers in their own right. A post already taller than the
 * card is wide has nothing to gain from narrowing, so it keeps the full width.
 * A post too short to ever be square stops at the floor rather than shrinking
 * the card to nothing chasing a shape it cannot reach; what is left over is
 * padded by `cardBox`.
 *
 * @param {(width: number) => number} heightAt  Lays the card out and returns its height.
 * @param {{min: number, max: number}} bounds
 * @returns {number} A whole-pixel card width.
 */
export function squarestCardWidth(heightAt, { min, max }) {
  if (heightAt(max) >= max) return max;
  if (heightAt(min) <= min) return min;

  // `taller` stays on the side where the card is taller than it is wide,
  // `wider` on the side where it is not; the answer is between them.
  let taller = min;
  let wider = max;
  for (let i = 0; i < 12; i++) {
    const mid = Math.round((taller + wider) / 2);
    if (mid === taller || mid === wider) break;
    if (heightAt(mid) > mid) taller = mid;
    else wider = mid;
  }

  // Line wrapping moves a whole line at a time, so neither bound is likely to
  // be exactly square. Take whichever is closer.
  return Math.abs(heightAt(taller) - taller) <= Math.abs(heightAt(wider) - wider) ? taller : wider;
}
const AVATAR_SIZE = 64;
const NAME_FONT_SIZE = 28;
/** The header band: tall enough for the avatar, with a little air. */
export const HEADER_HEIGHT = Math.max(AVATAR_SIZE, 66);
/** The butterfly mark at the right of the header. */
export const HEADER_LOGO_HEIGHT = 40;
const BODY_FONT_SIZE = 31;
const BODY_LINE_HEIGHT = BODY_FONT_SIZE * 1.42;

/**
 * Output sizes offered for every post. "original" grows to fit the content;
 * the others are fixed frames the card is fitted into.
 *
 * The first entry is the default: it is what a result opens on, and what an
 * unknown size id falls back to.
 */
export const SIZE_PRESETS = [
  // 1920x1080 rather than 1200x675: a 675-tall frame leaves only 531px of
  // padded height, which would shrink almost every card. At 1080 a card up to
  // 557 tall grows to fill the padded width instead.
  { id: "wide", label: "16:9", width: 1920, height: 1080 },
  { id: "original", label: "Original" },
  // `squareCard` squares the card, not just the frame it sits in: see cardBox.
  { id: "square", label: "Square", width: 1200, height: 1200, squareCard: true },
];

/**
 * How tall the white card itself is drawn for one size, and how far down its
 * content starts.
 *
 * Normally the card is exactly as tall as its content. A preset marked
 * `squareCard` pads it out to a square, splitting what it gains evenly above
 * and below so the post sits in the middle rather than hanging from the top.
 *
 * By the time a square card reaches here it has usually been laid out at the
 * width that makes it nearly square already (`squarestCardWidth`), so there is
 * little left to pad. What remains is the short post that could not reach a
 * square even at the narrowest allowed width.
 *
 * A card taller than it is wide is left alone: nothing here ever shrinks or
 * crops content to force a square.
 *
 * @param {number} naturalHeight  The card's content height, from its layout.
 * @param {object} size           A SIZE_PRESETS entry.
 * @param {number} [cardWidth]    The width it was laid out at.
 * @returns {{height: number, contentOffset: number}}
 */
export function cardBox(naturalHeight, size, cardWidth = CARD_WIDTH) {
  const height = size?.squareCard ? Math.max(naturalHeight, cardWidth) : naturalHeight;
  return { height, contentOffset: (height - naturalHeight) / 2 };
}

/**
 * Works out the canvas dimensions and where the card sits inside them.
 *
 * The card is always drawn at its natural CARD_WIDTH x cardHeight; the caller
 * applies `scale` and `x`/`y` as a canvas transform, so the card-drawing code
 * never needs to know the output size.
 *
 * A fixed-size frame scales the card until it touches the padding on whichever
 * axis runs out first, then centers it. The square's padded width is exactly
 * CARD_WIDTH, so there a card is only ever scaled down, and one that fits is
 * left at 1:1 at the same x as "original". The 16:9 frame is much wider than
 * the card, so there a short card is scaled up to fill the frame instead of
 * floating in the middle of it.
 *
 * @param {number} cardHeight  Natural height of the card, in pixels.
 * @param {object} size        A SIZE_PRESETS entry.
 * @returns {{width: number, height: number, scale: number, x: number, y: number}}
 */
/**
 * Places a background image in a frame: scaled to the frame's width, with the
 * bottom edge of the image on the bottom edge of the frame.
 *
 * Both cloud images are composed as a band of cloud along the bottom under an
 * almost flat sky, so pinning the bottom keeps the composition and the space
 * left above can simply be filled with the sky colour -- no cropping
 * sideways, no distortion, at any aspect ratio.
 *
 * When the image is proportionally taller than the frame it overflows off the
 * top instead, and there is no sky left to fill.
 *
 * @returns {{x: number, y: number, width: number, height: number, skyHeight: number}}
 *   `skyHeight` is the band at the top of the frame the image does not reach.
 */
export function backgroundImageLayout(imgWidth, imgHeight, canvasWidth, canvasHeight) {
  const height = imgHeight * (canvasWidth / imgWidth);
  const y = canvasHeight - height;
  return { x: 0, y, width: canvasWidth, height, skyHeight: Math.max(0, y) };
}

export function fitCardTransform(cardHeight, size, cardWidth = CARD_WIDTH) {
  if (!size?.width || !size?.height) {
    return {
      width: Math.round(cardWidth + OUTER_PAD * 2),
      height: Math.round(cardHeight + OUTER_PAD * 2),
      scale: 1,
      x: OUTER_PAD,
      y: OUTER_PAD,
    };
  }

  const { width, height } = size;
  const scale = Math.min((width - OUTER_PAD * 2) / cardWidth, (height - OUTER_PAD * 2) / cardHeight);
  return {
    width,
    height,
    scale,
    x: (width - cardWidth * scale) / 2,
    y: (height - cardHeight * scale) / 2,
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

async function loadRemoteImage(bskyUrl) {
  if (!bskyUrl) return null;
  try {
    return await loadImage(proxiedImageUrl(bskyUrl));
  } catch {
    return null;
  }
}

function drawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// Splits post text into {text, link} segments using the record's byte-offset
// facets, so mentions/links can be colored the way Bluesky renders them.
function segmentText(text, facets) {
  if (!facets?.length) return [{ text, link: false }];
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(text);
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);
  const segments = [];
  let cursor = 0;
  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index;
    if (byteStart < cursor || byteEnd > bytes.length) continue;
    if (byteStart > cursor) segments.push({ text: decoder.decode(bytes.slice(cursor, byteStart)), link: false });
    const isLink = facet.features?.some((f) =>
      ["app.bsky.richtext.facet#link", "app.bsky.richtext.facet#mention", "app.bsky.richtext.facet#tag"].includes(f.$type),
    );
    segments.push({ text: decoder.decode(bytes.slice(byteStart, byteEnd)), link: isLink });
    cursor = byteEnd;
  }
  if (cursor < bytes.length) segments.push({ text: decoder.decode(bytes.slice(cursor)), link: false });
  return segments;
}

function tokenize(segments) {
  const tokens = [];
  for (const seg of segments) {
    const paragraphs = seg.text.split("\n");
    paragraphs.forEach((para, i) => {
      if (i > 0) tokens.push({ newline: true });
      for (const chunk of para.split(/(\s+)/).filter((c) => c.length > 0)) {
        tokens.push({ text: chunk, link: seg.link, space: /^\s+$/.test(chunk) });
      }
    });
  }
  return tokens;
}

function wrapTokens(ctx, tokens, maxWidth) {
  const lines = [[]];
  let lineWidth = 0;
  for (const token of tokens) {
    if (token.newline) {
      lines.push([]);
      lineWidth = 0;
      continue;
    }
    const width = ctx.measureText(token.text).width;
    if (token.space) {
      if (lines.at(-1).length === 0) continue;
      if (lineWidth + width > maxWidth) {
        lines.push([]);
        lineWidth = 0;
      } else {
        lines.at(-1).push(token);
        lineWidth += width;
      }
      continue;
    }
    if (lineWidth + width > maxWidth && lines.at(-1).length > 0) {
      lines.push([]);
      lineWidth = 0;
    }
    lines.at(-1).push(token);
    lineWidth += width;
  }
  return lines.filter((line, i, arr) => line.length > 0 || i === arr.length - 1);
}

function drawLines(ctx, lines, x, startY, lineHeight, colors) {
  let y = startY;
  for (const line of lines) {
    let cursorX = x;
    for (const token of line) {
      ctx.fillStyle = token.link ? colors.link : colors.text;
      ctx.fillText(token.text, cursorX, y);
      cursorX += ctx.measureText(token.text).width;
    }
    y += lineHeight;
  }
  return y;
}

function formatCount(n) {
  if (!n) return "0";
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  return `${time} · ${day}`;
}

function measureCtx() {
  return document.createElement("canvas").getContext("2d");
}

/** Loads the images an embed needs to draw: image grid, video still, link thumbnail. */
async function loadEmbedMedia(embed) {
  const [images, videoThumb, externalThumb] = await Promise.all([
    Promise.all((embed.images ?? []).map((im) => loadRemoteImage(im.fullsize || im.thumb))),
    embed.video ? loadRemoteImage(embed.video.thumbnail) : Promise.resolve(null),
    embed.external ? loadRemoteImage(embed.external.thumb) : Promise.resolve(null),
  ]);
  return { images, videoThumb, externalThumb };
}

/**
 * Loads every image the card needs, and hands back a way to lay it out.
 *
 * The loading is what costs anything, and none of it depends on the output
 * size or the background, so one prepare feeds every size and every
 * background: switching either is a redraw with no network at all.
 *
 * Measuring is separate because the square size lays the same post out at
 * several widths to find the one that fills a square. That is font metrics
 * only, and layouts are cached per width.
 *
 * @returns {{imageCount: number, layoutAt: (cardWidth: number) => object}}
 */
export async function preparePostCard({ post }) {
  const author = post.author ?? {};

  const [avatarImg, embed] = await Promise.all([loadRemoteImage(author.avatar), resolveEmbed(post)]);

  // Embed media is loaded here rather than mid-draw, so drawing stays
  // synchronous and can be repeated per size without refetching.
  const media = await loadEmbedMedia(embed);
  const assets = { avatarImg, embed, media };

  // One layout per width, kept because the square size asks for a dozen of
  // them while it solves, and a redraw asks for the same one again.
  const layouts = new Map();

  return {
    imageCount: media.images.length,
    /**
     * Lays the card out at `cardWidth`. Font metrics only -- no network, and
     * nothing here reloads when the size or background changes.
     */
    layoutAt(cardWidth) {
      const width = Math.round(cardWidth);
      if (!layouts.has(width)) layouts.set(width, layoutCard(post, assets, width));
      return layouts.get(width);
    },
  };
}

/**
 * Measures the card at one width and returns a function that draws it.
 *
 * Width is a parameter rather than a constant because the square size narrows
 * the card until the post fills it; see `squarestCardWidth`.
 *
 * @param {object} post
 * @param {{avatarImg: object, embed: object, media: object}} assets  Already loaded.
 * @param {number} cardWidth
 * @returns {{cardWidth: number, cardHeight: number,
 *            drawCard: (ctx: CanvasRenderingContext2D, box?: object) => void}}
 */
function layoutCard(post, assets, cardWidth) {
  const record = post.record ?? {};
  const author = post.author ?? {};
  const { avatarImg, embed, media } = assets;
  const contentWidth = cardWidth - CARD_PAD * 2;

  // --- Measurement pass (font metrics only; independent of canvas size) ---
  const measure = measureCtx();
  measure.font = `400 ${BODY_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const bodyLines = wrapTokens(measure, tokenize(segmentText(record.text ?? "", record.facets)), contentWidth);

  let quoteLines = [];
  if (embed.quote?.record) {
    measure.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const quoteWidth = contentWidth - 32;
    const quoteText = embed.quote.record.value?.text ?? "";
    quoteLines = wrapTokens(measure, tokenize(segmentText(quoteText.slice(0, 280), [])), quoteWidth);
  }

  const headerHeight = HEADER_HEIGHT;
  const textHeight = bodyLines.length * BODY_LINE_HEIGHT;

  let mediaHeight = 0;
  const mediaGap = 24;
  if (embed.images?.length) {
    mediaHeight = imagesGridHeight(embed.images, media.images, contentWidth);
  } else if (embed.video) {
    mediaHeight = contentWidth * 0.62;
  } else if (embed.external) {
    mediaHeight = 220;
  }

  let quoteHeight = 0;
  if (embed.quote) {
    quoteHeight = embed.quote.restricted || embed.quote.unavailable
      ? 68
      : 24 + 40 + quoteLines.length * 30 + 20;
  }

  const footerHeight = 34 + 20 + 40;

  const cardHeight =
    CARD_PAD +
    headerHeight +
    28 +
    textHeight +
    (mediaHeight ? mediaGap + mediaHeight : 0) +
    (quoteHeight ? mediaGap + quoteHeight : 0) +
    32 +
    footerHeight +
    CARD_PAD;

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{height: number, contentOffset: number}} [box]  From cardBox. The
   *   default draws the card at its natural height with no offset.
   */
  function drawCard(ctx, box = { height: cardHeight, contentOffset: 0 }) {
    // The card is drawn at the origin at its natural size; the caller's
    // transform decides where it lands and how big it ends up.
    const cardX = 0;
    const cardY = 0;
    const boxHeight = Math.max(box.height, cardHeight);

    // --- Card shadow + background ---
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    roundRectPath(ctx, cardX, cardY, cardWidth, boxHeight, 28);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    let cx = cardX + CARD_PAD;
    let cy = cardY + CARD_PAD + box.contentOffset;

    // --- Header: avatar + name/handle + logo mark ---
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + AVATAR_SIZE / 2, cy + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatarImg) {
      drawImageCover(ctx, avatarImg, cx, cy, AVATAR_SIZE, AVATAR_SIZE);
    } else {
      ctx.fillStyle = "#cfd9de";
      ctx.fillRect(cx, cy, AVATAR_SIZE, AVATAR_SIZE);
    }
    ctx.restore();

    const nameX = cx + AVATAR_SIZE + 18;
    const nameBaseline = cy + 30;
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${NAME_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = TEXT_DARK;
    const name = author.displayName || author.handle || "unknown";
    ctx.fillText(name, nameX, nameBaseline);

    if (verificationBadgeFor(author)) {
      const badge = badgePlacement({
        nameX,
        nameWidth: ctx.measureText(name).width,
        baseline: nameBaseline,
        fontSize: NAME_FONT_SIZE,
      });
      drawVerifiedBadge(ctx, badge.x, badge.y, badge.size);
    }

    ctx.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = TEXT_GRAY;
    ctx.fillText(`@${author.handle ?? "unknown"}`, nameX, cy + 58);

    const logoHeight = HEADER_LOGO_HEIGHT;
    drawBlueskyLogo(
      ctx,
      cardX + cardWidth - CARD_PAD - blueskyLogoWidth(logoHeight),
      cy + (headerHeight - logoHeight) / 2,
      logoHeight,
      BRAND_BLUE,
    );

    cy += headerHeight + 28;

    // --- Body text ---
    ctx.font = `400 ${BODY_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    drawLines(ctx, bodyLines, cx, cy + BODY_FONT_SIZE, BODY_LINE_HEIGHT, { text: TEXT_DARK, link: BRAND_BLUE });
    cy += textHeight;

    // --- Media ---
    if (embed.images?.length) {
      cy += mediaGap;
      drawImagesGrid(ctx, media.images, cx, cy, contentWidth, mediaHeight);
      cy += mediaHeight;
    } else if (embed.video) {
      cy += mediaGap;
      const thumb = media.videoThumb;
      roundRectPath(ctx, cx, cy, contentWidth, mediaHeight, 16);
      ctx.save();
      ctx.clip();
      if (thumb) drawImageCover(ctx, thumb, cx, cy, contentWidth, mediaHeight);
      else {
        ctx.fillStyle = "#111418";
        ctx.fillRect(cx, cy, contentWidth, mediaHeight);
      }
      ctx.restore();
      const playCx = cx + contentWidth / 2;
      const playCy = cy + mediaHeight / 2;
      ctx.beginPath();
      ctx.arc(playCx, playCy, 44, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(playCx - 14, playCy - 22);
      ctx.lineTo(playCx - 14, playCy + 22);
      ctx.lineTo(playCx + 22, playCy);
      ctx.closePath();
      ctx.fillStyle = "#fff";
      ctx.fill();
      cy += mediaHeight;
    } else if (embed.external) {
      cy += mediaGap;
      drawExternalCard(ctx, embed.external, cx, cy, contentWidth, mediaHeight, media.externalThumb);
      cy += mediaHeight;
    }

    // --- Quote embed ---
    if (embed.quote) {
      cy += mediaGap;
      quoteHeight = drawQuote(ctx, embed.quote, cx, cy, contentWidth, quoteLines);
      cy += quoteHeight;
    }

    cy += 32;

    // --- Footer: timestamp + divider + stats ---
    ctx.font = `400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = TEXT_GRAY;
    ctx.fillText(formatTimestamp(record.createdAt ?? new Date().toISOString()), cx, cy + 22);
    cy += 34 + 14;

    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cardX + cardWidth - CARD_PAD, cy);
    ctx.stroke();
    cy += 34;

    const stats = [
      { icon: "reply", count: post.replyCount },
      { icon: "repost", count: (post.repostCount ?? 0) + (post.quoteCount ?? 0) },
      { icon: "like", count: post.likeCount },
    ];
    let statX = cx;
    ctx.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    for (const stat of stats) {
      drawIcon(ctx, stat.icon, statX + 12, cy, 24, TEXT_GRAY);
      ctx.fillStyle = TEXT_GRAY;
      ctx.fillText(formatCount(stat.count), statX + 32, cy + 8);
      statX += 32 + ctx.measureText(formatCount(stat.count)).width + 56;
    }
  }

  return { cardWidth, cardHeight, drawCard };
}

const backgroundImageCache = new Map();

/**
 * Loads a preset background image once per page, however many results are on
 * it. A failure is cached as null rather than as a rejected promise.
 */
function loadBackgroundImage(src) {
  if (!backgroundImageCache.has(src)) {
    backgroundImageCache.set(src, loadImage(src).catch(() => null));
  }
  return backgroundImageCache.get(src);
}

/**
 * Loads whatever the chosen background needs and returns something that can
 * paint it at any size.
 *
 * Kept separate from preparePostCard so that changing background does not
 * re-fetch the post's avatar and embeds, and changing size does not re-fetch
 * the background. Preset images are cached for the life of the page.
 *
 * @returns {{paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void}}
 */
export async function resolveBackground({ backgroundId, customBackgroundImage }) {
  if (customBackgroundImage) {
    const img = await loadImage(customBackgroundImage);
    return {
      paint(ctx, width, height) {
        // An arbitrary photo is blurred and dimmed so the card stays readable.
        ctx.filter = "blur(6px) brightness(0.85)";
        drawImageCover(ctx, img, -20, -20, width + 40, height + 40);
        ctx.filter = "none";
      },
    };
  }

  const preset = BACKGROUND_PRESETS.find((p) => p.id === backgroundId) ?? BACKGROUND_PRESETS[0];

  if (preset.src) {
    const img = await loadBackgroundImage(preset.src);
    return {
      paint(ctx, width, height) {
        // The sky goes down first, so the band above the clouds is covered
        // even if the image is missing.
        ctx.fillStyle = preset.sky;
        ctx.fillRect(0, 0, width, height);
        if (!img) return;
        const l = backgroundImageLayout(img.naturalWidth, img.naturalHeight, width, height);
        ctx.drawImage(img, l.x, l.y, l.width, l.height);
      },
    };
  }

  return {
    paint(ctx, width, height) {
      ctx.fillStyle = preset.paint(ctx, width, height);
      ctx.fillRect(0, 0, width, height);
    },
  };
}

/**
 * Lays a prepared post out for one size.
 *
 * Every size but the square one uses the full card width. The square size
 * narrows the card until the post fills it, which is what keeps a short post
 * from becoming a small block of text stranded in a large white square.
 *
 * @param {object} prepared  From preparePostCard.
 * @param {object} size      A SIZE_PRESETS entry.
 */
export function layoutForSize(prepared, size) {
  if (!size?.squareCard) return prepared.layoutAt(CARD_WIDTH);
  const width = squarestCardWidth((w) => prepared.layoutAt(w).cardHeight, {
    min: MIN_SQUARE_CARD_WIDTH,
    max: CARD_WIDTH,
  });
  return prepared.layoutAt(width);
}

/**
 * Sizes `canvas` for one size preset and draws a prepared card on a resolved
 * background. Synchronous: everything it needs is already loaded.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} prepared    From preparePostCard.
 * @param {object} background  From resolveBackground.
 * @param {string} sizeId      A SIZE_PRESETS id.
 */
export function drawPreparedCard(canvas, prepared, background, sizeId) {
  const size = SIZE_PRESETS.find((s) => s.id === sizeId) ?? SIZE_PRESETS[0];
  const layout = layoutForSize(prepared, size);
  const box = cardBox(layout.cardHeight, size, layout.cardWidth);
  const placement = fitCardTransform(box.height, size, layout.cardWidth);

  canvas.width = placement.width;
  canvas.height = placement.height;
  const ctx = canvas.getContext("2d");

  background.paint(ctx, placement.width, placement.height);

  ctx.save();
  ctx.translate(placement.x, placement.y);
  ctx.scale(placement.scale, placement.scale);
  layout.drawCard(ctx, box);
  ctx.restore();

  return placement;
}

// What a single image falls back to when its shape can't be determined. This
// is the 5:3 box every single image used to get, and it happens to be close to
// the ratio landscape screenshots arrive at.
const FALLBACK_IMAGE_ASPECT = 1 / 0.6;

// Multi-image grids stay fixed-height tiles, cropped to fill, which is how the
// Bluesky app shows them too.
const GRID_TILE_RATIO = 0.42;

/**
 * Works out the true width-over-height ratio of an image, preferring what the
 * post record claims and falling back to the decoded file.
 *
 * `aspectRatio` is optional in the lexicon and is not always sane, so anything
 * non-positive or non-finite is rejected rather than trusted -- otherwise a
 * zero would divide its way into an infinite card height.
 */
function imageAspect(image, loaded) {
  const declared = image?.aspectRatio;
  const candidates = [
    [declared?.width, declared?.height],
    [loaded?.naturalWidth, loaded?.naturalHeight],
  ];
  for (const [w, h] of candidates) {
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h;
  }
  return FALLBACK_IMAGE_ASPECT;
}

/**
 * The height an image embed needs at `width`.
 *
 * A single image is given its true aspect ratio, however tall that makes it,
 * so squarish and portrait images are shown whole instead of being cropped
 * top and bottom to fit a landscape box.
 *
 * @param {object[]} images   The embed's images, as the post view carries them.
 * @param {(HTMLImageElement|null)[]} loaded  The decoded files, positionally.
 * @param {number} width
 */
export function imagesGridHeight(images, loaded, width) {
  const count = images?.length ?? 0;
  if (count === 0) return 0;
  if (count === 1) return width / imageAspect(images[0], loaded?.[0]);
  return width * GRID_TILE_RATIO;
}

function drawImagesGrid(ctx, imgs, x, y, w, h) {
  const gap = 8;
  const draw = (img, ix, iy, iw, ih, radius) => {
    roundRectPath(ctx, ix, iy, iw, ih, radius);
    ctx.save();
    ctx.clip();
    if (img) drawImageCover(ctx, img, ix, iy, iw, ih);
    else {
      ctx.fillStyle = "#e1e8ed";
      ctx.fillRect(ix, iy, iw, ih);
    }
    ctx.restore();
  };
  if (imgs.length === 1) {
    draw(imgs[0], x, y, w, h, 16);
  } else if (imgs.length === 2) {
    const cw = (w - gap) / 2;
    draw(imgs[0], x, y, cw, h, 16);
    draw(imgs[1], x + cw + gap, y, cw, h, 16);
  } else if (imgs.length === 3) {
    const cw = (w - gap) / 2;
    draw(imgs[0], x, y, cw, h, 16);
    const rh = (h - gap) / 2;
    draw(imgs[1], x + cw + gap, y, cw, rh, 16);
    draw(imgs[2], x + cw + gap, y + rh + gap, cw, rh, 16);
  } else {
    const cw = (w - gap) / 2;
    const rh = (h - gap) / 2;
    draw(imgs[0], x, y, cw, rh, 16);
    draw(imgs[1], x + cw + gap, y, cw, rh, 16);
    draw(imgs[2], x, y + rh + gap, cw, rh, 16);
    draw(imgs[3], x + cw + gap, y + rh + gap, cw, rh, 16);
  }
}

function drawExternalCard(ctx, external, x, y, w, h, thumb) {
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 16);
  ctx.clip();
  const thumbW = thumb ? h : 0;
  if (thumb) {
    drawImageCover(ctx, thumb, x, y, thumbW, h);
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + thumbW, y, w - thumbW, h);
  ctx.restore();

  const textX = x + thumbW + 24;
  const textW = w - thumbW - 48;
  let domain = "";
  try {
    domain = new URL(external.uri).hostname.replace(/^www\./, "");
  } catch {
    domain = external.uri ?? "";
  }
  ctx.font = `400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_GRAY;
  ctx.fillText(domain, textX, y + 40);

  ctx.font = `700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_DARK;
  const titleLines = wrapTokens(ctx, tokenize(segmentText(external.title ?? "", [])), textW).slice(0, 2);
  drawLines(ctx, titleLines, textX, y + 74, 30, { text: TEXT_DARK, link: TEXT_DARK });
}

function drawQuote(ctx, quote, x, y, w, lines) {
  if (quote.restricted) {
    roundRectPath(ctx, x, y, w, 68, 16);
    ctx.strokeStyle = BORDER;
    ctx.stroke();
    ctx.font = `italic 400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = TEXT_GRAY;
    ctx.fillText("Quoted post is hidden — its author restricts logged-out visibility", x + 20, y + 40);
    return 68;
  }
  if (quote.unavailable) {
    roundRectPath(ctx, x, y, w, 68, 16);
    ctx.strokeStyle = BORDER;
    ctx.stroke();
    ctx.font = `italic 400 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = TEXT_GRAY;
    ctx.fillText("Quoted post is unavailable", x + 20, y + 40);
    return 68;
  }

  const height = 24 + 40 + lines.length * 30 + 20;
  roundRectPath(ctx, x, y, w, height, 16);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const rec = quote.record;
  ctx.font = `700 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_DARK;
  ctx.fillText(rec.author?.displayName || rec.author?.handle || "unknown", x + 20, y + 32);
  ctx.font = `400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_GRAY;
  ctx.fillText(`@${rec.author?.handle ?? "unknown"}`, x + 20 + ctx.measureText(rec.author?.displayName || "").width + 12, y + 32);

  ctx.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  drawLines(ctx, lines, x + 20, y + 64, 30, { text: TEXT_DARK, link: BRAND_BLUE });
  return height;
}

async function resolveEmbed(post) {
  const embed = post.embed;
  if (!embed) return {};

  if (embed.$type === "app.bsky.embed.images#view") return { images: embed.images };
  if (embed.$type === "app.bsky.embed.video#view") return { video: embed };
  if (embed.$type === "app.bsky.embed.external#view") return { external: embed.external };

  if (embed.$type === "app.bsky.embed.record#view") {
    return { quote: resolveQuote(embed.record) };
  }

  if (embed.$type === "app.bsky.embed.recordWithMedia#view") {
    const media = embed.media;
    const parts = { quote: resolveQuote(embed.record?.record) };
    if (media?.$type === "app.bsky.embed.images#view") parts.images = media.images;
    if (media?.$type === "app.bsky.embed.video#view") parts.video = media;
    if (media?.$type === "app.bsky.embed.external#view") parts.external = media.external;
    return parts;
  }

  return {};
}

function resolveQuote(record) {
  if (!record) return null;
  if (record.$type !== "app.bsky.embed.record#viewRecord") {
    return { unavailable: true };
  }
  const labels = record.author?.labels ?? [];
  if (labels.some((l) => l.val === "!no-unauthenticated")) {
    return { restricted: true };
  }
  return { record };
}
