import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
let esbuild;
try { esbuild = require('esbuild'); }
catch {
  if (!process.env.MOBILE_ESBUILD_PATH) throw new Error('Install the SDK dev dependencies, or run tests through the H5 starter.');
  esbuild = require(process.env.MOBILE_ESBUILD_PATH);
}
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nebulix-mobile-sdk-'));
try {
  const output = path.join(temporaryRoot, 'sdk.test.mjs');
  await esbuild.build({ entryPoints: [path.join(packageRoot, 'tests/sdk.test.ts')], outfile: output, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'warning' });
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(pathToFileURL(output))], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  const resolved = path.resolve(temporaryRoot);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('nebulix-mobile-sdk-')) {
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
