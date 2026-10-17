/**
 * YouTube Sanitiser: popup script
 * Loads settings from chrome.storage.sync and saves on every change.
 * DEFAULTS comes from defaults.js, which popup.html loads first.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a number with thousands separators: 10000 → "10,000" */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/** Strip commas/spaces and parse: "10,000" → 10000 */
function parseNumber(str) {
  const n = parseInt(str.replace(/[,\s]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function getEl(id) {
  return document.getElementById(id);
}

/** Show/hide the sub-rows under "Hide live streams" and "Hide low view count" */
function updateSubRows(s) {
  getEl('excludeSubscribedLiveRow').classList.toggle('hidden', !s.hideLiveStreams);
  getEl('minViewsRow').classList.toggle('hidden', !s.hideLowViews);
  getEl('excludeSubscribedRow').classList.toggle('hidden', !s.hideLowViews);
  getEl('minViews').disabled = !s.hideLowViews;
}

// ─── Populate UI from settings ────────────────────────────────────────────────

function applyToUI(s) {
  getEl('hideShorts').checked            = !!s.hideShorts;
  getEl('hidePlaylists').checked         = !!s.hidePlaylists;
  getEl('hideMixes').checked             = !!s.hideMixes;
  getEl('hideLiveStreams').checked       = !!s.hideLiveStreams;
  getEl('excludeSubscribedLive').checked = !!s.excludeSubscribedLive;
  getEl('hideLowViews').checked          = !!s.hideLowViews;
  getEl('minViews').value                = formatNumber(s.minViews ?? DEFAULTS.minViews);
  getEl('excludeSubscribed').checked     = !!s.excludeSubscribed;
  updateSubRows(s);
}

// ─── Read current UI state into a settings object ────────────────────────────

function readFromUI() {
  return {
    hideShorts:            getEl('hideShorts').checked,
    hidePlaylists:         getEl('hidePlaylists').checked,
    hideMixes:             getEl('hideMixes').checked,
    hideLiveStreams:       getEl('hideLiveStreams').checked,
    excludeSubscribedLive: getEl('excludeSubscribedLive').checked,
    hideLowViews:          getEl('hideLowViews').checked,
    minViews:              parseNumber(getEl('minViews').value),
    excludeSubscribed:     getEl('excludeSubscribed').checked,
  };
}

// ─── Save settings ────────────────────────────────────────────────────────────

function save() {
  const s = readFromUI();
  chrome.storage.sync.set(s);
  updateSubRows(s);
}

// ─── Initialise ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Load stored settings, fall back to defaults. Controls are only wired up
  // once the UI holds the stored values, because save() writes the whole UI.
  chrome.storage.sync.get(DEFAULTS, stored => {
    applyToUI({ ...DEFAULTS, ...stored });
    wireUpControls();
  });
});

function wireUpControls() {
  // Wire up all checkboxes to auto-save
  ['hideShorts', 'hidePlaylists', 'hideMixes', 'hideLiveStreams', 'excludeSubscribedLive',
   'hideLowViews', 'excludeSubscribed'].forEach(id => {
    getEl(id).addEventListener('change', save);
  });

  // Min-views input: save on blur, format on blur, strip on focus
  const minViewsInput = getEl('minViews');

  minViewsInput.addEventListener('focus', () => {
    minViewsInput.value = minViewsInput.value.replace(/,/g, '');
  });

  minViewsInput.addEventListener('blur', () => {
    const n = parseNumber(minViewsInput.value);
    minViewsInput.value = formatNumber(n || DEFAULTS.minViews);
    save();
  });

  // Allow Enter to confirm the input
  minViewsInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') minViewsInput.blur();
  });

  // Prevent non-numeric characters
  minViewsInput.addEventListener('input', () => {
    minViewsInput.value = minViewsInput.value.replace(/[^\d,]/g, '');
  });
}
