import assert from 'node:assert/strict';
import test from 'node:test';
import { overrideLupuManifest, startDevBrowser } from '../plugins/nebulix-studio/skills/studio-develop/scripts/lupu-dev-browser.mjs';

const localEntry = 'http://127.0.0.1:5190/dev/remote-entry.js';
const platform = {
  moduleKey: 'platform',
  version: '0.1.0',
  entry: 'https://dev-artifacts.example/platform/entry.js',
};
const lupu = {
  moduleKey: 'lupu-bridge',
  version: '0.1.15',
  entry: 'https://dev-artifacts.example/lupu-bridge/entry.js',
  peer: { react: '^19' },
  appearance: {
    entry: 'https://dev-artifacts.example/lupu-bridge/appearance.js',
    brand: { logo: 'https://dev-artifacts.example/lupu-bridge/logo.png' },
  },
};
const sibling = {
  moduleKey: 'lupu-bridge-preview',
  version: '0.1.0',
  entry: 'https://dev-artifacts.example/lupu-bridge-preview/entry.js',
};
const manifest = { version: '1', modules: [platform, lupu, sibling] };

function override(value, entry = localEntry) {
  return JSON.parse(overrideLupuManifest(JSON.stringify(value), entry));
}

test('changes only the exact Lupu entry and preserves appearance, peers and neighboring modules', () => {
  assert.deepEqual(override(manifest), {
    ...manifest,
    modules: [platform, { ...lupu, entry: localEntry }, sibling],
  });
});

test('preserves the dev API response envelope', () => {
  const envelope = { code: 200, message: 'success', data: manifest };
  assert.deepEqual(override(envelope), {
    ...envelope,
    data: { ...manifest, modules: [platform, { ...lupu, entry: localEntry }, sibling] },
  });
});

test('rejects a missing or duplicated Lupu module instead of adding or replacing multiple items', () => {
  assert.throws(() => override({ ...manifest, modules: [platform, sibling] }));
  assert.throws(() => override({ ...manifest, modules: [lupu, platform, { ...lupu }] }));
});

test('rejects malformed JSON or a manifest without a module list', () => {
  assert.throws(() => overrideLupuManifest('{', localEntry));
  assert.throws(() => override({ version: '1', modules: null }));
});

test('accepts only a loopback HTTP URL for the module development entry', () => {
  const invalidEntries = [
    'https://nebulix-web.wuyaotech.com/dev/remote-entry.js',
    'http://192.0.2.10:5190/dev/remote-entry.js',
    'http://127.0.0.1.example:5190/dev/remote-entry.js',
    'http://developer@127.0.0.1:5190/dev/remote-entry.js',
    'http://127.0.0.1:5190/dev/other.js',
    'http://127.0.0.1:5190/dev/remote-entry.js?extra=1',
    'http://127.0.0.1:5190/dev/remote-entry.js#extra',
  ];
  for (const entry of invalidEntries) {
    assert.throws(() => override(manifest, entry), undefined, `Accepted invalid entry: ${entry}`);
  }
});

test('rejects production and other browser destinations before starting Chrome', async () => {
  const invalidDestinations = [
    'https://nebulix-web.wuyaotech.com/',
    'https://nebulix-web-dev.wuyaotech.com.example/',
    'https://developer@nebulix-web-dev.wuyaotech.com/',
    'http://nebulix-web-dev.wuyaotech.com/',
  ];
  for (const url of invalidDestinations) {
    await assert.rejects(startDevBrowser({ entry: localEntry, url }), /must open the Nebulix cloud dev origin/);
  }
});
