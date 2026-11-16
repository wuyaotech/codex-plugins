import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const helper = fileURLToPath(new URL('./local-workspaces.mjs', import.meta.url));
const REPOSITORY = 'https://example.invalid/team/module.git';
const OTHER_REPOSITORY = 'https://example.invalid/team/other.git';

async function fixture(t) {
  const tempBase = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempBase, 'studio-local-workspaces-test-'));
  const config = path.join(root, 'empty-git-config');
  await fs.writeFile(config, '');
  const hooks = path.join(root, 'empty-hooks');
  await fs.mkdir(hooks);
  const trace = path.join(root, 'git-trace.log');
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
    GIT_ALLOW_PROTOCOL: 'file', GIT_CEILING_DIRECTORIES: root,
    GIT_TRACE: trace,
  };
  const registry = path.join(root, 'registry', 'workspaces.json');
  t.after(async () => {
    const actual = await fs.realpath(root);
    assert.equal(path.dirname(actual), tempBase);
    assert.ok(path.basename(actual).startsWith('studio-local-workspaces-test-'));
    await fs.rm(actual, { recursive: true, force: true });
  });
  async function git(cwd, ...args) {
    return (await execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false',
      '-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false',
      '-c', 'commit.gpgsign=false', '-c', 'user.name=Workspace Fixture',
      '-c', 'user.email=workspace-fixture@example.invalid', ...args],
    { cwd, env, timeout: 15000, windowsHide: true })).stdout.trim();
  }
  async function repo(name = 'repository', remote = REPOSITORY) {
    const directory = path.join(root, name);
    await fs.mkdir(directory, { recursive: true });
    await git(directory, 'init', '-b', 'draft');
    await fs.writeFile(path.join(directory, 'README.md'), 'Original source\n');
    await fs.mkdir(path.join(directory, 'web'));
    await fs.writeFile(path.join(directory, 'web', 'index.js'), 'export default 1;\n');
    await git(directory, 'add', '.');
    await git(directory, 'commit', '-m', 'fixture');
    await git(directory, 'remote', 'add', 'origin', remote);
    return fs.realpath(directory);
  }
  async function run(command, ...args) {
    let stdout = '', stderr = '', exitCode = 0;
    try {
      ({ stdout, stderr } = await execute(process.execPath,
        [helper, command, ...args, '--registry', registry],
        { cwd: root, env, timeout: 30000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }));
    } catch (error) {
      if (typeof error.code !== 'number') throw error;
      ({ stdout = '', stderr = '' } = error); exitCode = error.code;
    }
    let data;
    try { data = JSON.parse(stdout.trim()); }
    catch { assert.fail(`CLI did not return JSON (exit ${exitCode}): ${stdout}\n${stderr}`); }
    return { data, stdout, stderr, exitCode };
  }
  async function ok(command, ...args) {
    const result = await run(command, ...args);
    assert.equal(result.exitCode, 0, JSON.stringify(result.data));
    assert.equal(result.data.ok, true, JSON.stringify(result.data));
    return result.data;
  }
  async function register(directory, ...args) {
    return ok('register', '--repository-url', REPOSITORY, '--path', directory, ...args);
  }
  async function resolve(...args) {
    return ok('resolve', '--repository-url', REPOSITORY, ...args);
  }
  return { root, registry, trace, env, git, repo, run, ok, register, resolve };
}

function hasPath(entries, expected) {
  return entries.some(entry => path.resolve(entry.path) === path.resolve(expected));
}

function assertFailure(result, code) {
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.data.ok, false);
  if (code) assert.equal(result.data.error?.code, code);
}

