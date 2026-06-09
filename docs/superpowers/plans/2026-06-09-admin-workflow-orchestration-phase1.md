# Admin Workflow Orchestration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of the Admin workflow orchestration platform: workflow definitions, draft nodes/edges, publishable immutable version snapshots, validation, simulation preview, and an Admin designer shell that does not yet drive production business flows.

**Architecture:** Use a bounded workflow module in API: schema -> controller -> service -> repository, backed by Supabase tables created by migration. Admin consumes the workflow API through focused data helpers and renders a restrained three-pane designer with a node library, canvas preview, and property panel. Runtime execution and费用审批真实运行 are explicitly out of scope for this plan.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase/Postgres, Next.js App Router, shadcn/Radix/Tailwind, lucide-react, `@gooes/domain`.

---

## Scope Boundary

This plan implements only Phase 1 from [the design spec](../specs/2026-06-09-admin-workflow-orchestration-design.md):

- Workflow data model and migration.
- Shared workflow constants.
- API CRUD-style endpoints for workflow definitions, draft graph, validation, publish, and simulation.
- Admin workflow list and designer shell.
- Saving draft graph and publishing immutable snapshots.
- Visual simulation of path traversal using sample context.

This plan does not implement:

- `workflow_instances`, `workflow_node_instances`, `workflow_tasks`, or `workflow_audit_logs`.
- Fees/expense workflow runtime integration.
- Task center integration.
- Mini program integration.
- Historical instance migration.
- Arbitrary script/API/SQL nodes.

Those must be separate plans.

## File Structure

### Create

- `packages/domain/src/workflow.ts`  
  Shared workflow enum values, labels, type guards, and default node configs.

- `supabase/migrations/20260609160000_create_workflow_definitions.sql`  
  Workflow definition, version, draft node, and draft edge tables with tenant indexes.

- `apps/api/src/schema/workflows.ts`  
  Zod validation for list query, mutation payloads, node configs, edge conditions, publish, validate, and simulate requests.

- `apps/api/src/repositories/workflows.ts`  
  Direct Supabase access for workflow definitions, versions, nodes, and edges. Must use explicit column selects and paginated list queries.

- `apps/api/src/services/workflows.ts`  
  Business orchestration: tenant access assertions, default template creation, graph validation, publish snapshot creation, and simulation.

- `apps/api/src/controllers/workflows/index.ts`  
  HTTP boundary for workflow APIs. Controllers validate request data, call service, and return `ResponseHandler.success`.

- `apps/admin/app/(console)/workflows/page.tsx`  
  Server page for workflow list.

- `apps/admin/app/(console)/workflows/[id]/page.tsx`  
  Server page for workflow designer.

- `apps/admin/components/workflows/workflow-types.ts`  
  Admin-side TypeScript DTOs mirroring API responses.

- `apps/admin/components/workflows/workflow-data.ts`  
  Server/client data helpers for list, detail, save draft, validate, publish, and simulate.

- `apps/admin/components/workflows/workflow-list-shell.tsx`  
  Tenant workflow list with filters, summary cards, and create-from-template action.

- `apps/admin/components/workflows/workflow-designer-shell.tsx`  
  Client designer composition.

- `apps/admin/components/workflows/workflow-node-library.tsx`  
  Left node library grouped by type.

- `apps/admin/components/workflows/workflow-canvas.tsx`  
  Middle canvas preview with stable node dimensions and simple SVG edges.

- `apps/admin/components/workflows/workflow-property-panel.tsx`  
  Right property editor by node type.

- `apps/admin/components/workflows/workflow-validation-panel.tsx`  
  Validation and simulation result panel.

- `apps/admin/components/workflows/workflow-template-dialog.tsx`  
  Dialog for creating tenant workflows from supported templates.

### Modify

- `packages/domain/src/index.ts`  
  Export workflow constants.

- `apps/api/src/routes/index.ts`  
  Import and register `WorkflowsController.registerExtraRoutes(app)`.

- `apps/admin/components/layout/menu-config.ts`  
  Add tenant nav item `/workflows` under “业务”.

### Verify

- `bun run api:typecheck`
- `bun run api:build`
- `bun run api:check-file-size`
- `pnpm --dir apps/admin check`

If a migration is applied during execution, also verify:

- `supabase migration list`

---

## Task 1: Add Shared Workflow Domain Constants

**Files:**
- Create: `packages/domain/src/workflow.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Create workflow domain constants**

Create `packages/domain/src/workflow.ts`:

```ts
export const WORKFLOW_DEFINITION_STATUS_VALUES = [
  'draft',
  'active',
  'archived',
] as const;

export type WorkflowDefinitionStatus =
  (typeof WORKFLOW_DEFINITION_STATUS_VALUES)[number];

export const WORKFLOW_VERSION_STATUS_VALUES = [
  'published',
  'deprecated',
] as const;

export type WorkflowVersionStatus =
  (typeof WORKFLOW_VERSION_STATUS_VALUES)[number];

export const WORKFLOW_CATEGORY_VALUES = [
  'main',
  'sales',
  'construction',
  'procedure',
  'approval',
  'acceptance',
] as const;

export type WorkflowCategory = (typeof WORKFLOW_CATEGORY_VALUES)[number];

export const WORKFLOW_NODE_TYPE_VALUES = [
  'start',
  'end',
  'business',
  'construction_stage',
  'procedure',
  'approval',
  'confirmation',
  'notification',
  'automation',
  'subflow',
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPE_VALUES)[number];

export const WORKFLOW_BUSINESS_KIND_VALUES = [
  'customer_lead',
  'phone_follow_up',
  'store_visit',
  'measurement',
  'design',
  'quote',
  'deposit',
  'contract',
  'construction_start',
  'final_acceptance',
  'settlement',
  'expense_approval',
  'stage_template',
  'procedure_template',
] as const;

export type WorkflowBusinessKind =
  (typeof WORKFLOW_BUSINESS_KIND_VALUES)[number];

export const WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES = [
  'always',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
] as const;

export type WorkflowEdgeConditionOperator =
  (typeof WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES)[number];

export const WorkflowCategoryConfig: Record<WorkflowCategory, { label: string }> = {
  main: { label: '主流程' },
  sales: { label: '销售流转' },
  construction: { label: '施工阶段' },
  procedure: { label: '工序模板' },
  approval: { label: '审批流程' },
  acceptance: { label: '验收确认' },
};

export const WorkflowNodeTypeConfig: Record<WorkflowNodeType, { label: string }> = {
  start: { label: '开始' },
  end: { label: '结束' },
  business: { label: '业务节点' },
  construction_stage: { label: '施工阶段' },
  procedure: { label: '工序节点' },
  approval: { label: '审批节点' },
  confirmation: { label: '确认节点' },
  notification: { label: '通知节点' },
  automation: { label: '自动动作' },
  subflow: { label: '子流程' },
};

export const WorkflowDefinitionStatusConfig: Record<
  WorkflowDefinitionStatus,
  { label: string; type: 'default' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  draft: { label: '草稿', type: 'warning' },
  active: { label: '已发布', type: 'success' },
  archived: { label: '已归档', type: 'default' },
};

export const isWorkflowNodeType = (
  value: string | null | undefined,
): value is WorkflowNodeType =>
  typeof value === 'string' &&
  WORKFLOW_NODE_TYPE_VALUES.includes(value as WorkflowNodeType);
```

- [ ] **Step 2: Export workflow domain constants**

Modify `packages/domain/src/index.ts`:

```ts
export * from './workflow';
```

Append it after the existing exports; keep the existing order style.

- [ ] **Step 3: Verify domain types compile through API and Admin**

Run:

```bash
bun run api:typecheck
pnpm --dir apps/admin check
```

Expected:

- API TypeScript exits 0.
- Admin check exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/workflow.ts packages/domain/src/index.ts
git commit -m "feat(workflow): 增加流程编排领域常量"
```

---

## Task 2: Create Workflow Draft and Version Tables

