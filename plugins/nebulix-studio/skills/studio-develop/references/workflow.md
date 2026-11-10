# 配置与发布契约

- 表：`configs/tables/<key>.json`，kind=`lowcode-table`、schemaVersion=1、moduleKey、tableName=`ext_<module>_<name>`、tableKey、label、projectScoped、columns、indices。字段包含 columnName、label、type、required、defaultValue、meta。先读开发包示例，不猜类型。
- 字典：`configs/dicts.json`，kind=`lowcode-dict-bundle`、schemaVersion=1、moduleKey、dicts。字典 code 加模块前缀；items 的 value 唯一，parentValue 必须存在且无环。
- 菜单：`configs/menus.json`，kind=`lowcode-menu-bundle`、schemaVersion=1、moduleKey、menus。菜单含 label、scope、sort、parentName、path。父菜单必须在文件中且无环。
- MCP 管理模块级定义，companyUuid/projectUuid 为空、字典/菜单 type=system；projectScoped=true 管业务行隔离。模板发布影响启用模块的企业/项目；工具不提供任意租户数据查询。
- 每次 apply_drafts 必须携带 export_configs 的 revision。省略表文件保持现状；字典/菜单是完整集合，删去项可能生成删除草稿，首期发布会拒绝删除。
- validate_configs 必须先执行，错误要在落库前修复。
- 后端 ZIP 根目录 manifest.json 必须与模块、version、entry 匹配，默认入口 dist/index.mjs；示例仅导出 routes/crudHooks。
- 前端 ZIP 保留 dist 内相对路径，entry 指向前端 ES module。上传与激活分离，候选 entryUrl 可供本地宿主预览。
- 本地 `npm run build` 输出 artifact ZIP、校验值和描述；以平台 complete_upload 的核验结果为准。Git 凭据、平台账号、构建产物上传权限相互独立。

## dev 到 prod 的审核候选

1. 在 dev 用 `export_promotion_source` 获取该模块已发布定义和本次选定的已上线产物元数据。保留签名快照的原始内容。记录源环境、模块、源码提交、选定配置路径与产物校验值。
2. 在 prod 用 `export_configs` 分别读取目标 draft 与 published revision。对照生产正式配置与现存草稿，向用户展示计划覆盖的具体路径。配置和产物均无差异时报告已一致，结束操作。涉及产物时，以本次源产物及目标端校验过的上传 ID 为据；保留版本和校验值，不能把 dev ID 当作 prod ID。
3. 使用 prod 的 `prepare_promotion_candidate`，传入原始签名来源、目标 draft/published revision、选定路径及本次相关的已上传产物 ID。目标发生变更时重新读取、比较并处理冲突。基线、权限或签名校验失败时保留错误原因。
4. 使用 prod 的 `get_promotion_candidate` 回读候选和服务端返回的审核地址（Studio 路由为 `/biz/platform/develop/promotion-review?moduleKey=…&candidateId=…`）。向维护者提供候选 ID、配置清单、产物版本与审核链接。生产审核及执行在该页面由授权人完成。重试或中断后先查询原候选。
