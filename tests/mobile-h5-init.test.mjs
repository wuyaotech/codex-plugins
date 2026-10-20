import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, symlink, unlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { initializeH5 } from '../plugins/nebulix-studio/skills/mobile-h5-develop/scripts/init-h5.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nebulix-plugin-init-'));
  const source = path.join(root, 'starter');
  await mkdir(path.join(source, 'vendor', 'mobile-sdk'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), '{"private":true}');
  await writeFile(path.join(source, 'package-lock.json'), '{"lockfileVersion":3}');
  await writeFile(path.join(source, 'vendor', 'mobile-sdk', 'index.ts'), 'export const version = 1;');
  t.after(async () => {
    const absolute = path.resolve(root);
    assert.ok(absolute.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(absolute).startsWith('nebulix-plugin-init-'));
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  return { root, source };
}

test('initializer copies self-contained sources and lockfile into a new customer directory', async t => {
  const { root, source } = await fixture(t);
  const target = path.join(root, 'h5-app');
  const created = await initializeH5(target, { starterDir: source });
  assert.equal(created, await realpath(target));
  assert.equal(await readFile(path.join(target, 'vendor/mobile-sdk/index.ts'), 'utf8'), 'export const version = 1;');
  assert.equal(await readFile(path.join(target, 'package-lock.json'), 'utf8'), '{"lockfileVersion":3}');
});

test('initializer preserves both populated and empty existing customer directories', async t => {
  const { root, source } = await fixture(t);
  for (const name of ['existing', 'empty']) {
    const target = path.join(root, name);
    await mkdir(target);
    if (name === 'existing') await writeFile(path.join(target, 'customer.txt'), 'keep this work');
    await assert.rejects(() => initializeH5(target, { starterDir: source }), { code: 'EEXIST' });
    assert.deepEqual(await readdir(target), name === 'existing' ? ['customer.txt'] : []);
  }
});

test('initializer rejects generated/private content and output inside its own template', async t => {
  const { root, source } = await fixture(t);
  await assert.rejects(() => initializeH5(path.join(source, 'nested'), { starterDir: source }), /outside/);
  await mkdir(path.join(source, 'node_modules'));
  await assert.rejects(() => initializeH5(path.join(root, 'h5-app'), { starterDir: source }), /generated or private/);
  assert.deepEqual((await readdir(root)).sort(), ['starter']);
});

test('initializer rejects template symlinks without copying their external target', async t => {
  const { root, source } = await fixture(t);
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'private.txt'), 'must remain outside');
  const link = path.resolve(source, 'linked');
  assert.ok(link.startsWith(`${path.resolve(root)}${path.sep}`));
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await assert.rejects(() => initializeH5(path.join(root, 'h5-app'), { starterDir: source }), /symbolic links/);
    assert.equal(await readFile(path.join(outside, 'private.txt'), 'utf8'), 'must remain outside');
  } finally {
    await unlink(link);
  }
});
