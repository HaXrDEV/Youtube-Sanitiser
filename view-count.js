/**
 * YouTube Sanitiser: view count reading
 * Reads a view count in any language without knowing the language. The number
 * is read by its digits and separators, and its magnitude word ("K", "mio.",
 * "万") is looked up in the browser's own number formatting data, or among
 * words learned from YouTube itself. The manifest loads this file before
 * content.js, and the tests in tests/ load it on its own.
 */

// ─── Digits and words ─────────────────────────────────────────────────────────

const digitValues = new Map();

/** The value of any Unicode decimal digit: digits come in runs of ten, 0 to 9. */
function digitValue(ch) {
  let value = digitValues.get(ch);
  if (value === undefined) {
    let start = ch.codePointAt(0);
    while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--;
    value = (ch.codePointAt(0) - start) % 10;
    digitValues.set(ch, value);
  }
  return value;
}

/** Text with the decimal digits of every script ("١٢", "۱۲", "१२") written as 0-9. */
function toAsciiDigits(text) {
  return text.replace(/\p{Nd}/gu, ch => (ch <= '9' ? ch : String(digitValue(ch))));
}

/**
 * A word in the form words are compared in. Case, dots, spaces and invisible
 * formatting marks (like the direction marks Hebrew and Arabic put around
 * numbers) don't matter, so "Mio." and "mio" are the same word.
 */
