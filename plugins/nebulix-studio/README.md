# Nebulix Studio

在 Codex 中通过对话开发和维护 Nebulix 业务模块：表、字典、菜单、前端页面、模块后端扩展和 dev 发布。

安装标识：`nebulix-studio@wuyaotech`。当前团队版本连接 `https://nebulix-web-dev.wuyaotech.com/api/mcp/studio`，用个人 Nebulix 账号完成浏览器 OAuth 登录。安装和权限说明见[团队仓库首页](../../README.md)。

插件组成：

- `.codex-plugin/plugin.json`：插件身份、版本和展示信息。
- `.mcp.json`：dev 的远程 HTTP MCP 连接，不包含令牌。
- `skills/studio-develop/SKILL.md`：业务开发、源码维护、配置与发布流程。
- `skills/studio-develop/references/workflow.md`：配置和产物契约。

读取或修改平台配置、准备发布时，请让 Codex 调用 `get_context`、`list_modules`。选择模块后，再检查关联 Git 仓库、草稿、已发布版本。账号的模块和环境权限以服务端返回为准；安装本插件不会自动授予 `operations` 或其他模块的发布权限。

`0.1.2` 增加本地前端与云端 dev 联调指引：已有模块源码仓库时，先读其 `docs/local-dev.md` 与脚本，不要求先连通 Studio MCP 才能运行本地前端。是否支持联调、运行命令和数据来源以模块实现为准。插件与业务代码需要分别更新；广州水投的启动提示词见[团队仓库首页](../../README.md#广州水投本地联调)。

Git 提交、DB 草稿、构建产物上传、线上激活、业务验收分别记录。需要发布时，明确模块、环境和本次变更范围；操作授权按技能与团队规则执行。

## 其他部署

维护者可为私有部署生成独立副本，输出必须是新目录：

```sh
node plugins/nebulix-studio/scripts/package-plugin.mjs --service-url https://your-nebulix.example/api --output /path/to/new-plugin-directory
```

`--service-url` 是 API 基础地址，脚本自动追加 `/mcp/studio`。确认对应部署支持 Studio MCP 和 OAuth 后再分发。不要在 URL 中携带密码、查询令牌或其他凭据。
