# 页面与模块契约

当前以生成工程内 `vendor/mobile-sdk/src/types.ts` 为准确类型来源，运行方式见生成工程 README。SDK 随 starter 固定版本分发，不依赖主仓 workspace、全局 npm 包或已发布 npm SDK。

## 完整 H5 与模块

- `h5-app/` 是完整网站，包含登录、工作空间、首页、导航、本地页和模块配置。
- 可复用移动页面可放在客户仓 `mobile-h5/`；一个模块可包含多个页面。完整网站的 `index.html` 不能作为 ESM 页面模块入口。
- `web/h5.config.ts` 声明标题、storage namespace、版本、模块与导航、本地源码和受信任来源。namespace 只分区本地存储，不是租户或后台应用。
- 只使用本地组件也可：`modules: []`，本地页仍需注册及合法导航。SDK 的 `AppRelease/appKey/releaseId` 是运行时清单名称，不意味着存在服务端应用或发布记录。

模块入口导出：

```tsx
import type { FrontendModule, MobilePageProps } from '@nebulix/mobile-sdk';

function Overview({ ctx }: MobilePageProps) {
  return <button onClick={() => ctx.navigate({
    moduleKey: 'hlscs',
    pageKey: 'attendance',
  })}>考勤</button>;
}

export const frontendModule: FrontendModule = {
  moduleKey: 'hlscs',
  pages: [{ key: 'overview', label: '业务总览', scope: 'project', component: Overview }],
};
```

示例跳转要求清单中实际声明并实现 `hlscs/attendance`。也支持默认导出 `{ frontendModule }`。moduleKey、页面 key、label、scope 必须与清单匹配；组件接收 `{ctx, params}`。scope 为 company/project/both，页面前置检查不替代后端授权。

通过 `ctx.navigate` 跨模块跳转，不引用别人的源码，不自行创建 React root 或顶层 Router。query 只放页面参数，不能放 token/密码。SDK 共享登录、工作空间、请求及能力适配，模块不能复制第二套 token store。

## 两类本地产物

| 来源 | 产物 | 使用 |
| --- | --- | --- |
| `localSources` 的源码入口 | `dist/modules/<moduleKey>/entry.js` 及 CSS | 随本地源码重建；配置 entry 对应 `/modules/...` |
| `node scripts/build-module.mjs --source ... --module-key ... --version ...` | `dist/artifacts/<moduleKey>/<version>/entry.js` 等 | 独立版本化 ESM；配置 entry 对应 `/artifacts/...`，不再同时设置同名 localSources |

独立 CLI 同版本不同字节拒绝覆盖；使用新版本号，不手工篡改已有版本。CLI 只构建，不登记、不上传、不修改 Studio 配置。直接调用 Node 脚本可避免某些 PowerShell npm 包装器把 `--version` 作为 npm 自身参数。具体命令与输出目录以随包 README 为准；选用客户入口前确认文件存在。

模块共享 React、ReactDOM 和 SDK；导出工具与宿主的 import map/共享运行时配置必须匹配。客户独立构建时不能简单打包第二份 React，也不能只把依赖设为 external 后假定浏览器会解析。跨域入口还要验证模块来源、CORS、MIME、资源相对路径及依赖最终指向同一运行时。

CSS 使用模块命名空间。当前工具不会自动隔离选择器；同页热换多版本 CSS、任意框架模块和恶意代码隔离均不是已实现能力。动态加载受信任 ESM 不等于 iframe 沙箱。

## 业务 API 与操作状态

从客户仓已有后端 route 和调用方核对请求路径、参数、返回 envelope、权限与字段，不凭表名发明 API。页面使用 `ctx.session.request`，后端按真实用户/企业/项目授权；模块列表不限制用户本来有权使用的业务 API。

离页/刷新前用 `ctx.registerDirty` 保护未保存数据。切账号/企业/项目后旧响应不能回填；异步事件错误由页面处理，卸载时清理监听、订阅和定时器。渲染错误边界不覆盖所有异步错误。
