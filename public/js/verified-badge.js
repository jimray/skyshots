/**
 * The blue verification check Bluesky puts after a verified account's display
 * name, as the app's own SVG.
 *
 * Unlike the stats-row icons in `bsky-icons.js`, this is two colours -- a
 * filled disc with a solid check on top -- so it does not fit that module's
 * single-colour outline contract and lives here instead.
 *
 * The geometry is the app's 24x24 grid: disc at (12,12) with radius 11.5, and
 * the check drawn over it. To update it, replace the path and keep the grid.
 */
const BADGE_VIEWBOX = 24;
const DISC_RADIUS = 11.5;

/** Bluesky's verification blue, which is not the brand blue of the logo. */
export const BADGE_BLUE = "#006AFF";

const CHECK_PATH =
  "M17.659 8.175a1.361 1.361 0 0 1 0 1.925l-6.224 6.223a1.361 1.361 0 0 1-1.925 0L6.4 13.212a1.361 1.361 0 0 1 1.925-1.925l2.149 2.148 5.26-5.26a1.361 1.361 0 0 1 1.925 0Z";

/** The raw path data, exported so tests can check the geometry. */
export function checkPathData() {
  return CHECK_PATH;
}

let checkPath;

/**
 * Draws the badge from its top-left corner.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x     Left edge, in canvas pixels.
 * @param {number} y     Top edge, in canvas pixels.
 * @param {number} size  Width and height of the badge box.
 */
export function drawVerifiedBadge(ctx, x, y, size) {
  if (!checkPath) checkPath = new Path2D(CHECK_PATH);
  const scale = size / BADGE_VIEWBOX;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.beginPath();
  ctx.arc(BADGE_VIEWBOX / 2, BADGE_VIEWBOX / 2, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = BADGE_BLUE;
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fill(checkPath);
  ctx.restore();
}

// Both taken from the app, where a 14px badge follows a 16px name: the badge
// is a little smaller than the name it belongs to, and the gap is small enough
// that the two read as one unit.
const SIZE_RATIO = 14 / 16;
const GAP_RATIO = 4 / 16;

// These fonts put their cap height at about 0.71em, so the middle of a capital
// letter is about half that above the baseline. Centering the badge there sits
// it on the letters rather than hanging it off the baseline.
const CAP_CENTER_RATIO = 0.355;

/**
 * Where the badge goes for a name already drawn at `nameX` with `fontSize`.
 *
 * Everything is derived from the font size, so the header's type can change
 * without anyone having to work these numbers out again.
 *
 * @param {{nameX: number, nameWidth: number, baseline: number, fontSize: number}} name
 *   `nameWidth` is what `measureText` reports for the drawn name.
 * @returns {{x: number, y: number, size: number}} Top-left corner and box size.
 */
export function badgePlacement({ nameX, nameWidth, baseline, fontSize }) {
  const size = fontSize * SIZE_RATIO;
  return {
    x: nameX + nameWidth + fontSize * GAP_RATIO,
    y: baseline - fontSize * CAP_CENTER_RATIO - size / 2,
    size,
  };
}
