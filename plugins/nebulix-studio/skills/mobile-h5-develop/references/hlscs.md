# HLSCS 首个接入场景

在用户指定的 HLSCS 客户仓工作，先核对 `studio.module.json` 的 moduleKey、当前分支和仓库说明。2026-10-20 live MCP 返回 `https://github.com/wuyaotech/studio-hlscs.git`、分支 `draft`、目录 `.`；实际操作仍核对当前工具返回值及 Git 权限，不能据此假定所有账号有写/发布权限。

初次建立 H5：从技能自带通用模板创建新的 `h5-app/`，按其 README 安装启动。导出 receipt 的 hlscs 仅标记交付归属；namespace、标题、导航和业务模块仍须按客户需求修改。示例进度、现场日志和虚构身份不是 HLSCS 已发布能力。

先选用户这次要求的一条具体流程，例如查看本人相关考勤或现场问题。不要因为名称相似而复制其他业务模块。已有 H5 时优先读其 `h5-app/README.md` 和 `docs/development/mobile-h5.md`（如有）；业务语义再读 `docs/development/architecture.md`、对应 `docs/modules/**/business.md` 与 `data-model.md`，对照 `server-extension/` 已有路由及 `web/` 调用方，确认实际 API、实体状态、角色和字段权限。HLSCS 业务细节以该仓当前代码和服务实际返回为准，插件不固定一份会漂移的业务表 schema。

开发时：

1. 用客户代码实现适合手机的首页、列表、详情和表单，已有 PC 页面可作为业务语义参考，不能直接拿 PC remote 充当移动入口。
2. 复用已有会话和业务 API；请求来自当前用户/企业/项目上下文，不能在浏览器按固定企业项目绕过授权。已有 API 不足时在本模块后端扩展合理补充，不另建移动专用数据库。
3. HLSCS 现有 H5 仅正常登录，旧 `?preview=1` 也不能绕过真实会话；不重新引入虚构身份或业务fixture。先完成 UI、契约及受控测试，再由用户用本人账号验证真实查询、保存和刷新回读；真实 dev 写操作按本轮业务授权范围执行。
4. 仅做 H5 不改业务表、菜单或发布配置。确需变更时转到 `studio-develop`，核对最新 DB revision 和模块权限，不把配置副本提交等同生效。

H5 源码、vendor SDK、锁文件及开发说明一并保存在客户仓。插件更新只更新技能/模板；已有 H5 由开发者比较合并 SDK/模板升级，避免覆盖客户页面。SCS 不属于本接入范围，不读取、抽取或修改其代码。

整站发布读取本仓 README 与 [H5 整站发布](h5-site-publish.md)，使用 `npm run build:site` 与 `kind=h5-site` 独立站点流程；`build:mobile` 继续用于复用 ESM 模块。HLSCS development 已有绑定域名，但实际地址、activeRelease、权限与能力一律读取当前服务。
