import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root, sdkRoot, resolveTool } from './tooling.mjs';

for (const [cwd, args] of [
  [root, [path.join(root, 'scripts/typecheck.mjs')]],
  [sdkRoot, [path.join(sdkRoot, 'scripts/test.mjs')]],
  [root, ['--test', path.join(root, 'tests/server.test.mjs')]],
  [root, ['--test', path.join(root, 'tests/build-module.test.mjs')]],
  [root, ['--test', path.join(root, 'tests/h5-build.test.mjs')]],
  [root, ['--test', path.join(root, 'tests/export-starter.test.mjs')]],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd, stdio: 'inherit',
    env: { ...process.env, MOBILE_ESBUILD_PATH: resolveTool('esbuild') },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
