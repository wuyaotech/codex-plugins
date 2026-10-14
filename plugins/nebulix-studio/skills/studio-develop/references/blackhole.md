# Studio 黑洞接入

适用：定制代码渲染场景，或按黑洞文档调用 HTTP（含业务授权的写接口）。先读模块 `docs/blackhole.md`、随包 `@nebulix/bp-sdk` 和 `web/src/runtime/blackhole.types.ts`。插件 0.1.4 / starter 1.3.0 增加通用 HTTP 指引；MCP `capabilityVersion=1` 不能证明线上运行宿主已升级。

## 检查能力

- 后端：项目作用域 route 的 `ctx.engineBh.httpVersion === 1`，使用 `getConnection({refresh?})` 或 `request<T>(options)`。
- 前端：runtime version `1`、`capabilities.engineBh.httpVersion === 1`，通过 `getStudioBlackholeHttp()` 取得 `runtime.engineBh`；`tryGetStudioBlackholeHttp()` 可检测旧宿主。每次 `getConnection/request` 额外传 `{moduleKey, projectUuid}`，不要求挂载 SceneView。
- 场景仍使用 `getStudioBlackhole()`、`capabilities.engineBh.version=1` 与 `components.BlackholeSceneView`。通用 HTTP 与场景能力分别检查。

## 按接口文档发请求

后端 `ctx.engineBh.request({method:'POST', path:'/blackHole3D/project/engine/v3/getLevels', body:{dataSetId}})`；前端 `http.request({...scope, method:'POST', path:'/project/engine/v3/getLevels', body:{dataSetId}})`，其中 `scope={moduleKey,projectUuid}`。该接口不需要先提供 sceneId；现有 17 个内部读取操作不是通用 HTTP 白名单。

`request` 固定使用平台配置的引擎源，自动加 token，HTTP 401 刷新一次；method 支持 GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS，默认 GET，GET/HEAD 不带 body。path 可带或不带 `/blackHole3D` 前缀，不能把外部 URL 作为 path。query 支持标量/数组，null 忽略；body 为 JSON，可传普通业务 headers，不能覆盖 Authorization 或传输/路由头。返回完整上游 JSON，不自动拆 data；`responseType:'text'` 返回原文，HEAD/204 为 null。

两端 `getConnection` 返回 `{baseUrl,apiBaseUrl,token,expiresAt,projectUuid,engineProjectUuid}`。`expiresAt` 为 Unix 毫秒；`apiBaseUrl` 已含 `/blackHole3D`。可直接 `fetch(apiBaseUrl + '/project/engine/v3/getLevels', {method:'POST', headers:{Authorization:token,'Content-Type':'application/json'}, body:JSON.stringify({dataSetId})})`；Authorization 使用 token 原文，不加 Bearer。需要 projId 的接口按文档传 `engineProjectUuid`，request 不擅自注入。multipart/二进制用连接信息配合原生 fetch；浏览器直连需 CORS 和网络可达。完整双端示例见随包指南。

HTTP 成功与业务成功分别核验。getLevels 已有 HTTP 200 但 `isSuccess:false/errMsg:'无效的pak文件'` 的联调结果，不能写成已取得楼层/房间业务结果。读取完整响应，按上游文档检查 isSuccess 等业务字段。

## 受信代码与现有便利 API

`trusted-host` 使用共享引擎账号凭据，token 不是逐项目受限 token。平台仍校验当前 Nebulix 项目和模块资格；通用 request/原生 fetch 不承诺任意接口逐资源隔离。按具体业务授权选资源、传项目参数和执行写操作，不把 token 当成资源权限证明。

不复制账号口令；token 通过 getConnection 按需取得，仅在执行/内存中使用，不写源码、配置、数据库、浏览器持久存储或日志。需要刷新时 getConnection({refresh:true})，不自己实现账号登录。

原 `project/scenes/models/elements` 封装保留为便利 API；例如 properties 仍要求 sceneId/dataSetId/elementIntId 并执行该封装的资源校验，不将这些前置条件套用到其他 HTTP 接口。

SceneView 复用宿主 SDK/React，不 import 平台私有路径。ref 操作在 onReady 后执行并捕获错误，只使用当前实例已加载的模型 ID，不自行删除横线；`STUDIO_ENGINE_DATASET_NOT_LOADED` 表示 ID 未加载/无效，selectElements 仅支持 BIM 和非负安全整数构件 ID。SDK 资源浏览器直连，私有网络和受鉴权图片需按真实资源验收，不能从通用 token 能力推断 SceneView 全部加载方式已支持。

## 升级、联调与交付

新 starter 解压到空目录，比较合并适配器、类型、示例、文档与 vendor，不覆盖已有路由/菜单/配置。先读模块本地联调文档；真实 dev 宿主 + 本地单模块 Remote 可复用登录和 SDK，后端必须激活 dev artifact。独立 preview/mock 不代替真实宿主与 HTTP 结果。

分别记录平台能力部署、模块源码/产物激活、团队插件发布、PM 实际更新。插件 0.1.4 需团队源发布后才能更新；更新插件不自动更新业务源码、starter/vendor 或平台权限。测试具体写接口以用户已授权的业务范围为准，不额外扩大到生产。