test('separate CLI processes reuse one registered repository without altering its Git state', async t => {
  const f = await fixture(t);
  const repo = await f.repo('source with spaces');
  await fs.writeFile(path.join(repo, 'README.md'), 'Uncommitted user edit\n');
  await fs.writeFile(path.join(repo, 'private-draft.txt'), 'Untracked user draft\n');
  const before = {
    head: await f.git(repo, 'rev-parse', 'HEAD'), branch: await f.git(repo, 'branch', '--show-current'),
    status: await f.git(repo, 'status', '--porcelain=v1'),
    index: await fs.readFile(path.join(repo, '.git', 'index')),
    config: await fs.readFile(path.join(repo, '.git', 'config')),
  };
  await fs.writeFile(f.trace, '');
  await f.register(repo);
  const first = await f.resolve('--branch', 'another-branch', '--directory', 'web');
  const second = await f.resolve('--branch', 'draft', '--directory', 'web');
  assert.equal(first.status, 'found');
  assert.equal(first.selectedPath, repo);
  assert.equal(first.modulePath, path.join(repo, 'web'));
  assert.equal(first.candidates.find(x => x.path === repo).dirty, true);
  assert.equal(first.candidates.find(x => x.path === repo).branchMatches, false);
  assert.equal(second.selectedPath, first.selectedPath);
  assert.equal(second.candidates.find(x => x.path === repo).branchMatches, true);
  assert.equal(second.canClone, false);
  const listed = await f.ok('list');
  assert.equal(listed.entries.length, 1);
  const gitTrace = await fs.readFile(f.trace, 'utf8');
  assert.match(gitTrace, /built-in: git\s+rev-parse\b/, 'the trace must include actual Git subprocesses invoked by the helper');
  assert.doesNotMatch(gitTrace, /built-in: git\s+(?:clone|fetch|pull|checkout|switch|reset|clean|merge|rebase|add|commit|submodule\s+update|worktree\s+add)\b/);
  assert.equal(await f.git(repo, 'rev-parse', 'HEAD'), before.head);
  assert.equal(await f.git(repo, 'branch', '--show-current'), before.branch);
  assert.equal(await f.git(repo, 'status', '--porcelain=v1'), before.status);
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'index')), before.index);
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'config')), before.config);
  assert.equal(await fs.readFile(path.join(repo, 'private-draft.txt'), 'utf8'), 'Untracked user draft\n');
});

test('HTTPS metadata matches the same SSH remote but keeps path case and non-default ports distinct', async t => {
  const f = await fixture(t);
  const repo = await f.repo('ssh-source', 'git@example.invalid:team/module.git');
  await f.register(repo);
  assert.equal((await f.resolve()).selectedPath, repo);
  const registeredAgain = await f.ok('register', '--repository-url', 'ssh://git@example.invalid/team/module/', '--path', repo);
  assert.equal(registeredAgain.ok, true);
  assert.equal((await f.ok('list')).entries.length, 1);
  assertFailure(await f.run('register', '--repository-url', 'https://example.invalid/team/Module.git', '--path', repo), 'WORKSPACE_REMOTE_MISMATCH');
  assertFailure(await f.run('register', '--repository-url', 'ssh://git@example.invalid:2222/team/module.git', '--path', repo), 'WORKSPACE_REMOTE_MISMATCH');
});

test('a mismatched remote cannot be registered or selected', async t => {
  const f = await fixture(t);
  const repo = await f.repo('wrong-source', OTHER_REPOSITORY);
  assertFailure(await f.run('register', '--repository-url', REPOSITORY, '--path', repo), 'WORKSPACE_REMOTE_MISMATCH');
  const result = await f.resolve('--context', repo);
  assert.equal(result.selectedPath, null);
  assert.ok(!result.candidates.some(x => x.path === repo));
});

test('stale registration remains visible and does not authorize another clone', async t => {
  const f = await fixture(t);
  const repo = await f.repo();
  await f.register(repo);
  const moved = path.join(f.root, 'moved-source');
  await fs.rename(repo, moved);
  const result = await f.resolve();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.selectedPath, null);
  assert.equal(result.canClone, false);
  assert.ok(hasPath(result.rejected, repo));
  assert.equal((await f.ok('list')).entries.length, 1);
  assert.equal(await fs.readFile(path.join(moved, 'README.md'), 'utf8'), 'Original source\n');
});

