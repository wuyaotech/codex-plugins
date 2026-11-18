# PC 前端开发

适用于模块的 `web/`。移动 H5 使用同插件的 [mobile-h5-develop](../../mobile-h5-develop/SKILL.md)。

## 技术选择与版本

新模块沿用 starter 的 React 18、Ant Design 5、Vite 和 TypeScript 工具链。具体补丁版本由工程 package.json 和锁文件固定，公开接口以随包 SDK 类型及目标宿主能力为准。

已有模块沿用自己的依赖、构建方式和目录约定。需要升级时核对宿主共享依赖和 SDK 兼容性，单独验证升级结果。

| 需要 | 默认选择 |
| --- | --- |
| 列表、表单、弹窗 | Ant Design；普通 CRUD 优先复用平台已有页面能力 |
| 页面内部状态 | React hooks；跨页共享状态按业务需要使用工程已有方案 |
| 请求、缓存与图表 | 优先使用工程已有封装和依赖，再按需要补充 |
| 样式 | 模块范围的 CSS/CSS Modules，或工程已有样式方案 |

## 页面与宿主集成

starter 的 `web/src/remote-entry.jsx` 导出包含 `frontendModule` 的模块对象，声明 moduleKey、moduleName 和 pages。每个页面维护 key、label、scope、component 及匹配路径；与 `configs/menus.json` 的业务路径对齐。

React、Ant Design、Router、主题和身份上下文按宿主共享契约复用。starter 使用 `window.__NEBULIX_SHARED__`；已有工程可能使用 Module Federation 或 SDK 适配器，沿工程入口和构建配置接入。

Remote 页面由宿主管理挂载和顶层导航，独立 preview 才负责自己的 React root 和登录。样式限定于模块容器，保证切换模块后宿主主题、导航和其他页面保持正常。

## 数据请求

使用工程已有的业务请求封装和平台登录态。标准 CRUD 调用 `/data/<moduleKey>/<tableKey>/*`，自定义 API 调用 `/biz/<moduleKey>/*`；参数与返回结构从真实接口及调用方核对。

MCP OAuth 用于开发工具，页面使用业务登录态。starter 的 preview 提供独立登录和项目选择，数据请求指向所选开发环境；写操作会修改该环境的真实业务数据。

页面处理加载、空数据、失败和提交状态。切换企业/项目或卸载后，丢弃旧请求结果并清理订阅；业务状态存 code，通过标签或字典显示。后端失败时展示实际错误，独立演示数据按工程约定显式启用。

## 本地联调与构建

先读工程 README 和本地联调说明，区分独立 preview、真实宿主的单模块联调及构建产物预览。starter 的 `npm run dev` 支持前端即时更新，后端源码通过构建和发布激活后在平台执行。

配置表/字典生效、项目启用模块后，验证实际页面注册、菜单导航、项目切换和 CRUD 回读；涉及黑洞的页面按[黑洞接入](blackhole.md)检查宿主能力。

按工程脚本执行类型检查和构建，核对浏览器实际加载的 React 与共享依赖只有一套。前端产物包含完整资源及相对路径，入口、版本和上传发布流程见[配置与发布](workflow.md)。