**Files:**
- Create: `supabase/migrations/20260609160000_create_workflow_definitions.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260609160000_create_workflow_definitions.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.platform_tenants(id) ON DELETE CASCADE,
  workflow_key text NOT NULL,
  name text NOT NULL,
  description text NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  active_version_id uuid NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_definitions_key_not_blank CHECK (btrim(workflow_key) <> ''),
  CONSTRAINT workflow_definitions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT workflow_definitions_category_check CHECK (
    category IN ('main', 'sales', 'construction', 'procedure', 'approval', 'acceptance')
  ),
  CONSTRAINT workflow_definitions_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_key
ON public.workflow_definitions(tenant_id, workflow_key);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_status_category
ON public.workflow_definitions(tenant_id, status, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.platform_tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'published',
  snapshot jsonb NOT NULL,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_versions_status_check CHECK (status IN ('published', 'deprecated')),
  CONSTRAINT workflow_versions_number_check CHECK (version_number > 0),
  CONSTRAINT workflow_versions_snapshot_object_check CHECK (jsonb_typeof(snapshot) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_versions_definition_number
ON public.workflow_versions(definition_id, version_number);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_tenant_definition
ON public.workflow_versions(tenant_id, definition_id, published_at DESC);

ALTER TABLE public.workflow_definitions
DROP CONSTRAINT IF EXISTS workflow_definitions_active_version_id_fkey;

ALTER TABLE public.workflow_definitions
ADD CONSTRAINT workflow_definitions_active_version_id_fkey
FOREIGN KEY (active_version_id)
REFERENCES public.workflow_versions(id)
ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.platform_tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_type text NOT NULL,
  business_kind text NULL,
  title text NOT NULL,
  description text NULL,
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_nodes_key_not_blank CHECK (btrim(node_key) <> ''),
  CONSTRAINT workflow_nodes_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT workflow_nodes_type_check CHECK (
    node_type IN (
      'start',
      'end',
      'business',
      'construction_stage',
      'procedure',
      'approval',
      'confirmation',
      'notification',
      'automation',
      'subflow'
    )
  ),
  CONSTRAINT workflow_nodes_position_object_check CHECK (jsonb_typeof(position) = 'object'),
  CONSTRAINT workflow_nodes_config_object_check CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_nodes_definition_key
ON public.workflow_nodes(definition_id, node_key);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_tenant_definition_sort
ON public.workflow_nodes(tenant_id, definition_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.platform_tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.workflow_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.workflow_nodes(id) ON DELETE CASCADE,
  label text NULL,
  condition jsonb NOT NULL DEFAULT '{"operator":"always"}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_edges_condition_object_check CHECK (jsonb_typeof(condition) = 'object'),
  CONSTRAINT workflow_edges_no_self_loop CHECK (source_node_id <> target_node_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_definition_source_priority
ON public.workflow_edges(definition_id, source_node_id, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_definition_target
ON public.workflow_edges(definition_id, target_node_id);

DROP TRIGGER IF EXISTS tr_workflow_definitions_updated_at ON public.workflow_definitions;
CREATE TRIGGER tr_workflow_definitions_updated_at
BEFORE UPDATE ON public.workflow_definitions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_nodes_updated_at ON public.workflow_nodes;
CREATE TRIGGER tr_workflow_nodes_updated_at
BEFORE UPDATE ON public.workflow_nodes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_edges_updated_at ON public.workflow_edges;
CREATE TRIGGER tr_workflow_edges_updated_at
BEFORE UPDATE ON public.workflow_edges
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.workflow_definitions IS '租户流程定义草稿入口';
COMMENT ON TABLE public.workflow_versions IS '流程发布版本不可变快照';
COMMENT ON TABLE public.workflow_nodes IS '流程草稿节点';
COMMENT ON TABLE public.workflow_edges IS '流程草稿连线';
```

- [ ] **Step 2: Verify migration syntax locally**

Run:

```bash
rg -n "workflow_definitions|workflow_versions|workflow_nodes|workflow_edges" supabase/migrations/20260609160000_create_workflow_definitions.sql
```

Expected: all four table names appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609160000_create_workflow_definitions.sql
git commit -m "feat(workflow): 增加流程编排数据模型"
```

---

## Task 3: Add Workflow API Schemas

**Files:**
- Create: `apps/api/src/schema/workflows.ts`

- [ ] **Step 1: Create Zod schemas**

Create `apps/api/src/schema/workflows.ts`:

```ts
import {
  WORKFLOW_BUSINESS_KIND_VALUES,
  WORKFLOW_CATEGORY_VALUES,
  WORKFLOW_DEFINITION_STATUS_VALUES,
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  WORKFLOW_NODE_TYPE_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized === "" || normalized === "undefined" || normalized === "null") {
        return undefined;
      }
      return normalized;
    }
    return value;
  }, schema.optional());
}

export const WorkflowCategorySchema = z.enum(WORKFLOW_CATEGORY_VALUES, {
  message: "无效的流程分类",
});

export const WorkflowDefinitionStatusSchema = z.enum(
  WORKFLOW_DEFINITION_STATUS_VALUES,
  { message: "无效的流程状态" },
);

export const WorkflowNodeTypeSchema = z.enum(WORKFLOW_NODE_TYPE_VALUES, {
  message: "无效的节点类型",
});

export const WorkflowBusinessKindSchema = z.enum(WORKFLOW_BUSINESS_KIND_VALUES, {
  message: "无效的业务节点类型",
});

export const WorkflowEdgeConditionOperatorSchema = z.enum(
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  { message: "无效的条件操作符" },
);

export const WorkflowListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(WorkflowDefinitionStatusSchema),
  category: optionalQueryValue(WorkflowCategorySchema),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const WorkflowDefinitionCreateSchema = z.object({
  workflow_key: z.string().trim().min(1, "流程编码不能为空").max(100, "流程编码过长"),
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长"),
  description: z.string().trim().max(500, "流程说明过长").nullable().optional(),
  category: WorkflowCategorySchema,
});

export const WorkflowDefinitionUpdateSchema = z.object({
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
  description: z.string().trim().max(500, "流程说明过长").nullable().optional(),
  status: WorkflowDefinitionStatusSchema.optional(),
});

export const WorkflowNodePositionSchema = z.object({
  x: z.coerce.number().finite("节点 X 坐标无效").default(0),
  y: z.coerce.number().finite("节点 Y 坐标无效").default(0),
});

const BaseNodeConfigSchema = z.object({
  required_permissions: z.array(z.string().trim().min(1)).max(20).default([]),
  timeout_hours: z.coerce.number().int().min(1).max(720).nullable().optional(),
  rollback_target_key: z.string().trim().max(100).nullable().optional(),
});

const ApprovalNodeConfigSchema = BaseNodeConfigSchema.extend({
  assignee_rule: z.enum(["employee", "department", "role"], {
    message: "无效的审批人规则",
  }).default("role"),
  assignee_id: z.string().trim().max(100).nullable().optional(),
  amount_threshold: z.coerce.number().nonnegative("金额阈值不能为负数").nullable().optional(),
  approve_mode: z.enum(["any", "all"], { message: "无效的审批方式" }).default("any"),
  reject_target_key: z.string().trim().max(100).nullable().optional(),
});

const ProcedureNodeConfigSchema = BaseNodeConfigSchema.extend({
  stage_key: z.string().trim().min(1, "所属施工阶段不能为空").max(100, "施工阶段编码过长"),
  work_instructions: z.string().trim().max(1000, "作业说明过长").nullable().optional(),
  require_log: z.boolean().default(false),
  min_image_count: z.coerce.number().int().min(0).max(20).default(0),
  trigger_acceptance: z.boolean().default(false),
  customer_visible: z.boolean().default(false),
});

const NotificationNodeConfigSchema = BaseNodeConfigSchema.extend({
  channels: z.array(z.enum(["mini_program", "sms", "todo"])).min(1, "至少选择一个通知渠道").max(3),
  recipient_rule: z.enum(["owner", "assignee", "customer", "role"], {
    message: "无效的通知对象",
  }),
  template: z.string().trim().min(1, "通知模板不能为空").max(500, "通知模板过长"),
});

export const WorkflowNodeConfigSchema = z.union([
  ApprovalNodeConfigSchema,
  ProcedureNodeConfigSchema,
  NotificationNodeConfigSchema,
  BaseNodeConfigSchema,
]);

export const WorkflowNodeInputSchema = z.object({
  id: z.uuid("无效的节点 ID").optional(),
  node_key: z.string().trim().min(1, "节点编码不能为空").max(100, "节点编码过长"),
  node_type: WorkflowNodeTypeSchema,
  business_kind: WorkflowBusinessKindSchema.nullable().optional(),
  title: z.string().trim().min(1, "节点标题不能为空").max(100, "节点标题过长"),
  description: z.string().trim().max(500, "节点说明过长").nullable().optional(),
  position: WorkflowNodePositionSchema.default({ x: 0, y: 0 }),
  config: WorkflowNodeConfigSchema.default({}),
  sort_order: z.coerce.number().int().min(0).max(100000).default(100),
});

