# 旧 departments 数据库对象分阶段退场执行文档

日期：2026-05-27

## 目标

分阶段删除数据库遗留对象：

- `tenant_departments.legacy_department_id`
- 旧 `departments` 表

本轮不删除：

- `department_post_rules.department_code`

原因：`department_code` 仍是标准部门语义编码、当前 `/department-post-rules/:department_code` 路由参数和唯一约束组成部分。删除它需要另立“部门岗位规则路由和唯一约束迁移”阶段。

## 风险原则

- 不直接 `DROP TABLE departments`。
- 先执行只读预检，确认应用代码、RPC 函数和数据状态都不依赖旧对象。
- 第一轮数据库迁移只做“软删除”：备份旧数据、删除 `legacy_department_id`、把 `departments` 改名为 `departments_retired_YYYYMMDD`。
- 软删除稳定一个发布窗口后，再单独硬删除备份表和 retired 表。
- 生产执行前必须准备回滚 SQL。

## 阶段 0：预检与计划落地

### 执行范围

- 落本执行文档。
- 新增只读预检脚本：
  - 检查 `departments` 表是否存在。
  - 检查 `tenant_departments.legacy_department_id` 是否存在。
  - 检查当前函数定义是否仍引用 `public.departments` 或 `legacy_department_id`。
  - 检查 `department_post_rules.tenant_department_id` 是否有缺失。

### 验收

- 只读预检脚本可执行。
- linked dev 库预检无 blocker。
- 提交独立 commit。

### 执行记录

2026-05-27 linked dev 预检结果：

| check_code | issue_count | status |
| --- | ---: | --- |
| `runtime_function_refs_legacy_department` | 0 | pass |
| `rules_missing_tenant_department` | 0 | pass |
| `departments_table_exists` | 1 | observe |
| `tenant_departments_legacy_column_exists` | 1 | observe |

结论：无 blocker。旧表和旧列仍存在，符合阶段 1 软删除前状态。

## 阶段 1：准备软删除迁移和回滚脚本

### 执行范围

- 新增 Supabase migration：
  - 备份 `departments` 到 `_backup_departments_20260527`。
  - 备份 `tenant_departments.id/tenant_id/code/legacy_department_id` 到 `_backup_tenant_department_legacy_20260527`。
  - 删除 `tenant_departments.legacy_department_id` 外键和索引。
  - 删除 `tenant_departments.legacy_department_id` 列。
  - 将 `departments` 改名为 `departments_retired_20260527`。
- 新增回滚 SQL：
  - 将 `departments_retired_20260527` 改回 `departments`。
  - 恢复 `tenant_departments.legacy_department_id` 列和值。
  - 恢复外键和索引。

### 验收

- `bun run api:build` 通过。
- 迁移 SQL 只包含软删除，不包含硬删除。
- 回滚 SQL 可读且覆盖恢复路径。
- 提交独立 commit。

### 执行记录

2026-05-27：

- 已新增软删除 migration：`supabase/migrations/20260527210000_soft_retire_legacy_departments.sql`。
- 已新增回滚脚本：`scripts/rollback-tenant-department-legacy-soft-retirement.sql`。
- migration 只做备份、删除 `legacy_department_id`、重命名 `departments`，不硬删除 retired/backup 表。
- `bun run api:build` 通过。

## 阶段 2：迁移窗口执行软删除

### 前置条件

- 当前代码已发布到目标环境。
- 小程序端已确认不依赖旧部门 ID。
- 阶段 0 预检在目标环境通过。
- 已确认执行窗口和回滚负责人。

### 执行命令

```bash
supabase db push
```

或在目标环境执行对应 migration SQL。

### 验收 SQL

```sql
select to_regclass('public.departments') as departments_table;
select to_regclass('public.departments_retired_20260527') as retired_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tenant_departments'
  and column_name = 'legacy_department_id';
```

期望：

- `departments_table` 为 `null`
- `retired_table` 为 `public.departments_retired_20260527`
- `legacy_department_id` 查询无结果

### 业务验收

- Admin 组织架构页可打开。
- 员工新增/编辑可选择部门。
- 岗位新增和部门岗位规则配置可保存。
- 小程序员工登录正常。
- `GET /employee/bootstrap` 正常。
- 项目权限和员工首页个性化命中正常。

### 执行记录

2026-05-27 linked dev：

- `supabase db push --linked --dry-run` 通过，待推送 migration 为 `20260527210000_soft_retire_legacy_departments.sql`。
- `supabase db push --linked` 已执行并应用 `20260527210000_soft_retire_legacy_departments.sql`。
- 执行后结构验收：

| check | actual |
| --- | --- |
| `to_regclass('public.departments')` | `null` |
| `to_regclass('public.departments_retired_20260527')` | `departments_retired_20260527` |
| `to_regclass('public._backup_departments_20260527')` | `_backup_departments_20260527` |
| `to_regclass('public._backup_tenant_department_legacy_20260527')` | `_backup_tenant_department_legacy_20260527` |
| `tenant_departments.legacy_department_id` | 不存在 |

- `scripts/audit-legacy-departments-db-retirement.sh` 通过：

| check_code | issue_count | status |
| --- | ---: | --- |
| `runtime_function_refs_legacy_department` | 0 | pass |
| `rules_missing_tenant_department` | 0 | pass |
| `departments_table_exists` | 0 | observe |
| `tenant_departments_legacy_column_exists` | 0 | observe |

- 已重新生成 `apps/api/src/types/database.ts`，`tenant_departments` 类型中不再包含 `legacy_department_id`。
- `apps/api/src/types/database.ts` 中剩余的 `legacy_department_id` 仅来自 `_backup_tenant_department_legacy_20260527` 回滚备份表类型。
- 已同步更新租户部门退场审计脚本，避免继续访问已软退役的旧列和旧表。
- `scripts/audit-tenant-department-retirement.sh` 通过，所有 blocker 检查 issue_count 均为 0。
- `rg "from\(['\"]departments['\"]\)|legacy_department_id" apps/api/src apps/admin packages/domain/src --glob '!apps/api/src/types/database.ts'` 无命中。
- `bun run api:build` 通过。

## 阶段 3：软删除观察窗口

### 观察重点

- 无 `relation "departments" does not exist`。
- 无 `column "legacy_department_id" does not exist`。
- 新租户初始化正常。
- 员工登录、员工首页、组织架构、部门岗位规则正常。

### 回滚方式

如出现旧对象依赖，执行：

```bash
supabase db query --linked --file scripts/rollback-tenant-department-legacy-soft-retirement.sql
```

执行后重新验收：

- `public.departments` 恢复。
- `tenant_departments.legacy_department_id` 恢复。
- 外键和索引恢复。

## 阶段 4：硬删除 retired 和 backup 对象

### 前置条件

- 阶段 2 已执行。
- 阶段 3 至少稳定一个发布窗口。
- 无旧对象依赖日志。
- 已确认不需要再回滚旧部门表。

### 执行范围

单独新增 migration 删除：

- `departments_retired_20260527`
- `_backup_departments_20260527`
- `_backup_tenant_department_legacy_20260527`

### 验收

- 目标库中上述 3 张表均不存在。
- Admin、小程序核心链路回归通过。
