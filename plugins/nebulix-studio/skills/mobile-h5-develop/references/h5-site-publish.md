# H5 整站发布与回退

适用：用户要把客户 H5 登录页、首页、导航及随站业务页更新到 development。源码只在客户仓；PM 不需要 nebulix 主仓、云端密钥或每客户 CI。平台预先绑定 moduleKey、环境、域名、API 上游。原生安装包与独立 mobile ESM 模块不是本流程。

## 能力、权限与构建

1. 读取客户仓和 H5 的 AGENTS/README，核对模块身份、分支和修改；使用现有工程，不重新生成模板。
2. 调用实际 `get_context`，确认 development、目标模块 artifact/publish 权限及 `features.h5Sites.version === 1`、`artifactKind === "h5-site"`、`publishEnabled === true`，并核对 tools 列表包含下述四工具。读取当前连接实际工具 schema；缺能力或缺工具时重新连接插件再探测。不能拿插件版本当服务能力，不猜造接口或走旧 web/mobile 发布兜底。
3. `get_h5_site({moduleKey, environment})` 查询目标站点，返回 binding、url、active 与 history。当前激活版本读取 `active`（可为 null），并发基线为 `active?.releaseId ?? null`。不存在站点绑定则交平台配置；客户不能自行指定域名、OSS 目录或 API 上游。记下当前激活版本，供预检的 `expectedActiveRelease` 和回退使用。
4. 在 H5 目录执行 `npm ci`（按需）、`npm run typecheck`、`npm test`、`npm run build`，验证页面。按本轮 Git 授权提交源码，随后执行 `npm run build:site`。如客户尚未带 build:site，只迁移平台已发布的工具文件，保留客户页面；插件升级不自动更新客户源码。

`build:site` 从真实 Git HEAD 与 h5Config.version 生成 ZIP；H5 目录必须无 tracked/untracked 源码修改，Git ignore 的 dist/node_modules 不阻断，其他 PC 目录不纳入校验。输出 `dist/site/<moduleKey>-<releaseKey>.zip` 与 `.receipt.json`，receipt 包含 kind、moduleKey、version、sourceCommit、releaseKey、zip 路径、sha256、size 与文件清单。版本最多80字符，ZIP最多24MiB。命令本身不上传或激活。

ZIP 根契约为：

```json
{
  "schemaVersion": 1,
  "moduleKey": "hlscs",
  "version": "0.1.2",
  "sourceCommit": "真实的40位Git提交SHA",
  "releaseKey": "0.1.2-真实提交前12位",
  "entry": "index.html"
}
```

文件名 `h5-site-manifest.json`。releaseKey 必须是 `${version}-${sourceCommit.slice(0,12)}`；网页、共享运行时和站内模块引用 `/_h5/<releaseKey>/`，外部可信模块 URL 保持原值，`/api`、`/__mobile/environment` 与 hash 路由不加版本。ZIP 不包含 source maps、旧 artifacts、node_modules、源码或凭据。构建从全新临时目录生成，不把既有 dist 直接整包上传。

## 上传、预检、执行与验收

按当前服务真实 schema 使用以下独立工具：

1. `prepare_upload`：`kind: "h5-site"`，不传 target，身份/版本/源码/sha256/size 来自 receipt。仅 PUT 返回的单次上传 URL，不传播签名 URL。
   starter 0.3.1 起 ZIP 使用标准 DEFLATE 压缩，减少慢上行传输量。PUT 应按文件大小、实际网络和票据剩余有效期给足超时；不要用很短的探测超时判定完整包失败。传输超时/reset/结果不明时先读取当前上传或artifact状态，必要时按实际工具完成校验；只在确认票据仍有效且未完成时重试同一票据与相同字节。不吞掉异常，不把PUT发起或超时当成上传成功，不因不确定结果直接激活。
   若同一网络出现“大body不节流会reset/超时，小body正常”的突发传输症状，可在先回读确认结果后，以相同有效票据和完全相同ZIP字节尝试curl限速，例如 `curl --http1.1 --header "Expect:" --limit-rate 16k --max-time 120 --fail-with-body --upload-file "<同一个ZIP>" "<同一个signedPutUrl>"`（Windows可用curl.exe；保留票据要求的其他请求头）。这是本机链路故障的可选排查方法，不是所有客户的默认速率。不要输出签名URL；HTTP成功后仍须complete_upload和artifact校验，不吞异常、不直接宣称发布完成。
2. PUT 成功后 `complete_upload`，再查询 artifact 校验结果。只使用通过校验且身份、版本、sourceCommit 与本次一致的整站 artifact。
3. `prepare_h5_site_release`：使用本次 `artifactId` 与此前读取的 `expectedActiveRelease`（active.releaseId 或 null）。检查目标模块、development 域名、旧/新版本和包摘要；此预检仅站点激活，不得夹带 DB 草稿。
4. `execute_h5_site_release({moduleKey, environment, releaseId})` 执行预检结果，随后用 `get_h5_site_release_status({moduleKey, environment, releaseId})` 轮询到明确成功或失败。读取实际工具返回的标识，不按示例编造 releaseId。失败先看错误与当前站点，避免不明结果直接重发。
5. 再次 `get_h5_site`，确认 active 与预期新 artifact、version、sourceCommit 一致；回读 HTTPS 根页面、带版本的 JS/CSS/运行时、`/healthz` 与 `/__mobile/environment`。至少实际浏览器打开登录页和正常路由，真实业务/API 和真机单独记录。

整个 H5 网站**不调用旧 `prepare_release` / `execute_release`**。旧流程仍用于 Studio 配置、后端或独立 ESM 模块；用它发整站可能混入草稿或覆盖其他入口。单模块继续按 [mobile target 发布](studio-mobile-publish.md) 使用 `kind=web,target=mobile` 与 mobile-manifest.json。

`expectedActiveRelease` 是并发保护：当前站点已被别人更新时，停止本次执行，读取最新结果，核对是否仍需覆盖；不能自动把 expected 改成最新重试。重复执行结果以服务幂等回执为准。

## 回退

选取该站点历史成功的 `h5-site` artifact，先读取当前 active，再用该历史 artifactId 和当前 `active?.releaseId ?? null` 作为 expectedActiveRelease 重新预检、执行、轮询与回读。回退只切站点激活指针，不改业务数据库。保留历史资源，已打开旧页面仍能读取它的版本文件；不能靠重传不同内容覆盖同一 releaseKey。

交付报告区分：源码 commit、ZIP SHA/size、artifact、发布回执、站点 active、HTTP 与浏览器、真实登录/API、目标设备。仅上传成功不是网站发布成功。

服务协议细节：get_h5_site 的 active/history 版本包含 releaseId、artifactId、releaseKey、version、sourceCommit、assetBase、publishedAt、previousReleaseId。prepare_h5_site_release 参数为 moduleKey、environment、artifactId、expectedActiveRelease（null 或64位发布ID）；状态回执 configPlan 应为 null，result 与 status 以服务返回为准。
