---
name: studio-local-dev
description: Start, inspect, troubleshoot, or stop Nebulix Studio module integration. Use when asked to 启动联调, load a local frontend in a SaaS or private dev host, run standalone preview, or verify an activated dev backend.
---

# Nebulix 模块本地联调

优先复用当前或已登记的模块 Git 仓。需要查找本机检出或办理源码授权时，按[本机源码开发](../studio-develop/references/local-source.md)处理。

- **自管 Git。** 客户自行 clone 的仓库直接复用。需要首次拉取或更新时，用已知仓库地址和已有 Git 认证执行普通 `git clone` 或 `git pull`。
- **Nebulix 托管 Git。** 优先复用已检出仓库和现有托管认证。需要发现托管仓库时，用 Studio MCP 查询模块的仓库地址、分支和目录。首次接入或托管认证失效时，通过 Git 凭据助手用本人平台账号授权，再用普通 Git 拉取。

两种来源都先查看 `AGENTS.md`、`README.md`、`studio.module.json`、`package.json` 和本地联调文档，核对模块、分支、未提交改动、Node 版本和脚本。已有源码时，本地启动可直接使用当前检出。查询 Studio 配置或执行发布时，按[业务模块开发](../studio-develop/SKILL.md)核对本人 MCP 授权。

## 前端联调

1. 确定模块和目标。主仓对话先定位模块子仓，在模块目录读取 `studio.module.json`、README 和 `package.json`。优先使用用户给出的开发或测试 Web 地址，保留协议、主机、端口和业务页面路径。未指定时使用模块文档的环境。用户只要独立预览时，按模块预览说明启动。
2. **目标宿主已开通本机模块联调、模块提供对应启动方式时，优先使用宿主联调页。** 按模块仓实际命令启动，例如仓库声明的 `npm run studio:dev`。依赖缺失时按锁文件安装。私有部署传入该仓支持的地址参数。模块为指定部署提供本机网关时，按该部署的模块文档启动并使用它输出的 Web 地址。由本轮负责占用时，先按[本机源码开发](../studio-develop/references/local-source.md)登记。端口冲突先核实归属。
3. 保持本机进程运行，使用启动器输出的实际配置。宿主 JSON 包含 `version: 1`、`moduleKey`、`devOrigin` 和 `entry`。核对模块标识、实际浏览器 origin 和本机回环 Remote 地址。用目标站点的 origin 检查入口返回 JavaScript 及匹配的 CORS。
4. 沿用用户选择的浏览器，Codex 内置浏览器可打开目标宿主的 `/development/local-module`。已有业务页时，将该站点内的原路径、查询和片段编码到 `returnTo`。使用有该模块 Studio `read` 权限的本人开发账号，粘贴 JSON 并点击「保存并刷新」。需要登录或批准访问本地网络时，交给用户完成。
5. 回到有权限的企业或项目页面，确认「联调」显示「已加载本机代码」并且页面实际渲染。有网络观测能力时，核对浏览器请求了本机 `entry`。加载失败时排查本机进程、浏览器回环权限、CORS 和宿主策略。宿主按浏览器站点和账号保留联调配置。停止时点「联调」→「退出联调」，确认恢复已发布入口，再停止自己启动的进程并释放自己的占用。

联调页提示无模块权限时，先核对当前网页账号的模块 `read` 授权。使用 Studio MCP 交叉检查时，通过同一环境的 `get_context`、`list_modules` 核对账号和权限。需要切换账号时，由用户登录已有授权的账号。

目标宿主尚未开通本机模块联调，或模块缺少本机 Remote 启动方式时，指出缺少的条件。独立预览按模块说明验证，并注明实际数据来源。联调中的真实业务 API 仍由目标 dev 处理。

## 后端联调

- 先按[后端开发指引](../studio-develop/references/backend.md#能力构建与验证)运行模块仓的测试和构建。有本地后端或测试夹具的模块，可以按仓库说明调用本机接口，记录实际使用的身份和数据来源。
- 用真实项目验证新版后端时，按[模块发布流程](../studio-develop/references/workflow.md)核对 dev 当前生效版本。新版产物经本次授权在 dev 激活并回读后，再用本人账号验证真实接口、页面和数据结果。连接真实 dev 宿主且本轮只做本地联调时，继续调用 dev 已激活的版本，并单独报告新版后端的本机测试结果。