test('changed origin invalidates registration without mutating or silently deleting it', async t => {
  const f = await fixture(t);
  const repo = await f.repo();
  await f.register(repo);
  await f.git(repo, 'remote', 'set-url', 'origin', OTHER_REPOSITORY);
  const result = await f.resolve();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.canClone, false);
  assert.equal(result.selectedPath, null);
  assert.ok(hasPath(result.rejected, repo));
  assert.equal((await f.ok('list')).entries.length, 1);
  assert.equal(await f.git(repo, 'remote', 'get-url', 'origin'), OTHER_REPOSITORY);
});

test('multiple clones require a choice; preferred and explicit current context select deterministically', async t => {
  const f = await fixture(t);
  const a = await f.repo('a'); const b = await f.repo('b');
  await f.register(a); await f.register(b);
  const ambiguous = await f.resolve();
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.selectedPath, null);
  assert.equal(ambiguous.canClone, false);
  await f.register(a, '--preferred');
  assert.equal((await f.resolve()).selectedPath, a);
  assert.equal((await f.resolve('--context', path.join(b, 'web'))).selectedPath, b);
  await f.register(b, '--preferred');
  assert.equal((await f.resolve()).selectedPath, b);
  assert.equal((await f.ok('list')).entries.filter(x => x.preferred).length, 1);
  await f.register(b);
  assert.equal((await f.resolve()).selectedPath, b, 'ordinary re-registration must preserve the explicit preferred directory');
});

test('an existing matching current repository is discovered before registration', async t => {
  const f = await fixture(t);
  const repo = await f.repo();
  const result = await f.resolve('--context', path.join(repo, 'web'));
  assert.equal(result.status, 'found');
  assert.equal(result.selectedPath, repo);
  assert.equal(result.canClone, false);
});

test('known repository worktrees are discovered and .git files are supported', async t => {
  const f = await fixture(t);
  const main = await f.repo('main'); const worktree = path.join(f.root, 'task-worktree');
  await f.git(main, 'worktree', 'add', '-b', 'feature/task', worktree);
  assert.ok((await fs.stat(path.join(worktree, '.git'))).isFile());
  await f.register(main, '--preferred');
  const result = await f.resolve('--context', path.join(worktree, 'web'), '--branch', 'draft');
  assert.equal(result.selectedPath, await fs.realpath(worktree));
  assert.equal(result.candidates.find(x => x.path === worktree).branchMatches, false);
  assert.equal(await f.git(worktree, 'branch', '--show-current'), 'feature/task');
  const discovery = await f.resolve();
  assert.ok(hasPath(discovery.candidates, worktree));
  await f.register(worktree);
  assert.ok(hasPath((await f.ok('list')).entries, worktree));
});

test('current project submodule checkout can satisfy a module lookup without cloning again', async t => {
  const f = await fixture(t);
  const source = await f.repo('module-seed');
  const host = await f.repo('host', 'https://example.invalid/team/platform.git');
  await f.git(host, '-c', 'protocol.file.allow=always', 'submodule', 'add', source, 'modules/child');
  const child = await fs.realpath(path.join(host, 'modules', 'child'));
  await f.git(child, 'remote', 'set-url', 'origin', REPOSITORY);
  assert.ok((await fs.stat(path.join(child, '.git'))).isFile());
  const result = await f.resolve('--context', host);
  assert.equal(result.status, 'found');
  assert.equal(result.selectedPath, child);
  assert.equal(result.canClone, false);
  await f.register(child);
  assert.equal((await f.resolve()).selectedPath, child);
});

test('bounded explicit search discovers a shallow existing repository', async t => {
  const f = await fixture(t);
  const repo = await f.repo('projects/existing');
  const result = await f.resolve('--search-root', path.join(f.root, 'projects'));
  assert.equal(result.status, 'found');
  assert.equal(result.selectedPath, repo);
  assert.equal(result.canClone, false);
  const emptyRoot = path.join(f.root, 'empty'); await fs.mkdir(emptyRoot);
  const empty = await f.resolve('--search-root', emptyRoot);
  assert.equal(empty.status, 'not_found');
  assert.equal(empty.searchComplete, true);
  assert.equal(empty.canClone, true);
});

