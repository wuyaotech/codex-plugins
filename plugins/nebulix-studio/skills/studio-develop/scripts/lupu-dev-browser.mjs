import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const devOrigin = 'https://nebulix-web-dev.wuyaotech.com';
const manifestUrl = devOrigin + '/api/biz-remote/manifest';
const moduleKey = 'lupu-bridge';
const replacedHeaders = new Set([
  'age', 'cache-control', 'content-encoding', 'content-length', 'content-md5',
  'content-range', 'content-type', 'digest', 'etag', 'expires', 'last-modified',
  'pragma', 'repr-digest', 'content-digest', 'transfer-encoding',
]);

function validateEntry(entry) {
  if (typeof entry !== 'string'
      || !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}\/dev\/remote-entry\.js$/.test(entry)) {
    throw new Error('The local entry must be http://127.0.0.1:<port>/dev/remote-entry.js.');
  }
  new URL(entry);
}

function withLupuEntry(text, entry) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error('The cloud dev manifest is not valid JSON.');
  }
  const modules = manifest?.data?.modules ?? manifest?.modules;
  if (!Array.isArray(modules)) {
    throw new Error('The cloud dev manifest does not contain a module list.');
  }
  const matches = modules.filter(module => module?.moduleKey === moduleKey);
  if (matches.length !== 1) {
    throw new Error('The cloud dev manifest must contain exactly one lupu-bridge entry.');
  }
  matches[0].entry = entry;
  return { text: JSON.stringify(manifest), modules: modules.length };
}

export function overrideLupuManifest(text, entry) {
  validateEntry(entry);
  return withLupuEntry(text, entry).text;
}

function connectToBrowser(browser) {
  const commandPipe = browser.stdio[3];
  const eventPipe = browser.stdio[4];
  const events = new EventEmitter();
  const pending = new Map();
  let nextId = 0;
  let remaining = '';
  let connectionError;

  function disconnect(error) {
    if (connectionError) return;
    connectionError = error;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }

  browser.once('error', disconnect);
  browser.once('exit', () => disconnect(new Error('The dev browser closed.')));
  commandPipe.on('error', disconnect);
  eventPipe.on('error', disconnect);
  eventPipe.on('end', () => disconnect(new Error('The dev browser pipe closed.')));
  eventPipe.setEncoding('utf8').on('data', chunk => {
    const messages = (remaining + chunk).split('\0');
    remaining = messages.pop();
    for (const message of messages) {
      if (!message) continue;
      let packet;
      try {
        packet = JSON.parse(message);
      } catch {
        disconnect(new Error('The dev browser returned an invalid debugging message.'));
        return;
      }
      if (packet.method) {
        events.emit(packet.method, packet.params, packet.sessionId);
        continue;
      }
      const request = pending.get(packet.id);
      if (!request) continue;
      pending.delete(packet.id);
      clearTimeout(request.timer);
      if (packet.error) {
        request.reject(new Error(packet.error.message));
      } else {
        request.resolve(packet.result);
      }
    }
  });

  function send(method, params = {}, sessionId) {
    if (connectionError) return Promise.reject(connectionError);
    const id = ++nextId;
    const message = JSON.stringify({ id, method, params, sessionId }) + '\0';
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error('The dev browser timed out while handling ' + method + '.'));
      }, 15000);
      timer.unref();
      pending.set(id, { resolve: resolveRequest, reject: rejectRequest, timer });
      commandPipe.write(message, error => {
        if (error) disconnect(error);
      });
    });
  }

  return { send, events };
}

function jsonResponseHeaders(headers = []) {
  return [
    ...headers.filter(header => !replacedHeaders.has(header.name.toLowerCase())),
    { name: 'Content-Type', value: 'application/json; charset=utf-8' },
    { name: 'Cache-Control', value: 'no-store' },
  ];
}

