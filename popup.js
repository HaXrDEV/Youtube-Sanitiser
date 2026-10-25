/**
 * YouTube Sanitiser: popup script
 * Loads settings from chrome.storage.sync and saves on every change, and
 * names the build in the footer.
 * DEFAULTS comes from defaults.js, which popup.html loads first.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with thousands separators: 10000 → "10,000" */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/** Format a percentage: 90 → "90%" */
function formatPercent(n) {
  return `${Number(n)}%`;
}

/** Strip commas/spaces and parse: "10,000" → 10000, "90%" → 90 */
function parseNumber(str) {
  const n = parseInt(str.replace(/[,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function getEl(id) {
  return document.getElementById(id);
}

/** The sub-rows holding each filter's options, which show while it's on */
const OPTION_ROWS = {
  hideShorts:      ['shortsInSubscriptionsRow'],
  hideLiveStreams: ['excludeSubscribedLiveRow', 'liveStreamsInSubscriptionsRow'],
  hideLowViews:    ['minViewsRow', 'excludeSubscribedRow'],
  hideWatched:     ['watchedPercentRow', 'watchedInSubscriptionsRow'],
};

function updateSubRows(s) {
  for (const [filter, rows] of Object.entries(OPTION_ROWS)) {
    rows.forEach(row => getEl(row).classList.toggle('hidden', !s[filter]));
  }
}

// ─── Populate UI from settings ────────────────────────────────────────────────

function applyToUI(s) {
  getEl('hideShorts').checked                 = !!s.hideShorts;
  getEl('shortsInSubscriptions').checked      = !!s.shortsInSubscriptions;
  getEl('hidePlaylists').checked              = !!s.hidePlaylists;
  getEl('hideMixes').checked                  = !!s.hideMixes;
  getEl('hideLiveStreams').checked            = !!s.hideLiveStreams;
  getEl('excludeSubscribedLive').checked      = !!s.excludeSubscribedLive;
  getEl('liveStreamsInSubscriptions').checked = !!s.liveStreamsInSubscriptions;
  getEl('hideLowViews').checked               = !!s.hideLowViews;
  getEl('minViews').value                     = formatNumber(s.minViews ?? DEFAULTS.minViews);
  getEl('excludeSubscribed').checked          = !!s.excludeSubscribed;
  getEl('hideWatched').checked                = !!s.hideWatched;
  getEl('watchedPercent').value               = formatPercent(s.watchedPercent ?? DEFAULTS.watchedPercent);
  getEl('watchedInSubscriptions').checked     = !!s.watchedInSubscriptions;
  updateSubRows(s);
}

// ─── Read current UI state into a settings object ────────────────────────────

function readFromUI() {
  return {
    hideShorts:                 getEl('hideShorts').checked,
    shortsInSubscriptions:      getEl('shortsInSubscriptions').checked,
    hidePlaylists:              getEl('hidePlaylists').checked,
    hideMixes:                  getEl('hideMixes').checked,
    hideLiveStreams:            getEl('hideLiveStreams').checked,
    excludeSubscribedLive:      getEl('excludeSubscribedLive').checked,
    liveStreamsInSubscriptions: getEl('liveStreamsInSubscriptions').checked,
    hideLowViews:               getEl('hideLowViews').checked,
    minViews:                   parseNumber(getEl('minViews').value),
    excludeSubscribed:          getEl('excludeSubscribed').checked,
    hideWatched:                getEl('hideWatched').checked,
    watchedPercent:             parseNumber(getEl('watchedPercent').value),
    watchedInSubscriptions:     getEl('watchedInSubscriptions').checked,
  };
}

// ─── Save settings ────────────────────────────────────────────────────────────

function save() {
  const s = readFromUI();
  chrome.storage.sync.set(s);
  updateSubRows(s);
}

// ─── Build name ───────────────────────────────────────────────────────────────

/** A file from the extension's own folder, or null if it isn't there. */
async function readOwnFile(path) {
  try {
    const response = await fetch(chrome.runtime.getURL(path));
    return response.ok ? (await response.text()).trim() : null;
  } catch {
    return null;
  }
}

/**
 * What the footer calls this copy of the extension. Loaded from a git clone,
 * that's the branch and commit, read from .git each time the popup opens.
 * A release has no .git folder, so it gets the manifest's version, which
 * its tag matches.
 */
async function buildName() {
  const head = await readOwnFile('.git/HEAD');
  const ref = head?.match(/^ref: (refs\/heads\/(.+))$/);
  if (ref) {
    const [, refPath, branch] = ref;
    // A branch is a file of its own, or a line in packed-refs once git packs it
    const commit = await readOwnFile(`.git/${refPath}`) ??
      (await readOwnFile('.git/packed-refs'))?.split(/\r?\n/)
        .find(line => line.endsWith(` ${refPath}`))?.split(' ')[0];
    return commit ? `${branch} · ${commit.slice(0, 7)}` : branch;
  }
  // A detached HEAD holds the commit itself
  if (/^[0-9a-f]{40}/.test(head ?? '')) return head.slice(0, 7);
  return `v${chrome.runtime.getManifest().version}`;
}

// ─── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildName().then(name => { getEl('build').textContent = name; });

  // Load stored settings, fall back to defaults. Controls are only wired up
  // once the UI holds the stored values, because save() writes the whole UI.
  chrome.storage.sync.get(DEFAULTS, stored => {
    applyToUI({ ...DEFAULTS, ...stored });
    wireUpControls();
  });
});

function wireUpControls() {
  // Every on/off setting is a checkbox with its name as id: auto-save them
  Object.keys(DEFAULTS).filter(id => typeof DEFAULTS[id] === 'boolean').forEach(id => {
    getEl(id).addEventListener('change', save);
  });

  wireUpNumberInput('minViews', formatNumber);
  wireUpNumberInput('watchedPercent', formatPercent, 100);
}

/**
 * A number box for the setting of the same name: shows the bare digits while
 * you type, and once you leave it, caps the number at max (or puts back the
 * default for none), formats it with format, and saves.
 */
function wireUpNumberInput(id, format, max = Infinity) {
  const input = getEl(id);

  input.addEventListener('focus', () => {
    input.value = input.value.replace(/[^\d]/g, '');
  });

  input.addEventListener('blur', () => {
    const n = parseNumber(input.value);
    input.value = format(n ? Math.min(n, max) : DEFAULTS[id]);
    save();
  });

  // Allow Enter to confirm the input
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
  });

  // Prevent non-numeric characters
  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^\d,]/g, '');
  });
}
