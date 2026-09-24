/**
 * Typographic punctuation for the prose the card draws: curly quotes, em and
 * en dashes, ellipses.
 *
 * Bluesky stores a post exactly as it was typed, which on most keyboards means
 * straight quotes, two hyphens and three dots. A screenshot is a piece of
 * typography, so it gets the real marks.
 *
 * The rules come from SmartyPants (vendored, `vendor/smartypants.js`). This
 * module is the wrapper around it, and exists because SmartyPants was written
 * for HTML and is handed plain text here. Two things follow from that, both
 * handled below: it cannot see what came before the string it is given, and it
 * treats anything that looks like a tag as markup.
 */
import { smartypantsu } from "./vendor/smartypants.js";

/**
 * "q" curly quotes, "e" ellipses, "i" inverted old-school dashes: `--` is an
 * em dash and `---` an en dash.
 *
 * `--` is what people actually type for an em dash, so it gets one. The plain
 * em-dash mode ("d") would leave `---` as an em dash with an orphan hyphen
 * after it; this spends the rare `---` on an en dash instead. Swap to "D" for
 * the old-school convention, where `--` is the en dash and `---` the em.
 *
 * Backticks ("b") are left out: in a post they are far more likely to be code
 * than an attempt at ``quotation''.
 */
const ATTR = "qie";

/**
 * SmartyPants skips the contents of pre, code, kbd, script and math tags. A
 * post is plain text, so a post that merely mentions `<code>` would otherwise
 * turn smartening off for everything after it. Hiding every `<` behind a
 * character no keyboard produces means nothing can look like a tag; it is put
 * back afterwards, untouched, because SmartyPants has no rule for it.
 */
const ANGLE = String.fromCharCode(1);

/**
 * What SmartyPants should think came before the text, given the real character
 * that did.
 *
 * It decides an opening quote from a closing one by looking at the characters
 * either side, so a string handed to it in isolation always reads as if it
 * started a sentence. Prefixing a stand-in character gives it the context and
 * costs one character off the front of the result.
 *
 * A stand-in rather than the real character, so that nothing can merge across
 * the join: a segment ending in `-` followed by one starting with `-` is two
 * hyphens with a link between them, not an em dash.
 */
function contextChar(prev) {
  if (!prev) return "";
  return /[\p{L}\p{N}]/u.test(prev) ? "a" : " ";
}

/**
 * @param {string} text        The text to smarten.
 * @param {string} [precededBy] The character before it, when this text
 *   continues from something else -- the end of a link, say.
 * @returns {string}
 */
export function smartenQuotes(text, precededBy = "") {
  if (!text) return text;
  const prefix = contextChar(precededBy);
  // Only hide angle brackets when there are some, so that text which already
  // contains the stand-in character is never rewritten into one.
  const guard = text.includes("<");
  const smartened = smartypantsu(prefix + (guard ? text.replaceAll("<", ANGLE) : text), ATTR);
  // The stand-in is a letter or a space, which SmartyPants never rewrites, so
  // it is still exactly one character long in the result.
  const out = smartened.slice(prefix.length);
  return guard ? out.replaceAll(ANGLE, "<") : out;
}

/**
 * Smartens the prose in a list of text segments, leaving facet text alone.
 *
 * A link, mention or hashtag is left exactly as the post record has it: those
 * are addresses rather than prose, where a dash is a dash and a dot is a dot.
 * Facets are also byte offsets into the original text, and every mark this
 * module makes is a different length in bytes than what it replaces.
 *
 * Context carries across the whole list, so a quote opened before a link still
 * closes correctly after it.
 *
 * @param {{text: string, link: boolean}[]} segments
 * @returns {{text: string, link: boolean}[]}
 */
export function smartenSegments(segments) {
  let prev = "";
  return segments.map((segment) => {
    const text = segment.link ? segment.text : smartenQuotes(segment.text, prev);
    if (text) prev = text[text.length - 1];
    return { ...segment, text };
  });
}