export const WorkflowEdgeConditionSchema = z.object({
  operator: WorkflowEdgeConditionOperatorSchema.default("always"),
  field: z.string().trim().max(100).nullable().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable().optional(),
});

export const WorkflowEdgeInputSchema = z.object({
  id: z.uuid("无效的连线 ID").optional(),
  source_node_key: z.string().trim().min(1, "来源节点不能为空").max(100),
  target_node_key: z.string().trim().min(1, "目标节点不能为空").max(100),
  label: z.string().trim().max(100, "连线标签过长").nullable().optional(),
  condition: WorkflowEdgeConditionSchema.default({ operator: "always" }),
  priority: z.coerce.number().int().min(0).max(100000).default(100),
});

export const WorkflowGraphSaveSchema = z.object({
  nodes: z.array(WorkflowNodeInputSchema).max(200, "节点数量不能超过 200"),
  edges: z.array(WorkflowEdgeInputSchema).max(400, "连线数量不能超过 400"),
});

export const WorkflowTemplateCreateSchema = z.object({
  template_key: z.enum(["sales_main", "construction_main", "procedure_standard", "expense_approval"], {
    message: "无效的流程模板",
  }),
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
});

export const WorkflowSimulationSchema = z.object({
  context: z.record(z.string(), z.unknown()).default({}),
});

export type WorkflowListQuery = z.infer<typeof WorkflowListQuerySchema>;
export type WorkflowDefinitionCreateInput = z.infer<typeof WorkflowDefinitionCreateSchema>;
export type WorkflowDefinitionUpdateInput = z.infer<typeof WorkflowDefinitionUpdateSchema>;
export type WorkflowGraphSaveInput = z.infer<typeof WorkflowGraphSaveSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof WorkflowTemplateCreateSchema>;
export type WorkflowSimulationInput = z.infer<typeof WorkflowSimulationSchema>;
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run api:typecheck
```

Expected: TypeScript exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/schema/workflows.ts
git commit -m "feat(workflow): 增加流程编排接口校验"
```

---

## Task 4: Add Workflow Repository

**Files:**
- Create: `apps/api/src/repositories/workflows.ts`

- [ ] **Step 1: Create repository**

Create `apps/api/src/repositories/workflows.ts`:

```ts
import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
  WorkflowListQuery,
} from "@/schema/workflows";
import { SupabaseDB } from "@/utils/supabase";

export type WorkflowDefinitionRow = {
  id: string;
  tenant_id: string;
  workflow_key: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  active_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowNodeRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  node_key: string;
  node_type: string;
  business_kind: string | null;
  title: string;
  description: string | null;
  position: Record<string, unknown>;
  config: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowEdgeRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  condition: Record<string, unknown>;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowGraph = {
  definition: WorkflowDefinitionRow;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

const WORKFLOW_DEFINITION_SELECT = [
  "id",
  "tenant_id",
  "workflow_key",
  "name",
  "description",
  "category",
  "status",
  "active_version_id",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

const WORKFLOW_NODE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "node_key",
  "node_type",
  "business_kind",
  "title",
  "description",
  "position",
  "config",
  "sort_order",
  "created_at",
  "updated_at",
].join(",");

const WORKFLOW_EDGE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "source_node_id",
  "target_node_id",
  "label",
  "condition",
  "priority",
  "created_at",
  "updated_at",
].join(",");

class WorkflowsRepository {
  private db = SupabaseDB.getAdminClient();

  async listDefinitions(tenantId: string, query: WorkflowListQuery) {
    const page = query.page;
    const pageSize = query.pageSize;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = this.db
      .from("workflow_definitions")
      .select(WORKFLOW_DEFINITION_SELECT, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (query.status) request = request.eq("status", query.status);
    if (query.category) request = request.eq("category", query.category);
    if (query.keyword) {
      const keyword = query.keyword.replaceAll("%", "\\%");
      request = request.or(`name.ilike.%${keyword}%,workflow_key.ilike.%${keyword}%`);
    }

    const { data, error, count } = await request;
    if (error) throw error;

    return {
      list: (data || []) as WorkflowDefinitionRow[],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    };
  }

  async getDefinitionById(tenantId: string, id: string) {
    const { data, error } = await this.db
      .from("workflow_definitions")
      .select(WORKFLOW_DEFINITION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data as WorkflowDefinitionRow | null;
  }

  async createDefinition(tenantId: string, employeeId: string | null, input: WorkflowDefinitionCreateInput) {
    const { data, error } = await this.db
      .from("workflow_definitions")
      .insert({
        tenant_id: tenantId,
        workflow_key: input.workflow_key,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        created_by: employeeId,
        updated_by: employeeId,
      })
      .select(WORKFLOW_DEFINITION_SELECT)
      .single();

    if (error) throw error;
    return data as WorkflowDefinitionRow;
  }

  async updateDefinition(tenantId: string, id: string, employeeId: string | null, input: WorkflowDefinitionUpdateInput) {
    const { data, error } = await this.db
      .from("workflow_definitions")
      .update({
        ...input,
        updated_by: employeeId,
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select(WORKFLOW_DEFINITION_SELECT)
      .single();

    if (error) throw error;
    return data as WorkflowDefinitionRow;
  }

  async getGraph(tenantId: string, definitionId: string): Promise<WorkflowGraph | null> {
    const definition = await this.getDefinitionById(tenantId, definitionId);
    if (!definition) return null;

    const [nodesResult, edgesResult] = await Promise.all([
      this.db
        .from("workflow_nodes")
        .select(WORKFLOW_NODE_SELECT)
        .eq("tenant_id", tenantId)
        .eq("definition_id", definitionId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      this.db
        .from("workflow_edges")
        .select(WORKFLOW_EDGE_SELECT)
        .eq("tenant_id", tenantId)
        .eq("definition_id", definitionId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (nodesResult.error) throw nodesResult.error;
    if (edgesResult.error) throw edgesResult.error;

    return {
      definition,
      nodes: (nodesResult.data || []) as WorkflowNodeRow[],
      edges: (edgesResult.data || []) as WorkflowEdgeRow[],
    };
  }

  async replaceGraph(tenantId: string, definitionId: string, input: WorkflowGraphSaveInput) {
    const existingGraph = await this.getGraph(tenantId, definitionId);
    if (!existingGraph) return null;

    const existingNodeByKey = new Map(existingGraph.nodes.map((node) => [node.node_key, node]));
    const nodeRows = input.nodes.map((node) => ({
      id: existingNodeByKey.get(node.node_key)?.id,
      tenant_id: tenantId,
      definition_id: definitionId,
      node_key: node.node_key,
      node_type: node.node_type,
      business_kind: node.business_kind ?? null,
      title: node.title,
      description: node.description ?? null,
      position: node.position,
      config: node.config,
      sort_order: node.sort_order,
    }));

    const { error: deleteEdgesError } = await this.db
      .from("workflow_edges")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("definition_id", definitionId);
    if (deleteEdgesError) throw deleteEdgesError;

    const { error: deleteNodesError } = await this.db
      .from("workflow_nodes")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("definition_id", definitionId);
    if (deleteNodesError) throw deleteNodesError;

    if (nodeRows.length > 0) {
      const { error: insertNodesError } = await this.db
        .from("workflow_nodes")
        .insert(nodeRows);
      if (insertNodesError) throw insertNodesError;
    }

    const graphAfterNodes = await this.getGraph(tenantId, definitionId);
    if (!graphAfterNodes) return null;
    const nodeIdByKey = new Map(graphAfterNodes.nodes.map((node) => [node.node_key, node.id]));

    const edgeRows = input.edges.map((edge) => ({
      tenant_id: tenantId,
      definition_id: definitionId,
      source_node_id: nodeIdByKey.get(edge.source_node_key),
      target_node_id: nodeIdByKey.get(edge.target_node_key),
      label: edge.label ?? null,
      condition: edge.condition,
      priority: edge.priority,
    }));

    if (edgeRows.some((edge) => !edge.source_node_id || !edge.target_node_id)) {
      throw new Error("连线引用的节点不存在");
    }

    if (edgeRows.length > 0) {
      const { error: insertEdgesError } = await this.db
        .from("workflow_edges")
        .insert(edgeRows);
      if (insertEdgesError) throw insertEdgesError;
    }

    return this.getGraph(tenantId, definitionId);
  }

  async createVersion(
    tenantId: string,
    definitionId: string,
    employeeId: string | null,
    snapshot: Record<string, unknown>,
    validationResult: Record<string, unknown>,
  ) {
    const { data: latestVersion, error: latestError } = await this.db
      .from("workflow_versions")
      .select("version_number")
      .eq("tenant_id", tenantId)
      .eq("definition_id", definitionId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const nextVersion = Number(latestVersion?.version_number || 0) + 1;
    const { data, error } = await this.db
      .from("workflow_versions")
      .insert({
        tenant_id: tenantId,
        definition_id: definitionId,
        version_number: nextVersion,
        snapshot,
        validation_result: validationResult,
        published_by: employeeId,
      })
      .select("id,tenant_id,definition_id,version_number,status,snapshot,validation_result,published_by,published_at,created_at")
      .single();
    if (error) throw error;

    const { error: updateError } = await this.db
      .from("workflow_definitions")
      .update({
        status: "active",
        active_version_id: data.id,
        updated_by: employeeId,
      })
      .eq("tenant_id", tenantId)
      .eq("id", definitionId);
    if (updateError) throw updateError;

    return data;
  }
}

export const workflowsRepository = new WorkflowsRepository();
```

