# Construction Procedure Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build explicit construction procedure assignment and scheduling so each procedure node must be started with a worker, planned start date, and duration before logs or completion can proceed.

**Architecture:** Add a project procedure assignment domain beside workflow runtime. Workflow tasks continue to be the only operation entry, but procedure actions use explicit `action.key` values and are intercepted by the project workflow bridge before runtime completion. Timeline state, project log gates, Admin, and mini-program handoff all consume the same workflow v2 runtime projection.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations/RPC tables, shared `@gooes/domain`, Next.js Admin with shadcn/Radix/Tailwind, existing workflow runtime repositories and services.

---

## Source Documents

- Product PRD: `docs/construction-procedure-scheduling/2026-06-23-construction-procedure-assignment-scheduling-prd.md`
- Existing workflow v2 design: `docs/superpowers/specs/2026-06-18-workflow-node-contract-v2-design.md`
- API workflow task entry: `apps/api/src/controllers/workflow-tasks/index.ts`
- Current project workflow bridge: `apps/api/src/services/workflow-task-project-bridge.ts`
- Current procedure action metadata: `apps/api/src/services/workflow-task-action-metadata.ts`
- Current project log entry gate: `apps/api/src/services/employee-project-detail-bootstrap/legacy/log-entry.ts`
- Current acceptance runtime sync: `apps/api/src/services/project-acceptance-workflow-runtime.ts`

## File Structure

Create these backend files:

- `supabase/migrations/20260623143000_create_project_procedure_assignments.sql`
  - Creates assignment tables, audit table, indexes, and permissions.
- `apps/api/src/repositories/project-procedure-assignments.ts`
  - Direct Supabase access for assignment rows, candidate rows, overlap checks, and audit inserts.
- `apps/api/src/services/project-procedure-assignments/types.ts`
  - Local service input/output types and status unions.
- `apps/api/src/services/project-procedure-assignments/status.ts`
  - Pure date/status helpers for tenant-day effective status, planned end date, remaining days, and overlap.
- `apps/api/src/services/project-procedure-assignments/service.ts`
  - Business orchestration for start, adjust, complete, projection, candidate search, stale action checks, and idempotency.
- `apps/api/src/services/project-procedure-assignments/index.ts`
  - Exports singleton `projectProcedureAssignmentService`.
- `apps/api/src/schema/project-procedure-assignments.ts`
  - Zod query schema for candidate listing.
- `apps/api/src/controllers/project-procedures/index.ts`
  - `GET /projects/:projectId/procedure-candidates`.

Modify these backend files:

- `packages/domain/src/permission.ts`
  - Add `project_procedure.read/assign/adjust/complete`.
- `apps/api/src/errors/error-codes.ts`
  - Add procedure assignment and stale workflow action error codes.
- `apps/api/src/routes/index.ts`
  - Register `ProjectProceduresController.registerExtraRoutes(app)`.
- `apps/api/src/services/workflow-task-action-metadata.ts`
  - Return explicit procedure action keys.
- `apps/api/src/services/workflow-task-actions.ts`
  - Pass current task/subject context needed by procedure action derivation if not already available.
- `apps/api/src/services/workflow-task-project-bridge.ts`
  - Intercept `start_procedure`, `adjust_procedure_schedule`, and `complete_procedure`.
- `apps/api/src/services/workflow-tasks.ts`
  - Ensure stale procedure actions return `WORKFLOW_ACTION_STALE`, and payment/project bridges keep existing order.
- `apps/api/src/services/project-workflow-timeline-contract.ts`
  - Project assignment runtime attributes and actions into `timeline_nodes`.
- `apps/api/src/services/project-workflow-progress.ts`
  - Include assignment projections in workflow progress state.
- `apps/api/src/services/employee-project-detail-bootstrap/legacy/log-entry.ts`
  - Use workflow current node + assignment, not `construction_stages` fallback, for writable log stage.
- `apps/api/src/services/project-logs.ts`
  - Enforce assignment-based project log create gate.
- `apps/api/src/services/project-acceptance-workflow-runtime.ts`
  - Ensure customer-confirmed acceptance advances the procedure exactly once after assignment-aware completion.

Modify these Admin files:

- `apps/admin/components/workflows/workflow-procedure-config-fields.tsx`
  - Add `require_procedure_assignment`, `default_duration_days`, `allow_duration_override`, `candidate_department_codes`, and keep template field `trigger_acceptance`.
- `apps/admin/components/workflows/workflow-node-config-fields-contract.test.ts`
  - Assert new config fields are exposed.
- `apps/admin/components/projects/project-workflow-runtime-view.tsx`
  - Format assignment attributes and procedure actions.
- `apps/admin/components/projects/project-workflow-runtime-panel.tsx`
  - Support dynamic output fields for `project_procedure` actions.
- `apps/admin/components/projects/project-status-action-dialog.tsx`
  - Render employee/date/number fields for start/adjust procedure.
- `apps/admin/components/projects/project-status-action-dialog.test.tsx`
  - Cover field rendering and submit payload.

Create handoff docs:

- `docs/construction-procedure-scheduling/2026-06-23-miniprogram-procedure-scheduling-handoff.md`
  - Mini-program integration contract, payloads, UI behavior, and smoke checklist.

## Task 1: Shared Contract Constants

**Files:**

- Modify: `packages/domain/src/permission.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Test: `apps/api/src/services/workflow-task-action-metadata.test.ts`

- [ ] **Step 1: Add failing permission and error-code expectations**

Add this test block to `apps/api/src/services/workflow-task-action-metadata.test.ts` near the existing procedure tests:

```ts
import { ErrorCodes } from "@/errors/error-codes";
import { PERMISSION_CODE_VALUES, PermissionCodeConfig } from "@gooes/domain";

