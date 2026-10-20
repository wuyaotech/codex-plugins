import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { common, sharedRuntime, outDir } from './build.mjs';
import { requireTool } from './tooling.mjs';

const { build } = requireTool('esbuild');
const moduleKeyPattern = /^[a-z][a-z0-9-]{0,63}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const help = `Build one mobile React ESM module for your H5 source configuration.
Usage:
  node scripts/build-module.mjs --source <entry.tsx> --module-key <key> --version <1.0.0> [--manifest <mobile-manifest.json>] [--output-dir <artifact-root>]

Source/output paths are absolute or relative to the current working directory.
Default artifact root: ${path.join(outDir, 'artifacts')}
Output: <artifact-root>/<module-key>/<version>/entry.js and entry.js.map
CSS and supported image/font imports are embedded in the JavaScript entry.
Existing versions must match every output byte; changed versions are never overwritten.`;

function fail(message) { throw new Error(message); }
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function existingFiles(directory) {
  const stat = await fs.lstat(directory).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return null;
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`Artifact version path is not a regular directory: ${directory}`);
  const files = new Map();
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (!item.isFile() || item.isSymbolicLink()) fail(`Artifact version contains an unsupported directory or link: ${item.name}`);
    files.set(item.name, await fs.readFile(path.join(directory, item.name)));
  }
  return files;
}
function checkSameVersion(existing, outputs, version) {
  if (!existing) return false;
  if (existing.size !== outputs.size || [...outputs].some(([name, bytes]) => !existing.get(name)?.equals(bytes))) {
    fail(`Immutable version ${version} already exists with different output. Choose a new --version; no artifact files were written.`);
  }
  return true;
}
function rejectBundledSharedRuntime(result) {
  for (const input of Object.keys(result.metafile.inputs)) {
    const normalized = input.replaceAll('\\', '/');
    if (/(?:^|\/)node_modules\/(?:react|react-dom|@nebulix\/mobile-sdk)(?:\/|$)/.test(normalized)) {
      fail(`Shared React/SDK code was bundled from ${input}. Import the supported package entry instead.`);
    }
  }
}
function cssFooter(css, moduleKey, version) {
  const clean = css.replace(/\/\*# sourceMappingURL=[^\r\n]*\*\/\s*$/, '').trimEnd();
  const id = `nebulix-mobile-${moduleKey}-${version}`;
  return `\n// Module-owned, scoped CSS. No separate CSS load is required.\nif (typeof document !== "undefined" && !document.getElementById(${JSON.stringify(id)})) {\n  const style = document.createElement("style");\n  style.id = ${JSON.stringify(id)};\n  style.textContent = ${JSON.stringify(clean)};\n  document.head.appendChild(style);\n}`;
}
export function validateMobileManifest(input, moduleKey, version) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.moduleKey !== moduleKey ||
      input.version !== version || input.target !== 'mobile' || input.runtimeApiVersion !== '1' ||
      (input.entry !== undefined && input.entry !== 'entry.js')) fail('Mobile manifest identity/target/version/runtimeApiVersion/entry does not match this build.');
  if (!Array.isArray(input.pages) || !input.pages.length || input.pages.length > 100) fail('Mobile manifest must declare 1–100 pages.');
  const keys = new Set();
  const pages = input.pages.map(page => {
    if (!page || typeof page !== 'object' || typeof page.key !== 'string' || !moduleKeyPattern.test(page.key) || keys.has(page.key) ||
        typeof page.label !== 'string' || !page.label.trim() || page.label.length > 120 ||
        !['company', 'project', 'both'].includes(page.scope)) fail('Mobile manifest pages must have unique keys, labels and valid scopes.');
    keys.add(page.key);
    return { key: page.key, label: page.label, scope: page.scope };
  });
  if (Buffer.byteLength(JSON.stringify({ target: 'mobile', runtimeApiVersion: '1', pages })) > 16_000) {
    fail('Mobile manifest metadata exceeds the 16000-byte publication limit.');
  }
  return { moduleKey, target: 'mobile', version, entry: 'entry.js', runtimeApiVersion: '1', pages };
}

