/**
 * Bluesky's stats-row icons, as the app's own SVG paths.
 *
 * Each path is an outline shape on a 24x24 grid: the stroke is already baked
 * into the outline, so these are filled, not stroked. The subpaths wind in
 * opposite directions, so the canvas default (nonzero) fill leaves the middles
 * hollow -- no fill rule needed.
 *
 * To update an icon, replace its `d` with the path from the Bluesky icon set;
 * the viewBox must stay 24x24 or the sizing math below is wrong.
 */
const ICON_VIEWBOX = 24;

const ICON_PATHS = {
  reply:
    "M2.002 6a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H12.28l-4.762 2.858A1 1 0 0 1 6.002 20v-2h-1a3 3 0 0 1-3-3V6Zm3-1a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v1.234l3.482-2.09a1 1 0 0 1 .514-.144h7.006a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-14Z",
  repost:
    "M17.957 2.293a1 1 0 1 0-1.414 1.414L17.836 5H6a3 3 0 0 0-3 3v3a1 1 0 1 0 2 0V8a1 1 0 0 1 1-1h11.836l-1.293 1.293a1 1 0 1 0 1.414 1.414l2.47-2.47a1.75 1.75 0 0 0 0-2.474l-2.47-2.47ZM20 12a1 1 0 0 1 1 1v3a3 3 0 0 1-3 3H6.164l1.293 1.293a1 1 0 1 1-1.414 1.414l-2.47-2.47a1.75 1.75 0 0 1 0-2.474l2.47-2.47a1 1 0 1 1 1.414 1.414L6.164 17H18a1 1 0 0 0 1-1v-3a1 1 0 0 1 1-1Z",
  like:
    "M16.734 5.091c-1.238-.276-2.708.047-4.022 1.38a1 1 0 0 1-1.424 0C9.974 5.137 8.504 4.814 7.266 5.09c-1.263.282-2.379 1.206-2.92 2.556C3.33 10.343 4.618 14.615 12 19.351c7.382-4.736 8.67-9.008 7.654-11.705-.541-1.35-1.657-2.274-2.92-2.555Zm4.788 1.847c1.482 3.936-.646 9.135-9.021 14.328a1 1 0 0 1-1.002 0C3.124 16.073.996 10.874 2.478 6.938c.778-2.065 2.415-3.507 4.353-3.94 1.71-.38 3.579.045 5.169 1.305 1.59-1.26 3.46-1.684 5.169-1.305 1.938.433 3.575 1.875 4.353 3.94Z",
};

/** Icon names this module can draw. */
export const ICON_NAMES = Object.freeze(Object.keys(ICON_PATHS));

/** The raw path data, exported so tests can check the geometry. */
export function iconPathData(name) {
  const d = ICON_PATHS[name];
  if (!d) throw new Error(`Unknown icon: ${name}`);
  return d;
}

const cache = new Map();

function iconPath(name) {
  if (!cache.has(name)) cache.set(name, new Path2D(iconPathData(name)));
  return cache.get(name);
}

/**
 * Draw one icon centered on (cx, cy).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {"reply"|"repost"|"like"} name
 * @param {number} cx    Center x, in canvas pixels.
 * @param {number} cy    Center y, in canvas pixels.
 * @param {number} size  Width and height of the icon box.
 * @param {string} color Fill color.
 */
export function drawIcon(ctx, name, cx, cy, size, color) {
  const scale = size / ICON_VIEWBOX;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(iconPath(name));
  ctx.restore();
}