test('different filesystem aliases of the same repository produce one canonical registration', async t => {
  const f = await fixture(t); const repo = await f.repo('actual-source');
  const alias = path.join(f.root, 'source-alias');
  await fs.symlink(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await f.register(repo); await f.register(alias);
  const listed = await f.ok('list');
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].path, repo);
  assert.equal((await f.resolve('--context', alias)).selectedPath, repo);
});

test('an unavailable explicit search root cannot be mistaken for permission to clone', async t => {
  const f = await fixture(t);
  const missing = path.join(f.root, 'missing-projects');
  const result = await f.resolve('--search-root', missing);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.searchComplete, false);
  assert.equal(result.canClone, false);
  assert.ok(hasPath(result.rejected, missing));
});

test('module directories cannot escape the repository through syntax or a symlink', async t => {
  const f = await fixture(t);
  const repo = await f.repo(); await f.register(repo);
  for (const directory of ['../outside', path.join(f.root, 'absolute'), 'web/../../outside']) {
    const result = await f.run('resolve', '--repository-url', REPOSITORY, '--directory', directory);
    assertFailure(result, 'WORKSPACE_DIRECTORY_INVALID');
  }
  const outside = path.join(f.root, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(repo, 'external-module'), process.platform === 'win32' ? 'junction' : 'dir');
  const escaped = await f.run('resolve', '--repository-url', REPOSITORY, '--directory', 'external-module');
  assert.equal(escaped.data.selectedPath ?? null, null);
  assert.notEqual(escaped.data.canClone, true);
  assert.ok(escaped.data.ok === false || escaped.data.status === 'unavailable');
});

test('credential-bearing URLs are rejected without appearing in output or registry', async t => {
  const f = await fixture(t);
  const repo = await f.repo();
  const secret = 'FIXTURE_SECRET_MUST_NOT_BE_RECORDED';
  for (const url of [
    `https://${secret}@example.invalid/team/module.git`,
    `https://user:${secret}@example.invalid/team/module.git`,
    `${REPOSITORY}?token=${secret}`, `${REPOSITORY}#${secret}`,
  ]) {
    const result = await f.run('register', '--repository-url', url, '--path', repo);
    assertFailure(result, 'WORKSPACE_URL_INVALID');
    assert.ok(!result.stdout.includes(secret)); assert.ok(!result.stderr.includes(secret));
  }
  const content = await fs.readFile(f.registry, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''; throw error;
  });
  assert.ok(!content.includes(secret));
  await f.git(repo, 'remote', 'set-url', 'origin', `https://${secret}@example.invalid/team/module.git`);
  const remote = await f.run('register', '--repository-url', REPOSITORY, '--path', repo);
  assertFailure(remote);
  assert.ok(!remote.stdout.includes(secret)); assert.ok(!remote.stderr.includes(secret));
});

test('malformed registry is preserved and never replaced with an empty registry', async t => {
  const f = await fixture(t); const repo = await f.repo();
  await fs.mkdir(path.dirname(f.registry), { recursive: true });
  const invalid = '{"version":1,"entries": [';
  await fs.writeFile(f.registry, invalid);
  assertFailure(await f.run('resolve', '--repository-url', REPOSITORY), 'WORKSPACE_REGISTRY_INVALID');
  assertFailure(await f.run('register', '--repository-url', REPOSITORY, '--path', repo), 'WORKSPACE_REGISTRY_INVALID');
  assert.equal(await fs.readFile(f.registry, 'utf8'), invalid);
});

test('parallel registrations either succeed or explicitly report contention without losing entries', async t => {
  const f = await fixture(t);
  const repos = await Promise.all(['a', 'b', 'c'].map(name => f.repo(name)));
  const attempts = await Promise.all(repos.map(repo => f.run('register', '--repository-url', REPOSITORY, '--path', repo)));
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i].data.ok) continue;
    assertFailure(attempts[i], 'WORKSPACE_REGISTRY_BUSY');
    await f.register(repos[i]);
  }
  const listed = await f.ok('list');
  assert.equal(listed.entries.length, repos.length);
  for (const repo of repos) assert.ok(hasPath(listed.entries, repo));
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(listed)));
});

