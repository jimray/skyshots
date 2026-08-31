/**
 * How long the browser may reuse a served file without asking again.
 *
 * The app's HTML and its modules have to move together: index.html says which
 * elements exist and main.js reaches for them at import time. Serving the HTML
 * fresh while a module came from cache means a browser can run old code
 * against new markup, which does not degrade gracefully -- a module that
 * throws while loading never attaches its event listeners, and the page
 * silently does nothing.
 *
 * With no build step there are no content-hashed filenames to lean on, so code
 * and markup are always revalidated. Images are exempt: a stale background is
 * a cosmetic problem, not a broken page, and they are far larger.
 */
const CACHEABLE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"]);
const ONE_HOUR = 3600;

/**
 * @param {string} extension  A file extension including the dot, e.g. ".js".
 * @returns {string} A Cache-Control header value.
 */
export function cacheControlFor(extension) {
  const ext = String(extension ?? "").toLowerCase();
  return CACHEABLE_EXTENSIONS.has(ext) ? `public, max-age=${ONE_HOUR}` : "no-cache";
}
