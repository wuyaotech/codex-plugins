import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, checkedFile } from './files.mjs';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maxBodyBytes = 2 * 1024 * 1024;
const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const allowedHosts = new Set([
  'localhost', '127.0.0.1', '[::1]',
  'aurora.localhost', 'harbor.localhost', 'custom-home.localhost',
]);
const loopbackAddress = value => value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}

function fail(res, error) {
  json(res, error instanceof HttpError ? error.status : 500, {
    success: false,
    code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
    message: error instanceof HttpError ? error.message : 'The local H5 development server could not complete this request',
  });
}

function requestUrl(req) {
  if (!loopbackAddress(req.socket.remoteAddress)) throw new HttpError(403, 'LOCAL_ONLY', 'This development server accepts loopback connections only');
  const rawHost = req.headers.host;
  if (!rawHost || /[\s/@\\#?]/.test(rawHost)) throw new HttpError(400, 'INVALID_HOST', 'Invalid local Host');
  let origin;
  try { origin = new URL(`http://${rawHost}`); } catch { throw new HttpError(400, 'INVALID_HOST', 'Invalid local Host'); }
  if (!allowedHosts.has(origin.hostname.toLowerCase())) throw new HttpError(403, 'INVALID_HOST', 'Host is not an allowed local development address');
  const raw = req.url ?? '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) throw new HttpError(400, 'INVALID_PATH', 'Only local request paths are accepted');
  let pathname;
  try { pathname = decodeURIComponent(raw.split('?')[0]); } catch { throw new HttpError(400, 'INVALID_PATH', 'Malformed path encoding'); }
  if (/[\\\0:]/.test(pathname) || pathname.split('/').some(part => part === '..' || part === '.')) {
    throw new HttpError(400, 'INVALID_PATH', 'Unsafe path');
  }
  return { url: new URL(raw, origin.origin), pathname, origin: origin.origin };
}

function requireSameOrigin(req, origin, mutation = false) {
  if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'ORIGIN_DENIED', 'Cross-origin requests are not accepted');
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) throw new HttpError(403, 'ORIGIN_DENIED', 'Cross-site requests are not accepted');
  if (mutation && !req.headers.origin && req.headers.cookie) {
    throw new HttpError(403, 'ORIGIN_REQUIRED', 'Cookie-bearing changes require a matching Origin');
  }
}

function readBody(req) {
  if (Number(req.headers['content-length']) > maxBodyBytes) {
    req.resume();
    return Promise.reject(new HttpError(413, 'BODY_TOO_LARGE', 'Request body exceeds 2 MiB'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      length += chunk.length;
      if (length > maxBodyBytes) {
        settled = true;
        chunks.length = 0;
        reject(new HttpError(413, 'BODY_TOO_LARGE', 'Request body exceeds 2 MiB'));
      } else chunks.push(chunk);
    });
    req.once('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)); } });
    req.once('error', error => { if (!settled) { settled = true; reject(error); } });
    req.once('aborted', () => { if (!settled) { settled = true; reject(new HttpError(400, 'REQUEST_ABORTED', 'Request upload was interrupted')); } });
  });
}

function upstreamUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new Error('upstream must be a fixed http(s) origin'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('upstream must be a fixed http(s) origin without credentials, path or query');
  }
  return url;
}

