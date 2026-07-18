# Recharge Expiration Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recharge confirmation atomic, keep every WeChat reconciliation operation under a valid per-order lease, and preserve historical reconciliation credentials while pending orders exist.

**Architecture:** A migration-owned wrapper performs credit confirmation and subscription recovery in one PostgreSQL transaction. The expiration service claims one order at a time, renews ownership before remote work, defers uncertain releases until the bounded run ends, and caches cleanup configuration by the order's stored config ID. Database triggers and service preflight block critical payment-config or secret rotation while matching pending orders exist, while disabled profiles remain usable for cleanup only.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase/PostgreSQL migrations, WeChat Pay APIv3, Bun tests.

---

## File map

**Create**

- `supabase/migrations/20260718121000_confirm_recharge_and_recover_atomically.sql`: service-role-only transactional confirmation wrapper.
- `supabase/migrations/20260718122000_guard_pending_recharge_payment_config.sql`: database guards for critical config and secret changes.
- `supabase/migrations/20260718122500_serialize_recharge_config_creation.sql`: serialize order creation with config/secret mutation using a guard-version CAS RPC and deletion triggers.
- `supabase/migrations/20260718123000_extend_recharge_claim_exclusions.sql`: claim RPC with a bounded in-run exclusion list.
- `apps/api/src/services/billing-recharge-atomic-confirmation-contract.test.ts`: SQL wrapper contract.
- `apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts`: SQL trigger contract.
- `apps/api/src/services/billing-recharge-claim-exclusion-contract.test.ts`: claim exclusion SQL contract.

**Modify**

- `apps/api/src/repositories/billing-recharge.ts`: call the atomic RPC and expose pending-order existence checks.
- `apps/api/src/repositories/billing-recharge.test.ts`: repository RPC, pending-order, renew, and conditional mutation contracts.
- `apps/api/src/repositories/billing-recharge-expiration.ts`: add token-conditioned lease renewal.
- `apps/api/src/repositories/platform-payment-configs.ts`: load a config by immutable order reference ID.
- `apps/api/src/services/billing-recharge-payment-confirmation.ts`: remove the post-transaction subscription call.
- `apps/api/src/services/billing-recharge-payment-confirmation.test.ts`: prove one atomic repository operation.
- `apps/api/src/services/wechat-pay-callbacks.ts`: remove obsolete subscription-recovery dependency wiring.
- `apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts`: keep callback failure/idempotency behavior through the atomic repository call.
- `apps/api/src/services/platform-billing-recharge-compensation.ts`: remove the second, non-transactional recovery call.
- `apps/api/src/services/platform-billing-recharge.test.ts`: update compensation expectations.
- `apps/api/src/services/platform-payment-configs.ts`: preflight critical config and secret changes.
- `apps/api/src/services/platform-payment-configs.test.ts`: rotation-block and noncritical-change tests.
- `apps/api/src/services/billing-recharge-expiration.ts`: per-order claim, renewal, deferred release, config cache, and release telemetry.
- `apps/api/src/services/billing-recharge-expiration.test.ts`: multi-run and multi-worker state tests.

## Final-review addendum

The implemented design also requires these release blockers before database smoke:

- canonical invoice -> subscription -> credit-account locking before atomic confirmation;
- database-owned `clock_timestamp()` claim and renewal leases;
- a second token-conditioned renewal immediately before WeChat close;
- exact HTTP 204 acceptance for close and bounded prepay/query/close timeouts;
- fresh response clocks and suppression of payment parameters after expiration;
- conditional late-prepay persistence while the order is still pending and unexpired;
- dependency-injected system-setting repository tests so an aggregate run cannot fall through to a configured remote client.

The `1225` migration is part of the architecture, not an optional follow-up: config and secret
triggers increment `recharge_guard_version`; the creation RPC locks the chosen config, compares the
service-observed version, and inserts the pending order atomically. It also guards config and secret
deletion while referenced by pending recharge orders.

---

### Task 1: Confirm recharge and recover subscriptions atomically

**Files:**

- Create: `supabase/migrations/20260718121000_confirm_recharge_and_recover_atomically.sql`
- Create: `apps/api/src/services/billing-recharge-atomic-confirmation-contract.test.ts`
- Modify: `apps/api/src/repositories/billing-recharge.ts`
- Modify: `apps/api/src/services/billing-recharge-payment-confirmation.ts`
- Modify: `apps/api/src/services/billing-recharge-payment-confirmation.test.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-compensation.ts`
- Modify: `apps/api/src/services/platform-billing-recharge.test.ts`

