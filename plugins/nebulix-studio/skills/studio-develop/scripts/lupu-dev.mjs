import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { startDevBrowser } from './lupu-dev-browser.mjs';
import { defaultRegistryPath, normalizeRepositoryUrl, runCommand } from './local-workspaces.mjs';

const scriptFile = fileURLToPath(import.meta.url);
const repositoryUrl = 'https://github.com/wuyaotech/studio-lupu-bridge.git';
const devOrigin = 'https://nebulix-web-dev.wuyaotech.com';

async function exists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(path, value) {
  const temporary = path + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
}

function findRepository(input) {
  const cwd = resolve(input ?? process.cwd());
  const git = args => execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  try {
    const root = git(['rev-parse', '--show-toplevel']);
    const remote = git(['remote', 'get-url', 'origin']);
    if (normalizeRepositoryUrl(remote).key === normalizeRepositoryUrl(repositoryUrl).key) return resolve(root);
  } catch {
    // Report the same actionable error for a missing or unrelated repository.
  }
  throw new Error('请在卢浦大桥仓库内运行，或用 --repo 指定它的检出目录。');
}

function sessionPaths(repo) {
  const key = createHash('sha256').update(repo).digest('hex').slice(0, 20);
  const directory = join(dirname(defaultRegistryPath()), 'lupu-direct-dev', key);
  return {
    directory,
    state: join(directory, 'session.json'),
    profile: join(directory, 'chrome-profile'),
    log: id => join(directory, id + '.log'),
    stop: id => join(directory, id + '.stop'),
  };
}

