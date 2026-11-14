# Nebulix Studio

在 Codex 中维护 Nebulix 模块的表、字典、菜单、前端页面、后端扩展与大屏，通过 Chrome 联调，发布开发版本，并为生产上线准备审核候选。

安装标识为 `nebulix-studio@wuyaotech`。SaaS 版使用 `nebulix-studio` 连接 dev，使用 `nebulix-studio-prod` 连接 prod。各环境独立使用个人账号完成浏览器 OAuth 登录，再用 `get_context` 核对部署环境和所需能力。[安装和权限说明](../../README.md)

插件组成：

- `.codex-plugin/plugin.json`：插件身份、版本和展示信息。
- `.mcp.json`：SaaS dev 和 prod 的 HTTP MCP 端点。
- `skills/studio-develop/SKILL.md`：业务开发、源码维护、配置与发布流程。
- `skills/studio-develop/references/workflow.md`：配置和产物契约。
- `skills/studio-develop/references/unified-development.md`：公共开发任务、大屏候选审核、Studio 数据绑定和 Chrome 精确页面控制。0.2.1 新增，须由目标服务开放对应能力；插件更新不会启用生产试点或扩大权限。
- `skills/studio-develop/scripts/dashboard-workspace.mjs`：0.3.0 候选新增完整大屏工作包的独立文件下载、解包、打包和上传工具；不依赖平台主仓。
- `skills/studio-develop/references/blackhole.md`：黑洞场景、前后端通用 HTTP、连接凭据、能力检测、独立模块升级与真实宿主联调。
- `skills/mobile-h5-develop/`：客户仓移动 H5 技能、模块/业务/API/发布参考、安全初始化脚本及随包独立 starter/SDK。

在对应连接上调用 `get_context`、`list_modules`，选择模块并检查关联 Git 仓库、草稿和已发布版本。日常开发调试走 dev。只有生产有定义时，从 prod 导出已发布配置，在 dev 对照差异后初始化。开发版本验证通过后，可向支持该能力的 prod 服务提交审核候选，维护者在 Studio 审核执行。[跨环境配置与上线候选](skills/studio-develop/SKILL.md#跨环境配置与上线候选)

`0.1.2` 增加本地前端与云端 dev 联调指引：已有模块源码仓库时，先读其 `docs/local-dev.md` 与脚本，不要求先连通 Studio MCP 才能运行本地前端。是否支持联调、运行命令和数据来源以模块实现为准。插件与业务代码需要分别更新；广州水投的启动提示词见[团队仓库首页](../../README.md#广州水投本地联调)。

Git 提交、DB 草稿、构建产物上传、线上激活、业务验收分别记录。需要发布时，明确模块、环境和本次变更范围；操作授权按技能与团队规则执行。

`0.3.0` 候选补齐完整大屏编辑器与文件工作区指引，保留现有 dev/prod 连接和模块本地联调。平台部署、真实本地/云空间验收及本机插件更新仍为 pending，详见 [0.3.0 候选记录](../../docs/dashboard-unified-0.3.0.md)。

`0.1.4` 对应 starter 1.3.0 与前后端 `httpVersion=1`：按黑洞文档使用通用 request，或取得 token/engineProjectUuid 后原生 fetch。原场景与查询封装保留为便利 API；token 是共享引擎账号凭据，不是逐项目权限 token，通用请求不承诺任意接口逐资源隔离。写请求按业务授权执行，不复制口令或持久化 token。

团队 main 包含本版后，即可从既有来源更新并检查实际平台能力，已有模块比较合并 starter 类型、适配文件和示例。插件更新不部署平台、不覆盖业务仓库、不新增项目权限。版本和验收方式见 [0.1.4 记录](../../docs/blackhole-0.1.4.md)，此前发布见 [0.1.3 记录](../../docs/blackhole-0.1.3.md)。

`0.1.5` 增加 [mobile-h5-develop](skills/mobile-h5-develop/SKILL.md)。PM 不需要平台主仓，技能会从自身 `assets/starter/` 将通用 H5、SDK 和锁文件复制到客户仓的新 `h5-app/`。HLSCS 为首个接入对象，通用示例不冒充真实业务。代码维护首页/导航/模块来源；业务 Studio DB 真相源保持。当前服务是否支持 mobile target 要实时探测，插件不声明专用 mobile MCP 工具。验证记录见 [0.1.5](../../docs/mobile-h5-0.1.5.md)。

## 其他部署

维护者可为私有部署生成独立副本，输出必须是新目录：

```sh
node plugins/nebulix-studio/scripts/package-plugin.mjs --service-url https://your-nebulix.example/api --output /path/to/new-plugin-directory
```

`--service-url` 是该部署的 API 基础地址，脚本追加 `/mcp/studio`，生成只含一个 `nebulix-studio` 连接的私有包。先确认部署支持 Studio MCP 和 OAuth。凭据通过客户端登录提供。
