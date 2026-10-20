import fs from 'node:fs';
import path from 'node:path';
import { buildMobile, outDir, readH5Config } from './build.mjs';
import { root, sdkRoot } from './tooling.mjs';
import { startServer } from '../server/index.mjs';

await buildMobile();
const port = Number(process.env.MOBILE_PORT || 5518);
const server = await startServer({
  host: '127.0.0.1', port,
  staticDir: outDir,
});
console.log(`H5 login: http://localhost:${port}/`);
console.log(`Optional sample: http://localhost:${port}/?preview=1`);
console.log('Development source watch enabled. Reload the page after a successful rebuild.');
let timer, building = false, pending = false;
let watchers = [];
async function watchSources() {
  const config = await readH5Config();
  const directories = [...new Set([
    path.join(root, 'web'), path.join(root, 'examples'),
    path.join(sdkRoot, 'src'),
    ...Object.values(config.localSources).map(source => path.dirname(path.resolve(root, source))),
  ])];
  const roots = directories.filter(candidate => !directories.some(parent => {
    const relative = path.relative(parent, candidate);
    return parent !== candidate && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }));
  const nextWatchers = [];
  try {
    for (const dir of roots) nextWatchers.push(fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer); timer = setTimeout(rebuild, 180);
    }));
  } catch (error) {
    for (const watcher of nextWatchers) watcher.close();
    throw error; // Keep the previous watchers alive so a config correction can recover.
  }
  for (const watcher of watchers) watcher.close();
  watchers = nextWatchers;
}
async function rebuild() {
  if (building) { pending = true; return; }
  building = true;
  try {
    await watchSources();
    await buildMobile();
    console.log('Mobile source rebuilt. Reload your preview to apply.');
  }
  catch (error) { console.error('Mobile build failed:', error.message); }
  finally { building = false; if (pending) { pending = false; void rebuild(); } }
}
await watchSources();
async function stop() {
  for (const watcher of watchers) watcher.close();
  clearTimeout(timer);
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