function isRunning(state) {
  if (
    !state || !/^[0-9a-f-]{36}$/.test(state.id ?? '') ||
    !Number.isInteger(state.pid) || state.pid <= 0 || state.phase === 'stopped' || state.phase === 'failed'
  ) return false;
  try {
    process.kill(state.pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function getChrome() {
  const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
  for (const root of roots.filter(Boolean)) {
    const executable = join(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (await exists(executable)) return executable;
  }
  throw new Error('找不到 Google Chrome，请先安装 Windows 正式版 Chrome。');
}

function waitForExit(child) {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

async function prepareVite(repo) {
  const vite = join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  if (await exists(vite)) return vite;
  const npm = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!await exists(npm)) throw new Error('找不到 npm，请在模块仓库按 README 安装依赖。');
  const install = spawn(process.execPath, [npm, 'ci', '--no-audit', '--no-fund'], {
    cwd: repo, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  const { code } = await waitForExit(install);
  if (code !== 0 || !await exists(vite)) throw new Error('模块依赖安装失败，请查看启动日志。');
  return vite;
}

async function findPort() {
  const server = createServer();
  await new Promise((ready, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', ready);
  });
  const { port } = server.address();
  await new Promise((closed, reject) => server.close(error => error ? reject(error) : closed()));
  return port;
}

async function waitForModule(entry, hasExited) {
  const probe = async (url, accept) => {
    for (let attempt = 0; attempt < 80 && !hasExited(); attempt++) {
      let response;
      try {
        response = await fetch(url, {
          headers: { Origin: devOrigin },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        await delay(250);
        continue;
      }
      try {
        if (response.ok) return await accept(response);
      } finally {
        if (!response.bodyUsed) await response.body?.cancel();
      }
      await delay(250);
    }
    throw new Error('本地 Vite 启动失败，请查看启动日志。');
  };
  await probe(new URL('/remote-manifest.json', entry), async response => {
    const manifest = await response.json();
    if (!manifest.modules?.some(module => module.moduleKey === 'lupu-bridge')) {
      throw new Error('本地 Vite 未返回卢浦大桥清单。');
    }
    if (response.headers.get('access-control-allow-origin') !== devOrigin) {
      throw new Error('这个检出尚未支持云端 dev 跨域。请使用包含 LUPU_CLOUD_DEV_REMOTE 改动的模块版本。');
    }
  });
  await probe(entry, response => {
    if (
      response.headers.get('access-control-allow-origin') !== devOrigin ||
      !response.headers.get('content-type')?.includes('javascript')
    ) throw new Error('本地模块入口未返回云端 dev 可读取的 JavaScript。');
  });
}

async function waitForStop(path, signal) {
  while (!await exists(path)) await delay(500, undefined, { signal });
}

async function runSession(repo, paths, id) {
  const state = {
    id, pid: process.pid, phase: 'starting', entry: null, overrides: 0, localEntry: 'pending', log: paths.log(id),
  };
  let stateWrites = Promise.resolve();
  const persist = () => {
    const snapshot = { ...state };
    stateWrites = stateWrites.catch(() => {}).then(() => writeJson(paths.state, snapshot));
    return stateWrites;
  };
  const report = () => { void persist().catch(error => console.error(error.message)); };
  const workspace = { repositoryUrl, path: repo, owner: id };
  const stopWaiting = new AbortController();
  let claimed = false;
  let ownsSession = false;
  let moduleServer;
  let moduleExit;
  let moduleExited = false;
  let browser;
  let lastFailure = null;
  let ending = false;
  try {
    await runCommand({ ...workspace, command: 'register' });
    await runCommand({ ...workspace, command: 'claim' });
    claimed = true;
    if (isRunning(await readJson(paths.state))) return;
    ownsSession = true;
    await persist();
    const metadata = await readJson(join(repo, 'studio.module.json'));
    if (metadata?.moduleKey !== 'lupu-bridge') throw new Error('仓库模块标识不是 lupu-bridge。');

    const chrome = await getChrome();
    const vite = await prepareVite(repo);
    if (await exists(paths.stop(id))) return;
    const port = await findPort();
    state.entry = 'http://127.0.0.1:' + port + '/dev/remote-entry.js';
    moduleServer = spawn(process.execPath, [
      vite, '--config', 'vite.config.mjs', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
    ], {
      cwd: repo,
      env: { ...process.env, LUPU_CLOUD_DEV_REMOTE: '1', VITE_API_BASE: devOrigin + '/api' },
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
    });
    moduleExit = waitForExit(moduleServer).then(
      () => { moduleExited = true; },
      error => { moduleExited = true; console.error(error.message); },
    );
    await waitForModule(state.entry, () => moduleExited);
    if (await exists(paths.stop(id))) return;

    let markManifestReady;
    const manifestReady = new Promise(resolveReady => { markManifestReady = resolveReady; });
    browser = await startDevBrowser({
      executable: chrome,
      profileDirectory: paths.profile,
      entry: state.entry,
      url: devOrigin + '/',
      onOverride: ({ modules }) => {
        if (ending) return;
        state.overrides++;
        state.localEntry = 'pending';
        delete state.localEntryError;
        report();
        markManifestReady('ready');
        console.log('manifest: lupu-bridge -> localhost, cloud modules: ' + (modules - 1));
      },
      onLocalEntry: ({ state: localEntry, reason }) => {
        if (ending) return;
        state.localEntry = localEntry;
        state.localEntryError = reason;
        report();
        console.log('local lupu-bridge entry: ' + localEntry + (reason ? ' (' + reason + ')' : ''));
      },
      onError: error => console.error(error.message),
    });
    const stopRequested = waitForStop(paths.stop(id), stopWaiting.signal).then(() => 'stop');
    const initialResult = await Promise.race([
      manifestReady, stopRequested, browser.closed.then(() => 'closed'),
      moduleExit.then(() => 'vite-exit'), delay(30000, 'timeout', { ref: false }),
    ]);
    if (initialResult === 'stop') return;
    if (initialResult !== 'ready') throw new Error('云端联调清单未就绪，请查看启动日志。');
    state.phase = 'ready';
    await persist();
    await runCommand({ ...workspace, command: 'release' });
    claimed = false;

    await Promise.race([browser.closed, moduleExit, stopRequested]);
    if (moduleExited) throw new Error('本地 Vite 已退出，联调窗口已关闭。');
  } catch (error) {
    lastFailure = error;
    throw error;
  } finally {
    ending = true;
    stopWaiting.abort();
    await browser?.close().catch(error => console.error(error.message));
    if (moduleServer && !moduleExited) {
      moduleServer.kill();
      await moduleExit;
    }
    if (claimed) await runCommand({ ...workspace, command: 'release' });
    if (ownsSession) {
      state.phase = lastFailure ? 'failed' : 'stopped';
      state.error = lastFailure?.message;
      await persist();
      await rm(paths.stop(id), { force: true });
    }
  }
}

async function start(repo, paths) {
  const current = await readJson(paths.state);
  if (isRunning(current) && current.phase === 'ready') {
    console.log(JSON.stringify({ ...current, reused: true }));
    return;
  }
  const id = randomUUID();
  const log = paths.log(id);
  let workerError;
  let workerExited;
  if (!isRunning(current)) {
    const descriptor = openSync(log, 'wx');
    try {
      const worker = spawn(process.execPath, [scriptFile, 'run', '--repo', repo, '--run-id', id], {
        cwd: repo, detached: true, stdio: ['ignore', descriptor, descriptor], windowsHide: true,
      });
      worker.once('error', error => { workerError = error; });
      worker.once('exit', () => { workerExited = true; });
      worker.unref();
    } finally {
      closeSync(descriptor);
    }
  }
  const startingSessionId = isRunning(current) ? current.id : id;
  const deadline = Date.now() + 300000;
  const competitorGrace = Date.now() + 1500;
  while (Date.now() < deadline) {
    if (workerError) throw workerError;
    const state = await readJson(paths.state);
    if (isRunning(state) && state.phase === 'ready') {
      console.log(JSON.stringify({ ...state, reused: state.id !== id }));
      return;
    }
    const expectedSessionEnded = state?.id === startingSessionId && ['failed', 'stopped'].includes(state.phase);
    if (expectedSessionEnded || workerExited && !isRunning(state) && Date.now() >= competitorGrace) {
      const failedSession = expectedSessionEnded ? state : null;
      throw new Error((failedSession?.error ?? '联调启动未完成。') + ' 日志：' + (failedSession?.log ?? log));
    }
    await delay(250);
  }
  const state = await readJson(paths.state);
  throw new Error('联调等待超时，请查看状态和日志：' + (state?.log ?? log));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { repo: { type: 'string' }, 'run-id': { type: 'string' } },
  });
  const [command] = positionals;
  if (positionals.length !== 1 || !['start', 'status', 'stop', 'run'].includes(command)) {
    throw new Error('用法：node lupu-dev.mjs start|status|stop --repo <卢浦大桥仓库>');
  }
  const repo = findRepository(values.repo);
  const paths = sessionPaths(repo);
  await mkdir(paths.directory, { recursive: true });
  if (command === 'start') return start(repo, paths);
  if (command === 'run') {
    if (!/^[0-9a-f-]{36}$/.test(values['run-id'] ?? '')) throw new Error('缺少运行标识。');
    return runSession(repo, paths, values['run-id']);
  }
  const state = await readJson(paths.state);
  const running = isRunning(state);
  if (command === 'stop' && running) await writeFile(paths.stop(state.id), '', 'utf8');
  console.log(JSON.stringify({ ...state, running, ...(command === 'stop' ? { stopRequested: running } : {}) }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
