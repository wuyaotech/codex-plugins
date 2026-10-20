import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildMobile, readH5Config } from '../scripts/build.mjs';
import { startServer } from '../server/index.mjs';

test('a clean H5 build boots without registry state and serves only the code-owned composition', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-h5-build-'));
  let server;
  t.after(async () => {
    if (server?.listening) {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    }
    const target = path.resolve(directory);
    assert.ok(target.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`) && path.basename(target).startsWith('mobile-h5-build-'));
    await fs.rm(target, { recursive: true, force: true });
  });
  const staticDir = path.join(directory, 'dist');
  const config = await readH5Config();
  const receipt = await buildMobile({ outputDir: staticDir });
  assert.deepEqual(receipt.modules.map(module => module.moduleKey).sort(), Object.keys(config.localSources).sort());
  assert.deepEqual(await fs.readdir(directory), ['dist']);
  const javascript = await fs.readFile(path.join(staticDir, 'app.js'), 'utf8');
  assert.ok(javascript.includes('/__mobile/environment'));
  for (const retired of ['/__mobile/apps', '/__mobile/catalog', '/__mobile/bootstrap', 'StudioApp']) {
    assert.ok(!javascript.includes(retired), `Retired management dependency remains: ${retired}`);
  }
  server = await startServer({ port: 0, staticDir, upstream: '' });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  const html = await response.text();
  assert.ok(html.includes(config.title));
  const imports = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
  assert.equal(imports.react, '/runtime/react.js');
  assert.equal(imports['@nebulix/mobile-sdk'], '/runtime/sdk.js');
  const environment = JSON.parse(await fs.readFile(path.join(staticDir, '__mobile/environment'), 'utf8'));
  assert.equal(environment.success, true);
  assert.equal(environment.data.apiBaseUrl, '/api');
  assert.ok(!html.includes('/dev-artifacts/') && !html.includes('/artifacts/'));
  for (const module of receipt.modules) {
    assert.equal((await fetch(new URL(module.entry, origin))).status, 200);
  }
  assert.equal((await fetch(`${origin}/__mobile/apps`)).status, 404);
  assert.deepEqual(await fs.readdir(directory), ['dist'], 'The dev server must not create a registry or draft database');
});
