import { proxiedImageUrl } from "./atproto.js";

const BRAND_BLUE = "#1185fe";
const TEXT_DARK = "#0f1419";
const TEXT_GRAY = "#536471";
const BORDER = "#e1e8ed";

export const BACKGROUND_PRESETS = [
  {
    id: "sunset",
    label: "Sunset",
    swatch: "linear-gradient(135deg,#ff9966,#ff5e62,#a855f7)",
    paint(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#ffb347");
      g.addColorStop(0.5, "#ff5e62");
      g.addColorStop(1, "#8b5cf6");
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

const CANVAS_WIDTH = 1200;
const OUTER_PAD = 72;
const CARD_PAD = 48;
const CARD_WIDTH = CANVAS_WIDTH - OUTER_PAD * 2;
const CONTENT_WIDTH = CARD_WIDTH - CARD_PAD * 2;
const AVATAR_SIZE = 64;
const BODY_FONT_SIZE = 30;
const BODY_LINE_HEIGHT = BODY_FONT_SIZE * 1.42;

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

// --- Icons (drawn as paths so no external asset/font dependency exists) ---

function drawReplyIcon(ctx, cx, cy, size) {
  const w = size, h = size * 0.8;
  ctx.strokeStyle = TEXT_GRAY;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - w / 4, cy + h / 2 - 1);
  ctx.lineTo(cx - w / 2 + 4, cy + h / 2 + size * 0.28);
  ctx.lineTo(cx - w / 4 + 8, cy + h / 2 - 1);
  ctx.closePath();
  ctx.fillStyle = TEXT_GRAY;
  ctx.fill();
}

function drawRepostIcon(ctx, cx, cy, size) {
  const r = size / 2;
  ctx.strokeStyle = TEXT_GRAY;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  const drawArrow = (angle) => {
    const ax = cx + r * Math.cos(angle);
    const ay = cy + r * Math.sin(angle);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(4, 0);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fillStyle = TEXT_GRAY;
    ctx.fill();
    ctx.restore();
  };
  drawArrow(Math.PI * 1.9);
  drawArrow(Math.PI * 0.9);
}

function drawHeartIcon(ctx, cx, cy, size) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 11 * s);
  ctx.beginPath();
  ctx.moveTo(12 * s, 21 * s);
  ctx.bezierCurveTo(4 * s, 14.5 * s, 1 * s, 10.5 * s, 1 * s, 6.8 * s);
  ctx.bezierCurveTo(1 * s, 3.2 * s, 3.8 * s, 1 * s, 6.6 * s, 1 * s);
  ctx.bezierCurveTo(8.8 * s, 1 * s, 10.6 * s, 2.2 * s, 12 * s, 4 * s);
  ctx.bezierCurveTo(13.4 * s, 2.2 * s, 15.2 * s, 1 * s, 17.4 * s, 1 * s);
  ctx.bezierCurveTo(20.2 * s, 1 * s, 23 * s, 3.2 * s, 23 * s, 6.8 * s);
  ctx.bezierCurveTo(23 * s, 10.5 * s, 20 * s, 14.5 * s, 12 * s, 21 * s);
  ctx.closePath();
  ctx.strokeStyle = TEXT_GRAY;
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.restore();
}

function measureCtx() {
  return document.createElement("canvas").getContext("2d");
}

/**
 * Renders `post` onto `canvas`, sizing the canvas to fit the content.
 * Returns the resolved embed image count actually drawn (useful for tests).
 */
