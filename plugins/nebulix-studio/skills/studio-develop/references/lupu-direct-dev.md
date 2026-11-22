# 卢浦大桥 dev 联调

在卢浦大桥源码仓库打开 Codex，输入「启动 dev 联调」。启动器打开专用 Chrome 窗口，使用 Nebulix 云端 dev 的登录、项目权限和菜单。卢浦大桥前端从当前仓库读取。保存源码后，在该标签页正常刷新，启动器会重新覆盖清单。

## 启动要求

- 使用 Windows、已安装的 Google Chrome 和 Node.js 20.19 或以上版本。启动器会查找本机的 Chrome 安装。
- 拉取卢浦大桥仓库的 draft 分支，使用包含 LUPU_CLOUD_DEV_REMOTE 联调开关的检出。
- 首次启动如缺少依赖，启动器会按模块锁文件运行 `npm ci`，需要 npm 仓库网络可达。
- 使用自己有目标项目访问权限的 dev 账号。首次在专用 Chrome 窗口正常登录。Chrome 如提示云端 dev 页面访问本地网络，请按浏览器界面授权该站点。后续启动复用这个独立配置中的登录状态。

## 命令和检查

使用当前插件技能目录以及模块仓库的绝对路径。

```powershell
node "<技能目录>/scripts/lupu-dev.mjs" start --repo "<仓库绝对路径>"
node "<技能目录>/scripts/lupu-dev.mjs" status --repo "<仓库绝对路径>"
node "<技能目录>/scripts/lupu-dev.mjs" stop --repo "<仓库绝对路径>"
```

启动器自动设置 `LUPU_CLOUD_DEV_REMOTE=1`，在打开 Chrome 前校验本地模块是否接受云端 dev 来源。打开 dev 首页后，用自己的账号从真实项目菜单进入卢浦大桥，保存源码后刷新页面，核对本地改动。联调持续到关闭专用 Chrome 窗口或运行 `stop`。再次运行 `start` 可继续使用专用配置。

启动器经本机 Chrome 的 CDP 管道接入，联调会话可在 Codex 本轮结束后继续。不要用 `@Chrome` 的临时浏览器会话维持联调，也不要向浏览器、仓库或日志复制令牌和登录信息。

用 `status` 核对当前仓库与联调状态。启动就绪表示清单已替换。`localEntry` 为 `loaded` 时，表示浏览器已取得本地模块入口。模块入口缺失、来源校验失败、浏览器权限未授予或端口冲突时，应报告具体问题并确认本地模块确实加载后再继续。源码预览仍可按模块 README 启动。
