# WuyaoTech 团队插件

wuyaotech 内部使用的 Codex 插件源。此仓库为私有仓库，通过 Git 分发；不是公开插件目录上架。

| 插件 | 标识 | 默认连接 |
| --- | --- | --- |
| [Nebulix Studio](plugins/nebulix-studio/README.md) | `nebulix-studio@wuyaotech` | Nebulix dev |

## 同事安装

准备支持 `codex plugin` 命令的 Codex 客户端、Git，以及可以读取本仓库的 GitHub 账号。管理员需给使用者或所在 GitHub 团队本仓库的 Read 权限。能访问业务模块仓库不代表自动拥有本插件仓库权限。

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

私有仓库拉取失败时，先确认浏览器能访问本仓库，再完成 GitHub 的 Git 身份认证。使用 GitHub CLI 的同事可执行 `gh auth login`、`gh auth setup-git`；也可以使用已配置好的 Git 凭据管理器。不要把访问令牌贴进聊天、仓库 URL 或配置文件。

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

### 三类独立权限

- **插件仓库**：GitHub Read 权限，用来安装和更新本插件。
- **业务源码仓库**：各模块自己的 GitHub 读写权限，用来拉取、修改和推送业务代码。
- **Nebulix 服务**：自己的账号、模块访问及 dev 发布权限，由服务端返回。安装插件不会增加服务端权限；若看不到模块或不能发布，请让 Nebulix 管理员核对账号和模块授权。

插件包含操作技能和服务连接地址，不包含数据库、OSS、CI 或个人 OAuth 凭据，也不要求同事获得这些发布密钥。

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
```

`main` 是团队安装跟踪分支。修改连接环境属于影响所有安装者的变更，须明确说明；当前入口固定为 dev，生产不在本版默认范围内。技能、MCP 配置和市场索引应一起 review。凭据由用户的客户端与 Git 凭据管理器保存，不提交到仓库。

格式参考：[OpenAI 插件与团队市场文档](https://developers.openai.com/plugins/build/plugins)。
