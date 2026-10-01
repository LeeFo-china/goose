# Lead Customer Workflow Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every potential customer returned by either lead-conversion API has a usable `customer_main` runtime, repair the bounded production gap, and keep production audits valid after customers progress.

**Architecture:** Keep conversion persistence in the existing tenant-scoped RPC, then perform one post-command customer read in the shared lead service. Potential customers pass through the existing idempotent workflow initializer; non-potential customers are left untouched, malformed cross-tenant results fail closed, and degraded initialization returns a stable retryable 503. Release the code before freezing and migrating any remaining production candidates.

**Tech Stack:** Bun, TypeScript, Fastify service/repository layering, Supabase/PostgreSQL migrations, GitHub Actions production workflows.

---

### Task 1: Lock the lead-conversion runtime contract

**Files:**
- Modify: `apps/api/src/services/tenant-douyin-leads.test.ts`
- Modify: `apps/api/src/services/tenant-customer-leads.test.ts`

- [ ] **Step 1: Add failing shared-service tests**

Add cases that inject a workflow initializer and assert that a successful conversion loads the exact converted customer and initializes a potential customer with `{ authContext, tenantId, customerId, ownerId }`. Add separate cases for an idempotent replay, a non-potential customer, a cross-tenant/missing customer response, and a degraded initializer returning `CUSTOMER_WORKFLOW_INITIALIZATION_FAILED`.

- [ ] **Step 2: Add the generic customer-lead regression test**

Assert that `TenantCustomerLeadsService.convert()` exercises the same shared initializer while preserving the strict public response shape and customer visibility behavior.

- [ ] **Step 3: Verify RED**

Run:

```bash
cd apps/api && bun test \
  src/services/tenant-douyin-leads.test.ts \
  src/services/tenant-customer-leads.test.ts
```

Expected: the new conversion tests fail because the shared service does not yet read the converted customer or initialize its workflow.

### Task 2: Initialize converted potential customers fail-closed

**Files:**
- Modify: `apps/api/src/services/tenant-douyin-leads.ts`
- Modify: `apps/api/src/services/tenant-douyin-leads-access.test.ts`
- Modify: `apps/api/src/services/tenant-customer-leads-core.test.ts`

- [ ] **Step 1: Extend the existing ports**

Add `findCustomerAccess(tenantId, customerId)` to `RepositoryPort` using the repository's existing `{ id, tenant_id, status, owner_id }` shape. Add an injectable initializer port defaulting to `customerWorkflowInitializationService` without adding a dependency.

- [ ] **Step 2: Add post-conversion initialization**

After validating the RPC result, load the exact customer. Reject missing IDs, tenant mismatches, and ID mismatches with the existing invalid-response error. Return immediately for non-`potential` customers. For a potential customer, call the existing initializer and throw:

```ts
Errors.business(
  503,
  "客户工作流初始化失败，请稍后重试",
  initialization.code,
)
```

when it remains degraded after its built-in retry. Do not add response fields, because client command schemas are strict.

- [ ] **Step 3: Verify GREEN**

Run the API group again and confirm the new tests and existing lead access tests pass.

### Task 3: Make the production audit progression-aware

**Files:**
- Modify: `scripts/audit-production-customer-workflow-contract.test.ts`
- Modify: `.github/workflows/audit-production-customer-workflow.yml`

- [ ] **Step 1: Write a failing contract assertion**

