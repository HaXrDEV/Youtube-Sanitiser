/**
 * YouTube Sanitiser: fixture capture
 * Records how YouTube writes view counts in each of its interface languages,
 * into fixtures/view-counts.json for view-count.test.js. Run it with
 * `node tests/capture-fixtures.js` to refresh the fixtures when YouTube changes
 * how it writes counts. Signed out, it loads a search page in each language
 * and asks YouTube's web API for a few watch pages, whose sidebars hold video
 * cards and which show their own video's count short and in full.
 */

const fs = require('fs');
const path = require('path');

// YouTube's interface languages, as its hl parameter names them
const LANGUAGES = [
  'af', 'am', 'ar', 'as', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'da', 'de', 'el',
  'en', 'en-GB', 'en-IN', 'es', 'es-419', 'es-US', 'et', 'eu', 'fa', 'fi', 'fil', 'fr',
  'fr-CA', 'gl', 'gu', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'iw', 'ja', 'ka', 'kk',
  'km', 'kn', 'ko', 'ky', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'my', 'ne', 'nl',
  'no', 'or', 'pa', 'pl', 'pt', 'pt-PT', 'ro', 'ru', 'si', 'sk', 'sl', 'sq', 'sr',
  'sr-Latn', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zh-CN', 'zh-HK',
  'zh-TW', 'zu',
];

// Videos with views in the thousands, millions and billions
const VIDEOS = ['h5v23HIWdIw', 'bK5TMc71FI4', 'kJQP7kiw5Fk'];
const SEARCH = 'minecraft';
const CLIENT = { clientName: 'WEB', clientVersion: '2.20261016.01.00', gl: 'US' };
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Examples kept per language and kind, one per distinct shape ("9.9K", "99K", "9M")
const PER_KIND = 8;

// Pause between languages
const PAUSE_MS = 3000;

async function api(endpoint, body, hl) {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ context: { client: { ...CLIENT, hl } }, ...body }),
  });
  if (!res.ok) throw new Error(`${endpoint} in ${hl}: HTTP ${res.status}`);
  return res.json();
}

/** A search results page, as the browser gets it: its language and its data. */
async function searchPage(hl) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(SEARCH)}&hl=${hl}`;
  const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': USER_AGENT, 'accept-language': hl } });
  if (res.status !== 200) {
    throw new Error(`search in ${hl}: HTTP ${res.status}. If YouTube is asking to slow down, wait a while and run this again.`);
  }
  const html = await res.text();
  const data = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!data) throw new Error(`search in ${hl}: no page data`);
  return { lang: html.match(/<html[^>]*\blang="([^"]+)"/)?.[1] ?? hl, data: JSON.parse(data[1]) };
}

/** Every value under key anywhere in a response. */
function findAll(node, key, found = []) {
  if (node && typeof node === 'object') {
    if (node[key]) found.push(node[key]);
    for (const child of Object.values(node)) findAll(child, key, found);
  }
  return found;
}

const textOf = t => t?.simpleText ?? t?.runs?.map(r => r.text).join('') ?? t?.content;

/** The exact count in a full count text, reading the digits of any script. */
function exactOf(text) {
  const digit = ch => {
    let start = ch.codePointAt(0);
    while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--;
    return String((ch.codePointAt(0) - start) % 10);
  };
  return Number(text.replace(/\p{Nd}/gu, digit).replace(/\D/g, ''));
}

/** Keep one example per shape (digits replaced by 9), up to PER_KIND. */
function distinct(items, textKey) {
  const seen = new Set();
  return items.filter(item => {
    const shape = item[textKey].replace(/\p{Nd}+/gu, '9');
    if (seen.has(shape) || seen.size >= PER_KIND) return false;
    seen.add(shape);
    return true;
  });
}

async function capture(hl) {
  const [search, ...watches] = await Promise.all([
    searchPage(hl),
    ...VIDEOS.map(videoId => api('next', { videoId }, hl)),
  ]);

  // Sidebar cards: the metadata part behind the ▷ icon is the view count
  const cards = watches.flatMap(w => findAll(w, 'contentMetadataViewModel'))
    .flatMap(c => (c.metadataRows ?? []).flatMap(r => r.metadataParts ?? []))
    .filter(p => p.leadingIcon && p.text?.content)
    .map(p => ({ text: p.text.content, label: p.accessibilityLabel ?? '' }));

  // Search results: the short count is what the result shows
  const renderers = findAll(search.data, 'videoRenderer');
  const isLive = v => JSON.stringify(v.badges ?? []).includes('LIVE');
  const results = renderers.filter(v => !isLive(v) && textOf(v.shortViewCountText) && textOf(v.viewCountText))
    .map(v => ({ short: textOf(v.shortViewCountText), exact: exactOf(textOf(v.viewCountText)) }));
  const live = renderers.filter(isLive).map(v => textOf(v.shortViewCountText)).filter(Boolean);

  // The watch page shows its own video's count short and in full
  const watch = watches.map(w => findAll(w, 'videoViewCountRenderer')[0])
    .map(v => ({ short: textOf(v?.shortViewCount ?? v?.extraShortViewCount), full: textOf(v?.viewCount) }))
    .filter(p => p.short && p.full);

  return {
    lang: search.lang,
    cards: distinct(cards, 'text'),
    search: distinct(results, 'short'),
    live: [...new Set(live)].slice(0, 2),
    watch,
  };
}

async function main() {
  const languages = {};
  // One language at a time with a pause between them, to go easy on YouTube
  for (const hl of LANGUAGES) {
    languages[hl] = await capture(hl);
    process.stdout.write(`${Object.keys(languages).length}/${LANGUAGES.length}\r`);
    await new Promise(resolve => setTimeout(resolve, PAUSE_MS));
  }
  const fixtures = { capturedAt: new Date().toISOString().slice(0, 10), videos: VIDEOS, search: SEARCH, languages };
  const file = path.join(__dirname, 'fixtures', 'view-counts.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(fixtures, null, 1)}\n`);
  console.log(`Wrote ${Object.keys(languages).length} languages to ${path.relative(process.cwd(), file)}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
