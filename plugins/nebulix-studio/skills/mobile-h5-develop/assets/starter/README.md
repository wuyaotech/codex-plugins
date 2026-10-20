# 独立移动 H5 开发套件

套件 0.2.0，归属模块 `hlscs`。此目录可直接作为客户仓的 `h5-app/`，不需要 nebulix 主仓。SDK 客户端源码位于 `vendor/mobile-sdk/`，其版本及代码 SHA-256 记录在 `starter-receipt.json`。module-key 是交付归属，不自动替换示例业务页。

## 安装、启动与检查

需要 Node ≥20.19。首次交付使用随包锁文件执行：

```sh
npm ci
npm run dev
```

若本地导出时尚无锁文件，先执行 `npm install` 生成并提交 package-lock.json；后续统一 `npm ci`。不要在父工作区运行安装，也不使用 pnpm 改写原有依赖。打开 http://localhost:5518/ 正常登录；http://localhost:5518/?preview=1 显式使用虚构示例。MOBILE_PORT 可改端口。

```sh
npm run typecheck
npm test
npm run build
node scripts/build-module.mjs --source ./examples/schedule/index.tsx --module-key schedule --version 1.0.0
```

普通依赖从本目录安装；没有 workspace:*、主仓绝对路径或主仓依赖回退。React/ReactDOM 固定 18.3.1。SDK 是公开客户端源码，不包含后端 Entity 或业务凭据。

## 修改页面与模块

`web/h5.config.ts` 维护 title、storageNamespace、version、modules、navigation、localSources 与 allowedModuleOrigins。`web/mobile/MobileApp.tsx` 是可修改的登录/首页/导航宿主；示例模块在 `examples/`。本地源码输出到 `dist/modules/<moduleKey>/entry.js`，编译成功后手动刷新，不需要 dev=1。失败在终端报错，保留上次成功结果，当前没有 HMR。

上方模块构建命令可直接运行；开发客户模块时，把 source 和 module-key 换成实际入口与模块标识。推荐直接 node 调用 CLI，避免部分 Windows PowerShell npm.ps1 对 --version 的参数转发差异。独立 CLI 输出 `dist/artifacts/<key>/<version>/entry.js`，把该入口及页面描述写入 h5.config.modules 即可使用，不需后台登记。可选 `--manifest path/to/mobile-manifest.json` 同时生成供 Studio mobile 上传的描述；编译不代表组件或业务权限已验收，也不会打 ZIP、上传或发布。页面遵循 frontendModule/moduleKey/pages 契约，组件接收 ctx/params；公开类型见 `vendor/mobile-sdk/src/types.ts`。

模块共享 bare React/SDK imports；`index.html` 的 import map 将它们统一解析到当前 H5 的 /runtime/*。受信任跨域模块还需正确 MIME/CORS，来源允许列表不提供代码沙箱。模块 CSS 必须自行加命名空间，CLI 会把 CSS 内联到 JS。

## 静态部署与真实 API

`npm run build` 生成完整 `dist/`，其中 `__mobile/environment` 是无扩展名 JSON 文件，对应浏览器请求 /__mobile/environment。公开部署参数来自 `deployment.config.json`：apiBaseUrl 保持同源 /api，productHost 指定业务产品 Host，environment 标明环境。文件不得含 token、密码或签名密钥。

将 dist 部署到 HTTPS 静态站点，/ 和 /runtime、/modules、/artifacts 等路径保持；/__mobile/environment 用 application/json、可刷新缓存策略返回，/api/* 由正式网关转发到固定业务上游。部署方可用同一返回结构覆盖环境路径。Node 开发 server 仅用于 loopback 联调，不作为生产入口，正式网关由平台/部署方提供。当前 hash 深链刷新只请求网站根路径。

本地代理默认接开发环境，可通过 MOBILE_WORKBENCH_UPSTREAM 与 MOBILE_WORKBENCH_PRODUCT_HOST 修改；真实账号和业务授权仍由后端校验。默认示例进度/日志为虚构或浏览器本地记录，不能当作已接真实业务。

## 版本与边界

starter-receipt.json 记录导出基线与 SDK 源码 hash；客户可修改页面，SDK 升级应由平台提供新版本并核对变更。产物构建、云端模块发布、完整 H5 部署和原生分发是不同步骤。本套件不含三端原生壳、签名、云托管账号或在线构建服务；真实登录、业务 API 和手机设备需单独验收。