- [ ] **Step 2: Replace raw Error with wrapped service boundary**

The repository above contains one `throw new Error("连线引用的节点不存在")`. Replace it with a sentinel return instead of throwing directly:

```ts
    if (edgeRows.some((edge) => !edge.source_node_id || !edge.target_node_id)) {
      return null;
    }
```

The service in Task 5 will convert this to `Errors.badRequest("连线引用的节点不存在")`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run api:typecheck
```

Expected: TypeScript exits 0. If generated Supabase types do not include the new tables yet, use narrow local row types and Supabase table calls as shown above; do not regenerate database types in this task.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/repositories/workflows.ts
git commit -m "feat(workflow): 增加流程编排仓储"
```

---

## Task 5: Add Workflow Service Validation and Simulation

**Files:**
- Create: `apps/api/src/services/workflows.ts`

- [ ] **Step 1: Create workflow service**

Create `apps/api/src/services/workflows.ts`:

```ts
import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
  WorkflowListQuery,
  WorkflowSimulationInput,
  WorkflowTemplateCreateInput,
} from "@/schema/workflows";
import {
  workflowsRepository,
  type WorkflowEdgeRow,
  type WorkflowGraph,
  type WorkflowNodeRow,
} from "@/repositories/workflows";
import { Errors } from "@/errors/error-factory";

type WorkflowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  node_key?: string;
};

function edgeNodeKey(edge: WorkflowEdgeRow, nodesById: Map<string, WorkflowNodeRow>) {
  return {
    source: nodesById.get(edge.source_node_id)?.node_key || "",
    target: nodesById.get(edge.target_node_id)?.node_key || "",
  };
}

class WorkflowsService {
  async listDefinitions(tenantId: string, query: WorkflowListQuery) {
    return workflowsRepository.listDefinitions(tenantId, query);
  }

  async getGraph(tenantId: string, definitionId: string) {
    const graph = await workflowsRepository.getGraph(tenantId, definitionId);
    if (!graph) throw Errors.notFound("流程不存在");
    return this.serializeGraph(graph);
  }

  async createDefinition(
    tenantId: string,
    employeeId: string | null,
    input: WorkflowDefinitionCreateInput,
  ) {
    try {
      return await workflowsRepository.createDefinition(tenantId, employeeId, input);
    } catch (error) {
      throw Errors.dbError("创建流程失败", error);
    }
  }

  async createFromTemplate(
    tenantId: string,
    employeeId: string | null,
    input: WorkflowTemplateCreateInput,
  ) {
    const template = this.buildTemplate(input.template_key, input.name);
    const definition = await this.createDefinition(tenantId, employeeId, {
      workflow_key: template.workflow_key,
      name: template.name,
      description: template.description,
      category: template.category,
    });

    const graph = await workflowsRepository.replaceGraph(tenantId, definition.id, {
      nodes: template.nodes,
      edges: template.edges,
    });
    if (!graph) throw Errors.badRequest("流程模板初始化失败");
    return this.serializeGraph(graph);
  }

  async updateDefinition(
    tenantId: string,
    definitionId: string,
    employeeId: string | null,
    input: WorkflowDefinitionUpdateInput,
  ) {
    try {
      return await workflowsRepository.updateDefinition(tenantId, definitionId, employeeId, input);
    } catch (error) {
      throw Errors.dbError("更新流程失败", error);
    }
  }

  async saveGraph(tenantId: string, definitionId: string, input: WorkflowGraphSaveInput) {
    const validation = this.validateDraftInput(input);
    if (validation.issues.some((issue) => issue.severity === "error")) {
      throw Errors.badRequest(validation.issues.map((issue) => issue.message));
    }

    try {
      const graph = await workflowsRepository.replaceGraph(tenantId, definitionId, input);
      if (!graph) throw Errors.badRequest("连线引用的节点不存在");
      return this.serializeGraph(graph);
    } catch (error) {
      if (error instanceof Error && error.message === "连线引用的节点不存在") {
        throw Errors.badRequest("连线引用的节点不存在");
      }
      throw Errors.dbError("保存流程草稿失败", error);
    }
  }

  async validateGraph(tenantId: string, definitionId: string) {
    const graph = await workflowsRepository.getGraph(tenantId, definitionId);
    if (!graph) throw Errors.notFound("流程不存在");
    return this.validatePersistedGraph(graph);
  }

  async publish(tenantId: string, definitionId: string, employeeId: string | null) {
    const graph = await workflowsRepository.getGraph(tenantId, definitionId);
    if (!graph) throw Errors.notFound("流程不存在");

    const validation = this.validatePersistedGraph(graph);
    if (validation.issues.some((issue) => issue.severity === "error")) {
      throw Errors.badRequest(validation.issues.map((issue) => issue.message));
    }

    const snapshot = this.serializeGraph(graph);
    try {
      return workflowsRepository.createVersion(
        tenantId,
        definitionId,
        employeeId,
        snapshot,
        validation,
      );
    } catch (error) {
      throw Errors.dbError("发布流程失败", error);
    }
  }

  async simulate(tenantId: string, definitionId: string, input: WorkflowSimulationInput) {
    const graph = await workflowsRepository.getGraph(tenantId, definitionId);
    if (!graph) throw Errors.notFound("流程不存在");
    const validation = this.validatePersistedGraph(graph);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nodesByKey = new Map(graph.nodes.map((node) => [node.node_key, node]));
    const startNode = graph.nodes.find((node) => node.node_type === "start");
    const visited: string[] = [];
    const skipped: Array<{ edge: string; reason: string }> = [];
    let current = startNode;

    while (current && visited.length < 50) {
      visited.push(current.node_key);
      if (current.node_type === "end") break;

      const outgoing = graph.edges
        .filter((edge) => edge.source_node_id === current?.id)
        .sort((a, b) => a.priority - b.priority);
      const nextEdge = outgoing.find((edge) => this.conditionMatches(edge.condition, input.context));

      for (const edge of outgoing) {
        if (edge !== nextEdge) {
          const keys = edgeNodeKey(edge, nodesById);
          skipped.push({ edge: `${keys.source}->${keys.target}`, reason: "条件不匹配" });
        }
      }

      if (!nextEdge) break;
      current = nodesByKey.get(nodesById.get(nextEdge.target_node_id)?.node_key || "");
    }

    return {
      validation,
      path: visited,
      skipped,
      context: input.context,
    };
  }

  private validateDraftInput(input: WorkflowGraphSaveInput) {
    const issues: WorkflowValidationIssue[] = [];
    const nodeKeys = new Set<string>();
    for (const node of input.nodes) {
      if (nodeKeys.has(node.node_key)) {
        issues.push({
          severity: "error",
          code: "duplicate_node_key",
          message: `节点编码重复：${node.node_key}`,
          node_key: node.node_key,
        });
      }
      nodeKeys.add(node.node_key);
    }

    for (const edge of input.edges) {
      if (!nodeKeys.has(edge.source_node_key) || !nodeKeys.has(edge.target_node_key)) {
        issues.push({
          severity: "error",
          code: "edge_missing_node",
          message: "连线引用的节点不存在",
        });
      }
    }

    return { valid: issues.every((issue) => issue.severity !== "error"), issues };
  }

  private validatePersistedGraph(graph: WorkflowGraph) {
    const issues: WorkflowValidationIssue[] = [];
    const startNodes = graph.nodes.filter((node) => node.node_type === "start");
    const endNodes = graph.nodes.filter((node) => node.node_type === "end");

    if (startNodes.length !== 1) {
      issues.push({
        severity: "error",
        code: "invalid_start_count",
        message: "流程必须有且只有一个开始节点",
      });
    }
    if (endNodes.length < 1) {
      issues.push({
        severity: "error",
        code: "missing_end",
        message: "流程至少需要一个结束节点",
      });
    }

    const outgoingCount = new Map<string, number>();
    for (const edge of graph.edges) {
      outgoingCount.set(edge.source_node_id, (outgoingCount.get(edge.source_node_id) || 0) + 1);
    }
    for (const node of graph.nodes) {
      if (node.node_type !== "end" && !outgoingCount.get(node.id)) {
        issues.push({
          severity: "error",
          code: "missing_outgoing_edge",
          message: `非结束节点缺少出口：${node.title}`,
          node_key: node.node_key,
        });
      }
    }

    return { valid: issues.every((issue) => issue.severity !== "error"), issues };
  }

  private conditionMatches(condition: Record<string, unknown>, context: Record<string, unknown>) {
    const operator = condition.operator || "always";
    if (operator === "always") return true;
    const field = typeof condition.field === "string" ? condition.field : "";
    const actual = context[field];
    const expected = condition.value;
    if (operator === "eq") return actual === expected;
    if (operator === "neq") return actual !== expected;
    if (operator === "gt") return Number(actual) > Number(expected);
    if (operator === "gte") return Number(actual) >= Number(expected);
    if (operator === "lt") return Number(actual) < Number(expected);
    if (operator === "lte") return Number(actual) <= Number(expected);
    if (operator === "in" && Array.isArray(expected)) return expected.includes(String(actual));
    return false;
  }

  private serializeGraph(graph: WorkflowGraph) {
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    return {
      definition: graph.definition,
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => {
        const keys = edgeNodeKey(edge, nodesById);
        return {
          ...edge,
          source_node_key: keys.source,
          target_node_key: keys.target,
        };
      }),
    };
  }

  private buildTemplate(templateKey: WorkflowTemplateCreateInput["template_key"], name?: string) {
    if (templateKey === "expense_approval") {
      return {
        workflow_key: `expense_approval_${Date.now()}`,
        name: name || "费用审批流程",
        description: "标准费用审批模板",
        category: "approval" as const,
        nodes: [
          { node_key: "start", node_type: "start" as const, title: "开始", position: { x: 80, y: 160 }, config: {}, sort_order: 10 },
          { node_key: "manager_review", node_type: "approval" as const, business_kind: "expense_approval" as const, title: "主管审批", position: { x: 300, y: 160 }, config: { assignee_rule: "role", approve_mode: "any" }, sort_order: 20 },
          { node_key: "finance_review", node_type: "approval" as const, business_kind: "expense_approval" as const, title: "财务审批", position: { x: 520, y: 160 }, config: { assignee_rule: "role", approve_mode: "any" }, sort_order: 30 },
          { node_key: "end", node_type: "end" as const, title: "结束", position: { x: 740, y: 160 }, config: {}, sort_order: 40 },
        ],
        edges: [
          { source_node_key: "start", target_node_key: "manager_review", condition: { operator: "always" as const }, priority: 10 },
          { source_node_key: "manager_review", target_node_key: "finance_review", condition: { operator: "always" as const }, priority: 20 },
          { source_node_key: "finance_review", target_node_key: "end", condition: { operator: "always" as const }, priority: 30 },
        ],
      };
    }

    return {
      workflow_key: `${templateKey}_${Date.now()}`,
      name: name || "业务主流程",
      description: "流程编排模板",
      category: "main" as const,
      nodes: [
        { node_key: "start", node_type: "start" as const, title: "开始", position: { x: 80, y: 160 }, config: {}, sort_order: 10 },
        { node_key: "business", node_type: "business" as const, title: "业务节点", position: { x: 320, y: 160 }, config: {}, sort_order: 20 },
        { node_key: "end", node_type: "end" as const, title: "结束", position: { x: 560, y: 160 }, config: {}, sort_order: 30 },
      ],
      edges: [
        { source_node_key: "start", target_node_key: "business", condition: { operator: "always" as const }, priority: 10 },
        { source_node_key: "business", target_node_key: "end", condition: { operator: "always" as const }, priority: 20 },
      ],
    };
  }
}

export const workflowsService = new WorkflowsService();
```

