import { downloadCanvas } from "../download-canvas.js";

/**
 * <image-zoom> shows one rendered screenshot enlarged, centered on the page.
 *
 * It wraps a native <dialog> opened with showModal(), which is what provides
 * Esc-to-close, the focus trap, the inert page behind it, and the ::backdrop
 * layer -- none of that is reimplemented here.
 *
 * A single instance is created on first use and reused, rather than one dialog
 * per result card.
 */
export class ImageZoom extends HTMLElement {
  #canvas = null;
  #objectUrl = null;
  #filename = "";
  /* Bumped on every open and close, so a toBlob callback that arrives after
     the dialog moved on can tell that it is stale. */
  #openId = 0;

  connectedCallback() {
    this.innerHTML = `
      <dialog class="zoom">
        <form method="dialog" class="zoom__dismiss">
          <button class="zoom__close" aria-label="Close">&times;</button>
        </form>
        <img class="zoom__image" alt="" />
        <p class="zoom__caption">
          <span class="zoom__label"></span>
          <span class="zoom__dims"></span>
        </p>
        <button type="button" class="zoom__download">Download PNG</button>
      </dialog>`;

    const dialog = this.querySelector("dialog");

    // A click that lands on the dialog itself rather than its contents is a
    // click on the backdrop area.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });

    // Fires for the close button, Esc, and the backdrop alike.
    dialog.addEventListener("close", () => this.#releaseImage());

    this.querySelector(".zoom__download").addEventListener("click", () => {
      if (this.#canvas) downloadCanvas(this.#canvas, this.#filename);
    });
  }

  #releaseImage() {
    this.#openId += 1;
    if (this.#objectUrl) {
      URL.revokeObjectURL(this.#objectUrl);
      this.#objectUrl = null;
    }
    this.querySelector(".zoom__image").removeAttribute("src");
    this.#canvas = null;
  }

  /**
   * @param {HTMLCanvasElement} canvas  The already-rendered preview.
   * @param {string} label              Size name, for the caption.
   * @param {string} filename           Name to save under.
   */
  open({ canvas, label, filename }) {
    this.#releaseImage();
    const openId = this.#openId;
    this.#canvas = canvas;
    this.#filename = filename;

    const img = this.querySelector(".zoom__image");
    img.alt = `${label} screenshot of the post, enlarged`;
    // Never enlarge past the image's own pixels; the rest of the fitting is CSS.
    img.style.maxWidth = `min(${canvas.width}px, 92vw)`;

    this.querySelector(".zoom__label").textContent = label;
    this.querySelector(".zoom__dims").textContent = `${canvas.width} x ${canvas.height}`;

    // Open first, fill in the image when the blob is ready, so the click feels
    // immediate on a large canvas.
    this.querySelector("dialog").showModal();
    canvas.toBlob((blob) => {
      if (!blob) return;
      // Closed again, or reopened on another image, while this was encoding.
      if (openId !== this.#openId) return;
      this.#objectUrl = URL.createObjectURL(blob);
      img.src = this.#objectUrl;
    }, "image/png");
  }
}

customElements.define("image-zoom", ImageZoom);

let overlay = null;

/** Opens the shared zoom overlay, creating it on first use. */
export function openImageZoom(options) {
  if (!overlay) {
    overlay = document.createElement("image-zoom");
    document.body.append(overlay);
  }
  overlay.open(options);
}
