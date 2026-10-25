/**
 * YouTube Sanitiser: popup tests
 * Run with `node --test` from the repository folder. Loads popup.js against a
 * stand-in for popup.html that holds just its elements with an id, and checks
 * that every setting has a control that shows it, saves it, and saves when
 * it changes.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/** A stand-in for each element in popup.html that has an id, keyed by it. */
function popupElements() {
  const elements = {};
  for (const [, id] of read('popup.html').matchAll(/\bid="([^"]+)"/g)) {
    const classes = new Set();
    elements[id] = {
      checked: false,
      value: '',
      listeners: {},
      classList: {
        toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
        contains: name => classes.has(name),
      },
      addEventListener(type, listener) { this.listeners[type] = listener; },
    };
  }
  return elements;
}

/** popup.js, loaded the way popup.html loads it, after defaults.js. */
function loadPopup() {
  const elements = popupElements();
  const popup = vm.createContext({
    // An id popup.html doesn't have gives null, as in the browser
    document: { getElementById: id => elements[id] ?? null, addEventListener() {} },
    chrome: { storage: { sync: { get() {}, set() {} } } },
  });
  for (const file of ['defaults.js', 'popup.js']) vm.runInContext(read(file), popup, { filename: file });
  // DEFAULTS is a const, so it isn't a property of the context
  const defaults = vm.runInContext('DEFAULTS', popup);
  return { popup, elements, defaults };
}

// Results come from another realm, so compare them as plain values
const plain = value => JSON.parse(JSON.stringify(value));

test('every setting shows in the popup and saves as it was', () => {
  const { popup, defaults } = loadPopup();
  // The defaults, and every setting changed from its default
  const changed = Object.fromEntries(Object.entries(defaults).map(([key, value]) =>
    [key, typeof value === 'boolean' ? !value : value * 2 + 1]));
  for (const settings of [defaults, changed]) {
    popup.applyToUI(settings);
    assert.deepStrictEqual(plain(popup.readFromUI()), plain(settings));
  }
});

test('every setting saves when its control changes', () => {
  const { popup, elements, defaults } = loadPopup();
  popup.wireUpControls();
  for (const [key, value] of Object.entries(defaults)) {
    // A checkbox saves on change, a number box once you leave it
    assert.ok(elements[key].listeners[typeof value === 'boolean' ? 'change' : 'blur'], key);
  }
});

test('a filter\'s options show only while it\'s on', () => {
  const { popup, elements, defaults } = loadPopup();
  const rowsFor = plain(vm.runInContext('OPTION_ROWS', popup));
  const allOff = Object.fromEntries(Object.keys(rowsFor).map(filter => [filter, false]));
  for (const on of Object.keys(rowsFor)) {
    popup.applyToUI({ ...defaults, ...allOff, [on]: true });
    for (const [filter, rows] of Object.entries(rowsFor)) {
      for (const row of rows) {
        assert.strictEqual(elements[row].classList.contains('hidden'), filter !== on, `${row} with ${on} on`);
      }
    }
  }
});

test('an option hides while another option makes it do nothing', () => {
  const { popup, elements, defaults } = loadPopup();
  const rowsFor = plain(vm.runInContext('OPTION_ROWS', popup));
  for (const [row, option] of Object.entries(plain(vm.runInContext('HIDDEN_BY', popup)))) {
    // With its filter on, only the other option decides
    const filter = Object.keys(rowsFor).find(f => rowsFor[f].includes(row));
    for (const on of [false, true]) {
      popup.applyToUI({ ...defaults, [filter]: true, [option]: on });
      assert.strictEqual(elements[row].classList.contains('hidden'), on, `${row} with ${option} ${on ? 'on' : 'off'}`);
    }
  }
});

test('the watched percentage stays between 1 and 100', () => {
  const { popup, elements, defaults } = loadPopup();
  popup.applyToUI(defaults);
  popup.wireUpControls();
  const input = elements.watchedPercent;
  for (const [typed, shown] of [['50', '50%'], ['250', '100%'], ['0', `${defaults.watchedPercent}%`], ['', `${defaults.watchedPercent}%`]]) {
    input.value = typed;
    input.listeners.blur();
    assert.strictEqual(input.value, shown, `typed ${typed || 'nothing'}`);
  }
});
