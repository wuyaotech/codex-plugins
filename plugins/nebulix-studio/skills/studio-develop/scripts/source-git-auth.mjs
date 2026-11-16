#!/usr/bin/env node
// Node built-ins only. Provider credentials are transient and are never saved or logged.
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = fileURLToPath(import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(code); };
const safeCode = error => /^[A-Z][A-Z0-9_]{2,90}$/.test(error?.message || '') ? error.message : 'SOURCE_AUTH_FAILED';
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const required = (value, pattern) => { if (typeof value !== 'string' || !pattern.test(value)) fail('SOURCE_AUTH_INVALID_ARGUMENT'); return value; };

export function serviceUrl(value) {
  let url; try { url = new URL(value); } catch { fail('SOURCE_AUTH_INVALID_SERVICE'); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) fail('SOURCE_AUTH_INVALID_SERVICE');
  return url.href.replace(/\/$/, '');
}
export function options(argv) {
  const [command, ...rest] = argv, result = { command };
  const allowed = new Set(['service-url', 'module', 'environment', 'permission', 'auth-dir', 'path']);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (['get', 'store', 'erase'].includes(arg) && !result.operation) { result.operation = arg; continue; }
    if (!arg.startsWith('--') || !allowed.has(arg.slice(2)) || !rest[i + 1] || rest[i + 1].startsWith('--') || result[arg.slice(2)] !== undefined) fail('SOURCE_AUTH_INVALID_ARGUMENT');
    result[arg.slice(2)] = rest[++i];
  }
  result.service = serviceUrl(result['service-url']);
  result.module = required(result.module, /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
  result.environment = required(result.environment, /^[A-Za-z0-9_-]{1,32}$/);
  result.permission = result.permission || 'read';
  required(result.permission, /^(read|write)$/);
  result.authDir = path.resolve(result['auth-dir'] || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugin-data', 'nebulix-studio', 'source-auth'));
  result.file = path.join(result.authDir, `${digest(`${result.service}\n${result.environment}\n${result.module}`)}.json`);
  return result;
}

async function rejectLink(file) {
  let stat; try { stat = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) fail('SOURCE_AUTH_UNSAFE_STORE');
  if (process.platform !== 'win32' && typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('SOURCE_AUTH_UNSAFE_STORE');
}
async function privateDirectory(dir) {
  await rejectLink(dir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.chmod(dir, 0o700);
}
// DPAPI binds persisted secrets to the current Windows account. Tokens never appear in argv/env.
function protect(value, unprotect = false) {
  if (process.platform !== 'win32') return value;
  const code = `Add-Type -AssemblyName System.Security; $v=[Console]::In.ReadToEnd(); $b=${unprotect ? '[Convert]::FromBase64String($v)' : '[Text.Encoding]::UTF8.GetBytes($v)'}; $r=[Security.Cryptography.ProtectedData]::${unprotect ? 'Unprotect' : 'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${unprotect ? '[Text.Encoding]::UTF8.GetString($r)' : '[Convert]::ToBase64String($r)'})`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { input: value, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  if (r.status !== 0 || !r.stdout) fail('SOURCE_AUTH_OS_PROTECTION_FAILED');
  return r.stdout;
}
export async function saveSession(o, session) {
  if (!opaque(session.sessionToken)) fail('SOURCE_AUTH_INVALID_SESSION');
  await privateDirectory(o.authDir); await rejectLink(o.file);
  const lock = await fs.open(`${o.file}.lock`, 'wx', 0o600).catch(() => fail('SOURCE_AUTH_STORE_BUSY'));
  const tmp = `${o.file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const record = { ...session, sessionToken: undefined, tokenProtection: process.platform === 'win32' ? 'dpapi-current-user' : 'owner-file', protectedToken: protect(session.sessionToken), service: o.service, moduleKey: o.module, environment: o.environment };
    await fs.writeFile(tmp, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, o.file);
  } finally { await fs.rm(tmp, { force: true }); await lock.close(); await fs.rm(`${o.file}.lock`, { force: true }); }
}
export async function readSession(o, allowExpired = false) {
  await rejectLink(o.authDir); await rejectLink(o.file);
  let value;
  try {
    const stat = await fs.stat(o.file);
    if (stat.size > 32768 || (process.platform !== 'win32' && (stat.mode & 0o077))) fail('SOURCE_AUTH_UNSAFE_STORE');
    value = JSON.parse(await fs.readFile(o.file, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') fail('SOURCE_AUTH_LOGIN_REQUIRED'); throw error; }
  if (value.service !== o.service || value.moduleKey !== o.module || value.environment !== o.environment || !['dpapi-current-user', 'owner-file'].includes(value.tokenProtection)) fail('SOURCE_AUTH_INVALID_STORE');
  if (process.platform === 'win32' && value.tokenProtection !== 'dpapi-current-user') fail('SOURCE_AUTH_UNSAFE_STORE');
  if ((!allowExpired && Date.parse(value.expiresAt) <= Date.now()) || !Number.isFinite(Date.parse(value.expiresAt))) fail('SOURCE_AUTH_SESSION_EXPIRED');
  const sessionToken = protect(value.protectedToken, true);
  if (!opaque(sessionToken)) fail('SOURCE_AUTH_INVALID_STORE');
  return { ...value, sessionToken };
}
export async function request(o, endpoint, body = {}, token) {
  let response;
  try {
    response = await fetch(`${o.service}/studio-source/auth/${endpoint}`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch { fail('SOURCE_AUTH_NETWORK_FAILED'); }
  const text = await response.text();
  if (text.length > 65536) fail('SOURCE_AUTH_INVALID_RESPONSE');
  let result; try { result = JSON.parse(text); } catch { fail('SOURCE_AUTH_INVALID_RESPONSE'); }
  if (!response.ok || result.code !== 200) fail(/^[A-Z][A-Z0-9_]{2,90}$/.test(result.businessCode || '') ? result.businessCode : 'SOURCE_AUTH_REQUEST_DENIED');
  return result.data;
}
export function gitRequest(text, repository) {
  if (text.length > 16384 || /\0/.test(text)) fail('SOURCE_AUTH_INVALID_GIT_REQUEST');
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line) break;
    const at = line.indexOf('='); if (at < 1) fail('SOURCE_AUTH_INVALID_GIT_REQUEST');
    const key = line.slice(0, at), value = line.slice(at + 1);
    if (['protocol', 'host', 'path'].includes(key)) { if (fields[key] !== undefined) fail('SOURCE_AUTH_INVALID_GIT_REQUEST'); fields[key] = value; }
  }
  if (fields.protocol !== 'https' || fields.host !== 'github.com' || !repository || !/^[A-Za-z0-9_-]{1,100}$/.test(repository.owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name) || ![`${repository.owner}/${repository.name}`, `${repository.owner}/${repository.name}.git`].includes(fields.path)) fail('SOURCE_AUTH_REPOSITORY_MISMATCH');
  const expected = `https://github.com/${repository.owner}/${repository.name}`;
  if (![expected, `${expected}.git`].includes(repository.repositoryUrl)) fail('SOURCE_AUTH_REPOSITORY_MISMATCH');
  return fields;
}
const shellQuote = s => `'${String(s).replaceAll("'", "'\\''")}'`;
export function gitConfig(o, repository) {
  gitRequest(`protocol=https\nhost=github.com\npath=${repository.owner}/${repository.name}\n`, repository);
  const args = [process.execPath, scriptPath, 'credential', '--service-url', o.service, '--module', o.module, '--environment', o.environment, '--auth-dir', o.authDir].map(value => shellQuote(value.replaceAll('\\', '/'))).join(' ');
  return [['credential.helper', ''], ['credential.helper', `!${args}`], ['credential.useHttpPath', 'true']];
}
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
export async function main(argv = process.argv.slice(2)) {
  const o = options(argv);
  if (o.command === 'login') {
    const verifier = randomBytes(32).toString('base64url');
    const start = await request(o, 'start', { moduleKey: o.module, environment: o.environment, permission: o.permission, codeChallenge: createHash('sha256').update(verifier).digest('base64url') });
    if (!opaque(start.requestId) || !opaque(start.deviceSecret) || !Number.isFinite(Date.parse(start.expiresAt))) fail('SOURCE_AUTH_INVALID_RESPONSE');
    const authorization = new URL(start.authorizationUrl);
    serviceUrl(authorization.origin);
    if (authorization.username || authorization.password || authorization.pathname !== '/development/source-connect' || authorization.searchParams.get('requestId') !== start.requestId || [...authorization.searchParams].length !== 1 || authorization.hash) fail('SOURCE_AUTH_INVALID_RESPONSE');
    output({ status: 'awaiting_browser_approval', authorizationUrl: authorization.href, expiresAt: start.expiresAt });
    while (Date.now() < Date.parse(start.expiresAt)) {
      await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(10, Number(start.interval) || 3)) * 1000));
      const session = await request(o, 'token', { requestId: start.requestId, deviceSecret: start.deviceSecret, codeVerifier: verifier });
      if (session.status === 'pending') continue;
      if (session.status !== 'approved') fail('SOURCE_AUTH_INVALID_RESPONSE');
      await saveSession(o, session);
      output({ status: 'connected', user: session.user, repository: session.repository, expiresAt: session.expiresAt }); return;
    }
    fail('SOURCE_AUTH_AUTHORIZATION_EXPIRED');
  }
  if (o.command === 'credential' && ['store', 'erase'].includes(o.operation)) return;
  const session = await readSession(o, o.command === 'logout');
  if (o.command === 'credential') {
    if (o.operation !== 'get') fail('SOURCE_AUTH_INVALID_ARGUMENT');
    let input = ''; for await (const chunk of process.stdin) { input += chunk; if (input.length > 16384) fail('SOURCE_AUTH_INVALID_GIT_REQUEST'); }
    const fields = gitRequest(input, session.repository);
    const result = await request(o, 'credential', fields, session.sessionToken);
    if (result.username !== 'x-access-token' || typeof result.password !== 'string' || !/^[A-Za-z0-9_\-]{10,512}$/.test(result.password) || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) fail('SOURCE_AUTH_INVALID_RESPONSE');
    process.stdout.write(`username=${result.username}\npassword=${result.password}\npassword_expiry_utc=${Math.floor(Date.parse(result.expiresAt) / 1000)}\n\n`); return;
  }
  if (o.command === 'status') { output({ serviceUrl: o.service, user: session.user, repository: session.repository, expiresAt: session.expiresAt }); return; }
  if (o.command === 'logout') { await request(o, 'revoke', {}, session.sessionToken); await fs.unlink(o.file); output({ revoked: true }); return; }
  if (o.command === 'connection') { output({ repositoryUrl: session.repository.repositoryUrl, gitConfig: gitConfig(o, session.repository) }); return; }
  if (o.command === 'configure') {
    if (!o.path) fail('SOURCE_AUTH_REPOSITORY_PATH_REQUIRED');
    const cwd = path.resolve(o.path);
    const git = args => { const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, timeout: 15000 }); if (result.status !== 0) fail('SOURCE_AUTH_GIT_CONFIG_FAILED'); return result.stdout.trim(); };
    const origin = git(['remote', 'get-url', '--all', 'origin']);
    if (origin !== session.repository.repositoryUrl || git(['remote', 'get-url', '--push', '--all', 'origin']) !== origin) fail('SOURCE_AUTH_REPOSITORY_MISMATCH');
    // Scoped to this exact HTTPS repo. An empty helper entry resets inherited GCM for this URL only.
    const scope = `credential.${origin}`;
    git(['config', '--local', '--replace-all', `${scope}.helper`, '']);
    git(['config', '--local', '--add', `${scope}.helper`, gitConfig(o, session.repository)[1][1]]);
    git(['config', '--local', `${scope}.useHttpPath`, 'true']);
    output({ configured: true, repositoryUrl: origin, path: cwd }); return;
  }
  fail('SOURCE_AUTH_UNKNOWN_COMMAND');
}
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) main().catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
