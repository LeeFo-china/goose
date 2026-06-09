# Workflow Runtime Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable workflow runtime so a published workflow can create an instance, create the current node task, complete a node, transition to the next node, and expose runtime records to Admin/API consumers.

**Architecture:** Extend the existing workflow bounded module instead of replacing business state machines. Runtime state is stored separately from workflow definitions and immutable versions; services validate tenant access, repository code talks directly to Supabase/RPC, and controllers remain HTTP-only. This phase provides a generic runtime API and smoke-tested behavior, then later phases can bind customers, procedures, and expenses to it.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase/Postgres migrations and RPCs, Next.js App Router, shadcn/Radix/Tailwind, `@gooes/domain`.

---

## Scope Boundary

This plan implements the generic runtime foundation:

- Runtime tables for workflow instances, node runs, tasks, and transition logs.
- RPC-backed instance start and node completion to keep transitions atomic.
- API endpoints under `/workflows/:id/runtime/*`.
- Admin read-only runtime list on the workflow designer page.
- Smoke scripts through real API calls.

This plan does not replace existing customer/project/expense state machines. Integration into customer lead flow, construction procedures, and expense approval will be separate follow-up plans after the runtime foundation is verified.

## File Structure

### Create

- `supabase/migrations/20260609170000_create_workflow_runtime.sql`  
  Create runtime tables, enums/check constraints, indexes, and helper RPCs.

- `apps/api/src/repositories/workflows/runtime.ts`  
  Direct Supabase/RPC access for runtime list/detail/start/complete operations.

- `apps/admin/components/workflows/workflow-runtime-panel.tsx`  
  Read-only runtime instance table for a workflow definition.

### Modify

- `packages/domain/src/workflow.ts`  
  Add runtime status/task status/subject type constants.

- `apps/api/src/repositories/workflows/client.ts`  
  Add runtime table names and RPC names.

- `apps/api/src/repositories/workflows/types.ts`  
  Add runtime row/input/result types.

- `apps/api/src/repositories/workflows.ts`  
  Re-export runtime repository methods.

- `apps/api/src/schema/workflows.ts`  
  Add runtime list/start/complete Zod schemas.

- `apps/api/src/services/workflows.ts`  
  Add runtime orchestration methods and transition error mapping.

- `apps/api/src/controllers/workflows/index.ts`  
  Add runtime endpoints.

- `apps/admin/components/workflows/workflow-types.ts`  
  Add Admin runtime DTO types.

- `apps/admin/components/workflows/workflow-requests.ts`  
  Add runtime fetch/start/complete helpers.

- `apps/admin/components/workflows/workflow-designer-shell.tsx`  
  Render runtime panel below the designer.

## Runtime API Contract

### `GET /workflows/:id/runtime/instances?page=1&pageSize=20`

Returns a paginated list:

```json
{
  "list": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "definition_id": "uuid",
      "version_id": "uuid",
      "subject_type": "manual",
      "subject_id": "smoke-1",
      "status": "running",
      "current_node_id": "uuid",
      "current_node_key": "lead",
      "started_at": "2026-06-09T00:00:00.000Z",
      "completed_at": null,
      "created_at": "2026-06-09T00:00:00.000Z",
      "updated_at": "2026-06-09T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /workflows/:id/runtime/instances`

Body:

```json
{
  "subject_type": "manual",
  "subject_id": "smoke-1",
  "context": { "source": "admin_smoke" }
}
```

Creates an instance from the active published version, moves from the single `start` node to the first reachable node, and creates a pending task for that current node.

### `POST /workflows/:id/runtime/instances/:instanceId/complete-node`

Body:

```json
{
  "node_key": "lead",
  "action": "complete",
  "output": { "note": "done" }
}
```

Completes the current node, selects the first matching outgoing edge, transitions to the next node, creates the next pending task, and marks the instance complete if the next node is `end`.

## Tasks

### Task 1: Runtime Domain Constants

**Files:**
- Modify: `packages/domain/src/workflow.ts`

- [ ] Add `WORKFLOW_INSTANCE_STATUS_VALUES = ['running', 'completed', 'canceled', 'failed']`.
- [ ] Add `WORKFLOW_TASK_STATUS_VALUES = ['pending', 'completed', 'canceled']`.
- [ ] Add `WORKFLOW_SUBJECT_TYPE_VALUES = ['manual', 'customer', 'project', 'expense_request', 'procedure']`.
- [ ] Export matching TypeScript union types.
- [ ] Run `bun run api:typecheck` and `pnpm --dir apps/admin check`.

