# H5 客户端开发约定

这是独立 H5 工程，不依赖 nebulix 主仓。先读 README.md 和 starter-receipt.json。
使用 Node >=20.19、npm ci/npm run；固定 React 18.3.1，不升级到 React 19，不在父目录安装。
客户页面、首页、导航和模块入口在本目录代码中维护；业务 API 和权限沿现有 Studio 体系，不引入新的应用管理/草稿发布后台。
修改 vendor/mobile-sdk 前核对公共契约并记录版本/hash变更，不把服务器 BizContext 或凭据打入前端。
真实 API 写入、云端发布和安装包分发分别按用户授权执行；示例数据必须明确标记。