test("declares procedure assignment permissions and stale action errors", () => {
  expect(PERMISSION_CODE_VALUES).toEqual(
    expect.arrayContaining([
      "project_procedure.read",
      "project_procedure.assign",
      "project_procedure.adjust",
      "project_procedure.complete",
    ]),
  );
  expect(PermissionCodeConfig["project_procedure.assign"]).toMatchObject({
    module: "project_procedure",
    label: "开始工序派工",
  });
  expect(ErrorCodes.WORKFLOW_ACTION_STALE).toBe("WORKFLOW_ACTION_STALE");
  expect(ErrorCodes.PROCEDURE_ASSIGNMENT_REQUIRED).toBe("PROCEDURE_ASSIGNMENT_REQUIRED");
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
bun test apps/api/src/services/workflow-task-action-metadata.test.ts
```

Expected: FAIL because `project_procedure.*` permissions and new error codes are not defined yet.

- [ ] **Step 3: Add shared permission codes**

In `packages/domain/src/permission.ts`, add these values immediately after `project_log.create`:

```ts
  'project_procedure.read',
  'project_procedure.assign',
  'project_procedure.adjust',
  'project_procedure.complete',
```

Add these config entries immediately after the `project_log.create` entry:

```ts
  'project_procedure.read': {
    label: '查看工序派工',
    module: 'project_procedure',
  },
  'project_procedure.assign': {
    label: '开始工序派工',
    module: 'project_procedure',
  },
  'project_procedure.adjust': {
    label: '调整工序派工',
    module: 'project_procedure',
  },
  'project_procedure.complete': {
    label: '完成工序',
    module: 'project_procedure',
  },
```

- [ ] **Step 4: Add API error codes**

In `apps/api/src/errors/error-codes.ts`, add these values near existing workflow/project-log codes:

```ts
  PROCEDURE_ASSIGNMENT_REQUIRED: "PROCEDURE_ASSIGNMENT_REQUIRED",
  PROCEDURE_ASSIGNEE_BUSY: "PROCEDURE_ASSIGNEE_BUSY",
  PROCEDURE_ASSIGNEE_NOT_ELIGIBLE: "PROCEDURE_ASSIGNEE_NOT_ELIGIBLE",
  PROCEDURE_SCHEDULE_INVALID: "PROCEDURE_SCHEDULE_INVALID",
  PROCEDURE_NOT_IN_PROGRESS: "PROCEDURE_NOT_IN_PROGRESS",
  PROCEDURE_ACCEPTANCE_PENDING: "PROCEDURE_ACCEPTANCE_PENDING",
  WORKFLOW_ACTION_STALE: "WORKFLOW_ACTION_STALE",
```

- [ ] **Step 5: Run focused test and typecheck**

Run:

```bash
bun test apps/api/src/services/workflow-task-action-metadata.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: test PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/permission.ts apps/api/src/errors/error-codes.ts apps/api/src/services/workflow-task-action-metadata.test.ts
git commit -m "feat(workflow): 增加工序派工权限契约"
```

## Task 2: Database Migration for Procedure Assignments

**Files:**

- Create: `supabase/migrations/20260623143000_create_project_procedure_assignments.sql`
- Test: migration status and SQL content checks

- [ ] **Step 1: Create migration**

Create `supabase/migrations/20260623143000_create_project_procedure_assignments.sql` with:

```sql
create table if not exists public.project_procedure_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  workflow_instance_node_id uuid,
  node_key text not null,
  stage_code text not null,
  assignee_employee_id uuid not null references public.employees(id),
  planned_start_date date not null,
  planned_duration_days integer not null check (planned_duration_days > 0),
  planned_end_date date generated always as (planned_start_date + (planned_duration_days - 1)) stored,
  status text not null check (status in ('planned', 'in_progress', 'completed', 'canceled')),
  started_by_employee_id uuid references public.employees(id),
  started_at timestamptz not null default now(),
  completed_by_employee_id uuid references public.employees(id),
  completed_at timestamptz,
  adjusted_by_employee_id uuid references public.employees(id),
  adjusted_at timestamptz,
  adjust_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_procedure_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null references public.project_procedure_assignments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  workflow_instance_node_id uuid,
  action text not null check (action in ('start', 'adjust', 'complete', 'cancel')),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  reason text,
  operator_employee_id uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create unique index if not exists project_procedure_assignments_one_active_node_idx
  on public.project_procedure_assignments(tenant_id, workflow_instance_id, node_key)
  where status in ('planned', 'in_progress');

create index if not exists project_procedure_assignments_assignee_schedule_idx
  on public.project_procedure_assignments(
    tenant_id,
    assignee_employee_id,
    status,
    planned_start_date,
    planned_end_date
  );

create index if not exists project_procedure_assignments_project_instance_idx
  on public.project_procedure_assignments(
    tenant_id,
    project_id,
    workflow_instance_id,
    node_key
  );

create index if not exists project_procedure_assignments_status_end_idx
  on public.project_procedure_assignments(tenant_id, status, planned_end_date);

create index if not exists project_procedure_assignment_logs_assignment_idx
  on public.project_procedure_assignment_logs(tenant_id, assignment_id, created_at desc);

insert into public.permissions (code, name, module, status)
values
  ('project_procedure.read', '查看工序派工', 'project_procedure', 'active'),
  ('project_procedure.assign', '开始工序派工', 'project_procedure', 'active'),
  ('project_procedure.adjust', '调整工序派工', 'project_procedure', 'active'),
  ('project_procedure.complete', '完成工序', 'project_procedure', 'active')
on conflict (code) do update set
  name = excluded.name,
  module = excluded.module,
  status = excluded.status;
```

- [ ] **Step 2: Verify migration SQL contains required objects**

Run:

```bash
rg -n "project_procedure_assignments|project_procedure_assignment_logs|project_procedure.assign" supabase/migrations/20260623143000_create_project_procedure_assignments.sql
```

Expected: command prints table names, indexes, and permission rows.

- [ ] **Step 3: Check migration list**

Run:

```bash
supabase migration list
```

Expected: local migration `20260623143000_create_project_procedure_assignments` appears. If Supabase CLI cannot reach remote, record the CLI error in the final task note and continue with SQL content verification.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260623143000_create_project_procedure_assignments.sql
git commit -m "feat(workflow): 增加工序派工数据模型"
```

## Task 3: Assignment Status Helpers and Repository

**Files:**

- Create: `apps/api/src/services/project-procedure-assignments/types.ts`
- Create: `apps/api/src/services/project-procedure-assignments/status.ts`
- Create: `apps/api/src/services/project-procedure-assignments/status.test.ts`
- Create: `apps/api/src/repositories/project-procedure-assignments.ts`

- [ ] **Step 1: Write pure helper tests**

Create `apps/api/src/services/project-procedure-assignments/status.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  calculatePlannedEndDate,
  calculateRemainingDays,
  getEffectiveAssignmentStatus,
  hasDateRangeOverlap,
} from "./status";

describe("project procedure assignment status helpers", () => {
  test("calculates inclusive planned end date", () => {
    expect(calculatePlannedEndDate("2026-06-24", 3)).toBe("2026-06-26");
  });

  test("promotes planned assignment to in_progress on tenant day", () => {
    expect(getEffectiveAssignmentStatus({
      status: "planned",
      plannedStartDate: "2026-06-24",
      tenantToday: "2026-06-24",
    })).toBe("in_progress");
  });

  test("keeps future assignment planned", () => {
    expect(getEffectiveAssignmentStatus({
      status: "planned",
      plannedStartDate: "2026-06-25",
      tenantToday: "2026-06-24",
    })).toBe("planned");
  });

  test("detects inclusive date range overlap", () => {
    expect(hasDateRangeOverlap({
      leftStart: "2026-06-24",
      leftEnd: "2026-06-26",
      rightStart: "2026-06-26",
      rightEnd: "2026-06-28",
    })).toBe(true);
  });

  test("calculates overdue remaining days", () => {
    expect(calculateRemainingDays({
      plannedEndDate: "2026-06-20",
      tenantToday: "2026-06-24",
    })).toBe(-4);
  });
});
```

- [ ] **Step 2: Run helper tests and confirm they fail**

Run:

```bash
bun test apps/api/src/services/project-procedure-assignments/status.test.ts
```

Expected: FAIL because helper module does not exist.

- [ ] **Step 3: Create service types**

Create `apps/api/src/services/project-procedure-assignments/types.ts`:

```ts
export const PROCEDURE_ASSIGNMENT_STATUS_VALUES = [
  "planned",
  "in_progress",
  "completed",
  "canceled",
] as const;

export type ProcedureAssignmentStatus =
  (typeof PROCEDURE_ASSIGNMENT_STATUS_VALUES)[number];

export type ProcedureAssignmentEffectiveStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "canceled";

export type ProcedureAssignmentScheduleStatus =
  | "not_started"
  | "on_track"
  | "due_today"
  | "overdue"
  | "completed"
  | "canceled";

export interface ProcedureAssignmentRow {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string;
  workflow_instance_node_id: string | null;
  node_key: string;
  stage_code: string;
  assignee_employee_id: string;
  planned_start_date: string;
  planned_duration_days: number;
  planned_end_date: string;
  status: ProcedureAssignmentStatus;
  started_by_employee_id: string | null;
  started_at: string;
  completed_by_employee_id: string | null;
  completed_at: string | null;
  adjusted_by_employee_id: string | null;
  adjusted_at: string | null;
  adjust_reason: string | null;
  created_at: string;
  updated_at: string;
  assignee_employee?: {
    id: string;
    name: string | null;
    avatar: string | null;
  } | null;
}
```

- [ ] **Step 4: Create helper implementation**

Create `apps/api/src/services/project-procedure-assignments/status.ts`:

```ts
import type {
  ProcedureAssignmentEffectiveStatus,
  ProcedureAssignmentScheduleStatus,
  ProcedureAssignmentStatus,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculatePlannedEndDate(startDate: string, durationDays: number): string {
  const start = parseDateOnly(startDate);
  const end = new Date(start.getTime() + (durationDays - 1) * DAY_MS);
  return formatDateOnly(end);
}

export function getEffectiveAssignmentStatus(input: {
  status: ProcedureAssignmentStatus;
  plannedStartDate: string;
  tenantToday: string;
}): ProcedureAssignmentEffectiveStatus {
  if (input.status !== "planned") return input.status;
  return input.plannedStartDate <= input.tenantToday ? "in_progress" : "planned";
}

export function calculateRemainingDays(input: {
  plannedEndDate: string;
  tenantToday: string;
}): number {
  return Math.floor(
    (parseDateOnly(input.plannedEndDate).getTime() -
      parseDateOnly(input.tenantToday).getTime()) / DAY_MS,
  );
}

export function getScheduleStatus(input: {
  effectiveStatus: ProcedureAssignmentEffectiveStatus;
  plannedStartDate: string;
  plannedEndDate: string;
  tenantToday: string;
}): ProcedureAssignmentScheduleStatus {
  if (input.effectiveStatus === "completed") return "completed";
  if (input.effectiveStatus === "canceled") return "canceled";
  if (input.effectiveStatus === "planned") return "not_started";
  const remainingDays = calculateRemainingDays({
    plannedEndDate: input.plannedEndDate,
    tenantToday: input.tenantToday,
  });
  if (remainingDays < 0) return "overdue";
  if (remainingDays === 0) return "due_today";
  return "on_track";
}

export function hasDateRangeOverlap(input: {
  leftStart: string;
  leftEnd: string;
  rightStart: string;
  rightEnd: string;
}): boolean {
  return input.leftStart <= input.rightEnd && input.rightStart <= input.leftEnd;
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Create repository**

Create `apps/api/src/repositories/project-procedure-assignments.ts` with bounded selects and pagination:

```ts
import { Errors } from "@/errors/error-factory";
import { supabase } from "@/utils/supabase";
import type { ProcedureAssignmentRow } from "@/services/project-procedure-assignments/types";

const ASSIGNMENT_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "workflow_instance_id",
  "workflow_instance_node_id",
  "node_key",
  "stage_code",
  "assignee_employee_id",
  "planned_start_date",
  "planned_duration_days",
  "planned_end_date",
  "status",
  "started_by_employee_id",
  "started_at",
  "completed_by_employee_id",
  "completed_at",
  "adjusted_by_employee_id",
  "adjusted_at",
  "adjust_reason",
  "created_at",
  "updated_at",
  "assignee_employee:employees!project_procedure_assignments_assignee_employee_id_fkey(id, name, avatar)",
].join(", ");

class ProjectProcedureAssignmentRepository {
  async findActiveByNode(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    nodeKey: string;
  }): Promise<ProcedureAssignmentRow | null> {
    const { data, error } = await supabase
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("workflow_instance_id", input.workflowInstanceId)
      .eq("node_key", input.nodeKey)
      .in("status", ["planned", "in_progress"])
      .maybeSingle();
    if (error) throw Errors.dbError("查询工序派工失败", error);
    return data as ProcedureAssignmentRow | null;
  }

  async listActiveForProject(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
  }): Promise<ProcedureAssignmentRow[]> {
    const { data, error } = await supabase
      .from("project_procedure_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .eq("workflow_instance_id", input.workflowInstanceId)
      .in("status", ["planned", "in_progress", "completed"])
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw Errors.dbError("查询项目工序派工失败", error);
    return (data ?? []) as ProcedureAssignmentRow[];
  }
}

