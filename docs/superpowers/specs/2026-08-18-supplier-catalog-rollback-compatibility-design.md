# 供应商目录回退兼容设计

**日期：** 2026-08-18
**状态：** 已确认，待实施
**适用范围：** PR #71/#72 应用回退与四个已执行 `20260813*` migration 共存期间

## 1. 背景与根因

PR #71 的四个 migration 已在开发库执行，不能删除、改写或伪造未执行历史。应用代码回退到 PR #66 后，数据库仍保留商品/SKU 所有权字段、价格 `tenant_id` 非空约束、租户一致性触发器和作用域唯一索引。

旧应用存在三类不兼容：

- 商品和价格的直接查询只按 `supplier_id`，对共享平台供应商会暴露其他租户的私有资料或采购价。
- 商品和 SKU 的旧创建 RPC 不写所有权，新增记录会落为无归属，并绕过平台/租户部分唯一索引。
- 价格旧创建 RPC 不写 `tenant_id`，会被非空约束拒绝；其他旧命令也未在所有读取、更新条件中显式限定租户。

因此，单纯回退应用代码虽然能通过类型检查，但不能安全部署。

## 2. 方案选择

采用“应用读边界 + 数据库原子写边界”的最小兼容层：

- 保留四个历史 migration，新增一个前向 compatibility migration。
- API 从认证与合作关系得到 `tenant_id`，repository 的列表、详情和直接更新都显式限定租户或所有权范围。
- 数据库 RPC 在同一事务中写入所有权/租户归属，并在读取和更新目标行时校验当前租户。
- 不恢复 PR #71 的目录、规格、平台商品和 Admin 功能；这些仍按计划 3 v2 重新实现。

不采用以下方案：

- 前向删除已执行 schema：会产生先删后加的迁移链，并扩大生产上线风险。
- 仅回退 Admin、保留 #71 后端：边界不清晰，也保留了要重新审查的实现。
- RPC 成功后再二次更新所有权：非原子，失败时会遗留无归属记录。

## 3. 可见性和写权限

### 3.1 商品与 SKU

租户读取某个合作供应商的商品时，只能看到：

- `ownership_scope = 'platform'` 的平台商品；
- `owner_tenant_id = 当前租户` 的私有商品；
- `ownership_scope IS NULL AND owner_tenant_id IS NULL` 的历史未归属商品。

历史未归属商品只用于兼容展示，在兼容窗口内按共享只读资料处理。租户不能更新、启停或在其下新增 SKU。所有新商品和 SKU 都必须写入：

```text
ownership_scope = tenant
owner_tenant_id = 当前认证租户
```

租户直接更新、状态命令和 SKU 命令只能命中当前租户拥有的商品/SKU。平台和历史共享资料在租户入口保持只读。

### 3.2 价格

价格簿和价格条目始终属于租户。列表、详情、条目列表和直接更新必须同时限定：

```text
supplier_id = 当前合作供应商
tenant_id = 当前认证租户
```

创建、发布、新版本、退役、条目新增/更新/删除 RPC 必须：

- 继续验证当前租户与供应商合作关系；
- 对目标价格簿和条目显式校验 `tenant_id = p_tenant_id`；
- INSERT 时显式写入价格簿和条目的 `tenant_id`；
- 保持既有幂等键、乐观版本和审计事件语义。

## 4. 分层边界

- Controller 不接受客户端 `tenant_id`，继续只读取 HTTP 参数并调用 service。
- Service 从 `SupplierProxyScope` 派生可信 `tenantId`，传给 repository。
- Repository 对所有直接表读写追加租户/所有权条件，并保持分页与必要字段选择。
- Migration 只重定义受影响的现有 RPC，不删除表、字段、触发器、索引或四个历史 migration。

兼容层不增加新页面、权限或业务入口，也不改变平台/租户单向共享的最终设计。

## 5. 数据库迁移与回滚

新增 `20260818120000_preserve_pre_v2_supplier_catalog_boundaries.sql`：

- 原子修复商品、SKU 与价格旧 RPC；
- 对兼容查询所需组合补充索引前，先核对现有索引，避免重复；
- migration contract 禁止 `DROP TABLE`、`DROP COLUMN` 或修改四个历史 migration；
- 本地 smoke 在事务中创建两租户夹具，验证互不可见、互不可写，最后 `ROLLBACK`。

该 migration 为前向修复，不提供破坏性 down migration。若上线后需停止兼容层，先禁用相关写入口，再通过新的前向 migration 恢复函数定义；不得手工修改远端数据库。

## 6. 验证标准

- RED repository/service 测试能证明旧代码缺少价格 `tenant_id` 和商品所有权过滤。
- RED migration contract 能证明旧 RPC 缺少原子归属写入与租户目标行校验。
- GREEN 后 API 类型检查、文件大小门禁、目标单测全部通过。
- 本地 Supabase smoke 证明租户 A 无法读取或修改租户 B 的商品、SKU、价格簿和价格条目。
- 开发库只通过受控 migration workflow 应用；远端仅执行只读 migration 历史和隔离结果核验。
- 回退 PR 在兼容层与回退应用代码同时存在时才允许部署。