export async function renderPostCard(canvas, { post, backgroundId, customBackgroundImage }) {
  const record = post.record ?? {};
  const author = post.author ?? {};

  const [avatarImg, embed, customBg] = await Promise.all([
    loadRemoteImage(author.avatar),
    resolveEmbed(post),
    customBackgroundImage ? loadImage(customBackgroundImage) : Promise.resolve(null),
  ]);

  // --- Measurement pass (font metrics only; independent of canvas size) ---
  const measure = measureCtx();
  measure.font = `400 ${BODY_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const bodyLines = wrapTokens(measure, tokenize(segmentText(record.text ?? "", record.facets)), CONTENT_WIDTH);

  let quoteLines = [];
  if (embed.quote?.record) {
    measure.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const quoteWidth = CONTENT_WIDTH - 32;
    const quoteText = embed.quote.record.value?.text ?? "";
    quoteLines = wrapTokens(measure, tokenize(segmentText(quoteText.slice(0, 280), [])), quoteWidth);
  }

  const headerHeight = Math.max(AVATAR_SIZE, 66);
  const textHeight = bodyLines.length * BODY_LINE_HEIGHT;

  let mediaHeight = 0;
  const mediaGap = 24;
  if (embed.images?.length) {
    mediaHeight = imagesGridHeight(embed.images.length, CONTENT_WIDTH);
  } else if (embed.video) {
    mediaHeight = CONTENT_WIDTH * 0.62;
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

  const canvasHeight = Math.round(cardHeight + OUTER_PAD * 2);
  canvas.width = CANVAS_WIDTH;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  // --- Background ---
  if (customBg) {
    ctx.filter = "blur(6px) brightness(0.85)";
    drawImageCover(ctx, customBg, -20, -20, CANVAS_WIDTH + 40, canvasHeight + 40);
    ctx.filter = "none";
  } else {
    const preset = BACKGROUND_PRESETS.find((p) => p.id === backgroundId) ?? BACKGROUND_PRESETS[0];
    ctx.fillStyle = preset.paint(ctx, CANVAS_WIDTH, canvasHeight);
    ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);
  }

  // --- Card shadow + background ---
  const cardX = OUTER_PAD;
  const cardY = OUTER_PAD;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRectPath(ctx, cardX, cardY, CARD_WIDTH, cardHeight, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  let cx = cardX + CARD_PAD;
  let cy = cardY + CARD_PAD;

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
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_DARK;
  ctx.fillText(author.displayName || author.handle || "unknown", nameX, cy + 30);
  ctx.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fillStyle = TEXT_GRAY;
  ctx.fillText(`@${author.handle ?? "unknown"}`, nameX, cy + 58);

  ctx.font = `28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.fillStyle = BRAND_BLUE;
  ctx.fillText("🦋", cardX + CARD_WIDTH - CARD_PAD, cy + 40);
  ctx.textAlign = "left";

  cy += headerHeight + 28;

  // --- Body text ---
  ctx.font = `400 ${BODY_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  drawLines(ctx, bodyLines, cx, cy + BODY_FONT_SIZE, BODY_LINE_HEIGHT, { text: TEXT_DARK, link: BRAND_BLUE });
  cy += textHeight;

  // --- Media ---
  if (embed.images?.length) {
    cy += mediaGap;
    const imgs = await Promise.all(embed.images.map((im) => loadRemoteImage(im.fullsize || im.thumb)));
    drawImagesGrid(ctx, imgs, cx, cy, CONTENT_WIDTH, mediaHeight);
    cy += mediaHeight;
  } else if (embed.video) {
    cy += mediaGap;
    const thumb = await loadRemoteImage(embed.video.thumbnail);
    roundRectPath(ctx, cx, cy, CONTENT_WIDTH, mediaHeight, 16);
    ctx.save();
    ctx.clip();
    if (thumb) drawImageCover(ctx, thumb, cx, cy, CONTENT_WIDTH, mediaHeight);
    else {
      ctx.fillStyle = "#111418";
      ctx.fillRect(cx, cy, CONTENT_WIDTH, mediaHeight);
    }
    ctx.restore();
    const playCx = cx + CONTENT_WIDTH / 2;
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
    drawExternalCard(ctx, embed.external, cx, cy, CONTENT_WIDTH, mediaHeight, await loadRemoteImage(embed.external.thumb));
    cy += mediaHeight;
  }

  // --- Quote embed ---
  if (embed.quote) {
    cy += mediaGap;
    quoteHeight = drawQuote(ctx, embed.quote, cx, cy, CONTENT_WIDTH, quoteLines);
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
  ctx.lineTo(cardX + CARD_WIDTH - CARD_PAD, cy);
  ctx.stroke();
  cy += 34;

  const stats = [
    { icon: drawReplyIcon, count: post.replyCount },
    { icon: drawRepostIcon, count: (post.repostCount ?? 0) + (post.quoteCount ?? 0) },
    { icon: drawHeartIcon, count: post.likeCount },
  ];
  let statX = cx;
  ctx.font = `400 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  for (const stat of stats) {
    stat.icon(ctx, statX + 12, cy, 24);
    ctx.fillStyle = TEXT_GRAY;
    ctx.fillText(formatCount(stat.count), statX + 32, cy + 8);
    statX += 32 + ctx.measureText(formatCount(stat.count)).width + 56;
  }
}

function imagesGridHeight(count, width) {
  if (count === 1) return width * 0.6;
  if (count === 2) return width * 0.42;
  return width * 0.42;
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
