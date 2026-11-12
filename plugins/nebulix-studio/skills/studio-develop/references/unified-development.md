# 统一开发入口

仅在服务端提供 `development_get_context` 时使用。关闭试点开关的部署保留原 Studio 工具；不要尝试补造 taskUuid 或空间身份。新能力共用 `/mcp/studio` 登录，旧 OAuth 没有大屏或浏览器 scope 时通过客户端重新授权。

1. `development_get_context` 读取真实环境和资源。只选择用户本次工作涉及的模块与大屏。`development_session_create` 建立可跨任务复用的本地会话，`development_task_begin` 明确资源。requestId 使用 UUID，原请求重试沿用原值。
2. 会话承载浏览器连接，任务承载本轮权限。长任务到期前 `development_task_renew`；结束或取消本轮用 `development_task_cancel`。任务取消不删除已有空间、文件或对话。
3. `dashboard_read` 返回 baseVersion、完整稿 schemaDigest 与可编辑投影。投影中未包含的字段仍保存在平台，禁止用投影重建整份大屏。
4. `dashboard_preview_patch` 只生成不可变候选和 reviewUrl。用户在该页面批准具体候选后，以原 reviewUuid 和稳定 operationId 调用 `dashboard_apply_patch`。这是服务端强制的候选审核，不能通过其他请求冒充用户批准。
5. 发布先 `dashboard_prepare_publish`，批准后 `dashboard_publish`。版本或摘要冲突须重读、重新生成候选；不能强制覆盖。保存与发布是独立操作，保存成功不代表已发布。
6. 保存/发布超时先 `development_get_operation`；没有完成回执不能宣称失败或成功，也不要换 operationId 重放。`dashboard_get_review` 可读取候选状态。
7. 恢复先用 `dashboard_prepare_restore` 引用本账号曾执行的 sourceReviewUuid，服务端读取该次保存前完整基线；批准候选后仍用 `dashboard_apply_patch` 保存新草稿，再按需求单独审核发布。

## 业务数据

- `dashboard_data_sources` 仅返回部署方登记且当前账号有权读取的正式表和只读 API；不能添加任意 URL、SQL 或借用空间的其他项目。
- `dashboard_preview_binding` 为指定 nodePath 生成待审核的数据绑定：`sourceType: studio`，明确 moduleKey、tableKey/apiKey、schemaHash、fields、filters、view。rows 绑定 Table，`fieldMapping.columns` 必须明确；count 绑定 Text。
- `dashboard_data_query` 按已保存的大屏、target、version、nodePath 读取数据。业务权限独立于模块开发权限；无权限不能用静态假数充当接入成功。
- `dashboard_migration_candidates` 只分析旧 spaceData，必须核验原 space/resource/schemaHash 和实际项目。将返回的建议逐项生成审核候选，不批量猜测迁移；旧历史不回写。

## Chrome 联调

`browser_open_page` 登记明确的业务 URL，`browser_connect` 返回一次性配对票据，用户通过开发助手连接。只用 `browser_targets` 返回的 targetUuid 执行 `browser_execute`，不能按活动标签推测目标。公开部署页面由已登录页面证明身份；localhost 必须显式端口并配置返回的一次性 challenge 桥。

命令明确 taskUuid、targetUuid、requestId、action、args。支持读页面、点击、填充、选择、等待、控制台、请求摘要和截图。通过 `browser_get_operation` 查结果；`requires_review` 是结果不明，先人工核查页面实际状态，禁止自动重放。页面跳转、重载、换任务接管或暂停都会使旧租约失效，需要重新读取目标。

联调使用用户授权的业务记录；材料与巡检只是示例，不是每次开发必须创建的模块或验收数据。
