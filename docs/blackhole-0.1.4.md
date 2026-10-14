# Nebulix Studio 0.1.4 通用 HTTP 发布记录

日期：2026-10-14。本版基于团队 main `a2c17115` 开发，源码版本 0.1.4；合并 main 后具备仓库读取权限的同事可按首页流程更新。发布以远端 main 的版本和内容为准，关联 PR 保留提交及远端回读证据；本文不代表 PM 已安装或平台已部署。此前 0.1.3 的发布记录继续保留。

本版纠正把黑洞接入限制为固定读取操作的指引：前后端都可按黑洞文档使用通用 request，或取得平台管理的 token、engineProjectUuid 和地址后直接 fetch。既有场景和查询封装保留为便利 API。SDK、MCP dev 地址和市场索引不因插件更新而变更。

配套 starter 1.3.0；后端 `ctx.engineBh.httpVersion=1`，前端 `capabilities.engineBh.httpVersion=1` 与 `runtime.engineBh.getConnection/request`。已有模块需比较合并 adapter、类型、文档与 vendor，平台需独立部署该能力。

## 使用边界与示例

- token 是受信代码使用的共享引擎账号凭据，不是逐项目权限 token；通用 HTTP 不承诺任意接口逐资源隔离。
- 平台仍校验本人 Nebulix 项目/模块资格；资源选择和写操作按具体业务授权执行。
- 不复制引擎口令，不把 token 写入源码、持久存储或日志。Authorization 直接使用 token，不添加 Bearer。
- getLevels 路径为 `/blackHole3D/project/engine/v3/getLevels`，POST body 为 `{dataSetId}`，无需 sceneId。已有联调 HTTP 200 但业务返回“无效的pak文件”，不能当作楼层/房间业务成功。
- 通用 request 返回完整上游 JSON；原生 fetch 适用于业务自定义请求及 multipart/二进制，浏览器直连另验证 CORS/HTTPS/网络。

## 发布与 PM 验收

1. 平台双端能力、starter/vendor 和真实 HTTP 链路完成验收；保留具体接口的业务成功/失败记录。
2. 校验插件结构、文档与实际契约；按本次授权提交/推送并合并团队 main 后，读取远端版本与 reference 验证可获得性。
3. PM 从既有团队源更新到 0.1.4，开启新会话并核对实际安装版本、新参考和两端 httpVersion。
4. 使用本人项目进行前/后 request 与原生 fetch 联调，核对 HTTP 状态及业务响应。具体写接口以已授权的业务范围执行并回读，插件安装不扩大权限。

本地校验通过不等于团队源已发布；团队源发布不等于 PM 已安装，也不等于 getLevels 等具体业务数据已验收。

本地 `node scripts/validate.mjs` 与 `git diff --check` 已通过；主仓和团队插件 reference 内容一致。MCP dev 地址与市场索引无差异。