### Task 2: Runtime Migration

**Files:**
- Create: `supabase/migrations/20260609170000_create_workflow_runtime.sql`

- [ ] Create `workflow_instances` with tenant, definition, version, subject, status, context, current node fields, created/updated actor fields, timestamps, and a unique active-subject partial index.
- [ ] Create `workflow_instance_nodes` with instance/node execution history, status, input/output payloads, started/completed timestamps, and tenant indexes.
- [ ] Create `workflow_tasks` with instance/node assignment fields, status, due time, completed fields, and tenant/status indexes.
- [ ] Create `workflow_transition_logs` with source/target node, edge, action, context, and actor fields.
- [ ] Create RPC `start_workflow_instance(...)` using active version snapshot and first start edge.
- [ ] Create RPC `complete_workflow_instance_node(...)` using row locks, current node validation, transition logging, task completion, next task creation, and end-node completion.
- [ ] Revoke runtime RPC execution from public/anon/authenticated and grant only `service_role`.
- [ ] Run `supabase migration list` after applying migrations.

### Task 3: Runtime Repository

**Files:**
- Modify: `apps/api/src/repositories/workflows/client.ts`
- Modify: `apps/api/src/repositories/workflows/types.ts`
- Create: `apps/api/src/repositories/workflows/runtime.ts`
- Modify: `apps/api/src/repositories/workflows.ts`

- [ ] Add runtime table/RPC names to the untyped workflow client.
- [ ] Add runtime row and result types.
- [ ] Implement paginated `listRuntimeInstances()` using `.range()` and explicit selects.
- [ ] Implement `startRuntimeInstance()` via RPC.
- [ ] Implement `completeRuntimeNode()` via RPC.
- [ ] Re-export methods through `apps/api/src/repositories/workflows.ts`.
- [ ] Run `bun run api:typecheck`.

### Task 4: Runtime Schema, Service, Controller

**Files:**
- Modify: `apps/api/src/schema/workflows.ts`
- Modify: `apps/api/src/services/workflows.ts`
- Modify: `apps/api/src/controllers/workflows/index.ts`

- [ ] Add runtime list/start/complete schemas.
- [ ] Add service methods with tenant permission checks using the same workflow manage permission as Phase 1.
- [ ] Map RPC reasons to `Errors.badRequest`, `Errors.notFound`, or `Errors.business`.
- [ ] Add controller endpoints:
  - `GET /workflows/:id/runtime/instances`
  - `POST /workflows/:id/runtime/instances`
  - `POST /workflows/:id/runtime/instances/:instanceId/complete-node`
- [ ] Run `bun run api:check`.

### Task 5: Admin Runtime Read Model

**Files:**
- Modify: `apps/admin/components/workflows/workflow-types.ts`
- Modify: `apps/admin/components/workflows/workflow-requests.ts`
- Create: `apps/admin/components/workflows/workflow-runtime-panel.tsx`
- Modify: `apps/admin/components/workflows/workflow-designer-shell.tsx`

- [ ] Add runtime DTO types and fetch helper.
- [ ] Render a compact runtime panel below the designer with current node, subject, status, started time, and empty/error states.
- [ ] Keep the panel read-only in this phase.
- [ ] Run `pnpm --dir apps/admin check`.

### Task 6: End-to-End Smoke

**Files:**
- No committed smoke script required.

- [ ] Start local API.
- [ ] Log in with the local tenant admin.
- [ ] Create a temporary workflow, save a start -> business -> procedure -> approval -> end graph, publish it.
- [ ] Start a runtime instance with subject type `manual`.
- [ ] Complete `lead`, then `procedure`, then `approval`.
- [ ] Verify final instance status is `completed`.
- [ ] Archive the temporary workflow.
- [ ] Verify all `codex_*` smoke workflows are archived.
- [ ] Run `supabase migration list`.
- [ ] Run `git diff --check`, `bun run api:check`, and `pnpm --dir apps/admin check`.

## Self-Review

- Spec coverage: runtime data model, generic API, transition behavior, task generation, Admin observability, and smoke verification are covered.
- Placeholder scan: no `TBD`/`TODO` implementation steps remain; later business integrations are explicitly out of scope.
- Type consistency: runtime statuses and subject types are defined once in `@gooes/domain` and consumed by API/Admin types.