export const projectProcedureAssignmentRepository =
  new ProjectProcedureAssignmentRepository();
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
bun test apps/api/src/services/project-procedure-assignments/status.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/project-procedure-assignments apps/api/src/repositories/project-procedure-assignments.ts
git commit -m "feat(workflow): 增加工序派工状态模型"
```

## Task 4: Procedure Action Metadata

**Files:**

- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Modify: `apps/api/src/services/workflow-task-action-metadata.test.ts`
- Modify: `apps/api/src/services/workflow-subjects.test.ts`
- Modify: `apps/api/src/services/task-center/legacy/actions.test.ts`

- [ ] **Step 1: Update failing tests for explicit procedure action keys**

Change the existing procedure action expectation in `apps/api/src/services/workflow-task-action-metadata.test.ts` to:

```ts
expect(buildWorkflowTaskActions({
  subjectType: "procedure",
  nodeKey: "plumbing",
  nodeType: "procedure",
  taskTitle: "水电施工",
  currentNodeSnapshot: {
    node_key: "plumbing",
    config: {
      stage_key: "plumbing_electrical",
      require_log: true,
      min_image_count: 2,
      require_procedure_assignment: true,
      default_duration_days: 3,
      allow_duration_override: true,
    },
  },
})).toEqual([
  {
    key: "start_procedure",
    label: "开始水电施工",
    business_domain: "project_procedure",
    business_action: "start_procedure",
    requires_reason: false,
    output_fields: expect.arrayContaining([
      expect.objectContaining({ name: "assignee_employee_id", source: "procedure_candidate" }),
      expect.objectContaining({ name: "planned_start_date", type: "date" }),
      expect.objectContaining({ name: "planned_duration_days", default_value: 3 }),
    ]),
  },
]);
```

Change `apps/api/src/services/workflow-subjects.test.ts` procedure action fixture from `key: "complete"` to `key: "complete_procedure"` and `business_domain: "project_procedure"`.

- [ ] **Step 2: Run focused tests and confirm failures**

Run:

```bash
bun test apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/workflow-subjects.test.ts
```

Expected: FAIL because current implementation still returns `key: "complete"` for procedure tasks.

- [ ] **Step 3: Extend action metadata types**

In `apps/api/src/services/workflow-task-action-metadata.ts`, update `WorkflowTaskOutputFieldType`:

```ts
  | "procedure_candidate"
