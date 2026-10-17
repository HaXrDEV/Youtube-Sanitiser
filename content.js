/**
 * YouTube Sanitiser: content script
 * Runs on every youtube.com page. Hides Shorts, playlists, mixes, live streams
 * and low-view-count videos based on settings stored in chrome.storage.sync.
 * DEFAULTS comes from defaults.js and view count reading from view-count.js,
 * which the manifest loads first.
 */

// ─── Inject hide stylesheet once ─────────────────────────────────────────────

(function injectStyles() {
  const style = document.createElement('style');
  style.id = 'yt-sanitiser-styles';
  style.textContent = [
    '.yt-sanitised { display: none !important; }',
    // Collapse grid rows whose video cards are all hidden
    'ytd-rich-grid-row:has(ytd-rich-item-renderer.yt-sanitised):not(:has(ytd-rich-item-renderer:not(.yt-sanitised))) { display: none !important; }',
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);
})();

// ─── Settings ─────────────────────────────────────────────────────────────────

let settings = { ...DEFAULTS };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitise(el) {
  el?.classList.add('yt-sanitised');
}

function unsanitise(el) {
  el.classList.remove('yt-sanitised');
}

/**
 * Like querySelectorAll but also tests root itself.
 * Needed because MutationObserver delivers the added node directly, and
 * node.querySelectorAll(sel) only searches descendants, never self.
 */
function queryAll(root, selector) {
  const els = Array.from(root.querySelectorAll(selector));
  if (root.matches?.(selector)) els.unshift(root);
  return els;
}

// ─── View counts ──────────────────────────────────────────────────────────────

// Magnitude words learned on YouTube, per page language, as kept in
// chrome.storage.local. Reading and learning live in view-count.js.
let learnedMagnitudes = {};
let pageMagnitudes = null;
let pageMagnitudesLang = null;

/** Magnitude words for the page's current language. */
function magnitudesForPage() {
  const lang = document.documentElement.lang;
  if (!pageMagnitudes || pageMagnitudesLang !== lang) {
    learnedMagnitudes[lang] ??= {};
    pageMagnitudes = createMagnitudes(lang, learnedMagnitudes[lang]);
    pageMagnitudesLang = lang;
  }
  return pageMagnitudes;
}

/**
 * Remember a magnitude word learned on this page, then filter again, since
 * cards that couldn't be read before may be readable now.
 */
function rememberMagnitude(word, magnitude) {
  if (!magnitudesForPage().learn(word, magnitude)) return;
  chrome.storage.local.set({ magnitudeWords: learnedMagnitudes });
  scheduleRescan();
}

/**
 * The element holding a card's view count, found by where it sits rather than
 * by what it says. In a lockup it's the metadata text after the leading ▷
 * icon (the verified badge after a channel name is an icon too, but it has a
 * label); in other cards, the first item of the metadata line.
 */
function findViewCountElement(card) {
  for (const text of card.querySelectorAll('yt-content-metadata-view-model span[role="text"]')) {
    const icon = text.previousElementSibling;
    if (icon?.childElementCount && !icon.textContent.trim() && !icon.hasAttribute('aria-label')) return text;
  }
  return card.querySelector('#metadata-line .inline-metadata-item');
}

/**
 * A card's view count, or null when it has none or it can't be read for
 * certain. A magnitude word the language data doesn't have is read from the
 * count's accessible label, which spells it out, and learned.
 */
function getViewCount(card) {
  const el = findViewCountElement(card);
  if (!el) return null;
  const magnitudes = magnitudesForPage();
  const text = el.textContent.trim();
  const count = parseCount(text, magnitudes);
  if (count !== null) return count;
  const label = el.getAttribute('aria-label');
  const read = label && readWithLabel(text, label, magnitudes);
  if (!read) return null;
  rememberMagnitude(read.word, read.magnitude);
  return read.count;
}

let lastWatchCounts = '';

/**
 * Learn a magnitude word from the watch page, which shows the video's view
 * count both short, under the title ("1,1 mio. visninger"), and in full, in
 * the tooltip beside it ("1.141.413 visninger • 24. aug. 2023").
 */
