# 本机源码开发

按“取得仓库信息 → 复用本地目录 → Git 授权 → 开发”接手模块源码。随包脚本使用 Node 20.19+ 和普通 Git。

## 1. 取得仓库信息

平台托管模块调用 `source_get_context({environment})` 查看可用模块，再调用 `source_get_repository({moduleKey,environment,permission:"read"|"write"})` 取得 `repositoryUrl`、`branch`、`directory`。拉取用 read，推送用 write；源码、配置和发布权限分别管理。

用户已指定的普通本地仓库任务直接使用其仓库信息和现有 Git 认证。以下平台授权步骤仅用于托管仓库。

## 2. 查找已有目录

```text
node "<技能目录>/scripts/local-workspaces.mjs" resolve --repository-url "<Git地址>" --context "<当前项目目录>" --directory "<模块目录>" --branch "<目标分支>" --owner "<本轮会话标识>"
```

脚本核对当前项目、持久登记、submodule 和已知 worktree，并读取实际 remote、分支及未提交修改。必要时追加 `--search-root "<已知项目父目录>"` 做有限浅层查找。参数以仓库信息为准，仓库根目录用 `.`。

| 返回状态 | 处理 |
| --- | --- |
| `found` | 使用 `selectedPath` 和 `modulePath`，核对实际分支、dirty 和占用 |
| `ambiguous` | 根据当前任务确定候选，或设置常用目录 |
| `busy` | 协调已有任务；并行开发确需隔离时使用独立 worktree |
| `unavailable` | 检查失效登记、remote 变化、目录访问或查找限额后重试 |
| `not_found` 且 `canClone=true` | 结合用户提供的目录信息确认查找范围，再 clone 到新的明确目录 |

分支不同、dirty 或被占用时，先处理已有工作。`canClone` 仅表示本次有限查找完成；失效登记和查找失败须先排查。切换分支、拉取及清理按当前任务和仓库约定执行，保留已有修改。

## 3. 连接托管仓库的 Git

开发者使用平台账号在浏览器确认授权，平台通过 GitHub App 提供单仓库临时读写凭据。`<service-url>` 使用当前 MCP 环境的 API 地址，例如 `https://nebulix-web-dev.wuyaotech.com/api`。

先查已有连接；缺少记录、会话过期或需变更读写权限时重新登录：

```text
node "<技能目录>/scripts/source-git-auth.mjs" status --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>"
node "<技能目录>/scripts/source-git-auth.mjs" login --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" --permission "<read或write>"
```

打开脚本输出的授权页，用本人平台账号登录，核对环境、模块、仓库和权限后确认。`status` 显示本机账号、仓库和有效期；服务端在每次申请 Git 凭据时复核权限。已有本机连接保持原授权身份，切换网页账号后需重新连接才能换用身份。

**已有仓库：** 核对 origin 与返回的仓库 URL 一致，再配置该仓库的凭据助手：

```text
node "<技能目录>/scripts/source-git-auth.mjs" configure --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" --path "<仓库根目录>"
```

助手仅配置该仓库精确 HTTPS URL 的凭据规则，并清空该 URL 继承的其他 helpers，使 Git 使用平台授权。之后使用普通 `git fetch`、`git pull`、`git push`。插件升级导致脚本路径变化时重新 configure。

**首次 clone：** 完成第 2 节查找后，使用助手返回的 Git 参数。PowerShell 示例：

```powershell
$sourceConnection = node "<技能目录>/scripts/source-git-auth.mjs" connection --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '源码授权不可用' }
$sourceGitOptions = @()
foreach ($entry in $sourceConnection.gitConfig) { $sourceGitOptions += '-c'; $sourceGitOptions += "$($entry[0])=$($entry[1])" }
git @sourceGitOptions clone --branch "<返回的分支>" $sourceConnection.repositoryUrl "<新目录>"
```

成功后对新目录执行 configure。托管授权使用精确的 `https://github.com/owner/repository`，凭据由助手交给 Git；认证失败时检查平台授权，保持这条认证链路，避免个人 GitHub 凭据掩盖权限问题。

## 4. 登记、开发和收尾

找到或克隆仓库后登记路径；常用目录加 `--preferred`，临时 worktree 保持普通登记。修改源码、安装依赖或启动可写进程前登记本轮占用：

```text
node "<技能目录>/scripts/local-workspaces.mjs" register --repository-url "<Git地址>" --path "<仓库根目录>"
node "<技能目录>/scripts/local-workspaces.mjs" claim --repository-url "<Git地址>" --path "<仓库根目录>" --owner "<本轮会话标识>"
```

会话标识使用客户端提供的稳定 ID，或本轮生成并持续复用的 UUID。claim 是协作标记，外部编辑器仍可写入；它持续保留到显式释放。遗留占用先确认旧任务及相关进程已结束，再协调释放。

读取仓库的 AGENTS、README、package.json 和锁文件，按项目说明安装、运行和构建。提交与推送按本次授权执行，模块发布走技能主流程。完成后释放自己的占用：

```text
node "<技能目录>/scripts/local-workspaces.mjs" release --repository-url "<Git地址>" --path "<仓库根目录>" --owner "<本轮会话标识>"
```

## 本机记录与维护

默认记录位于 `${CODEX_HOME}/plugin-data/nebulix-studio/`，未设置 CODEX_HOME 时使用用户 `.codex`，新聊天和插件升级继续复用：

| 位置 | 内容 |
| --- | --- |
| `workspaces.json` | 仓库路径、常用目录与协作占用 |
| `source-auth/` | 最多有效 30 天的平台 Git 会话；Windows 用当前用户 DPAPI 加密，其他系统使用本人可读文件 |

日常使用默认位置；隔离验收或迁移可指定 `--registry` / `--auth-dir`。GitHub 临时 token 仅用于 Git 传输，凭据保持在助手与服务端之间。

仓库移动后核对新路径并 register，释放自己的旧占用，再移除旧登记：

```text
node "<技能目录>/scripts/local-workspaces.mjs" list
node "<技能目录>/scripts/local-workspaces.mjs" forget --path "<旧仓库路径>"
```

forget 保留源码目录。登记损坏时保留原文件排查；写锁冲突先核对持有者。清理 worktree 前检查未提交、未跟踪内容和未推送提交，使用客户端或 Git 的正常清理流程。

退出平台 Git 连接：

```text
node "<技能目录>/scripts/source-git-auth.mjs" logout --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>"
```

logout 撤销本机会话并清除相应记录。平台撤权会阻止后续凭据签发，已签发的 GitHub token 到期前仍可能有效，已下载源码留在本机。仓库重绑、授权 revision 变化或会话过期后重新登录。
