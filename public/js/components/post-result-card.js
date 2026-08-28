import { BACKGROUND_PRESETS, SIZE_PRESETS, renderPostCardSizes } from "../render-card.js";
import { downloadCanvas, screenshotFilename } from "../download-canvas.js";
import { openImageZoom } from "./image-zoom.js";

/**
 * <post-result-card> owns the lifecycle for a single input line: shows a
 * loading state, then either one rendered screenshot per SIZE_PRESETS entry --
 * each separately downloadable, and clickable to zoom -- or an error
 * explanation (parse failure or post not found).
 *
 * When the author has asked not to be shown, the previews are still rendered
 * but sit behind a dismissible cover, and downloading and zooming stay off
 * until it is dismissed.
 */
export class PostResultCard extends HTMLElement {
  static get observedAttributes() {
    return [];
  }

  #post = null;
  #backgroundId = BACKGROUND_PRESETS[0].id;
  #customBackgroundImage = null;
  #status = "loading"; // loading | error | ready
  #restriction = null;
  #coverDismissed = false;
  #drawn = false;
  #message = "";
  #sourceLine = "";

  connectedCallback() {
    this.render();
  }

  setLoading(sourceLine) {
    this.#sourceLine = sourceLine;
    this.#status = "loading";
    this.render();
  }

  setError(sourceLine, message) {
    this.#sourceLine = sourceLine;
    this.#status = "error";
    this.#message = message;
    this.render();
  }

  /** Sets the background to use for the next draw without triggering a redraw itself. */
  primeBackground(backgroundId, customBackgroundImage) {
    this.#backgroundId = backgroundId;
    this.#customBackgroundImage = customBackgroundImage;
  }

  /**
   * @param {string} sourceLine
   * @param {object} post
   * @param {{id: string, message: string}|null} [restriction]  From restrictionFor().
   */
  async setPost(sourceLine, post, restriction = null) {
    this.#sourceLine = sourceLine;
    this.#status = "ready";
    this.#post = post;
    this.#restriction = restriction;
    this.#coverDismissed = false;
    this.#drawn = false;
    this.render();
    await this.#draw();
  }

  /** True while the author's opt-out is still covering the previews. */
  get #covered() {
    return Boolean(this.#restriction) && !this.#coverDismissed;
  }

  /**
   * Downloading and zooming are only offered for previews that are both drawn
   * and not behind a cover. Redrawing (a background change, say) must not
   * quietly switch them back on underneath one.
   */
  #syncControls() {
    const enabled = this.#drawn && !this.#covered;
    this.querySelectorAll(".download-btn, .canvas-wrap").forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  #dismissCover() {
    this.#coverDismissed = true;
    this.querySelector(".content-cover")?.remove();
    this.#syncControls();
  }

  async setBackground(backgroundId, customBackgroundImage) {
    this.#backgroundId = backgroundId;
    this.#customBackgroundImage = customBackgroundImage;
    if (this.#status === "ready") await this.#draw();
  }

  /** Every size's canvas, keyed by size id, as renderPostCardSizes expects. */
  #canvases() {
    return Object.fromEntries(
      SIZE_PRESETS.map((size) => [size.id, this.querySelector(`canvas[data-size-id="${size.id}"]`)]),
    );
  }

  async #draw() {
    const canvases = this.#canvases();
    if (!this.#post || Object.values(canvases).some((c) => !c)) return;

    const wrappers = [...this.querySelectorAll(".canvas-wrap")];
    wrappers.forEach((w) => w.classList.add("is-drawing"));
    try {
      await renderPostCardSizes(canvases, {
        post: this.#post,
        backgroundId: this.#backgroundId,
        customBackgroundImage: this.#customBackgroundImage,
      });
      for (const canvas of Object.values(canvases)) {
        const option = canvas.closest(".size-option");
        const size = SIZE_PRESETS.find((s) => s.id === canvas.dataset.sizeId);
        option.querySelector(".size-option__dims").textContent = `${canvas.width} x ${canvas.height}`;
        // The dimensions are only known once it is drawn.
        option.querySelector(".canvas-wrap").setAttribute(
          "aria-label",
          `Zoom the ${size?.label ?? canvas.dataset.sizeId} screenshot, ${canvas.width} by ${canvas.height}`,
        );
      }
      this.#drawn = true;
      this.#syncControls();
    } catch (err) {
      this.setError(this.#sourceLine, `Couldn't render this post: ${err.message}`);
      return;
    } finally {
      wrappers.forEach((w) => w.classList.remove("is-drawing"));
    }
  }

  #filename(sizeId) {
    return screenshotFilename(this.#post?.author?.handle, sizeId, Date.now());
  }

  #download(sizeId) {
    // The buttons are disabled while covered; this is the backstop.
    if (this.#covered) return;
    const canvas = this.querySelector(`canvas[data-size-id="${sizeId}"]`);
    if (canvas) downloadCanvas(canvas, this.#filename(sizeId));
  }

  #zoom(sizeId) {
    if (this.#covered) return;
    const canvas = this.querySelector(`canvas[data-size-id="${sizeId}"]`);
    if (!canvas) return;
    const label = SIZE_PRESETS.find((s) => s.id === sizeId)?.label ?? sizeId;
    openImageZoom({ canvas, label, filename: this.#filename(sizeId) });
  }

  render() {
    if (this.#status === "loading") {
      this.innerHTML = `
        <div class="result-card result-card--loading">
          <p class="source-line">${escapeHtml(this.#sourceLine)}</p>
          <p class="status">Fetching post…</p>
        </div>`;
      return;
    }

    if (this.#status === "error") {
      this.innerHTML = `
        <div class="result-card result-card--error">
          <p class="source-line">${escapeHtml(this.#sourceLine)}</p>
          <p class="status status--error">⚠️ ${escapeHtml(this.#message)}</p>
        </div>`;
      return;
    }

    // ready
    const options = SIZE_PRESETS.map(
      (size) => `
        <figure class="size-option">
          <button
            type="button"
            class="canvas-wrap"
            data-size-id="${size.id}"
            aria-label="Zoom the ${escapeHtml(size.label)} screenshot"
            disabled
          >
            <canvas data-size-id="${size.id}"></canvas>
          </button>
          <figcaption class="size-option__caption">
            <span class="size-option__label">${escapeHtml(size.label)}</span>
            <span class="size-option__dims"></span>
          </figcaption>
          <button type="button" class="download-btn" data-size-id="${size.id}" disabled>
            Download PNG
          </button>
        </figure>`,
    ).join("");

    const cover = this.#covered
      ? `
        <div class="content-cover">
          <p class="content-cover__message">${escapeHtml(this.#restriction.message)}</p>
          <button type="button" class="content-cover__dismiss">Show anyway</button>
        </div>`
      : "";

    this.innerHTML = `
      <div class="result-card result-card--ready">
        <p class="source-line">${escapeHtml(this.#sourceLine)}</p>
        <div class="covered-area">
          <div class="size-grid">${options}</div>
          ${cover}
        </div>
      </div>`;

    this.querySelector(".content-cover__dismiss")?.addEventListener("click", () => this.#dismissCover());

    this.querySelectorAll(".download-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.#download(btn.dataset.sizeId));
    });

    this.querySelectorAll(".canvas-wrap").forEach((btn) => {
      btn.addEventListener("click", () => this.#zoom(btn.dataset.sizeId));
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

customElements.define("post-result-card", PostResultCard);
