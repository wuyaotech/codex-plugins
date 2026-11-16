#!/usr/bin/env node
/** Local checkout discovery and cooperative claims. Never clones, fetches or modifies Git files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const executeFile = promisify(execFile);
const MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_DISCOVERY = 240;
const MAX_CHILDREN = 160;
const IGNORED_DIRECTORIES = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', '.git', '.codex', '.cache']);
const COMMANDS = new Set(['resolve', 'register', 'list', 'forget', 'claim', 'release']);
const ERROR_MESSAGES = {
  WORKSPACE_URL_INVALID: 'A credential-free HTTP(S) or SSH repository URL is required.',
  WORKSPACE_REGISTRY_INVALID: 'The registry is invalid; it was not reset or overwritten.',
  WORKSPACE_REGISTRY_BUSY: 'Another registry writer or a retained lock exists; no unknown lock was removed.',
  WORKSPACE_REMOTE_MISMATCH: 'The checkout origin does not match the requested repository.',
  WORKSPACE_CLAIMED: 'Another owner has claimed this checkout.',
  WORKSPACE_OWNER_MISMATCH: 'The claim belongs to another owner.',
  WORKSPACE_NOT_REGISTERED: 'Register this verified checkout before claiming it.',
  WORKSPACE_DIRECTORY_INVALID: 'The module directory must remain within the verified checkout.',
};
export class WorkspaceError extends Error {
  constructor(code) { super(ERROR_MESSAGES[code] ?? code); this.code = code; }
}
const fail = code => { throw new WorkspaceError(code); };
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value);
const pathKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const samePath = (left, right) => pathKey(left) === pathKey(right);
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return !relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
};

export function defaultRegistryPath() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugin-data', 'nebulix-studio', 'workspaces.json');
}

/** Transport aliases share an identity, but repository path case and custom ports remain significant. */
export function normalizeRepositoryUrl(value) {
  if (!text(value) || value !== value.trim() || /[\\?#]/.test(value)) fail('WORKSPACE_URL_INVALID');
  let url;
  try {
    // URL() removes dot segments. Reject them before parsing so they cannot silently change identity.
    const rawPath = value.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*\/?/i, '').replace(/^(?:[^@/:]+@)?(?:\[[^\]]+\]|[^/:]+):/, '');
    if (decodeURIComponent(rawPath).split('/').some(segment => segment === '.' || segment === '..')) fail('WORKSPACE_URL_INVALID');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) url = new URL(value);
    else {
      const match = /^(?:([^@/:]+)@)?(\[[^\]]+\]|[^/:]+):(.+)$/.exec(value);
      if (!match) fail('WORKSPACE_URL_INVALID');
      url = new URL(`ssh://${match[1] ? encodeURIComponent(match[1]) + '@' : ''}${match[2]}/${match[3]}`);
    }
  } catch { fail('WORKSPACE_URL_INVALID'); }
  if (!['https:', 'http:', 'ssh:'].includes(url.protocol) || !url.hostname || url.search || url.hash || url.password
    || (url.protocol !== 'ssh:' && url.username)) fail('WORKSPACE_URL_INVALID');
  let repositoryPath;
  try { repositoryPath = decodeURIComponent(url.pathname); } catch { fail('WORKSPACE_URL_INVALID'); }
  if (!text(repositoryPath) || /[\\?#]/.test(repositoryPath)) fail('WORKSPACE_URL_INVALID');
  repositoryPath = repositoryPath.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!repositoryPath || repositoryPath.split('/').some(segment => !segment || segment === '.' || segment === '..')) fail('WORKSPACE_URL_INVALID');
  const port = url.protocol === 'ssh:' && url.port === '22' ? '' : url.port;
  const key = `${url.hostname.toLowerCase()}${port ? ':' + port : ''}/${repositoryPath}`;
  // Keep the safe transport URL for display; never replace a requested Git transport with a guessed one.
  return { key, repositoryUrl: value };
}

