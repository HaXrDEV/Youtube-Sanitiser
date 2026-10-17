/**
 * YouTube Sanitiser: view count tests
 * Run with `node --test` from the repository folder. Loads view-count.js on
 * its own and checks it against hand-picked cases and against how YouTube
 * writes counts in each of its interface languages (fixtures/view-counts.json,
 * from capture-fixtures.js).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// view-count.js declares plain globals, as the content script sees them
const vc = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'view-count.js'), 'utf8'), vc);
const { parseCount, readWithLabel, learnFromPair, createMagnitudes, readNumber, wholeNumber, mantissa } = vc;

const read = (lang, text) => parseCount(text, createMagnitudes(lang));

// Results come from another realm, so compare them as plain values
const plain = value => (value === null ? null : JSON.parse(JSON.stringify(value)));

// ─── Hand-picked cases ────────────────────────────────────────────────────────

test('reads counts written in full, in the digits of any script', () => {
  for (const [lang, text, count] of [
    ['da-DK', '12.941', 12941],
    ['sv-SE', '12\u00a0941', 12941],
    ['en', '1,141,413', 1141413],
    ['hi-IN', '11,41,413', 1141413],
    ['fa-IR', '۱۲٬۹۴۱', 12941],
    ['ar', '١٢٬٩٤١', 12941],
    ['de-DE', '2518', 2518],
    ['en', '104', 104],
  ]) assert.strictEqual(read(lang, text), count, `${lang} ${text}`);
});

test('reads abbreviated counts with the browser\'s magnitude words', () => {
  for (const [lang, text, count] of [
    ['en', '1.2K', 1200],
    ['da-DK', '8,2\u00a0mio.', 8200000],
    ['nb-NO', '2,4k', 2400],
    ['sv-SE', '5,1 mn', 5100000],
    ['tr-TR', '2,5 B', 2500],
    ['id-ID', '1,2 M', 1200000000],
    ['es-ES', '1,2 mil M', 1200000000],
    ['ja-JP', '114万', 1140000],
    ['ko-KR', '5.2만', 52000],
    ['hi-IN', '11 लाख', 1100000],
    ['he-IL', '\u202b2.6M\u200f\u202c', 2600000],
    ['si-LK', 'මි3.6', 3600000],
    ['sw', 'elfu 252', 252000],
    ['my', '၈.၆ ထောင်', 8600],
  ]) assert.strictEqual(read(lang, text), count, `${lang} ${text}`);
});

test('reads nothing that isn\'t just a count', () => {
  for (const [lang, text] of [
    ['en', '38 watching'],
    ['da-DK', '42k ser på'],
    ['ja-JP', '38 人が視聴中'],
    ['da-DK', 'for 1 dag siden'],
    ['en', '2 days ago'],
    ['en', 'Premieres 10/20/26'],
    ['en', '100 views in 24 hours'],
    ['en', 'No views'],
    ['en', '1.2'],
    ['bs', '86 hilj.'],
  ]) assert.strictEqual(parseCount(text, createMagnitudes(lang, {}, { useBrowser: false })), null, `${lang} ${text}`);
});

test('reads an unknown abbreviation from its label', () => {
  const es = createMagnitudes('es-ES');
  assert.strictEqual(parseCount('9,9 K', es), null);
  assert.deepStrictEqual(plain(readWithLabel('9,9 K', '9,9 mil visualizaciones', es)), { count: 9900, word: 'K', magnitude: 1000 });
  // A label holding the full count gives the exact count
  const da = createMagnitudes('da-DK');
  assert.deepStrictEqual(plain(readWithLabel('28k', '28.143 visninger', da)), { count: 28143, word: 'k', magnitude: 1000 });
  // Not without a known magnitude word, and never for more than a number and one word
  const bare = createMagnitudes('bs', {}, { useBrowser: false });
  assert.strictEqual(readWithLabel('86 hilj.', '86 hiljada pregleda', bare), null);
  assert.strictEqual(readWithLabel('42k ser på', '42.000 ser på', da), null);
});

test('learns magnitude words from a count shown short and in full', () => {
  for (const [short, full, word, magnitude] of [
    ['1,1 mio. visninger', '1.141.413 visninger', 'mio.', 1e6],
    ['9,1 mia.', '9.147.942.833 visninger', 'mia.', 1e9],
    ['조회수 114만회', '조회수 1,141,413회', '만', 1e4],
    ['1,1 M de visualizaciones', '1.141.413 visualizaciones', 'M', 1e6],
    ['ຍອດເບິ່ງ 1,1 ລ້ານ ເທື່ອ', 'ຍອດເບິ່ງ 1.141.413 ເທື່ອ', 'ລ້ານ', 1e6],
    ['ကြည့်ရှုမှု 1.1 သန်း', 'ကြည့်ရှုမှု 1,141,413', 'သန်း', 1e6],
    ['\u202b1.1M\u200f\u202c צפיות', '1,141,413 צפיות', 'M', 1e6],
    ['11 लाख व्यू', '11,41,413 व्यू', 'लाख', 1e5],
  ]) assert.deepStrictEqual(plain(learnFromPair(short, full)), { word, magnitude }, short);
  // Nothing to learn from a count that isn't abbreviated
  assert.strictEqual(learnFromPair('12.985 visninger', '12.985 visninger'), null);
  // Two counts from different videos don't fit together
  assert.strictEqual(learnFromPair('1,5 mio. visninger', '13.030 visninger'), null);
});

test('learned words fill gaps but never replace the browser\'s', () => {
  const learned = {};
  const words = createMagnitudes('da-DK', learned);
  assert.strictEqual(words.learn('mio.', 1000), false);
  assert.strictEqual(words.learn('k', 1000), true);
  assert.strictEqual(words.learn('K', 1000), false);
  assert.deepStrictEqual(plain(learned), { k: 1000 });
  assert.strictEqual(parseCount('28k', words), 28000);
});

// ─── Every YouTube language ───────────────────────────────────────────────────

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'view-counts.json'), 'utf8'));

/**
 * The count a card's label states, to check the card's reading against: the
 * full count, or the card's number spelled out with a magnitude word. Null
 * when the label spells out a magnitude word not even the reference knows.
 */
