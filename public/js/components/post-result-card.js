import {
  BACKGROUND_PRESETS,
  SIZE_PRESETS,
  preparePostCard,
  resolveBackground,
  drawPreparedCard,
} from "../render-card.js";
import { downloadCanvas, screenshotFilename } from "../download-canvas.js";
import { postUrl } from "../atproto.js";
import { openImageZoom } from "./image-zoom.js";
import "./background-picker.js";

/**
 * <post-result-card> owns the lifecycle for a single input line: shows a
 * loading state, then either the rendered screenshot -- with buttons to switch
 * output size, downloadable, and clickable to zoom -- or an error explanation
 * (parse failure or post not found).
 *
 * Each card carries its own background picker, so a background is chosen per
 * post. The post and the background are prepared once and cached, so switching
 * size is a redraw with no network, and switching background reloads only the
 * background.
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
  #sizeId = SIZE_PRESETS[0].id;
  #copyResetTimer = null;
  #prepared = null;
  #background = null;
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
    this.#prepared = null;
    this.#background = null;
    this.#sizeId = SIZE_PRESETS[0].id;
    this.render();
    await this.#draw();
  }

  /** Switches output size. Redraws from the cache; touches no network. */
  async #setSize(sizeId) {
    if (sizeId === this.#sizeId) return;
    this.#sizeId = sizeId;
    for (const btn of this.querySelectorAll(".size-tab")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.sizeId === sizeId));
    }
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
    this.#background = null; // Resolve the new one on the next draw.
    if (this.#status === "ready") await this.#draw();
  }

  async #draw() {
    const canvas = this.querySelector("canvas");
    if (!canvas || !this.#post) return;

    const wrapper = this.querySelector(".canvas-wrap");
    wrapper.classList.add("is-drawing");
    try {
      // Each half is cached independently: a size switch reuses both, a
      // background switch reuses the prepared post.
      this.#prepared ??= await preparePostCard({ post: this.#post });
      this.#background ??= await resolveBackground({
        backgroundId: this.#backgroundId,
        customBackgroundImage: this.#customBackgroundImage,
      });

      drawPreparedCard(canvas, this.#prepared, this.#background, this.#sizeId);

      const label = SIZE_PRESETS.find((s) => s.id === this.#sizeId)?.label ?? this.#sizeId;
      this.querySelector(".size-option__dims").textContent = `${canvas.width} x ${canvas.height}`;
      wrapper.setAttribute("aria-label", `Zoom the ${label} screenshot, ${canvas.width} by ${canvas.height}`);

      this.#drawn = true;
      this.#syncControls();
    } catch (err) {
      this.setError(this.#sourceLine, `Couldn't render this post: ${err.message}`);
      return;
    } finally {
      wrapper.classList.remove("is-drawing");
    }
  }

  async #copyUrl() {
    const url = postUrl(this.#post);
    if (!url) return;
    const btn = this.querySelector(".copy-btn");
    const status = this.querySelector(".post-url [role='status']");
    try {
      await writeToClipboard(url);
      btn.textContent = "Copied";
      btn.classList.add("is-copied");
      // The button's own label change is not reliably announced, so say it here.
      status.textContent = `Copied ${url} to the clipboard`;
    } catch {
      btn.textContent = "Copy failed";
      status.textContent = "Could not copy the URL to the clipboard";
    }
    clearTimeout(this.#copyResetTimer);
    this.#copyResetTimer = setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("is-copied");
      status.textContent = "";
    }, 1600);
  }

  #filename() {
    return screenshotFilename(this.#post?.author?.handle, this.#sizeId, Date.now());
  }

  #download() {
    // The buttons are disabled while covered; this is the backstop.
    if (this.#covered) return;
    const canvas = this.querySelector("canvas");
    if (canvas) downloadCanvas(canvas, this.#filename());
  }

  #zoom() {
    if (this.#covered) return;
    const canvas = this.querySelector("canvas");
    if (!canvas) return;
    const label = SIZE_PRESETS.find((s) => s.id === this.#sizeId)?.label ?? this.#sizeId;
    openImageZoom({ canvas, label, filename: this.#filename() });
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
    const url = postUrl(this.#post);

    const tabs = SIZE_PRESETS.map(
      (size) => `
        <button
          type="button"
          class="size-tab"
          data-size-id="${size.id}"
          aria-pressed="${size.id === this.#sizeId}"
        >${escapeHtml(size.label)}</button>`,
    ).join("");

    const cover = this.#covered
      ? `
        <div class="content-cover">
          <p class="content-cover__message">${escapeHtml(this.#restriction.message)}</p>
          <button type="button" class="content-cover__dismiss">Show anyway</button>
        </div>`
      : "";

    // With no canonical URL to build there is nothing to link or copy, so fall
    // back to showing the line as it was typed.
    const header = url
      ? `
        <div class="post-url">
          <a class="post-url__link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
            >${escapeHtml(url.replace(/^https:\/\//, ""))}</a>
          <button type="button" class="copy-btn" aria-label="Copy the post URL">Copy</button>
          <span class="visually-hidden" role="status" aria-live="polite"></span>
        </div>`
      : `<p class="source-line">${escapeHtml(this.#sourceLine)}</p>`;

    this.innerHTML = `
      <div class="result-card result-card--ready">
        ${header}
        <background-picker class="card-bg-picker"></background-picker>
        <div class="preview-row">
          <div class="size-tabs" role="group" aria-label="Output size">${tabs}</div>
          <div class="preview-col">
            <div class="covered-area">
              <figure class="size-option">
                <button type="button" class="canvas-wrap" disabled>
                  <canvas></canvas>
                </button>
                <figcaption class="size-option__caption">
                  <span class="size-option__dims"></span>
                </figcaption>
              </figure>
              ${cover}
            </div>
          </div>
        </div>
        <button type="button" class="download-btn" disabled>Download PNG</button>
      </div>`;

    this.querySelectorAll(".size-tab").forEach((btn) => {
      btn.addEventListener("click", () => this.#setSize(btn.dataset.sizeId));
    });
    this.querySelector(".download-btn").addEventListener("click", () => this.#download());
    this.querySelector(".canvas-wrap").addEventListener("click", () => this.#zoom());
    this.querySelector(".copy-btn")?.addEventListener("click", () => this.#copyUrl());
    this.querySelector("background-picker").addEventListener("bg-change", (e) => {
      e.stopPropagation();
      this.setBackground(e.detail.backgroundId, e.detail.customBackgroundImage);
    });
    this.querySelector(".content-cover__dismiss")?.addEventListener("click", () => this.#dismissCover());
  }
}

/**
 * Copies text, preferring the async clipboard API and falling back to a
 * throwaway textarea where that is unavailable (a page served over plain HTTP
 * from anything other than localhost).
 */
async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const scratch = document.createElement("textarea");
  scratch.value = text;
  scratch.setAttribute("readonly", "");
  scratch.style.position = "fixed";
  scratch.style.opacity = "0";
  document.body.append(scratch);
  scratch.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy rejected");
  } finally {
    scratch.remove();
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

customElements.define("post-result-card", PostResultCard);
