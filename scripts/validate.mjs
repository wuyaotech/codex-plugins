import assert from 'node:assert/strict';
import { readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const resolveInside = async (base, relative) => {
  assert.equal(typeof relative, 'string', 'Path must be a string');
  assert.ok(relative.startsWith('./'), `Path must start with ./: ${relative}`);
  const resolved = await realpath(path.resolve(base, relative));
  const within = path.relative(base, resolved);
  assert.ok(within && within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within), `Path escapes package: ${relative}`);
  return resolved;
};

const marketplace = await readJson(path.join(root, '.agents/plugins/marketplace.json'));
assert.equal(marketplace.name, 'wuyaotech');
assert.ok(marketplace.interface?.displayName);
assert.ok(marketplace.plugins.length > 0);
const names = new Set();

for (const entry of marketplace.plugins) {
  assert.match(entry.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(!names.has(entry.name), `Duplicate plugin: ${entry.name}`);
  names.add(entry.name);
  assert.equal(entry.source.source, 'local');
  assert.equal(entry.policy.installation, 'AVAILABLE');
  assert.equal(entry.policy.authentication, 'ON_INSTALL');
  assert.ok(entry.category);
  const pluginRoot = await resolveInside(root, entry.source.path);
  const manifest = await readJson(path.join(pluginRoot, '.codex-plugin/plugin.json'));
  assert.equal(manifest.name, entry.name);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description && manifest.author?.name && manifest.interface?.displayName);
  const skillsRoot = await resolveInside(pluginRoot, manifest.skills);
  const skillDirectories = (await readdir(skillsRoot, { withFileTypes: true })).filter(item => item.isDirectory());
  assert.ok(skillDirectories.length > 0);
  for (const directory of skillDirectories) {
    const skill = await readFile(path.join(skillsRoot, directory.name, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\r?\nname: .+\r?\ndescription: .+\r?\n---/);
  }
  const mcp = await readJson(await resolveInside(pluginRoot, manifest.mcpServers));
  assert.ok(Object.keys(mcp.mcpServers).length > 0);
  for (const server of Object.values(mcp.mcpServers)) {
    assert.deepEqual(Object.keys(server).sort(), ['type', 'url'], 'Distribute endpoint only; do not embed credentials or headers');
    assert.equal(server.type, 'http');
    const url = new URL(server.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(!url.username && !url.password && !url.search && !url.hash);
    if (entry.name === 'nebulix-studio') {
      assert.equal(url.href, 'https://nebulix-web-dev.wuyaotech.com/api/mcp/studio');
    }
  }
  console.log(`OK ${entry.name}@${manifest.version}: manifest, skills, paths, credential-free HTTPS MCP`);
}
console.log(`OK ${marketplace.name}: ${names.size} plugin(s)`);
