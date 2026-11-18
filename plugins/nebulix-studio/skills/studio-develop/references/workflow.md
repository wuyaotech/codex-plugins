# 配置与发布

配置格式见[配置开发](configuration.md)，API 和前端实现分别见[后端开发](backend.md)、[前端开发](frontend.md)。

## 配置草稿

1. `export_configs` 读取 draft 和 published，保留 revision，合并本次变更。
2. `validate_configs` 校验，再用 `diff_configs` 核对增删改与影响范围。
3. `apply_drafts` 传最新 expectedRevision；冲突时重新读取合并。

省略整个配置文件保持现状。字典和菜单文件表示完整集合，遗漏已发布项会生成删除草稿。MCP 支持删除本模块全局 system 菜单；表、字典和 API 删除仍受限制，以当前服务端校验为准。

删除菜单时同时处理子项；全部删除仍保留 `menus: {}`。draft 导出省略待删除菜单，回读不会撤销删除。纯菜单发布可只带配置；成功后刷新工作区核对实际导航。

## 产物

按工程脚本生成前后端 ZIP 与 SHA256。starter 的 `npm run build` 输出 `dist/web-<version>.zip`、`dist/backend-<version>.zip` 和 `dist/artifacts.json`，版本取自 `studio.module.json`。

- 后端 ZIP 根目录有 manifest.json，其 moduleKey、version、entry 与代码匹配，starter 默认入口为 `dist/index.mjs`。
- 前端 ZIP 保留完整资源及相对路径，entry 指向 ESM 入口。
- 源码提交并推送后记录真实 Git SHA，随上传和发布清单关联；同版本对应确定的产物内容。

调用 `prepare_upload`，按返回地址 PUT ZIP，再 `complete_upload` 核验内容。上传登记候选产物，候选 entryUrl 可用于前端预览。

## 激活与回读

`prepare_release` 关联配置 revision、源码 SHA 和产物 IDs。核对用户授权覆盖的模块、环境和清单，再 `execute_release`，持续查询 `get_release_status` 直至终态。

发布按配置/后端 → 前端执行，分步结果分别核验。失败或断线先查原 releaseId 的已完成步骤，按实际状态恢复。成功后回读正式配置、运行产物及真实项目业务结果。生产按团队审核和发布流程执行。

## dev 到 prod 的审核候选

prod 只读账号使用 `read` 和对应的 OAuth scope。准备上线候选需要目标端单独授予模块 `candidate` 权限、客户端 OAuth 授权包含 `studio:candidate`。目标端这项授权只用于有签名来源且受审核的候选；常规 `apply_drafts` 在开发环境按 `draft` 权限执行。

1. 在两端通过只读工具 `inspect_module_versions` 核对 environment、publishedRevision、fileCount、desktopVersion、mobileVersion，以及 backend 的版本和 checksum。在 dev 用 `export_promotion_source` 获取该模块已发布定义和本次选定的已上线产物元数据。保留返回的完整 `{manifest, signature, files}`，记录源环境、模块、源码提交、选定配置路径与产物校验值。
2. 在 prod 用 `export_configs` 分别读取目标 draft 与 published revision。对照生产正式配置与现存草稿，向用户展示计划覆盖的具体路径。配置和产物均无差异时报告已一致，结束操作。涉及产物时，以本次源产物及目标端校验过的上传 ID 为据；保留版本和校验值，不能把 dev ID 当作 prod ID。
3. 使用 prod 的 `prepare_promotion_candidate({moduleKey, environment, source, targetPublishedRevision, targetDraftRevision, paths, artifactIds})`。其中 `source` 原样使用上一步 dev 返回的完整签名来源，两个 revision 取自当前目标端，`paths` 是本次选定的配置路径，`artifactIds` 是本次关联的目标上传产物 ID。目标发生变更时重新读取、比较并处理冲突。基线、权限或签名校验失败时保留错误原因。
4. 使用 prod 的 `get_promotion_candidate` 回读候选和服务端返回的审核地址（Studio 路由为 `/biz/platform/develop/promotion-review?moduleKey=…&candidateId=…`）。向维护者提供候选 ID、配置清单、产物版本与审核链接。生产审核及执行在该页面由授权人完成。重试或中断后先查询原候选。
