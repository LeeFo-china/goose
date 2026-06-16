# Workflow Legacy Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove high-risk project workflow legacy gates that can contradict workflow runtime.

**Architecture:** Keep `projects.status` and `construction_stages` as compatibility projections, but stop using them as the source of truth for final acceptance and construction log advancement. Runtime business decisions must read `workflow_progress` or existing workflow guards.

**Tech Stack:** Bun, TypeScript, Fastify services, Supabase migration SQL.

---

### Task 1: Final Acceptance Runtime Gate

**Files:**
- Modify: `apps/api/src/services/project-acceptances/legacy/create-update.ts`
- Modify: `apps/api/src/services/project-acceptances/legacy/permissions.ts`
- Test: `apps/api/src/services/project-acceptances/legacy/final-acceptance-workflow-gate.test.ts`

- [x] **Step 1: Write failing tests**

Cover `acceptance_type=final` creation so it is allowed only when `workflow_progress.current_node_key` or `current_business_kind` is `final_acceptance`.

- [x] **Step 2: Verify red**

Run:

```bash
cd apps/api
bun test src/services/project-acceptances/legacy/final-acceptance-workflow-gate.test.ts
```

Expected: fails because final acceptance still relies on `project.status`.

- [x] **Step 3: Implement runtime guard**

Use `projectWorkflowProgressService.getProjectProgress` in the final acceptance project guard and return existing `Errors.business(...)` errors when runtime is unavailable or not at `final_acceptance`.

- [x] **Step 4: Verify green**

Run the same test and ensure it passes.

### Task 2: Project Log Fast RPC Workflow Guard

**Files:**
- Create migration: `supabase/migrations/20260616093000_create_project_log_fast_workflow_guard.sql`
- Test: `apps/api/src/scripts/workflow-destructive-migration-content.test.ts` only if migration guard validation requires adjustment.

- [x] **Step 1: Write migration**

Replace `create_project_log_fast` with a version that checks the running workflow instance current procedure node for `p_stage_code` before legacy previous-stage checks can allow advancement.

- [x] **Step 2: Verify SQL text**

Run:

```bash
rg -n "workflow_instances|current_node_key|p_stage_code" supabase/migrations/20260616093000_create_project_log_fast_workflow_guard.sql
```

Expected: migration contains runtime current-node guard.

### Task 3: Generated Types Cleanup

**Files:**
- Modify: `apps/api/src/types/database.ts`

- [x] **Step 1: Regenerate or clean generated types**

Use configured Supabase project information from `.env.local` where possible. If CLI generation is unavailable, remove only stale legacy object declarations that the technical audit already verifies absent remotely.

- [x] **Step 2: Verify final audit**

Run:

```bash
cd apps/api
bun run workflow:technical-completion-audit -- --evidence-file ../../docs/state_machine_migrate/audit/manual-gates.json
```

Result: generated database types clean; final audit still reports missing manual gate evidence for existing unconfirmed human gates.

### Task 4: Regression Verification

**Files:** no new files.

- [x] **Step 1: Run focused tests**

```bash
cd apps/api
bun test src/services/project-acceptances/legacy/final-acceptance-workflow-gate.test.ts src/services/construction-stage-status/legacy/lists.test.ts src/services/project-acceptance-workflow-runtime.test.ts src/services/project-workflow-mutation-guards.test.ts src/services/workflow-runtime-guards.test.ts
```

- [x] **Step 2: Run typecheck**

```bash
cd apps/api
bun run typecheck
```

- [x] **Step 3: Review diff**

```bash
git diff --stat
git status --short
```
