import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, sdkRoot } from './tooling.mjs';

export const STARTER_VERSION = '0.2.0';
export const starterPackage = {
  name: '@nebulix/mobile-h5-starter', version: STARTER_VERSION, private: true, type: 'module',
  description: 'Standalone customer H5 with a vendored, versioned Nebulix client SDK',
  engines: { node: '>=20.19.0' },
  scripts: {
    dev: 'node scripts/dev.mjs', build: 'node scripts/build.mjs',
    typecheck: 'node scripts/typecheck.mjs', test: 'node scripts/test.mjs',
    'build:module': 'node scripts/build-module.mjs',
  },
  dependencies: { '@nebulix/mobile-sdk': 'file:vendor/mobile-sdk', react: '18.3.1', 'react-dom': '18.3.1' },
  devDependencies: { '@types/react': '18.3.12', '@types/react-dom': '18.3.1', esbuild: '0.24.2', typescript: '5.9.3' },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
async function addTree(files, base, relative = '', prefix = '') {
  for (const entry of (await fs.readdir(path.join(base, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', 'dist', '.git', '.local', '.local-data'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Starter source may not contain links: ${entry.name}`);
    const local = path.join(relative, entry.name);
    if (entry.isDirectory()) await addTree(files, base, local, prefix);
    else if (entry.isFile()) files.set(path.posix.join(prefix, local.replaceAll('\\', '/')), await fs.readFile(path.join(base, local)));
  }
}
function standaloneReadme(moduleKey) {
  return `# 独立移动 H5 开发套件

套件 ${STARTER_VERSION}，归属模块 \`${moduleKey}\`。此目录可直接作为客户仓的 \`h5-app/\`，不需要 nebulix 主仓。SDK 客户端源码位于 \`vendor/mobile-sdk/\`，其版本及代码 SHA-256 记录在 \`starter-receipt.json\`。module-key 是交付归属，不自动替换示例业务页。

## 安装、启动与检查

需要 Node ≥20.19。首次交付使用随包锁文件执行：

\`\`\`sh
npm ci
npm run dev
\`\`\`

若本地导出时尚无锁文件，先执行 \`npm install\` 生成并提交 package-lock.json；后续统一 \`npm ci\`。不要在父工作区运行安装，也不使用 pnpm 改写原有依赖。打开 http://localhost:5518/ 正常登录；http://localhost:5518/?preview=1 显式使用虚构示例。MOBILE_PORT 可改端口。

\`\`\`sh
npm run typecheck
npm test
npm run build
node scripts/build-module.mjs --source ./examples/schedule/index.tsx --module-key schedule --version 1.0.0
\`\`\`

普通依赖从本目录安装；没有 workspace:*、主仓绝对路径或主仓依赖回退。React/ReactDOM 固定 18.3.1。SDK 是公开客户端源码，不包含后端 Entity 或业务凭据。

## 修改页面与模块

\`web/h5.config.ts\` 维护 title、storageNamespace、version、modules、navigation、localSources 与 allowedModuleOrigins。\`web/mobile/MobileApp.tsx\` 是可修改的登录/首页/导航宿主；示例模块在 \`examples/\`。本地源码输出到 \`dist/modules/<moduleKey>/entry.js\`，编译成功后手动刷新，不需要 dev=1。失败在终端报错，保留上次成功结果，当前没有 HMR。

上方模块构建命令可直接运行；开发客户模块时，把 source 和 module-key 换成实际入口与模块标识。推荐直接 node 调用 CLI，避免部分 Windows PowerShell npm.ps1 对 --version 的参数转发差异。独立 CLI 输出 \`dist/artifacts/<key>/<version>/entry.js\`，把该入口及页面描述写入 h5.config.modules 即可使用，不需后台登记。可选 \`--manifest path/to/mobile-manifest.json\` 同时生成供 Studio mobile 上传的描述；编译不代表组件或业务权限已验收，也不会打 ZIP、上传或发布。页面遵循 frontendModule/moduleKey/pages 契约，组件接收 ctx/params；公开类型见 \`vendor/mobile-sdk/src/types.ts\`。

模块共享 bare React/SDK imports；\`index.html\` 的 import map 将它们统一解析到当前 H5 的 /runtime/*。受信任跨域模块还需正确 MIME/CORS，来源允许列表不提供代码沙箱。模块 CSS 必须自行加命名空间，CLI 会把 CSS 内联到 JS。

## 静态部署与真实 API

\`npm run build\` 生成完整 \`dist/\`，其中 \`__mobile/environment\` 是无扩展名 JSON 文件，对应浏览器请求 /__mobile/environment。公开部署参数来自 \`deployment.config.json\`：apiBaseUrl 保持同源 /api，productHost 指定业务产品 Host，environment 标明环境。文件不得含 token、密码或签名密钥。

将 dist 部署到 HTTPS 静态站点，/ 和 /runtime、/modules、/artifacts 等路径保持；/__mobile/environment 用 application/json、可刷新缓存策略返回，/api/* 由正式网关转发到固定业务上游。部署方可用同一返回结构覆盖环境路径。Node 开发 server 仅用于 loopback 联调，不作为生产入口，正式网关由平台/部署方提供。当前 hash 深链刷新只请求网站根路径。

本地代理默认接开发环境，可通过 MOBILE_WORKBENCH_UPSTREAM 与 MOBILE_WORKBENCH_PRODUCT_HOST 修改；真实账号和业务授权仍由后端校验。默认示例进度/日志为虚构或浏览器本地记录，不能当作已接真实业务。

## 版本与边界

starter-receipt.json 记录导出基线与 SDK 源码 hash；客户可修改页面，SDK 升级应由平台提供新版本并核对变更。产物构建、云端模块发布、完整 H5 部署和原生分发是不同步骤。本套件不含三端原生壳、签名、云托管账号或在线构建服务；真实登录、业务 API 和手机设备需单独验收。
`;
}
export async function exportStarter({ output, moduleKey = 'customer', includeLock = true }) {
  if (typeof output !== 'string' || !output.trim() || output.includes('\0')) throw new Error('--output must name an empty local directory.');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(moduleKey)) throw new Error('--module-key must be a lowercase module identifier.');
  const destination = path.resolve(output);
  if (within(root, destination) || within(sdkRoot, destination)) throw new Error('Export outside the starter/SDK source directories.');
  const status = await fs.lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (status && (!status.isDirectory() || status.isSymbolicLink() || (await fs.readdir(destination)).length)) {
    throw new Error('--output must be absent or an empty regular directory; existing customer files are never overwritten.');
  }
  const files = new Map();
  for (const directory of ['web', 'examples', 'scripts', 'server', 'tests']) await addTree(files, path.join(root, directory), '', directory);
  files.delete('scripts/starter-package-lock.json');
  const h5Config = files.get('web/h5.config.ts');
  if (h5Config) files.set('web/h5.config.ts', Buffer.from(h5Config.toString('utf8').replace(
    'Paths are relative to packages/mobile-workbench;',
    'Paths are relative to this H5 package root;',
  )));
  for (const directory of ['src', 'scripts', 'tests']) await addTree(files, path.join(sdkRoot, directory), '', `vendor/mobile-sdk/${directory}`);
  const sdkPackage = JSON.parse(await fs.readFile(path.join(sdkRoot, 'package.json'), 'utf8'));
  files.set('vendor/mobile-sdk/package.json', Buffer.from(JSON.stringify(sdkPackage, null, 2) + '\n'));
  files.set('vendor/mobile-sdk/tsconfig.json', await fs.readFile(path.join(sdkRoot, 'tsconfig.json')));
  const config = JSON.parse(await fs.readFile(path.join(root, 'tsconfig.json'), 'utf8'));
  config.compilerOptions.paths['@nebulix/mobile-sdk'] = ['./vendor/mobile-sdk/src/index.ts'];
  config.include = [...new Set([...config.include, 'modules/**/*.ts', 'modules/**/*.tsx'])];
  files.set('tsconfig.json', Buffer.from(JSON.stringify(config, null, 2) + '\n'));
  files.set('package.json', Buffer.from(JSON.stringify(starterPackage, null, 2) + '\n'));
  files.set('deployment.config.json', Buffer.from(JSON.stringify({ environment: 'development', apiBaseUrl: '/api', productHost: 'nebulix-web-dev.wuyaotech.com' }, null, 2) + '\n'));
  files.set('.gitignore', Buffer.from('node_modules/\ndist/\n.local/\n*.log\n'));
  files.set('.gitattributes', Buffer.from('# Preserve exported bytes so receipt hashes survive Git checkout.\n* -text\n'));
  files.set('.npmrc', Buffer.from('package-lock=true\n'));
  files.set('README.md', Buffer.from(standaloneReadme(moduleKey)));
  files.set('AGENTS.md', Buffer.from(`# H5 客户端开发约定\n\n这是独立 H5 工程，不依赖 nebulix 主仓。先读 README.md 和 starter-receipt.json。\n使用 Node >=20.19、npm ci/npm run；固定 React 18.3.1，不升级到 React 19，不在父目录安装。\n客户页面、首页、导航和模块入口在本目录代码中维护；业务 API 和权限沿现有 Studio 体系，不引入新的应用管理/草稿发布后台。\n修改 vendor/mobile-sdk 前核对公共契约并记录版本/hash变更，不把服务器 BizContext 或凭据打入前端。\n真实 API 写入、云端发布和安装包分发分别按用户授权执行；示例数据必须明确标记。\n`));
  if (includeLock) {
    let lock = null;
    for (const candidate of ['scripts/starter-package-lock.json', 'package-lock.json']) {
      lock = await fs.readFile(path.join(root, candidate)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (lock) break;
    }
    if (lock) {
      const lockData = JSON.parse(lock);
      if (lockData.name !== starterPackage.name || lockData.version !== STARTER_VERSION ||
          JSON.stringify(lockData.packages['']?.dependencies) !== JSON.stringify(starterPackage.dependencies)) {
        throw new Error('Starter package lock does not match its pinned dependency manifest.');
      }
      files.set('package-lock.json', lock);
    }
  }
  const inventory = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => ({ path: name, sha256: hash(bytes), bytes: bytes.length }));
  const sdkFiles = inventory.filter(item => item.path.startsWith('vendor/mobile-sdk/src/'));
  const receipt = {
    schemaVersion: 1, starter: { name: starterPackage.name, version: STARTER_VERSION, sourceSha256: hash(JSON.stringify(inventory)) },
    moduleKey, sdk: { name: sdkPackage.name, version: sdkPackage.version, sourceSha256: hash(JSON.stringify(sdkFiles)) },
    generatedAt: new Date().toISOString(), dependencyInstallation: 'npm', files: inventory,
  };
  files.set('starter-receipt.json', Buffer.from(JSON.stringify(receipt, null, 2) + '\n'));
  await fs.mkdir(destination, { recursive: true });
  for (const [name, bytes] of files) {
    const filename = path.join(destination, name);
    if (!within(destination, filename)) throw new Error('Export path escaped its destination.');
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, bytes, { flag: 'wx' });
  }
  return { output: destination, starterVersion: STARTER_VERSION, sdk: receipt.sdk, files: files.size, hasLockfile: files.has('package-lock.json') };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index], value = args[index + 1];
      const key = { '--output': 'output', '--module-key': 'moduleKey' }[flag];
      if (!key || !value || value.startsWith('--') || options[key]) throw new Error('Usage: node scripts/export-starter.mjs --output <empty-directory> [--module-key hlscs]');
      options[key] = value;
    }
    console.log(JSON.stringify(await exportStarter(options), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
