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
