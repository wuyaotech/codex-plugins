import assert from 'node:assert/strict';
import { readFile, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
    if (directory.name === 'mobile-h5-develop') {
      const starter = path.join(skillsRoot, directory.name, 'assets/starter');
      const receipt = await readJson(path.join(starter, 'starter-receipt.json'));
      const pkg = await readJson(path.join(starter, 'package.json'));
      assert.equal(pkg.dependencies['@nebulix/mobile-sdk'], 'file:vendor/mobile-sdk');
      assert.ok(!JSON.stringify(pkg).includes('workspace:'), 'Starter must install without a platform workspace');
      for (const required of ['package-lock.json', 'AGENTS.md', 'README.md', 'vendor/mobile-sdk/src/types.ts']) {
        assert.ok(receipt.files.some(file => file.path === required), `Missing starter file: ${required}`);
      }
      const seen = new Set();
      for (const file of receipt.files) {
        assert.ok(!seen.has(file.path), `Duplicate starter receipt path: ${file.path}`);
        seen.add(file.path);
        assert.ok(!file.path.includes('\\') && !file.path.split('/').includes('..') && !path.isAbsolute(file.path));
        const bytes = await readFile(path.join(starter, file.path));
        assert.equal(bytes.length, file.bytes, `Starter byte count: ${file.path}`);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Starter checksum: ${file.path}`);
      }
      console.log(`OK mobile starter ${receipt.starter.version}: ${receipt.files.length} distributed source files match receipt`);
    }
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
