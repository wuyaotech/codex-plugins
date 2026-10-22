# 移动 H5 整站交付 0.1.6

2026-10-22。插件0.1.6分发starter0.3.0，SDK仍为0.1.0。新增版本化静态站点构建、ZIP/receipt和独立站点发布/回退指引。PM只需要客户仓，不需要Nebulix平台主仓、CI或云端密钥。插件升级不覆盖客户源码。

## 已完成的本地验证

- 私插件仓 `node scripts/validate.mjs` 通过：48个starter分发文件逐字节匹配receipt，公开SDK与React18锁文件完整，MCP仅HTTPS endpoint且不含凭据。
- `node --test tests/mobile-h5-init.test.mjs` 4项通过：独立复制、保留现有客户文件、排除私密/生成目录、拒绝符号链接。
- 从插件assets经init-h5创建主仓外新目录，`npm ci`安装15项依赖，typecheck、31项测试、build通过；1项新临时Git fixture因本机Git无法创建.git/config跳过。
- 不可变路径覆盖宿主JS/CSS、HTML importmap、shared runtime、站内模块入口；API和environment保持根路径，模块仍共享bareimports。
- HLSCS现有客户仓独立工具检查34项通过/1个同上Gitfixture跳过。真实已提交客户站点0.1.2 ZIP生成成功：源码e954357c001d694a6823d062295df71a3a6b2739，ZIP SHA256=73b39b4f306fd9171623cd566de82880a328c8c58e5a39c8bedeb791776e05b5，1,219,235字节，12文件。Python标准zipfile完整解析/CRC验证通过，排除maps/artifacts/.env，版本资源前缀与manifest一致。
- 客户H5存在未提交README时，真实build:site明确拒绝；无关payroll不属于H5源码范围。客户工程不重新引入示例身份或数据。

## 服务协议

features.h5Sites={version:1,artifactKind:'h5-site',publishEnabled,tools:[get_h5_site,prepare_h5_site_release,execute_h5_site_release,get_h5_site_release_status]}。实际服务探测与工具schema才是能力证明，插件版本不是。站点active/history返回releaseId，expectedActiveRelease使用active?.releaseId??null。独立h5-site流程不走旧prepare_release，不夹带DB草稿；web/mobile模块仍独立维护。

本记录仅说明已验证的本地交付；云端部署、激活、真实MCP发布/回退与浏览器由平台本轮发布回执记录，不由构建成功推断。

发布时平台整站服务仍在本轮 development 验证中，最终实际能力与发布回执由平台记录回填；此插件发布不代表云端链路已经验收。