function labelValue(text, label, words) {
  const shown = readNumber(text);
  const spoken = readNumber(label);
  if (!shown || !spoken) return null;
  // The label holds the full count
  const abbreviated = shown.before.length + shown.after.length > 0;
  if (!abbreviated || learnFromPair(text, label)) return wholeNumber(spoken.groups);
  // YouTube sometimes labels a card with a different number than it shows
  // (Nepali "2.4 करोड" labelled "24 करोड"); the card is read as shown
  if (mantissa(spoken.groups) !== mantissa(shown.groups)) return null;
  for (const word of [spoken.after.slice(0, 2).join(' '), spoken.after[0], spoken.before.at(-1)]) {
    const magnitude = word && words.lookup(word);
    if (magnitude) return Math.round(mantissa(spoken.groups) * magnitude);
  }
  return null;
}

/**
 * Read one language's fixtures the way the content script would: learn from
 * the watch pages, then read the cards (learning from their labels) and the
 * search results. useBrowser=false is a browser without data for the language.
 */
function readLanguage(fixture, useBrowser) {
  const words = createMagnitudes(fixture.lang, {}, { useBrowser });
  for (const { short, full } of fixture.watch) {
    const learned = learnFromPair(short, full);
    if (learned) words.learn(learned.word, learned.magnitude);
  }
  const reference = createMagnitudes(fixture.lang);
  const cards = fixture.cards.map(({ text, label }) => {
    let count = parseCount(text, words);
    if (count === null) {
      const fromLabel = readWithLabel(text, label, words);
      if (fromLabel) words.learn(fromLabel.word, fromLabel.magnitude);
      count = fromLabel?.count ?? null;
    }
    return { text, count, expected: labelValue(text, label, reference) };
  });
  const search = fixture.search.map(({ short, exact }) => ({ text: short, count: parseCount(short, words), expected: exact }));
  return { cards, search, live: fixture.live.filter(text => parseCount(text, words) !== null) };
}

// A short count is the full one cut to two or three digits, so it can be up to
// about 15% under; it's never over by more than rounding
const fits = ({ count, expected }) => expected === null || (count >= expected * 0.85 && count <= expected * 1.02);

for (const useBrowser of [true, false]) {
  const kind = useBrowser ? 'with the browser\'s number data' : 'without the browser\'s number data';

  test(`never misreads a count, ${kind}`, () => {
    for (const [hl, fixture] of Object.entries(fixtures.languages)) {
      const { cards, search, live } = readLanguage(fixture, useBrowser);
      const wrong = [...cards, ...search].filter(r => r.count !== null && !fits(r));
      assert.deepStrictEqual(wrong.map(r => `${r.text} → ${r.count}, expected ${r.expected}`), [], hl);
      assert.deepStrictEqual(live, [], `${hl} live counts`);
    }
  });

  test(`reads almost every count, ${kind}`, t => {
    let read = 0;
    let total = 0;
    for (const [hl, fixture] of Object.entries(fixtures.languages)) {
      const { cards, search } = readLanguage(fixture, useBrowser);
      const unread = [...cards, ...search].filter(r => r.count === null);
      read += cards.length + search.length - unread.length;
      total += cards.length + search.length;
      if (unread.length) t.diagnostic(`${hl}: can't read ${unread.map(r => r.text).join(', ')}`);
    }
    t.diagnostic(`read ${read} of ${total} counts in ${Object.keys(fixtures.languages).length} languages`);
    assert.ok(read / total >= (useBrowser ? 0.97 : 0.9), `read ${read} of ${total}`);
  });
}