/** Compile trusted client code; metadata and component contracts are validated when loaded. */
export async function buildModule({ source, moduleKey, version, manifestPath, outputDir = path.join(outDir, 'artifacts'), cwd = process.cwd() }) {
  if (typeof moduleKey !== 'string' || !moduleKeyPattern.test(moduleKey) || moduleKey === 'home') fail('Invalid --module-key. Use a lowercase module key; home is reserved.');
  if (typeof version !== 'string' || version.length > 80 || !versionPattern.test(version)) fail('Invalid --version. Use a version such as 1.0.0 or 1.0.0-dev.1.');
  if (typeof source !== 'string' || !source.trim() || source.includes('\0')) fail('--source must name a local JavaScript or TypeScript entry.');
  if (typeof outputDir !== 'string' || !outputDir.trim() || outputDir.includes('\0')) fail('--output-dir must name a local artifact root.');
  const sourcePath = await fs.realpath(path.resolve(cwd, source));
  if (!(await fs.stat(sourcePath)).isFile() || !/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(sourcePath)) fail('--source must be a JavaScript or TypeScript file.');
  const requestedRoot = path.resolve(cwd, outputDir);
  const versionDir = path.join(requestedRoot, moduleKey, version);
  if (!inside(requestedRoot, versionDir)) fail('Artifact path escaped the output directory.');
  const manifest = manifestPath === undefined ? undefined : validateMobileManifest(
    JSON.parse(await fs.readFile(path.resolve(cwd, manifestPath), 'utf8')), moduleKey, version,
  );
  const buildOptions = {
    ...common,
    absWorkingDir: path.dirname(sourcePath),
    entryPoints: [sourcePath],
    outfile: path.join(versionDir, 'entry.js'),
    plugins: [sharedRuntime([], { strict: true, bare: true })],
    define: { ...common.define, __MODULE_VERSION__: JSON.stringify(version) },
    loader: Object.fromEntries(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf'].map(extension => [extension, 'dataurl'])),
    metafile: true,
    write: false,
  };
  // esbuild resolves ordinary imports from the external source directory and its
  // node_modules. Only the explicitly shared runtime is resolved by the host.
  let result = await build(buildOptions);
  rejectBundledSharedRuntime(result);
  const css = result.outputFiles.find(file => file.path.endsWith('.css'));
  if (css) {
    result = await build({ ...buildOptions, footer: { js: cssFooter(css.text, moduleKey, version) } });
    rejectBundledSharedRuntime(result);
  }
  const outputs = new Map();
  for (const file of result.outputFiles) {
    if (file.path.endsWith('.css') || file.path.endsWith('.css.map')) continue;
    if (!inside(versionDir, file.path) || path.dirname(file.path) !== versionDir) fail('Unexpected output outside the module version directory.');
    outputs.set(path.basename(file.path), Buffer.from(file.contents));
  }
  if (!outputs.has('entry.js')) fail('Build did not produce entry.js.');
  if (manifest) outputs.set('mobile-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  // Validate the complete existing file set before creating any version files.
  checkSameVersion(await existingFiles(versionDir), outputs, `${moduleKey}@${version}`);
  await fs.mkdir(requestedRoot, { recursive: true });
  const canonicalRoot = await fs.realpath(requestedRoot);
  const moduleDir = path.join(canonicalRoot, moduleKey);
  await fs.mkdir(moduleDir).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const moduleStat = await fs.lstat(moduleDir);
  if (!moduleStat.isDirectory() || moduleStat.isSymbolicLink()) fail('Module output directory cannot be a symbolic link.');
  const destination = path.join(moduleDir, version);
  const unchanged = checkSameVersion(await existingFiles(destination), outputs, `${moduleKey}@${version}`);
  if (!unchanged) {
    // Build the complete new version separately; rename makes it visible as a set.
    const staging = path.join(canonicalRoot, `.build-${moduleKey}-${randomUUID()}`);
    if (!inside(canonicalRoot, staging)) fail('Invalid staging path.');
    await fs.mkdir(staging);
    try {
      for (const [name, bytes] of outputs) await fs.writeFile(path.join(staging, name), bytes, { flag: 'wx' });
      try { await fs.rename(staging, destination); }
      catch (error) {
        // Another build may have committed the same version while we compiled.
        if (!checkSameVersion(await existingFiles(destination), outputs, `${moduleKey}@${version}`)) throw error;
      }
    } finally {
      if (!inside(canonicalRoot, staging) || !path.basename(staging).startsWith(`.build-${moduleKey}-`)) fail('Invalid staging cleanup path.');
      await fs.rm(staging, { recursive: true, force: true });
    }
  }
  return {
    moduleKey, version,
    entry: `/artifacts/${moduleKey}/${version}/entry.js`,
    outputPath: path.join(destination, 'entry.js'),
    entrySha256: createHash('sha256').update(outputs.get('entry.js')).digest('hex'),
    files: [...outputs.keys()],
    cssEmbedded: Boolean(css),
    ...(manifest ? { manifest } : {}),
    unchanged,
  };
}

export function parseArguments(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) return null;
  const names = { '--source': 'source', '--module-key': 'moduleKey', '--version': 'version', '--manifest': 'manifestPath', '--output-dir': 'outputDir' };
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1], name = names[flag];
    if (!name || value === undefined || value.startsWith('--') || Object.hasOwn(options, name)) fail(`Invalid or repeated argument: ${flag}\n${help}`);
    options[name] = value;
  }
  for (const name of ['source', 'moduleKey', 'version']) if (!options[name]) fail(`Missing ${name}.\n${help}`);
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!options) console.log(help);
    else {
      const receipt = await buildModule(options);
      console.log(JSON.stringify(receipt, null, 2));
      console.log('Built only. Reference this entry and matching page metadata in web/h5.config.ts (no registration or management UI required).');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
