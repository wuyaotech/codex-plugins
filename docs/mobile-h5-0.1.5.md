# 移动 H5 插件 0.1.5

本版让只有客户业务仓和团队插件的 PM Agent 开发移动 H5。基线为团队 `main@786cdb8dbb754d464ce6e899b7d6ae9eaa3fc34e` 的 0.1.4，保留已有本地联调与黑洞接入内容。

## 交付

- `mobile-h5-develop` 技能：客户仓开发、正常登录、本地模块/独立 ESM、HLSCS 接入及实际能力探测后的 Studio mobile target 发布。
- `assets/starter/`：通用 H5 源码、vendor mobile SDK、固定 npm 依赖/锁文件、构建与本地开发工具。示例业务不冒充 HLSCS 已有 API。
- `scripts/init-h5.mjs`：只创建不存在的目标目录，拒绝模板符号链接和生成/私有目录，不覆盖已有客户源码。
- 现有 `studio-develop` 增加移动任务入口；dev MCP 地址、市场标识与认证策略不变。

本版没有另建应用管理站点、应用 JSON DB 或独立组合发布服务。现有业务 Studio DB 真相源保持。发布 mobile 必须实时检查服务端 features 和工具 schema；完整 H5、ESM 模块、三端壳分别交付。

## 验证方法

维护者准备后执行：

```sh
node scripts/validate.mjs
node --test tests/mobile-h5-init.test.mjs
```

独立前向验收只给 Agent 客户仓和插件，不提供 Nebulix 主仓：

1. 用新目录 clone 客户仓，读取其 AGENTS/README，保留现有代码。
2. 按技能从插件资产创建新的 `h5-app/`；确认 README、SDK、package.json、锁文件均在客户目录内。
3. 在没有主仓 node_modules 的目录执行 `npm ci`、typecheck、build，并启动本地 HTTP 服务。
4. 请求 H5 根入口、共享运行时、源码模块和只读环境接口，确认管理 API 不存在；修改一个本地页面后重建并回读产物。
5. 新建隔离 Codex 配置目录，仅对子进程指定；从本地市场安装候选插件，回读版本、启用状态及技能/资产文件。原用户配置和旧 personal 插件保持。
6. 真人账号、实际企业/项目权限、云端发布及手机/三端能力分别记录，不能用公共接口、预览数据或受控替身代替。

## 本地准备状态

当前变更尚未推送团队 main，不能向同事宣称升级已生效。

| 检查 | 结果 |
| --- | --- |
| 技能 quick_validate | 已通过（Windows 使用 Python `-X utf8`） |
| 初始化复制/禁止覆盖/目录与符号链接保护 | 4 项通过 |
| 团队 manifest/技能/路径/MCP 校验 | 已通过 |
| 独立 starter 依赖安装/构建/启动 | 从已安装插件缓存初始化；npm ci、typecheck、build、29 项测试通过；修改标题后重建并回读成功 |
| 独立 Agent 前向验证 | 仅插件与新空白客户目录，安装/构建/29测、IAB 页面、标题修改/watch/刷新及进度导航通过；控制台无 warn/error；测试服务已停 |
| 隔离 Codex 配置目录安装候选版 | Codex CLI 0.162.0-alpha.17.2，本地市场安装 0.1.5，installed/enabled=true；原用户 config.toml SHA256 不变 |
| 真人账号登录、业务授权、远端发布 | 未执行 |

HTTP 验证：首页、`/runtime/react.js`、`/runtime/sdk.js`、`/modules/schedule/entry.js`、`/__mobile/environment` 均 200，旧 `/__mobile/apps` 为 404。独立验证服务使用随机端口，已停止，未占用常用 5518。

前向验证尝试 clone 真实 HLSCS 仓两次，均在本机 Git 初始化 `.git/config` 时失败，尚未到远端连接。后续采用空白客户目录，因此本记录不宣称真实 HLSCS 干净 clone、业务接入或账号权限已验收。具体 HLSCS 功能由客户仓自身验收记录承担。

独立验证发现并修正了模板说明中的主仓相对路径残留、引用不存在源码的构建示例，以及 PowerShell 下 npm 包装器吞掉 `--version` 的歧义；独立模块示例改为直接调用 Node CLI 和现存示例文件。模板 receipt 的文件哈希按分发字节校验，Git 属性保护快照换行不被隐式转换。

## 团队更新

审核合并到私仓 `main` 后，同事使用：

```sh
codex plugin marketplace upgrade wuyaotech
codex plugin add nebulix-studio@wuyaotech
codex plugin list --marketplace wuyaotech
```

重启客户端并开启新对话，确认实际安装为 0.1.5、能发现 `mobile-h5-develop`。插件仓 Read、客户源码仓权限、Nebulix OAuth/模块发布权限相互独立。插件升级不自动改写已复制到客户仓的 H5 或 SDK。

打包布局保持现有 Codex 兼容格式；格式与路径依据 [OpenAI 插件文档](https://developers.openai.com/plugins/build/plugins)，命令同时以本机 CLI help 核对。本次没有更改连接环境、生产配置、GitHub 权限或原用户 Codex 配置。
