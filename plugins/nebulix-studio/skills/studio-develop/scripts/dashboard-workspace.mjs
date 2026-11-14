#!/usr/bin/env node
/** One-shot file adapter. It has no browser credentials, server process or arbitrary remote-file API. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const MAX_BYTES = 100 * 1024 * 1024;
const fail = code => { throw new Error(code); };
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 300 || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f:]/.test(value)
    || value.split('/').some(x => !x || x === '.' || x === '..' || /[. ]$/.test(x) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x))) fail('WORKSPACE_PATH_INVALID');
  return value;
}
export async function noSymlink(target) {
  const resolved = path.resolve(target), parsed = path.parse(resolved);
  let current = parsed.root;
  for (const part of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) fail('WORKSPACE_SYMLINK_DENIED'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return resolved;
}
function validateManifest(manifest) {
  if (!manifest || manifest.format !== 'dashboard-workspace' || manifest.formatVersion !== 1 || !Array.isArray(manifest.files)
    || manifest.files.length > 2000 || !Array.isArray(manifest.protectedPaths) || !Array.isArray(manifest.unresolved)) fail('WORKSPACE_MANIFEST_INVALID');
  const seen = new Set();
  for (const entry of manifest.files) {
    safeRelative(entry.path); const folded = entry.path.toLowerCase();
    if (seen.has(folded) || [...seen].some(p => p.startsWith(folded + '/') || folded.startsWith(p + '/'))
      || !['schema', 'source', 'compiled', 'metadata', 'asset'].includes(entry.role)) fail('WORKSPACE_DUPLICATE_PATH');
    seen.add(folded);
  }
  if (!manifest.files.some(f => f.path === 'schema.json' && f.role === 'schema')) fail('WORKSPACE_SCHEMA_MISSING');
}
export function validateBundle(bundle) {
  validateManifest(bundle?.manifest);
  if (!Array.isArray(bundle.files) || bundle.files.length !== bundle.manifest.files.length) fail('WORKSPACE_MANIFEST_INVALID');
  const seen = new Set(); let total = 0;
  for (const file of bundle.files) {
    safeRelative(file.path);
    if (seen.has(file.path) || !['utf8', 'base64'].includes(file.encoding) || typeof file.content !== 'string') fail('WORKSPACE_FILE_INVALID');
    seen.add(file.path);
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    const expected = bundle.manifest.files.find(f => f.path === file.path);
    if (!expected || expected.role !== file.role || expected.size !== bytes.length || file.size !== bytes.length
      || expected.sha256 !== sha256(bytes) || file.sha256 !== expected.sha256
      || file.encoding === 'base64' && bytes.toString('base64') !== file.content) fail('WORKSPACE_CHECKSUM_MISMATCH');
    total += bytes.length;
    if (total > MAX_BYTES) fail('WORKSPACE_TOO_LARGE');
  }
  return bundle;
}
async function readStable(file) {
  await noSymlink(file);
  const before = await fs.stat(file);
  if (!before.isFile() || before.size > MAX_BYTES) fail('WORKSPACE_FILE_INVALID');
  const bytes = await fs.readFile(file), after = await fs.stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail('WORKSPACE_FILE_CHANGED');
  return bytes;
}
export async function unpackBundle(bundle, destination) {
  validateBundle(bundle);
  const target = await noSymlink(destination), parent = await noSymlink(path.dirname(target));
  // Never overwrite an existing directory, including untracked or locally changed files.
  try { await fs.lstat(target); fail('WORKSPACE_DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, '.dashboard-import-'));
  try {
    for (const file of bundle.files) {
      const output = path.resolve(staging, safeRelative(file.path));
      if (!output.startsWith(staging + path.sep)) fail('WORKSPACE_PATH_INVALID');
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'), { flag: 'wx' });
    }
    await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2) + '\n', { flag: 'wx' });
    await fs.writeFile(path.join(staging, '.development-base.json'), JSON.stringify({ formatVersion: 1, manifestDigest: sha256(JSON.stringify(bundle.manifest)), files: bundle.manifest.files }, null, 2) + '\n', { flag: 'wx' });
    await noSymlink(parent);
    try { await fs.lstat(target); fail('WORKSPACE_DESTINATION_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(staging, target);
    return { directory: target, files: bundle.files.length, unresolved: bundle.manifest.unresolved.length };
  } finally {
    // Only the helper-created temporary sibling may be removed; never the destination or a computed user tree.
    if (path.dirname(staging) === parent && path.basename(staging).startsWith('.dashboard-import-')) await fs.rm(staging, { recursive: true, force: true });
  }
}
export async function packWorkspace(directory, output) {
  const root = await noSymlink(directory), out = await noSymlink(output);
  if (out === root || out.startsWith(root + path.sep)) fail('WORKSPACE_OUTPUT_MUST_BE_OUTSIDE');
  const manifestBytes = await readStable(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')); validateManifest(manifest);
  const files = []; let total = 0;
  for (const entry of manifest.files) {
    const file = path.resolve(root, safeRelative(entry.path));
    if (!file.startsWith(root + path.sep)) fail('WORKSPACE_PATH_INVALID');
    const bytes = await readStable(file); total += bytes.length;
    if (total > MAX_BYTES) fail('WORKSPACE_TOO_LARGE');
    const text = entry.role !== 'asset' || /\.(?:json|csv|svg|txt|[cm]?js|css|jsx|tsx?)$/i.test(entry.path);
    const encoding = text && Buffer.from(bytes.toString('utf8')).equals(bytes) ? 'utf8' : 'base64';
    files.push({ path: entry.path, role: entry.role, size: bytes.length, sha256: sha256(bytes), encoding, content: bytes.toString(encoding === 'utf8' ? 'utf8' : 'base64') });
  }
  // A concurrent edit during reading invalidates the package; no stale mixed snapshot is emitted.
  if (!manifestBytes.equals(await readStable(path.join(root, 'manifest.json')))) fail('WORKSPACE_FILE_CHANGED');
  for (const file of files) if (sha256(await readStable(path.join(root, file.path))) !== file.sha256) fail('WORKSPACE_FILE_CHANGED');
  manifest.files = files.map(({ content, encoding, ...metadata }) => metadata);
  const bundle = validateBundle({ manifest, files }), bytes = Buffer.from(JSON.stringify(bundle));
  if (bytes.length > MAX_BYTES) fail('WORKSPACE_TOO_LARGE');
  await fs.mkdir(path.dirname(out), { recursive: true }); await noSymlink(path.dirname(out));
  await fs.writeFile(out, bytes, { flag: 'wx' });
  return { file: out, fileName: path.basename(out), contentType: 'application/json', kind: 'workspace', size: bytes.length, sha256: sha256(bytes), files: files.length };
}
function transferReceipt(receipt, direction) {
  if (!Number.isSafeInteger(receipt.size) || receipt.size < 1 || receipt.size > MAX_BYTES || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) fail('WORKSPACE_TRANSFER_INVALID');
  const address = receipt[direction === 'upload' ? 'uploadUrl' : 'downloadUrl'];
  const url = new URL(address);
  if (url.username || url.password || url.hash || url.search || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('WORKSPACE_TRANSFER_URL_INVALID');
  if (!url.pathname.endsWith(`/development/artifact/transfer-${direction}`)) fail('WORKSPACE_TRANSFER_URL_INVALID');
  const expiry = Date.parse(receipt.expiresAt);
  if (!receipt.headers || !/^[A-Za-z0-9_-]{43}$/.test(receipt.headers['X-Development-Transfer'] ?? '') || !Number.isFinite(expiry) || expiry <= Date.now()) fail('WORKSPACE_TRANSFER_EXPIRED');
  return { url: url.href, headers: { 'X-Development-Transfer': receipt.headers['X-Development-Transfer'] } };
}
async function downloadBytes(receipt) {
  const transfer = transferReceipt(receipt, 'download');
  const response = await fetch(transfer.url, { headers: transfer.headers, redirect: 'error' });
  if (!response.ok) fail(`WORKSPACE_DOWNLOAD_HTTP_${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > MAX_BYTES || size > receipt.size) { await response.body.cancel().catch(() => {}); fail('WORKSPACE_TOO_LARGE'); } chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== receipt.size || sha256(bytes) !== receipt.sha256) fail('WORKSPACE_CHECKSUM_MISMATCH');
  return bytes;
}
export async function downloadWorkspace(receipt, destination) {
  return unpackBundle(JSON.parse((await downloadBytes(receipt)).toString('utf8')), destination);
}
export async function downloadFile(receipt, output) {
  const out = await noSymlink(output), bytes = await downloadBytes(receipt);
  await fs.mkdir(path.dirname(out), { recursive: true }); await noSymlink(path.dirname(out));
  await fs.writeFile(out, bytes, { flag: 'wx' });
  return { file: out, size: bytes.length, sha256: sha256(bytes) };
}
export async function uploadArtifact(receipt, file) {
  const transfer = transferReceipt(receipt, 'upload'), bytes = await readStable(file);
  if (bytes.length !== receipt.size || sha256(bytes) !== receipt.sha256) fail('WORKSPACE_CHECKSUM_MISMATCH');
  const response = await fetch(transfer.url, { method: 'PUT', headers: { ...transfer.headers, 'Content-Type': 'application/octet-stream' }, body: bytes, redirect: 'error' });
  if (!response.ok) fail(`WORKSPACE_UPLOAD_HTTP_${response.status}`);
  const value = await response.json();
  if (value.code !== 200) fail('WORKSPACE_UPLOAD_REJECTED');
  return { artifactRef: receipt.artifactRef, state: value.data?.state, size: bytes.length, sha256: sha256(bytes), next: 'Call dashboard_artifact_complete with the same artifactRef.' };
}

export async function main(args = process.argv.slice(2)) {
  const option = key => { const i = args.indexOf(key); if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--')) fail(`MISSING_${key}`); return args[i + 1]; };
  switch (args[0]) {
    case 'unpack': return unpackBundle(JSON.parse((await readStable(option('--file'))).toString('utf8')), option('--dir'));
    case 'pack': return packWorkspace(option('--dir'), option('--out'));
    case 'download': return downloadWorkspace(JSON.parse((await readStable(option('--receipt'))).toString('utf8')), option('--dir'));
    case 'download-file': return downloadFile(JSON.parse((await readStable(option('--receipt'))).toString('utf8')), option('--out'));
    case 'upload': return uploadArtifact(JSON.parse((await readStable(option('--receipt'))).toString('utf8')), option('--file'));
    default: fail('Usage: dashboard-workspace.mjs download|download-file|unpack|pack|upload --receipt <tool-result.json> --file <bundle.json> --dir <workspace> --out <bundle.json>');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