function safePath(value) {
  if (!text(value)) fail('WORKSPACE_PATH_INVALID');
  return path.resolve(value);
}
export function safeModuleDirectory(value = '.') {
  if (!text(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /[:\\]/.test(value)
    || value.split('/').some(segment => segment === '..')) fail('WORKSPACE_DIRECTORY_INVALID');
  return value;
}
function safeOwner(owner) {
  if (!text(owner) || owner.length > 200) fail('WORKSPACE_OWNER_INVALID');
  return owner;
}
function repositoryInput(options) {
  if (!options.repositoryUrl) fail('WORKSPACE_URL_INVALID');
  return normalizeRepositoryUrl(options.repositoryUrl);
}

async function git(cwd, args, { emptyExitOne = false, classifyNotRepository = false } = {}) {
  // Git hooks and shells can carry GIT_DIR/GIT_CONFIG_* overrides. Inspect cwd, not those targets.
  const configurationFiles = new Set(['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => {
    const upper = key.toUpperCase();
    return !upper.startsWith('GIT_') || configurationFiles.has(upper) || upper.startsWith('GIT_TRACE');
  }));
  try {
    const { stdout } = await executeFile('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.quotePath=false', ...args], {
      cwd, shell: false, windowsHide: true, timeout: 12000, maxBuffer: 2 * 1024 * 1024,
      env: { ...env, LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    });
    return stdout;
  } catch (error) {
    if (emptyExitOne && error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return '';
    // Only this stable diagnostic identifies a non-repository. Never expose raw Git stderr.
    if (classifyNotRepository && error.code === 128 && !error.stdout?.trim()
      && /^fatal: not a git repository \(or any (?:of the parent directories|parent up to mount point [^\r\n]+)\)(?:: \.git)?(?:\r?\n|$)/.test(error.stderr ?? '')) {
      fail('WORKSPACE_GIT_NOT_REPOSITORY');
    }
    if (error.code === 'ENOENT') fail('WORKSPACE_GIT_UNAVAILABLE');
    if (error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') fail('WORKSPACE_GIT_INCOMPLETE');
    fail('WORKSPACE_GIT_FAILED');
  }
}
async function realDirectory(input) {
  try {
    const resolved = await fs.realpath(safePath(input));
    if (!(await fs.stat(resolved)).isDirectory()) fail('WORKSPACE_PATH_INVALID');
    return resolved;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    fail(error.code === 'ENOENT' ? 'WORKSPACE_PATH_MISSING' : 'WORKSPACE_PATH_UNAVAILABLE');
  }
}
async function rootOf(input) {
  const directory = await realDirectory(input);
  let top;
  try { top = (await git(directory, ['rev-parse', '--show-toplevel'], { classifyNotRepository: true })).trim(); }
  catch (error) {
    if (error.code === 'WORKSPACE_GIT_NOT_REPOSITORY') {
      // An empty/corrupt .git directory can produce the same message as an ordinary non-repository.
      // Check only ancestors and treat any broken marker or inaccessible location conservatively.
      for (let ancestor = directory; ; ancestor = path.dirname(ancestor)) {
        try {
          await fs.lstat(path.join(ancestor, '.git'));
          fail('WORKSPACE_REPOSITORY_UNAVAILABLE');
        } catch (markerError) {
          if (markerError instanceof WorkspaceError) throw markerError;
          if (markerError.code !== 'ENOENT') fail('WORKSPACE_PATH_UNAVAILABLE');
        }
        if (samePath(ancestor, path.dirname(ancestor))) break;
      }
      fail('WORKSPACE_REPOSITORY_INVALID');
    }
    throw error;
  }
  const root = await realDirectory(top);
  // Git may skip an empty nested .git directory and discover a parent checkout.
  // Such a marker means the requested location is broken, not a missing local copy.
  for (let ancestor = directory; !samePath(ancestor, root); ancestor = path.dirname(ancestor)) {
    try {
      await fs.lstat(path.join(ancestor, '.git'));
      fail('WORKSPACE_REPOSITORY_UNAVAILABLE');
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      if (error.code !== 'ENOENT') fail('WORKSPACE_PATH_UNAVAILABLE');
    }
    if (samePath(ancestor, path.dirname(ancestor))) fail('WORKSPACE_REPOSITORY_UNAVAILABLE');
  }
  return root;
}
async function inspectRepository(input, expected, moduleDirectory = '.', branch, strictRoot = false) {
  const real = await realDirectory(input), root = await rootOf(real);
  if (strictRoot && !samePath(real, root)) fail('WORKSPACE_REPOSITORY_CHANGED');
  let remote;
  try {
    const output = (await git(root, ['config', '--get-all', 'remote.origin.url'], { emptyExitOne: true })).trim();
    if (!output) fail('WORKSPACE_REMOTE_MISSING');
    const values = output.split(/\r?\n/);
    if (values.length !== 1) fail('WORKSPACE_REMOTE_INVALID');
    remote = normalizeRepositoryUrl(values[0]);
  } catch (error) {
    throw error;
  }
  if (expected && remote.key !== expected.key) fail('WORKSPACE_REMOTE_MISMATCH');
  const modulePath = await realDirectory(path.resolve(root, safeModuleDirectory(moduleDirectory)));
  if (!inside(root, modulePath)) fail('WORKSPACE_DIRECTORY_INVALID');
  const status = (await git(root, ['status', '--porcelain=v1', '--untracked-files=normal'])).trim();
  let currentBranch = null, head = null;
  try { currentBranch = (await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim() || null; }
  catch (error) { if (error.code !== 'WORKSPACE_GIT_FAILED') throw error; }
  try { head = (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim(); }
  catch (error) { if (error.code !== 'WORKSPACE_GIT_FAILED') throw error; }
  return { path: root, modulePath, repositoryKey: remote.key, repositoryUrl: remote.repositoryUrl,
    branch: currentBranch, head, dirty: status.length > 0, branchMatches: branch ? currentBranch === branch : null };
}

function validateRegistry(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) fail('WORKSPACE_REGISTRY_INVALID');
  const seen = new Set(), preferred = new Set();
  for (const entry of value.entries) {
    if (!entry || !text(entry.path) || !path.isAbsolute(entry.path) || typeof entry.preferred !== 'boolean'
      || !text(entry.createdAt) || !text(entry.updatedAt) || !Number.isFinite(Date.parse(entry.createdAt)) || !Number.isFinite(Date.parse(entry.updatedAt))) fail('WORKSPACE_REGISTRY_INVALID');
    let repository;
    try { repository = normalizeRepositoryUrl(entry.repositoryUrl); } catch { fail('WORKSPACE_REGISTRY_INVALID'); }
    if (entry.repositoryKey !== repository.key || seen.has(pathKey(entry.path))) fail('WORKSPACE_REGISTRY_INVALID');
    seen.add(pathKey(entry.path));
    if (entry.preferred) {
      if (preferred.has(entry.repositoryKey)) fail('WORKSPACE_REGISTRY_INVALID');
      preferred.add(entry.repositoryKey);
    }
    if (entry.claim && (!text(entry.claim.owner) || entry.claim.owner.length > 200 || !text(entry.claim.claimedAt) || !Number.isFinite(Date.parse(entry.claim.claimedAt)))) fail('WORKSPACE_REGISTRY_INVALID');
  }
  return value;
}
export async function readRegistry(registryPath = defaultRegistryPath()) {
  try {
    const stat = await fs.lstat(registryPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_REGISTRY_BYTES) fail('WORKSPACE_REGISTRY_INVALID');
    let data;
    try { data = JSON.parse(await fs.readFile(registryPath, 'utf8')); } catch { fail('WORKSPACE_REGISTRY_INVALID'); }
    return validateRegistry(data);
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, entries: [] };
    if (error instanceof WorkspaceError) throw error;
    fail('WORKSPACE_REGISTRY_UNAVAILABLE');
  }
}
async function withRegistryWrite(registryPath, update) {
  const parent = path.dirname(registryPath), lockPath = registryPath + '.lock';
  await fs.mkdir(parent, { recursive: true });
  const token = crypto.randomUUID();
  let lock;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { lock = await fs.open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') fail('WORKSPACE_REGISTRY_UNAVAILABLE');
      if (attempt === 19) fail('WORKSPACE_REGISTRY_BUSY');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  let temporary;
  try {
    await lock.writeFile(token);
    const registry = await readRegistry(registryPath);
    const result = await update(registry);
    validateRegistry(registry);
    const serialized = JSON.stringify(registry, null, 2) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > MAX_REGISTRY_BYTES) fail('WORKSPACE_REGISTRY_FULL');
    temporary = path.join(parent, `.${path.basename(registryPath)}.${token}.tmp`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(serialized); await handle.sync(); }
    finally { await handle.close(); }
    await fs.rename(temporary, registryPath);
    temporary = undefined;
    return result;
  } finally {
    await lock.close();
    // Only remove files created by this invocation, never a stale or replacement lock.
    if (temporary) await fs.unlink(temporary).catch(() => {});
    const currentToken = await fs.readFile(lockPath, 'utf8').catch(() => null);
    if (currentToken === token) await fs.unlink(lockPath).catch(() => {});
  }
}

async function register(options, registryPath) {
  const expected = repositoryInput(options);
  return withRegistryWrite(registryPath, async registry => {
    const actual = await inspectRepository(options.path, expected);
    let entry = registry.entries.find(item => samePath(item.path, actual.path));
    if (entry?.claim && (entry.repositoryKey !== expected.key || entry.claim.owner !== options.owner)) fail('WORKSPACE_CLAIMED');
    const now = new Date().toISOString();
    if (!entry) {
      if (registry.entries.length >= MAX_ENTRIES) fail('WORKSPACE_REGISTRY_FULL');
      entry = { repositoryKey: expected.key, repositoryUrl: expected.repositoryUrl, path: actual.path, preferred: false, createdAt: now, updatedAt: now };
      registry.entries.push(entry);
    } else Object.assign(entry, { repositoryKey: expected.key, repositoryUrl: expected.repositoryUrl, updatedAt: now });
    if (options.preferred) {
      for (const item of registry.entries) if (item.repositoryKey === expected.key) item.preferred = item === entry;
    }
    return { entry: { ...entry, ...actual, repositoryUrl: entry.repositoryUrl }, registered: true };
  });
}

async function claimOrRelease(options, registryPath) {
  const expected = repositoryInput(options), owner = safeOwner(options.owner);
  return withRegistryWrite(registryPath, async registry => {
    const lexical = safePath(options.path);
    // Release is registry-only: a moved or broken checkout must not leave an unrecoverable claim.
    const actual = options.command === 'claim' ? await inspectRepository(lexical, expected) : null;
    const canonical = actual?.path ?? await fs.realpath(lexical).catch(() => lexical);
    const entry = registry.entries.find(item => (samePath(item.path, canonical) || samePath(item.path, lexical)) && item.repositoryKey === expected.key);
    if (!entry) fail('WORKSPACE_NOT_REGISTERED');
    if (entry.claim && entry.claim.owner !== owner) fail(options.command === 'claim' ? 'WORKSPACE_CLAIMED' : 'WORKSPACE_OWNER_MISMATCH');
    if (options.command === 'claim') entry.claim ??= { owner, claimedAt: new Date().toISOString() };
    else delete entry.claim;
    entry.updatedAt = new Date().toISOString();
    return { entry: { ...entry, ...actual, repositoryUrl: entry.repositoryUrl }, claimed: options.command === 'claim' };
  });
}

async function forget(options, registryPath) {
  const lexical = safePath(options.path);
  const canonical = await fs.realpath(lexical).catch(() => lexical);
  return withRegistryWrite(registryPath, async registry => {
    const index = registry.entries.findIndex(entry => samePath(entry.path, canonical) || samePath(entry.path, lexical));
    if (index < 0) return { removed: false, path: canonical, sourceDeleted: false };
    if (registry.entries[index].claim) fail('WORKSPACE_CLAIMED');
    const [entry] = registry.entries.splice(index, 1);
    return { removed: true, path: entry.path, sourceDeleted: false };
  });
}

async function list(options, registryPath) {
  const expected = options.repositoryUrl ? repositoryInput(options) : null;
  const registry = await readRegistry(registryPath), entries = [];
  for (const entry of registry.entries.filter(item => !expected || item.repositoryKey === expected.key)) {
    try { entries.push({ ...entry, ...await inspectRepository(entry.path, { key: entry.repositoryKey }, '.', options.branch, true), valid: true, status: 'available' }); }
    catch (error) { entries.push({ ...entry, valid: false, status: 'unavailable', reason: error.code ?? 'WORKSPACE_PATH_UNAVAILABLE' }); }
  }
  return { entries };
}

async function resolve(options, registryPath) {
  const expected = repositoryInput(options), moduleDirectory = safeModuleDirectory(options.directory);
  if (options.owner !== undefined) safeOwner(options.owner);
  const registry = await readRegistry(registryPath), registered = registry.entries.filter(entry => entry.repositoryKey === expected.key);
  const candidates = new Map(), rejected = [], visited = new Set(), worktreesRead = new Set();
  let searchComplete = true, inspected = 0, scanned = 0, contextRoot = null;
  const scannedPaths = new Set();
  const reject = (input, reason, affectsCompleteness = false) => {
    if (!rejected.some(item => samePath(item.path, input) && item.reason === reason)) rejected.push({ path: safePath(input), reason });
    if (affectsCompleteness) searchComplete = false;
  };
  const visit = async (input, source, strict = true) => {
    const key = pathKey(input);
    if (visited.has(key)) return;
    if (++inspected > MAX_DISCOVERY) { reject(input, 'WORKSPACE_DISCOVERY_LIMIT', true); return; }
    visited.add(key);
    try {
      const actual = await inspectRepository(input, expected, moduleDirectory, options.branch, strict);
      const entry = registered.find(item => samePath(item.path, actual.path));
      const candidate = { ...actual, sources: [source], registered: !!entry, preferred: entry?.preferred ?? false, claim: entry?.claim ?? null };
      const previous = candidates.get(pathKey(actual.path));
      if (previous) { if (!previous.sources.includes(source)) previous.sources.push(source); }
      else candidates.set(pathKey(actual.path), candidate);
      return actual.path;
    } catch (error) {
      // An unrelated directory encountered during discovery is not a broken registered checkout.
      const unrelated = ['WORKSPACE_REMOTE_MISMATCH', 'WORKSPACE_REPOSITORY_INVALID', 'WORKSPACE_REMOTE_MISSING'].includes(error.code);
      if (source === 'registry' || !unrelated) reject(input, error.code ?? 'WORKSPACE_PATH_UNAVAILABLE', source !== 'registry');
      return null;
    }
  };
  const submodules = async root => {
    const file = path.join(root, '.gitmodules');
    try {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) { reject(root, 'WORKSPACE_SUBMODULES_UNAVAILABLE', true); return; }
    }
    catch (error) { if (error.code !== 'ENOENT') reject(root, 'WORKSPACE_SUBMODULES_UNAVAILABLE', true); return; }
    let output;
    try { output = await git(root, ['config', '--file', file, '--get-regexp', '^submodule\\..*\\.path$'], { emptyExitOne: true }); }
    catch (error) { reject(root, 'WORKSPACE_SUBMODULES_UNAVAILABLE', true); return; }
    for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
      const match = /^\S+\s+(.+)$/.exec(line);
      if (!match) { reject(root, 'WORKSPACE_SUBMODULES_UNAVAILABLE', true); continue; }
      try {
        const child = path.resolve(root, safeModuleDirectory(match[1]));
        if (!inside(root, child)) fail('WORKSPACE_DIRECTORY_INVALID');
        const stat = await fs.lstat(child).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        // Uninitialized submodules have no checkout to reuse. Do not run submodule update.
        if (!stat) continue;
        const real = await fs.realpath(child);
        if (!inside(root, real)) fail('WORKSPACE_DIRECTORY_INVALID');
        const marker = await fs.lstat(path.join(real, '.git')).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (!marker) continue;
        await visit(real, 'submodule');
      } catch (error) { reject(root, error.code ?? 'WORKSPACE_SUBMODULES_UNAVAILABLE', true); }
    }
  };
  for (const entry of registered) await visit(entry.path, 'registry');
  const context = safePath(options.context ?? process.cwd());
  try {
    contextRoot = await rootOf(context);
    await visit(contextRoot, 'context');
    await submodules(contextRoot);
  } catch (error) {
    if (error.code !== 'WORKSPACE_REPOSITORY_INVALID') reject(context, error.code ?? 'WORKSPACE_PATH_UNAVAILABLE', true);
  }
  // Explicit roots only, at most two child-directory levels; never walk a whole disk or follow directory links.
  const scan = async (input, depth) => {
    if (scannedPaths.has(pathKey(input))) return;
    scannedPaths.add(pathKey(input));
    if (++scanned > MAX_DISCOVERY || inspected >= MAX_DISCOVERY) { reject(input, 'WORKSPACE_DISCOVERY_LIMIT', true); return; }
    let root;
    try { root = await realDirectory(input); }
    catch (error) { reject(input, error.code ?? 'WORKSPACE_PATH_UNAVAILABLE', true); return; }
    let marker;
    try { marker = await fs.lstat(path.join(root, '.git')); }
    catch (error) { if (error.code !== 'ENOENT') { reject(root, 'WORKSPACE_SEARCH_UNAVAILABLE', true); return; } }
    if (marker) { await visit(root, 'search-root'); await submodules(root); return; }
    if (!depth) return;
    let children;
    try { children = await fs.readdir(root, { withFileTypes: true }); }
    catch { reject(root, 'WORKSPACE_SEARCH_UNAVAILABLE', true); return; }
    const directories = children.filter(child => child.isDirectory() && !child.isSymbolicLink() && !child.name.startsWith('.') && !IGNORED_DIRECTORIES.has(child.name));
    if (directories.length > MAX_CHILDREN) { reject(root, 'WORKSPACE_DISCOVERY_LIMIT', true); return; }
    for (const child of directories) {
      await scan(path.join(root, child.name), depth - 1);
      if (scanned > MAX_DISCOVERY || inspected >= MAX_DISCOVERY) break;
    }
  };
  for (const root of options.searchRoots ?? []) await scan(safePath(root), 2);
  // Git supplies the known worktree paths; each is still independently verified against the requested origin.
  for (const candidate of [...candidates.values()]) {
    let common;
    try {
      common = await git(candidate.path, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
      if (worktreesRead.has(common.trim())) continue;
      worktreesRead.add(common.trim());
      const output = await git(candidate.path, ['worktree', 'list', '--porcelain', '-z']);
      for (const field of output.split('\0')) if (field.startsWith('worktree ')) await visit(field.slice(9), 'worktree');
    } catch (error) { reject(candidate.path, error.code ?? 'WORKSPACE_WORKTREES_UNAVAILABLE', true); }
  }
  const all = [...candidates.values()].sort((a, b) => a.path.localeCompare(b.path));
  // Without an owner, every claim is treated as busy; a new conversation must not inherit a claim silently.
  const available = all.filter(candidate => !candidate.claim || (options.owner && candidate.claim.owner === options.owner));
  const current = contextRoot && all.find(candidate => samePath(candidate.path, contextRoot));
  let selected = null, selectionReason = null, status;
  if (current) {
    if (available.includes(current)) { selected = current; selectionReason = 'current_context'; }
    else status = 'busy';
  } else {
    const preferred = available.filter(candidate => candidate.preferred);
    if (preferred.length === 1) { selected = preferred[0]; selectionReason = 'registered_preferred'; }
    else if (available.length === 1) { selected = available[0]; selectionReason = 'only_available_checkout'; }
    else if (available.length > 1) status = 'ambiguous';
    else if (all.length) status = 'busy';
  }
  if (selected) status = 'found';
  status ??= rejected.length || !searchComplete ? 'unavailable' : 'not_found';
  return { status, repositoryKey: expected.key, repositoryUrl: expected.repositoryUrl, context, searchComplete,
    searchedRoots: (options.searchRoots ?? []).map(safePath), candidates: all, rejected, selectionReason,
    selectedPath: selected?.path ?? null, modulePath: selected?.modulePath ?? null,
    branch: selected?.branch ?? null, branchMatches: selected?.branchMatches ?? null, dirty: selected?.dirty ?? null,
    claim: selected?.claim ?? null, canClone: status === 'not_found' && searchComplete && rejected.length === 0,
    coordination: 'Claims coordinate this helper only; they do not lock Git, editors or other programs.' };
}

export async function runCommand(options) {
  if (!options || !COMMANDS.has(options.command)) fail('WORKSPACE_COMMAND_INVALID');
  const registryPath = safePath(options.registry ?? defaultRegistryPath());
  const operations = { resolve, register, list, forget, claim: claimOrRelease, release: claimOrRelease };
  return { ok: true, command: options.command, registryPath, ...await operations[options.command](options, registryPath) };
}
export function parseArgs(argv) {
  const options = { command: argv[0], searchRoots: [] };
  const names = { '--repository-url': 'repositoryUrl', '--context': 'context', '--search-root': 'searchRoots', '--directory': 'directory', '--branch': 'branch', '--owner': 'owner', '--registry': 'registry', '--path': 'path' };
  for (let index = 1; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--preferred') { if (options.preferred) fail('WORKSPACE_ARGUMENT_INVALID'); options.preferred = true; continue; }
    const key = names[flag], value = argv[++index];
    if (!key || !value || value.startsWith('--')) fail('WORKSPACE_ARGUMENT_INVALID');
    if (key === 'searchRoots') options.searchRoots.push(value);
    else { if (Object.hasOwn(options, key)) fail('WORKSPACE_ARGUMENT_INVALID'); options[key] = value; }
  }
  if (options.preferred && options.command !== 'register') fail('WORKSPACE_ARGUMENT_INVALID');
  return options;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(await runCommand(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) {
    const known = error instanceof WorkspaceError;
    console.log(JSON.stringify({ ok: false, error: { code: known ? error.code : 'WORKSPACE_OPERATION_FAILED', message: known ? error.message : 'The local workspace operation failed; no Git mutation was performed.' } }, null, 2));
    process.exitCode = 1;
  }
}
