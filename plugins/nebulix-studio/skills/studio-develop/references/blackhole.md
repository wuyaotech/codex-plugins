# Studio 黑洞接入

适用：模块定制页面展示黑洞场景、选择构件与业务联动，或模块后端读取黑洞数据。先读本模块 `docs/blackhole.md`、`web/src/runtime/blackhole.types.ts` 和实际 SDK 类型；这些文件由 starter 1.2.0 起分发。没有时通过 `get_starter` 下载至新的空目录，比较合并所需文件，不覆盖已有模块。

## 检查能力再编码

- 插件 0.1.3 提供本流程；MCP `capabilityVersion=1` 只描述开发工具，不能证明线上宿主支持黑洞。
- 前端需 `__NEBULIX_BIZ_RUNTIME__.version === '1'`、`capabilities.engineBh.version === 1` 和 `components.BlackholeSceneView`。优先使用随包 `getStudioBlackhole/tryGetStudioBlackhole`，旧宿主或独立 preview 显示能力缺失。
- 后端项目 route 需 `ctx.engineBh.version === 1`；使用 SDK 随包类型。宿主负责绑定已验证的用户、企业、模块和项目。`projectUuid` 与引擎 `engineProjectUuid/projId` 不同。
- 当前 `resourceAccess: trusted-host` 仅用于内部受信模块，浏览器仍依赖黑洞资源凭证。不宣称完成恶意扩展沙箱、匿名分享或外部嵌入授权。

## 采用平台提供的接入面

前端采用 `web/src/examples/BlackholeScenePage.tsx`：宿主的 SceneView 加载场景，ref 提供实例操作，onSelect 关联业务数据。模块不复制 SDK、Worker/WASM，不 import 平台私有 `@/` 路径，不依赖全局当前引擎。高级调用先按 `capability.sdkVersion` 核对 API。

模型操作应在 `onReady` 后执行并捕获错误，只使用当前实例已加载的模型 ID，不自行去掉横线。`STUDIO_ENGINE_DATASET_NOT_LOADED` 表示 ID 无效、未加载或已过期；`selectElements` 仅支持 BIM 模型和非负安全整数构件 ID，否则抛出 `STUDIO_ENGINE_INVALID_ELEMENT_SELECTION`。

后端采用 `server-extension/src/blackhole.ts`：project 作用域 route 调 `ctx.engineBh.project/scenes/models/elements`。只传业务筛选和资源标识，不能传任意 URL、请求头、token 或授权项目。查询不自动开通引擎、不写黑洞数据；缺映射由维护者按独立流程开通。

场景元数据经过平台授权读取，宿主资源地址来自服务端 `engine_bh.baseUrl` 生成的配置。SDK 在浏览器直连下载模型、纹理和图片；私有部署需验证浏览器可达、HTTPS、跨域与资源路径，需要额外鉴权的私有图片尚未作为已支持场景。不要用模块 URL/token 参数绕过配置。

`ENGINE_BH_UPSTREAM_FORBIDDEN` 表示黑洞上游 403，与 Nebulix 的 `PROJECT_ACCESS_DENIED` 区分；`ENGINE_BH_AUTH_FAILED`、`ENGINE_BH_TIMEOUT`、`ENGINE_BH_UPSTREAM_FAILED` 分别表示刷新后鉴权仍失败、超时和其他上游读取失败。由平台维护者排查上游权限/网络，模块不索要账号或凭证。

示例路由和页面是可选的，先保留已有 exports、业务菜单和配置，再增量合并。更新 SDK/vendor 时检查锁文件与构建 manifest 的实际 SDK 版本，不用新 starter 覆盖模块。新增菜单仍需草稿与发布流程。

## 联调与交付

先读模块现有本地联调文档。真实 dev 宿主 + 本地单模块 Remote 可复用 SDK、登录和权限；后端代码须激活 dev artifact 后验证。缺少本地网关时可用 dev 候选/已激活 Remote 在真实宿主验收。独立 preview 与 mock 仅辅助页面开发，不能代替真实场景。

用本人正常项目身份测试场景列表、真实渲染、点选属性、聚焦/显隐、切项目和卸载；验证资源越权、模块停用、未映射、上游失败和旧宿主提示。不要索要数据库、OSS 或黑洞账号凭据，不复制浏览器 token 到另一个环境。记录已验证的部署和浏览器范围。

分别报告平台能力部署、模块源码/产物激活、团队插件发布、PM 实际更新。主仓改 Skill 不等于团队插件源已发布，插件更新也不会自动同步业务源码、starter/vendor 或平台权限。已有授权覆盖的具体工作继续执行；若用户仅要求分析或本地修改，不扩大到发布。
