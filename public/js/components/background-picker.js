import { BACKGROUND_PRESETS } from "../render-card.js";

/**
 * <background-picker> lets the user choose a preset gradient or upload their
 * own background image. Dispatches "bg-change" with
 * { backgroundId, customBackgroundImage } (a data: URL, or null for presets).
 */
export class BackgroundPicker extends HTMLElement {
  #selectedId = BACKGROUND_PRESETS[0].id;
  #customImage = null;

  connectedCallback() {
    this.render();
  }

  render() {
    const swatches = BACKGROUND_PRESETS.map(
      (preset) => `
        <button type="button" class="swatch ${preset.id === this.#selectedId && !this.#customImage ? "is-selected" : ""}"
          data-id="${preset.id}"
          style="background:${preset.swatch}"
          title="${preset.label}"
          aria-label="${preset.label}"></button>`,
    ).join("");

    this.innerHTML = `
      <div class="background-picker">
        <span class="background-picker__label">Background</span>
        <div class="background-picker__swatches">
          ${swatches}
          <label class="swatch swatch--upload ${this.#customImage ? "is-selected" : ""}" title="Upload your own image">
            ${this.#customImage ? `<img src="${this.#customImage}" alt="Custom background" />` : "+"}
            <input type="file" accept="image/*" hidden />
          </label>
        </div>
      </div>`;

    this.querySelectorAll(".swatch[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.#selectedId = btn.dataset.id;
        this.#customImage = null;
        this.render();
        this.#emit();
      });
    });

    this.querySelector(".swatch--upload input").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.#customImage = reader.result;
        this.render();
        this.#emit();
      };
      reader.readAsDataURL(file);
    });
  }

  #emit() {
    this.dispatchEvent(
      new CustomEvent("bg-change", {
        bubbles: true,
        detail: { backgroundId: this.#selectedId, customBackgroundImage: this.#customImage },
      }),
    );
  }
}

customElements.define("background-picker", BackgroundPicker);
