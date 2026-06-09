# Customer Workflow Template Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-click Admin action that creates and publishes the customer
main workflow template.

**Architecture:** Backend owns template creation because it must atomically
coordinate definition creation, draft graph replacement, and publish. Admin only
calls the template endpoint and navigates to the created workflow designer.

**Tech Stack:** Bun, Fastify, Zod, Supabase RPCs, Next.js, shadcn/Tailwind.

---

### Task 1: Backend Template Endpoint

**Files:**
- Modify: `apps/api/src/schema/workflows.ts`
- Modify: `apps/api/src/controllers/workflows/index.ts`
- Create: `apps/api/src/services/workflow-templates.ts`

- [ ] Extend `WorkflowTemplateCreateSchema` to include `customer_main`.
- [ ] Add `POST /workflows/templates` to `WorkflowController`.
- [ ] Implement `workflowTemplateService.createFromTemplate(...)`.
- [ ] Build and publish the `customer_main` graph with node keys required by
  Phase 3: `following`, `arrived`, `designing`, `signed`.

### Task 2: Admin Template Action

**Files:**
- Modify: `apps/admin/components/workflows/workflow-types.ts`
- Modify: `apps/admin/components/workflows/workflow-requests.ts`
- Create: `apps/admin/components/workflows/workflow-template-actions.tsx`
- Modify: `apps/admin/components/workflows/workflow-list-actions.tsx`

- [ ] Add `WorkflowTemplateCreateInput` and response typing.
- [ ] Add `createWorkflowFromTemplate(...)` request helper.
- [ ] Add a compact “客户主流程” template button with loading/error states.
- [ ] Wire the button into the workflow list toolbar beside manual creation.

### Task 3: Verification

- [ ] Run `bun run api:check`.
- [ ] Run `pnpm --dir apps/admin check`.
- [ ] Run `git diff --check`.
- [ ] Run `supabase migration list` and confirm Local/Remote are aligned.
- [ ] Smoke the new endpoint if tenant credentials/environment allow.

### Task 4: Integration

- [ ] Commit with Conventional Commit message.
- [ ] Merge `workflow/customer-template-phase4` into `main`.
- [ ] Push `main`.
- [ ] Remove the feature worktree and local branch after merge.
