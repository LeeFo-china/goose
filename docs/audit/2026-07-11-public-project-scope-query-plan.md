# 公开项目公司范围查询计划审计

日期：2026-07-11

## 目标查询

访客公开项目列表改为按项目根字段 `tenant_id` 过滤，并按 `created_at DESC, id DESC` 分页：

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, tenant_id, created_at
FROM public.projects
WHERE tenant_id IN ('<tenant-a>', '<tenant-b>')
  AND visibility_status <> 'hidden'
  AND (
    status IN (
      'signed',
      'design_finalized',
      'pending_start',
      'started',
      'constructing',
      'acceptance'
    )
    OR visibility_status = 'public'
  )
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

## 本地 migration 索引核对

已在 migration 中找到相关既有索引：

- `supabase/migrations/20260509140000_add_default_tenant_context.sql`
  - `idx_projects_tenant_created_at ON public.projects(tenant_id, created_at DESC)`
  - `idx_projects_tenant_status ON public.projects(tenant_id, status)`
- `supabase/migrations/20260412112000_add_style_tags_and_visibility_status_to_projects.sql`
  - `idx_projects_visibility_status ON public.projects(visibility_status)`

当前实现的查询会先按 `tenant_id` 限定候选集合，再按公开可见条件过滤，并使用 `.range()` 做分页。

## EXPLAIN 状态

本次没有对远端或代表性测试库执行 `EXPLAIN (ANALYZE, BUFFERS)`：

- 当前任务上下文没有提供可用于目标环境的代表性 tenant ID。
- 不应在未知环境上手工执行远端 DDL/DML。
- 本次也没有创建新的索引 migration。

上线前如需进一步确认，应在测试环境用上方 SQL 替换代表性 tenant ID 后执行 `EXPLAIN (ANALYZE, BUFFERS)`，记录：

- 是否命中 `idx_projects_tenant_created_at`；
- 是否出现高成本顺序扫描；
- 排序是否需要额外昂贵 sort；
- 扫描行数、返回行数、耗时与 buffer 命中情况。

## 结论

暂不新增 `idx_projects_public_scope_tenant_created` 之类的部分索引。

原因：本地 migration 已有 `(tenant_id, created_at DESC)` 基础索引，且缺少代表性 `EXPLAIN ANALYZE` 证据证明现有索引不足。根据项目规则，不能为了性能规则随意新增索引；如后续 EXPLAIN 证明存在顺序扫描或昂贵排序，再通过 `supabase/migrations/` 新增索引。
