# 托管模块源码

平台通过 GitHub App 管理私有仓库，开发者只需平台账号和模块源码权限，不要求 GitHub 账号。MCP 返回安全的仓库元数据；普通本地 Git 通过独立凭据助手取得单仓库临时权限。源码权限与配置、发布权限分开，拿到源码权限不代表可以改 DB 草稿或发布。

## 先找到仓库和已有目录

1. `source_get_context({environment})` 查看当前平台账号有源码权限的模块。
2. `source_get_repository({moduleKey,environment,permission:"read"|"write"})` 取得仓库 URL、分支、目录和权限。只读任务用 read；需要提交并推送时用 write。权限变更、仓库未准备好或环境不匹配时先解决平台状态，不猜地址或使用个人 GitHub 账号掩盖问题。
3. 按[本地仓库复用](local-workspaces.md)定位已有工程和本轮协作占用。新对话继续复用，授权登录不创建源码目录、不执行 clone。

## 授权本机 Git

脚本位于本技能 `scripts/source-git-auth.mjs`，只需 Node 20.19+ 和普通 Git。以下 `<service-url>` 必须使用当前 MCP 对应部署的 API 地址，例如 `https://nebulix-web-dev.wuyaotech.com/api`；不要混用 dev 和 prod。

先检查本机记录：

```text
node "<技能目录>/scripts/source-git-auth.mjs" status --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>"
```

status 只显示本机已授权账号、仓库与有效期，不证明当前远端权限仍有效。没有本机记录或记录过期时启动登录：

```text
node "<技能目录>/scripts/source-git-auth.mjs" login --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" --permission write
```

脚本输出授权页 URL 并等待。通过正常浏览器登录平台，核对账号、环境、模块、仓库和读写权限后确认；不要向用户索要密码，不读 Codex OAuth 内部存储。授权页可以切换账号，浏览器当前账号不会自动改写已经保存的本机 Git 身份。只有本次发起脚本持有的 PKCE verifier 和 device secret 能完成交换；URL 中 requestId 不是登录令牌。

成功后会话最多有效 30 天；平台只保存随机会话令牌的哈希。Windows 本机使用 DPAPI CurrentUser 加密持久化，其他系统使用本人可读文件（目录 0700、文件 0600）。默认存储在 `${CODEX_HOME}/plugin-data/nebulix-studio/source-auth/`，未设置时使用用户 `.codex`，不随插件版本目录清空。`--auth-dir` 仅用于明确的隔离验收或迁移。GitHub installation token 不写磁盘、Git remote、Git 配置、日志或 MCP 响应。

## 已有仓库

核实实际 origin 与元数据完全一致后，安装仓库本地、精确 URL 范围的 helper：

```text
node "<技能目录>/scripts/source-git-auth.mjs" configure --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" --path "<已有仓库路径>"
```

此命令只修改该仓库 `.git/config` 的该 URL credential 配置，启用 `useHttpPath=true` 并清空该 URL 继承的其他 helpers，避免个人 GCM 账号掩盖平台权限。其他仓库和全局 Git 配置不受影响。插件升级后 helper 路径改变，需对使用中的仓库重新 configure。

之后使用普通 `git fetch`、`git pull`、`git push`。不自动切分支、丢弃未提交变更或推送；继续按用户本次授权、仓库约定和协作占用执行。每次 Git 请求凭据都会重新校验平台用户、源码授权、环境、连接和仓库绑定；严格限定 `https`、`github.com`、精确 `owner/repository`。返回的 GitHub token 仅含这一个仓库的 contents read 或 write 及 metadata read，不能创建仓库。

## 首次 clone

只有本地复用检查允许 clone 时，使用 `connection` 获取无密钥的 Git 参数，作为本次普通 Git 命令的 `-c` 参数。不要把凭据嵌进 URL，不使用个人 GitHub 登录作为后备路径。

PowerShell 示例（变量均为当前实际值）：

```powershell
$sourceConnection = node "<技能目录>/scripts/source-git-auth.mjs" connection --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>" | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw '源码授权不可用' }
$sourceGitOptions = @()
foreach ($entry in $sourceConnection.gitConfig) { $sourceGitOptions += '-c'; $sourceGitOptions += "$($entry[0])=$($entry[1])" }
git @sourceGitOptions clone --branch "<返回的分支>" $sourceConnection.repositoryUrl "<已确认的新目录>"
```

clone 成功后执行 configure 并登记到 `local-workspaces.mjs`。不要把测试目录或每轮聊天作为自动 clone 理由。读取仓库实际 AGENTS、README、package.json 和锁文件，再安装依赖、运行和构建。平台发布仍走产物上传与发布清单，不把 Git push 当发布。

## 失效与退出

```text
node "<技能目录>/scripts/source-git-auth.mjs" logout --service-url "<service-url>" --module "<moduleKey>" --environment "<environment>"
```

logout 撤销本机平台会话并移除该条本机凭据，保留源码。平台管理员撤销源码授权后不能再换取 Git 凭据；已签发的 GitHub token 可能持续到其短期过期，已拉取的代码无法撤回。仓库重绑、授权 revision 变化或会话过期要求重新授权，不能退回使用个人 GCM。

此版本实现本地完整源码授权与普通 Git 工作流。云空间可以复用同一 source service 权限契约；本插件 helper 不等同于云空间已完成 shell、依赖安装、运行和预览执行器。