- [ ] **Step 2: Fix repository sentinel handling if needed**

If `saveGraph()` cannot distinguish repository null results, make repository expose `getDefinitionById()` and check the definition before `replaceGraph()`. Keep all user-facing errors in service through `Errors.*`.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run api:typecheck
```

Expected: TypeScript exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/workflows.ts apps/api/src/repositories/workflows.ts
git commit -m "feat(workflow): 增加流程校验和模拟服务"
```

---

## Task 6: Add Workflow Controller and Routes

**Files:**
- Create: `apps/api/src/controllers/workflows/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Create controller**

Create `apps/api/src/controllers/workflows/index.ts`:

```ts
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  WorkflowDefinitionCreateSchema,
  WorkflowDefinitionUpdateSchema,
  WorkflowGraphSaveSchema,
  WorkflowListQuerySchema,
  WorkflowSimulationSchema,
  WorkflowTemplateCreateSchema,
} from "@/schema/workflows";
import { accessPolicyService } from "@/services/access-policy";
import { workflowsService } from "@/services/workflows";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class WorkflowsController extends TenantBaseController<
  typeof WorkflowDefinitionCreateSchema,
  typeof WorkflowDefinitionUpdateSchema
> {
  constructor() {
    super("workflow_definitions", WorkflowDefinitionCreateSchema, WorkflowDefinitionUpdateSchema);
  }

  private async getWorkflowContext(request: FastifyRequest) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertTenantContext(authContext);
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");
    return {
      tenantId: authContext.tenantId,
      employeeId: authContext.employee?.id || null,
    };
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await this.getWorkflowContext(request);
    const result = WorkflowListQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.listDefinitions(context.tenantId, result.data);
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await workflowsService.getGraph(context.tenantId, idVerify.data.id);
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await this.getWorkflowContext(request);
    const result = WorkflowDefinitionCreateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.createDefinition(
      context.tenantId,
      context.employeeId,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = WorkflowDefinitionUpdateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.updateDefinition(
      context.tenantId,
      idVerify.data.id,
      context.employeeId,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  @Post("/workflows/from-template")
  async createFromTemplate(request: FastifyRequest, reply: FastifyReply) {
    const context = await this.getWorkflowContext(request);
    const result = WorkflowTemplateCreateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.createFromTemplate(
      context.tenantId,
      context.employeeId,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Patch("/workflows/:id/graph")
  async saveGraph(request: FastifyRequest, reply: FastifyReply) {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = WorkflowGraphSaveSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.saveGraph(
      context.tenantId,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/workflows/:id/validate")
  async validateWorkflow(request: FastifyRequest, reply: FastifyReply) {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await workflowsService.validateGraph(context.tenantId, idVerify.data.id);
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/publish")
  async publishWorkflow(request: FastifyRequest, reply: FastifyReply) {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await workflowsService.publish(
      context.tenantId,
      idVerify.data.id,
      context.employeeId,
    );
    return ResponseHandler.success(data);
  }

  @Post("/workflows/:id/simulate")
  async simulateWorkflow(request: FastifyRequest, reply: FastifyReply) {
    const context = await this.getWorkflowContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = WorkflowSimulationSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await workflowsService.simulate(
      context.tenantId,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new WorkflowsController();
```

- [ ] **Step 2: Register routes**

Modify `apps/api/src/routes/index.ts`.

Add import:

```ts
import WorkflowsController from "@/controllers/workflows";
```

Add extra route registration near other tenant business controllers:

```ts
  WorkflowsController.registerExtraRoutes(app);
```

Add resource registration near other resource routes:

```ts
  app.register(createResourceRoutes("workflows", WorkflowsController, fullCrudRoutes));
```

- [ ] **Step 3: Run API verification**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/controllers/workflows/index.ts apps/api/src/routes/index.ts
git commit -m "feat(workflow): 增加流程编排接口"
```

---

## Task 7: Add Admin Workflow Data Helpers and Types

**Files:**
- Create: `apps/admin/components/workflows/workflow-types.ts`
- Create: `apps/admin/components/workflows/workflow-data.ts`

- [ ] **Step 1: Create Admin workflow types**

Create `apps/admin/components/workflows/workflow-types.ts`:

```ts
import type {
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowNodeType,
} from "@gooes/domain";

export type WorkflowDefinitionRecord = {
  id: string;
  tenant_id: string;
  workflow_key: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  status: WorkflowDefinitionStatus;
  active_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowNodeRecord = {
  id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind: string | null;
  title: string;
  description: string | null;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  sort_order: number;
};

export type WorkflowEdgeRecord = {
  id: string;
  source_node_key: string;
  target_node_key: string;
  label: string | null;
  condition: Record<string, unknown>;
  priority: number;
};

export type WorkflowGraphRecord = {
  definition: WorkflowDefinitionRecord;
  nodes: WorkflowNodeRecord[];
  edges: WorkflowEdgeRecord[];
};

export type WorkflowPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WorkflowListData = {
  list: WorkflowDefinitionRecord[];
  pagination: WorkflowPagination;
};

export type WorkflowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  node_key?: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};

export type WorkflowSimulationResult = {
  validation: WorkflowValidationResult;
  path: string[];
  skipped: Array<{ edge: string; reason: string }>;
  context: Record<string, unknown>;
};
```

- [ ] **Step 2: Create Admin data helpers**

Create `apps/admin/components/workflows/workflow-data.ts`:

```ts
import type {
  WorkflowGraphRecord,
  WorkflowListData,
  WorkflowSimulationResult,
  WorkflowValidationResult,
} from "@/components/workflows/workflow-types";
import { requestBackendJson } from "@/lib/backend-client";

export const WORKFLOW_PAGE_SIZE = 20;

export type WorkflowFiltersState = {
  status: string;
  category: string;
  keyword: string;
};

export function emptyWorkflowFilters(): WorkflowFiltersState {
  return { status: "", category: "", keyword: "" };
}

export async function fetchWorkflows(filters: WorkflowFiltersState, page: number) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(WORKFLOW_PAGE_SIZE),
  });

  if (filters.status) query.set("status", filters.status);
  if (filters.category) query.set("category", filters.category);
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());

  return requestBackendJson<WorkflowListData>(`/workflows?${query.toString()}`, {
    cache: "no-store",
    fallbackMessage: "流程列表加载失败",
  });
}

export async function fetchWorkflowGraph(id: string) {
  return requestBackendJson<WorkflowGraphRecord>(`/workflows/${id}`, {
    cache: "no-store",
    fallbackMessage: "流程详情加载失败",
  });
}

export async function createWorkflowFromTemplate(input: { template_key: string; name?: string }) {
  return requestBackendJson<WorkflowGraphRecord>("/workflows/from-template", {
    method: "POST",
    body: JSON.stringify(input),
    fallbackMessage: "创建流程模板失败",
  });
}

export async function saveWorkflowGraph(id: string, graph: Pick<WorkflowGraphRecord, "nodes" | "edges">) {
  return requestBackendJson<WorkflowGraphRecord>(`/workflows/${id}/graph`, {
    method: "PATCH",
    body: JSON.stringify({ nodes: graph.nodes, edges: graph.edges }),
    fallbackMessage: "保存流程草稿失败",
  });
}

export async function validateWorkflow(id: string) {
  return requestBackendJson<WorkflowValidationResult>(`/workflows/${id}/validate`, {
    cache: "no-store",
    fallbackMessage: "流程校验失败",
  });
}

export async function publishWorkflow(id: string) {
  return requestBackendJson(`/workflows/${id}/publish`, {
    method: "POST",
    fallbackMessage: "发布流程失败",
  });
}

export async function simulateWorkflow(id: string, context: Record<string, unknown>) {
  return requestBackendJson<WorkflowSimulationResult>(`/workflows/${id}/simulate`, {
    method: "POST",
    body: JSON.stringify({ context }),
    fallbackMessage: "模拟运行失败",
  });
}
```

- [ ] **Step 3: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/workflows/workflow-types.ts apps/admin/components/workflows/workflow-data.ts
git commit -m "feat(admin): 增加流程编排数据 helpers"
```

---

## Task 8: Add Admin Workflow List Page

**Files:**
- Create: `apps/admin/app/(console)/workflows/page.tsx`
- Create: `apps/admin/components/workflows/workflow-list-shell.tsx`
- Create: `apps/admin/components/workflows/workflow-template-dialog.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Add nav item**

Modify `apps/admin/components/layout/menu-config.ts`.

Add icon import:

```ts
  Workflow,
```

Add tenant business nav item after “费用审批”:

```ts
      { href: "/workflows", label: "流程编排", icon: Workflow, permission: "employee.permission_manage" },
```

- [ ] **Step 2: Create workflow list page**

Create `apps/admin/app/(console)/workflows/page.tsx`:

```tsx
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { WorkflowListShell } from "@/components/workflows/workflow-list-shell";
import type { WorkflowListData } from "@/components/workflows/workflow-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type WorkflowPageSearchParams = {
  page?: string;
  status?: string;
  category?: string;
  keyword?: string;
};

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

async function getWorkflows(params: WorkflowPageSearchParams) {
  const token = await getAdminToken();
  const page = normalizePage(params.page);
  if (!token) {
    return {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (params.status?.trim()) query.set("status", params.status.trim());
  if (params.category?.trim()) query.set("category", params.category.trim());
  if (params.keyword?.trim()) query.set("keyword", params.keyword.trim());

  try {
    const response = await fetch(buildBackendUrl(`/workflows?${query.toString()}`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WorkflowListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "流程列表加载失败",
    };
  }
}

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowPageSearchParams>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const params = await searchParams;
  const status = params.status?.trim() || "";
  const category = params.category?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  const { list, pagination, error } = await getWorkflows(params);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">流程编排</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理租户业务主流程、施工工序模板和审批子流程。第一阶段只驱动草稿、预览、校验和发布。
        </p>
      </div>
      <WorkflowListShell
        workflows={list}
        pagination={pagination}
        status={status}
        category={category}
        keyword={keyword}
        error={error}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create list shell**

Create `apps/admin/components/workflows/workflow-list-shell.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { GitBranch, Loader2, Workflow } from "lucide-react";
import { WorkflowCategoryConfig, WorkflowDefinitionStatusConfig } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { WorkflowTemplateDialog } from "@/components/workflows/workflow-template-dialog";
import type { WorkflowDefinitionRecord, WorkflowPagination } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WorkflowListShell({
  workflows,
  pagination,
  status,
  category,
  keyword,
  error,
}: {
  workflows: WorkflowDefinitionRecord[];
  pagination: WorkflowPagination;
  status: string;
  category: string;
  keyword: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeCount = workflows.filter((item) => item.status === "active").length;
  const draftCount = workflows.filter((item) => item.status === "draft").length;

  function refresh() {
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Workflow />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">当前筛选流程</div>
              <div className="text-xl font-semibold">{pagination.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-success text-success-foreground">
              <GitBranch />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页已发布</div>
              <div className="text-xl font-semibold">{activeCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <GitBranch />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页草稿</div>
              <div className="text-xl font-semibold">{draftCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>流程列表</CardTitle>
            <CardDescription>
              当前共 {pagination.total} 条记录。筛选参数：{status || "全部状态"} / {category || "全部分类"} / {keyword || "无关键词"}。
            </CardDescription>
          </div>
          <WorkflowTemplateDialog onCreated={refresh} />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {workflows.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a className="font-medium text-primary hover:underline" href={`/workflows/${item.id}`}>
                      {item.name}
                    </a>
                    <Badge variant="outline">{WorkflowCategoryConfig[item.category]?.label || item.category}</Badge>
                    <Badge variant={item.status === "active" ? "default" : "secondary"}>
                      {WorkflowDefinitionStatusConfig[item.status]?.label || item.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.description || item.workflow_key}</div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <a href={`/workflows/${item.id}`}>编辑</a>
                </Button>
              </div>
            ))}
            {workflows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                暂无流程，先从模板创建一个。
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
            <span>第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页</span>
            {pending ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />正在更新</span> : null}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Create template dialog**

Create `apps/admin/components/workflows/workflow-template-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createWorkflowFromTemplate } from "@/components/workflows/workflow-data";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const templates = [
  { value: "sales_main", label: "客户销售主流程" },
  { value: "construction_main", label: "施工主流程" },
  { value: "procedure_standard", label: "标准工序模板" },
  { value: "expense_approval", label: "费用审批流程" },
] as const;

export function WorkflowTemplateDialog({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] = useState("expense_approval");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      try {
        const graph = await createWorkflowFromTemplate({
          template_key: templateKey,
          name: name.trim() || undefined,
        });
        toast.success("流程已创建");
        setOpen(false);
        onCreated();
        router.push(`/workflows/${graph.definition.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "创建流程失败");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          从模板创建
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从模板创建流程</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>模板</Label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {templates.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>流程名称</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="留空使用模板名称" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={pending} onClick={handleCreate}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/'(console)'/workflows/page.tsx apps/admin/components/workflows/workflow-list-shell.tsx apps/admin/components/workflows/workflow-template-dialog.tsx apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 增加流程编排列表页"
```

---

## Task 9: Add Admin Workflow Designer Shell

**Files:**
- Create: `apps/admin/app/(console)/workflows/[id]/page.tsx`
- Create: `apps/admin/components/workflows/workflow-designer-shell.tsx`
- Create: `apps/admin/components/workflows/workflow-node-library.tsx`
- Create: `apps/admin/components/workflows/workflow-canvas.tsx`
- Create: `apps/admin/components/workflows/workflow-property-panel.tsx`
- Create: `apps/admin/components/workflows/workflow-validation-panel.tsx`

- [ ] **Step 1: Create designer server page**

Create `apps/admin/app/(console)/workflows/[id]/page.tsx`:

```tsx
import { getTenantBusinessAccessDenied } from "@/components/layout/platform-mode-access-denied";
import { WorkflowDesignerShell } from "@/components/workflows/workflow-designer-shell";
import type { WorkflowGraphRecord } from "@/components/workflows/workflow-types";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

async function getWorkflow(id: string) {
  const token = await getAdminToken();
  if (!token) return { graph: null, error: "缺少登录凭证" };
  try {
    const response = await fetch(buildBackendUrl(`/workflows/${id}`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WorkflowGraphRecord>(response);
    return { graph: payload.data || null, error: null };
  } catch (error) {
    return {
      graph: null,
      error: error instanceof Error ? error.message : "流程详情加载失败",
    };
  }
}

export default async function WorkflowDesignerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const accessDenied = await getTenantBusinessAccessDenied();
  if (accessDenied) return accessDenied;

  const { id } = await params;
  const { graph, error } = await getWorkflow(id);

  return (
    <WorkflowDesignerShell workflowId={id} initialGraph={graph} initialError={error} />
  );
}
```

- [ ] **Step 2: Create node library**

Create `apps/admin/components/workflows/workflow-node-library.tsx`:

```tsx
"use client";

import { WorkflowNodeTypeConfig, type WorkflowNodeType } from "@gooes/domain";
import { Button } from "@/components/ui/button";

const nodeTypes: WorkflowNodeType[] = [
  "business",
  "construction_stage",
  "procedure",
  "approval",
  "confirmation",
  "notification",
  "automation",
  "subflow",
];

export function WorkflowNodeLibrary({
  onAddNode,
}: {
  onAddNode: (nodeType: WorkflowNodeType) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 border-r bg-muted/20 p-3">
      <div>
        <h2 className="text-sm font-semibold">节点库</h2>
        <p className="mt-1 text-xs text-muted-foreground">点击添加节点到画布。</p>
      </div>
      <div className="grid gap-2">
        {nodeTypes.map((type) => (
          <Button key={type} variant="outline" className="justify-start" onClick={() => onAddNode(type)}>
            {WorkflowNodeTypeConfig[type].label}
          </Button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create canvas**

Create `apps/admin/components/workflows/workflow-canvas.tsx`:

```tsx
"use client";

import { WorkflowNodeTypeConfig } from "@gooes/domain";
import type { WorkflowEdgeRecord, WorkflowNodeRecord } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";

export function WorkflowCanvas({
  nodes,
  edges,
  selectedNodeKey,
  onSelectNode,
}: {
  nodes: WorkflowNodeRecord[];
  edges: WorkflowEdgeRecord[];
  selectedNodeKey: string | null;
  onSelectNode: (nodeKey: string) => void;
}) {
  const nodeByKey = new Map(nodes.map((node) => [node.node_key, node]));

  return (
    <div className="relative h-[620px] overflow-auto bg-slate-50">
      <svg className="absolute inset-0 h-[900px] w-[1300px]" aria-hidden="true">
        {edges.map((edge) => {
          const source = nodeByKey.get(edge.source_node_key);
          const target = nodeByKey.get(edge.target_node_key);
          if (!source || !target) return null;
          const x1 = source.position.x + 180;
          const y1 = source.position.y + 36;
          const x2 = target.position.x;
          const y2 = target.position.y + 36;
          return (
            <line
              key={edge.id || `${edge.source_node_key}-${edge.target_node_key}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#64748b"
              strokeWidth="2"
              markerEnd="url(#arrow)"
            />
          );
        })}
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill="#64748b" />
          </marker>
        </defs>
      </svg>
      <div className="relative h-[900px] w-[1300px]">
        {nodes.map((node) => {
          const selected = node.node_key === selectedNodeKey;
          return (
            <button
              key={node.node_key}
              type="button"
              className={`absolute flex h-[72px] w-[180px] flex-col items-start justify-center rounded-md border bg-background px-3 text-left shadow-sm transition ${
                selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/60"
              }`}
              style={{ left: node.position.x, top: node.position.y }}
              onClick={() => onSelectNode(node.node_key)}
            >
              <span className="max-w-full truncate text-sm font-medium">{node.title}</span>
              <Badge variant="outline" className="mt-1">
                {WorkflowNodeTypeConfig[node.node_type]?.label || node.node_type}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create property panel**

Create `apps/admin/components/workflows/workflow-property-panel.tsx`:

```tsx
"use client";

import { WorkflowNodeTypeConfig, WORKFLOW_NODE_TYPE_VALUES, type WorkflowNodeType } from "@gooes/domain";
import type { WorkflowNodeRecord } from "@/components/workflows/workflow-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function WorkflowPropertyPanel({
  node,
  onChangeNode,
}: {
  node: WorkflowNodeRecord | null;
  onChangeNode: (node: WorkflowNodeRecord) => void;
}) {
  if (!node) {
    return (
      <div className="h-full border-l bg-background p-4 text-sm text-muted-foreground">
        选择一个节点后编辑属性。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto border-l bg-background p-4">
      <div>
        <h2 className="text-sm font-semibold">节点属性</h2>
        <p className="mt-1 text-xs text-muted-foreground">{node.node_key}</p>
      </div>
      <div className="grid gap-2">
        <Label>标题</Label>
        <Input value={node.title} onChange={(event) => onChangeNode({ ...node, title: event.target.value })} />
      </div>
      <div className="grid gap-2">
        <Label>节点类型</Label>
        <Select
          value={node.node_type}
          onValueChange={(value) => onChangeNode({ ...node, node_type: value as WorkflowNodeType })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {WORKFLOW_NODE_TYPE_VALUES.map((type) => (
              <SelectItem key={type} value={type}>{WorkflowNodeTypeConfig[type].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>说明</Label>
        <Textarea
          value={node.description || ""}
          onChange={(event) => onChangeNode({ ...node, description: event.target.value })}
          rows={4}
        />
      </div>
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Phase 1 仅开放公共属性。审批、工序、通知等类型属性会在后续任务中继续细分为结构化表单。
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create validation panel**

Create `apps/admin/components/workflows/workflow-validation-panel.tsx`:

```tsx
"use client";

import type { WorkflowSimulationResult, WorkflowValidationResult } from "@/components/workflows/workflow-types";
import { Badge } from "@/components/ui/badge";

export function WorkflowValidationPanel({
  validation,
  simulation,
}: {
  validation: WorkflowValidationResult | null;
  simulation: WorkflowSimulationResult | null;
}) {
  return (
    <div className="grid gap-3 border-t bg-background p-3 md:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          校验结果
          {validation ? (
            <Badge variant={validation.valid ? "default" : "destructive"}>
              {validation.valid ? "通过" : "未通过"}
            </Badge>
          ) : null}
        </div>
        <div className="space-y-1 text-sm text-muted-foreground">
          {validation?.issues.map((issue) => (
            <div key={`${issue.code}-${issue.node_key || issue.message}`}>{issue.message}</div>
          ))}
          {validation && validation.issues.length === 0 ? <div>暂无问题。</div> : null}
          {!validation ? <div>尚未运行校验。</div> : null}
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">模拟路径</div>
        <div className="text-sm text-muted-foreground">
          {simulation ? simulation.path.join(" -> ") || "没有可执行路径" : "尚未模拟运行。"}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create designer shell**

Create `apps/admin/components/workflows/workflow-designer-shell.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, GitBranch, Loader2, Play, Save } from "lucide-react";
import { publishWorkflow, saveWorkflowGraph, simulateWorkflow, validateWorkflow } from "@/components/workflows/workflow-data";
import { WorkflowCanvas } from "@/components/workflows/workflow-canvas";
import { WorkflowNodeLibrary } from "@/components/workflows/workflow-node-library";
import { WorkflowPropertyPanel } from "@/components/workflows/workflow-property-panel";
import { WorkflowValidationPanel } from "@/components/workflows/workflow-validation-panel";
import type {
  WorkflowGraphRecord,
  WorkflowNodeRecord,
  WorkflowSimulationResult,
  WorkflowValidationResult,
} from "@/components/workflows/workflow-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { WorkflowNodeType } from "@gooes/domain";

function createNode(nodeType: WorkflowNodeType, index: number): WorkflowNodeRecord {
  return {
    id: `local-${Date.now()}-${index}`,
    node_key: `${nodeType}_${index}`,
    node_type: nodeType,
    business_kind: null,
    title: "新节点",
    description: null,
    position: { x: 120 + index * 220, y: 240 },
    config: {},
    sort_order: index * 10,
  };
}

export function WorkflowDesignerShell({
  workflowId,
  initialGraph,
  initialError,
}: {
  workflowId: string;
  initialGraph: WorkflowGraphRecord | null;
  initialError: string | null;
}) {
  const [graph, setGraph] = useState(initialGraph);
  const [selectedNodeKey, setSelectedNodeKey] = useState(initialGraph?.nodes[0]?.node_key || null);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [simulation, setSimulation] = useState<WorkflowSimulationResult | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.node_key === selectedNodeKey) || null,
    [graph?.nodes, selectedNodeKey],
  );

  function updateNode(nextNode: WorkflowNodeRecord) {
    if (!graph) return;
    setGraph({
      ...graph,
      nodes: graph.nodes.map((node) => node.node_key === nextNode.node_key ? nextNode : node),
    });
  }

  function addNode(nodeType: WorkflowNodeType) {
    if (!graph) return;
    const nextNode = createNode(nodeType, graph.nodes.length + 1);
    setGraph({ ...graph, nodes: [...graph.nodes, nextNode] });
    setSelectedNodeKey(nextNode.node_key);
  }

  function handleSave() {
    if (!graph) return;
    startTransition(async () => {
      try {
        const nextGraph = await saveWorkflowGraph(workflowId, {
          nodes: graph.nodes,
          edges: graph.edges,
        });
        setGraph(nextGraph);
        toast.success("流程草稿已保存");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function handleValidate() {
    startTransition(async () => {
      try {
        setValidation(await validateWorkflow(workflowId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "校验失败");
      }
    });
  }

  function handleSimulate() {
    startTransition(async () => {
      try {
        const result = await simulateWorkflow(workflowId, { amount: 5000 });
        setSimulation(result);
        setValidation(result.validation);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "模拟失败");
      }
    });
  }

  function handlePublish() {
    startTransition(async () => {
      try {
        await publishWorkflow(workflowId);
        toast.success("流程已发布");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  if (!graph) {
    return (
      <Card>
        <CardContent className="p-8 text-sm text-muted-foreground">
          {initialError || "流程不存在"}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-[calc(100vh-104px)] min-h-[760px] flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
        <div>
          <a href="/workflows" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            返回流程列表
          </a>
          <h1 className="mt-1 text-xl font-semibold">{graph.definition.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleValidate} disabled={pending}>校验</Button>
          <Button variant="outline" onClick={handleSimulate} disabled={pending}>
            <Play data-icon="inline-start" />
            模拟
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={pending}>
            <Save data-icon="inline-start" />
            保存草稿
          </Button>
          <Button onClick={handlePublish} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <GitBranch data-icon="inline-start" />}
            发布
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
        <WorkflowNodeLibrary onAddNode={addNode} />
        <WorkflowCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          selectedNodeKey={selectedNodeKey}
          onSelectNode={setSelectedNodeKey}
        />
        <WorkflowPropertyPanel node={selectedNode} onChangeNode={updateNode} />
      </div>
      <WorkflowValidationPanel validation={validation} simulation={simulation} />
    </div>
  );
}
```

- [ ] **Step 7: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/admin/app/'(console)'/workflows/'[id]'/page.tsx apps/admin/components/workflows/workflow-designer-shell.tsx apps/admin/components/workflows/workflow-node-library.tsx apps/admin/components/workflows/workflow-canvas.tsx apps/admin/components/workflows/workflow-property-panel.tsx apps/admin/components/workflows/workflow-validation-panel.tsx
git commit -m "feat(admin): 增加流程编排设计器骨架"
```

---

## Task 10: Add Workflow Designer Smoke Coverage

**Files:**
- Modify: `apps/admin/e2e/admin-smoke.spec.ts`

- [ ] **Step 1: Add smoke route coverage**

Append a route-level smoke test in `apps/admin/e2e/admin-smoke.spec.ts` near existing console smoke tests:

```ts
test("workflow orchestration page renders navigation shell", async ({ page }) => {
  await page.goto("/workflows");
  await expect(page.getByRole("heading", { name: "流程编排" })).toBeVisible();
  await expect(page.getByRole("button", { name: /从模板创建/ })).toBeVisible();
});
```

If the existing smoke file uses a shared authenticated setup helper, put this test inside the same authenticated describe block. Do not add a new auth mechanism.

- [ ] **Step 2: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: exits 0.

- [ ] **Step 3: Run targeted Playwright smoke if local Admin server is available**

Run:

```bash
pnpm --dir apps/admin exec playwright test e2e/admin-smoke.spec.ts --grep "workflow orchestration"
```

Expected:

- PASS if the admin test server and API proxy are configured.
- If it fails because no local API/auth fixture is available, record the exact failure in the implementation notes and do not claim browser verification.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/e2e/admin-smoke.spec.ts
git commit -m "test(admin): 覆盖流程编排页面 smoke"
```

---

## Task 11: Final Verification and Handoff

**Files:**
- No source changes expected.

- [ ] **Step 1: Run API checks**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: all exit 0.

- [ ] **Step 2: Run Admin check**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: exits 0.

- [ ] **Step 3: Inspect migration alignment if migration was applied**

If the implementation applies the migration to a linked Supabase project, run:

```bash
supabase migration list
```

Expected: local and remote migration histories align. If the migration was not applied, say so explicitly in the final handoff.

- [ ] **Step 4: Review Git status**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected:

- Working tree clean.
- Recent commits match task commits.

- [ ] **Step 5: Write implementation handoff**

Include:

- What Phase 1 now supports.
- That runtime workflow instances and费用审批真实运行 remain out of scope.
- Which verification commands passed.
- Whether the migration was applied or only added to version control.
- Any Playwright/browser verification limitations.

---

## Self-Review

### Spec Coverage

- Product structure: Tasks 8 and 9 cover workflow list, template creation, designer, node library, canvas, property panel, validation/simulation panel.
- Backend data model: Task 2 covers definitions, versions, nodes, and edges. Runtime instance tables are intentionally deferred because Phase 1 does not execute business flows.
- Node model: Tasks 1, 3, 5, and 9 cover shared types, node configs, validation, and editable properties.
- Validation and publish: Tasks 5 and 6 cover validation, publish, and immutable version snapshots.
- Simulation: Tasks 5, 6, and 9 cover simulation API and Admin display.
- Migration rule: Task 2 uses a Supabase migration.
- Pagination/performance: Task 4 uses `.range()` and necessary indexes.
- Admin design: Tasks 8 and 9 use existing shadcn/Tailwind admin patterns.

### Intentional Gaps

- `workflow_instances`, task generation, audit logs, and费用审批 runtime are Phase 2.
- Real drag-and-drop is not included in Phase 1. Phase 1 adds click-to-add and selectable canvas nodes to validate layout and data flow. Dragging can be a follow-up UI task once API and graph persistence are stable.
- Node type-specific property forms are only partially modeled in Phase 1. The property panel exposes common fields and leaves deeper type-specific panels to later tasks.

### Placeholder Scan

The plan was checked for unfinished-marker language and vague implementation steps. If the plan is edited later, rerun the same kind of marker scan before execution.
