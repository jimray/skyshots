import { parsePostReference, fetchPosts, restrictionFor, PostInputError } from "./atproto.js";
import { BACKGROUND_PRESETS } from "./render-card.js";
import "./components/post-result-card.js";
import "./components/background-picker.js";

const form = document.getElementById("post-form");
const textarea = document.getElementById("post-urls");
const results = document.getElementById("results");
const generateBtn = document.getElementById("generate-btn");
const bgPicker = document.getElementById("bg-picker");

let currentBackground = { backgroundId: BACKGROUND_PRESETS[0].id, customBackgroundImage: null };

bgPicker.addEventListener("bg-change", (e) => {
  currentBackground = e.detail;
  for (const card of results.querySelectorAll("post-result-card")) {
    card.setBackground(currentBackground.backgroundId, currentBackground.customBackgroundImage);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const lines = textarea.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return;

  generateBtn.disabled = true;
  generateBtn.textContent = "Generating…";
  results.innerHTML = "";

  const cards = lines.map(() => {
    const card = document.createElement("post-result-card");
    results.append(card);
    return card;
  });

  const refs = [];
  const parseErrors = new Map();
  lines.forEach((line, i) => {
    cards[i].setLoading(line);
    try {
      refs.push({ index: i, ...parsePostReference(line) });
    } catch (err) {
      if (err instanceof PostInputError) {
        parseErrors.set(i, err.message);
      } else {
        parseErrors.set(i, `Unexpected error: ${err.message}`);
      }
    }
  });

  try {
    const resolved = refs.length ? await fetchPosts(refs) : [];
    const byIndex = new Map(resolved.map((r, j) => [refs[j].index, r]));

    for (let i = 0; i < lines.length; i++) {
      if (parseErrors.has(i)) {
        cards[i].setError(lines[i], parseErrors.get(i));
        continue;
      }
      const result = byIndex.get(i);
      if (!result?.post) {
        cards[i].setError(lines[i], "Post not found. It may have been deleted, or the link/URI is incorrect.");
        continue;
      }
      const restriction = restrictionFor(result.post, result.hiddenFromRecommendations);
      cards[i].primeBackground(currentBackground.backgroundId, currentBackground.customBackgroundImage);
      cards[i].setPost(lines[i], result.post, restriction).catch((err) => {
        cards[i].setError(lines[i], err.message);
      });
    }
  } catch (err) {
    for (let i = 0; i < lines.length; i++) {
      if (!parseErrors.has(i)) cards[i].setError(lines[i], `Network/API error: ${err.message}`);
    }
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generate screenshots";
  }
});
