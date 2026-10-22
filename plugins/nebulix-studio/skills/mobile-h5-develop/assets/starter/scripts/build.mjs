import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { root, sdkRoot, resolveTool, requireTool } from './tooling.mjs';

const { build } = requireTool('esbuild');
export const outDir = path.join(root, 'dist');
export const runtimeUrls = {
  react: '/runtime/react.js',
  'react-dom/client': '/runtime/react-dom-client.js',
  'react/jsx-runtime': '/runtime/jsx-runtime.js',
  'react/jsx-dev-runtime': '/runtime/jsx-dev-runtime.js',
  '@nebulix/mobile-sdk': '/runtime/sdk.js',
};
export function sharedRuntime(excluded = [], { strict = false, bare = false, assetBasePath = '/' } = {}) {
  const urls = Object.fromEntries(Object.entries(runtimeUrls).map(([key, value]) => [key, `${assetBasePath}${value.slice(1)}`]));
  return {
    name: 'one-mobile-runtime',
    setup(plugin) {
      plugin.onResolve({ filter: /^\/(?:_h5\/[a-zA-Z0-9._-]+\/)?runtime\/.+\.js$/ }, args => ({ path: args.path.startsWith('/runtime/') ? `${assetBasePath}${args.path.slice(1)}` : args.path, external: true }));
      plugin.onResolve({ filter: /^(react(?:\/.*)?|react-dom(?:\/.*)?|@nebulix\/mobile-sdk(?:\/.*)?)$/ }, args => {
        if (excluded.includes(args.path)) return { path: resolveTool(args.path) };
        if (runtimeUrls[args.path] && args.kind === 'require-call') return { path: args.path, namespace: 'mobile-shared-require' };
        if (runtimeUrls[args.path]) return { path: bare ? args.path : urls[args.path], external: true };
        if (strict) return { errors: [{ text: `Unsupported shared runtime import: ${args.path}. Use a supported host runtime entry.` }] };
        return { path: resolveTool(args.path) };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'mobile-shared-require' }, args => ({
        contents: `export * from ${JSON.stringify(bare ? args.path : urls[args.path])};${args.path === '@nebulix/mobile-sdk' ? '' : `export {default} from ${JSON.stringify(bare ? args.path : urls[args.path])};`}`,
        loader: 'js',
      }));
    },
  };
}
export const common = {
  bundle: true, platform: 'browser', format: 'esm', target: ['es2022'],
  jsx: 'automatic', logLevel: 'warning', sourcemap: true,
  define: { 'process.env.NODE_ENV': '"development"' },
};
/** The customer owns this plain source configuration; there is no registry API. */
export async function readH5Config(configPath = path.join(root, 'web/h5.config.ts')) {
  const result = await build({
    entryPoints: [configPath], bundle: true, platform: 'node', format: 'esm',
    target: 'node20', write: false, logLevel: 'warning',
  });
  const { h5Config } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  if (!h5Config || typeof h5Config.title !== 'string' || !Array.isArray(h5Config.modules) ||
      !h5Config.localSources || typeof h5Config.localSources !== 'object' || Array.isArray(h5Config.localSources)) {
    throw new Error('web/h5.config.ts must export h5Config with title, modules and localSources.');
  }
  const keys = new Set();
  for (const module of h5Config.modules) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(module.moduleKey) || keys.has(module.moduleKey)) {
      throw new Error('Module keys must be unique lowercase identifiers.');
    }
    keys.add(module.moduleKey);
  }
  for (const [moduleKey, source] of Object.entries(h5Config.localSources)) {
    const module = h5Config.modules.find(item => item.moduleKey === moduleKey);
    if (!module || typeof source !== 'string' || !source.trim() ||
        module.entry !== `/modules/${moduleKey}/entry.js`) {
      throw new Error(`Local source ${moduleKey} must match a module with entry /modules/${moduleKey}/entry.js.`);
    }
  }
  return h5Config;
}
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export async function readDeploymentConfig(configPath = path.join(root, 'deployment.config.json')) {
  const input = await fs.readFile(configPath, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT') return { environment: 'development', apiBaseUrl: '/api', productHost: 'nebulix-web-dev.wuyaotech.com' };
    throw error;
  });
  const api = typeof input.apiBaseUrl === 'string' ? new URL(input.apiBaseUrl, 'https://h5.invalid') : null;
  if (!api || !input.apiBaseUrl.startsWith('/') || input.apiBaseUrl.startsWith('//') ||
      input.apiBaseUrl.includes('\\') || api.origin !== 'https://h5.invalid' || api.search || api.hash) {
    throw new Error('deployment.config.json apiBaseUrl must be a same-origin absolute API path.');
  }
  if (input.productHost !== undefined && (typeof input.productHost !== 'string' || !/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(input.productHost))) {
    throw new Error('deployment.config.json productHost is invalid.');
  }
  if (!['development', 'test', 'production', 'private'].includes(input.environment)) throw new Error('deployment.config.json environment is invalid.');
  return { mode: 'h5-static', environment: input.environment, apiBaseUrl: api.pathname, ...(input.productHost ? { productHost: input.productHost } : {}) };
}
export async function buildMobile({ outputDir = outDir, assetBasePath = '/', sourcemap = true } = {}) {
  outputDir = path.resolve(outputDir);
  if (assetBasePath !== '/' && !/^\/_h5\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,139}\/$/.test(assetBasePath)) throw new Error('assetBasePath must be / or /_h5/<releaseKey>/.');
  const config = await readH5Config();
  const urls = Object.fromEntries(Object.entries(runtimeUrls).map(([key, value]) => [key, `${assetBasePath}${value.slice(1)}`]));
  const composedConfig = { ...config, modules: config.modules.map(module => ({ ...module, entry: module.entry.startsWith('/') && !module.entry.startsWith('//') ? `${assetBasePath}${module.entry.slice(1)}` : module.entry })) };
  const sourceConfig = { name: 'versioned-h5-composition', setup(plugin) {
    plugin.onLoad({ filter: /[\\/]web[\\/]h5\.config\.ts$/ }, () => ({ contents: `export const h5Config = ${JSON.stringify(composedConfig)};`, loader: 'ts' }));
  } };
  const environment = await readDeploymentConfig();
  const outputs = [];
  async function compile(options) {
    const result = await build({
      ...options,
      sourcemap,
      define: { ...options.define, 'process.env.NODE_ENV': JSON.stringify(environment.environment === 'development' ? 'development' : 'production') },
      write: false,
    });
    outputs.push(...result.outputFiles);
    return result;
  }
  for (const spec of ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime']) {
    const exports = Object.keys(requireTool(spec)).filter(key => /^[A-Za-z_$][\w$]*$/.test(key) && key !== 'default');
    await compile({
      ...common,
      stdin: {
        contents: `import runtime from ${JSON.stringify(spec)};\nexport default runtime;\n${exports.map(key => `export const ${key} = runtime.${key};`).join('\n')}`,
        resolveDir: root, sourcefile: `${spec.replaceAll('/', '-')}-shared.js`,
      },
      outfile: path.join(outputDir, runtimeUrls[spec]),
      plugins: [sharedRuntime([spec], { assetBasePath })],
    });
  }
  await compile({
    ...common, entryPoints: [path.join(sdkRoot, 'src/index.ts')],
    outfile: path.join(outputDir, 'runtime/sdk.js'), plugins: [sharedRuntime([], { assetBasePath })],
  });
  const modules = [];
  const styles = ['/app.css'];
  for (const [moduleKey, source] of Object.entries(config.localSources)) {
    const { version, entry } = config.modules.find(item => item.moduleKey === moduleKey);
    const outfile = path.join(outputDir, entry.slice(1));
    const result = await compile({
      ...common, entryPoints: [path.resolve(root, source)],
      outfile, plugins: [sharedRuntime([], { strict: true, bare: true })],
      define: { ...common.define, __MODULE_VERSION__: JSON.stringify(version) },
    });
    const javascript = result.outputFiles.find(file => file.path === outfile);
    modules.push({ moduleKey, version, entry: `${assetBasePath}${entry.slice(1)}`, sha256: createHash('sha256').update(javascript.contents).digest('hex') });
    if (result.outputFiles.some(file => file.path.endsWith('.css'))) styles.push(entry.replace(/\.js$/, '.css'));
  }
  const host = await compile({
    ...common, entryPoints: [path.join(root, 'web/main.tsx')],
    outfile: path.join(outputDir, 'app.js'), plugins: [sourceConfig, sharedRuntime([], { assetBasePath })],
  });
  // Compile every source first. A syntax error does not partially overwrite the
  // previous successful build. Versioned CLI artifacts are never touched here.
  for (const output of outputs) {
    await fs.mkdir(path.dirname(output.path), { recursive: true });
    await fs.writeFile(output.path, output.contents);
  }
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#133f3d"><title>${escapeHtml(config.title)}</title>
${styles.map(href => `<link rel="stylesheet" href="${assetBasePath}${href.slice(1)}">`).join('\n')}
<script type="importmap">${JSON.stringify({ imports: urls })}</script>
</head><body><div id="root"></div><script type="module" src="${assetBasePath}app.js"></script></body></html>`;
  await fs.writeFile(path.join(outputDir, 'index.html'), html);
  await fs.mkdir(path.join(outputDir, '__mobile'), { recursive: true });
  await fs.writeFile(path.join(outputDir, '__mobile/environment'), JSON.stringify({ success: true, data: environment }, null, 2));
  const receipt = {
    hostSha256: createHash('sha256').update(host.outputFiles.find(file => file.path.endsWith(`${path.sep}app.js`)).contents).digest('hex'),
    modules,
    assetBasePath,
    environment,
  };
  await fs.writeFile(path.join(outputDir, 'build-receipt.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = await buildMobile();
  console.log(`H5 built with ${receipt.modules.length} source modules. Open the root URL to log in.`);
}
