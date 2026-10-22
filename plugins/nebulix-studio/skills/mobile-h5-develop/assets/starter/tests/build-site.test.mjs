import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildMobile, readH5Config } from '../scripts/build.mjs';
import { createSiteZip, readSiteSource, siteManifest } from '../scripts/build-site.mjs';

async function temporary(t, prefix) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(async () => {
    const target = path.resolve(directory);
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
    assert.ok(path.basename(target).startsWith(prefix));
    await fs.rm(target, { recursive: true, force: true });
  });
  return directory;
}
test('a versioned website retains host, import map, runtime and local modules on the same immutable release', async t => {
  const outputDir = await temporary(t, 'h5-version-build-');
  const assetBasePath = '/_h5/0.1.2-123456789abc/';
  const receipt = await buildMobile({ outputDir: path.relative(process.cwd(), outputDir), assetBasePath, sourcemap: false });
  const html = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
  const config = await readH5Config();
  assert.ok(html.includes(`src="${assetBasePath}app.js"`));
  assert.ok(html.includes(`href="${assetBasePath}app.css"`));
  const imports = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  for (const value of Object.values(imports)) assert.ok(value.startsWith(`${assetBasePath}runtime/`));
  const app = await fs.readFile(path.join(outputDir, 'app.js'), 'utf8');
  assert.ok(app.includes('/__mobile/environment'), 'Environment remains a stable API endpoint');
  for (const module of receipt.modules) {
    assert.ok(module.entry.startsWith(`${assetBasePath}modules/`));
    assert.ok(app.includes(module.entry), 'Compiled composition must request the immutable module URL');
    const javascript = await fs.readFile(path.join(outputDir, module.entry.slice(assetBasePath.length)), 'utf8');
    assert.match(javascript, /from "react"/);
    assert.ok(!javascript.includes('from "/runtime/'));
    assert.ok(!javascript.includes('sourceMappingURL='));
  }
  const sdk = await fs.readFile(path.join(outputDir, 'runtime/sdk.js'), 'utf8');
  assert.ok(!sdk.includes('from "/runtime/'));
  assert.equal(receipt.modules.length, Object.keys(config.localSources).length);
  const env = JSON.parse(await fs.readFile(path.join(outputDir, '__mobile/environment'), 'utf8'));
  assert.equal(env.data.apiBaseUrl, '/api');
  await assert.rejects(buildMobile({ outputDir, assetBasePath: '//evil.test/' }), /assetBasePath/);
});
test('site provenance rejects H5 changes and accepts unrelated payroll changes', async t => {
  const directory = await temporary(t, 'h5-provenance-');
  const exec = args => { const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  const initialized = spawnSync('git', ['init'], { cwd: directory, encoding: 'utf8', windowsHide: true });
  if (initialized.status !== 0 && process.platform === 'win32' && initialized.stderr.includes('could not write config file')) {
    t.skip('Windows Git cannot initialize a temporary fixture; real customer checkout build verifies source checks separately.');
    return;
  }
  assert.equal(initialized.status, 0, initialized.stderr);
  exec(['config', 'user.name', 'H5 Test']); exec(['config', 'user.email', 'h5-test@example.invalid']);
  await fs.mkdir(path.join(directory, 'h5-app/web'), { recursive: true });
  await fs.mkdir(path.join(directory, 'web/payroll'), { recursive: true });
  await fs.writeFile(path.join(directory, 'h5-app/package.json'), '{}');
  await fs.writeFile(path.join(directory, 'h5-app/web/h5.config.ts'), 'export const h5Config = {};');
  await fs.writeFile(path.join(directory, 'h5-app/.gitignore'), 'dist/\nnode_modules/\n.local/\n');
  exec(['add', '.']); exec(['commit', '-m', 'test: source']);
  const h5 = path.join(directory, 'h5-app');
  assert.match(readSiteSource(h5).sourceCommit, /^[a-f0-9]{40}$/);
  await fs.writeFile(path.join(directory, 'web/payroll/unrelated.ts'), 'unrelated');
  await fs.mkdir(path.join(h5, 'dist'), { recursive: true }); await fs.writeFile(path.join(h5, 'dist/stale.js'), 'stale');
  assert.match(readSiteSource(h5).sourceCommit, /^[a-f0-9]{40}$/);
  await fs.writeFile(path.join(h5, 'new.ts'), 'untracked');
  assert.throws(() => readSiteSource(h5), /Commit H5 changes/);
  await fs.unlink(path.join(h5, 'new.ts'));
  await fs.writeFile(path.join(h5, 'web/h5.config.ts'), 'changed');
  assert.throws(() => readSiteSource(h5), /Commit H5 changes/);
});
test('site manifest and deterministic ZIP preserve file bytes and reject path escapes', () => {
  const manifest = siteManifest({ moduleKey: 'hlscs', version: '0.1.2', sourceCommit: 'a'.repeat(40) });
  assert.equal(manifest.releaseKey, '0.1.2-aaaaaaaaaaaa');
  const files = [{ name: 'index.html', bytes: Buffer.from('<html>中文</html>') }, { name: 'h5-site-manifest.json', bytes: Buffer.from(JSON.stringify(manifest)) }];
  const zip = createSiteZip(files);
  assert.deepEqual(zip, createSiteZip(files));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  let offset = 0;
  for (const file of files) {
    const size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26);
    assert.equal(zip.subarray(offset + 30, offset + 30 + nameSize).toString(), file.name);
    assert.deepEqual(zip.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size), file.bytes);
    offset += 30 + nameSize + size;
  }
  assert.equal(zip.readUInt32LE(offset), 0x02014b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.throws(() => createSiteZip([{ name: '../.env', bytes: Buffer.from('secret') }]), /Unsafe ZIP/);
  assert.throws(() => siteManifest({ moduleKey: 'hlscs', version: '../bad', sourceCommit: 'a'.repeat(40) }), /safe release/);
});