test('an old registry lock is retained and reported busy rather than stolen', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  const original = await fs.readFile(f.registry);
  const lock = f.registry + '.lock';
  await fs.writeFile(lock, 'owner-process-may-still-be-active');
  const ancient = new Date('2000-01-01T00:00:00.000Z');
  await fs.utimes(lock, ancient, ancient);
  assertFailure(await f.run('register', '--repository-url', REPOSITORY, '--path', repo, '--preferred'), 'WORKSPACE_REGISTRY_BUSY');
  assert.equal(await fs.readFile(lock, 'utf8'), 'owner-process-may-still-be-active');
  assert.deepEqual(await fs.readFile(f.registry), original);
  assert.equal((await f.resolve()).selectedPath, repo, 'read-only lookup still uses the intact registry');
});

test('claims persist across processes, reject other owners, and do not expire by timestamp', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  await f.ok('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  await f.ok('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  assert.equal((await f.resolve('--owner', 'chat-a')).selectedPath, repo);
  const busy = await f.resolve('--owner', 'chat-b');
  assert.equal(busy.status, 'busy'); assert.equal(busy.selectedPath, null); assert.equal(busy.canClone, false);
  assertFailure(await f.run('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b'), 'WORKSPACE_CLAIMED');
  assertFailure(await f.run('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b'), 'WORKSPACE_OWNER_MISMATCH');
  assertFailure(await f.run('forget', '--path', repo), 'WORKSPACE_CLAIMED');
  const registry = JSON.parse(await fs.readFile(f.registry, 'utf8'));
  assert.equal(registry.entries.length, 1);
  assert.equal(registry.entries[0].claim.owner, 'chat-a');
  for (const key of Object.keys(registry.entries[0].claim)) {
    if (key !== 'owner' && /at|since|time|expire/i.test(key)) registry.entries[0].claim[key] = '2000-01-01T00:00:00.000Z';
  }
  await fs.writeFile(f.registry, JSON.stringify(registry));
  assert.equal((await f.resolve('--owner', 'chat-b')).status, 'busy');
  await f.ok('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  await f.ok('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b');
  assert.equal((await f.resolve('--owner', 'chat-b')).selectedPath, repo);
});

test('only the recorded owner can release a moved checkout and remove its stale registration', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  await f.ok('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  const moved = path.join(f.root, 'moved-claimed-source'); await fs.rename(repo, moved);
  assertFailure(await f.run('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b'), 'WORKSPACE_OWNER_MISMATCH');
  assertFailure(await f.run('release', '--repository-url', OTHER_REPOSITORY, '--path', repo, '--owner', 'chat-a'), 'WORKSPACE_NOT_REGISTERED');
  await f.ok('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  await f.ok('forget', '--path', repo);
  assert.equal((await f.ok('list')).entries.length, 0);
  assert.equal(await fs.readFile(path.join(moved, 'README.md'), 'utf8'), 'Original source\n');
  assert.equal(await f.git(moved, 'remote', 'get-url', 'origin'), REPOSITORY);
});

test('an owner can release after origin changed, while a new claim still requires origin verification', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  await f.ok('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  await f.git(repo, 'remote', 'set-url', 'origin', OTHER_REPOSITORY);
  const config = await fs.readFile(path.join(repo, '.git', 'config'));
  assertFailure(await f.run('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b'), 'WORKSPACE_OWNER_MISMATCH');
  await f.ok('release', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-a');
  assertFailure(await f.run('claim', '--repository-url', REPOSITORY, '--path', repo, '--owner', 'chat-b'), 'WORKSPACE_REMOTE_MISMATCH');
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'config')), config);
  assert.equal((await f.resolve()).status, 'unavailable');
  assert.equal((await f.ok('list')).entries[0].claim ?? null, null);
});

test('forget removes only registration and leaves tracked, untracked, and Git files intact', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  await fs.writeFile(path.join(repo, 'user-notes.txt'), 'Keep this\n');
  const head = await f.git(repo, 'rev-parse', 'HEAD');
  const result = await f.ok('forget', '--path', repo);
  assert.ok(result.removed);
  assert.equal((await f.ok('list')).entries.length, 0);
  assert.equal(await f.git(repo, 'rev-parse', 'HEAD'), head);
  assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'Original source\n');
  assert.equal(await fs.readFile(path.join(repo, 'user-notes.txt'), 'utf8'), 'Keep this\n');
  assert.ok((await fs.stat(path.join(repo, '.git'))).isDirectory());
});

