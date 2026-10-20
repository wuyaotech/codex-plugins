import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, unlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDevServer, startServer } from '../server/index.mjs';

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
}

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mobile-h5-server-'));
  const staticDir = path.join(dir, 'dist');
  const files = {
    'index.html': '<!doctype html><p>Mobile H5</p>',
    'app.js': 'console.log("mobile h5");',
    'app.css': 'body { margin: 0; }',
    'runtime/sdk.js': 'export default {};',
    'modules/schedule/entry.js': 'export const frontendModule = {};',
    'modules/schedule/entry.css': '.schedule { color: black; }',
    'modules/schedule/entry.js.map': '{"version":3}',
    'assets/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'artifacts/customer/1.0.0/entry.js': 'export default {};',
  };
  for (const [relative, content] of Object.entries(files)) {
    const filename = path.join(staticDir, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content);
  }
  const dataDir = path.join(dir, '.local');
  await mkdir(dataDir);
  // Invalid historical data must not be read, repaired or replaced at startup.
  await writeFile(path.join(dataDir, 'commits.jsonl'), 'historical data remains untouched');
  const server = await startServer({ port: 0, host: '127.0.0.1', staticDir, dataDir, upstream: '', ...overrides });
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await close(server);
    const absolute = path.resolve(dir);
    assert.ok(absolute.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(absolute).startsWith('mobile-h5-server-'));
    await rm(absolute, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  async function request(route, method = 'GET', input, headers = {}) {
    const response = await fetch(`${origin}${route}`, {
      method, redirect: 'manual',
      headers: { ...(input === undefined ? {} : { 'content-type': 'application/json', origin }), ...headers },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { dir, staticDir, dataDir, server, origin, request };
}

function rawRequest(origin, requestPath, headers = {}, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin, { path: requestPath, headers, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function mockUpstream(t) {
  const received = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    if (req.url.startsWith('/redirect')) { res.writeHead(302, { location: 'http://169.254.169.254/metadata' }); res.end(); return; }
    res.writeHead(req.url.startsWith('/denied') ? 403 : 200, { 'content-type': 'application/json', 'set-cookie': 'cloud-cookie=discarded' });
    res.end(JSON.stringify({ code: req.url.startsWith('/denied') ? 403 : 200, message: 'upstream', data: { reached: true } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => close(server));
  return { received, origin: `http://127.0.0.1:${server.address().port}` };
}

test('root directly serves the H5 and source resources without touching historical local storage', async t => {
  const { origin, dataDir, server } = await fixture(t);
  const home = await fetch(origin, { redirect: 'manual' });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Mobile H5/);
  for (const route of ['/app.js', '/app.css', '/runtime/sdk.js', '/modules/schedule/entry.js', '/modules/schedule/entry.css', '/modules/schedule/entry.js.map', '/assets/icon.svg', '/artifacts/customer/1.0.0/entry.js']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
  }
  assert.equal(server.store, undefined);
  assert.deepEqual(await readdir(dataDir), ['commits.jsonl']);
  assert.equal(await readFile(path.join(dataDir, 'commits.jsonl'), 'utf8'), 'historical data remains untouched');
});

test('legacy management pages and known app links redirect to H5 while preserving query', async t => {
  const { origin } = await fixture(t);
  for (const route of ['/studio', '/studio/apps/aurora', '/apps/aurora', '/apps/harbor/', '/apps/custom-home/modules/home/overview']) {
    const response = await fetch(`${origin}${route}?dev=1&sample=hello%20world`, { redirect: 'manual' });
    assert.equal(response.status, 302, route);
    assert.equal(response.headers.get('location'), '/?dev=1&sample=hello%20world', route);
  }
  for (const route of ['/apps/unknown', '/not-a-page', '/modules/unknown/entry.js', '/dev-artifacts/schedule/entry.js']) {
    assert.equal((await fetch(`${origin}${route}`, { redirect: 'manual' })).status, 404, route);
  }
});

test('only health and environment metadata remain; all management endpoints return 404', async t => {
  const { request } = await fixture(t);
  const health = await request('/__mobile/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.data.mode, 'h5-development');
  const environment = await request('/__mobile/environment');
  assert.equal(environment.status, 200);
  assert.equal(environment.body.data.apiBaseUrl, '/api');
  assert.equal(environment.body.data.productHost, 'nebulix-web-dev.wuyaotech.com');
  const paths = ['/__mobile/apps', '/__mobile/catalog', '/__mobile/bootstrap?appKey=aurora', '/__mobile/apps/aurora', '/__mobile/apps/aurora/draft', '/__mobile/apps/aurora/publish', '/__mobile/apps/aurora/rollback', '/__mobile/apps/aurora/releases'];
  for (const route of paths) {
    assert.equal((await request(route)).status, 404, route);
    assert.equal((await request(route, 'POST', { expectedRevision: 1 })).status, 404, route);
  }
  assert.equal((await request('/__mobile/health', 'POST', {})).status, 405);
});

test('loopback binding and fixed local Hosts prevent arbitrary virtual hosts', async t => {
  const { origin } = await fixture(t);
  const port = new URL(origin).port;
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'aurora.localhost', 'harbor.localhost', 'custom-home.localhost']) {
    assert.equal((await rawRequest(origin, '/', { host: `${host}:${port}` })).status, 200, host);
  }
  for (const host of ['attacker.invalid', 'unregistered.localhost', 'localhost.attacker.invalid']) {
    assert.equal((await rawRequest(origin, '/', { host })).status, 403, host);
  }
  await assert.rejects(() => createDevServer({ host: '0.0.0.0' }), /loopback/);
});

test('static paths reject traversal, alternate streams and symlinks outside the configured root', async t => {
  const { origin, dir, staticDir } = await fixture(t);
  for (const route of ['/modules/../.local/commits.jsonl', '/modules/%2e%2e/app.js', '/modules/%2e%2e%5coutside.js', '/app.js%3Adata.js', '/assets/%00icon.svg']) {
    assert.equal((await rawRequest(origin, route)).status, 400, route);
  }
  const outside = path.join(dir, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'entry.js'), 'must not be exposed');
  const link = path.resolve(staticDir, 'modules', 'escape');
  assert.ok(link.startsWith(`${path.resolve(dir)}${path.sep}`));
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    assert.equal((await rawRequest(origin, '/modules/escape/entry.js')).status, 400);
  } finally {
    // Remove only our link, without following its target, before recursive fixture cleanup.
    await unlink(link);
  }
});

test('fixed development proxy preserves auth and envelopes, overrides login host, and strips cookies', async t => {
  const upstream = await mockUpstream(t);
  const { request } = await fixture(t, { upstream: upstream.origin, productHost: 'development.example.test' });
  const login = await request('/api/auth/login', 'POST', { username: 'example', host: 'attacker.invalid' }, {
    authorization: 'Bearer test-only', cookie: 'browser-cookie=discarded', 'x-product-host': 'attacker.invalid',
    'x-company-uuid': 'company-test', 'x-project-uuid': 'project-test',
  });
  assert.deepEqual(login.body, { code: 200, message: 'upstream', data: { reached: true } });
  assert.equal(upstream.received[0].url, '/auth/login');
  assert.equal(JSON.parse(upstream.received[0].body).host, 'development.example.test');
  assert.equal(upstream.received[0].headers['x-product-host'], 'development.example.test');
  assert.equal(upstream.received[0].headers.authorization, 'Bearer test-only');
  assert.equal(upstream.received[0].headers['x-company-uuid'], 'company-test');
  assert.equal(upstream.received[0].headers['x-project-uuid'], 'project-test');
  assert.equal(upstream.received[0].headers.cookie, undefined);
  assert.equal(login.headers.get('set-cookie'), null);
  assert.equal((await request('/api/denied')).status, 403);
  await request('/api/profile?upstream=https://attacker.invalid');
  assert.equal(upstream.received[2].url, '/profile?upstream=https://attacker.invalid');
  const redirect = await request('/api/redirect');
  assert.equal(redirect.status, 502);
  assert.equal(redirect.body.code, 'UPSTREAM_REDIRECT_BLOCKED');
  assert.equal(upstream.received.length, 4);
});

test('proxy blocks cross-origin, cross-site and cookie-bearing writes without Origin before upstream access', async t => {
  const upstream = await mockUpstream(t);
  const { request, origin } = await fixture(t, { upstream: upstream.origin });
  assert.equal((await request('/api/profile', 'GET', undefined, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await request('/api/profile', 'GET', undefined, { 'sec-fetch-site': 'cross-site' })).status, 403);
  const noOrigin = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'session=discarded' }, body: '{}' });
  assert.equal(noOrigin.status, 403);
  assert.equal((await request('/__mobile/environment', 'GET', undefined, { origin: 'null' })).status, 403);
  assert.equal(upstream.received.length, 0);
});

test('proxy rejects oversized fixed-length and chunked bodies, invalid login JSON and unsupported methods', async t => {
  const upstream = await mockUpstream(t);
  const { request, origin } = await fixture(t, { upstream: upstream.origin });
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 'x');
  const headers = { origin, 'content-type': 'application/json' };
  const fixed = await rawRequest(origin, '/api/upload', { ...headers, 'content-length': oversized.length }, 'POST', oversized);
  assert.equal(fixed.status, 413);
  const chunked = await rawRequest(origin, '/api/upload', { ...headers, 'transfer-encoding': 'chunked' }, 'POST', oversized);
  assert.equal(chunked.status, 413);
  assert.equal((await rawRequest(origin, '/api/auth/login', headers, 'POST', 'invalid-json')).status, 400);
  assert.equal((await rawRequest(origin, '/api/auth/login', { origin, 'content-type': 'text/plain' }, 'POST', '{}')).status, 415);
  assert.equal((await request('/api/profile', 'OPTIONS')).status, 405);
  assert.equal(upstream.received.length, 0);
});

test('proxy can be disabled and rejects unsafe fixed upstream configuration', async t => {
  const { request } = await fixture(t);
  const response = await request('/api/profile');
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'UPSTREAM_NOT_CONFIGURED');
  for (const upstream of ['file:///tmp/secret', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test?target=elsewhere']) {
    await assert.rejects(() => createDevServer({ upstream }), /fixed http\(s\) origin/);
  }
});
