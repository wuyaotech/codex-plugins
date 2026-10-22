import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root } from './tooling.mjs';
import { buildMobile, readH5Config } from './build.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const safeVersion = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Git check failed: ${result.stderr?.trim() || 'not a Git checkout'}`);
  return result.stdout.trim();
}
/** Scope provenance to this H5 directory. An unrelated PC/payroll change is not part of this artifact. */
export function readSiteSource(directory = root) {
  const sourceCommit = git(directory, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('A committed Git source is required.');
  const changes = git(directory, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']);
  if (changes) throw new Error('Commit H5 changes before build:site. The H5 directory contains tracked or untracked source changes.');
  if (!git(directory, ['ls-files', '--', 'package.json', 'web/h5.config.ts']).split('\n').some(file => file.endsWith('web/h5.config.ts'))) {
    throw new Error('The H5 source must be tracked in Git.');
  }
  return { sourceCommit };
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
/** Small deterministic ZIP32 STORE writer; no host zip executable, dependency, symlink or extra files. */
export function createSiteZip(files) {
  const local = [], central = [];
  let offset = 0;
  if (files.length > 65535) throw new Error('Too many site files.');
  for (const { name, bytes } of files) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe ZIP path: ${name}`);
    const filename = Buffer.from(name), checksum = crc32(bytes);
    if (bytes.length > 0xffffffff || offset > 0xffffffff) throw new Error('Site exceeds ZIP32 limits.');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0x21, 12); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, bytes);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(0x21, 14); record.writeUInt32LE(checksum, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += header.length + filename.length + bytes.length;
  }
  const centralSize = central.reduce((total, bytes) => total + bytes.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
export function siteManifest({ moduleKey, version, sourceCommit }) {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleKey || '')) throw new Error('--module-key must be a lowercase module identifier.');
  if (!safeVersion.test(version || '')) throw new Error('h5Config.version must be a safe release version.');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('sourceCommit must be a full Git SHA.');
  return { schemaVersion: 1, moduleKey, version, sourceCommit, releaseKey: `${version}-${sourceCommit.slice(0, 12)}`, entry: 'index.html' };
}
async function collect(directory, relative = '') {
  const files = [];
  for (const item of (await fs.readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.posix.join(relative, item.name);
    if (item.isSymbolicLink()) throw new Error('Build outputs must not contain links.');
    if (item.isDirectory()) files.push(...await collect(directory, name));
    else if (item.isFile()) {
      if (name.endsWith('.map') || name.startsWith('artifacts/') || name === 'build-receipt.json') continue;
      if (!(/^(index\.html|h5-site-manifest\.json|app\.(js|css)|(?:runtime|modules)\/[a-zA-Z0-9_./-]+\.(?:js|css)|__mobile\/environment)$/.test(name))) throw new Error(`Unexpected build output: ${name}`);
      files.push({ name, bytes: await fs.readFile(path.join(directory, name)) });
    }
  }
  return files;
}
export async function buildSite({ moduleKey, output = path.join(root, 'dist/site') }) {
  const before = readSiteSource();
  const config = await readH5Config();
  const manifest = siteManifest({ moduleKey, version: config.version, ...before });
  const assetBasePath = `/_h5/${manifest.releaseKey}/`;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nebulix-site-build-'));
  try {
    await buildMobile({ outputDir: temporary, assetBasePath, sourcemap: false });
    await fs.writeFile(path.join(temporary, 'h5-site-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    const after = readSiteSource();
    if (before.sourceCommit !== after.sourceCommit) throw new Error('Git HEAD changed during the build; retry from a stable source.');
    const files = await collect(temporary);
    const zip = createSiteZip(files);
    if (zip.length > 24 * 1024 * 1024) throw new Error('H5 site ZIP exceeds 24 MiB.');
    const destination = path.resolve(output);
    await fs.mkdir(destination, { recursive: true });
    const filename = `${moduleKey}-${manifest.releaseKey}.zip`;
    await fs.writeFile(path.join(destination, filename), zip);
    const receipt = { kind: 'h5-site', moduleKey, version: manifest.version, sourceCommit: manifest.sourceCommit, releaseKey: manifest.releaseKey, entry: 'index.html', assetBasePath, zip: path.join(destination, filename), sha256: sha256(zip), size: zip.length, files: files.map(file => ({ path: file.name, bytes: file.bytes.length, sha256: sha256(file.bytes) })) };
    await fs.writeFile(path.join(destination, `${filename}.receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
  } finally {
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('nebulix-site-build-')) throw new Error('Unexpected temporary build path.');
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      const key = { '--module-key': 'moduleKey', '--output': 'output' }[args[index]], value = args[index + 1];
      if (!key || !value || value.startsWith('--') || options[key]) throw new Error('Usage: node scripts/build-site.mjs --module-key <key> [--output <directory>]');
      options[key] = value;
    }
    console.log(JSON.stringify(await buildSite(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