Require the detail verifier to compare customer status with the current workflow node, count valid running states as ready, and require `start_following` only when the customer remains at `potential`. Remove the permanent requirement that every historically repaired customer stays at `potential`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test scripts/audit-production-customer-workflow-contract.test.ts
```

Expected: failure because the current workflow still requires `.startFollowing == .checked`.

- [ ] **Step 3: Update the read-only verifier**

For each of the eight source-tagged historical customers, require a running instance, a non-empty current node, and `customer.status === current_node_key`. Count every such row as ready; only potential rows must have exactly one enabled `start_following` action. Emit `potential` and `startFollowing`, then gate on `.ready == .checked and .startFollowing == .potential`.

- [ ] **Step 4: Verify GREEN**

Run the contract test and confirm all assertions pass.

### Task 4: Verify and release the API prevention fix

**Files:**
- Modify: `docs/operations/evidence/2026-10-01-qingtian-customer-workflow-runtime-repair.md`

- [ ] **Step 1: Record root cause and client contract**

Document that both lead APIs now initialize potential-customer runtime server-side, return a retryable stable error on degraded initialization, and require no orange change.

- [ ] **Step 2: Run focused and static verification**

Run:

```bash
cd apps/api && bun test \
  src/services/tenant-douyin-leads.test.ts \
  src/services/tenant-customer-leads.test.ts \
  src/services/tenant-douyin-leads-access.test.ts
bun test scripts/audit-production-customer-workflow-contract.test.ts
bun run api:typecheck
bun run api:build
```

Expected: zero failures and exit code 0 for every command.

- [ ] **Step 3: Commit and integrate**

Commit with `fix(workflow): 修复线索转客户流程初始化`, fast-forward `main`, push `main`, and confirm the pushed SHA.

- [ ] **Step 4: Build and deploy the immutable API candidate**

Create the next production tag, dispatch `release-production.yml` in build mode for `api`, wait for success, dispatch deploy using the exact build run ID and commit SHA, then verify the deployed container revision and health.

### Task 5: Freeze and repair the remaining production candidates

**Files:**
- Create: `supabase/migrations/<audit-bound-version>_backfill_lead_converted_customer_workflow.sql`
- Create: `apps/api/src/scripts/lead-converted-customer-workflow-backfill-migration-content.test.ts`

- [ ] **Step 1: Run the deployed read-only audit**

Dispatch `audit-production-customer-workflow.yml` with the deployed SHA and fixed tenant. Download the private artifact, assert zero failed/configuration rows, and extract the exact `createdBefore` cutoff and `customer.potential.dry_run_create` count.

- [ ] **Step 2: Write the failing migration contract test**

Require the new migration to embed that exact tenant, cutoff, expected count and repair source; validate one active published `customer_main`; check `start -> potential -> following`; use `start_workflow_instance`; assign the potential task; upsert the subject projection; verify exact instance/task/projection counts and zero remaining candidates; prohibit deletes and cancellation.

- [ ] **Step 3: Verify RED**

Run the new test and confirm it fails because the migration is absent.

- [ ] **Step 4: Add the bounded forward-only migration**

Adapt the existing `20261001120000_backfill_qingtian_potential_customer_workflow.sql` implementation to the newly frozen cutoff/count and a unique repair source. Keep the tenant, status, cutoff, count and final verification fail-closed. Include the backup/dedicated-follow-up rollback statement.

- [ ] **Step 5: Verify GREEN and migration safety**

Run the new contract test, API typecheck/build, and production migration workflow in `plan` mode. Confirm the plan contains only the expected new migration.

- [ ] **Step 6: Apply and verify production migration**

After pushing the migration commit, dispatch `migrate-production-database.yml` in `apply` mode with the exact confirmation text. Confirm `supabase_migrations.schema_migrations` includes the new version and rerun the production workflow audit; require `customer.potential.dry_run_create == 0`.

### Task 6: Final evidence and handoff

**Files:**
- Modify: `docs/operations/evidence/2026-10-01-qingtian-customer-workflow-runtime-repair.md`

- [ ] **Step 1: Record immutable evidence**

Add commit/tag, build and deploy run IDs, migration plan/apply run IDs, audit cutoff/count, final zero-gap audit run, and exact verification commands.

- [ ] **Step 2: Run final verification**

Re-run the focused tests, typecheck, build, `git diff --check`, and confirm `git status --short --branch` is clean after the evidence commit.

- [ ] **Step 3: Report the mini-program message**

Tell the mini-program team that no client patch is needed: retry conversion only when the backend returns the stable 503 workflow-initialization code; after a successful conversion, customer detail must expose a running `potential` runtime with a pending `start_following` action, and completing that task advances both workflow node and customer status to `following`.
