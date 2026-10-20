import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildModule, parseArguments, validateMobileManifest } from '../scripts/build-module.mjs';

const cli = fileURLToPath(new URL('../scripts/build-module.mjs', import.meta.url));
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-module-build-'));
  const sourceDir = path.join(directory, 'customer-repo', 'h5-app');
  const outputDir = path.join(directory, 'artifacts');
  await fs.mkdir(path.join(sourceDir, 'node_modules', 'customer-local-dependency'), { recursive: true });
  await fs.mkdir(path.join(sourceDir, 'node_modules', 'react'));
  await fs.writeFile(path.join(sourceDir, 'node_modules', 'customer-local-dependency', 'package.json'), JSON.stringify({ name: 'customer-local-dependency', type: 'module', main: 'index.js' }));
  await fs.writeFile(path.join(sourceDir, 'node_modules', 'customer-local-dependency', 'index.js'), 'export const label = "EXTERNAL_CUSTOMER_DEPENDENCY";');
  await fs.writeFile(path.join(sourceDir, 'node_modules', 'react', 'package.json'), JSON.stringify({ name: 'react', main: 'index.js' }));
  await fs.writeFile(path.join(sourceDir, 'node_modules', 'react', 'index.js'), 'throw new Error("DO_NOT_BUNDLE_CUSTOMER_REACT");');
  const source = path.join(sourceDir, 'entry.tsx');
  const css = path.join(sourceDir, 'styles.css');
  await fs.writeFile(css, '.customer-scope { color: rgb(12, 34, 56); }\n');
  await fs.writeFile(source, `
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { useMobileRuntime } from '@nebulix/mobile-sdk';
    import { label } from 'customer-local-dependency';
    import './styles.css';
    export const sharedReferences = [React, createRoot];
    function Overview() {
      const [value] = useState(label);
      const ctx = useMobileRuntime();
      return <div className="customer-scope">{value}:{ctx.appKey}</div>;
    }
    export const frontendModule = { moduleKey: 'customer-test', pages: [
      { key: 'overview', label: 'Customer', scope: 'project', component: Overview }
    ] };
  `);
  t.after(async () => {
    const tempRoot = path.resolve(os.tmpdir());
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(`${tempRoot}${path.sep}`) && path.basename(absolute).startsWith('mobile-module-build-'));
    await fs.rm(absolute, { recursive: true, force: true });
  });
  return { directory, sourceDir, source, css, outputDir };
}

test('external customer source resolves its own dependencies and imports one shared React/SDK runtime; CSS is embedded', async t => {
  const f = await fixture(t);
  const receipt = await buildModule({ source: f.source, moduleKey: 'customer-test', version: '1.0.0', outputDir: f.outputDir });
  const js = await fs.readFile(receipt.outputPath, 'utf8');
  for (const runtime of ['react', 'react-dom/client', 'react/jsx-runtime', '@nebulix/mobile-sdk']) assert.ok(js.includes(`"${runtime}"`), runtime);
  assert.ok(!js.includes('/runtime/'), 'Module dependencies must resolve through the host import map even from OSS origins.');
  assert.ok(js.includes('EXTERNAL_CUSTOMER_DEPENDENCY'));
  assert.ok(!js.includes('DO_NOT_BUNDLE_CUSTOMER_REACT'));
  assert.ok(!js.includes('react.development.js'));
  assert.ok(js.includes('document.getElementById("nebulix-mobile-customer-test-1.0.0")'));
  assert.ok(js.includes('style.textContent'));
  assert.ok(js.includes('.customer-scope'));
  assert.ok(!js.includes('sourceMappingURL=entry.css.map'));
  assert.deepEqual(receipt.files.toSorted(), ['entry.js', 'entry.js.map']);
  assert.equal(receipt.cssEmbedded, true);
  assert.equal(receipt.unchanged, false);
  const files = await fs.readdir(path.dirname(receipt.outputPath));
  assert.deepEqual(files.toSorted(), ['entry.js', 'entry.js.map']);
  const map = JSON.parse(await fs.readFile(`${receipt.outputPath}.map`, 'utf8'));
  assert.equal(map.version, 3);
  assert.ok(map.sources.some(name => name.endsWith('entry.tsx')));
});

test('same version is repeatable but a CSS change rejects every output before writing; a new version succeeds', async t => {
  const f = await fixture(t);
  const options = { source: f.source, moduleKey: 'customer-test', version: '1.0.0', outputDir: f.outputDir };
  const first = await buildModule(options);
  const beforeJs = await fs.readFile(first.outputPath);
  const beforeMap = await fs.readFile(`${first.outputPath}.map`);
  assert.equal((await buildModule(options)).unchanged, true);
  await fs.writeFile(f.css, '.customer-scope { color: rgb(98, 76, 54); }\n');
  await assert.rejects(buildModule(options), /Immutable version.*different output/);
  assert.deepEqual(await fs.readFile(first.outputPath), beforeJs);
  assert.deepEqual(await fs.readFile(`${first.outputPath}.map`), beforeMap);
  const next = await buildModule({ ...options, version: '1.0.1' });
  assert.notEqual(first.entrySha256, next.entrySha256);
  assert.ok((await fs.readFile(next.outputPath, 'utf8')).includes('98, 76, 54'));
  assert.deepEqual((await fs.readdir(f.outputDir)).toSorted(), ['customer-test']);
});

