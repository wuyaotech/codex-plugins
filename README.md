# WuyaoTech 团队插件

WuyaoTech 维护的公开 Codex 插件源，通过 Git 分发。任何人都可以读取本仓库并安装插件，无需 GitHub 账号或仓库授权；使用 Nebulix 服务仍需自己的账号及相应模块权限。

| 插件 | 标识 | 默认连接 |
| --- | --- | --- |
| [Nebulix Studio](plugins/nebulix-studio/README.md) | `nebulix-studio@wuyaotech` | Nebulix dev |

## 同事安装

准备支持 `codex plugin` 命令的 Codex 客户端和 Git，并确保网络可以访问 GitHub。安装和更新本插件无需申请仓库 Read 权限；后续开发涉及的业务源码仓库仍按各自权限管理。

在终端运行：

```sh
codex plugin marketplace add wuyaotech/codex-plugins --ref main
codex plugin add nebulix-studio@wuyaotech
```

安装后重启 Codex 桌面应用，在插件列表确认 Nebulix Studio 已启用，再开新对话。按照客户端提示打开浏览器，用自己的 Nebulix 账号登录并授权。插件连接地址为：

```text
https://nebulix-web-dev.wuyaotech.com/api/mcp/studio
```

若客户端支持添加市场但没有 `codex plugin add`，添加市场后重启桌面应用，在插件目录选择 **WuyaoTech 团队插件**，安装 **Nebulix Studio**。若完全没有 `codex plugin` 命令，请先更新客户端。