function normalizeWord(word) {
  return word.normalize('NFKC').toLowerCase().replace(/[\s.\p{Cf}]/gu, '');
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

// Digits joined by separators ("12.941", "1,2", Arabic "١٢٬٩٤١") or by a space
// before a group of three ("12 941")
const NUMBER_RE = /\d+(?:(?:[.,'\u2019\u066b\u066c]|\s(?=\d{3}(?!\d)))\d+)*/u;

/**
 * Find the first number in text. Returns its digit groups (the runs of digits
 * between separators) and the words before and after it, or null.
 */
function readNumber(text) {
  const t = toAsciiDigits(text.replace(/\p{Cf}/gu, ''));
  const m = t.match(NUMBER_RE);
  if (!m) return null;
  const words = s => s.split(/\s+/).filter(Boolean);
  return {
    groups: m[0].split(/\D+/),
    before: words(t.slice(0, m.index)),
    after: words(t.slice(m.index + m[0].length)),
  };
}

/**
 * The value of a count written in full ("12.941", "12 941", "12,34,567"). View
 * counts are whole numbers, so every separator groups digits: threes, or twos
 * before the last three in Indian numbering. Returns null when the groups
 * aren't laid out like that.
 */
function wholeNumber(groups) {
  const last = groups.length - 1;
  const grouped = groups.every((group, i) =>
    i === 0 ? last === 0 || group.length <= 3
      : i === last ? group.length === 3
        : group.length === 2 || group.length === 3);
  return grouped ? Number(groups.join('')) : null;
}

/**
 * The number in front of a magnitude word ("1,2" in "1,2 mio."). A last
 * separator before one or two digits is the decimal point; any other separator
 * groups digits. Returns null when the groups don't fit either.
 */
function mantissa(groups) {
  const last = groups.length - 1;
  if (last > 0 && groups[last].length <= 2) {
    const whole = wholeNumber(groups.slice(0, last));
    return whole === null ? null : Number(`${whole}.${groups[last]}`);
  }
  return wholeNumber(groups);
}

// ─── Magnitude words ──────────────────────────────────────────────────────────

// Numbers the browser is asked to abbreviate, to collect every form of each
// magnitude word, plural forms included ("tysiąc", "tysiące", "tysięcy")
const SAMPLE_NUMBERS = [1, 1.2, 2, 3, 5, 9.9, 11, 21, 22, 25, 99, 101, 123];

// A language rarely needs more than a handful of learned words, so this only
// guards against filling storage
const MAX_LEARNED_WORDS = 30;

/**
 * The power of ten that ratio is close to (within YouTube's rounding), or null.
 * Abbreviations start at thousands, so smaller powers don't count.
 */
function powerOfTen(ratio) {
  const exponent = Math.round(Math.log10(ratio));
  return exponent >= 3 && Math.abs(Math.log10(ratio) - exponent) < 0.1 ? 10 ** exponent : null;
}

/**
 * The browser's own magnitude words for a language, from its compact number
 * formatting in short and long form ("1,2 mio.", "1,2 millioner"), mapped to
 * the power of ten each one stands for.
 */
function browserMagnitudes(lang) {
  const magnitudes = new Map();
  for (const compactDisplay of ['short', 'long']) {
    let format;
    try {
      format = new Intl.NumberFormat(lang, { notation: 'compact', compactDisplay, maximumFractionDigits: 1 });
    } catch {
      break; // not a language the browser can format
    }
    for (let exponent = 3; exponent <= 13; exponent++) {
      for (const sample of SAMPLE_NUMBERS) {
        const value = sample * 10 ** exponent;
        const parts = format.formatToParts(value);
        const word = normalizeWord(parts.filter(p => p.type === 'compact').map(p => p.value).join(''));
        const shown = parseFloat(toAsciiDigits(parts.map(p =>
          p.type === 'integer' || p.type === 'fraction' ? p.value : p.type === 'decimal' ? '.' : ''
        ).join('')));
        const magnitude = powerOfTen(value / shown);
        if (word && magnitude && !magnitudes.has(word)) magnitudes.set(word, magnitude);
      }
    }
  }
  return magnitudes;
}

/**
 * The magnitude words for one page language: the browser's, plus words learned
 * on YouTube where the browser has none. learned maps normalised words to
 * magnitudes and is updated in place. useBrowser=false leaves out the
 * browser's words, as in a browser without data for the language.
 */
function createMagnitudes(lang, learned = {}, { useBrowser = true } = {}) {
  const browser = useBrowser ? browserMagnitudes(lang) : new Map();
  return {
    lookup(word) {
      const w = normalizeWord(word);
      return browser.get(w) ?? learned[w] ?? null;
    },
    /** Remember a word's magnitude. Returns true when that's new. */
    learn(word, magnitude) {
      const w = normalizeWord(word);
      if (!w || /\d/.test(w) || browser.has(w) || learned[w] === magnitude) return false;
      if (!(w in learned) && Object.keys(learned).length >= MAX_LEARNED_WORDS) return false;
      learned[w] = magnitude;
      return true;
    },
  };
}

// ─── Reading counts ───────────────────────────────────────────────────────────

/**
 * Read a view count: a number, with at most a magnitude word next to it
 * ("12 941", "1,2 mio.", "114万"). Anything else, like "watching" in
 * "38 watching", an upload age, or a word that isn't a known magnitude, gives
 * null, so a count that can't be read for certain leaves the video visible.
 */
function parseCount(text, magnitudes) {
  const number = readNumber(text);
  if (!number) return null;
  const word = [...number.before, ...number.after].join(' ');
  if (!word) return wholeNumber(number.groups);
  const magnitude = magnitudes.lookup(word);
  const value = magnitude ? mantissa(number.groups) : null;
  return value === null ? null : Math.round(value * magnitude);
}

/**
 * Read a count whose magnitude word isn't known, with help from its accessible
 * label. The label either holds the count in full ("28k" labelled "28.143
 * visninger") or spells the magnitude out ("9,9 K" labelled "9,9 mil
 * visualizaciones"). Returns { count, word, magnitude } so the caller can learn
 * the word, or null when the label doesn't settle it.
 */
function readWithLabel(text, label, magnitudes) {
  const shown = readNumber(text);
  const spoken = readNumber(label);
  if (!shown || !spoken) return null;
  // Only a number and one word, so the likes of "42k watching" are never read
  const words = [...shown.before, ...shown.after];
  if (words.length !== 1) return null;
  const pair = learnFromPair(text, label);
  if (pair) return { count: wholeNumber(spoken.groups), ...pair };
  const value = mantissa(shown.groups);
  if (value === null || value !== mantissa(spoken.groups)) return null;
  // Two words first, so "mil millones" (billion) wins over "mil" (thousand)
  const candidates = [spoken.after.slice(0, 2).join(' '), spoken.after[0], spoken.before.at(-1)];
  for (const candidate of candidates) {
    const magnitude = candidate && magnitudes.lookup(candidate);
    if (magnitude) return { count: Math.round(value * magnitude), word: words[0], magnitude };
  }
  return null;
}

/** word without ending, when it ends with all of it ("만회" without "회" is "만"). */
function withoutEnding(word = '', ending = '') {
  if (word === ending) return '';
  return ending && word.endsWith(ending) ? word.slice(0, -ending.length) : word;
}

/** word without start, when it starts with all of it. */
function withoutStart(word = '', start = '') {
  if (word === start) return '';
  return start && word.startsWith(start) ? word.slice(start.length) : word;
}

/**
 * Learn a magnitude word from one count shown both short and in full, as on
 * the watch page ("1,1 mio. visninger" and "1.141.413 visninger"). The word is
 * the neighbour of the number that differs between the two, minus the full
 * count's neighbour when that's attached to it ("114만회" and "1,141,413회"
 * give 만), and its magnitude is the power of ten between the two numbers.
 * Returns { word, magnitude } or null.
 */
function learnFromPair(short, full) {
  const s = readNumber(short);
  const f = readNumber(full);
  if (!s || !f) return null;
  const shortValue = mantissa(s.groups);
  const fullValue = wholeNumber(f.groups);
  if (!shortValue || !fullValue) return null;
  const magnitude = powerOfTen(fullValue / shortValue);
  if (!magnitude) return null;
  // The short count is the full one cut (or rounded) to the precision shown,
  // which rules out a pair read from two different videos
  const decimals = s.groups.length > 1 && s.groups.at(-1).length <= 2 ? s.groups.at(-1).length : 0;
  const scaled = fullValue / magnitude * 10 ** decimals;
  const shown = Math.round(shortValue * 10 ** decimals);
  if (shown !== Math.floor(scaled) && shown !== Math.round(scaled)) return null;
  const word = withoutEnding(s.after[0], f.after[0]) || withoutStart(s.before.at(-1), f.before.at(-1));
  return word ? { word, magnitude } : null;
}