function learnFromWatchPage() {
  const info = document.querySelector('ytd-watch-metadata ytd-watch-info-text');
  const short = info?.querySelector('#info span')?.textContent.trim();
  const full = info?.querySelector('tp-yt-paper-tooltip')?.textContent.split('•')[0].trim();
  if (!short || !full || `${short}\n${full}` === lastWatchCounts) return;
  lastWatchCounts = `${short}\n${full}`;
  const learned = learnFromPair(short, full);
  if (learned) rememberMagnitude(learned.word, learned.magnitude);
}

// ─── Filter functions ─────────────────────────────────────────────────────────

// Video cards: renderers (which may wrap a lockup, YouTube's current card
// layout), and lockups that stand alone (watch-page sidebar, search results)
const VIDEO_RENDERER_SELECTOR =
  'ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer';
const CARD_SELECTOR = `${VIDEO_RENDERER_SELECTOR}, yt-lockup-view-model`;

/** The card to hide for an element: its enclosing renderer, else its lockup. */
function cardFor(el) {
  return el.closest(VIDEO_RENDERER_SELECTOR) || el.closest('yt-lockup-view-model');
}

/**
 * Hide lockups whose content ID starts with prefix. Video IDs are always
 * 11 characters, so this skips ordinary videos whose ID happens to start
 * with the same letters.
 */
function filterLockups(root, prefix) {
  queryAll(root, `[class*="content-id-${prefix}"]`).forEach(el => {
    const id = [...el.classList].find(c => c.startsWith('content-id-'))?.slice('content-id-'.length);
    if (!id?.startsWith(prefix) || id.length === 11) return;
    const card = cardFor(el);
    if (card) sanitise(card);
  });
}

function filterShorts(root) {
  // Climb to ytd-rich-section-renderer so its padding/margin collapses too
  queryAll(root, 'ytd-rich-shelf-renderer[is-shorts]').forEach(el => {
    sanitise(el.closest('ytd-rich-section-renderer') || el);
  });
  queryAll(root, 'ytd-reel-item-renderer').forEach(el => {
    sanitise(el.closest('ytd-rich-item-renderer') || el);
  });
  queryAll(root, 'ytd-compact-video-renderer').forEach(el => {
    if (el.querySelector('[overlay-style="SHORTS"]')) sanitise(el);
  });
  queryAll(root, 'ytd-reel-shelf-renderer').forEach(el => {
    sanitise(el.closest('ytd-rich-section-renderer') || el);
  });
  // Shorts shelf in search results. Climbs from the items, which can render
  // after the shelf itself.
  queryAll(root, 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2').forEach(el => {
    sanitise(el.closest('grid-shelf-view-model'));
  });
}

/**
 * Pages where you go looking for your playlists and saved mixes, so neither
 * filter applies: the You page and its playlists page (your library), and a
 * channel's Playlists tab (/@handle/playlists, /channel/x/playlists).
 */
function isPlaylistsPage() {
  const p = window.location.pathname;
  return p === '/feed/you' || p === '/feed/library' || p === '/feed/playlists' || p.endsWith('/playlists');
}

function filterPlaylists(root) {
  if (isPlaylistsPage()) return;
  queryAll(root,
    'ytd-playlist-renderer, ytd-compact-playlist-renderer, ytd-grid-playlist-renderer'
  ).forEach(sanitise);
  filterLockups(root, 'PL');
}

function filterMixes(root) {
  if (isPlaylistsPage()) return;
  queryAll(root, 'ytd-radio-renderer, ytd-compact-radio-renderer').forEach(sanitise);
  filterLockups(root, 'RD');
}

// ─── Subscription cache ───────────────────────────────────────────────────────

/**
 * In-memory sets of known subscribed channel paths (e.g. "/@ChannelName") and
 * display names. Names are needed because lockup cards don't link to the
 * channel. Populated by reading the guide sidebar, expanding it if needed.
 */
let cachedSubscriptions = new Set();
let cachedSubscriptionNames = new Set();

function readGuideChannels() {
  document.querySelectorAll('ytd-guide-entry-renderer a[href^="/@"]').forEach(a => {
    cachedSubscriptions.add(a.getAttribute('href').split('?')[0]);
    const name = (a.getAttribute('title') || a.textContent).trim();
    if (name) cachedSubscriptionNames.add(name);
  });
}

/**
 * Find the first non-navigating toggle button in the guide subscriptions
 * section (the "Show more" / "Show less" button). It is identified as the
 * first href-less guide entry that follows at least one channel entry.
 * Pass skipHidden=true to ignore CSS-hidden entries (used when collapsing,
 * so we don't accidentally re-click the now-hidden "Show more").
 */
