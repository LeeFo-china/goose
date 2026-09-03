# Supplier Purchase Batch Workflow Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让供应商采购批次提交到待审批后进入统一 `/workflow-tasks` 待办中心，并让小程序通过父采购批次 task 完成审批。

**Architecture:** 使用 forward migration 把采购批次审批接入现有 workflow runtime：提交批次时创建父批次 subject 的 running instance + pending task，审批/取消/退回时关闭该 task。API/domain 增加 `supplier_purchase_batch` subject type，并在 workflow task action/complete 层桥接到现有 `review_supplier_purchase_batch` RPC。

**Tech Stack:** Bun + TypeScript + Fastify + Zod + Supabase PostgreSQL migrations。

---

### Task 1: Domain/API Subject Type

**Files:**
- Modify: `packages/domain/src/workflow.ts`
- Modify: `packages/domain/src/workflow.test.ts`
- Modify: `apps/api/src/schema/workflow-subjects.ts`
- Test: `apps/api/src/schema/workflow-subjects.test.ts`

- [ ] **Step 1: Write failing tests**

Add assertions that `WORKFLOW_SUBJECT_TYPE_VALUES` contains `supplier_purchase_batch`, and that `WorkflowTaskListQuerySchema` accepts:

```ts
{ subject_type: "supplier_purchase_batch", subject_id: "batch-id" }
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/domain/src/workflow.test.ts apps/api/src/schema/workflow-subjects.test.ts
```

Expected: fail because the subject type is missing.

- [ ] **Step 3: Implement**

Add `supplier_purchase_batch` to the shared workflow subject type list. API schema should keep importing the shared list.

- [ ] **Step 4: Run GREEN**

Run the same command and expect pass.

### Task 2: Workflow Task Action and Complete Bridge

**Files:**
- Modify: `apps/api/src/services/workflow-task-action-metadata.ts`
- Create: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.ts`
- Modify: `apps/api/src/services/workflow-tasks.ts`
- Test: `apps/api/src/services/workflow-task-action-metadata.test.ts`
- Test: `apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts`
- Test: `apps/api/src/services/workflow-tasks.test.ts`

- [ ] **Step 1: Write failing tests**

Verify a `supplier_purchase_batch` approval task exposes two actions:

```ts
[
  { key: "approve", label: "审批通过", business_domain: "supplier_purchase_batch", business_action: "approve" },
  { key: "reject", label: "驳回修改", business_domain: "supplier_purchase_batch", business_action: "reject", requires_reason: true },
]
```

Verify the bridge maps workflow complete output:

```ts
{
  expected_version: 2,
  action: "approve",
  remark: "审批通过"
}
```

to `supplierPurchaseBatchesService.review(auth, batchId, input, idempotencyKey)`.

- [ ] **Step 2: Run RED**

Run:

```bash
bun test apps/api/src/services/workflow-task-action-metadata.test.ts apps/api/src/services/workflow-task-supplier-purchase-batch-bridge.test.ts apps/api/src/services/workflow-tasks.test.ts
```

Expected: fail because actions/bridge are missing.

- [ ] **Step 3: Implement**

Add supplier purchase batch actions. Add bridge that:

- only handles `task.instance.subject_id` for `supplier_purchase_batch`;
- validates `expected_version`, `action`, and `remark`;
- uses request idempotency key from workflow completion when available, otherwise stable task/action key;
- returns the batch command result in the existing bridged response shape.

- [ ] **Step 4: Run GREEN**

Run the same focused tests and expect pass.

### Task 3: Forward Migration for Runtime Task Creation

**Files:**
- Create: `supabase/migrations/20260903110000_add_supplier_purchase_batch_workflow_tasks.sql`
- Modify: `apps/api/src/services/supplier-purchase-batch-command-migration-contract.test.ts`
- Test: `apps/api/src/services/supplier-purchase-batch-workflow-task-migration-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Assert the migration:

- extends `workflow_instances_subject_type_check`;
- extends `workflow_subject_states_subject_type_check`;
- creates helper `ensure_supplier_purchase_batch_workflow_task`;
- creates helper `close_supplier_purchase_batch_workflow_task`;
- `submit_supplier_purchase_batch` calls ensure after batch becomes `pending_approval`;
- `cancel_supplier_purchase_batch` and `review_supplier_purchase_batch` call close on non-pending outcomes;
- task uses `subject_type='supplier_purchase_batch'`, `subject_id=p_batch_id::text`, `node_key='supplier_purchase_batch_review'`, `assignee_permission_code='supplier.purchase-requisition.approve'`.

- [ ] **Step 2: Run RED**

Run:

```bash
bun test apps/api/src/services/supplier-purchase-batch-workflow-task-migration-contract.test.ts
```

Expected: fail because migration does not exist.

- [ ] **Step 3: Implement migration**

Use forward-only `CREATE OR REPLACE FUNCTION` without editing old applied migrations. The helper should:

- create or reuse one active workflow definition/version for `workflow_key='supplier_purchase_batch_review'` per tenant;
- create/reuse one running workflow instance for the parent batch;
- create/reopen exactly one pending `workflow_tasks` row;
- set `assignee_permission_code='supplier.purchase-requisition.approve'`;
- update `workflow_subject_states.pending_task_count=1`.

Closing helper should complete/cancel pending task and set subject state completed/canceled when the batch leaves `pending_approval`.

- [ ] **Step 4: Run GREEN**

Run migration contract tests and API typecheck.

### Task 4: Local Database Verification

**Files:**
- Test or script in `apps/api/src/scripts/` only if needed for repeatable local proof.

- [ ] **Step 1: Dry-run exact migration**

Run:

```bash
supabase db push --local --dry-run
```

Expected: only `20260903110000_add_supplier_purchase_batch_workflow_tasks.sql`.

- [ ] **Step 2: Apply local migration**

Run:

```bash
supabase db push --local
supabase migration list --local
```

Expected: new migration aligned in Local/Remote columns.

- [ ] **Step 3: Truth checks**

Verify with local PostgreSQL:

- submit draft batch creates one pending workflow task for parent batch;
- `/workflow-tasks` subject filter can return it;
- completing approve/reject through bridge changes batch and closes the task;
- idempotent replay does not create duplicate tasks;
- child `supplier_purchase_requisitions.id` never appears as workflow subject ID.

### Task 5: Final Verification and Commit

**Files:** all touched files.

- [ ] **Step 1: Run focused tests**

Run domain/API focused tests touched by this change.

- [ ] **Step 2: Run API check**

Run:

```bash
bun run api:check
git diff --check
```

- [ ] **Step 3: Commit**

Stage only this task’s files. Preserve unrelated dirty files. Commit:

```bash
git commit -m "feat(supplier): 接入采购批次审批待办"
```

- [ ] **Step 4: Request review**

Run an independent code review for the commit range before push/merge.
