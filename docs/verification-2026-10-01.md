# 团队插件分发验收（2026-10-01）

## 交付

- 私有仓库：`wuyaotech/codex-plugins`，默认分支 `main`。
- 市场：`wuyaotech`，显示名 `WuyaoTech 团队插件`。
- 首版插件：`nebulix-studio@wuyaotech`，版本 `0.1.1`。
- 初始内容提交：`aa75697668629685c37d7bdeac7f594e2ab6796f`。
- MCP：`https://nebulix-web-dev.wuyaotech.com/api/mcp/studio`。

## 已验证

在 Windows 上使用 `codex-cli 0.159.2`，为测试子进程设置全新的独立 Codex 配置目录，不复用原 Codex OAuth 配置；Git 拉取使用维护者已有的 GitHub 访问权限。

1. 从真实 GitHub 地址执行 `codex plugin marketplace add wuyaotech/codex-plugins --ref main --json`，返回 `marketplaceName=wuyaotech`、`alreadyAdded=false`。
2. 执行 `codex plugin add nebulix-studio@wuyaotech --json`，返回版本 `0.1.1` 和安装缓存路径。
3. `codex plugin list --marketplace wuyaotech --json` 回读 `installed=true`、`enabled=true`、Git 市场源为本仓库。
4. `codex plugin marketplace upgrade wuyaotech --json` 返回空错误列表；再次安装成功。
5. 对 GitHub 拉取的市场副本执行 `node scripts/validate.mjs` 通过。索引、插件 manifest、技能、路径和无凭据 HTTPS MCP 配置均通过校验。
6. 安装缓存与工作目录的 `studio-develop/SKILL.md` SHA256 一致：`e29678111228ca0e20d9e6ab73839be02fe2bb17e15f19a0e437fe027ead1c18`。
7. GitHub 回读为 `PRIVATE`、默认分支 `main`，远端分支与初始内容提交一致。
8. 原 Codex 用户配置在测试前后 SHA256 不变；未替换原 `personal` 插件。
9. dev MCP 入口未携带凭据的 HTTP 请求返回 `401`，说明需要登录；此检查不代表业务工具已完成登录验收。

## 验收范围

本次验证了同机独立配置目录从远端市场安装、启用、刷新及文件一致性。未冒充其他同事完成其 GitHub 访问、Nebulix OAuth、模块发布授权或业务操作。每位使用者仍需使用自己的账号登录。

本仓库提供本地校验命令，未配置 GitHub Actions。未更改 Nebulix 服务端、模块数据或生产环境。