```

Update `business_domain` union:

```ts
    | "project_procedure"
```

Extend output field type with:

```ts
    source?: "procedure_candidate";
    default_value?: string | number | boolean | null;
    min?: number;
    max?: number;
```

- [ ] **Step 4: Replace procedure action builder**

Replace `buildProcedureActions` with:

```ts
function buildProcedureActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  const config = getCurrentNodeConfig(input);
  const stageCode = typeof config.stage_key === "string" ? config.stage_key : null;
  const defaultDurationDays = getPositiveNumber(config.default_duration_days) ?? 1;
  const requireAssignment = config.require_procedure_assignment !== false;

  if (!requireAssignment) {
    return [{
      key: "complete_procedure",
      label: input.taskTitle,
      business_domain: "project_procedure",
      business_action: "complete_procedure",
      requires_reason: false,
      output_fields: [],
    }];
  }

  return [{
    key: "start_procedure",
    label: `开始${input.taskTitle}`,
    business_domain: "project_procedure",
    business_action: "start_procedure",
    requires_reason: false,
    output_fields: [
      {
        name: "assignee_employee_id",
        label: "施工人员",
        type: "employee",
        required: true,
        source: "procedure_candidate",
        ...(stageCode ? { stage_code: stageCode as ProjectConstructionStageCode } : {}),
      },
      {
        name: "planned_start_date",
        label: "开工时间",
        type: "date",
        required: true,
      },
      {
        name: "planned_duration_days",
        label: "工期天数",
        type: "number",
        required: true,
        default_value: defaultDurationDays,
        min: 1,
      },
    ],
  }];
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/workflow-subjects.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/workflow-task-action-metadata.ts apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/workflow-subjects.test.ts apps/api/src/services/task-center/legacy/actions.test.ts
git commit -m "feat(workflow): 使用显式工序动作key"
```

## Task 5: Assignment Service and Workflow Task Bridge

**Files:**

- Create: `apps/api/src/services/project-procedure-assignments/service.ts`
- Create: `apps/api/src/services/project-procedure-assignments/index.ts`
- Create: `apps/api/src/services/project-procedure-assignments/service.test.ts`
- Modify: `apps/api/src/services/workflow-task-project-bridge.ts`
- Modify: `apps/api/src/services/workflow-tasks.ts`
- Test: `apps/api/src/services/workflow-task-project-bridge.test.ts`

- [ ] **Step 1: Add service tests for stale action and idempotency**

Create `apps/api/src/services/project-procedure-assignments/service.test.ts` with pure mocked repository tests:

```ts
import { describe, expect, test } from "bun:test";
import { ErrorCodes } from "@/errors/error-codes";
import { ProjectProcedureAssignmentService } from "./service";

describe("ProjectProcedureAssignmentService", () => {
  test("rejects start when an active assignment already exists with a different payload", async () => {
    const service = new ProjectProcedureAssignmentService({
      findActiveByNode: async () => ({
        id: "assignment-1",
        tenant_id: "tenant-1",
        project_id: "project-1",
        workflow_instance_id: "instance-1",
        workflow_instance_node_id: "node-1",
        node_key: "procedure_demolition",
        stage_code: "demolition",
        assignee_employee_id: "employee-a",
        planned_start_date: "2026-06-24",
        planned_duration_days: 3,
        planned_end_date: "2026-06-26",
        status: "planned",
        started_by_employee_id: "manager-1",
        started_at: "2026-06-23T00:00:00.000Z",
        completed_by_employee_id: null,
        completed_at: null,
        adjusted_by_employee_id: null,
        adjusted_at: null,
        adjust_reason: null,
        created_at: "2026-06-23T00:00:00.000Z",
        updated_at: "2026-06-23T00:00:00.000Z",
      }),
    } as never);

    await expect(service.startProcedure({
      tenantId: "tenant-1",
      projectId: "project-1",
      workflowInstanceId: "instance-1",
      workflowInstanceNodeId: "node-1",
      nodeKey: "procedure_demolition",
      stageCode: "demolition",
      taskAction: "start_procedure",
      operatorEmployeeId: "manager-1",
      output: {
        assignee_employee_id: "employee-b",
        planned_start_date: "2026-06-24",
        planned_duration_days: 3,
      },
    })).rejects.toMatchObject({ code: ErrorCodes.WORKFLOW_ACTION_STALE });
  });
});
```

- [ ] **Step 2: Run service test and confirm failure**

Run:

```bash
bun test apps/api/src/services/project-procedure-assignments/service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement service skeleton**

