import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exportStarter, STARTER_VERSION } from '../scripts/export-starter.mjs';
import { root } from '../scripts/tooling.mjs';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'h5-starter-export-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('h5-starter-export-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return directory;
}
test('export is self-contained, pins React 18 and local SDK, and records verifiable source hashes', async t => {
  const directory = await fixture(t);
  const result = await exportStarter({ output: path.join(directory, 'h5-app'), moduleKey: 'hlscs' });
  const manifest = JSON.parse(await fs.readFile(path.join(result.output, 'package.json'), 'utf8'));
  assert.equal(manifest.version, STARTER_VERSION);
  assert.equal(manifest.dependencies.react, '18.3.1');
  assert.equal(manifest.dependencies['@nebulix/mobile-sdk'], 'file:vendor/mobile-sdk');
  assert.ok(!JSON.stringify(manifest).includes('workspace:'));
  for (const script of ['dev', 'build', 'typecheck', 'test', 'build:module']) assert.ok(manifest.scripts[script]);
  const config = JSON.parse(await fs.readFile(path.join(result.output, 'tsconfig.json'), 'utf8'));
  assert.deepEqual(config.compilerOptions.paths['@nebulix/mobile-sdk'], ['./vendor/mobile-sdk/src/index.ts']);
  assert.ok(config.include.includes('modules/**/*.tsx'));
  assert.match(await fs.readFile(path.join(result.output, '.gitattributes'), 'utf8'), /^\* -text$/m);
  const receipt = JSON.parse(await fs.readFile(path.join(result.output, 'starter-receipt.json'), 'utf8'));
  assert.equal(receipt.moduleKey, 'hlscs');
  assert.equal(receipt.sdk.version, result.sdk.version);
  assert.match(receipt.sdk.sourceSha256, /^[a-f0-9]{64}$/);
  for (const file of receipt.files) {
    assert.ok(!file.path.split('/').some(part => ['node_modules', 'dist', '.git', '.local'].includes(part)));
    const bytes = await fs.readFile(path.join(result.output, file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  assert.equal(result.hasLockfile, true);
  const lock = JSON.parse(await fs.readFile(path.join(result.output, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].dependencies.react, '18.3.1');
});
test('export refuses existing customer content, source directories and invalid module keys', async t => {
  const directory = await fixture(t);
  const existing = path.join(directory, 'customer');
  await fs.mkdir(existing);
  await fs.writeFile(path.join(existing, 'keep.txt'), 'customer work');
  await assert.rejects(exportStarter({ output: existing, moduleKey: 'hlscs' }), /empty regular directory/);
  assert.equal(await fs.readFile(path.join(existing, 'keep.txt'), 'utf8'), 'customer work');
  await assert.rejects(exportStarter({ output: path.join(root, 'unsafe-output'), moduleKey: 'hlscs' }), /outside/);
  await assert.rejects(exportStarter({ output: path.join(directory, 'unused'), moduleKey: '../escape' }), /module-key/);
});
