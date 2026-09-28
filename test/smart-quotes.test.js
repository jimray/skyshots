import { test } from "node:test";
import assert from "node:assert/strict";

import { smartenQuotes, smartenSegments } from "../public/js/smart-quotes.js";

const EM = "\u2014";
const EN = "\u2013";
const ELLIPSIS = "\u2026";

const cases = [
  ["don't", "don’t", "apostrophe inside a word"],
  ["it's the cat's bowl", "it’s the cat’s bowl", "several apostrophes"],
  ["dogs' bowls", "dogs’ bowls", "a plural possessive, which closes rather than opens"],
  ["rock'n'roll", "rock’n’roll", "apostrophes on both sides of a letter"],
  ['"hello"', "“hello”", "a quoted word"],
  ['He said "hi" and left.', "He said “hi” and left.", "a quote mid-sentence"],
  ["'quoted'", "‘quoted’", "single quotes"],
  ['"\'nested\'"', "“‘nested’”", "single quotes inside double"],
  ["the '90s", "the ’90s", "an elided decade, which closes rather than opens"],
  ['("x")', "(“x”)", "a quote opening after a bracket"],
  ['"start of the post', "“start of the post", "a quote at the very start"],
  ["nothing to do here", "nothing to do here", "text with no quotes at all"],
  ["", "", "an empty string"],
  ["“already curly”", "“already curly”", "quotes that are already curly"],
  ['say "it\'s fine"', "say “it’s fine”", "an apostrophe inside a quotation"],
  ['a line\n"a new one"', "a line\n“a new one”", "a quote after a newline"],
];

for (const [input, expected, what] of cases) {
  test(`smartens ${what}`, () => {
    assert.equal(smartenQuotes(input), expected, JSON.stringify(input));
  });
}

test("a quote knows what came before it, even across a segment boundary", () => {
  // A post can read `see bsky.app"` -- the closing quote's context is the end
  // of the link segment before it, not the start of its own segment. The mark
  // is read from both sides, so what follows has a say too; these cases differ
  // only in what precedes them.
  assert.equal(smartenQuotes('"word', "p"), "”word", "after a letter, it closes");
  assert.equal(smartenQuotes('"word', " "), "“word", "after a space, it opens");
  assert.equal(smartenQuotes('"word'), "“word", "with nothing before it, it opens");
});

test("text inside a link, mention or hashtag is left exactly as it was", () => {
  // Facets are byte offsets into the original post text, and a curly quote is
  // three bytes where a straight one is one. Smartening a facet's own text
  // would be wrong on screen and would misalign anything measured from it.
  const segments = [
    { text: "read ", link: false },
    { text: "example.com/it's-here", link: true },
    { text: " it's good", link: false },
  ];
  const out = smartenSegments(segments);
  assert.equal(out[1].text, "example.com/it's-here", "the link should be untouched");
  assert.equal(out[2].text, " it’s good", "the prose around it should not be");
});

test("smartening a segment list leaves its shape alone", () => {
  const segments = [{ text: "a", link: false }, { text: "b", link: true }];
  const out = smartenSegments(segments);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((s) => s.link), [false, true], "link flags should survive");
});

test("context carries across segments, so a quote opened before a link closes after it", () => {
  const segments = [
    { text: 'she said "go to ', link: false },
    { text: "bsky.app", link: true },
    { text: '" and left', link: false },
  ];
  const [a, , c] = smartenSegments(segments);
  assert.equal(a.text, "she said “go to ", "opens before the link");
  assert.equal(c.text, "” and left", "and closes after it, because the link's last char is a letter");
});

test("an empty segment does not lose the context around it", () => {
  const segments = [{ text: "hi", link: false }, { text: "", link: true }, { text: '" there', link: false }];
  const out = smartenSegments(segments);
  assert.equal(out[2].text, "” there", "should still see the 'i' two segments back");
});

// --- Dashes and ellipses ---

test("two dashes become an em dash, which is what people mean by them", () => {
  assert.equal(smartenQuotes("wait -- what"), `wait ${EM} what`);
  assert.equal(smartenQuotes("a--b"), `a${EM}b`, "with or without spaces around them");
});

test("three dashes become an en dash rather than an em dash with a hyphen stuck to it", () => {
  // The library's plain em-dash mode leaves "---" as an em dash plus an orphan
  // hyphen. Inverted old-school shorthand spends the rare "---" on an en dash
  // and keeps the common "--" as the em dash.
  assert.equal(smartenQuotes("wait --- what"), `wait ${EN} what`);
});

test("three dots become an ellipsis", () => {
  assert.equal(smartenQuotes("hmm..."), `hmm${ELLIPSIS}`);
  assert.equal(smartenQuotes("well... maybe"), `well${ELLIPSIS} maybe`);
});

test("a single hyphen is left alone", () => {
  assert.equal(smartenQuotes("a well-known post"), "a well-known post");
});

test("quotes, dashes and ellipses all at once", () => {
  assert.equal(
    smartenQuotes('she said "wait -- what..." and left'),
    `she said \u201Cwait ${EM} what${ELLIPSIS}\u201D and left`,
  );
});

// --- The library expects HTML; a post is not HTML ---

test("a post that mentions a tag name is still smartened", () => {
  // The library skips the contents of pre, code, kbd, script and math tags. A
  // post is plain text, so an unclosed <code> in it would otherwise turn
  // smartening off for everything after it.
  assert.equal(
    smartenQuotes('use <code> for this "thing"'),
    'use <code> for this \u201Cthing\u201D',
  );
  assert.equal(smartenQuotes('x <pre> "y"'), 'x <pre> \u201Cy\u201D');
});

test("angle brackets survive exactly as they were typed", () => {
  assert.equal(smartenQuotes("i <3 you"), "i <3 you");
  assert.equal(smartenQuotes("if a < b then c"), "if a < b then c");
  assert.equal(smartenQuotes('my <b>bold</b> take'), "my <b>bold</b> take");
});

test("a link keeps its dashes and dots, whatever they look like", () => {
  const segments = [
    { text: "see ", link: false },
    { text: "example.com/a--b...c", link: true },
    { text: " -- it's good...", link: false },
  ];
  const out = smartenSegments(segments);
  assert.equal(out[1].text, "example.com/a--b...c", "the link is an address, not prose");
  assert.equal(out[2].text, ` ${EM} it\u2019s good${ELLIPSIS}`, "the prose around it is prose");
});

test("a post containing the character used to hide angle brackets is not corrupted", () => {
  // The guard swaps every "<" for a control character no keyboard produces and
  // swaps it back afterwards. A post that somehow contains that character
  // already must not come out the other side as a "<".
  const odd = `a ${String.fromCharCode(1)} b`;
  assert.equal(smartenQuotes(odd), odd, "left alone when there is no < to hide");
});