test('a moved repository registration can be forgotten without touching its new directory', async t => {
  const f = await fixture(t); const repo = await f.repo(); await f.register(repo);
  const moved = path.join(f.root, 'new-location'); await fs.rename(repo, moved);
  await f.ok('forget', '--path', repo);
  assert.equal((await f.ok('list')).entries.length, 0);
  assert.equal(await fs.readFile(path.join(moved, 'README.md'), 'utf8'), 'Original source\n');
  assert.equal(await f.git(moved, 'remote', 'get-url', 'origin'), REPOSITORY);
});

test('corrupt Git markers in context or search roots never authorize cloning', async t => {
  const f = await fixture(t);
  const host = await f.repo('unrelated-host', OTHER_REPOSITORY);
  for (const [name, kind] of [['empty-directory', 'directory'], ['invalid-file', 'file'], ['unrelated-host/nested', 'directory']]) {
    const directory = path.join(f.root, name);
    await fs.mkdir(directory, { recursive: true });
    const marker = path.join(directory, '.git');
    if (kind === 'directory') await fs.mkdir(marker);
    else await fs.writeFile(marker, 'not a valid gitdir pointer\n');
    await fs.mkdir(path.join(directory, 'web'));
    const contextual = await f.resolve('--context', path.join(directory, 'web'));
    assert.equal(contextual.status, 'unavailable');
    assert.equal(contextual.searchComplete, false);
    assert.equal(contextual.canClone, false);
    const scanned = await f.resolve('--search-root', directory);
    assert.equal(scanned.status, 'unavailable');
    assert.equal(scanned.searchComplete, false);
    assert.equal(scanned.canClone, false);
    assert.ok(hasPath(scanned.rejected, directory));
  }
  assert.equal(await f.git(host, 'remote', 'get-url', 'origin'), OTHER_REPOSITORY);
});

test('Git configuration failures are sanitized and cannot be treated as a missing checkout', async t => {
  const f = await fixture(t);
  const repo = await f.repo();
  const secret = 'PRIVATE_GIT_DIAGNOSTIC_MUST_NOT_LEAK';
  const invalidConfiguration = path.join(f.root, secret + '.config');
  await fs.writeFile(invalidConfiguration, '[invalid section\n');
  f.env.GIT_CONFIG_GLOBAL = invalidConfiguration;
  const result = await f.resolve('--context', repo, '--search-root', repo);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.searchComplete, false);
  assert.equal(result.canClone, false);
  assert.ok(result.rejected.some(item => item.reason === 'WORKSPACE_GIT_FAILED'));
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('registry capacity failures preserve the previous readable registry for register and claim', async t => {
  const f = await fixture(t);
  const first = await f.repo('registered'); const second = await f.repo('additional');
  await f.register(first);
  const registry = JSON.parse(await fs.readFile(f.registry, 'utf8'));
  // Unknown metadata is round-tripped, so it also counts toward the on-disk byte limit.
  registry.padding = '';
  const encode = () => JSON.stringify(registry, null, 2) + '\n';
  registry.padding = 'x'.repeat(2 * 1024 * 1024 - Buffer.byteLength(encode(), 'utf8') - 16);
  const original = encode();
  await fs.writeFile(f.registry, original);
  assertFailure(await f.run('register', '--repository-url', REPOSITORY, '--path', second), 'WORKSPACE_REGISTRY_FULL');
  assert.equal(await fs.readFile(f.registry, 'utf8'), original);
  assertFailure(await f.run('claim', '--repository-url', REPOSITORY, '--path', first, '--owner', 'new-chat'), 'WORKSPACE_REGISTRY_FULL');
  assert.equal(await fs.readFile(f.registry, 'utf8'), original);
  const listed = await f.ok('list');
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].path, first);
  assert.equal(listed.entries[0].claim ?? null, null);
});
