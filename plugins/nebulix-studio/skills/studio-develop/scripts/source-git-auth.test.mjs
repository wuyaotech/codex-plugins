import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { options, saveSession, readSession, gitRequest, gitConfig, gitCredential } from './source-git-auth.mjs';

const helper = fileURLToPath(new URL('./source-git-auth.mjs', import.meta.url));
const repository = { moduleKey: 'testmodule', environment: 'development', owner: 'example', name: 'private-repo', repositoryUrl: 'https://github.com/example/private-repo.git', permission: 'write' };
const platformToken = 'S'.repeat(43), githubToken = 'fixture_github_token_1234567890';
const run = (command, args, { env, input = '', cwd } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env: { ...process.env, ...env }, cwd, windowsHide: true });
  let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  child.on('error', reject); child.on('exit', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
});
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-auth-'));
  const requests = [], controls = {}; let revoked = false, challenge;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests.push({ endpoint: req.url, body, authorization: req.headers.authorization });
    let data;
    if (req.url.endsWith('/start')) { challenge = body.codeChallenge; data = { requestId: 'R'.repeat(43), deviceSecret: 'D'.repeat(43), authorizationUrl: `${url}/development/source-connect?requestId=${'R'.repeat(43)}`, expiresAt: new Date(Date.now() + 60000).toISOString(), interval: 1 }; }
    else if (req.url.endsWith('/token')) {
      if (body.deviceSecret !== 'D'.repeat(43) || createHash('sha256').update(body.codeVerifier).digest('base64url') !== challenge) { res.writeHead(403); res.end(JSON.stringify({ code: 403, businessCode: 'BAD_PROOF' })); return; }
      data = session();
    } else if (req.url.endsWith('/credential')) {
      if (controls.redirect) { res.writeHead(302, { location: `${url}/redirect-target` }); res.end(); return; }
      if (revoked || req.headers.authorization !== `Bearer ${platformToken}`) { res.writeHead(401); res.end(JSON.stringify({ code: 401, businessCode: 'SESSION_REVOKED' })); return; }
      data = { username: 'x-access-token', password: controls.password ?? githubToken, expiresAt: new Date(Date.now() + 3600000).toISOString() };
    } else if (req.url.endsWith('/revoke')) { revoked = true; data = { revoked: true }; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ code: 200, data }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const args = ['--service-url', `${url}/api`, '--module', 'testmodule', '--environment', 'development', '--auth-dir', path.join(dir, 'private-auth')];
  const session = () => ({ status: 'approved', sessionToken: platformToken, user: { uuid: 'fixture-user', displayName: 'Fixture Developer' }, repository, expiresAt: new Date(Date.now() + 86400000).toISOString() });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); const resolved = path.resolve(dir); assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(resolved, { recursive: true, force: true }); });
  return { dir, args, url, requests, controls, session, o: options(['status', ...args]), cli: (command, extra = [], opts) => run(process.execPath, [helper, command, ...args, ...extra], opts) };
}

test('device login stores only protected platform session; status and logs contain no credentials', async t => {
  const f = await fixture(t); const result = await f.cli('login', ['--permission', 'write']);
  assert.equal(result.code, 0, result.stderr); assert.match(result.stdout, /awaiting_browser_approval/); assert.match(result.stdout, /Fixture Developer/);
  for (const secret of [platformToken, githubToken, 'D'.repeat(43)]) assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret));
  const raw = await fs.readFile(f.o.file, 'utf8');
  assert.ok(!raw.includes(githubToken));
  if (process.platform === 'win32') assert.ok(!raw.includes(platformToken));
  else assert.equal((await fs.stat(f.o.file)).mode & 0o077, 0);
  const record = await readSession(f.o); assert.equal(record.sessionToken, platformToken);
  const status = await f.cli('status'); assert.equal(status.code, 0); assert.ok(!status.stdout.includes(platformToken));
  const logout = await f.cli('logout'); assert.equal(logout.code, 0); await assert.rejects(fs.stat(f.o.file));
});