拉取失败时，先确认浏览器能访问 [本仓库](https://github.com/wuyaotech/codex-plugins)，再检查 Git 是否安装、GitHub 网络连接和本机代理设置。公开插件源无需 GitHub 登录；私有业务源码仓库的访问授权应单独配置。

### 让 Codex 帮忙安装

可以把以下提示词直接发给 Codex：

```text
请按 https://github.com/wuyaotech/codex-plugins 的 README，帮我安装 Nebulix Studio 插件。
先检查 Codex 客户端是否支持 plugin 命令，以及 Git 和 GitHub 网络连接。
添加插件源：codex plugin marketplace add wuyaotech/codex-plugins --ref main
安装插件：codex plugin add nebulix-studio@wuyaotech
如果客户端没有 plugin add，添加市场后引导我在插件目录安装。
完成后提示我重启 Codex、确认插件已启用并开启新对话。
新对话中引导我用自己的 Nebulix 账号登录，检查当前账号及可访问模块。
```

### 新对话提示词

先验证接入及权限：

```text
使用 Nebulix Studio 插件和 studio-develop 技能。
先调用 get_context 和 list_modules，确认当前账号、dev 环境、可操作模块及权限。
我要维护 operations 运维模块，先核对模块关联的源码仓库和分支、当前草稿和已发布状态。
本轮只检查并汇报，不修改、不发布。不要假定模块只能是 mcp-demo，以工具返回权限为准。
```

后续提出具体业务需求，例如：

```text
继续使用 Nebulix Studio 插件，为 operations 模块的工单列表增加优先级筛选。
按 studio-develop 的流程检查配置和现有实现，完成本地修改、构建和预览。
说明改动范围与验证结果，本轮先不发布。
```

发布时明确授权模块、环境和范围，例如「将刚才确认的 operations 工单筛选改动发布到 dev，并验证线上结果」。

### 广州水投本地联调

从插件 `0.1.2` 起，技能会优先识别模块仓库提供的联调方式。**插件和业务源码仓库要分别更新**：更新本插件不会拉取 `wuyaotech/studio-gz-water`，拉取业务代码也不会更新插件。已安装同事先按下方“更新与移除”更新插件并重启客户端，再将以下提示词发给新对话：

```text
使用 Nebulix Studio 插件和 studio-develop 技能，维护 wuyaotech/studio-gz-water 的 gz-water 模块。
保留我的未提交修改，获取最新 draft，先读取 AGENTS.md、README.md、package.json 和 docs/local-dev.md。
使用本地前端 + 云端 dev 平台的联调方式。检查 Node >=22.13，按锁文件安装依赖，运行 npm run dev，打开本机工作台，我会自行登录 dev 账号。
验证企业菜单、本地模块加载和保存源码后的自动刷新。本轮只做本地开发，不发布、不建表；缺少联调脚本时报告当前分支和提交，不要另搭 demo。
若 Studio MCP 暂不可用，可以继续已知仓库的本地联调；配置和发布操作仍需恢复我的 MCP 登录与权限。
```

`gz-water` 默认入口是 `http://127.0.0.1:5199/biz/gz-water/workbench`，每个人都在自己的电脑启动、登录和访问；此地址不会打开别人的开发服务。Node 版本、端口和 `npm run dev` 是该模块的要求，其他模块以自身文档为准。`npm run preview` 是静态预览，不会提供相同的平台联调体验。

当前广州水投业务台账仍使用浏览器样例数据，本地与线上页面按 origin 分开存储；登录、成员、菜单和其他已接通的 API 使用真实 dev 数据，在本地入口执行这些 API 的写操作也会影响 dev。此流程不自动发布，也不要求数据库或 OSS 凭据。

### 黑洞场景与前后端通用 HTTP

插件 0.1.4 更新黑洞接入参考，配套 starter 1.3.0 和双端 `httpVersion=1`；场景渲染 v1 继续保留。团队源以 main 为安装入口，版本和验收方式见 [0.1.4 记录](docs/blackhole-0.1.4.md)。以下提示词适用于完成平台部署与插件更新后的新对话。

```text
使用 Nebulix Studio 插件和 studio-develop 技能。先检查我的模块权限、两端黑洞 httpVersion=1、当前模块 docs/blackhole.md 和 SDK 类型，不只根据 MCP capabilityVersion 判断。
保留原有代码，按黑洞文档使用通用 request，或通过 getConnection 取得 token/engineProjectUuid 后原生 fetch；Authorization 直接使用 token，不加 Bearer。
现有场景/查询封装只是便利 API，不是接口白名单；getLevels 按文档传 dataSetId，不要求先有 sceneId。需要渲染时复用 SceneView。
旧模块从新 starter 比较合并类型与适配文件，不覆盖全仓；token 只在内存使用。写请求按我授权的业务范围执行。
完成构建与真实 dev 宿主联调，分别说明 HTTP 状态、上游业务结果和各版本；本轮不发布生产。
```

已安装用户仍按下方既有更新流程操作，核验实际插件版本并开启新会话。主仓 Skill 修改、团队源发布、PM 实际安装更新是三项独立状态。共享引擎账号 token 不是逐项目权限 token，通用 HTTP 不承诺任意资源隔离；平台仍检查本人的模块与项目资格。旧宿主能力缺失时先升级平台，更新插件不会自动开通引擎。

### 安装与开发权限

- **插件仓库**：公开可读，安装和更新无需 GitHub 账号或仓库授权。
- **业务源码仓库**：各模块自己的 GitHub 读写权限，用来拉取、修改和推送业务代码。
- **Nebulix 服务**：自己的账号、模块访问及 dev 发布权限，由服务端返回。安装插件不会增加服务端权限；若看不到模块或不能发布，请让 Nebulix 管理员核对账号和模块授权。

插件包含操作技能和服务连接地址，不包含数据库、OSS、CI 或个人 OAuth 凭据，也不要求同事获得这些发布密钥。

### HLSCS 与客户移动 H5

`0.1.5` 增加 `mobile-h5-develop` 技能、完整通用 H5 starter 和随包 mobile SDK。PM 只需插件与客户模块源码仓，不需要 Nebulix 平台主仓；公开 npm 依赖仍需正常安装。已有 H5 直接维护，没有时由技能脚本创建新的 `h5-app/`，不会覆盖原文件。

更新插件后开启新对话，例如：

```text
使用 Nebulix Studio 插件的 mobile-h5-develop 技能，维护 HLSCS 的移动 H5。
当前只有客户模块仓，没有 Nebulix 平台主仓。保留我的未提交修改，先检查仓库说明与已有 h5-app。
没有 H5 时使用插件内的 starter 创建 h5-app，按锁文件安装、构建并启动，我用自己的 dev 账号登录。
首页、导航和模块组合在客户代码里维护，不要创建额外管理站点。本轮先完成本地开发与浏览器验证，报告真实 API 和示例数据的区别。
```

模板中的进度和现场日志是明确标记的示例，不代表 HLSCS 已有接口接入。真实业务从客户仓现行文档和 API 实现开始。完整 H5、可复用移动模块及原生壳分别交付；随包代码不包含三端壳，也不自动部署云端。mobile target 发布必须先检查服务 `get_context` 返回的真实能力，旧服务不能按 PC target 兜底上传。

客户仓中的 H5 是可独立维护的源码副本，插件更新不会覆盖它。插件 starter 版本、客户 SDK 版本和线上服务能力要分别核对。分发内容及本轮验收见 [0.1.5 记录](docs/mobile-h5-0.1.5.md)。

## 更新与移除

更新市场后重新安装插件，再重启客户端：

```sh
codex plugin marketplace upgrade wuyaotech
codex plugin add nebulix-studio@wuyaotech
```

查看安装状态：

```sh
codex plugin marketplace list
codex plugin list --marketplace wuyaotech
```

卸载：

```sh
codex plugin remove nebulix-studio@wuyaotech
codex plugin marketplace remove wuyaotech
```

若此前装过 `nebulix-studio@personal`，确认团队版本可以连接后，在插件设置中停用旧版本，避免同一服务重复出现。原个人版本不会被本仓库主动修改。

## 维护

此仓库维护团队分发版本。插件正文在 `plugins/nebulix-studio/`，市场索引在 `.agents/plugins/marketplace.json`。新增插件按同样布局添加目录和索引项；`source.path` 相对于仓库根目录。

修改插件时更新 `.codex-plugin/plugin.json` 中的版本号，运行以下校验后提交：

```sh
node scripts/validate.mjs
node --test tests/mobile-h5-init.test.mjs
```

`main` 是团队安装跟踪分支。修改连接环境属于影响所有安装者的变更，须明确说明；当前入口固定为 dev，生产不在本版默认范围内。技能、MCP 配置和市场索引应一起 review。凭据由用户的客户端与 Git 凭据管理器保存，不提交到仓库。

格式参考：[OpenAI 插件与团队市场文档](https://developers.openai.com/plugins/build/plugins)。

安装链路已用 Codex CLI 0.159.2 的独立配置目录验证，详见[分发验收记录](docs/verification-2026-10-01.md)。

## 移动 H5 整站发布（0.1.6）

0.1.6 随包提供 starter 0.3.0、SDK 0.1.0、build:site 和独立整站发布指引。PM 只用客户仓：检查并提交 H5 → 构建 ZIP → 插件上传 h5-site → 平台预检/激活/回读；回退复用历史站点 artifact。平台预先绑定域名和环境，PM 无需主仓、CI 或 OSS/FC 密钥。整站不发布 Studio 配置草稿，ESM mobile 模块仍走原独立路径。插件升级不会覆盖客户源码；服务能力需以 get_context.features.h5Sites 和实际工具 schema 为准。

## H5 ZIP 慢上行修复（0.1.7）

插件0.1.7将starter更新为0.3.1，整站ZIP使用标准DEFLATE压缩，保留CRC和原始大小，减少移动H5运行时的上传体积。PUT给予与网络匹配的超时，不确定时先核对上传/产物状态，完成校验后才激活。接口契约、SDK0.1.0和MCP连接保持原样；插件升级仍不覆盖客户工程。平台本轮development验证结果另见平台回执。
