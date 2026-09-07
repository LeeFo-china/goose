# Visitor Project Current Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the real current workflow node display name to paginated public project list items without allowing the existing base-list cache to make the label stale.

**Architecture:** Keep public project base rows cached and attach a public-safe live display label after every cache path. A bounded repository method reads compact workflow subject states for all project and tenant IDs in the current page using exact-pair chunks of 25; a focused service maps those rows to labels without exposing workflow internals.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase/PostgREST, Bun test

---

### Task 1: Public workflow label projection

**Files:**
- Create: `apps/api/src/services/projects/legacy/public-workflow-status.ts`
- Test: `apps/api/src/services/projects/legacy/public-workflow-status.test.ts`

- [x] **Step 1: Write failing projection tests**

Cover a running `水电` node, cross-tenant pair mismatch, completed or terminal
nodes, project-status fallback, and unknown status fallback.

- [x] **Step 2: Verify the tests fail for the missing module**

Run:

```bash
cd apps/api
bun test src/services/projects/legacy/public-workflow-status.test.ts
```

Expected: failure because the projection function does not exist.

- [x] **Step 3: Implement the minimal pure projection**

Create a function that joins project rows and compact workflow states by both
`tenant_id` and `subject_id`, then applies the label rules from the design.

- [x] **Step 4: Verify projection tests pass**

Run the same Bun test command and expect all cases to pass.

### Task 2: Bounded workflow-state repository query

**Files:**
- Create: `apps/api/src/repositories/public-project-workflow-states.ts`
- Modify: `apps/api/src/repositories/workflow-subject-states.test.ts`

- [x] **Step 1: Write a failing repository contract test**

Assert the query selects compact public fields, filters `subject_type` to
`project`, filters exact tenant/project pairs with OR-of-AND expressions,
de-duplicates and caps the pair set at 100, and splits the work into at most
four 25-pair queries.

- [x] **Step 2: Verify the repository test fails**

Run:

```bash
cd apps/api
bun test src/repositories/workflow-subject-states.test.ts
```

- [x] **Step 3: Add `listByTenantProjectIds`**

Return only `tenant_id`, `subject_id`, `instance_status`, `current_node_key`,
and `current_node_title`. Wrap database failures with `Errors.dbError`.

- [x] **Step 4: Verify the repository tests pass**

Run the repository test command again.

### Task 3: Live enrichment across public-cache paths

**Files:**
- Modify: `apps/api/src/services/projects/legacy/public-cache.ts`
- Modify: `apps/api/src/services/projects/legacy-service.ts`
- Test: `apps/api/src/services/projects/legacy/public-cache.test.ts`

- [x] **Step 1: Write a failing cache regression test**

Call `listPublicProjects` twice with the same cached page. Make the workflow
reader return `拆改` on the first call and `水电` on the second. Assert the base
repository loads once, the live reader runs twice, and the second response says
`水电`.

- [x] **Step 2: Verify the cache regression test fails**

Run:

```bash
cd apps/api
bun test src/services/projects/legacy/public-cache.test.ts
```

- [x] **Step 3: Attach live labels after cache resolution**

Register the focused enrichment service on the legacy project service and call
it after cache hits, in-flight reuse, and fresh base loads. Continue caching
only the base public rows and pagination.

- [x] **Step 4: Verify all targeted tests pass**

Run:

```bash
cd apps/api
bun test \
  src/services/projects/legacy/public-workflow-status.test.ts \
  src/repositories/workflow-subject-states.test.ts \
  src/services/projects/legacy/public-cache.test.ts
```

### Task 4: Build and integration verification

**Files:**
- Modify only if a verified type or build issue requires a scoped correction.

- [x] **Step 1: Run API build**

```bash
cd apps/api
bun run build
```

Expected: successful bundle.

- [x] **Step 2: Run API typecheck and separate baseline failures**

```bash
cd apps/api
bun run typecheck
```

Expected: no errors in files changed by this plan. Existing unrelated baseline
errors must be reported and not modified.

- [x] **Step 3: Run development smoke**

Call `GET /front/projects?page=1&pageSize=20` with an authorized visitor
session and verify `display_status_label` reflects current workflow state,
pagination is unchanged, and no internal workflow fields are returned.

- [x] **Step 4: Review and commit**

Run `git diff --check`, inspect the scoped diff, and create a Conventional
Commit containing only the documentation, tests, repository, and public-list
service changes.
