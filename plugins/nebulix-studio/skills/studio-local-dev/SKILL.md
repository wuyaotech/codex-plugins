---
name: studio-local-dev
description: Start, inspect, troubleshoot, or stop Nebulix Studio module integration. Use for local frontend preview, integration with the cloud dev host, or verifying backend changes after dev activation.
---

# Nebulix 模块本地联调

优先复用当前或已登记的模块 Git 仓。需要查找本机检出或办理源码授权时，按[本机源码开发](../studio-develop/references/local-source.md)处理。

- **自管 Git。** 客户自行 clone 的仓库直接复用。需要首次拉取或更新时，用已知仓库地址和已有 Git 认证执行普通 `git clone` 或 `git pull`。
- **Nebulix 托管 Git。** 优先复用已检出仓库和现有托管认证。需要发现托管仓库时，用 Studio MCP 查询模块的仓库地址、分支和目录。首次接入或托管认证失效时，通过 Git 凭据助手用本人平台账号授权，再用普通 Git 拉取。

两种来源都先查看 `AGENTS.md`、`README.md`、`studio.module.json`、`package.json` 和本地联调文档，核对模块、分支、未提交改动、Node 版本和脚本。已有源码时，本地启动可直接使用当前检出。查询 Studio 配置或执行发布时，按[业务模块开发](../studio-develop/SKILL.md)核对本人 MCP 授权。

## 前端联调

1. 确定目标模块与两个地址。`moduleKey` 从 `studio.module.json` 读取。**dev Web 地址优先用用户明确给出的联调地址**，保留原协议、主机、端口和页面路径。执行前核实该地址对应开发或测试环境。用户未指定时，才采用模块文档中的开发或测试 Web 地址。团队 SaaS 的地址示例为 `https://nebulix-web-dev.wuyaotech.com`。宿主加载的 **本机 Remote 入口** 由模块启动脚本提供，例如 `http://127.0.0.1:5192/dev/remote-entry.js`。使用实际端口和路径。如果本机服务给出的是 Remote 清单，从中读取当前模块的 `entry`，相对路径按本机服务地址解析。若模块需要 `VITE_API_BASE` 或 `STUDIO_SERVICE_URL`，按该模块说明填写本轮目标环境的 API 基址。
2. 优先沿用支持本轮目标地址的模块联调启动器或本地网关。工具固定到其他宿主时，按第 3 步在目标地址联调。缺少所需条件时，说明具体原因。按仓库文档启停并查看状态。由当前会话负责占用时，在安装依赖、修改源码或启动可写进程前按本机源码指引登记。端口冲突时先核实归属。
3. 需要直接打开目标 dev 页面且由本次会话负责覆盖时，先按模块文档在 `127.0.0.1` 启动 Remote 服务，再在独立 Chrome 会话注入入口。检查入口返回宿主可加载的 JavaScript，入口和资源允许该 dev 来源跨域加载。

   - 打开目标 dev，由用户用有目标企业或项目权限的本人账号登录。在浏览器 Network 中找到宿主实际发出的 `GET /api/biz-remote/manifest` 的 HTTP 200 响应。部署使用自定义清单路径时，以实际网络请求为准。
   - 由 AI 使用获授权且支持响应覆盖的浏览器会话执行注入。使用专用 CDP 会话时，在响应阶段只处理目标 dev 标签页主框架发出的实际清单请求，读取并替换该响应。按 `moduleKey` 找到 `data.modules` 或 `modules` 中唯一匹配的条目，只把它的 `entry` 改为本机 Remote 的绝对地址。保留原 JSON 结构和其他字段。找不到唯一条目时，报告模块注册或清单问题。
   - 覆盖后刷新，从真实项目菜单打开模块。Chrome 弹出本地网络权限提示时，由用户为目标 dev 站点确认。结束时清除本次覆盖，停止本次联调进程并释放自己的占用。
   - 当前会话缺少自动覆盖能力时，说明缺少的工具或模块启动支持。用户选择手工排查时，才按 [Chrome Local Overrides](https://developer.chrome.com/docs/devtools/overrides) 在 Network 对该请求选 **Override content** 并编辑清单副本。云端清单变化后重新取最新响应再覆盖。

4. 验证实际加载。检查 Network 中本机 Remote 请求成功，页面渲染使用本次源码，其他模块和业务 API 继续走 dev。分别报告启动状态、本机入口、企业或项目上下文、页面效果及未验证项。真实业务写接口会影响 dev。只有独立 preview 的仓库，按模块说明验证预览并注明实际数据来源。

## 后端联调

- 先按[后端开发指引](../studio-develop/references/backend.md#能力构建与验证)运行模块仓的测试和构建。有本地后端或测试夹具的模块，可以按仓库说明调用本机接口，记录实际使用的身份和数据来源。
- 用真实项目验证新版后端时，按[模块发布流程](../studio-develop/references/workflow.md)核对 dev 当前生效版本。新版产物经本次授权在 dev 激活并回读后，再用本人账号验证真实接口、页面和数据结果。连接真实 dev 宿主且本轮只做本地联调时，继续调用 dev 已激活的版本，并单独报告新版后端的本机测试结果。