test('CLI resolves cwd-relative input/output and does not create a registry or publish', async t => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [cli, '--source', 'entry.tsx', '--module-key', 'customer-cli', '--version', '2.0.0-dev.1', '--output-dir', '../../cli-artifacts'], { cwd: f.sourceDir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Built only/);
  assert.match(result.stdout, /"entrySha256": "[a-f0-9]{64}"/);
  const artifactRoot = path.join(f.directory, 'cli-artifacts');
  assert.deepEqual(await fs.readdir(artifactRoot), ['customer-cli']);
  assert.ok((await fs.stat(path.join(artifactRoot, 'customer-cli', '2.0.0-dev.1', 'entry.js'))).isFile());
});

test('module/version path injection and ambiguous CLI flags are rejected before output creation', async t => {
  const f = await fixture(t);
  for (const moduleKey of ['../escape', '..\\escape', '/absolute', 'a/b', 'a\\b', 'home']) {
    await assert.rejects(buildModule({ source: f.source, moduleKey, version: '1.0.0', outputDir: f.outputDir }), /Invalid --module-key/);
  }
  for (const version of ['../1.0.0', '..\\1.0.0', '1.0.0/escape', '1.0.0\\escape', '1.0.0:other']) {
    await assert.rejects(buildModule({ source: f.source, moduleKey: 'customer-test', version, outputDir: f.outputDir }), /Invalid --version/);
  }
  await assert.rejects(fs.stat(f.outputDir), { code: 'ENOENT' });
  assert.throws(() => parseArguments(['--source', 'a.tsx', '--source', 'b.tsx']), /repeated argument/);
  assert.throws(() => parseArguments(['--source', '--version']), /Invalid/);
  assert.throws(() => parseArguments(['--unknown', 'value']), /Invalid/);
});

test('unsupported private React paths fail instead of embedding a second runtime', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.source, 'import React from "react/cjs/react.development.js"; export const value = React;');
  await assert.rejects(buildModule({ source: f.source, moduleKey: 'customer-test', version: '1.0.0', outputDir: f.outputDir }), /Unsupported shared runtime import/);
  await assert.rejects(fs.stat(f.outputDir), { code: 'ENOENT' });
});

test('CommonJS customer dependencies share SDK named exports without inventing an SDK default export', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.sourceDir, 'legacy.cjs'), 'const sdk = require("@nebulix/mobile-sdk"); const React = require("react"); exports.read = () => [sdk.useMobileRuntime, React.useState];');
  await fs.writeFile(f.source, 'import { read } from "./legacy.cjs"; export const shared = read();');
  const receipt = await buildModule({ source: f.source, moduleKey: 'customer-test', version: '1.0.0', outputDir: f.outputDir });
  const js = await fs.readFile(receipt.outputPath, 'utf8');
  assert.ok(js.includes('@nebulix/mobile-sdk'));
  assert.ok(js.includes('"react"'));
  assert.doesNotMatch(js, /import\s*\{[^}]*\bdefault\b[^}]*\}\s*from\s*["']@nebulix\/mobile-sdk["']/);
  assert.ok(!js.includes('DO_NOT_BUNDLE_CUSTOMER_REACT'));
});

test('optional mobile manifest is normalized into the artifact and identity/page mismatches fail before writes', async t => {
  const f = await fixture(t);
  const descriptor = { moduleKey: 'customer-test', target: 'mobile', version: '1.0.0', runtimeApiVersion: '1', pages: [{ key: 'overview', label: 'Customer', scope: 'project' }] };
  const manifestPath = path.join(f.sourceDir, 'mobile-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(descriptor));
  const receipt = await buildModule({ source: f.source, moduleKey: 'customer-test', version: '1.0.0', manifestPath, outputDir: f.outputDir });
  const saved = JSON.parse(await fs.readFile(path.join(path.dirname(receipt.outputPath), 'mobile-manifest.json'), 'utf8'));
  assert.equal(saved.entry, 'entry.js');
  assert.deepEqual(saved.pages, descriptor.pages);
  assert.throws(() => validateMobileManifest({ ...descriptor, moduleKey: 'other' }, 'customer-test', '1.0.0'), /identity/);
  assert.throws(() => validateMobileManifest({ ...descriptor, entry: '../entry.js' }, 'customer-test', '1.0.0'), /identity/);
  assert.throws(() => validateMobileManifest({ ...descriptor, pages: [...descriptor.pages, ...descriptor.pages] }, 'customer-test', '1.0.0'), /unique/);
  assert.throws(() => validateMobileManifest({ ...descriptor, pages: [{ key: 'Bad_Key', label: 'Page', scope: 'project' }] }, 'customer-test', '1.0.0'), /unique/);
  assert.throws(() => validateMobileManifest({ ...descriptor, pages: [{ key: 'page', label: 'x'.repeat(121), scope: 'project' }] }, 'customer-test', '1.0.0'), /unique/);
  assert.throws(() => validateMobileManifest({ ...descriptor, pages: Array.from({ length: 101 }, (_, i) => ({ key: `page-${i}`, label: 'Page', scope: 'project' })) }, 'customer-test', '1.0.0'), /1–100/);
  assert.throws(() => validateMobileManifest({ ...descriptor, pages: Array.from({ length: 100 }, (_, i) => ({ key: `page-${i}`, label: '汉'.repeat(100), scope: 'project' })) }, 'customer-test', '1.0.0'), /16000-byte/);
});
