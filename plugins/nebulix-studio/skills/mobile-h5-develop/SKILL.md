---
name: mobile-h5-develop
description: Build or maintain a Nebulix mobile H5 in a customer module repository using the bundled standalone starter and mobile SDK. Use for mobile login, customer home/navigation, reusable ESM modules and local API integration, including HLSCS. Does not require the Nebulix platform monorepo.
---

# 移动 H5 开发

交付客户仓中的可修改 H5：独立登录、客户首页和导航、标准/客户模块、真实开发 API 联调。使用随技能分发的 starter 与 SDK，不要求 PM clone 平台主仓，也不增加应用管理台。

## 从客户仓开始

1. 读取客户仓 `AGENTS.md`、`README.md`、`studio.module.json`、`package.json` 及已有移动端说明，核对分支、模块身份和未提交修改。已有 `h5-app/` 时直接维护，不用模板覆盖。纯本地开发不以 Studio MCP 登录为前置；需要发现未知仓库、读取/修改业务配置时再按 [studio-develop](../studio-develop/SKILL.md) 查询实际工具及权限。
2. 没有 H5 时，以**此 SKILL.md 所在目录**解析脚本路径，执行：

   ```sh
   node "<技能目录>/scripts/init-h5.mjs" --output "<客户仓>/h5-app"
   ```

   输出目录必须不存在。脚本从插件自带 `assets/starter/` 复制完整源码、SDK 和锁文件，不下载主仓、不覆盖现有文件。模板是通用骨架，导出 receipt 标记本次面向 HLSCS；客户修改自己的标题、namespace 和模块配置。不要把示例身份、页面或数据当作已交付的 HLSCS 业务。
3. 进入生成目录，先读其 `README.md` 和 `AGENTS.md`，按锁文件执行 `npm ci`、`npm run typecheck`、`npm run build`、`npm run dev`。Node 要求以生成工程为准。若资产或锁文件缺失，报告插件版本并修复分发包，不从维护者机器绝对路径取文件补齐。
4. 默认打开终端给出的 H5 根网址，用户用自己的 dev 账号登录。通用 starter 的 `?preview=1` 只用于明确标记的本地示例；现有 HLSCS 已移除示例模式，只能正常登录，不重新添加。若端口占用，使用工程提供的端口配置，不关闭其他服务。

## 修改页面和接入模块

- 首页、导航布局、本地业务页由客户代码维护，模块来源和页面清单在 `web/h5.config.ts`。本地页面可直接注册；只有需要复用或独立维护的业务域才拆 ESM 模块。详见 [页面与模块契约](references/module-contract.md)。
- 当前源码模块经 `localSources` 构建到 `/modules/<moduleKey>/entry.js`；独立 `build-module` 产物放版本化 `/artifacts/`。这些路径不代表后台登记或发布状态。源码修改后等待构建成功再刷新；以工程实际能力区分源码监听、整页刷新和 HMR。
- 使用 `ctx.session.request` 与现有业务 API，企业/项目身份来自真实会话。H5 组成不构成 API 白名单，也不赋予权限。HLSCS 任务先读 [HLSCS 接入](references/hlscs.md)。
- 未保存表单接入 `ctx.registerDirty`；切换工作空间后避免旧请求回写。业务缓存按用户/企业/项目分区。模块资源加载、渲染、API 权限失败要明确显示，不能静默切回样例页面。
- 浏览器设备能力与原生能力分别说明。当前分发的是 H5/SDK，不包含 Android、iOS、原生鸿蒙壳；不得宣称原生扫码、推送或真机能力已实现。

## 配置、发布与验收边界

- H5 首页/导航/模块选择是代码，不走新的应用 DB 草稿、登记或组合发布 API。现有业务表、字典、菜单仍按 Studio 的 DB 真相源和发布计划处理；不能用本地 JSON 当作业务配置已发布。
- 需要发布完整 H5 时，读 [整站发布与回退](references/h5-site-publish.md)：先探测服务 `features.h5Sites`，再构建 `h5-site`、上传、独立预检和激活。PM 不需要平台主仓或云端密钥；整站不调用旧 `prepare_release`，不夹带 DB 草稿。工具缺失时重新连接并核对实际 schema，不能按文档猜参数。
- 需要移动 ESM 模块发布时，先读 [mobile target 发布](references/studio-mobile-publish.md)，通过现有 `get_context` 探测服务能力后再使用现有上传/发布工具；插件版本不证明服务已上线。不得将不支持 mobile 的旧服务当作 desktop 兜底发布。整站与单模块是不同 artifact；不能互换上传或用 desktop 兜底。
- 分开报告：客户源码修改/提交、依赖安装和构建、浏览器交互、真实登录/API、部署及真机验证。接口替身测试、公共 API 可达和预览模式均不证明真人账号业务权限已验收。
- 在主仓之外的干净目录完成一次安装、构建、启动与源码修改后回读，确认工程只依赖客户仓、插件交付物和公开 npm 依赖。交付保留锁文件、SDK 版本、运行命令及已验证限制；插件升级不会自动更新客户已复制的源码。