test('real Git credential fill uses scoped helper without personal/global GCM and never saves GitHub token', async t => {
  const f = await fixture(t); await saveSession(f.o, f.session());
  const repo = path.join(f.dir, 'repository'); await fs.mkdir(repo);
  const global = path.join(f.dir, 'global.gitconfig'); await fs.writeFile(global, '[credential]\n\thelper = !echo inherited-personal-helper-must-not-run >&2; exit 71\n');
  const before = await fs.readFile(global, 'utf8');
  const env = { GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  assert.equal((await run('git', ['init', repo], { env })).code, 0);
  assert.equal((await run('git', ['-C', repo, 'remote', 'add', 'origin', repository.repositoryUrl], { env })).code, 0);
  const configure = await f.cli('configure', ['--path', repo], { env }); assert.equal(configure.code, 0, configure.stderr);
  const filled = await run('git', ['-C', repo, 'credential', 'fill'], { env, input: `protocol=https\nhost=github.com\npath=example/private-repo.git\n\n` });
  assert.equal(filled.code, 0, filled.stderr); assert.match(filled.stdout, /username=x-access-token/); assert.ok(filled.stdout.includes(`password=${githubToken}`));
  assert.ok(!filled.stderr.includes('inherited-personal-helper'));
  assert.equal(await fs.readFile(global, 'utf8'), before);
  const config = await fs.readFile(path.join(repo, '.git', 'config'), 'utf8');
  assert.ok(!config.includes(platformToken) && !config.includes(githubToken));
  assert.match(config, /useHttpPath = true/);
  assert.deepEqual(f.requests.at(-1).body, { protocol: 'https', host: 'github.com', path: 'example/private-repo.git' });
  const connection = await f.cli('connection'); assert.equal(connection.code, 0); assert.ok(!connection.stdout.includes(platformToken));
  assert.equal((await run('git', ['-C', repo, 'remote', 'set-url', '--push', 'origin', 'https://github.com/example/other.git'], { env })).code, 0);
  const changed = await fs.readFile(path.join(repo, '.git', 'config'), 'utf8');
  const rejected = await f.cli('configure', ['--path', repo], { env });
  assert.equal(rejected.code, 1); assert.match(rejected.stderr, /REPOSITORY_MISMATCH/);
  assert.equal(await fs.readFile(path.join(repo, '.git', 'config'), 'utf8'), changed);
});

test('first clone credential configuration works in an empty directory using ordinary Git', async t => {
  const f = await fixture(t); await saveSession(f.o, f.session());
  // Synthetic opaque token with the length and punctuation class observed in the real provider response.
  f.controls.password = `fixture.${'A'.repeat(380)}.B`;
  assert.equal(f.controls.password.length, 390);
  const args = gitConfig(f.o, repository).flatMap(([key, value]) => ['-c', `${key}=${value}`]);
  const result = await run('git', [...args, 'credential', 'fill'], { cwd: f.dir, env: { GIT_CONFIG_GLOBAL: path.join(f.dir, 'missing-global'), GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, input: `protocol=https\nhost=github.com\npath=example/private-repo.git\n\n` });
  assert.equal(result.code, 0, result.stderr); assert.ok(result.stdout.includes(f.controls.password));
  assert.equal(result.stderr, '');
});

test('opaque credentials preserve punctuation while rejecting protocol injection and invalid expiry', () => {
  const now = Date.now(), expiresAt = new Date(now + 3600000).toISOString();
  const payload = password => ({ username: 'x-access-token', password, expiresAt });
  for (const password of ['short', 'fixture.part+/=~opaque', 'A'.repeat(4096)]) {
    const lines = gitCredential(payload(password), now).split('\n');
    assert.deepEqual(lines, ['username=x-access-token', `password=${password}`, `password_expiry_utc=${Math.floor(Date.parse(expiresAt) / 1000)}`, '', '']);
  }
  for (const password of ['', 'A'.repeat(4097), 'has space', 'tab\t', 'line\nusername=other', 'return\r', 'nul\0', '\x7f', '非ASCII', null, 123]) assert.throws(() => gitCredential(payload(password), now), { message: 'SOURCE_AUTH_INVALID_RESPONSE' });
  for (const result of [null, {}, { ...payload('safe'), username: 'wrong' }, { ...payload('safe'), expiresAt: new Date(now).toISOString() }, { ...payload('safe'), expiresAt: 'invalid' }, { ...payload('safe'), expiresAt: 123 }]) assert.throws(() => gitCredential(result, now), { message: 'SOURCE_AUTH_INVALID_RESPONSE' });
});

test('wrong host, missing path, other repo and credential injection are rejected before HTTP', async t => {
  const f = await fixture(t); await saveSession(f.o, f.session());
  for (const input of ['protocol=https\nhost=github.com\n\n', 'protocol=https\nhost=github.com.evil.test\npath=example/private-repo.git\n\n', 'protocol=https\nhost=github.com\npath=example/other.git\n\n', 'protocol=https\nhost=github.com\npath=example/private-repo.git\npath=example/other.git\n']) {
    const result = await f.cli('credential', ['get'], { input }); assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /SOURCE_AUTH_/);
  }
  assert.equal(f.requests.length, 0);
  assert.throws(() => gitRequest('protocol=https\nhost=github.com:443\npath=example/private-repo.git\n', repository));
});

test('expired session and insecure service URLs fail closed; expired local records can still log out', async t => {
  const f = await fixture(t); await saveSession(f.o, { ...f.session(), expiresAt: new Date(0).toISOString() });
  const result = await f.cli('credential', ['get'], { input: 'protocol=https\nhost=github.com\npath=example/private-repo.git\n\n' });
  assert.equal(result.code, 1); assert.match(result.stderr, /SESSION_EXPIRED/); assert.equal(f.requests.length, 0);
  assert.throws(() => options(['status', '--service-url', 'http://example.com/api', '--module', 'testmodule', '--environment', 'development']));
  assert.throws(() => options(['status', '--service-url', 'https://token@github.com', '--module', 'testmodule', '--environment', 'development']));
  assert.equal((await f.cli('logout')).code, 0);
  await assert.rejects(fs.stat(f.o.file));
});

test('credential HTTP redirect is never followed and provider errors stay redacted', async t => {
  const f = await fixture(t); await saveSession(f.o, f.session()); f.controls.redirect = true;
  const result = await f.cli('credential', ['get'], { input: 'protocol=https\nhost=github.com\npath=example/private-repo.git\n\n' });
  assert.equal(result.code, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, /SOURCE_AUTH_NETWORK_FAILED/);
  assert.equal(f.requests.length, 1); assert.ok(!f.requests.some(r => r.endpoint === '/redirect-target'));
  assert.ok(!result.stderr.includes(platformToken) && !result.stderr.includes(githubToken));
});
