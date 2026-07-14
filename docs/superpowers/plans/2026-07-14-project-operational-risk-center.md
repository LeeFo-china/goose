# 项目运营风险中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一次租户隔离的数据库聚合 RPC 识别五类项目交付/客服风险，在 Admin 提供可筛选、可追溯、可跳转处理的风险工作台，并提供不参与业务判定的按需 AI 经营摘要。

**Architecture:** PostgreSQL `STABLE SECURITY INVOKER` RPC 负责规则判定、汇总、稳定排序和分页；API 严格保持 Controller → Service → Repository 分层，Controller 校验租户与权限，Repository 只调用一次 RPC，Service 校验返回结构并生成中文展示与现有页面跳转；Admin 首屏服务端取数，后续筛选通过带 `AbortController` 的后台代理请求更新，AI 摘要使用独立 POST 请求和独立错误状态。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod 4.4、Supabase/PostgreSQL、Next.js 15、React 19、shadcn/ui、Radix、Tailwind CSS、TanStack Table、Bun test、Playwright、Impeccable UI audit。

---

## 已确认边界

- 首版只覆盖工作流任务逾期、施工工序延期、施工日志缺失、验收整改、高优先级客服工单，不接入财务风险。
- 风险由底层事实动态计算；底层事实恢复后风险自动消失，不新增风险实例表、认领状态、忽略或手工关闭。
- AI 只读取服务端重新查询的前 20 条脱敏事实，不能判定风险、修改状态或调用业务 Service。
- 访问者必须同时具有 `dashboard.read`、`project.read`，且 `project.read` 最终 scope 为 `all`。
- Admin 入口为 `/project-health`，导航“项目风险”放在“概览”之后。
- 不修改 `/Users/leefo/Public/work/orange`，不引入 Redis、队列、新 UI 库或新测试库。
- 所有 TS/TSX 文件保持小于 500 行；SQL 函数、索引、权限只通过 migration 管理。
- 本计划实施前使用 `using-git-worktrees` 建立隔离 worktree；不要直接在当前 `main` 上开始功能代码。

## 交付阶段与检查点

1. **事实层检查点：** shared contract、RPC migration、SQL fixture、权限收紧和 Supabase 类型生成通过。
2. **API 检查点：** GET 列表、POST AI 摘要、权限边界、单次 RPC 和错误包装通过。
3. **Admin 检查点：** 导航、筛选、KPI、表格、分页、AI 面板和响应式状态通过。
4. **质量检查点：** typecheck/build、SQL smoke、P95、浏览器 smoke 和 `$impeccable audit` 通过。
5. **Dev 发布检查点：** 明确目标数据库后应用 migration，确认 Local/Remote 对齐，再部署 API/Admin 和执行发布后 smoke。

## 文件责任地图

### Shared domain

- Create: `packages/domain/src/project-operational-risk.ts`
- Create: `packages/domain/src/project-operational-risk.test.ts`
- Modify: `packages/domain/src/index.ts`
  - 固化风险枚举、RPC 结构、API 展示项和 AI 输出 Zod contract，供 API/Admin 共用。

### Database

- Create: `supabase/migrations/20260714180000_project_operational_risk_rpc.sql`
  - 创建单次聚合 RPC、函数注释和 execute 权限。
- Create: `supabase/tests/project_operational_risk_rpc.sql`
  - 事务内可重复 fixture 与断言，结束时回滚。
- Create: `supabase/tests/project_operational_risk_explain.sql`
  - 只读 EXPLAIN 模板，从 psql 变量读取已选定的代表 tenant。
- Conditional create: `supabase/migrations/20260714183000_project_operational_risk_indexes.sql`
  - 只有代表性 `EXPLAIN (ANALYZE, BUFFERS)` 证明现有索引不足时创建。
- Modify mechanically: `apps/api/src/types/database.ts`
  - 本地 migration 应用后由 Supabase CLI 生成，禁止手写 RPC 类型。

### API

- Create: `apps/api/src/schema/project-health.ts`
- Create: `apps/api/src/schema/project-health.test.ts`
- Create: `apps/api/src/repositories/project-operational-risks.ts`
- Create: `apps/api/src/repositories/project-operational-risks.test.ts`
- Create: `apps/api/src/services/project-operational-risk-presentation.ts`
- Create: `apps/api/src/services/project-operational-risk-presentation.test.ts`
- Create: `apps/api/src/services/project-operational-risks.ts`
- Create: `apps/api/src/services/project-operational-risks.test.ts`
- Create: `apps/api/src/services/project-operational-risk-ai.ts`
- Create: `apps/api/src/services/project-operational-risk-ai.test.ts`
- Create: `apps/api/src/services/project-operational-risk-migration-contract.test.ts`
- Create: `apps/api/src/controllers/project-health/index.ts`
- Create: `apps/api/src/controllers/project-health/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Create: `apps/api/src/scripts/project-operational-risk-performance-smoke.ts`

### Admin

- Create: `apps/admin/app/(console)/project-health/page.tsx`
- Create: `apps/admin/app/(console)/project-health/loading.tsx`
- Create: `apps/admin/app/(console)/project-health/project-health-page-layout.test.ts`
- Create: `apps/admin/components/project-health/project-health-api.ts`
- Create: `apps/admin/components/project-health/project-health-api.test.ts`
- Create: `apps/admin/components/project-health/project-health-query.ts`
- Create: `apps/admin/components/project-health/project-health-query.test.ts`
- Create: `apps/admin/components/project-health/project-health-display.ts`
- Create: `apps/admin/components/project-health/project-health-display.test.ts`
- Create: `apps/admin/components/project-health/project-health-client-shell.tsx`
- Create: `apps/admin/components/project-health/project-health-summary-cards.tsx`
- Create: `apps/admin/components/project-health/project-health-filters.tsx`
- Create: `apps/admin/components/project-health/project-health-table.tsx`
- Create: `apps/admin/components/project-health/project-health-pagination.tsx`
- Create: `apps/admin/components/project-health/project-health-ai-summary.tsx`
- Create: `apps/admin/components/layout/admin-nav-visibility.ts`
- Create: `apps/admin/components/layout/admin-nav-visibility.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/layout/admin-nav.tsx`

### Verification evidence

- Create: `docs/audit/2026-07-14-project-operational-risk-performance.md`
  - 记录代表性 tenant、EXPLAIN、RPC/API P50/P95、索引决策和慢查询结论。
- Create: `docs/audit/2026-07-14-project-operational-risk-ui-audit.md`
  - 记录 1440/1024/768/390 截图、键盘/对比度结果和 Impeccable 评分。

## Task 0: 建立隔离工作区并锁定基线

**Files:**

- Reference: `docs/superpowers/specs/2026-07-14-project-operational-risk-center-design.md`
- Reference: `PRODUCT.md`
- Reference: `DESIGN.md`

- [ ] **Step 1: 使用 `using-git-worktrees` 创建隔离 worktree**

选择不与现有 worktree 冲突的目录和分支，例如：

```bash
git worktree add .worktrees/project-operational-risk-center -b feature/project-operational-risk-center main
```

Expected: 新 worktree 位于 `feature/project-operational-risk-center`，原工作区未跟踪报告 `docs/2026-07-14-ai-business-operations-growth-report.md` 不被移动、暂存或提交。

- [ ] **Step 2: 在新 worktree 核对基线状态**

```bash
git status --short --branch
git log -1 --oneline
```

Expected: 工作区干净，基线包含设计规格提交 `530aec65` 或其后续 main 祖先。

- [ ] **Step 3: 运行最小静态基线**

```bash
bun run api:typecheck
pnpm --dir packages/domain build
pnpm --dir apps/admin typecheck
```

Expected: 三条命令均退出 0；如果基线已失败，先记录失败且不要把无关修复混入本功能。

## Task 1: 锁定共享风险 contract 和请求 Schema

**Files:**

- Create: `packages/domain/src/project-operational-risk.ts`
- Create: `packages/domain/src/project-operational-risk.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/api/src/schema/project-health.ts`
- Create: `apps/api/src/schema/project-health.test.ts`

- [ ] **Step 1: 写共享 contract 的失败测试**

在 `packages/domain/src/project-operational-risk.test.ts` 固化：

```ts
import { describe, expect, test } from "bun:test";
import {
  PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES,
  PROJECT_OPERATIONAL_RISK_TYPE_VALUES,
  ProjectOperationalRiskAiSummarySchema,
  ProjectOperationalRiskRpcPageSchema,
} from "./index";

