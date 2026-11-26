# Nebulix Studio

在 Codex 中维护 Nebulix 模块的表、字典、菜单、前端页面、后端扩展与大屏，连接 dev 宿主联调，发布开发版本，并为生产上线准备审核候选。

安装标识为 `nebulix-studio@wuyaotech`。SaaS 版使用 `nebulix-studio` 连接 dev，使用 `nebulix-studio-prod` 连接 prod。各环境独立使用个人账号完成浏览器 OAuth 登录，再用 `get_context` 核对部署环境和所需能力。[安装和权限说明](../../README.md)

## 技能入口

| 技能 | 适用任务 |
| --- | --- |
| [studio-develop](skills/studio-develop/SKILL.md) | 修改模块的表、字典、菜单、PC 页面或 API，管理模块草稿、产物与发布 |
| [studio-local-dev](skills/studio-local-dev/SKILL.md) | 启动、检查和停止本地前端联调，验证 dev 已激活的后端变更 |
| [studio-dashboard-develop](skills/studio-dashboard-develop/SKILL.md) | 连接大屏编辑器，修改实时画布、工作包和 Studio 数据绑定，通过编辑器保存或发布 |
| [mobile-h5-develop](skills/mobile-h5-develop/SKILL.md) | 在客户仓开发独立移动 H5，使用随包 starter 和 SDK |

**0.3.8** 前端联调按模块仓说明使用宿主联调页，并沿用用户选择的浏览器。模块启动器提供本机入口，宿主检查模块读取权限。启动和验收见 [studio-local-dev](skills/studio-local-dev/SKILL.md#前端联调)。

**0.3.7** 将业务模块、本地联调和大屏开发拆成独立技能。移动 H5 继续作为独立入口，四个技能随同一个插件交付。`studio-develop` 保留旧提示词的联调和大屏转接。

涉及模块配置或发布时，在对应连接上调用 `get_context` 和 `list_modules`，选择模块并检查关联 Git 仓库、草稿和已发布版本。日常开发调试走 dev。只有生产有定义时，从 prod 导出已发布配置，在 dev 对照差异后初始化。开发版本验证通过后，可向支持该能力的 prod 服务提交审核候选，维护者在 Studio 审核执行。[跨环境配置与上线候选](skills/studio-develop/SKILL.md#跨环境配置与上线候选)

Git 提交、DB 草稿、构建产物上传、线上激活、业务验收分别记录。需要发布时，明确模块、环境和本次变更范围；操作授权按技能与团队规则执行。

**0.3.5** 优先复用已有模块 Git 仓和现有认证。代码发布前用发布回执或 CI 构建记录核对运行版本。普通 MCP 发布使用 Studio 产物与发布授权。[运行版本核对流程](skills/studio-develop/references/workflow.md#核对目标环境的运行版本)

**0.3.4** 将表与配置、API 与 Hook、PC 前端技术和宿主集成整理成按需查阅的开发指引，并合并本机仓库复用与托管 Git 授权的说明。[Studio 开发指引](skills/studio-develop/SKILL.md#修改配置和代码)

**0.3.3** 增加[托管模块源码](skills/studio-develop/references/local-source.md)：平台账号按模块授权，通过独立凭据助手使用 GitHub App 的单仓库临时读写凭据，不要求开发者 GitHub 账号。MCP 只返回仓库元数据，授权网页使用正常平台登录；Windows 本机平台会话经 DPAPI 加密保存，GitHub token 不写盘。继续复用已登记工程，普通 Git、运行、构建及发布流程保持独立。源码权限与配置、发布权限分开；云空间完整源码执行器及团队分发另行验收。

源码 **0.3.2** 增加[本地仓库复用](skills/studio-develop/references/local-source.md)：新对话核对当前项目和持久登记中的真实 Git 仓库，复用已有目录；多个候选、失效目录及协作占用明确返回，只有完整有限查找无匹配才考虑正常 clone。随包 `local-workspaces.mjs` 支持查询、核验、登记和协作占用，不执行 Git 写操作或删除源码。登记存放在本机 CODEX_HOME 下独立 plugin-data 目录，插件升级不清空。MCP 地址、OAuth 和平台发布流程保持现有契约；本版本不代表云空间已经具备完整源码运行能力。团队分发与本机安装另行核验。

`0.3.1` 当前源码指引统一本地与云空间的实时画布工作流：先连接编辑器，通过 editor read/apply/import 读取和修改；完整包公开导出仅 `source=editor`。保存发布分别使用本地 `browser_execute(action=click)`／云空间 `browser_click`，参数为最新页面状态中的真实 ref，点击后还须回读状态和版本。后端大屏候选保存发布及无浏览器 artifact 保存路径退出公开工具；普通页面 API、独立数据、文档和参考能力保留。通用页面控制按 browser 授权与网页业务权限执行，不宣称逐按钮检查 dashboard:publish scope。dev/prod 两连接、模块联调和移动 H5 技能保持原样；分发、安装和平台部署分别验收，不因源码升级宣称已经上线。

`0.3.0` 候选补齐完整大屏编辑器与文件工作区指引，保留现有 dev/prod 连接和模块本地联调。平台部署、真实本地/云空间验收及本机插件更新仍为 pending，详见 [0.3.0 候选记录](../../docs/dashboard-unified-0.3.0.md)。

以上 `0.3.0` 段落是当时的候选记录；当前操作以插件清单版本、技能指引和连接实际能力为准。

`0.1.4` 对应 starter 1.3.0 与前后端 `httpVersion=1`：按黑洞文档使用通用 request，或取得 token/engineProjectUuid 后原生 fetch。原场景与查询封装保留为便利 API；token 是共享引擎账号凭据，不是逐项目权限 token，通用请求不承诺任意接口逐资源隔离。写请求按业务授权执行，不复制口令或持久化 token。

团队 main 包含本版后，即可从既有来源更新并检查实际平台能力，已有模块比较合并 starter 类型、适配文件和示例。插件更新不部署平台、不覆盖业务仓库、不新增项目权限。版本和验收方式见 [0.1.4 记录](../../docs/blackhole-0.1.4.md)，此前发布见 [0.1.3 记录](../../docs/blackhole-0.1.3.md)。

`0.1.5` 增加 [mobile-h5-develop](skills/mobile-h5-develop/SKILL.md)。PM 不需要平台主仓，技能会从自身 `assets/starter/` 将通用 H5、SDK 和锁文件复制到客户仓的新 `h5-app/`。HLSCS 为首个接入对象，通用示例不冒充真实业务。代码维护首页/导航/模块来源；业务 Studio DB 真相源保持。当前服务是否支持 mobile target 要实时探测，插件不声明专用 mobile MCP 工具。验证记录见 [0.1.5](../../docs/mobile-h5-0.1.5.md)。

## 其他部署

维护者可为私有部署生成独立副本，输出必须是新目录：

```sh
node plugins/nebulix-studio/scripts/package-plugin.mjs --service-url https://your-nebulix.example/api --output /path/to/new-plugin-directory
```

`--service-url` 是该部署的 API 基础地址，脚本追加 `/mcp/studio`，生成只含一个 `nebulix-studio` 连接的私有包。先确认部署支持 Studio MCP 和 OAuth。凭据通过客户端登录提供。
