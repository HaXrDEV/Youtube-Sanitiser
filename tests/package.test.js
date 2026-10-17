/**
 * YouTube Sanitiser: packaging tests
 * Run with `node --test` from the repository folder. Checks that every script
 * parses, that the release zip built by .github/build-zip.sh holds every
 * file the extension loads, so a release can't ship without one, and that the
 * manifest keeps what Firefox needs.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

/** The files the extension loads: everything the manifest names, and what the popup page links to. */
function extensionFiles() {
  const files = new Set(['manifest.json']);
  for (const script of manifest.content_scripts ?? []) {
    for (const file of script.js ?? []) files.add(file);
  }
  for (const icons of [manifest.icons, manifest.action?.default_icon]) {
    for (const file of Object.values(icons ?? {})) files.add(file);
  }
  const popup = manifest.action?.default_popup;
  if (popup) {
    files.add(popup);
    for (const [, file] of read(popup).matchAll(/\b(?:src|href)="([^"]+)"/g)) {
      // Links to web pages aren't files the extension ships
      if (!/^[a-z][a-z\d+.-]*:/i.test(file)) files.add(file);
    }
  }
  return [...files];
}

/** The files the release zips, from the `zip -r youtube-sanitiser.zip \` command in build-zip.sh. */
function zippedFiles() {
  const lines = read('.github/build-zip.sh').split(/\r?\n/);
  const start = lines.findIndex(line => line.includes('zip -r youtube-sanitiser.zip'));
  assert.ok(start >= 0, 'build-zip.sh has no zip command');
  const files = [];
  for (const line of lines.slice(start + 1).map(l => l.trim())) {
    files.push(line.replace(/\s*\\$/, ''));
    if (!line.endsWith('\\')) break;
  }
  return files;
}

test('the release zip holds every file the extension loads', () => {
  const zipped = new Set(zippedFiles());
  assert.deepStrictEqual(extensionFiles().filter(file => !zipped.has(file)), []);
});

test('every file the release zips exists', () => {
  assert.deepStrictEqual(zippedFiles().filter(file => !fs.existsSync(path.join(root, file))), []);
});

// The lint in the workflows fails without an add-on ID but only warns without
// data collection permissions. The ID has to stay the same, as Firefox keeps
// synced settings and the addons.mozilla.org listing under it.
test('the manifest keeps what Firefox needs', () => {
  const { gecko } = manifest.browser_specific_settings;
  assert.strictEqual(gecko.id, 'youtube-sanitiser@haxr');
  assert.ok(gecko.data_collection_permissions, 'no data_collection_permissions');
});

test('every script parses', () => {
  const scripts = [
    ...fs.readdirSync(root),
    ...fs.readdirSync(path.join(root, 'tests')).map(file => `tests/${file}`),
  ].filter(file => file.endsWith('.js'));
  for (const file of scripts) {
    assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), file);
  }
});
