# 本地仓库复用

适用于本地 Codex 开发已有 Git 模块。Git 操作仍由本机普通命令完成，MCP 提供仓库及模块上下文；本脚本只查找、核验和登记，不执行 clone、fetch、pull、checkout、reset、stash、push 或源码目录删除。云空间完整源码执行能力不由这个脚本提供。

## 新对话先定位

平台任务先用当前连接的 `get_context` / `list_modules` 核对权限，取得 `repositoryUrl`、`branch`、`directory`。用户已经指定的纯本地仓库任务可直接使用其仓库信息，不为本地查找强制恢复无关的 MCP 登录。

```text
node "<本技能目录>/scripts/local-workspaces.mjs" resolve --repository-url "<Git地址>" --context "<当前项目目录>" --directory "." --branch "draft" --owner "<本轮会话标识>"
```

参数值以实际模块元数据为准，`draft` 和 `.` 只是示例。脚本优先核对当前项目，查询持久登记，并查找项目已有 submodule、已知仓库的 worktree。必要时可重复传 `--search-root "<已知项目父目录>"` 做有限浅层查找；不默认遍历整块磁盘。真实 Git 状态每次重新读取，不用登记时的旧分支或旧 dirty 状态替代。

| 返回状态 | 下一步 |
| --- | --- |
| `found` | 使用 selectedPath 作为仓库根目录、modulePath 作为模块目录；检查实际分支、dirty 和占用后继续 |
| `ambiguous` | 比较候选与用户当前项目/任务；指定确切上下文或经确认设置常用目录，不按日期随意选择 |
| `busy` | 其他协作任务仍占用该目录；只读检查可以继续，源码修改需协调或采用适合本任务的独立 worktree |
| `unavailable` | 存在失效登记、remote 变化、模块目录问题或不完整查找；先定位原因，不据此新拉一份 |
| `not_found` 且 `canClone=true` | 在已检查范围未找到；结合用户给出的目录信息确认后，用普通 Git clone 到新的明确目录，再登记 |

`canClone` 不是授权或全盘不存在仓库的保证，只说明本次有限查找的结果。缺 Git、目录无法访问、登记损坏、查找限额或已登记仓库的 remote 不匹配都不能伪装成“本机没有仓库”。查找中遇到其他项目的不同 remote 则跳过，不能把宿主仓误认为模块源码。

发现有效已有仓库后登记；第一次建立常用目录时可用 `--preferred`。临时 worktree 通常不应替换常用目录。

```text
node "<本技能目录>/scripts/local-workspaces.mjs" register --repository-url "<Git地址>" --path "<仓库根目录>" --preferred
node "<本技能目录>/scripts/local-workspaces.mjs" list
```

Git 地址可以使用支持的 HTTPS/SSH 形式，匹配按主机与仓库路径归一；路径大小写和非默认端口有意义。不把包含 token、密码、查询参数或片段的 URL 写入登记。脚本不会通过联网证明私库权限，Git 的正常认证仍由本机管理。

## 分支、未提交修改和并行工作

MCP 返回的 branch 是目标/建议分支，不授权切换当前目录。先核对实际 HEAD、分支与未提交修改，决定继续现有工作还是准备独立任务目录。不自动 pull、stash、reset 或清理文件。即使 dirty=false，也不能据此认定没有其他程序正在使用该仓库。

准备在目录内修改、安装依赖或启动可写进程前，登记本轮占用。使用客户端提供的稳定会话标识；无法取得时，本轮生成一次任务 UUID 并复用，结果中保留该标识以便正常释放。

```text
node "<本技能目录>/scripts/local-workspaces.mjs" claim --repository-url "<Git地址>" --path "<仓库根目录>" --owner "<本轮会话标识>"
node "<本技能目录>/scripts/local-workspaces.mjs" release --repository-url "<Git地址>" --path "<仓库根目录>" --owner "<本轮会话标识>"
```

claim 是遵守该流程的 Agent 之间的协作标记，不能阻止外部编辑器或手动 Git。它不按时间自动过期，避免仍在运行的任务被接管；新对话不能冒用其他 owner 释放。遗留占用须先确认旧任务和相关进程已结束，再明确释放。登记文件的短时写锁与源码占用分开，不能删除未知锁文件来强行继续。

优先复用用户当前项目和适合当前任务的已有 worktree。只有并行分支/任务确实需要隔离时，才按客户端与仓库规则创建 worktree；有 `create_worktree` 时使用它。建立后重新核对并登记新目录。两份工作目录共享 Git 对象也仍需分别管理源码、依赖和开发进程。结束任务时释放本轮占用；清理 worktree 另行核对未提交、未跟踪内容与未推送提交，使用客户端正常归档/恢复机制，不由本脚本删除。

## 登记存放和失效处理

默认文件为 `${CODEX_HOME}/plugin-data/nebulix-studio/workspaces.json`；未设置 CODEX_HOME 时为用户主目录下 `.codex/plugin-data/nebulix-studio/workspaces.json`。它不在插件版本缓存或源码仓库中，新聊天和插件升级都可读取。`--registry "<文件>"` 可指定测试/迁移位置；日常使用默认位置，避免各对话各建一份。

登记只记录仓库标识、本机路径、常用目录和协作占用等本地信息，不登记 Git 凭据，不上传本机路径到平台。同一 Git 仓库可以供不同平台环境的源码任务复用，平台身份和发布目标仍须每次独立核对。

仓库移动后用新路径核验并 register，再移除失效旧登记；若脚本无法确定失效路径，先用 list 查看原登记。旧目录被本轮占用时，仍可用旧登记路径和自己的 owner 执行 release，无需恢复或修改源码。forget 只移除登记，保留磁盘文件，被占用的登记不能直接移除。

```text
node "<本技能目录>/scripts/local-workspaces.mjs" forget --path "<原登记的仓库根目录>"
```

registry 损坏时保留原文件并报告，不以空表覆盖。原子写入冲突返回明确错误，核对后可重试；不能因登记失败就换一个目录 clone。新仓库登记成功后，仍须读取实际 AGENTS、README、package.json 和锁文件，再安装、运行或构建。