Create `apps/api/src/services/project-procedure-assignments/service.ts` with exported class and singleton. The constructor accepts the repository to keep tests isolated:

```ts
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { projectProcedureAssignmentRepository } from "@/repositories/project-procedure-assignments";

type AssignmentRepositoryLike = Pick<
  typeof projectProcedureAssignmentRepository,
  "findActiveByNode"
>;

export class ProjectProcedureAssignmentService {
  constructor(private readonly repository: AssignmentRepositoryLike = projectProcedureAssignmentRepository) {}

  async startProcedure(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    nodeKey: string;
    stageCode: string;
    taskAction: string;
    operatorEmployeeId: string | null | undefined;
    output: Record<string, unknown>;
  }) {
    if (input.taskAction !== "start_procedure") {
      throw Errors.business(409, "当前流程动作已变化，请刷新后重试", ErrorCodes.WORKFLOW_ACTION_STALE);
    }

    const active = await this.repository.findActiveByNode({
      tenantId: input.tenantId,
      projectId: input.projectId,
      workflowInstanceId: input.workflowInstanceId,
      nodeKey: input.nodeKey,
    });
    if (active) {
      const samePayload =
        active.assignee_employee_id === input.output.assignee_employee_id &&
        active.planned_start_date === input.output.planned_start_date &&
        active.planned_duration_days === Number(input.output.planned_duration_days);
      if (samePayload) return { assignment: active, idempotent: true };
      throw Errors.business(409, "工序派工已存在，请刷新后调整派工", ErrorCodes.WORKFLOW_ACTION_STALE);
    }

    throw Errors.business(409, "工序派工写入能力尚未接入", ErrorCodes.WORKFLOW_ACTION_STALE);
  }
}

export const projectProcedureAssignmentService =
  new ProjectProcedureAssignmentService();
```

This minimal implementation passes the stale-action test and creates a safe failure for unimplemented writes before the repository write methods are added in the next step.

- [ ] **Step 4: Add repository write methods and finish start/adjust/complete**

Extend `apps/api/src/repositories/project-procedure-assignments.ts` with:

```ts
  async createAssignment(input: {
    tenantId: string;
    projectId: string;
    workflowInstanceId: string;
    workflowInstanceNodeId: string | null;
    nodeKey: string;
    stageCode: string;
    assigneeEmployeeId: string;
    plannedStartDate: string;
    plannedDurationDays: number;
    status: "planned" | "in_progress";
    operatorEmployeeId: string | null;
  }): Promise<ProcedureAssignmentRow> {
    const { data, error } = await supabase
      .from("project_procedure_assignments")
      .insert({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        workflow_instance_id: input.workflowInstanceId,
        workflow_instance_node_id: input.workflowInstanceNodeId,
        node_key: input.nodeKey,
        stage_code: input.stageCode,
        assignee_employee_id: input.assigneeEmployeeId,
        planned_start_date: input.plannedStartDate,
        planned_duration_days: input.plannedDurationDays,
        status: input.status,
        started_by_employee_id: input.operatorEmployeeId,
      })
      .select(ASSIGNMENT_SELECT)
      .single();
    if (error) throw Errors.dbError("创建工序派工失败", error);
    return data as ProcedureAssignmentRow;
  }
```

Finish `startProcedure`, add `adjustProcedureSchedule`, and add `completeProcedureGate` in service. All methods must validate:

```ts
const assigneeEmployeeId = this.readUuid(input.output.assignee_employee_id, "请选择施工人员");
const plannedStartDate = this.readDate(input.output.planned_start_date, "请选择开工日期");
const plannedDurationDays = this.readPositiveInteger(input.output.planned_duration_days, "请输入有效工期");
```

- [ ] **Step 5: Bridge explicit procedure actions**

In `apps/api/src/services/workflow-task-project-bridge.ts`, add procedure actions before existing project status operations:

```ts
const PROJECT_PROCEDURE_ACTIONS = new Set([
  "start_procedure",
  "adjust_procedure_schedule",
  "complete_procedure",
]);
```

At the top of `complete`:

```ts
if (PROJECT_PROCEDURE_ACTIONS.has(input.action.trim())) {
  return projectProcedureAssignmentService.handleWorkflowTaskAction({
    authContext: input.authContext,
    task: input.task,
    action: input.action.trim(),
    reason: input.reason,
    output: input.output,
  });
}
```

- [ ] **Step 6: Run bridge tests**

Run:

```bash
bun test apps/api/src/services/project-procedure-assignments/service.test.ts apps/api/src/services/workflow-task-project-bridge.test.ts apps/api/src/services/workflow-tasks.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/project-procedure-assignments apps/api/src/repositories/project-procedure-assignments.ts apps/api/src/services/workflow-task-project-bridge.ts apps/api/src/services/workflow-tasks.ts
git commit -m "feat(workflow): 接入工序派工任务桥接"
```

## Task 6: Runtime Timeline Assignment Projection

**Files:**

- Modify: `apps/api/src/services/project-workflow-timeline-contract.ts`
- Modify: `apps/api/src/services/project-workflow-progress.ts`
- Modify: `apps/api/src/services/project-workflow-progress-contract.test.ts`
- Modify: `apps/api/src/services/projects/legacy/workflow-summary.test.ts`

- [ ] **Step 1: Add contract test for assignment attributes**

In `apps/api/src/services/project-workflow-progress-contract.test.ts`, add a case asserting current procedure node includes:

```ts
expect(enrichedPlumbingNode.attributes).toMatchObject({
  procedure_assignment_id: "assignment-1",
  procedure_assignment_status: "in_progress",
  procedure_assignee_employee_id: "employee-1",
  procedure_assignee_employee_name: "张三",
  planned_start_date: "2026-06-24",
  planned_duration_days: 3,
  planned_end_date: "2026-06-26",
  remaining_days: 2,
  schedule_status: "on_track",
});
expect(enrichedPlumbingNode.actions).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ key: "adjust_procedure_schedule" }),
    expect.objectContaining({ key: "complete_procedure" }),
  ]),
);
```