export async function startDevBrowser({
  executable,
  profileDirectory,
  entry,
  url,
  headless = false,
  onError = error => console.error(error.message),
  onOverride = () => {},
  onLocalEntry = () => {},
}) {
  validateEntry(entry);
  const devUrl = new URL(url);
  if (devUrl.origin !== devOrigin || devUrl.username || devUrl.password) {
    throw new Error('The dev browser must open the Nebulix cloud dev origin.');
  }
  if (typeof profileDirectory !== 'string' || !profileDirectory.trim()) {
    throw new Error('A dedicated Chrome profile directory is required.');
  }
  const args = [
    '--remote-debugging-pipe',
    '--user-data-dir=' + resolve(profileDirectory),
    '--no-first-run',
    '--no-default-browser-check',
    '--no-startup-window',
  ];
  if (headless) args.push('--headless=new');

  const browser = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    windowsHide: headless,
  });
  const closed = new Promise(resolveClosed => {
    browser.once('error', () => resolveClosed());
    browser.once('exit', () => resolveClosed());
  });
  const { send, events } = connectToBrowser(browser);
  let closing;
  const close = () => {
    closing ??= (async () => {
      void send('Browser.close').catch(() => {});
      const exited = await Promise.race([
        closed.then(() => true),
        delay(2500, false, { ref: false }),
      ]);
      if (!exited) {
        browser.kill();
        await closed;
      }
    })();
    return closing;
  };

  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const targetCommand = (method, params) => send(method, params, sessionId);
    const localEntryRequests = new Map();
    let mainFrame;

    events.on('Page.frameNavigated', ({ frame }, eventSession) => {
      if (eventSession === sessionId && !frame.parentId) mainFrame = frame;
    });
    events.on('Target.detachedFromTarget', params => {
      if (params.sessionId === sessionId) void close();
    });
    events.on('Network.requestWillBeSent', ({ requestId, request, frameId }, eventSession) => {
      if (eventSession === sessionId && frameId === mainFrame?.id && request.url === entry) {
        localEntryRequests.set(requestId, false);
      }
    });
    events.on('Network.responseReceived', ({ requestId, response }, eventSession) => {
      if (eventSession !== sessionId || !localEntryRequests.has(requestId)) return;
      if (response.status >= 400) {
        localEntryRequests.delete(requestId);
        onLocalEntry({ state: 'failed', reason: 'HTTP ' + response.status });
      } else {
        localEntryRequests.set(requestId, response.status === 200);
      }
    });
    events.on('Network.loadingFinished', ({ requestId }, eventSession) => {
      if (eventSession !== sessionId) return;
      if (localEntryRequests.get(requestId)) onLocalEntry({ state: 'loaded' });
      localEntryRequests.delete(requestId);
    });
    events.on('Network.loadingFailed', ({ requestId, canceled, blockedReason, errorText }, eventSession) => {
      if (eventSession === sessionId && localEntryRequests.delete(requestId) && !canceled) {
        onLocalEntry({ state: 'failed', reason: blockedReason || errorText });
      }
    });

    async function handlePause(event) {
      const { requestId, request, frameId, responseStatusCode, responseErrorReason } = event;
      const isManifest = mainFrame && mainFrame.id === frameId && mainFrame.securityOrigin === devOrigin
        && request.url === manifestUrl && request.method === 'GET';
      if (!isManifest || responseStatusCode !== 200) {
        if (isManifest) {
          const reason = responseStatusCode ?? responseErrorReason ?? 'unknown';
          onError(new Error('The cloud dev manifest request failed (' + reason + ').'));
        }
        const method = responseStatusCode === undefined ? 'Fetch.continueRequest' : 'Fetch.continueResponse';
        await targetCommand(method, { requestId });
        return;
      }

      let replacement;
      let responseCode = 200;
      try {
        const { body, base64Encoded } = await targetCommand('Fetch.getResponseBody', { requestId });
        const text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
        replacement = withLupuEntry(text, entry);
      } catch (error) {
        if (closing) return;
        onError(new Error('Could not load the local lupu-bridge module: ' + error.message));
        replacement = { text: JSON.stringify({ message: 'Local lupu-bridge manifest override failed.' }) };
        responseCode = 502;
      }

      await targetCommand('Fetch.fulfillRequest', {
        requestId,
        responseCode,
        responseHeaders: jsonResponseHeaders(event.responseHeaders),
        body: Buffer.from(replacement.text, 'utf8').toString('base64'),
      });
      if (responseCode === 200) onOverride({ modules: replacement.modules });
    }

    events.on('Fetch.requestPaused', (event, eventSession) => {
      if (eventSession !== sessionId) return;
      void handlePause(event).catch(async error => {
        if (closing) return;
        onError(error);
        await targetCommand('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' }).catch(() => {});
      });
    });

    await targetCommand('Page.enable');
    await targetCommand('Network.enable');
    await targetCommand('Fetch.enable', {
      patterns: [{ urlPattern: manifestUrl, requestStage: 'Response' }],
    });
    const navigation = await targetCommand('Page.navigate', { url: devUrl.href });
    if (navigation.errorText) throw new Error(navigation.errorText);
    return { closed, close, reload: () => targetCommand('Page.reload') };
  } catch (error) {
    await close();
    throw error;
  }
}
