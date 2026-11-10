import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../plugins/nebulix-studio/scripts/package-plugin.mjs', import.meta.url));

async function newOutput(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-plugin-package-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('studio-plugin-package-'));
    await rm(root, { recursive: true, force: true });
  });
  return path.join(root, 'private');
}

test('private package keeps the existing server name and only its own OAuth endpoint', async t => {
  const dest = await newOutput(t);
  await run(process.execPath, [script, '--service-url', 'https://studio.example/private/api/', '--output', dest]);
  const manifest = JSON.parse(await readFile(path.join(dest, '.codex-plugin/plugin.json'), 'utf8'));
  const config = JSON.parse(await readFile(path.join(dest, manifest.mcpServers), 'utf8'));
  assert.deepEqual(config, {
    mcpServers: { 'nebulix-studio': { type: 'http', url: 'https://studio.example/private/api/mcp/studio' } },
  });
  assert.ok((await stat(path.join(dest, manifest.skills, 'studio-develop/SKILL.md'))).isFile());
});

test('private package rejects URLs containing credentials before creating output', async t => {
  const dest = await newOutput(t);
  await assert.rejects(
    run(process.execPath, [script, '--service-url', 'https://studio.example/api?token=example', '--output', dest]),
    /Invalid service URL/,
  );
  await assert.rejects(stat(dest), { code: 'ENOENT' });
});