function findGuideToggle(skipHidden = false) {
  let seenChannel = false;
  return [...document.querySelectorAll('ytd-guide-entry-renderer')].find(el => {
    if (skipHidden && el.offsetParent === null) return false;
    const href = el.querySelector('a')?.getAttribute('href');
    if (href?.startsWith('/@') || href?.startsWith('/channel/')) { seenChannel = true; return false; }
    return seenChannel && !href;
  });
}

function expandGuideSubscriptions() {
  const before = cachedSubscriptions.size;
  readGuideChannels();

  const showMore = findGuideToggle();
  // A visible toggle other than "Show more" is "Show less": the user has the
  // list open already, so it was read in full and is left open
  const visibleToggle = findGuideToggle(true);
  if (showMore && (!visibleToggle || visibleToggle === showMore)) {
    showMore.click();
    setTimeout(() => {
      readGuideChannels();
      if (excludingSubscribed() && cachedSubscriptions.size !== before) fullRescan();
      findGuideToggle(true)?.click(); // collapse back ("Show less")
    }, 400);
  } else if (excludingSubscribed() && cachedSubscriptions.size !== before) {
    fullRescan();
  }
}

let guideWatched = false;

/**
 * Wait for the guide sidebar to render subscription entries, then expand
 * and read them. The guide loads asynchronously after the page content,
 * so we observe the DOM rather than relying on a fixed point in time.
 * Only runs once, and only when "Exclude subscribed channels" is in use,
 * since it clicks entries in the user's sidebar.
 */
function watchForGuide() {
  if (guideWatched) return;
  guideWatched = true;
  if (document.querySelector('ytd-guide-entry-renderer a[href^="/@"]')) {
    expandGuideSubscriptions();
    return;
  }
  const watcher = new MutationObserver(() => {
    if (document.querySelector('ytd-guide-entry-renderer a[href^="/@"]')) {
      watcher.disconnect();
      expandGuideSubscriptions();
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true });
}

/** Returns the channel path for a video card element, or null. */
function getChannelPath(el) {
  const a = el.querySelector('a[href^="/@"], a[href^="/channel/"]');
  return a ? a.getAttribute('href').split('?')[0] : null;
}

/**
 * Whether a card is from a subscribed channel, by channel link or else by
 * name, since lockups don't link to the channel and a card can link to it
 * by /channel/ ID where the guide uses its handle.
 */
function isFromSubscribedChannel(el) {
  const channelPath = getChannelPath(el);
  if (channelPath && cachedSubscriptions.has(channelPath)) return true;
  // The name sits in ytd-channel-name, or in a lockup's first metadata row
  const name = el.querySelector('ytd-channel-name #text, yt-content-metadata-view-model [role="group"]')
    ?.textContent.trim();
  return !!name && cachedSubscriptionNames.has(name);
}

/**
 * A channel's Live tab (/@handle/streams, /channel/x/streams), where you go
 * looking for its streams, so the live streams filter doesn't apply there.
 */
function isStreamsPage() {
  return window.location.pathname.endsWith('/streams');
}

// The LIVE badge on a stream that's live now: on a lockup's thumbnail, in a
// search result's metadata, or as an older card's thumbnail overlay. A past
// stream has none, so it's left alone.
const LIVE_BADGE_SELECTOR = '.ytBadgeShapeThumbnailLive, .ytBadgeShapeLive, [overlay-style="LIVE"]';

function filterLiveStreams(root) {
  if (isStreamsPage()) return;
  queryAll(root, LIVE_BADGE_SELECTOR).forEach(el => {
    const card = cardFor(el);
    if (!card) return;
    if (settings.excludeSubscribedLive && isFromSubscribedChannel(card)) return;
    sanitise(card);
  });
}

function filterLowViews(root, minViews) {
  queryAll(root, CARD_SELECTOR).forEach(el => {
    // A lockup inside a renderer is handled through that renderer
    if (cardFor(el) !== el) return;
    // Don't touch elements already hidden by another filter
    if (el.classList.contains('yt-sanitised')) return;
    const count = getViewCount(el);
    if (count !== null && count < minViews) {
      if (settings.excludeSubscribed && isFromSubscribedChannel(el)) return;
      sanitise(el);
    }
  });
}

// ─── Un-filter (restore all hidden elements) ──────────────────────────────────

function removeAllFilters() {
  document.querySelectorAll('.yt-sanitised').forEach(unsanitise);
}

// ─── Apply all active filters to a subtree ───────────────────────────────────

function applyFilters(root) {
  if (settings.hideShorts)      filterShorts(root);
  if (settings.hidePlaylists)   filterPlaylists(root);
  if (settings.hideMixes)       filterMixes(root);
  if (settings.hideLiveStreams) filterLiveStreams(root);
  if (settings.hideLowViews)    filterLowViews(root, settings.minViews);
}

// ─── Full re-scan (after settings change or navigation) ──────────────────────

function fullRescan() {
  if (settings.hideLowViews) learnFromWatchPage();
  // Remove all previously applied filters first, then reapply from scratch
  // so toggling a filter OFF actually reveals content again.
  removeAllFilters();
  applyFilters(document.body);
}

// ─── MutationObserver: catch dynamically added content ───────────────────────

/**
 * Filter a subtree. A video renderer is re-evaluated from scratch, because
 * YouTube reuses renderer elements for new videos and a stale hide would stick.
 */
function refilter(root) {
  if (root.matches(CARD_SELECTOR)) unsanitise(root);
  applyFilters(root);
}

const recheckScheduled = new WeakSet();

const observer = new MutationObserver(mutations => {
  // Filter each added node via its enclosing card (when it has one), so
  // metadata injected after its container (lazy-load on scroll) triggers a
  // pass over the whole card. The Set deduplicates nodes sharing one.
  const pending = new Set();
  // The watch page's view count can render well after navigation (after an
  // ad, say), so changes to it are a chance to learn a magnitude word
  const learning = settings.hideLowViews && location.pathname === '/watch';
  let watchInfoChanged = false;
  for (const mutation of mutations) {
    if (learning && !watchInfoChanged) watchInfoChanged = !!mutation.target.closest?.('ytd-watch-info-text');
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = /** @type {Element} */ (node);
      const card = cardFor(el);
      pending.add(card || el);
      // Freshly added cards may still lack metadata: re-check once it settles.
      if (card && el.matches(CARD_SELECTOR) && !recheckScheduled.has(card)) {
        recheckScheduled.add(card);
        setTimeout(() => {
          recheckScheduled.delete(card);
          refilter(card);
        }, 800);
      }
    }
  }
  if (watchInfoChanged) learnFromWatchPage();
  pending.forEach(refilter);
});

