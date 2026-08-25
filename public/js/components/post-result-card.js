import { BACKGROUND_PRESETS, renderPostCard } from "../render-card.js";

/**
 * <post-result-card> owns the lifecycle for a single input line: shows a
 * loading state, then either the rendered screenshot + download button, or
 * an error explanation (parse failure, not found, or logged-out-restricted).
 */
export class PostResultCard extends HTMLElement {
  static get observedAttributes() {
    return [];
  }

  #post = null;
  #backgroundId = BACKGROUND_PRESETS[0].id;
  #customBackgroundImage = null;
  #status = "loading"; // loading | restricted | error | ready
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

  setRestricted(sourceLine, post) {
    this.#sourceLine = sourceLine;
    this.#status = "restricted";
    this.#post = post;
    this.render();
  }

  /** Sets the background to use for the next draw without triggering a redraw itself. */
  primeBackground(backgroundId, customBackgroundImage) {
    this.#backgroundId = backgroundId;
    this.#customBackgroundImage = customBackgroundImage;
  }

  async setPost(sourceLine, post) {
    this.#sourceLine = sourceLine;
    this.#status = "ready";
    this.#post = post;
    this.render();
    await this.#draw();
  }

  async setBackground(backgroundId, customBackgroundImage) {
    this.#backgroundId = backgroundId;
    this.#customBackgroundImage = customBackgroundImage;
    if (this.#status === "ready") await this.#draw();
  }

  async #draw() {
    const canvas = this.querySelector("canvas");
    if (!canvas || !this.#post) return;
    const wrapper = this.querySelector(".canvas-wrap");
    wrapper.classList.add("is-drawing");
    try {
      await renderPostCard(canvas, {
        post: this.#post,
        backgroundId: this.#backgroundId,
        customBackgroundImage: this.#customBackgroundImage,
      });
      const downloadBtn = this.querySelector(".download-btn");
      downloadBtn.disabled = false;
    } catch (err) {
      this.setError(this.#sourceLine, `Couldn't render this post: ${err.message}`);
      return;
    } finally {
      wrapper.classList.remove("is-drawing");
    }
  }

  #download() {
    const canvas = this.querySelector("canvas");
    if (!canvas) return;
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const handle = this.#post?.author?.handle ?? "post";
      const a = document.createElement("a");
      a.href = url;
      a.download = `bluesky-${handle}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
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

    if (this.#status === "restricted") {
      const handle = this.#post?.author?.handle ?? "this account";
      this.innerHTML = `
        <div class="result-card result-card--restricted">
          <p class="source-line">${escapeHtml(this.#sourceLine)}</p>
          <p class="status status--restricted">
            🔒 <strong>@${escapeHtml(handle)}</strong> has enabled
            <em>"Discourage apps from showing my account to logged-out users"</em>
            in their Bluesky settings. This tool respects that preference and
            won't generate a screenshot for this post.
          </p>
        </div>`;
      return;
    }

    // ready
    this.innerHTML = `
      <div class="result-card result-card--ready">
        <p class="source-line">${escapeHtml(this.#sourceLine)}</p>
        <div class="canvas-wrap">
          <canvas></canvas>
        </div>
        <button type="button" class="download-btn" disabled>Download PNG</button>
      </div>`;
    this.querySelector(".download-btn").addEventListener("click", () => this.#download());
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

customElements.define("post-result-card", PostResultCard);
