# 配置开发

适用于 Studio 模块的表、字典和菜单。配置文件保存在模块 `configs/`，平台 DB 中的草稿与正式版本是配置真相源；生效流程见[配置与发布](workflow.md)。

## 表

每张表使用 `configs/tables/<tableKey>.json`。以当前环境导出和工程示例为基线，使用以下契约：

| 字段 | 约定 |
| --- | --- |
| `kind` / `schemaVersion` | `lowcode-table` / `1` |
| `moduleKey` | 与 `studio.module.json` 一致 |
| `tableName` | `ext_<模块前缀>_<业务名>`，小写 snake_case；模块 key 中的连字符转下划线 |
| `tableKey` | 稳定的路由别名，使用 kebab-case，文件名与之对应 |
| `label` | 业务显示名称 |
| `projectScoped` | 项目数据用 `true`，企业共享数据用 `false`；仍按企业隔离 |
| `crudEnabled` | 开启后提供 `/data/<moduleKey>/<tableKey>/*` 标准 CRUD |
| `columns` | 业务列；系统注入 id、uuid、company_uuid、审计字段及项目隔离列 |
| `indices` | 额外业务索引；使用导出格式的 columnNames、isUnique 等字段，唯一范围按业务选择 company/project/global |
| `sourceHash` | 文件导出的并发指纹，新表为 `null`；更新时保留最新值 |

Studio 的 `ext_*` 表经配置草稿和发布计划维护，模块业务代码使用已注册表。平台核心表由平台仓库维护。

### 字段与类型

列使用 `columnName`、`label`、`type`、`required`、`defaultValue`、`meta`、`sortOrder`、`status`。列名为小写 snake_case，`required: true` 表示必填。示例：

```json
{
  "columnName": "note_status",
  "label": "状态",
  "type": "enum(open|进行中,closed|已关闭)",
  "required": true,
  "defaultValue": "open",
  "meta": null,
  "sortOrder": 0,
  "status": "enabled"
}
```

常用类型：

- 文本与数值：`string`、`string(N)`、`text`、`int`、`bigint`、`decimal`、`decimal(P,S)`。
- 布尔与日期：`boolean`、`date`、`datetime`。这里的 datetime 是平台类型，由编译器适配数据库。
- 文件与关联：`file`、`files`、`image`、`images`、`uuid-ref`、`multi-relation`。关联的 meta 结构按当前 SDK 和已有配置填写。
- 选项：`dict(code)`、`enum(a,b)`、`enum(值|标签,...)`。状态存 code，界面显示标签。

默认值按配置契约使用字符串或 `null`；boolean 使用 `"0"` / `"1"`，enum 显式填写业务 code，`null` 表示无默认值。系统列和默认企业/项目索引由平台生成，额外索引只声明业务需要的部分。

## 字典

`configs/dicts.json` 使用 `kind: "lowcode-dict-bundle"`、`schemaVersion: 1`、`moduleKey`、`dicts`。`dicts` 以 code 为键，code 带模块前缀，例如 `demo_note_type`；items 的 value 唯一，parentValue 指向已有项且无环。

模块配置维护全局模板；企业和项目实例在相应管理页维护。业务读取可用 `POST /dict/resolve`，按 project → company → system 回退；需要精确项目实例的业务沿用其专用读取方式。

## 菜单与页面

`configs/menus.json` 使用 `kind: "lowcode-menu-bundle"`、`schemaVersion: 1`、`moduleKey`、`menus`。`menus` 以稳定名称为键，条目维护 label、scope、sort、parentName、path 和 matchPath。父项存在且无环，项目路径使用 `{projectUuid}` 占位符。

菜单负责导航，前端 pages 负责实际页面注册，两者的路径和 scope 要对应。页面入口、表和接口准备好后再开放菜单，项目实际使用还取决于模块启用和角色授权。

## 修改与验证

先导出最新 draft/published，合并目标变更，再运行 validate 和 diff。模块级 MCP 配置的 companyUuid/projectUuid 为空，字典和菜单为 system 模板；projectScoped 控制业务行的项目隔离。

表结构的普通发布支持建表、加列和加索引。删列、改类型、重命名及数据迁移交由平台维护者通过受控迁移处理。字典和菜单按完整集合提交，删除语义及 revision 处理见[配置与发布](workflow.md)。
