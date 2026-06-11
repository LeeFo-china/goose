# Workflow Branch Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 admin 流程画布中把收款/审批条件分支表达为显式菱形判断节点，同时保持后端条件边兼容。

**Architecture:** 第一版只做 admin 侧投影层：根据真实节点和真实条件边生成虚拟分支节点，并把用户从虚拟分支出口创建的连接转换为真实源节点到真实目标节点的 `edge.condition`。保存 payload 不包含虚拟节点。

**Tech Stack:** Next.js App Router, React, TypeScript, Playwright, existing workflow designer components.

---

### Task 1: Add Branch Projection Helpers

**Files:**
- Create: `apps/admin/components/workflows/workflow-branch-projection.ts`
- Modify: `apps/admin/components/workflows/workflow-types.ts`

- [ ] **Step 1: Write failing E2E test**

Add a Playwright test in `apps/admin/e2e/workflow-edge-conditions.spec.ts` that seeds a workflow with one payment node and one target procedure node, connects from the payment node, and expects a visible branch node with `data-workflow-branch-source-key="payment_stage_1"`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir apps/admin exec playwright test e2e/workflow-edge-conditions.spec.ts --project=chromium -g "收款节点拖线自动生成判断节点"
```

Expected: FAIL because the branch node is not rendered.

- [ ] **Step 3: Implement helper types**

Create `workflow-branch-projection.ts` with helpers that identify payment and approval branch sources and map branch outcomes to existing edge conditions.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: PASS.

### Task 2: Render Virtual Branch Nodes

**Files:**
- Modify: `apps/admin/components/workflows/workflow-canvas.tsx`
- Modify: `apps/admin/components/workflows/workflow-canvas-edges.tsx`

- [ ] **Step 1: Project branch nodes before rendering**

Use the helper to render virtual branch nodes for payment/approval sources with branchable outgoing edges.

- [ ] **Step 2: Make branch nodes connectable**

Expose output ports for the two outcomes. When the user starts a connection from an outcome, pass `{ sourceNodeId, branchOutcome }` to the shell.

- [ ] **Step 3: Run failing test again**

Run:

```bash
pnpm --dir apps/admin exec playwright test e2e/workflow-edge-conditions.spec.ts --project=chromium -g "收款节点拖线自动生成判断节点"
```

Expected after implementation: PASS.

### Task 3: Convert Branch Connections To Existing Conditions

**Files:**
- Modify: `apps/admin/components/workflows/workflow-designer-shell.tsx`
- Modify: `apps/admin/components/workflows/workflow-edge-conditions.ts`

- [ ] **Step 1: Add branch-aware connection state**

Replace `connectingNodeId: string | null` with a state object containing the real source node id and optional branch outcome.

- [ ] **Step 2: Apply edge condition on creation**

When `branchOutcome` is present, create the real edge from the real source node to the target with the matching label and condition.

- [ ] **Step 3: Preserve normal connection behavior**

Non-branch nodes continue to create normal `always` edges.

- [ ] **Step 4: Run existing branch runtime test**

Run:

```bash
pnpm --dir apps/admin exec playwright test e2e/workflow-edge-conditions.spec.ts --project=chromium
```

Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- All modified files

- [ ] **Step 1: Static checks**

Run:

```bash
pnpm --dir apps/admin check
git diff --check
```

Expected: both PASS.

- [ ] **Step 2: Regression tests**

Run:

```bash
pnpm --dir apps/admin exec playwright test e2e/workflow-edge-conditions.spec.ts e2e/workflow-validation-playback.spec.ts --project=chromium
```

Expected: PASS.

- [ ] **Step 3: Commit**

Commit:

```bash
git add docs/superpowers/specs/2026-06-11-workflow-branch-node-design.md docs/superpowers/plans/2026-06-11-workflow-branch-node.md apps/admin
git commit -m "feat(workflow): 增加菱形分支判断节点"
```