- [ ] **Step 2: Run contract test and confirm failure**

Run:

```bash
bun test apps/api/src/services/project-workflow-progress-contract.test.ts
```

Expected: FAIL because assignment projection is absent.

- [ ] **Step 3: Load assignments in workflow progress service**

In `apps/api/src/services/project-workflow-progress.ts`, after workflow state is loaded for a project, call:

```ts
const procedureAssignments = await projectProcedureAssignmentService.listProjectAssignmentsForRuntime({
  tenantId: input.tenantId,
  projectId: input.projectId,
  workflowInstanceId: runtime.instance_id,
});
```

Pass `procedureAssignments` into timeline contract enrichment.

- [ ] **Step 4: Extend timeline enrichment**

In `apps/api/src/services/project-workflow-timeline-contract.ts`, add an assignment map by `node_key` and merge assignment attributes into procedure nodes. For an active current node:

```ts
attributes.procedure_assignment_id = assignment.id;
attributes.procedure_assignment_status = projection.effectiveStatus;
attributes.procedure_assignee_employee_id = assignment.assignee_employee_id;
attributes.procedure_assignee_employee_name = assignment.assignee_employee?.name ?? null;
attributes.planned_start_date = assignment.planned_start_date;
attributes.planned_duration_days = assignment.planned_duration_days;
attributes.planned_end_date = assignment.planned_end_date;
attributes.remaining_days = projection.remainingDays;
attributes.schedule_status = projection.scheduleStatus;
```

Replace actions by status:

```ts
if (!assignment) return [startProcedureAction];
if (projection.effectiveStatus === "planned") return [adjustAction, disabledCompleteAction];
if (projection.effectiveStatus === "in_progress") return [adjustAction, completeAction];
return [];
```

- [ ] **Step 5: Run contract tests**

Run:

```bash
bun test apps/api/src/services/project-workflow-progress-contract.test.ts apps/api/src/services/projects/legacy/workflow-summary.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/project-workflow-timeline-contract.ts apps/api/src/services/project-workflow-progress.ts apps/api/src/services/project-workflow-progress-contract.test.ts apps/api/src/services/projects/legacy/workflow-summary.test.ts
git commit -m "feat(workflow): 投影工序派工运行态"
```

## Task 7: Candidate API

**Files:**

- Create: `apps/api/src/schema/project-procedure-assignments.ts`
- Create: `apps/api/src/controllers/project-procedures/index.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/services/project-procedure-assignments/service.ts`
- Modify: `apps/api/src/repositories/project-procedure-assignments.ts`

- [ ] **Step 1: Add schema**

Create `apps/api/src/schema/project-procedure-assignments.ts`:

```ts
import { z } from "zod";

export const ProjectProcedureCandidatesParamsSchema = z.object({
  projectId: z.uuid("无效的项目 ID"),
});

export const ProjectProcedureCandidatesQuerySchema = z.object({
  task_id: z.uuid("无效的待办 ID"),
  node_key: z.string().trim().min(1).optional(),
  stage_code: z.string().trim().min(1).optional(),
  planned_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  planned_duration_days: z.coerce.number().int().min(1).max(365),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().max(50).optional(),
});

export type ProjectProcedureCandidatesQuery =
  z.infer<typeof ProjectProcedureCandidatesQuerySchema>;
```

- [ ] **Step 2: Add controller route**

Create `apps/api/src/controllers/project-procedures/index.ts`:

```ts
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  ProjectProcedureCandidatesParamsSchema,
  ProjectProcedureCandidatesQuerySchema,
} from "@/schema/project-procedure-assignments";
import { projectProcedureAssignmentService } from "@/services/project-procedure-assignments";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ProjectProceduresController extends TenantBaseController {
  constructor() {
    super("project_procedure_assignments");
  }

  @Get("/projects/:projectId/procedure-candidates")
  async listCandidates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const params = ProjectProcedureCandidatesParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const query = ProjectProcedureCandidatesQuerySchema.safeParse(request.query);
    if (!query.success) throw Errors.fromZod(query.error);

    const data = await projectProcedureAssignmentService.listCandidates({
      authContext,
      projectId: params.data.projectId,
      query: query.data,
    });
    return ResponseHandler.success(data);
  }
}

export default new ProjectProceduresController();
```

- [ ] **Step 3: Register route**

In `apps/api/src/routes/index.ts`, import and register:

```ts
import ProjectProceduresController from "@/controllers/project-procedures";
```

Inside `indexRoutes`:

```ts
  ProjectProceduresController.registerExtraRoutes(app);
```

- [ ] **Step 4: Implement candidate repository query**

Add a paginated employee query and overlap query in `apps/api/src/repositories/project-procedure-assignments.ts`. The employee query must select only:

```ts
"id, name, avatar, status, tenant_department:tenant_departments(name, code), post:posts(name, code)"
```

The overlap query must filter `status in ('planned','in_progress')`, `planned_start_date <= requestedEnd`, and `planned_end_date >= requestedStart`.

- [ ] **Step 5: Run API checks**

Run:

```bash
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
bun test apps/api/src/controllers/project-logs/routes.test.ts apps/api/src/services/project-procedure-assignments/status.test.ts
```

Expected: typecheck exits 0 and tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/project-procedure-assignments.ts apps/api/src/controllers/project-procedures/index.ts apps/api/src/routes/index.ts apps/api/src/services/project-procedure-assignments apps/api/src/repositories/project-procedure-assignments.ts
git commit -m "feat(workflow): 增加工序施工人员候选接口"
```

## Task 8: Project Log Gate Uses Assignment Source of Truth

**Files:**

- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/log-entry.ts`
- Modify: `apps/api/src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts`
- Modify: `apps/api/src/services/project-logs.ts`
- Modify: `apps/api/src/services/project-logs.test.ts`
- Modify: `apps/api/src/services/project-workflow-mutation-guards.ts`

- [ ] **Step 1: Add bootstrap log-entry test**

In `apps/api/src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts`, add a test where `constructionStages.current_stage` is `"tiling"` but `workflowProgress.current_stage_code` and assignment are `"installation"`. Expected `log_entry.writable_stage.stage_code` is `"installation"`.

Use this assertion:

```ts
expect(result.log_entry).toMatchObject({
  can_create: true,
  writable_stage: {
    stage_code: "installation",
    stage_label: "安装",
  },
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
bun test apps/api/src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts
```

