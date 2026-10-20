import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const repo = path.resolve(root, '../..');
export const standalone = existsSync(path.join(root, 'vendor/mobile-sdk/package.json'));
export const sdkRoot = standalone ? path.join(root, 'vendor/mobile-sdk') : path.resolve(root, '../mobile-sdk');
const roots = [
  createRequire(path.join(root, 'package.json')),
  ...(!standalone ? [
    createRequire(path.join(repo, 'packages/desktop-web/package.json')),
    createRequire(path.join(repo, 'packages/service/package.json')),
  ] : []),
];
// Exported starters resolve only their own installed dependencies. The platform
// checkout retains its existing-tool fallback without requiring a reinstall.
export function resolveTool(name) {
  for (const require of roots) {
    try { return require.resolve(name); } catch {}
  }
  throw new Error(`Missing ${name}. Run npm install in the H5 starter directory before running mobile tools.`);
}
export function requireTool(name) {
  return createRequire(import.meta.url)(resolveTool(name));
}
