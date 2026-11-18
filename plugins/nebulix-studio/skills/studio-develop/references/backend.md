# 后端开发

业务接口与 Hook 放模块 `server-extension/`，由平台 Code API 运行时加载。以工程随包 `@nebulix/bp-sdk` 的类型、已有入口和目标环境能力为准。

## 技术与入口

使用 TypeScript、Node.js 和 SDK 的 `BizRoute` / `BizCrudHook` 契约；通过 `ctx.dataSource` 使用 TypeORM QueryBuilder 或 Repository。模块入口导出 `routes`、`crudHooks`，构建为 ESM；具体入口及构建命令见工程 README。

标准增删改查优先复用动态 CRUD，业务校验和写入联动使用 CRUD Hook，跨表统计、业务命令和第三方对接使用自定义 API。平台提供登录、存储和项目上下文，模块按已有能力接入。

## API

`BizRoute` 声明 method、path、accessScope 和 handler，模块路径由平台挂载为 `/biz/<moduleKey>/*`。常规接口使用 POST + JSON；handler 返回业务数据，由宿主包装统一响应，调用方同时检查 HTTP 状态和业务 code。

项目接口显式声明 `accessScope: 'project'`，企业接口使用 `company`。平台先验证访问资格，handler 再根据 `ctx.currentUser` 校验业务角色、对象归属及状态。查询和写入显式使用可信的企业/项目范围与软删除条件。

示例：demo 模块对项目备忘录计数，物理表名应替换为实际已发布表：

```ts
import type { BizRoute } from '@nebulix/bp-sdk';

export const routes: BizRoute[] = [{
  method: 'POST',
  path: '/note-summary',
  accessScope: 'project',
  async handler(_req, ctx) {
    const { companyUuid, projectUuid } = ctx.currentUser;
    if (!companyUuid || !projectUuid) throw new Error('PROJECT_CONTEXT_REQUIRED');
    const row = await ctx.dataSource.createQueryBuilder()
      .from('ext_demo_demo_note', 'note')
      .where('note.company_uuid = :companyUuid', { companyUuid })
      .andWhere('note.project_uuid = :projectUuid', { projectUuid })
      .andWhere('note.deleted_at IS NULL')
      .select('COUNT(*)', 'count').getRawOne();
    return { count: Number(row?.count ?? 0) };
  },
}];
```

客户端传入的企业/项目参数和角色只能作为请求数据，授权依据取已验证的上下文。涉及 UUID 的详情、修改和删除，同样核对对象范围。

## Hook 与事务

`crudHooks` 条目声明 tableKey、event 和 handler，可用事件为 before/after Create、Update、Delete 及 afterCommit。

- `before*` 处理校验和字段修正；按 SDK payload 读取 record、before、patch、after。
- `before*` / `after*` 内的关联写入使用 `ctx.tx`，与主 CRUD 同事务；抛错回滚。
- `afterCommit` 在事务提交后执行，适合外部通知；失败只记录日志。可靠投递按业务需要实现重试和幂等。

自动 CRUD 的 batch-delete 当前绕过逐条 Hook。有必须执行的删除联动时，使用已核对的逐条接口或自定义事务命令。

自定义 route 的多表写入用 `ctx.dataSource.transaction`，事务内统一使用其 manager。跨数据库实现使用参数化 QueryBuilder/Repository 和平台类型，避免依赖单一数据库函数。

## 能力、构建与验证

存储使用宿主提供的 `ctx.storage`；黑洞 HTTP 与场景见[黑洞接入](blackhole.md)。按当前 SDK 类型与运行环境检查可选能力，凭据由平台提供的机制管理。

按项目脚本完成类型检查、受影响业务测试和构建。后端 ZIP 的 manifest 与模块、版本和入口一致；上传后通过发布计划激活，流程见[配置与发布](workflow.md)。真实验证覆盖角色、企业/项目隔离、事务回滚及写入后的回读。