async function proxy(req, res, context, upstream, productHost) {
  requireSameOrigin(req, context.origin, writeMethods.has(req.method));
  if (!upstream) throw new HttpError(503, 'UPSTREAM_NOT_CONFIGURED', 'A development API upstream has not been configured');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Unsupported proxy method');
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'accept', 'companyid', 'companyuuid', 'projectid', 'projectuuid', 'x-company-uuid', 'x-project-uuid', 'accept-language']) {
    if (req.headers[name]) headers.set(name, req.headers[name]);
  }
  headers.set('x-product-host', productHost);
  const destination = new URL(upstream.origin);
  // Client input can change only path/query, never the configured origin.
  destination.pathname = context.pathname.slice('/api'.length);
  destination.search = context.url.search;
  let payload = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  if (req.method === 'POST' && destination.pathname === '/auth/login') {
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) {
      throw new HttpError(415, 'JSON_REQUIRED', 'Login requires Content-Type application/json');
    }
    try {
      const input = JSON.parse(payload.toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
      payload = Buffer.from(JSON.stringify({ ...input, host: productHost }));
      headers.set('content-type', 'application/json');
    } catch { throw new HttpError(400, 'INVALID_JSON', 'Login requires a JSON object'); }
  }
  let response;
  try {
    response = await fetch(destination, { method: req.method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  } catch { throw new HttpError(502, 'UPSTREAM_UNAVAILABLE', 'The configured development API is unavailable'); }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new HttpError(502, 'UPSTREAM_REDIRECT_BLOCKED', 'Upstream redirects are not followed');
  }
  res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
  if (req.method === 'HEAD') { await response.body?.cancel(); res.end(); return; }
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveFile(req, res, root, relative) {
  let filename;
  try {
    filename = await checkedFile(root, relative);
    if (!(await stat(filename)).isFile()) throw new Error('Not a file');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(404, 'NOT_FOUND', 'File not found');
  }
  const type = mime[path.extname(filename).toLowerCase()];
  if (!type) throw new HttpError(404, 'NOT_FOUND', 'Unsupported static resource');
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : await readFile(filename));
}

/** Loopback-only H5 preview and fixed development API proxy. No local management storage. */
export async function createDevServer(options = {}) {
  const {
    port = 5518, host = '127.0.0.1',
    staticDir = path.join(packageDir, 'dist'),
    artifactDir = path.join(staticDir, 'artifacts'),
  } = options;
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('The development server must listen on loopback');
  const upstream = upstreamUrl(options.upstream ?? process.env.MOBILE_WORKBENCH_UPSTREAM ?? 'https://nebulix-service-dev.wuyaotech.com');
  const productHost = options.productHost ?? process.env.MOBILE_WORKBENCH_PRODUCT_HOST ?? 'nebulix-web-dev.wuyaotech.com';
  if (typeof productHost !== 'string' || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(productHost)) throw new Error('Invalid fixed development productHost');
  const server = http.createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    try {
      const context = requestUrl(req);
      const { pathname, url, origin } = context;
      if (pathname.startsWith('/api/')) { await proxy(req, res, context, upstream, productHost); return; }
      if (['/__mobile/health', '/__mobile/environment'].includes(pathname)) {
        requireSameOrigin(req, origin);
        if (req.method !== 'GET') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Development metadata is read-only');
        const data = pathname.endsWith('/health')
          ? { mode: 'h5-development', environment: 'local', upstreamConfigured: Boolean(upstream) }
          : { mode: 'h5-development', environment: 'development', upstream: upstream?.origin ?? null, productHost, apiBaseUrl: '/api' };
        json(res, 200, { success: true, data }); return;
      }
      if (pathname === '/__mobile' || pathname.startsWith('/__mobile/')) {
        throw new HttpError(404, 'API_NOT_FOUND', 'Local management API is not available');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Static resources are read-only');
      if (pathname === '/') { await serveFile(req, res, staticDir, 'index.html'); return; }
      if (pathname === '/studio' || pathname.startsWith('/studio/') ||
          /^\/apps\/(?:aurora|harbor|custom-home)(?:\/.*)?$/.test(pathname)) {
        res.writeHead(302, { location: `/${url.search}`, 'cache-control': 'no-store' });
        res.end(); return;
      }
      if (pathname.startsWith('/artifacts/')) {
        await serveFile(req, res, artifactDir, pathname.slice('/artifacts/'.length)); return;
      }
      if (['/modules/', '/runtime/', '/assets/'].some(prefix => pathname.startsWith(prefix)) ||
          ['/app.js', '/app.css', '/app.js.map', '/app.css.map', '/favicon.ico'].includes(pathname)) {
        await serveFile(req, res, staticDir, pathname.slice(1)); return;
      }
      throw new HttpError(404, 'NOT_FOUND', 'Page not found');
    } catch (error) {
      if (!res.headersSent) fail(res, error);
      else res.destroy();
    }
  });
  server.start = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(server); });
  });
  return server;
}

export async function startServer(options = {}) {
  const server = await createDevServer(options);
  await server.start();
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer({ port: Number(process.env.PORT ?? 5518), host: process.env.HOST ?? '127.0.0.1' })
    .then(server => { console.info(`Mobile H5 development: http://localhost:${server.address().port}/`); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