Expected: FAIL because current log-entry code falls back to `construction_stages`.

- [ ] **Step 3: Change log entry derivation**

Modify `buildProjectLogEntry` so writable stage is resolved from workflow state assignment attributes:

```ts
const workflowCurrentNode = input.workflowProgress?.timeline_nodes?.find((node) =>
  node.status === "current" || node.node_key === input.workflowProgress?.current_node_key
);
const workflowStageCode = typeof workflowCurrentNode?.attributes?.stage_code === "string"
  ? workflowCurrentNode.attributes.stage_code
  : null;
const assignmentStatus = workflowCurrentNode?.attributes?.procedure_assignment_status;
```

Allow log creation only when `assignmentStatus === "in_progress"` and `workflowStageCode` is a valid construction stage.

- [ ] **Step 4: Enforce create gate in `project-logs` service**

In `apps/api/src/services/project-logs.ts`, before insert, call:

```ts
await projectProcedureAssignmentService.assertCanCreateProjectLog({
  authContext: input.authContext,
  projectId: input.payload.project_id,
  stageCode: input.payload.stage_code,
});
```

`assertCanCreateProjectLog` must reject planned/no-assignment/wrong-stage with `PROJECT_LOG_STAGE_BLOCKED` or `PROCEDURE_ASSIGNMENT_REQUIRED` through `Errors.business`.

- [ ] **Step 5: Run regression tests**

Run:

```bash
bun test apps/api/src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts apps/api/src/services/project-logs.test.ts apps/api/src/services/project-workflow-mutation-guards.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/employee-project-detail-bootstrap/legacy/log-entry.ts apps/api/src/services/employee-project-detail-bootstrap/legacy/workflow-gate.test.ts apps/api/src/services/project-logs.ts apps/api/src/services/project-logs.test.ts apps/api/src/services/project-workflow-mutation-guards.ts
git commit -m "fix(workflow): 施工日志使用工序派工门禁"
```

## Task 9: Acceptance Closure Advances Procedure Once

**Files:**

- Modify: `apps/api/src/services/project-acceptance-workflow-runtime.ts`
- Modify: `apps/api/src/services/project-acceptance-workflow-runtime.test.ts`
- Modify: `apps/api/src/services/project-acceptances/legacy/customer-confirm-runtime.ts`

- [ ] **Step 1: Add acceptance runtime idempotency test**

In `apps/api/src/services/project-acceptance-workflow-runtime.test.ts`, add:

```ts
test("customer confirmation advances procedure only once after assignment-aware acceptance", async () => {
  const first = await service.syncCustomerConfirmAcceptance({
    tenantId: "tenant-1",
    projectId: "project-1",
    acceptanceId: "acceptance-1",
    stageCode: "plumbing_electrical",
    customerId: "customer-1",
  });
  const second = await service.syncCustomerConfirmAcceptance({
    tenantId: "tenant-1",
    projectId: "project-1",
    acceptanceId: "acceptance-1",
    stageCode: "plumbing_electrical",
    customerId: "customer-1",
  });

  expect(first.status).toBe("advanced");
  expect(second.status).toBe("already_advanced");
});
```

- [ ] **Step 2: Run acceptance tests**

Run:

```bash
bun test apps/api/src/services/project-acceptance-workflow-runtime.test.ts apps/api/src/services/project-acceptances/legacy/customer-actions.test.ts
```

Expected: either FAIL on idempotency or PASS if existing logic already handles current payment gate; inspect result before changing code.

- [ ] **Step 3: Ensure assignment completion is marked before runtime advance**

In `project-acceptance-workflow-runtime.ts`, before `workflowRepository.completeRuntimeNode`, call:

```ts
await projectProcedureAssignmentService.markAcceptanceConfirmedProcedureComplete({
  tenantId: input.tenantId,
  projectId: input.projectId,
  workflowInstanceId: instance.id,
  nodeKey,
  stageCode: input.stageCode,
});
```

The service method must be idempotent: completed assignment stays completed.

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
bun test apps/api/src/services/project-acceptance-workflow-runtime.test.ts apps/api/src/services/project-acceptances/legacy/customer-actions.test.ts
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/project-acceptance-workflow-runtime.ts apps/api/src/services/project-acceptance-workflow-runtime.test.ts apps/api/src/services/project-acceptances/legacy/customer-confirm-runtime.ts apps/api/src/services/project-procedure-assignments
git commit -m "fix(workflow): 验收闭环推进工序一次"
```

## Task 10: Admin Procedure Scheduling UI

**Files:**

- Modify: `apps/admin/components/workflows/workflow-procedure-config-fields.tsx`
- Modify: `apps/admin/components/workflows/workflow-node-config-fields-contract.test.ts`
- Modify: `apps/admin/components/projects/project-workflow-runtime-format.ts`
- Modify: `apps/admin/components/projects/project-workflow-runtime-view.tsx`
- Modify: `apps/admin/components/projects/project-workflow-runtime-panel.tsx`
- Modify: `apps/admin/components/projects/project-status-action-dialog.tsx`
- Modify: `apps/admin/components/projects/project-status-action-dialog.test.ts`

- [ ] **Step 1: Add Admin config test**

In `workflow-node-config-fields-contract.test.ts`, assert source contains:

```ts
expect(procedureSource).toContain("require_procedure_assignment");
expect(procedureSource).toContain("default_duration_days");
expect(procedureSource).toContain("allow_duration_override");
expect(procedureSource).toContain("candidate_department_codes");
expect(procedureSource).toContain("trigger_acceptance");
```

- [ ] **Step 2: Update workflow procedure config fields**

In `workflow-procedure-config-fields.tsx`, add controls:

```tsx
<SwitchField
  label="要求开始工序派工"
  name="require_procedure_assignment"
/>
<NumberField
  label="默认工期天数"
  min={1}
  name="default_duration_days"
/>
<SwitchField
  label="允许开始时修改工期"
  name="allow_duration_override"
