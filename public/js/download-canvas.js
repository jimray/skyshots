/**
 * Turning a rendered canvas into a file the browser saves.
 *
 * Both the result card and the zoom overlay download the same images, so the
 * naming and the save both live here rather than in either component.
 */

/**
 * Builds the download filename for one screenshot.
 *
 * The size id is part of the name so a post's two sizes cannot overwrite each
 * other, and the handle is reduced to characters that are safe in a filename
 * -- a handle is normally a domain, but nothing here should be able to steer
 * the save anywhere except the downloads folder.
 *
 * @param {string|null|undefined} handle  Author handle, if known.
 * @param {string} sizeId                 A SIZE_PRESETS id.
 * @param {number} timestamp              Milliseconds, to keep repeat saves distinct.
 */
export function screenshotFilename(handle, sizeId, timestamp) {
  const safe = String(handle || "post").replace(/[^a-zA-Z0-9.-]/g, "-").replace(/\.{2,}/g, ".");
  return `bluesky-${safe}-${sizeId}-${timestamp}.png`;
}

/** Saves `canvas` as a PNG called `filename`. */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
