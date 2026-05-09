# 多租户阶段 2 执行记录：核心业务隔离 MVP

日期：2026-05-09

## 本阶段已落地范围

### 客户

- 客户列表按 `authContext.tenantId` 过滤。
- 客户详情、详情增强接口按 `tenant_id` 校验。
- 客户创建自动写入当前 `tenant_id`。
- 客户更新、作废、批量分配负责人均限制当前租户。
- 客户房产列表、创建、设为主房产、更新均限制当前租户。
- 客户手机号查看/拨打/复制接口按租户过滤。
- 客户手机号唯一索引从全局唯一调整为租户内唯一。
- 客户登录身份 `user_id` 唯一索引从全局唯一调整为租户内唯一，为后续“同一客户属于多家公司”铺路。

### 项目

- 项目列表、状态列表按 `tenant_id` 过滤。
- 项目详情、项目成员读取按租户校验。
- 项目创建自动写入当前 `tenant_id`。
- 项目创建/更新时校验关联客户、房产、设计师、监理属于当前租户。
- 项目更新、作废通过 `tenant_id` 限制。
- 项目创建客户选择器、员工选择器按当前租户过滤。
- 项目权限可见 ID 计算增加租户过滤。

### 员工

- 员工列表按 `tenant_id` 过滤。
- 员工详情、带部门详情、带岗位列表按租户限制。
- 员工创建自动写入当前 `tenant_id`。
- 员工更新、离职/删除按租户限制。
- 部门范围员工 ID 查询增加租户过滤。

### 房产

- 房产列表按 `tenant_id` 过滤。
- 房产详情、创建、更新按租户限制。
- 房产创建/更新时校验客户属于当前租户。

## 数据库变更

新增 migration：

```text
supabase/migrations/20260509143000_tenant_scope_core_unique_indexes.sql
```

变更内容：

- 删除全局 `employees_phone_unique`。
- 删除全局 `customers_phone_unique`。
- 新增 `employees(tenant_id, phone)` 唯一索引。
- 新增 `customers(tenant_id, phone)` 唯一索引。
- 删除全局 `customers_user_id_unique`。
- 新增 `customers(tenant_id, user_id)` 唯一索引。
- 补充项目、客户核心租户复合索引。

## 暂缓项

以下内容没有在本次 MVP 中强行完成：

- `departments/posts/roles` 的完整租户化。
- `roles.code`、`departments.code`、`posts.code` 改为租户内唯一。
- `department_post_rules`、`project_member_role_post_rules` 从 code 外键迁移到租户内映射。
- 营销、H5、摄像头、验收、施工日志等非核心模块的全量租户化。

原因：

- 这些模块存在 code 外键和历史模板数据，直接调整唯一约束会影响岗位规则、项目成员规则和权限种子数据。
- 为降低阶段 2 风险，本次先完成客户、项目、员工、房产四个核心业务入口的租户隔离。

## 验证

已执行：

```text
bun run api:typecheck
bun run api:build
pnpm --filter @gooes/admin build
```

验证结果均通过。

## 后续建议

阶段 2 后续补齐建议单独开一个子阶段：

```text
阶段 2B：组织、岗位、角色租户化
```

重点处理：

- `departments/posts/roles` 增加 `tenant_id`。
- 将 code 唯一约束改为租户内唯一。
- 调整规则表外键设计，避免 code 全局唯一依赖。
- 员工角色分配校验 employee 与 role 属于同一租户。
- 补双租户集成测试脚本。