/>
```

Keep the existing `trigger_acceptance` field as the template source and display copy as “完成后触发阶段验收”.

- [ ] **Step 3: Format runtime attributes**

In `project-workflow-runtime-format.ts`, add labels:

```ts
procedure_assignment_status: "派工状态",
procedure_assignee_employee_name: "施工人员",
planned_start_date: "开工日期",
planned_duration_days: "工期",
planned_end_date: "预计完工",
remaining_days: "剩余天数",
schedule_status: "排期状态",
```

Map `schedule_status` values to Chinese labels.

- [ ] **Step 4: Render procedure action forms**

In `project-status-action-dialog.tsx`, render `workflow_output_fields` of type `employee`, `date`, and `number`. Submit output must include:

```ts
{
  assignee_employee_id: form.assignee_employee_id,
  planned_start_date: form.planned_start_date,
  planned_duration_days: Number(form.planned_duration_days),
}
```

- [ ] **Step 5: Run Admin tests**

Run:

```bash
pnpm --dir apps/admin check
bun test apps/admin/components/workflows/workflow-node-config-fields-contract.test.ts apps/admin/components/projects/project-status-action-dialog.test.ts
```

Expected: check exits 0 and both focused Admin tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/workflows/workflow-procedure-config-fields.tsx apps/admin/components/workflows/workflow-node-config-fields-contract.test.ts apps/admin/components/projects/project-workflow-runtime-format.ts apps/admin/components/projects/project-workflow-runtime-view.tsx apps/admin/components/projects/project-workflow-runtime-panel.tsx apps/admin/components/projects/project-status-action-dialog.tsx apps/admin/components/projects/project-status-action-dialog.test.ts
git commit -m "feat(admin): 对接工序派工排程"
```

## Task 11: Mini-Program Handoff Document

**Files:**

- Create: `docs/construction-procedure-scheduling/2026-06-23-miniprogram-procedure-scheduling-handoff.md`

- [ ] **Step 1: Create handoff document**

Create the document with these sections:

```md
# 小程序工序派工排程对接说明

日期：2026-06-23

## 后端提交基线

- gooes 提交记录：以包含本文档的 gooes commit 为准。
- 契约来源：`docs/construction-procedure-scheduling/2026-06-23-construction-procedure-assignment-scheduling-prd.md`

## 核心契约

- 小程序继续只消费 `workflow_state.timeline_nodes[].display/attributes/actions`。
- 工序动作提交时 `body.action` 直接使用 `action.key`。
- 工序动作 key：`start_procedure`、`adjust_procedure_schedule`、`complete_procedure`。
- 不再把工序 action 改写成 `complete`，不从 `business_action` 反推提交值。
- 施工日志只调用 `POST /project-logs`，不推进 workflow。

## 候选人员接口

`GET /projects/:projectId/procedure-candidates`

必传 query：

- `task_id`
- `planned_start_date`
- `planned_duration_days`
- `page`
- `pageSize`

## Smoke Checklist

1. 员工登录后读取 `/workflow-tasks?status=pending&subject_type=project`。
2. 当前工序未派工时看到 `start_procedure`。
3. 提交 `start_procedure` 后当前 workflow 节点不变。
4. 未来开工日期显示 `planned`，不展示写日志入口。
5. 到达开工日期或后端返回 `in_progress` 后展示写日志入口。
6. 施工日志提交后只刷新详情，不本地推进 timeline。
7. `complete_procedure` 后按后端返回展示下一节点或验收入口。
```

- [ ] **Step 2: Verify no orange writes**

Run:

```bash
git status --short /Users/leefo/Public/work/orange
```

Expected: no output, or unrelated existing orange changes that are not caused by this repo. Do not modify orange.

- [ ] **Step 3: Commit**

```bash
git add docs/construction-procedure-scheduling/2026-06-23-miniprogram-procedure-scheduling-handoff.md
git commit -m "docs(workflow): 增加工序派工小程序对接说明"
```

## Task 12: End-to-End Verification

**Files:**

- Modify: `docs/construction-procedure-scheduling/2026-06-23-construction-procedure-assignment-scheduling-prd.md` if acceptance notes need an execution appendix.
- Create: `docs/construction-procedure-scheduling/2026-06-23-procedure-scheduling-e2e-record.md`

- [ ] **Step 1: Run static verification**

Run:

```bash
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin check
bun test apps/api/src/services/project-procedure-assignments/status.test.ts apps/api/src/services/project-procedure-assignments/service.test.ts apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/project-workflow-progress-contract.test.ts apps/api/src/services/project-logs.test.ts apps/api/src/services/project-acceptance-workflow-runtime.test.ts
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Run migration status check**

Run:

```bash
supabase migration list
```

Expected: local and remote migration state can be inspected. If remote is unavailable, record the exact CLI error.

- [ ] **Step 3: Create E2E record**

Create `docs/construction-procedure-scheduling/2026-06-23-procedure-scheduling-e2e-record.md`:

```md
# 工序派工排程 E2E 验收记录

日期：2026-06-23

## 静态验证

- API typecheck:
- Admin check:
- API focused tests:
- git diff --check:
- migration list:

## 接口验收

- project ID:
- workflow instance ID:
- task ID:
- start_procedure response:
- candidate API sample:
- project log create response:
- complete_procedure response:
- final workflow current node:

## Admin 验收

- 流程编排工序节点配置:
- 项目详情派工展示:
- 项目详情动作提交:

## 小程序交接

- handoff doc:
- orange 是否改动: 未改动
```

Fill each item with actual command result or sample IDs from the smoke run.

- [ ] **Step 4: Commit verification record**

```bash
git add docs/construction-procedure-scheduling/2026-06-23-procedure-scheduling-e2e-record.md
git commit -m "docs(workflow): 记录工序派工排程验收"
```

## Self-Review

Spec coverage:

- Explicit action keys: Task 4 and Task 5.
- Assignment data model and audit: Task 2 and Task 3.
- Status calculation and planned/in_progress: Task 3 and Task 6.
- Candidate employee interface and occupancy: Task 7.
- Project log decoupling and source-of-truth stage: Task 8.
- Acceptance closure advancement: Task 9.
- Admin configuration and runtime UI: Task 10.
- Mini-program handoff without modifying orange: Task 11.
- Verification and E2E record: Task 12.

Placeholder scan:

- This plan avoids unfinished wording and unspecified implementation bullets. Commands and file paths are concrete.

Type consistency:

- Procedure action keys are consistently `start_procedure`, `adjust_procedure_schedule`, and `complete_procedure`.
- Template field is consistently `trigger_acceptance`; runtime attribute is consistently `acceptance_enabled`.
- Permission module is consistently `project_procedure`.

## Execution Recommendation

Use inline execution for Task 1 through Task 4 first. These tasks establish the shared contract, database model, status helpers, and action key behavior. After Task 4 passes, run a short review before continuing into runtime bridge and UI work.
