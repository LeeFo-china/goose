# 多租户阶段 5G 执行记录：平台审计日志

日期：2026-05-10

## 目标

为平台超管关键操作增加统一审计日志，覆盖租户创建、租户启用/停用、租户管理员创建和平台线索分配。

## 已完成

- 新增数据库表：`platform_audit_logs`。
- 新增后端接口：`GET /platform/audit-logs`。
- 新增后端审计写入服务：
  - `platformAuditLogService.record()`
  - `platformAuditLogService.recordBestEffort()`
- 接入审计写入点：
  - 创建租户：`tenant_create`
  - 更新租户：`tenant_update`
  - 创建租户管理员：`tenant_admin_create`
  - 停用租户：`tenant_suspend`
  - 启用租户：`tenant_activate`
  - 分配平台线索：`platform_lead_assign`
- 新增 admin 页面：`/platform/audit-logs`。
- 侧边栏新增“平台审计”，仅平台超管可见。
- 审计页面支持：
  - 操作类型筛选
  - 关键词搜索
  - 分页
  - 展示操作人、目标租户、资源、结果、时间

## 文件变更

- `supabase/migrations/20260510120000_create_platform_audit_logs.sql`
- `apps/api/src/schema/platform-audit-logs.ts`
- `apps/api/src/repositories/platform-audit-logs.ts`
- `apps/api/src/services/platform-audit-logs.ts`
- `apps/api/src/controllers/platform-audit-logs/index.ts`
- `apps/api/src/routes/index.ts`
- `apps/api/src/services/platform-tenants.ts`
- `apps/api/src/services/platform-leads.ts`
- `apps/admin/app/(console)/platform/audit-logs/page.tsx`
- `apps/admin/app/(console)/platform/audit-logs/loading.tsx`
- `apps/admin/components/platform-audit-logs/platform-audit-log-types.ts`
- `apps/admin/components/platform-audit-logs/platform-audit-log-list-actions.tsx`
- `apps/admin/components/platform-audit-logs/platform-audit-logs-table.tsx`
- `apps/admin/components/layout/admin-nav.tsx`
- `docs/2026-05-09-multi-tenant-phase-5-platform-admin-todolist.md`
- `docs/application_integration_documentation/2026-05-10-phase-5g-admin-platform-audit-logs.md`
- `docs/application_integration_documentation/2026-05-10-phase-5g-miniprogram-impact-note.md`

## 表结构摘要

`platform_audit_logs` 字段：

- `action`：操作类型。
- `actor_employee_id`：平台操作员工。
- `actor_user_id`：平台操作用户。
- `target_tenant_id`：操作影响的目标租户。
- `resource_type`：资源类型。
- `resource_id`：资源 ID。
- `resource_label`：资源可读名称。
- `status`：操作结果，`success` / `failure`。
- `summary`：操作摘要。
- `metadata`：操作上下文快照。
- `created_at`：发生时间。

## 写入策略

审计写入采用 best-effort 方式，不阻断业务主流程。

原因：

- 当前租户创建、启用、停用、线索分配已经是独立业务操作。
- 如果业务操作成功但审计写入失败，不应该让用户误以为业务失败。
- 后续如需强一致审计，可把关键平台操作改造成数据库 RPC，在同一事务里同时写业务表和审计表。

## 平台线索分配日志关系

平台线索分配现在有两层日志：

1. `platform_lead_assign_logs`
   - 业务明细日志。
   - 记录平台线索分配、客户去重、关联客户等细节。

2. `platform_audit_logs`
   - 平台统一审计日志。
   - 记录平台超管何时把哪条线索分配给哪个租户。

两者不互相替代。

## 需要执行

本阶段包含数据库 migration，需要执行：

```bash
supabase db push
```

## 验收项

- 执行 migration 后 `platform_audit_logs` 表存在。
- 平台超管创建租户后生成 `tenant_create` 审计记录。
- 创建租户且带管理员时生成 `tenant_admin_create` 审计记录。
- 停用/启用租户后生成对应审计记录。
- 分配平台线索后生成 `platform_lead_assign` 审计记录。
- admin `/platform/audit-logs` 能查看、筛选、搜索、分页。
- 非平台超管不能访问平台审计页面。

## 不包含

- 不做审计日志导出。
- 不做失败操作审计。
- 不做不可篡改链式审计。
- 不改变小程序端逻辑。