- [ ] **Step 1: Write the failing SQL contract test**

Create a test that reads the exact migration and asserts the transactional call order and privileges:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260718121000_confirm_recharge_and_recover_atomically.sql",
  ),
  "utf8",
);

describe("atomic recharge confirmation migration", () => {
  test("confirms credits and recovers the subscription in one wrapper", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_and_recover",
    );
    expect(migration).toMatch(
      /billing_confirm_wechat_recharge\([\s\S]*billing_recover_subscription_after_recharge\(/,
    );
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("v_confirmation->'order'->>'tenant_id'");
    expect(migration).toContain("'recovery', v_recovery");
  });

  test("exposes the wrapper only to service_role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).toContain("TO service_role");
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run from `apps/api`:

```bash
bun test src/services/billing-recharge-atomic-confirmation-contract.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the transactional wrapper migration**

Create the function with the existing confirmation signature so application callers do not invent a second tenant identifier:

```sql
CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmation jsonb;
  v_recovery jsonb;
  v_tenant_id uuid;
BEGIN
  SELECT public.billing_confirm_wechat_recharge(
    p_order_id,
    p_transaction_id,
    p_paid_amount_fen,
    p_paid_at,
    p_notification_id,
    p_metadata
  )
  INTO v_confirmation;

  v_tenant_id := nullif(
    v_confirmation->'order'->>'tenant_id',
    ''
  )::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CONFIRMATION_TENANT_REQUIRED';
  END IF;

  SELECT public.billing_recover_subscription_after_recharge(v_tenant_id)
  INTO v_recovery;

  RETURN v_confirmation || jsonb_build_object('recovery', v_recovery);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) TO service_role;
```

Because both nested calls run inside one SQL statement, an exception from recovery rolls back the confirmation updates, ledger, balance, order trigger, and wrapper result together.

- [ ] **Step 4: Write failing application tests for the atomic boundary**

Update the confirmation unit so its only dependency is the repository:

```ts
const confirmWechatRecharge = mock(async () => ({
  order: {},
  account: {},
  ledger: {},
  recovery: { recovered: true },
  idempotent: false,
}));

const service = new BillingRechargePaymentConfirmation({
  repository: { confirmWechatRecharge },
});

await service.confirm({
  order,
  transaction,
  notificationId: null,
  source: "expiration_reconcile",
});

expect(confirmWechatRecharge).toHaveBeenCalledTimes(1);
```

Add a repository source/DB mock assertion that the RPC name is exactly `billing_confirm_wechat_recharge_and_recover`. Update callback and platform-compensation tests so no injected `recoverAfterRecharge` call is expected after repository success. Keep tests that repository rejection marks notifications failed.

- [ ] **Step 5: Run the focused tests and verify RED**

```bash
bun test \
  src/services/billing-recharge-atomic-confirmation-contract.test.ts \
  src/services/billing-recharge-payment-confirmation.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/services/platform-billing-recharge.test.ts
```

Expected: FAIL because the repository still calls the old RPC and services still invoke recovery separately.

- [ ] **Step 6: Route all confirmation paths through the wrapper**

Change the repository RPC call and result type:

```ts
export type BillingConfirmWechatRechargeResult = {
  order: Record<string, unknown> | null;
  account: Record<string, unknown> | null;
  ledger: Record<string, unknown> | null;
  recovery: Record<string, unknown> | null;
  idempotent: boolean;
};

// inside confirmWechatRecharge
.rpc("billing_confirm_wechat_recharge_and_recover", {
  p_order_id: input.orderId,
  p_transaction_id: input.transactionId,
  p_paid_amount_fen: input.paidAmountFen,
  p_paid_at: input.paidAt,
  p_notification_id: input.notificationId,
  p_metadata: input.metadata,
});
```

Remove `billingSubscriptionService` from `BillingRechargePaymentConfirmation`, `WechatPayCallbackService` recharge wiring, and `PlatformBillingRechargeCompensationService`. After `confirmWechatRecharge` resolves, those services proceed directly to their existing notification/audit behavior.

- [ ] **Step 7: Run confirmation and callback regressions**

```bash
bun test \
  src/services/billing-recharge-atomic-confirmation-contract.test.ts \
  src/services/billing-recharge-payment-confirmation.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/services/wechat-pay-callbacks-credit-refund.test.ts \
  src/services/platform-billing-recharge.test.ts
bun run typecheck
bun run check:file-size
git diff --check
```

Expected: PASS. Repository rejection still prevents notification processing, while no application path can fail after a committed credit confirmation merely because subscription recovery is a second call.

- [ ] **Step 8: Commit the atomic financial unit**

```bash
git add \
  supabase/migrations/20260718121000_confirm_recharge_and_recover_atomically.sql \
  apps/api/src/services/billing-recharge-atomic-confirmation-contract.test.ts \
  apps/api/src/repositories/billing-recharge.ts \
  apps/api/src/services/billing-recharge-payment-confirmation.ts \
  apps/api/src/services/billing-recharge-payment-confirmation.test.ts \
  apps/api/src/services/wechat-pay-callbacks.ts \
  apps/api/src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  apps/api/src/services/platform-billing-recharge-compensation.ts \
  apps/api/src/services/platform-billing-recharge.test.ts
git commit -m "fix(billing): 原子确认充值并恢复订阅"
```

---

### Task 2: Guard payment configuration used by pending orders

**Files:**

- Create: `supabase/migrations/20260718122000_guard_pending_recharge_payment_config.sql`
- Create: `apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts`
- Modify: `apps/api/src/repositories/billing-recharge.ts`
- Modify: `apps/api/src/repositories/billing-recharge.test.ts`
- Modify: `apps/api/src/repositories/platform-payment-configs.ts`
- Modify: `apps/api/src/services/platform-payment-configs.ts`
- Modify: `apps/api/src/services/platform-payment-configs.test.ts`

- [ ] **Step 1: Write failing trigger and service tests**

The SQL contract must assert both trigger targets and the exact stable message:

```ts
expect(migration).toContain(
  "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
);
expect(migration).toContain("BEFORE UPDATE OF merchant_mode");
expect(migration).toContain("ON public.platform_payment_configs");
expect(migration).toContain("BEFORE UPDATE OF value_text");
expect(migration).toContain("ON public.system_settings");
expect(migration).toContain("orders.status = 'pending'");
expect(migration).toContain("orders.channel = 'wechat_pay'");
```

Add repository and service mocks:

```ts
const hasPendingWechatOrdersForPaymentConfig = mock(async () => true);

await expect(
  service.saveWechatPayProfile(auth, "platform_direct_recharge", {
    merchant_id: "1900000002",
  }),
).rejects.toMatchObject({
  statusCode: 409,
  code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
});
expect(upsertWechatPayConfig).not.toHaveBeenCalled();
```

Cover each behavior:

- merchant ID, merchant mode, app IDs, serial number, encrypted ref, or secret-bundle value changes are blocked when pending exists;
- status and enabled-channel-only changes are allowed;
- unchanged critical values are allowed;
- no pending order allows rotation;
- the secret preflight runs before `updateSetting`;
- `findWechatPayConfigById` returns disabled/suspended rows without filtering status.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
bun test \
  src/services/platform-payment-config-pending-orders-contract.test.ts \
  src/services/platform-payment-configs.test.ts \
  src/repositories/billing-recharge.test.ts
```

Expected: FAIL because the migration and guards do not exist.

- [ ] **Step 3: Add database race guards**

Create a trigger function for critical config fields:

```sql
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    OLD.merchant_mode,
    OLD.merchant_id,
    OLD.sub_merchant_id,
    OLD.app_id,
    OLD.sub_app_id,
    OLD.serial_no,
    OLD.encrypted_config_ref
  ) IS DISTINCT FROM ROW(
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref
  ) AND EXISTS (
    SELECT 1
    FROM public.tenant_credit_orders AS orders
    WHERE orders.payment_config_id = OLD.id
      AND orders.channel = 'wechat_pay'
      AND orders.status = 'pending'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_guard_pending_recharge_payment_config
BEFORE UPDATE OF merchant_mode, merchant_id, sub_merchant_id, app_id,
  sub_app_id, serial_no, encrypted_config_ref
ON public.platform_payment_configs
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_config();
```

Add a second trigger that guards a referenced platform secret setting:

```sql
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.value_text IS DISTINCT FROM NEW.value_text
    AND NEW.tenant_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.platform_payment_configs AS config
      JOIN public.tenant_credit_orders AS orders
        ON orders.payment_config_id = config.id
      WHERE config.encrypted_config_ref = ANY (ARRAY[
          NEW.key,
          'secret://' || NEW.key,
          'setting://' || NEW.key
        ])
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_guard_pending_recharge_payment_secret
BEFORE UPDATE OF value_text
ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_pending_recharge_payment_secret();
```

Use `DROP TRIGGER IF EXISTS` before both creates. Add comments that status/channel changes remain allowed for operational shutdown while cleanup continues.

- [ ] **Step 4: Add repository lookups**

Add the bounded existence query:

```ts
async hasPendingWechatOrdersForPaymentConfig(configId: string) {
  const { data, error } = await this.from("tenant_credit_orders")
    .select("id")
    .eq("payment_config_id", configId)
    .eq("channel", "wechat_pay")
    .eq("status", "pending")
    .limit(1);
  if (error) {
    throw Errors.dbError("检查微信充值待支付订单失败", error);
  }
  return (data ?? []).length > 0;
}
```

Add an ID lookup without status filters:

```ts
async findWechatPayConfigById(configId: string) {
  const { data, error } = await this.from("platform_payment_configs")
    .select("*")
    .eq("id", configId)
    .maybeSingle();
  if (error) {
    throw Errors.dbError("查询平台微信支付配置失败", error);
  }
  return (data as PlatformPaymentConfigRecord | null) ?? null;
}
```

- [ ] **Step 5: Add service preflight before mutation**

Inject a pending-order port and compare normalized critical fields:

```ts
type PendingRechargeOrderPort = Pick<
  typeof billingRechargeRepository,
  "hasPendingWechatOrdersForPaymentConfig"
>;

const CRITICAL_CONFIG_FIELDS = [
  "merchant_mode",
  "merchant_id",
  "sub_merchant_id",
  "app_id",
  "sub_app_id",
  "serial_no",
  "encrypted_config_ref",
] as const;

private async assertCriticalChangeAllowed(
  current: PlatformPaymentConfigRecord | null,
  next: PlatformPaymentConfigUpsertInput,
) {
  if (!current) return;
  const changed = CRITICAL_CONFIG_FIELDS.some(
    (field) => normalizeComparable(current[field]) !==
      normalizeComparable(next[field]),
  );
  if (!changed) return;
  if (await this.pendingRechargeOrders
    .hasPendingWechatOrdersForPaymentConfig(current.id)) {
    throw Errors.business(
      409,
      "存在使用当前微信支付配置的待支付充值订单，请等待订单支付或关闭后再修改",
      "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    );
  }
}
```

Build the complete upsert input first in both direct-config and profile methods, preserving every current critical field when the corresponding optional input is `undefined`. For example:

```ts
const merchantId = input.merchant_id === undefined
  ? current?.merchant_id ?? null
  : input.merchant_id;
const appId = input.app_id === undefined
  ? current?.app_id ?? null
  : input.app_id;
```

Call the guard with the fully merged input, then upsert. This is required so a status-only or channel-only update does not accidentally null a critical field and get treated as rotation. Before `saveWechatPaySecretBundle` calls `updateSetting`, check pending orders for the current config and throw the same stable error. Do not block service-provider secret changes when no recharge order references that config.

- [ ] **Step 6: Run config lifecycle tests**

```bash
bun test \
  src/services/platform-payment-config-pending-orders-contract.test.ts \
  src/services/platform-payment-configs.test.ts \
  src/repositories/billing-recharge.test.ts \
  src/controllers/platform-payment-configs/routes.test.ts
bun run typecheck
bun run check:file-size
git diff --check
```

Expected: PASS. Critical writes are blocked twice—friendly preflight and database race guard—while disabling the profile remains possible.

- [ ] **Step 7: Commit the configuration lifecycle unit**

```bash
git add \
  supabase/migrations/20260718122000_guard_pending_recharge_payment_config.sql \
  apps/api/src/services/platform-payment-config-pending-orders-contract.test.ts \
  apps/api/src/repositories/billing-recharge.ts \
  apps/api/src/repositories/billing-recharge.test.ts \
  apps/api/src/repositories/platform-payment-configs.ts \
  apps/api/src/services/platform-payment-configs.ts \
  apps/api/src/services/platform-payment-configs.test.ts
git commit -m "fix(wechat-pay): 保护待支付订单配置凭据"
```

---

### Task 3: Reconcile one claimed order at a time under renewed ownership

**Files:**

- Create: `supabase/migrations/20260718123000_extend_recharge_claim_exclusions.sql`
- Create: `apps/api/src/services/billing-recharge-claim-exclusion-contract.test.ts`
- Modify: `apps/api/src/repositories/billing-recharge-expiration.ts`
- Modify: `apps/api/src/repositories/billing-recharge.ts`
- Modify: `apps/api/src/repositories/billing-recharge.test.ts`
- Modify: `apps/api/src/services/billing-recharge-expiration.ts`
- Modify: `apps/api/src/services/billing-recharge-expiration.test.ts`

- [ ] **Step 1: Write failing lease and multi-run tests**

Replace page-claim assumptions with one-order claims and add these exact behaviors:

```ts
expect(claimExpiredOrders).toHaveBeenNthCalledWith(1, {
  now: new Date("2026-07-18T02:06:00.000Z"),
  batchSize: 1,
  leaseSeconds: 60,
  excludedOrderIds: [],
});
expect(renewCloseClaim).toHaveBeenCalledWith({
  orderId: order.id,
  claimToken: order.close_claim_token,
  now: expect.any(Date),
  leaseSeconds: 60,
});
```

Use a monotonic `nowFactory` mock so every claim/renew obtains a fresh instant. Add tests for:

- `batchSize=101` performs at most 100 claim calls; when fewer candidates exist, the first empty claim terminates the loop within that bound;
- an unknown order remains leased while the next claim returns a different order, then releases after the claim loop;
- renewal returns `null`: no query, close, confirmation, or local close;
- two service instances receive different claim tokens; only the renewed token may close;
- atomic confirmation rejects on run one, the claim is deferred/released, and run two confirms successfully;
- disabled and suspended configs loaded by order config ID still query/close;
- two config IDs load each config/secret once and reuse the cached context;
- config lookup or secret load failure affects only that order and does not stop later claims;
- release failure increments `release_failed` and later releases still run.

The SQL contract must assert `p_excluded_ids uuid[]`, a maximum of 100 exclusions, and a candidate predicate equivalent to:

```sql
AND NOT (
  orders.id = ANY(coalesce(p_excluded_ids, ARRAY[]::uuid[]))
)
```

- [ ] **Step 2: Run the expiration tests and verify RED**

```bash
bun test \
  src/services/billing-recharge-expiration.test.ts \
  src/repositories/billing-recharge.test.ts
```

Expected: FAIL because the current service claims a full page, has no renew method, uses the active profile, and swallows release errors.

- [ ] **Step 3: Extend the claim RPC with bounded exclusions**

The migration drops the three-argument overload and recreates the service-role-only function with a fourth argument:

```sql
DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders(
  timestamptz,
  integer,
  integer
);

CREATE OR REPLACE FUNCTION public.billing_claim_expired_recharge_orders(
  p_now timestamptz,
  p_limit integer,
  p_lease_seconds integer,
  p_excluded_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS SETOF public.tenant_credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_NOW_REQUIRED';
  END IF;
  IF coalesce(cardinality(p_excluded_ids), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_EXCLUSIONS_TOO_LARGE';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT orders.id
    FROM public.tenant_credit_orders AS orders
    WHERE orders.channel = 'wechat_pay'
      AND orders.status = 'pending'
      AND orders.payment_expires_at IS NOT NULL
      AND orders.payment_expires_at <= p_now
      AND NOT (
        orders.id = ANY(coalesce(p_excluded_ids, ARRAY[]::uuid[]))
      )
      AND (
        orders.close_claim_expires_at IS NULL
        OR orders.close_claim_expires_at <= p_now
      )
    ORDER BY orders.payment_expires_at ASC, orders.id ASC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_orders AS orders
  SET close_claim_token = gen_random_uuid(),
      close_claim_expires_at = p_now + make_interval(
        secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600)
      ),
      close_attempt_count = orders.close_attempt_count + 1,
      close_last_error = NULL
  FROM candidates
  WHERE orders.id = candidates.id
  RETURNING orders.*;
END;
$$;
```

Revoke `PUBLIC`, `anon`, and `authenticated`, then grant the four-argument function to `service_role`. The repository passes `p_excluded_ids: input.excludedOrderIds.slice(0, 100)`.

- [ ] **Step 4: Add conditional lease renewal**

Add the repository helper:

```ts
export async function renewRechargeOrderCloseClaim(input: {
  orderId: string;
  claimToken: string;
  now: Date;
  leaseSeconds: number;
}): Promise<TenantCreditOrderRecord | null> {
  const leaseSeconds = clampInteger(input.leaseSeconds, 10, 600);
  const expiresAt = new Date(
    input.now.getTime() + leaseSeconds * 1000,
  ).toISOString();
  const { data, error } = await table()
    .update({ close_claim_expires_at: expiresAt })
    .eq("id", input.orderId)
    .eq("status", "pending")
    .eq("close_claim_token", input.claimToken)
    .select("*")
    .maybeSingle();
  if (error) {
    throw Errors.dbError("续租积分充值关单领取失败", error);
  }
  return (data as TenantCreditOrderRecord | null) ?? null;
}
```

Expose it from `BillingRechargeRepository` as `renewCloseClaim`. Tests must assert all three equality conditions and the computed expiration.

- [ ] **Step 5: Refactor the run loop to claim one order at a time**

Use a bounded driver and deferred release records:

```ts
type DeferredRelease = {
  orderId: string;
  claimToken: string;
  diagnostic: string | null;
};

export type BillingRechargeExpirationTelemetry = {
  claimed: number;
  paid: number;
  closed: number;
  retried: number;
  failed: number;
  release_failed: number;
};

async runExpiredOrderChecks(input: { batchSize: number }) {
  const limit = clampInteger(input.batchSize, 1, 100);
  const telemetry = emptyTelemetry();
  const deferred: DeferredRelease[] = [];
  const contextCache = new Map<string, Promise<BatchContext>>();
  const seenOrderIds: string[] = [];

  for (let index = 0; index < limit; index += 1) {
    const claimNow = this.nowFactory();
    const claimed = await this.repository.claimExpiredOrders({
      now: claimNow,
      batchSize: 1,
      leaseSeconds: this.leaseSeconds,
      excludedOrderIds: [...seenOrderIds],
    });
    const order = claimed[0];
    if (!order) break;
    seenOrderIds.push(order.id);
    telemetry.claimed += 1;
    await this.processClaimedOrder({
      order,
      contextCache,
      deferred,
      telemetry,
    });
  }

  await this.releaseDeferredClaims(deferred, telemetry);
  return telemetry;
}
```

Do not release retryable/failed pending claims inside `processClaimedOrder`; enqueue them. Paid and closed orders clear their claim through the existing trigger/conditional update and do not enter the deferred list.

- [ ] **Step 6: Load cleanup configuration by order ID and renew before query**

Replace the active-profile dependency with:

```ts
type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigById"
>;

private loadContext(
  configId: string,
  cache: Map<string, Promise<BatchContext>>,
) {
  const cached = cache.get(configId);
  if (cached) return cached;
  const pending = this.loadContextUncached(configId);
  cache.set(configId, pending);
  return pending;
}
```

`loadContextUncached` permits `active`, `disabled`, or `suspended`, ignores enabled-channel state for cleanup, and still requires the exact merchant fields for the mode, serial number, and secret ref. A missing `payment_config_id` is a stable deferred failure.

Immediately before the first query:

```ts
const renewed = await this.repository.renewCloseClaim({
  orderId: order.id,
  claimToken,
  now: this.nowFactory(),
  leaseSeconds: this.leaseSeconds,
});
if (!renewed) {
  telemetry.retried += 1;
  return;
}
```

If renewal throws, enqueue the original token for deferred release with a stable renewal-failed diagnostic and increment `failed`; do not query. Only the renewed owner may query and subsequently close. The existing `markOrderClosed` token condition remains the final local race guard.

- [ ] **Step 7: Make deferred release failures observable**

Release every deferred entry after the claim loop:

```ts
private async releaseDeferredClaims(
  deferred: DeferredRelease[],
  telemetry: BillingRechargeExpirationTelemetry,
) {
  for (const item of deferred) {
    try {
      await this.repository.releaseCloseClaim({
        orderId: item.orderId,
        claimToken: item.claimToken,
        errorMessage: item.diagnostic,
      });
    } catch {
      telemetry.release_failed += 1;
    }
  }
}
```

The worker's existing structured result log will include `release_failed`. Do not log raw gateway errors, secret refs, private keys, APIv3 keys, or decrypted transaction bodies.

- [ ] **Step 8: Run the complete reconciliation regression set**

```bash
bun test \
  src/services/billing-recharge-expiration.test.ts \
  src/services/billing-recharge-claim-exclusion-contract.test.ts \
  src/repositories/billing-recharge.test.ts \
  src/services/billing-recharge-payment-confirmation.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/services/wechat-pay-gateway-query-transaction.test.ts \
  src/services/wechat-pay-gateway-close-transaction.test.ts
bun run typecheck
bun run build
bun run check:file-size
git diff --check
```

Expected: PASS. No test path performs local closure before confirmed WeChat closure, a lost claim cannot call close, and a recovery failure leaves an order retryable for the next run.

- [ ] **Step 9: Commit the lease-safe reconciliation unit**

```bash
git add \
  supabase/migrations/20260718123000_extend_recharge_claim_exclusions.sql \
  apps/api/src/services/billing-recharge-claim-exclusion-contract.test.ts \
  apps/api/src/repositories/billing-recharge-expiration.ts \
  apps/api/src/repositories/billing-recharge.ts \
  apps/api/src/repositories/billing-recharge.test.ts \
  apps/api/src/repositories/platform-payment-configs.ts \
  apps/api/src/services/billing-recharge-expiration.ts \
  apps/api/src/services/billing-recharge-expiration.test.ts
git commit -m "fix(billing): 按订单租约收敛过期充值"
```

---

### Task 4: Verify the reliability revision and update its design status

**Files:**

- Modify: `docs/superpowers/specs/2026-07-18-recharge-expiration-reliability-design.md`

- [ ] **Step 1: Run the focused financial and worker-adjacent suite**

```bash
bun test \
  src/services/billing-recharge-atomic-confirmation-contract.test.ts \
  src/services/platform-payment-config-pending-orders-contract.test.ts \
  src/services/billing-recharge-payment-confirmation.test.ts \
  src/services/billing-recharge-expiration.test.ts \
  src/services/billing-recharge.test.ts \
  src/services/billing-recharge-payment-request.test.ts \
  src/services/billing-recharge-views.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/services/platform-payment-configs.test.ts \
  src/services/wechat-pay-gateway-query-transaction.test.ts \
  src/services/wechat-pay-gateway-close-transaction.test.ts \
  src/repositories/billing-recharge.test.ts
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run static and build gates**

```bash
bun run typecheck
bun run build
bun run check:file-size
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify migration state without applying remote changes**

```bash
supabase migration list
```

Expected: the two new migrations are visible as pending when local Docker is unavailable. Do not run `supabase db push`, `supabase migration up --linked`, or any remote command.

If local Docker is running, after confirming the local target only:

```bash
supabase migration up --local
supabase gen types typescript --local > /tmp/gooes-database.types.ts
rg -n "billing_confirm_wechat_recharge_and_recover" /tmp/gooes-database.types.ts
```

Do not overwrite `apps/api/src/types/database.ts` unless the full local generation succeeds and the diff is reviewed for unrelated schema drift.

- [ ] **Step 4: Mark the design implemented and commit verification metadata**

Change the design header to:

```markdown
**Status:** Implemented locally; remote migration not applied
```

Then commit only the design status:

```bash
git add docs/superpowers/specs/2026-07-18-recharge-expiration-reliability-design.md
git commit -m "docs: 记录充值过期可靠性验证状态"
```

---

## Self-review result

- Spec coverage: atomic confirmation, rollback-on-recovery failure, per-order claim renewal, deferred release, multi-worker ownership, disabled-config cleanup, critical config/secret guards, configuration caching, and release observability each map to a task and an explicit test.
- Placeholder scan: no deferred implementation markers or unspecified error handling remain.
- Type consistency: `billing_confirm_wechat_recharge_and_recover`, `renewCloseClaim`, `findWechatPayConfigById`, `hasPendingWechatOrdersForPaymentConfig`, `release_failed`, and `PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS` use one spelling throughout.
- Scope: no queue, cache service, new dependency, orange modification, remote migration, push, or deployment is introduced.