describe("project operational risk contract", () => {
  test("exports the five v1 risk types and two severities", () => {
    expect(PROJECT_OPERATIONAL_RISK_TYPE_VALUES).toEqual([
      "workflow_task_overdue",
      "procedure_overdue",
      "missing_project_log",
      "acceptance_rework",
      "service_ticket",
    ]);
    expect(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES).toEqual([
      "warning",
      "danger",
    ]);
  });

  test("rejects a malformed RPC fact instead of accepting partial data", () => {
    const result = ProjectOperationalRiskRpcPageSchema.safeParse({
      generated_at: new Date().toISOString(),
      business_date: "2026-07-14",
      summary: {},
      diagnostics: {},
      items: [{ risk_type: "unknown" }],
      pagination: {},
    });
    expect(result.success).toBe(false);
  });

  test("bounds AI priorities to five items", () => {
    expect(ProjectOperationalRiskAiSummarySchema.safeParse({
      overview: "先处理严重延期。",
      priorities: Array.from({ length: 6 }, (_, index) => ({
        risk_key: `risk-${index}`,
        reason: "已逾期",
        recommended_action: "核对计划",
      })),
      cautions: [],
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行失败测试**

```bash
bun test packages/domain/src/project-operational-risk.test.ts
```

Expected: FAIL，模块和导出尚不存在。

- [ ] **Step 3: 实现严格共享 Schema**

在 `project-operational-risk.ts` 定义并导出：

```ts
import { z } from "zod";

export const PROJECT_OPERATIONAL_RISK_TYPE_VALUES = [
  "workflow_task_overdue",
  "procedure_overdue",
  "missing_project_log",
  "acceptance_rework",
  "service_ticket",
] as const;
export const PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES = [
  "warning",
  "danger",
] as const;
export const PROJECT_OPERATIONAL_RISK_SOURCE_TYPE_VALUES = [
  "workflow_task",
  "procedure_assignment",
  "project_log_gap",
  "project_acceptance",
  "customer_service_ticket",
] as const;

const EvidenceValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const ProjectOperationalRiskFactSchema = z.strictObject({
  risk_key: z.string().trim().min(1).max(200),
  risk_type: z.enum(PROJECT_OPERATIONAL_RISK_TYPE_VALUES),
  severity: z.enum(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES),
  project_id: z.uuid(),
  project_name: z.string().trim().min(1).max(300),
  project_status: z.string().trim().min(1).max(100),
  source_type: z.enum(PROJECT_OPERATIONAL_RISK_SOURCE_TYPE_VALUES),
  source_id: z.uuid(),
  assignee_employee_id: z.uuid().nullable(),
  assignee_employee_name: z.string().trim().max(100).nullable(),
  occurred_at: z.iso.datetime({ offset: true }).nullable(),
  due_at: z.iso.datetime({ offset: true }).nullable(),
  overdue_days: z.number().int().nonnegative().nullable(),
  evidence: z.record(z.string(), EvidenceValueSchema),
});
```

同文件继续定义 `ProjectOperationalRiskRpcPageSchema`，要求：

- `summary` 精确包含 `total/danger/warning/info/affected_projects/by_type`；
- `by_type` 精确包含五种风险类型，值为非负整数；
- `diagnostics.workflow_tasks_missing_due_at` 为非负整数；
- `pagination` 使用 RPC 原始字段 `page/page_size/total/total_pages`；
- API 展示项在 fact 基础上增加严格的 `title/description/action.label/action.href`；
- AI 摘要 `overview` 最大 800 字，`priorities` 最大 5 条，每个文本最大 300 字，`cautions` 最大 5 条。

在 `packages/domain/src/index.ts` 增加：

```ts
export * from "./project-operational-risk";
```

- [ ] **Step 4: 写 API 请求 Schema 的失败测试**

`apps/api/src/schema/project-health.test.ts` 至少覆盖：默认 `page=1/pageSize=20`、`pageSize=101` 拒绝、空筛选归一化为 `undefined`、未知 risk type/severity 拒绝、keyword 最大 100 字、AI body 不允许客户端上传 `items`。

- [ ] **Step 5: 实现 API 请求 Schema**

`apps/api/src/schema/project-health.ts` 复用 `PaginationQuerySchema` 和 domain 枚举，导出：

```ts
export const ProjectOperationalRiskListQuerySchema = PaginationQuerySchema.extend({
  risk_type: optionalQueryValue(z.enum(PROJECT_OPERATIONAL_RISK_TYPE_VALUES)),
  severity: optionalQueryValue(z.enum(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES)),
  keyword: optionalQueryValue(z.string().trim().max(100, "项目关键词不能超过 100 个字符")),
});

export const ProjectOperationalRiskAiSummaryBodySchema = z.strictObject({
  risk_type: optionalJsonValue(z.enum(PROJECT_OPERATIONAL_RISK_TYPE_VALUES)),
  severity: optionalJsonValue(z.enum(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES)),
  keyword: optionalJsonValue(z.string().trim().max(100)),
});
```

`optionalQueryValue` 同现有 `task-center.ts` 处理 `""/"undefined"/"null"`；`optionalJsonValue` 只处理 `null`、空字符串和真实值，不接受数组或对象。

- [ ] **Step 6: 验证、构建共享包并提交**

```bash
bun test packages/domain/src/project-operational-risk.test.ts
pnpm --dir packages/domain build
cd apps/api && bun test src/schema/project-health.test.ts
cd ../..
git add packages/domain/src apps/api/src/schema/project-health.ts apps/api/src/schema/project-health.test.ts
git commit -m "feat(project-health): 定义风险中心共享契约"
```

Expected: domain/API Schema 测试通过，domain build 退出 0。

## Task 2: 先用合同测试约束 RPC migration

**Files:**

- Create: `apps/api/src/services/project-operational-risk-migration-contract.test.ts`
- Create: `supabase/migrations/20260714180000_project_operational_risk_rpc.sql`

- [ ] **Step 1: 写 migration 源码合同失败测试**

测试用 `readFileSync` 读取准确 migration 文件，断言：

```ts
expect(sql).toContain("get_project_operational_risk_page");
expect(sql).toContain("language sql");
expect(sql).toContain("stable");
expect(sql).toContain("security invoker");
expect(sql).toContain("set search_path = public");
expect(sql).toContain("union all");
expect(sql).toContain("workflow_tasks_missing_due_at");
expect(sql).toContain("revoke all on function");
expect(sql).toContain("from public, anon, authenticated");
expect(sql).toContain("grant execute on function");
expect(sql).toContain("to service_role");
expect(sql).not.toContain("security definer");
```

再断言 SQL 中存在所有五类 `risk_key` 前缀、`p_page_size` 上限 100、`tenant_id = p_tenant_id` 约束、`status <> 'invalid'` 和最终 `offset/limit`。

- [ ] **Step 2: 运行失败测试**

```bash
cd apps/api && bun test src/services/project-operational-risk-migration-contract.test.ts
```

Expected: FAIL，migration 尚不存在。

- [ ] **Step 3: 创建准确函数签名和输入归一化 CTE**

Migration 以以下签名开始：

```sql
create or replace function public.get_project_operational_risk_page(
  p_tenant_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_risk_type text default null,
  p_severity text default null,
  p_keyword text default null,
  p_timezone_name text default 'Asia/Shanghai'
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
with input as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
    case
      when p_risk_type is null then null
      when p_risk_type in (
        'workflow_task_overdue', 'procedure_overdue', 'missing_project_log',
        'acceptance_rework', 'service_ticket'
      ) then p_risk_type
      else '__invalid__'
    end as risk_type,
    case
      when p_severity is null then null
      when p_severity in ('warning', 'danger') then p_severity
      else '__invalid__'
    end as severity,
    nullif(left(btrim(coalesce(p_keyword, '')), 100), '') as keyword,
    coalesce(
      (select name from pg_timezone_names where name = p_timezone_name limit 1),
      'Asia/Shanghai'
    ) as timezone_name
), normalized as (
  select
    input.*,
    timezone(input.timezone_name, statement_timestamp()) as local_now,
    timezone(input.timezone_name, statement_timestamp())::date as business_date
  from input
)
```

非法 type/severity 使用不可能匹配的哨兵，不得把非法筛选归一化为 `NULL` 后返回全量。

- [ ] **Step 4: 实现租户项目与五个风险 CTE**

每个 CTE 必须投影完全相同的列：

```text
risk_key, risk_type, severity, project_id, project_name, project_status,
source_type, source_id, assignee_employee_id, assignee_employee_name,
occurred_at, due_at, overdue_days, evidence
```

具体实现约束：

1. `tenant_projects` 只选 `id/name/status`，条件为 `projects.tenant_id = p_tenant_id` 且 `coalesce(status, '') <> 'invalid'`。
2. `workflow_task_risks` 先以 `workflow_tasks.tenant_id/status/due_at` 过滤，再联 `workflow_instances`，用 `subject_type='project'` 和 `subject_id = project_id::text` 避免不安全 UUID cast；以本地 business date 计算自然日，0–2 天 warning，>=3 天 danger。
3. `procedure_risks` 先按 `project_procedure_assignments.tenant_id/status/planned_end_date` 过滤；1–2 天 warning，>=3 天 danger。
4. `active_project_procedures` 对每个项目按 `in_progress` 优先、`planned_start_date`、`id` 稳定选择一条活动工序；`project_log_context` 用 `LATERAL` 仅查询该项目最近日志；本地时间到 18:00 且当日无日志才生成一条风险，开始至少 2 天且最近日志为空/超过 48 小时为 danger。
5. `acceptance_risks` 只选当前租户、`status='rejected'` 的验收；责任人使用 `initiator_id`，evidence 只含 `acceptance_type/stage_code/reject_source/rejected_at/initiator_id`，不得含 `reject_reason`。
6. `service_ticket_risks` 只选关联项目、未完结且 `high/urgent` 的工单；`urgent` 或 `high` 创建超过 48 小时为 danger；evidence 只含 `ticket_no/category/priority/status/created_at`，不得含 `content/images/customer_id`。
7. 其他 evidence allowlist 固定为：工作流 `task_title/node_key/status/due_at`；工序 `stage_code/node_key/status/planned_start_date/planned_end_date`；日志缺失 `stage_code/procedure_status/planned_start_date/last_log_at/business_date`。不得使用 `to_jsonb(source_row)` 整行展开。
8. 员工只联 `employees.id/name`，不读取电话、头像或 user id。
9. `workflow_tasks_missing_due_at` 只统计当前租户 `tenant_projects` 关联的 pending project workflow task，不统计其他 subject type 或其他租户。

- [ ] **Step 5: 实现合并、去重、筛选、汇总和数据库分页**

按规格建立以下合并与去重结构：

```sql
risk_facts as (
  select * from workflow_task_risks
  union all select * from procedure_risks
  union all select * from missing_project_log_risks
  union all select * from acceptance_risks
  union all select * from service_ticket_risks
),
deduplicated as (
  select *
  from (
    select risk_facts.*,
      row_number() over (partition by risk_key order by occurred_at desc nulls last) as duplicate_rank
    from risk_facts
  ) ranked
  where duplicate_rank = 1
),
filtered as (
  select deduplicated.*
  from deduplicated
  cross join normalized
  where (normalized.risk_type is null or deduplicated.risk_type = normalized.risk_type)
    and (normalized.severity is null or deduplicated.severity = normalized.severity)
    and (
      normalized.keyword is null
      or deduplicated.project_name ilike '%' || normalized.keyword || '%'
      or deduplicated.project_id::text = normalized.keyword
    )
),
summary as (
  select
    count(*)::integer as total,
    count(*) filter (where severity = 'danger')::integer as danger,
    count(*) filter (where severity = 'warning')::integer as warning,
    count(distinct project_id)::integer as affected_projects
  from filtered
),
paged as (
  select *
  from filtered
  order by
    case severity when 'danger' then 0 else 1 end,
    overdue_days desc nulls last,
    occurred_at desc nulls last,
    risk_key
  offset ((select page - 1 from normalized) * (select page_size from normalized))
  limit (select page_size from normalized)
)
```

`filtered` 仅匹配风险类型、严重度、`project_name ILIKE` 或完整 `project_id::text`；`summary` 必须基于筛选后的完整集合，不基于 `paged`。

- [ ] **Step 6: 构造空结果也完整的 JSON，并收紧权限**

最终 `jsonb_build_object` 必须始终产生：

```text
generated_at, business_date, summary, diagnostics, items, pagination
```

`summary.info` 固定为 0；`summary.by_type` 必须显式给出五个 key，即使某类数量为 0；`diagnostics.workflow_tasks_missing_due_at` 由独立诊断 CTE 提供。空集合对每个聚合字段分别使用 `coalesce(summary.total, 0)` 等明确表达式，items 使用 `'[]'::jsonb`；`total_pages` 为 `ceil(total/page_size)`，0 条时为 0。函数末尾添加准确签名的：

```sql
revoke all on function public.get_project_operational_risk_page(
  uuid, integer, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_project_operational_risk_page(
  uuid, integer, integer, text, text, text, text
) to service_role;
```

添加函数注释，说明动态风险、租户隔离、分页上限和无业务状态写入。

- [ ] **Step 7: 运行合同测试并提交**

```bash
cd apps/api && bun test src/services/project-operational-risk-migration-contract.test.ts
cd ../..
git add supabase/migrations/20260714180000_project_operational_risk_rpc.sql apps/api/src/services/project-operational-risk-migration-contract.test.ts
git commit -m "feat(project-health): 新增风险聚合 RPC"
```

Expected: 合同测试通过；migration 不包含业务数据 DML 或预先猜测的索引。

## Task 3: 用本地 SQL fixture 验证规则边界并生成数据库类型

**Files:**

- Create: `supabase/tests/project_operational_risk_rpc.sql`
- Modify mechanically: `apps/api/src/types/database.ts`

- [ ] **Step 1: 创建事务内 fixture 骨架**

SQL 文件必须：

```sql
begin;
set local timezone = 'UTC';
-- 插入两个独立 tenant、必要 employee/customer/project/workflow fixture。
-- 所有 UUID 使用文件内固定值，所有时间相对 statement_timestamp() 构造。
-- 最后 rollback，绝不污染本地或 dev 业务数据。
```

每个断言使用完整的 `DO` block：先把 RPC JSON 读入局部变量，再用 `if not assertion_passed then raise exception 'project health: workflow 3-day boundary'; end if;` 这类具体错误失败；每条错误必须包含清晰的风险规则名称。

- [ ] **Step 2: 覆盖五类风险与严重度边界**

fixture 至少创建：

- 逾期 2 天和 3 天的 pending workflow task，另有一条 `due_at NULL`；
- 延期 2 天和 3 天的 planned/in_progress procedure；
- 18:00 后当日无日志的 warning 项目，以及工序开始 >=2 天且 48 小时无日志的 danger 项目；
- 一条 rejected acceptance；
- `high <48h`、`high >48h`、`urgent` 三条未完结工单；
- 一条 `invalid` 项目和另一租户同类数据。

断言五种 `risk_key` 前缀、2/3 天边界、high/urgent 边界、日志同项目同日去重和跨租户排除。

- [ ] **Step 3: 覆盖筛选、分页、自动关闭和空结果**

在同一事务内依次：

1. 调用默认 page 1/20，断言 summary 与 items；
2. 按 risk_type、severity、项目中文名和完整 UUID 筛选；
3. 调用 pageSize 100 和 101，断言 RPC 内实际上限均不超过 100；
4. 更新 fixture task 为 completed、acceptance 为 submitted、ticket 为 resolved、补写当天 log，再调用函数断言对应风险消失；
5. 使用无风险 tenant 调用，断言完整 summary/diagnostics/items/pagination，而不是 `NULL`。

- [ ] **Step 4: 验证函数 execute 权限**

SQL 中断言：

```sql
select has_function_privilege(
  'authenticated',
  'public.get_project_operational_risk_page(uuid,integer,integer,text,text,text,text)',
  'execute'
) = false;
select has_function_privilege(
  'service_role',
  'public.get_project_operational_risk_page(uuid,integer,integer,text,text,text,text)',
  'execute'
) = true;
```

- [ ] **Step 5: 重建本地数据库并运行 fixture**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/project_operational_risk_rpc.sql
```

Expected: migration 全部成功，fixture 所有断言通过并最终 `ROLLBACK`。

- [ ] **Step 6: 从本地数据库机械生成类型**

```bash
supabase gen types typescript --local > apps/api/src/types/database.ts
rg -n "get_project_operational_risk_page" apps/api/src/types/database.ts
supabase migration list
```

Expected: 生成类型包含准确 Args/Returns；本地 migration list 包含 `20260714180000`。如本地 Supabase 不可用，停止在该检查点，不得手写函数类型或跳过 SQL 行为验证。

- [ ] **Step 7: 提交 fixture 与生成类型**

```bash
git add supabase/tests/project_operational_risk_rpc.sql apps/api/src/types/database.ts
git commit -m "test(project-health): 覆盖风险规则 SQL 边界"
```

## Task 4: 实现只调用一次 RPC 的 Repository

**Files:**

- Create: `apps/api/src/repositories/project-operational-risks.ts`
- Create: `apps/api/src/repositories/project-operational-risks.test.ts`

- [ ] **Step 1: 写 Repository 失败测试**

使用项目现有 `mock.module("@/utils/supabase/index", factory)` 模式固定 admin client，覆盖：

```ts
expect(rpc).toHaveBeenCalledTimes(1);
expect(rpc).toHaveBeenCalledWith("get_project_operational_risk_page", {
  p_tenant_id: "11111111-1111-4111-8111-111111111111",
  p_page: 2,
  p_page_size: 20,
  p_risk_type: "procedure_overdue",
  p_severity: "danger",
  p_keyword: "湖畔项目",
  p_timezone_name: "Asia/Shanghai",
});
```

另写两个测试：Supabase `error` 被包装为 `DB_ERROR`；缺字段/未知风险类型的 `data` 被严格拒绝，不能返回伪造空列表。

- [ ] **Step 2: 运行失败测试**

```bash
cd apps/api && bun test src/repositories/project-operational-risks.test.ts
```

Expected: FAIL，Repository 尚不存在。

- [ ] **Step 3: 实现 Repository**

公开方法只做三件事：规范调用参数、测量 RPC 时间、验证返回结构。

```ts
const startedAt = Date.now();
const { data, error } = await SupabaseDB.getAdminClient().rpc(
  "get_project_operational_risk_page",
  {
    p_tenant_id: input.tenantId,
    p_page: input.query.page,
    p_page_size: Math.min(input.query.pageSize, 100),
    p_risk_type: input.query.risk_type ?? null,
    p_severity: input.query.severity ?? null,
    p_keyword: input.query.keyword ?? null,
    p_timezone_name: "Asia/Shanghai",
  },
);
const rpcMs = Date.now() - startedAt;
if (error) throw Errors.dbError("查询项目运营风险失败", error);
const parsed = ProjectOperationalRiskRpcPageSchema.safeParse(data);
if (!parsed.success) {
  throw Errors.dbError("项目运营风险聚合返回结构异常", parsed.error.issues);
}
return { page: parsed.data, rpcMs };
```

禁止 fallback 到五个 Supabase 查询，禁止客户端分页，禁止缓存。

- [ ] **Step 4: 验证并提交**

```bash
cd apps/api && bun test src/repositories/project-operational-risks.test.ts
cd ../..
git add apps/api/src/repositories/project-operational-risks.ts apps/api/src/repositories/project-operational-risks.test.ts
git commit -m "feat(project-health): 接入风险聚合仓库"
```

Expected: 单次 RPC、参数、错误包装和严格解析测试全部通过。

## Task 5: 实现展示映射和跨项目权限 Service

**Files:**

- Create: `apps/api/src/services/project-operational-risk-presentation.ts`
- Create: `apps/api/src/services/project-operational-risk-presentation.test.ts`
- Create: `apps/api/src/services/project-operational-risks.ts`
- Create: `apps/api/src/services/project-operational-risks.test.ts`

- [ ] **Step 1: 写五类展示映射失败测试**

每类 fixture 断言中文标题、事实描述和准确跳转：

```ts
expect(presentProjectOperationalRisk(workflowFact).action).toEqual({
  label: "去处理",
  href: "/projects/11111111-1111-4111-8111-111111111111?tab=overview",
});
expect(presentProjectOperationalRisk(procedureFact).action.href).toContain("tab=overview");
expect(presentProjectOperationalRisk(logFact).action.href).toContain("tab=logs");
expect(presentProjectOperationalRisk(acceptanceFact).action.href).toBe(
  "/projects/11111111-1111-4111-8111-111111111111?tab=acceptances&acceptanceId=55555555-5555-4555-8555-555555555555",
);
expect(presentProjectOperationalRisk(ticketFact).action.href).toBe(
  "/customer-service?ticketId=66666666-6666-4666-8666-666666666666",
);
```

再断言 description 不包含 `undefined`、`null`、客户电话、地址或大段工单/驳回内容。

- [ ] **Step 2: 运行展示测试并看到失败**

```bash
cd apps/api && bun test src/services/project-operational-risk-presentation.test.ts
```

Expected: FAIL，展示模块尚不存在。

- [ ] **Step 3: 实现纯展示函数**

固定标题：

| risk_type | title | 描述事实 |
| --- | --- | --- |
| `workflow_task_overdue` | 工作流任务逾期 | 任务标题、逾期天数、到期时间 |
| `procedure_overdue` | 施工工序延期 | 阶段/节点、延期天数、计划结束日 |
| `missing_project_log` | 施工日志缺失 | 当日缺失、最近日志时间、当前阶段 |
| `acceptance_rework` | 验收需要整改 | 验收标题/类型、驳回来源、驳回时间 |
| `service_ticket` | 高优先级客服工单 | 工单号、优先级、未处理时长 |

只读取 SQL 已允许的 evidence key；任何缺失值使用短中文兜底。函数以 exhaustive `switch` 保证新增 risk type 时 typecheck 失败。所有 URL 参数使用 `encodeURIComponent`。

- [ ] **Step 4: 写权限与编排失败测试**

用可注入的 `accessPolicyService` 和 Repository mock 覆盖：

1. 有 `dashboard.read` 且 `project.read:all` 时调用 Repository 一次并保留 RPC 排序；
2. 缺 `dashboard.read` 返回 403；
3. 缺 `project.read` 返回 403；
4. `project.read:self/assigned/department` 均返回 403 且 Repository 调用 0 次；
5. `tenantId` 缐失返回 `TENANT_CONTEXT_REQUIRED`；
6. Service 输出只增加 `title/description/action`，不改变 risk fact、summary、diagnostics 和 pagination。

- [ ] **Step 5: 实现 Service**

Service 的权限守卫必须是：

```ts
private assertReadable(authContext: AuthContext) {
  const tenantId = this.dependencies.accessPolicyService
    .assertTenantContext(authContext);
  this.dependencies.accessPolicyService
    .assertPermission(authContext, "dashboard.read");
  this.dependencies.accessPolicyService
    .assertPermission(authContext, "project.read");
  if (
    this.dependencies.accessPolicyService.getScope(authContext, "project.read")
      !== "all"
  ) {
    throw Errors.forbidden();
  }
  return tenantId;
}
```

`listRisks()` 调 Repository 后 `items.map(presentProjectOperationalRisk)`，返回：

```ts
{
  data: { ...rpcPage, items: presentedItems },
  timing: { rpcMs, serviceMs },
}
```

Service 不排序、不切片、不缓存、不直接访问 Supabase。

- [ ] **Step 6: 运行测试并提交**

```bash
cd apps/api && bun test \
  src/services/project-operational-risk-presentation.test.ts \
  src/services/project-operational-risks.test.ts
cd ../..
git add apps/api/src/services/project-operational-risk-presentation.ts \
  apps/api/src/services/project-operational-risk-presentation.test.ts \
  apps/api/src/services/project-operational-risks.ts \
  apps/api/src/services/project-operational-risks.test.ts
git commit -m "feat(project-health): 编排风险权限与展示"
```

## Task 6: 暴露风险列表 GET API 并记录细分耗时

**Files:**

- Create: `apps/api/src/controllers/project-health/index.ts`
- Create: `apps/api/src/controllers/project-health/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写路由注册失败测试**

复用现有 controller route test 模式，初始断言：

```ts
expect(routes).toEqual([
  { method: "GET", path: "/project-health/risks" },
]);
```

- [ ] **Step 2: 写 Controller 数据流失败测试**

通过 mock Service 和测试 request 覆盖：

- `getRequiredTenantContext` 的结果原样传给 Service；
- query 经 `ProjectOperationalRiskListQuerySchema` 后传入；
- `pageSize=101` 在调用 Service 前失败；
- 成功响应使用 `ResponseHandler.success(data)`，不暴露内部 `timing`。

- [ ] **Step 3: 运行失败测试**

```bash
cd apps/api && bun test src/controllers/project-health/routes.test.ts
```

Expected: FAIL，Controller 尚不存在。

- [ ] **Step 4: 实现 GET Controller**

Controller 只负责 HTTP：

```ts
@Get("/project-health/risks")
async listRisks(request: FastifyRequest, reply: FastifyReply) {
  const startedAt = Date.now();
  const authContext = await this.getRequiredTenantContext(request);
  const query = ProjectOperationalRiskListQuerySchema.safeParse(request.query);
  if (!query.success) throw Errors.fromZod(query.error);
  const result = await projectOperationalRiskService.listRisks(
    authContext,
    query.data,
  );
  const serializeStartedAt = Date.now();
  const response = ResponseHandler.success(result.data);
  const serializeMs = Date.now() - serializeStartedAt;
  const totalMs = Date.now() - startedAt;
  const logPayload = {
    requestId: request.id,
    tenantId: authContext.tenantId,
    employeeId: authContext.employeeId,
    page: query.data.page,
    pageSize: query.data.pageSize,
    riskType: query.data.risk_type ?? null,
    severity: query.data.severity ?? null,
    hasKeyword: Boolean(query.data.keyword),
    rpcMs: result.timing.rpcMs,
    serviceMs: result.timing.serviceMs,
    serializeMs,
    totalMs,
    itemCount: result.data.items.length,
    riskTotal: result.data.summary.total,
  };
  if (totalMs >= 1000) request.log.warn(logPayload, "[project-health] slow list");
  else request.log.info(logPayload, "[project-health] list timings");
  return response;
}
```

日志不得记录 keyword 原文、项目名、地址、工单号或 evidence。

- [ ] **Step 5: 注册 Controller**

在 `apps/api/src/routes/index.ts` 明确 import `ProjectHealthController`，并在 tenant 业务 controller 区调用一次 `registerExtraRoutes(app)`。

- [ ] **Step 6: 验证并提交**

```bash
cd apps/api && bun test src/controllers/project-health/routes.test.ts
cd ../..
bun run api:typecheck
git add apps/api/src/controllers/project-health apps/api/src/routes/index.ts
git commit -m "feat(project-health): 提供风险列表接口"
```

Expected: GET 路由唯一注册，Controller/Service/Repository 分层和 typecheck 通过。

## Task 7: 实现严格脱敏的按需 AI 经营摘要

**Files:**

- Create: `apps/api/src/services/project-operational-risk-ai.ts`
- Create: `apps/api/src/services/project-operational-risk-ai.test.ts`
- Modify: `apps/api/src/controllers/project-health/index.ts`
- Modify: `apps/api/src/controllers/project-health/routes.test.ts`

- [ ] **Step 1: 写 AI prompt 脱敏失败测试**

构造带有额外敏感字段的测试对象，断言发送给 gateway 的 message：

```ts
expect(prompt).toContain("risk_key");
expect(prompt).toContain("overdue_days");
expect(prompt).not.toContain("13800138000");
expect(prompt).not.toContain("幸福路 88 号");
expect(prompt).not.toContain("完整投诉内容");
expect(prompt).not.toContain("reject_reason");
expect(aiGateway.chat).toHaveBeenCalledWith(expect.objectContaining({
  sceneCode: "project_operational_risk_summary",
  tenantId: "11111111-1111-4111-8111-111111111111",
  responseFormat: "json_object",
  timeoutMs: 30000,
  temperature: 0.2,
  source: "admin",
  billable: true,
}));
```

- [ ] **Step 2: 写 AI 输出安全失败测试**

覆盖：

1. 服务端强制 `page=1/pageSize=20`，忽略客户端任何 items；
2. 模型返回第 6 条 priority 时失败；
3. 模型返回本次输入中不存在的 `risk_key` 时整个摘要请求失败；
4. 非 JSON、空 overview、过长文本通过 `Errors.business(502, "AI 经营摘要格式异常，请重试", "PROJECT_OPERATIONAL_RISK_AI_INVALID_RESPONSE")` 返回；
5. 空风险集合直接返回稳定的无风险摘要且不调用模型；
6. gateway 失败向独立 POST 请求传播，不改变或清空任何风险列表数据。

- [ ] **Step 3: 运行失败测试**

```bash
cd apps/api && bun test src/services/project-operational-risk-ai.test.ts
```

Expected: FAIL，AI Service 尚不存在。

- [ ] **Step 4: 实现最小化 prompt 构造**

只允许以下序列化字段：

```ts
{
  risk_key,
  risk_type,
  severity,
  project_name,
  overdue_days,
  occurred_at,
  due_at,
  assignee_employee_name,
  evidence: pickAllowedEvidence(risk_type, evidence),
}
```

各类型 evidence allowlist 必须与 SQL 对齐；禁止对象展开原始 `evidence`。system prompt 明确：只依据输入事实、最多 5 项、不能承诺工期/赔付/验收结果、不能认定责任、不能生成不存在的 risk key。

- [ ] **Step 5: 调用已有 AiGateway 并严格解析**

先调用 `projectOperationalRiskService.listRisks(authContext, {...filters, page:1, pageSize:20})`，再调用已核对真实 API 的 `aiGateway.chat()`。使用 `JSON.parse(result.content)` 后执行 `ProjectOperationalRiskAiSummarySchema.safeParse()`；不要实现从自由文本中截取 JSON 的宽松 fallback。

构造输入 risk key `Set`，任何 priority key 不在集合内即返回 502。成功响应只返回 contract 字段，不返回模型 raw/provider prompt。

- [ ] **Step 6: 增加 POST Controller**

```ts
@Post("/project-health/ai-summary")
async generateAiSummary(request: FastifyRequest) {
  const authContext = await this.getRequiredTenantContext(request);
  const body = ProjectOperationalRiskAiSummaryBodySchema.safeParse(
    request.body ?? {},
  );
  if (!body.success) throw Errors.fromZod(body.error);
  return ResponseHandler.success(
    await projectOperationalRiskAiService.generate(authContext, body.data),
  );
}
```

更新 route test 期望 GET 和 POST 各一条。

- [ ] **Step 7: 验证并提交**

```bash
cd apps/api && bun test \
  src/services/project-operational-risk-ai.test.ts \
  src/controllers/project-health/routes.test.ts
cd ../..
bun run api:typecheck
git add apps/api/src/services/project-operational-risk-ai.ts \
  apps/api/src/services/project-operational-risk-ai.test.ts \
  apps/api/src/controllers/project-health
git commit -m "feat(project-health): 增加按需 AI 经营摘要"
```

## Task 8: 完成 API 检查点

**Files:**

- Verify: `packages/domain/src/project-operational-risk.ts`
- Verify: `apps/api/src/schema/project-health.ts`
- Verify: `apps/api/src/repositories/project-operational-risks.ts`
- Verify: `apps/api/src/services/project-operational-risk*.ts`
- Verify: `apps/api/src/controllers/project-health/index.ts`

- [ ] **Step 1: 运行全部定向测试**

```bash
bun test packages/domain/src/project-operational-risk.test.ts
cd apps/api && bun test \
  src/schema/project-health.test.ts \
  src/repositories/project-operational-risks.test.ts \
  src/services/project-operational-risk-migration-contract.test.ts \
  src/services/project-operational-risk-presentation.test.ts \
  src/services/project-operational-risks.test.ts \
  src/services/project-operational-risk-ai.test.ts \
  src/controllers/project-health/routes.test.ts
```

Expected: 全部通过，无 skipped test。

- [ ] **Step 2: 运行 API 质量门禁**

```bash
cd ../..
pnpm --dir packages/domain build
bun run api:check
bun run check:permission-boundaries
```

Expected: typecheck、build、API 文件大小和权限边界检查全部退出 0。

- [ ] **Step 3: 检查单次 RPC 和隐私边界**

```bash
rg -n "get_project_operational_risk_page|\.from\(" \
  apps/api/src/repositories/project-operational-risks.ts \
  apps/api/src/services/project-operational-risk*.ts
rg -n "phone|address|images|content|reject_reason|customer_id" \
  apps/api/src/services/project-operational-risk-ai.ts
```

Expected: 生产列表链路只有一个 `.rpc` 且无 `.from`；AI 文件中敏感字段只可出现在显式 deny 测试/注释，不进入 prompt payload。

- [ ] **Step 4: 提交检查点修正（仅在有修正时）**

```bash
git add packages/domain apps/api/src
git commit -m "test(project-health): 收紧 API 质量门禁"
```

若无修正，不创建空提交。

## Task 9: 让 Admin 导航同时理解 permission code 与 scope

**Files:**

- Create: `apps/admin/components/layout/admin-nav-visibility.ts`
- Create: `apps/admin/components/layout/admin-nav-visibility.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/layout/admin-nav.tsx`

- [ ] **Step 1: 写导航可见性失败测试**

测试至少覆盖：

```ts
const projectRiskItem = {
  href: "/project-health",
  label: "项目风险",
  icon: ShieldAlert,
  requiredPermissions: [
    { code: "dashboard.read" },
    { code: "project.read", scope: "all" },
  ],
};

expect(hasMenuItemAccess(session([
  { code: "dashboard.read", scope: "all" },
  { code: "project.read", scope: "all" },
]), projectRiskItem)).toBe(true);

for (const scope of ["self", "assigned", "department"] as const) {
  expect(hasMenuItemAccess(session([
    { code: "dashboard.read", scope: "all" },
    { code: "project.read", scope },
  ]), projectRiskItem)).toBe(false);
}
```

另断言缺任一 permission 时隐藏，现有仅配置 `permission` 的菜单项仍保持兼容。

- [ ] **Step 2: 运行失败测试**

```bash
cd apps/admin && bun test components/layout/admin-nav-visibility.test.ts
```

Expected: FAIL，新 helper/type 尚不存在。

- [ ] **Step 3: 实现纯可见性 helper**

在 `menu-config.ts` 增加：

```ts
export type AdminPermissionScope = "self" | "assigned" | "department" | "all";
export type AdminMenuPermissionRequirement = {
  code: string;
  scope?: AdminPermissionScope;
};
```

`AdminMenuItem` 保留现有 `permission?: string | null`，再增加 `requiredPermissions?: AdminMenuPermissionRequirement[]`。`hasMenuItemAccess` 将旧 `permission` 转为无 scope requirement，再对所有 requirement 做 `every`；有 scope 时必须精确相等。

- [ ] **Step 4: 配置导航并替换组件内私有过滤函数**

在“概览”之后插入：

```ts
{
  href: "/project-health",
  label: "项目风险",
  icon: ShieldAlert,
  requiredPermissions: [
    { code: "dashboard.read" },
    { code: "project.read", scope: "all" },
  ],
},
```

`admin-nav.tsx` 从新 helper 导入 `getVisibleGroups`，删除旧的只看 code 的私有函数。

- [ ] **Step 5: 验证并提交**

```bash
cd apps/admin && bun test \
  components/layout/admin-nav-utils.test.ts \
  components/layout/admin-nav-visibility.test.ts
cd ../..
pnpm --dir apps/admin typecheck
git add apps/admin/components/layout
git commit -m "feat(admin): 按跨项目范围显示风险入口"
```

## Task 10: 建立 Admin 查询、显示和后台请求 helper

**Files:**

- Create: `apps/admin/components/project-health/project-health-query.ts`
- Create: `apps/admin/components/project-health/project-health-query.test.ts`
- Create: `apps/admin/components/project-health/project-health-display.ts`
- Create: `apps/admin/components/project-health/project-health-display.test.ts`
- Create: `apps/admin/components/project-health/project-health-api.ts`
- Create: `apps/admin/components/project-health/project-health-api.test.ts`

- [ ] **Step 1: 写 URL contract 失败测试**

覆盖：默认 page 1、非法 page 回落 1、只序列化非空筛选、筛选变化重置 page 1、重置得到 `/project-health?page=1`、后端 query 固定 `pageSize=20`。

```ts
expect(buildProjectHealthHref({
  page: 2,
  severity: "danger",
  riskType: "procedure_overdue",
  keyword: "湖畔",
})).toBe(
  "/project-health?page=2&severity=danger&risk_type=procedure_overdue&keyword=%E6%B9%96%E7%95%94",
);
```

- [ ] **Step 2: 写显示 helper 失败测试**

覆盖风险类型/严重度 label、Badge variant、日期本地化、逾期天数、证据最多两项加 `+N`，并断言 danger/warning 均同时返回文字和图标语义，不仅返回颜色 class。

- [ ] **Step 3: 写请求 helper 失败测试**

注入 mock fetch，断言：

- GET `/api/backend/project-health/risks?...`，带传入 `AbortSignal`；
- POST `/api/backend/project-health/ai-summary`，body 只含三个筛选字段；
- backend 非 2xx 或 `success:false` 转为用户可读错误；
- 缺 `data` 被视为协议错误，不伪造空列表。

- [ ] **Step 4: 运行失败测试**

```bash
cd apps/admin && bun test \
  components/project-health/project-health-query.test.ts \
  components/project-health/project-health-display.test.ts \
  components/project-health/project-health-api.test.ts
```

Expected: FAIL，helper 尚不存在。

- [ ] **Step 5: 实现纯 helper**

全部业务 DTO 从 `@gooes/domain` 导入，不在 Admin 复制接口类型。请求 helper 接受 `signal?: AbortSignal` 和可注入 `fetcher`；错误只抛出不含响应正文敏感数据的 `Error(message)`，由 client shell 转成 `StatusAlert`。

- [ ] **Step 6: 验证并提交**

```bash
cd apps/admin && bun test components/project-health/*.test.ts
cd ../..
pnpm --dir apps/admin typecheck
git add apps/admin/components/project-health
git commit -m "feat(admin): 增加风险中心查询与显示契约"
```

## Task 11: 实现 Admin 首屏、KPI 和单一列表工作区

**Files:**

- Create: `apps/admin/app/(console)/project-health/page.tsx`
- Create: `apps/admin/app/(console)/project-health/loading.tsx`
- Create: `apps/admin/app/(console)/project-health/project-health-page-layout.test.ts`
- Create: `apps/admin/components/project-health/project-health-client-shell.tsx`
- Create: `apps/admin/components/project-health/project-health-summary-cards.tsx`
- Create: `apps/admin/components/project-health/project-health-filters.tsx`
- Create: `apps/admin/components/project-health/project-health-table.tsx`
- Create: `apps/admin/components/project-health/project-health-pagination.tsx`

- [ ] **Step 1: 写页面结构失败测试**

源码契约断言：

```ts
expect(page).toContain("h-[calc(100vh-6.5625rem)]");
expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
expect(page).toContain("ProjectHealthClientShell");
expect(shell).toContain("CardHeader");
expect(shell).toContain("CardContent");
expect(shell).toContain("CardFooter");
expect(shell).toContain("data-testid=\"project-health-table-viewport\"");
expect(shell).toContain("min-h-0 flex-1 overflow-auto");
expect(shell).not.toContain("bg-gradient");
expect(shell).not.toContain("backdrop-blur");
expect(shell).not.toContain("text-transparent");
```

再断言筛选使用本地 shadcn `Input/Select/Button`，表格使用现有 `DataTable`，错误使用 `StatusAlert`，loading 使用 `Skeleton`。

- [ ] **Step 2: 运行失败测试**

```bash
cd apps/admin && bun test app/'(console)'/project-health/project-health-page-layout.test.ts
```

Expected: FAIL，页面和组件尚不存在。

- [ ] **Step 3: 实现服务端首屏取数**

`page.tsx`：

1. 调 `getTenantBusinessAccessDenied()` 阻止 platform-only session；
2. 解析 `searchParams` 为 `page/severity/risk_type/keyword`；
3. 用 `getAdminToken()`、`buildBackendUrl()`、`parseBackendJson<ProjectOperationalRiskPage>()` 请求 GET；
4. 固定 `pageSize=20`、`cache:"no-store"`；
5. 错误返回 `initialData:null` 与 `initialError`，不得把失败伪装成风险数 0；client shell 此时显示 StatusAlert 和结构占位，不渲染数值为 0 的 KPI；
6. 将 `initialData/initialFilters/initialError` 交给 client shell。

页面头部采用 `ShieldAlert` 40px 图标容器、20px 标题、生成时间和两个操作：“刷新”“生成 AI 经营摘要”；无 Hero、渐变或装饰性副标题。

- [ ] **Step 4: 实现四个紧凑 KPI**

`project-health-summary-cards.tsx` 显示：

1. 风险总数 `summary.total`；
2. 严重风险 `summary.danger`；
3. 受影响项目 `summary.affected_projects`；
4. 高优先级工单 `summary.by_type.service_ticket`。

使用 `grid-cols-2 xl:grid-cols-4`，数字 `tabular-nums`，danger/warning 使用图标+文字语义；Gooes 黄色只用于主操作/焦点，不充当 danger 色。

- [ ] **Step 5: 实现筛选表单**

筛选包含：

- 项目关键词 Input，label/placeholder 明确“项目名称或完整项目 ID”；
- 严重度 Select：全部/严重/预警；
- 风险类型 Select：全部/五类中文；
- 查询 Button 和重置 Button；
- 所有控件高 36–40px，移动端触摸 target 通过外围按钮达到至少 44px。

提交后调用 `loadRisks(nextFilters, 1)`；重置清空三个筛选并回 page 1。

- [ ] **Step 6: 实现带取消的列表刷新状态**

`project-health-client-shell.tsx` 保持：

```ts
const listRequestRef = useRef<AbortController | null>(null);
const listRequestIdRef = useRef(0);
```

每次刷新：abort 前一个请求、递增 request id、保留当前 table/KPI、设置 `isListLoading=true`；只有当前 request id 才能落状态。成功后用 `window.history.replaceState` 同步 URL，失败保留已有数据并显示 `StatusAlert`；`AbortError` 不显示错误。监听 `popstate` 并按 URL 重新加载，组件卸载时 abort。

- [ ] **Step 7: 实现固定表头表格和固定分页页脚**

列必须是：严重度、项目、风险事项、责任人、发生/逾期时间、证据摘要、操作。

- 表格最小宽度约 960px，390px 受控横向滚动；
- 768px 以下隐藏/压缩次要证据列，不压缩核心中文；
- header `sticky top-0 z-10`；
- 项目名/证据用 `truncate` 和可访问 `title`；
- 日期、页码、逾期天数用 `tabular-nums`；
- 行内只保留一个 `Button asChild` 的“去处理”；
- 空状态保留 filter、header、footer，说明“当前筛选没有项目风险”并提供重置；
- loading 时 `aria-busy`、旧表格 `opacity-60` 和局部 `Loader2`，不清空表格。

分页固定 pageSize 20，只提供上一页/下一页和当前页/总页数，按钮 disabled 条件由 pagination 决定。

- [ ] **Step 8: 实现结构化 Skeleton**

`loading.tsx` 保留页面头、4 KPI、筛选条、表格行和 footer 尺寸，避免首屏布局跳动；不得使用全屏 spinner。

- [ ] **Step 9: 运行页面测试和 typecheck**

```bash
cd apps/admin && bun test \
  app/'(console)'/project-health/project-health-page-layout.test.ts \
  components/project-health/*.test.ts
cd ../..
pnpm --dir apps/admin check
```

Expected: 页面 contract、文件大小和 typecheck 通过。

- [ ] **Step 10: 提交工作台**

```bash
git add apps/admin/app/'(console)'/project-health \
  apps/admin/components/project-health
git commit -m "feat(admin): 构建项目风险工作台"
```

## Task 12: 增加独立 AI 摘要面板和交互门禁

**Files:**

- Create: `apps/admin/components/project-health/project-health-ai-summary.tsx`
- Modify: `apps/admin/components/project-health/project-health-client-shell.tsx`
- Modify: `apps/admin/app/(console)/project-health/project-health-page-layout.test.ts`
- Modify: `apps/admin/components/project-health/project-health-api.test.ts`

- [ ] **Step 1: 先写 AI 交互失败测试**

源码/纯 helper contract 至少断言：

- 首屏 page/server fetch 只调用 risks GET，不调用 ai-summary；
- AI endpoint 只在按钮 click handler 中出现；
- shell 具有独立 `aiSummary/aiError/isAiLoading` 状态；
- AI 加载不复用 `isListLoading`，AI 错误不调用任何清空 `pageData` 的 setter；
- `AbortController`/request id 阻止重复点击和过期响应落地；
- 面板用 `aria-live="polite"` 报告加载/成功/错误。

- [ ] **Step 2: 运行失败测试**

```bash
cd apps/admin && bun test \
  app/'(console)'/project-health/project-health-page-layout.test.ts \
  components/project-health/project-health-api.test.ts
```

Expected: FAIL，AI 面板尚未集成。

- [ ] **Step 3: 实现按需生成逻辑**

点击时读取当前已生效筛选，不读取客户端表格 items；调用 `requestProjectOperationalRiskAiSummary(filters, signal)`。加载中按钮 disabled 并显示“正在生成”；第二次点击前 abort 上次请求；筛选变化时保留已生成摘要但显示“摘要基于上一组筛选”的轻量提示，或清空摘要，两者选择其一后用测试固定，不能把旧摘要误认为当前结果。

推荐选择：筛选成功切换后清空旧摘要和 AI error，避免上下文错配。

- [ ] **Step 4: 实现紧凑 AI 面板**

面板仅在 loading、success 或 error 时出现，位于 KPI 与列表 Card 之间：

- 标题“AI 经营摘要”，附“仅供处理排序参考”；
- overview 一段；
- priorities 最多 5 条，每条显示 reason 和 recommended_action，不增加自动执行按钮；
- cautions 使用简短列表；
- 错误用独立 `StatusAlert` 和“重试”，列表/KPI 保持不变；
- 不使用 AI 紫色、Sparkles 大装饰、渐变、玻璃或动画背景。

- [ ] **Step 5: 验证并提交**

```bash
cd apps/admin && bun test \
  app/'(console)'/project-health/project-health-page-layout.test.ts \
  components/project-health/*.test.ts
cd ../..
pnpm --dir apps/admin check
git add apps/admin/app/'(console)'/project-health \
  apps/admin/components/project-health
git commit -m "feat(admin): 增加按需风险经营摘要"
```

## Task 13: 验证数据库执行计划并按证据决定索引

**Files:**

- Create: `apps/api/src/scripts/project-operational-risk-performance-smoke.ts`
- Create: `supabase/tests/project_operational_risk_explain.sql`
- Create: `docs/audit/2026-07-14-project-operational-risk-performance.md`
- Conditional create: `supabase/migrations/20260714183000_project_operational_risk_indexes.sql`

- [ ] **Step 1: 写性能脚本的纯统计失败测试**

在脚本旁导出/测试 `percentile()` 或把纯函数放入脚本内可测试区域，断言 20 个样本的 P50/P95 计算使用排序后的向上取整索引。脚本参数：`PROJECT_HEALTH_TENANT_ID` 必填，`PROJECT_HEALTH_SMOKE_ITERATIONS` 默认 20；可选 `PROJECT_HEALTH_API_URL/PROJECT_HEALTH_ADMIN_TOKEN` 用于完整 API 测量。

- [ ] **Step 2: 实现只读性能 smoke**

RPC 阶段通过 admin Supabase client 调相同函数，记录每次 ms、P50/P95、items/total；API 阶段通过 bearer token 请求 GET，验证 200 和 contract。任何调用失败设置 `process.exitCode = 1`，不得吞掉或伪造样本。

- [ ] **Step 3: 创建只读 EXPLAIN 文件并选择代表 tenant**

`supabase/tests/project_operational_risk_explain.sql` 内容固定为：

```sql
\set ON_ERROR_STOP on
explain (analyze, buffers, verbose)
select public.get_project_operational_risk_page(
  :'project_health_tenant_id'::uuid,
  1,
  20,
  null,
  null,
  null,
  'Asia/Shanghai'
);
```

从获准的 dev 数据副本/开发环境只读选择项目量较大的 tenant，不手填占位值：

```bash
export PROJECT_HEALTH_TENANT_ID="$(
  psql "$SUPABASE_DB_DIRECT_URL" -Atc \
    "select tenant_id from public.projects where tenant_id is not null and coalesce(status, '') <> 'invalid' group by tenant_id order by count(*) desc, tenant_id limit 1"
)"
test -n "$PROJECT_HEALTH_TENANT_ID"
```

- [ ] **Step 4: 获取代表性 EXPLAIN**

```bash
psql "$SUPABASE_DB_DIRECT_URL" \
  --set=project_health_tenant_id="$PROJECT_HEALTH_TENANT_ID" \
  -f supabase/tests/project_operational_risk_explain.sql
```

在性能文档记录已选 tenant、项目数、总耗时、主要扫描/排序节点、actual rows、loops、shared hit/read blocks。

- [ ] **Step 5: 运行 20 次 P95 smoke**

```bash
cd apps/api
PROJECT_HEALTH_TENANT_ID="$PROJECT_HEALTH_TENANT_ID" \
  bun --env-file=.env src/scripts/project-operational-risk-performance-smoke.ts
```

如 API 已启动且有合法管理员 token，再设置 API URL/token 测完整接口。目标：RPC P95 <500ms，API P95 <1000ms。

- [ ] **Step 6: 只在执行计划证明确有瓶颈时创建索引 migration**

判断规则：现有索引上出现大量无关行扫描、主要时间花在状态/时间筛选或排序，且代表性数据可复现。只添加命中证据的索引：

```sql
create index if not exists workflow_tasks_pending_due_idx
  on public.workflow_tasks(tenant_id, due_at, instance_id)
  where status = 'pending' and due_at is not null;

create index if not exists customer_service_tickets_open_priority_idx
  on public.customer_service_tickets(tenant_id, priority, created_at, project_id)
  where status in ('open', 'in_progress')
    and priority in ('high', 'urgent');

create index if not exists project_acceptances_rejected_created_idx
  on public.project_acceptances(tenant_id, rejected_at, project_id)
  where status = 'rejected';
```

不得把三个索引无条件全部创建。若创建，重新 `supabase db reset`、SQL fixture、EXPLAIN 和 20 次 P95，并在文档记录前后差异与保留理由。若不创建，在文档明确“现有索引足够”，不生成空 migration。

- [ ] **Step 7: 记录回滚**

基础 migration 回滚：准确签名 `drop function`。条件索引回滚：只 drop 本功能新增且无其他消费者的索引。首版无风险状态表，因此不需要回写业务数据。

- [ ] **Step 8: 验证并提交证据**

```bash
cd ../..
git add apps/api/src/scripts/project-operational-risk-performance-smoke.ts \
  supabase/tests/project_operational_risk_explain.sql \
  docs/audit/2026-07-14-project-operational-risk-performance.md
test ! -f supabase/migrations/20260714183000_project_operational_risk_indexes.sql || \
  git add supabase/migrations/20260714183000_project_operational_risk_indexes.sql
git commit -m "perf(project-health): 验证风险聚合执行计划"
```

## Task 14: 浏览器 smoke、Impeccable 审核和总体验证

**Files:**

- Create: `docs/audit/2026-07-14-project-operational-risk-ui-audit.md`
- Modify: 仅审核发现确需修正的 `apps/admin/app/(console)/project-health/*`
- Modify: 仅审核发现确需修正的 `apps/admin/components/project-health/*`

- [ ] **Step 1: 先完成所有静态门禁**

```bash
bun test packages/domain/src/project-operational-risk.test.ts
cd apps/api && bun test \
  src/schema/project-health.test.ts \
  src/repositories/project-operational-risks.test.ts \
  src/services/project-operational-risk-migration-contract.test.ts \
  src/services/project-operational-risk-presentation.test.ts \
  src/services/project-operational-risks.test.ts \
  src/services/project-operational-risk-ai.test.ts \
  src/controllers/project-health/routes.test.ts
cd ../..
cd apps/admin && bun test \
  components/layout/admin-nav-utils.test.ts \
  components/layout/admin-nav-visibility.test.ts \
  components/project-health/*.test.ts \
  app/'(console)'/project-health/project-health-page-layout.test.ts
cd ../..
pnpm --dir packages/domain build
bun run api:check
pnpm --dir apps/admin check
```

Expected: 全部退出 0；静态检查失败时禁止先启动耗时浏览器验证。

- [ ] **Step 2: 启动本地 API/Admin 并做功能 smoke**

使用现有 dev 命令启动服务，登录具有 `dashboard.read + project.read:all` 的租户账号，验证：

1. 导航显示“项目风险”，普通 self/assigned/department 用户不显示且直达 API 403；
2. GET 首屏 200、pageSize 20、KPI 与 summary 一致；
3. 搜索、严重度、风险类型、重置和上一/下一页同步 URL；
4. 快速切换筛选时旧响应不覆盖新结果；
5. 五类“去处理”分别进入实际存在的 `overview/logs/acceptances/customer-service` 页面；
6. AI 不自动调用，点击后才 POST；AI 失败只影响摘要面板；
7. RPC 错误显示 StatusAlert，不显示为风险 0。

- [ ] **Step 3: 在四个断点捕获证据**

使用浏览器截图 1440、1024、768、390 宽度，记录：

- 1440/1024 四列 KPI 与完整表格；
- 768 KPI 两列、筛选换行、次要证据降级；
- 390 无页面级横向溢出，只有表格视口受控横向滚动；
- 页面本身无普通纵向滚动，Card 内表格区域滚动；
- loading/empty/error/AI loading/AI error 至少各一张或一条可复核记录。

- [ ] **Step 4: 键盘和 WCAG AA smoke**

仅用键盘完成筛选、重置、分页、生成摘要和“去处理”；确认焦点可见、Tab 顺序符合视觉顺序、Select 可操作、图标有 `aria-hidden` 或名称、状态不只靠颜色、触摸目标 >=44px。用浏览器工具检查文本/背景对比度达到 AA。

- [ ] **Step 5: 执行 `$impeccable audit`**

审核必须基于实际页面截图和 `PRODUCT.md`/`DESIGN.md`，覆盖：视觉层级、认知负荷、响应式、可访问性、性能和反模式。发布门槛：

- 总分 >=16/20；
- P0/P1 = 0；
- 无嵌套 Card、营销 Hero、AI 紫色、渐变文字、玻璃效果或装饰性动画；
- warning/danger 有 Badge、文字、图标三重语义；
- 失败/空状态不会误导经营判断。

将评分、问题、修复 commit 和复审结果写入 UI audit 文档。此步骤由已选用的 `$impeccable` 技能驱动；发现问题时先修复再复审，不虚构分数。

- [ ] **Step 6: 构建生产包**

```bash
bun run api:build
pnpm --dir apps/admin build
```

Expected: API 和 Admin production build 退出 0，无 hydration/type/file-size 错误。

- [ ] **Step 7: 提交审核修正与证据**

```bash
git add apps/admin/app/'(console)'/project-health \
  apps/admin/components/project-health \
  docs/audit/2026-07-14-project-operational-risk-ui-audit.md
git commit -m "fix(admin): 完成风险中心 UI 审核"
```

若审核无需代码修正，提交信息使用 `docs(project-health): 记录 UI 审核证据`，不得创建虚假的 fix commit。

## Task 15: Dev migration、部署和发布后验收

**Files:**

- Verify: `supabase/migrations/20260714180000_project_operational_risk_rpc.sql`
- Conditional verify: `supabase/migrations/20260714183000_project_operational_risk_indexes.sql`
- Verify: `apps/api/src/types/database.ts`
- Verify: API/Admin deployment artifacts

- [ ] **Step 1: 在任何远端数据库变更前确认目标**

明确目标是开发环境，不是生产 `1.13.20.39`；记录开发服务器/数据库标识。先运行 migration list，确认待执行 migration 只有本功能明确文件，禁止对远端手工执行 DDL/DML。

```bash
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

- [ ] **Step 2: 应用获准 migration 并验证对齐**

使用项目既有批准发布流程应用 migration，随后再次运行：

```bash
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote 对齐到 `20260714180000`，以及仅在有执行计划证据时存在的 `20260714183000`。若无法连接或不对齐，停止部署依赖该 RPC 的 API，不绕过。

- [ ] **Step 3: 部署 API 后做只读接口 smoke**

使用具备跨项目权限的 dev 管理员 token 请求：

```bash
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api-dev.goodcms.cn/project-health/risks?page=1&pageSize=20"
```

验证 200、完整 contract、单次 RPC 日志和 `totalMs <1000ms` 目标；再用 self-scope token 验证 403。

- [ ] **Step 4: 部署 Admin 并做页面 smoke**

打开 dev Admin `/project-health`，复测 Task 14 的主路径和四个跳转。AI scene 不可用时应只显示摘要错误；不得阻断列表发布。

- [ ] **Step 5: 执行发布后 P95 和错误日志检查**

运行 20 次性能 smoke，查看 API 请求日志中的 `rpcMs/serviceMs/serializeMs/totalMs/requestId`，确认没有客户电话、地址、工单内容或 keyword 原文。记录 RPC/API P95；未达标则停止灰度，回到 Task 13 优化，不提高前端 timeout 掩盖。

- [ ] **Step 6: 小范围试点而非立即全量运营**

选择 5 家租户、约 20 个活跃项目抽样，对五类风险逐项回查底层事实，目标事实准确率 >=95%。记录“去处理”点击和风险消失时间，但不把试点数值宣传为 SLA。

- [ ] **Step 7: 最终提交前验证工作区边界**

```bash
git status --short
git diff --check
git log --oneline --decorate -12
```

Expected: 只包含本计划文件，未修改 orange，无未提交生成物；原工作区未跟踪研究报告未被纳入本分支。

## 最终验收清单

- [ ] 五类风险和全部严重度边界由 SQL fixture 证明。
- [ ] `invalid` 项目、跨租户数据和未授权 scope 不可见。
- [ ] GET 每次只调用一次 RPC，pageSize 默认 20、最大 100。
- [ ] 底层事实恢复后风险自动消失，无风险状态表或手工关闭。
- [ ] AI 只按点击调用、最多 20 条、未知 risk key 被拒绝、敏感字段不进 prompt。
- [ ] Admin 导航同时检查 `dashboard.read` 与 `project.read:all`。
- [ ] 页面 URL 筛选、取消过期请求、空/错/加载/分页/跳转状态通过。
- [ ] RPC P95 <500ms，完整 API P95 <1000ms；索引有 EXPLAIN 证据。
- [ ] API/Admin typecheck、build、file-size、定向测试全部通过。
- [ ] Impeccable >=16/20、P0/P1=0、WCAG AA 和四断点 smoke 通过。
- [ ] Dev migration Local/Remote 对齐，发布后 smoke 有 requestId 与耗时证据。
- [ ] Orange 仓库零改动，不含无关研究报告或用户工作区内容。
