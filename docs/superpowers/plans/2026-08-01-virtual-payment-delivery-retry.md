# Virtual Payment Delivery Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an exact-claim command that starts a new delivery attempt after a failed virtual-payment delivery.

**Architecture:** Add one narrow service-role PostgreSQL RPC for the `failed -> pending` transition and expose it through one typed repository method. Keep terminal delivery reporting in the existing RPC so a reclaimed `pending` attempt reuses its durable attempt key without incrementing the counter.

**Tech Stack:** PostgreSQL PL/pgSQL migration, TypeScript, Zod, Bun tests

---

### Task 1: Repository command

**Files:**
- Modify: `apps/api/src/repositories/branding-virtual-payment-reconciliation.test.ts`
- Modify: `apps/api/src/repositories/branding-virtual-payment-reconciliation.ts`

- [ ] **Step 1: Write the failing repository test**

Add a test that calls the wished-for typed method and checks the exact RPC:

```ts
test("begins a failed delivery retry with a new local attempt key", async () => {
  const f = await repositoryWith({ rpcData: true });
  expect(await f.repository.beginReconciliationDeliveryRetry({
    orderId: ORDER_ID,
    claimToken: CLAIM_TOKEN,
    attemptKey: RETRY_ATTEMPT_KEY,
  })).toBe(true);
  expect(f.calls).toContainEqual([
    "rpc",
    "branding_begin_virtual_payment_delivery_retry",
    {
      p_order_id: ORDER_ID,
      p_claim_token: CLAIM_TOKEN,
      p_attempt_key: RETRY_ATTEMPT_KEY,
    },
  ]);
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
cd apps/api
bun test src/repositories/branding-virtual-payment-reconciliation.test.ts
```

Expected: TypeScript/test failure because
`beginReconciliationDeliveryRetry` does not exist.

- [ ] **Step 3: Add the narrow repository method**

Add this method without widening the terminal status union:

```ts
async beginReconciliationDeliveryRetry(input: {
  orderId: string;
  claimToken: string;
  attemptKey: string;
}): Promise<boolean> {
  return this.reconciliationBooleanCommand(
    "branding_begin_virtual_payment_delivery_retry",
    {
      p_order_id: input.orderId,
      p_claim_token: input.claimToken,
      p_attempt_key: input.attemptKey,
    },
    "开始虚拟支付发货重试失败",
  );
}
```

- [ ] **Step 4: Run the repository test and verify GREEN**

Run the command from Step 2. Expected: all repository reconciliation tests
pass.

### Task 2: Database delivery retry state transition

**Files:**
- Modify: `apps/api/src/services/branding-virtual-payment-reconciliation-migration-contract.test.ts`
- Modify: `supabase/migrations/20260801102000_create_branding_virtual_payment_reconciliation.sql`

- [ ] **Step 1: Write the failing migration contract tests**

Extract `branding_begin_virtual_payment_delivery_retry` and assert it:

```ts
expect(beginRetry).toContain("v_order.provider_delivery_status <> 'failed'");
expect(beginRetry).toContain(
  "v_order.provider_delivery_attempt_key is not distinct from p_attempt_key",
);
expect(beginRetry).toContain("provider_delivery_status = 'pending'");
expect(beginRetry).toContain(
  "provider_delivery_attempt_count = orders.provider_delivery_attempt_count + 1",
);
expect(beginRetry).toContain("provider_delivery_attempt_key = p_attempt_key");
expect(beginRetry).toContain("reconcile_next_at = v_now");
expect(beginRetry).not.toContain("reconcile_claim_token = null");
expect(beginRetry).not.toContain("reconcile_claim_expires_at = null");
```

Also assert the existing terminal function still requires `pending` plus the
exact attempt key, failure retains the counter and schedules five minutes,
success releases the claim, the trigger covers `pending | failed`, the table
constraint accepts the pending shape, the new command performs its fresh
post-lock lease check, and only `service_role` receives execute permission.

- [ ] **Step 2: Run the migration contract test and verify RED**

Run:

```bash
cd apps/api
bun test src/services/branding-virtual-payment-reconciliation-migration-contract.test.ts
```

Expected: failures because the begin function and grant do not exist.

- [ ] **Step 3: Add the minimal PL/pgSQL command**

Create the three-argument security-definer function. Validate non-null inputs,
lock the order, capture `clock_timestamp()` after the lock, validate the exact
unexpired claim, and reject every state except succeeded/granted/failed with a
different attempt key. Update only:

```sql
provider_delivery_status = 'pending',
provider_delivery_attempt_count = orders.provider_delivery_attempt_count + 1,
provider_delivery_attempt_key = p_attempt_key,
provider_delivery_request_id = NULL,
provider_delivery_provided_at = NULL,
provider_delivery_last_error_code = NULL,
provider_delivery_last_error = NULL,
reconcile_next_at = v_now,
reconcile_last_checked_at = v_now,
reconcile_last_error_code = NULL,
reconcile_last_error = NULL
```

Keep claim token and expiry untouched, add an exact-token/fresh-expiry `WHERE`,
and add matching revoke/grant statements for the three-argument signature.

- [ ] **Step 4: Run the migration contract and repository tests**

Run:

```bash
cd apps/api
bun test \
  src/repositories/branding-virtual-payment-reconciliation.test.ts \
  src/services/branding-virtual-payment-reconciliation-migration-contract.test.ts \
  src/services/branding-virtual-payment-confirmation.test.ts
```

Expected: all focused tests pass.

### Task 3: Regression verification and commit

**Files:**
- Verify all files changed in Tasks 1 and 2

- [ ] **Step 1: Run all virtual-payment tests**

```bash
cd apps/api
rg --files src | rg 'branding-virtual.*\.test\.ts$' | xargs bun test
```

Expected: zero failures.

- [ ] **Step 2: Run API checks**

```bash
cd apps/api
bun run check
```

Expected: typecheck, build, and API file-size checks pass.

- [ ] **Step 3: Review the final diff**

```bash
git diff --check
git status --short
git diff
```

Expected: only the approved retry RPC, repository method, tests, and planning
document are changed; no migration has been applied.

- [ ] **Step 4: Commit the implementation**

```bash
git add \
  docs/superpowers/plans/2026-08-01-virtual-payment-delivery-retry.md \
  apps/api/src/repositories/branding-virtual-payment-reconciliation.ts \
  apps/api/src/repositories/branding-virtual-payment-reconciliation.test.ts \
  apps/api/src/services/branding-virtual-payment-reconciliation-migration-contract.test.ts \
  supabase/migrations/20260801102000_create_branding_virtual_payment_reconciliation.sql
git commit -m "fix(payments): 恢复虚拟支付发货重试"
```
