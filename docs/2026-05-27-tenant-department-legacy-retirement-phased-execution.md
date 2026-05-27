# 租户部门遗留层分阶段退场执行文档

日期：2026-05-27

## 背景

员工旧字段 `employees.department_id` 已删除，当前剩余租户部门遗留层集中在：

- 运行时仍把 `/departments` 的 `id` 序列化为 `tenant_departments.legacy_department_id`。
- 后端新增/启用租户部门时仍写入旧 `departments` 表。
- 新租户初始化仍先写旧 `departments` 表，再同步 `tenant_departments`。
- 部门岗位规则仍在部分查询中用 `department_code` 作为 `tenant_department_id` 缺失时的 fallback。
- 数据库仍保留 `departments` 表和 `tenant_departments.legacy_department_id`。

## 基线审计

2026-05-27 已执行：

```bash
scripts/audit-tenant-department-retirement.sh
```

结果：

| check_code | issue_count | status |
| --- | ---: | --- |
| `employee_tenant_department_tenant_mismatch` | 0 | pass |
| `rule_department_code_mismatch` | 0 | pass |
| `rule_tenant_department_tenant_mismatch` | 0 | pass |
| `rules_missing_tenant_department` | 0 | pass |
| `tenant_department_code_template_mismatch` | 0 | pass |
| `tenant_department_legacy_missing_department` | 0 | pass |
| `enabled_tenant_department_missing_legacy` | 0 | pass |

## 阶段 1：执行计划和基线确认

### 执行范围

- 落本分阶段执行文档。
- 记录当前 linked dev 库审计结果。
- 不修改运行时代码。

### 验收

- 租户部门审计脚本执行成功。
- 提交独立 commit。

## 阶段 2：`/departments` 改为租户部门 ID

### 目标

让 `/departments` 的主 ID 语义从旧 `departments.id` 切换为 `tenant_departments.id`，同时停止部门新增/启用/编辑时写旧 `departments` 表。

### 执行范围

- `/departments` 响应中 `id` 返回 `tenant_departments.id`。
- `/departments/:id` 和 `PATCH /departments/:id` 按 `tenant_departments.id` 查询。
- 新增/启用部门只写 `tenant_departments`，不再创建旧 `departments`。
- 保留 `tenant_department_id` 响应字段，兼容当前 Admin 类型和客户端读取。

### 验收

- `rg "createLegacyDepartment|legacy_department_id: legacyDepartment|findTenantDepartmentByLegacyId" apps/api/src` 无运行时代码命中。
- `bun run api:build` 通过。
- `bun run admin:build` 通过。
- 提交独立 commit。

### 执行记录

2026-05-27：

- `/departments` 响应 `id` 已切换为 `tenant_departments.id`。
- `GET/PATCH /departments/:id` 已按 `tenant_departments.id` 查询。
- 部门新增、批量启用、编辑不再创建或反写旧 `departments`。
- `bun run api:build` 通过。
- `bun run admin:build` 通过。

## 阶段 3：部门岗位规则移除旧部门 ID fallback

### 目标

部门岗位规则运行时只使用 `tenant_department_id` 定位租户部门，不再要求租户部门必须存在 `legacy_department_id`。

### 执行范围

- `/department-post-rules` 部门列表返回 `tenant_departments.id`。
- `findDepartmentById`、`findDepartmentAndPostByIds` 只按 `tenant_departments.id` 查询。
- 配置聚合不再使用 `department_code` 兜底匹配缺失 `tenant_department_id` 的规则。
- 更新/停用规则只按 `tenant_department_id` 定位目标规则。

### 验收

- `scripts/audit-tenant-department-retirement.sh` 中 `rules_missing_tenant_department = 0`。
- `bun run api:build` 通过。
- `bun run admin:build` 通过。
- 提交独立 commit。

### 执行记录

2026-05-27：

- `/department-post-rules` 部门列表不再要求 `legacy_department_id`。
- 部门岗位规则聚合不再用 `department_code` 兜底匹配缺失 `tenant_department_id` 的规则。
- 部门查询、员工部门岗位归属校验已按 `tenant_departments.id` 查询。
- 更新/停用规则已按 `tenant_department_id` 定位目标规则。
- `scripts/audit-tenant-department-retirement.sh` 通过，`rules_missing_tenant_department = 0`。
- `bun run api:build` 通过。
- `bun run admin:build` 通过。

## 阶段 4：新租户初始化停止写旧 `departments`

### 目标

新租户初始化直接写 `tenant_departments`，不再创建旧 `departments` 记录和 `legacy_department_id` 映射。

### 执行范围

- 平台新租户默认部门初始化改为基于 `department_templates` upsert `tenant_departments`。
- 初始化结果中的 `departments_count` 保持语义为租户部门配置数。
- 租户管理员员工仍通过 `tenant_department_id` 绑定部门。

### 验收

- `rg "from\\(\"departments\"\\)|from\\(\"departments\"\\)" apps/api/src/repositories/platform-tenants.ts` 无命中。
- `bun run api:build` 通过。
- 提交独立 commit。

### 执行记录

2026-05-27：

- 新租户默认部门初始化已改为直接 upsert `tenant_departments`。
- 初始化不再写旧 `departments`，也不再设置 `legacy_department_id`。
- 租户管理员员工仍通过 `tenant_department_id` 绑定部门。
- `departments_count` 继续表示租户部门配置数。
- `rg "from\\(\"departments\"\\)|from\\('departments'\\)|legacy_department_id" apps/api/src/repositories/platform-tenants.ts` 无命中。
- `bun run api:build` 通过。

## 阶段 5：数据库遗留对象删除评估

### 目标

评估是否可以删除数据库级旧对象：

- `tenant_departments.legacy_department_id`
- `departments` 表
- `department_post_rules.department_code`

### 前置条件

- 阶段 2-4 已完成并发布。
- 生产观察窗口内没有旧字段依赖报错。
- 客户端和 Admin 不再依赖旧部门 ID。
- 已准备回滚脚本和数据快照。

### 本轮结论

本阶段不在当前代码清理回合直接执行数据库删除。数据库删除属于破坏性迁移，需要单独发布窗口和回滚方案。

### 2026-05-27 复核记录

- `apps/api/src`、`apps/admin`、`packages/domain/src` 运行时代码不再读取 `tenant_departments.legacy_department_id`。
- `apps/api/src`、`apps/admin`、`packages/domain/src` 运行时代码不再访问旧 `departments` 表。
- `apps/api/src/types/database.ts` 仍保留由当前数据库生成的 `legacy_department_id` 类型。
- `department_post_rules.department_code` 仍作为标准部门语义编码、路由参数和唯一约束组成部分使用，暂不删除。
- `scripts/audit-tenant-department-retirement.sql` 仍保留数据库遗留对象检查，直到正式执行破坏性迁移。
- `bun run api:build` 通过。

后续数据库删除建议另开阶段：

1. 新增迁移，删除 `tenant_departments.legacy_department_id` 外键、索引和列。
2. 删除旧 `departments` 表。
3. 如要删除 `department_post_rules.department_code`，需先把 `/department-post-rules/:department_code` 改为基于 `tenant_department_id` 的新路由，并调整唯一约束。
4. 重新生成 `apps/api/src/types/database.ts`。
5. 在灰度/生产窗口执行回滚预案和验收。
