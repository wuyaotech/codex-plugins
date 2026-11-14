# 大屏统一开发插件 0.3.0 候选

本版把完整大屏文件工作区指引和独立文件辅助工具加入团队插件。版本号代表分发内容；平台 dev 部署、本地与云空间联调、用户电脑插件更新仍待验收，不能据此认为线上能力已经可用。生产未发布。

## 本次变更

- `studio-develop/references/unified-development.md` 增加完整 Schema、编辑器修订、工作包导入导出、产物上传、代码运行审核和保存回执流程。
- `studio-develop/scripts/dashboard-workspace.mjs` 提供一次性的 download、download-file、unpack、pack、upload。它使用 Node 内置模块，不依赖平台主仓，不启动新的 MCP 服务。
- 下载和解包只写新目录；打包拒绝覆盖已有输出、路径逃逸与符号链接，复核文件大小和 SHA256。受保护字段保留服务端标记；短期上传票据不进入 Git、Schema 或会话正文。
- SaaS dev/prod 两个 MCP 连接、独立 OAuth、移动 H5 starter、模块仓本地联调指引及私有部署打包方式沿用现有团队版本。

## 使用前核验

先用目标环境的 `development_get_context` 和实际工具目录核验能力。支持完整编辑的服务应提供 `dashboard_editor_read`、`dashboard_workspace_export` 等工具。旧 `dashboard_read` 返回的投影不能用于整版导入。

完整编辑器以 `editorInstanceId/editorRevision/editorDigest` 做并发检查；数据库草稿以 `baseVersion/schemaDigest` 做并发检查。两套基线分别保留。编辑、预览、保存、发布分别报告结果；无完整浏览器验收时明确说明。

代码与组件构建完成后，使用服务端的 `dashboard_code_prepare` 审核具体摘要，再按对应工具应用。`dashboard_component_preview` 在隔离 Runtime 中预览构建产物，不能将该预览视为真实编辑页运行许可。高级调试另需部署开关和 `dashboard:debug` 权限，先用 `dashboard_debug_access` 检查；旧 OAuth 授权不会自动扩大。

母版选择和共享截图可能等待用户操作，通过原交互标识查询完成、取消或失败。母版含新增代码时，结果可能是待审核候选；`applied:false` 不能报告已经应用。保存与发布仍采用完整候选审核及原操作回执，结果未知不换标识重放。

## 候选验证记录

- 团队仓从 `main@b4391f4` 创建独立候选分支，仅迁移平台本轮插件变更并增加分发说明。
- 文件辅助工具实现与平台候选字节一致；分发测试改用独立临时目录执行 CLI，不依赖平台仓的 Agent Kit 路径。
- `node scripts/validate.mjs` 通过，48 个移动 starter 文件校验一致；`node --test tests/*.test.mjs` 9/9 通过，覆盖现有移动 H5/私有部署流程及文件辅助工具。双环境端点不变，变更文件凭据模式扫描无发现。
- 平台 Service/Web dev 部署、真实本地/云空间完整流程、本机安装更新：**pending**。候选 PR 合并与用户安装在这些步骤完成后另行处理。

安装入口继续使用团队 `main`。本候选尚未合并时，现有安装不会自动取得 0.3.0；本文件不要求用户提前切换分支安装。
