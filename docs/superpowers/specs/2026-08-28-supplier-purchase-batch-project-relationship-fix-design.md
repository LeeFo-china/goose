# 采购批次项目关系查询修复设计

## 背景

dev revision `b6d00129` 已消除采购批次路由能力映射错误，但员工态请求
`GET /supplier-purchase-batches?page=1&pageSize=20` 进入 repository 后返回
`PGRST200`。PostgREST 明确指出查询使用 `project_id` hint 时，无法在
`supplier_purchase_batches` 与 `projects` 之间找到关系。

## 根因

`SUPPLIER_PURCHASE_BATCH_SELECT` 使用：

```text
project:projects!project_id(id,name,status)
```

而 migration 定义的是租户安全复合外键：

```text
supplier_purchase_batches_project_tenant_fkey
  (project_id, tenant_id) -> projects(id, tenant_id)
```

Repository 在 Supabase 返回错误后先抛出 `DB_ERROR`，因此失败发生在
PostgREST 关系解析阶段，尚未进入 `SupplierPurchaseBatchDetailSchema`。

## 方案

将关系 hint 改为完整外键约束名：

```text
project:projects!supplier_purchase_batches_project_tenant_fkey(id,name,status)
```

不删除 `project` 嵌套对象，也不增加第二次项目查询。这样保持现有响应契约、
单次分页查询和租户复合外键语义，不引入 N+1。

## 测试与发布

1. 在 repository 测试中先断言 SELECT 必须包含完整约束名且不得使用
   `!project_id`，确认当前实现失败。
2. 单行修正共享 SELECT；该常量同时覆盖列表与详情查询。
3. 运行 repository/migration contract、API 类型检查、API 构建和默认稳定测试。
4. 合入并推送 `main`，等待 dev 自动发布验证 API revision/health。
5. 复测无凭证路由可达性；员工态 200 由持有 dev 员工凭证的小程序侧验收。

## 边界

- 不修改 Orange 仓库。
- 不调整接口路径、分页、权限或响应字段。
- 不新增 migration；数据库已有正确复合外键。
- 不手工修改远端数据库或 schema cache。
