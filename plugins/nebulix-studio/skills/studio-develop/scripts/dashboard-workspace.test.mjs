import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, safeRelative, unpackBundle, packWorkspace, validateBundle } from './dashboard-workspace.mjs';

function bundle() {
  const bytes = Buffer.from('{"id":"demo","documents":[]}');
  const file = { path: 'schema.json', role: 'schema', size: bytes.length, sha256: sha256(bytes), encoding: 'utf8', content: bytes.toString() };
  return { manifest: { format: 'dashboard-workspace', formatVersion: 1, dashboardUuid: 'demo', protectedPaths: [], unresolved: [], files: [{ path: file.path, role: file.role, size: file.size, sha256: file.sha256 }] }, files: [file] };
}
test('materialize to new directory, edit, repack, and refuse to overwrite existing files', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-files-test-'));
  try {
    const dir = path.join(temp, 'workspace'); await unpackBundle(bundle(), dir);
    await fs.writeFile(path.join(dir, 'schema.json'), '{"id":"demo","name":"edited","documents":[]}');
    const result = await packWorkspace(dir, path.join(temp, 'candidate.json'));
    const candidate = validateBundle(JSON.parse(await fs.readFile(result.file, 'utf8')));
    assert.match(candidate.files[0].content, /edited/);
    assert.equal(result.sha256, sha256(await fs.readFile(result.file)));
    await assert.rejects(unpackBundle(bundle(), dir), /WORKSPACE_DESTINATION_EXISTS/);
    assert.match(await fs.readFile(path.join(dir, 'schema.json'), 'utf8'), /edited/);
    await assert.rejects(packWorkspace(dir, path.join(temp, 'candidate.json')), /EEXIST/);
  } finally { assert.equal(path.dirname(temp), os.tmpdir()); await fs.rm(temp, { recursive: true, force: true }); }
});
test('reject traversal, duplicate case-insensitive paths and modified transfer bytes', () => {
  for (const value of ['../x', 'a/../x', 'C:/windows/x', 'a\\x', '/root', 'NUL.json', 'x.']) assert.throws(() => safeRelative(value));
  const value = bundle(); value.files[0].content += 'tampered'; assert.throws(() => validateBundle(value), /CHECKSUM/);
  const dup = bundle(); dup.manifest.files.push({ ...dup.manifest.files[0], path: 'SCHEMA.json' }); assert.throws(() => validateBundle(dup), /DUPLICATE/);
});
test('packaged CLI runs from an independent working directory without the platform repository', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-standalone-test-'));
  try {
    const input = path.join(temp, 'input.json'), output = path.join(temp, 'workspace');
    await fs.writeFile(input, JSON.stringify(bundle()));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./dashboard-workspace.mjs', import.meta.url)), 'unpack', '--file', input, '--dir', output],
      { cwd: temp, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).files, 1);
    assert.equal(await fs.readFile(path.join(output, 'schema.json'), 'utf8'), bundle().files[0].content);
  } finally { assert.equal(path.dirname(temp), os.tmpdir()); await fs.rm(temp, { recursive: true, force: true }); }
});
