# 通过现有 Studio 流程发布 mobile target

仅当用户要求发布可复用移动 ESM 模块时读取。完整 `h5-app/dist` 是网站，不能上传成页面 ESM 模块。插件更新只交付技能与代码，不部署服务端。

## 先探测能力

调用现有 `get_context`，同时检查：

- 实际 `features.frontendTargets` 包含 `mobile`；
- `features.mobileManifest` 提供移动清单入口；
- 当前账号对目标模块和目标环境有 artifact/publish 权限；
- 当前 `prepare_upload` 工具 schema 接受 `target`。

2026-10-20 平台正在扩展这些能力；本插件不能仅凭发布日期或版本号假定当前部署已具备。缺少能力时继续本地构建/验收并报告平台缺口，不发明 `publish_mobile` 工具、不省略 target 伪装 desktop。工具 schema 尚未刷新时重新连接/发现工具，不绕过校验。

## 产物与发布

移动模块仍用 `kind: "web"`，明确 `target: "mobile"`。ZIP 保留相对路径，包含实际 ESM entry 及根 `mobile-manifest.json`：

```json
{
  "moduleKey": "hlscs",
  "target": "mobile",
  "version": "0.1.0",
  "entry": "entry.js",
  "runtimeApiVersion": "1",
  "pages": [
    { "key": "overview", "label": "业务总览", "scope": "project" }
  ]
}
```

示例元数据需换成实际已构建并验证的模块，entry 必须存在且与上传参数一致。按 [studio-develop](../../studio-develop/SKILL.md) 记录真实 sourceCommit、ZIP SHA256 和大小，走 `prepare_upload → PUT → complete_upload → prepare_release → execute_release → get_release_status`。遵守本次具体模块/环境/变更授权。配置和后端变化仍用既有 revision/发布规则，不因前端 target 新增而变成原子事务。

发布后回读工具声明的 mobile manifest，核对 entry、版本及页面；核对 PC manifest 和其他模块未被改变，再在实际 H5 中验证共享运行时、路由、样式和业务 API。mobile 入口不能混入旧 PC manifest，也不能自动把 PC remote 当移动兜底。

需要恢复时，按当前服务支持的流程重新发布已保存的旧不可变产物，并回读验证；不声称存在尚未提供的专用 rollback 工具。前端回退不恢复数据库，旧 H5/SDK/模块与当前业务 API 仍须兼容。