// ─── YouTube SPA navigation ───────────────────────────────────────────────────

let rescanTimer;

/**
 * Rescan once YouTube has had a moment to render the new page. Both events
 * below fire on a navigation, so they share one timer instead of each
 * rescanning the whole page.
 */
function scheduleRescan() {
  clearTimeout(rescanTimer);
  rescanTimer = setTimeout(fullRescan, 300);
}

document.addEventListener('yt-navigate-finish', scheduleRescan);
// Also fires on later renders of the same page
document.addEventListener('yt-page-data-updated', scheduleRescan);

// ─── Settings: load and watch ─────────────────────────────────────────────────

/** Whether a filter is on with "Exclude subscribed channels" set, so subscriptions are needed. */
function excludingSubscribed() {
  return (settings.hideLiveStreams && settings.excludeSubscribedLive) ||
    (settings.hideLowViews && settings.excludeSubscribed);
}

function watchGuideIfNeeded() {
  if (excludingSubscribed()) watchForGuide();
}

Promise.all([
  chrome.storage.sync.get(DEFAULTS),
  chrome.storage.local.get({ magnitudeWords: {} }),
]).then(([stored, local]) => {
  settings = { ...DEFAULTS, ...stored };
  learnedMagnitudes = local.magnitudeWords;
  pageMagnitudes = null;
  // Start observing only once the real settings are known, and rescan from
  // scratch in case a navigation event already filtered with the defaults.
  fullRescan();
  observer.observe(document.body, { childList: true, subtree: true });
  watchGuideIfNeeded();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Magnitude words learned in another tab
    for (const [lang, words] of Object.entries(changes.magnitudeWords?.newValue ?? {})) {
      Object.assign(learnedMagnitudes[lang] ??= {}, words);
    }
    return;
  }
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    // A removed key reports newValue undefined: fall back to its default
    if (key in settings) settings[key] = newValue ?? DEFAULTS[key];
  }
  watchGuideIfNeeded();
  fullRescan();
});
