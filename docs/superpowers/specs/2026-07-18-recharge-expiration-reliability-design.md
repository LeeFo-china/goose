# Recharge Expiration Reliability Design

**Date:** 2026-07-18
**Status:** Implemented and aggregate-verified; remote dev database verification pending
**Scope:** Harden the pending-recharge expiration work already implemented on `feat/recharge-payment-expiration`.

## Context

The recharge flow now has a server-owned five-minute deadline, WeChat `time_expire`, a continue-payment command, claim-based expiration reconciliation, and query-before-close behavior. Quality review found three reliability gaps in the first reconciliation design:

1. credit confirmation and subscription recovery happen in separate database transactions;
2. a 60-second lease cannot safely cover a preclaimed batch of up to 100 sequential WeChat calls;
3. reconciliation depends on the current active configuration, while platform configuration and its secret bundle can be overwritten in place.

These gaps can leave paid tenants unrecovered, allow two workers to act on the same late-batch order, or make an existing WeChat order impossible to query and close after configuration changes.

## Goals

- Make credit confirmation and subscription recovery atomic.
- Give every order a fresh lease immediately before its remote reconciliation work.
- Prevent the same run from reclaiming an uncertain order it just released.
- Allow existing orders to be reconciled when their payment profile is disabled or suspended.
- Prevent merchant identity, signing credentials, or secret-bundle contents from changing while an order using them is still pending.
- Preserve the public mini-program contract and the query-before-close invariant.
- Keep all database changes migration-managed and locally verifiable without touching a remote database.

## Non-goals

- Introduce a queue, Redis, or a new worker framework.
- Build a general-purpose payment-configuration versioning system.
- Change recharge order public statuses or `payment_action.disabled_reason` values.
- Modify the orange repository.

## Chosen approach

Use a transactional confirmation wrapper, per-order claiming with claim renewal, and guarded in-place configuration.

This is smaller than a full credential-version table and outbox, while closing the concrete failure modes. It also avoids solving lease safety by holding a large batch for many minutes.

## 1. Atomic confirmation and recovery

Add a migration-owned RPC:

```text
billing_confirm_wechat_recharge_and_recover(...)
```

The wrapper first obtains the order tenant and deterministically selects an invoice by
`due_at, id`, then follows the same lock order as
`billing_charge_subscription_invoice`: recoverable invoice, subscription, and finally the credit
account inside confirmation. It then calls, in the same PostgreSQL transaction:

1. `billing_confirm_wechat_recharge(...)`;
2. `billing_recover_subscription_after_recharge(tenant_id)`.

The tenant ID is read from the persisted order, not accepted independently from the application.
The base confirmation RPC is no longer executable by `service_role`; application callers must use
the wrapper so they cannot bypass the canonical lock order. The result keeps the existing
confirmation keys and adds a `recovery` object.

If recovery raises, PostgreSQL rolls back the credit confirmation, order status change, ledger entry, balance update, and claim-clearing trigger together. The order therefore remains retryable. The idempotent paid branch also invokes recovery, so older paid orders can safely retry the wrapper.

`BillingRechargeRepository.confirmWechatRecharge` will call only the wrapper. `BillingRechargePaymentConfirmation` will stop calling `billingSubscriptionService.recoverAfterRecharge` separately. Callback and expiration paths continue sharing the same service.

The new function is `SECURITY DEFINER`, fixes `search_path`, revokes `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role`.

## 2. Per-order lease ownership

`runExpiredOrderChecks({ batchSize })` remains bounded to 100 outcomes, but no longer preclaims the whole page.

The run performs this loop sequentially:

1. claim one expired order using `clock_timestamp()` inside PostgreSQL while excluding order IDs already seen in this run;
2. load or reuse the order's reconciliation configuration and secret;
3. renew that order's claim by `id + status=pending + claim_token` immediately before the first WeChat request;
4. query WeChat, then follow the existing state matrix;
5. when the query returns `NOTPAY`, renew the same token again immediately before the irreversible close request;
6. retain failed or uncertain claims in memory until the run has finished claiming its bounded set;
7. release retained claims at the end of the run.

The claim RPC accepts at most 100 excluded order IDs and filters them in SQL. This remains correct even if an earlier uncertain order's short lease expires before a long run finishes. Deferring uncertain releases avoids making those orders available to other workers immediately; a crash still relies on the short database lease for recovery.

Add a repository method:

```ts
renewCloseClaim({ orderId, claimToken, leaseSeconds })
```

It calls a database RPC that conditionally extends the lease with `clock_timestamp()` only when the
order is still pending and the token still matches, returning the renewed order or `null`. A `null`
result means ownership was lost; the service must not call WeChat close or perform a local
transition.

The default lease remains 60 seconds. The bounded WeChat path is at most one query, one close, and one second query, each with a ten-second default timeout. Renewal therefore gives the current order a sufficient safety margin without making crash recovery wait for an entire batch lease.

Release failures do not stop other orders, but increment a `release_failed` telemetry field and emit a structured log containing only order ID, diagnostic code, and error code/message. No secret or decrypted payload is logged.

## 3. Configuration lifecycle safety

Reconciliation loads configuration by `order.payment_config_id`, not by “current active profile.” Disabled or suspended profiles remain usable for query/close cleanup when their required merchant and credential fields are intact. They are not usable for creating or continuing payments.

Add a repository lookup that does not filter on operational status:

```ts
findWechatPayConfigById(configId)
```

The expiration service caches configuration and secret bundles by config ID within one run. This supports more than one historical config ID without repeated loads per order.

Critical in-place changes are blocked while a matching pending WeChat recharge order exists. Critical fields are:

- `merchant_mode`
- `merchant_id`
- `sub_merchant_id`
- `app_id`
- `sub_app_id`
- `serial_no`
- `encrypted_config_ref`
- the referenced secret setting's value

Status, enabled channels, labels, validation timestamps, and risk switches may still change. The expiration service intentionally ignores status/channel for cleanup, while create/continue-payment services retain their active-channel checks.

Protection has two layers:

1. service preflight returns a stable `409 / PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS` before changing critical configuration or a secret bundle;
2. database triggers enforce the same rule atomically for `platform_payment_configs` and the referenced secret `system_settings` row, closing the check/update race and covering writes outside the service.

The trigger checks only pending `wechat_pay` orders referencing the affected configuration. Once those orders are paid or closed, rotation is allowed.

Creation is serialized with rotation by `recharge_guard_version`. The
`20260718122500_serialize_recharge_config_creation.sql` migration increments that version whenever
critical config or referenced secret material changes, guards config/secret deletion, and exposes
`billing_create_pending_wechat_recharge_order`. That RPC locks the config row, verifies the version
read by the service, and creates the pending order in the same transaction. A concurrent rotation is
therefore ordered either before creation (the version check rejects and the service retries) or after
creation (the pending-order guard rejects the rotation).

Environment-backed secret references cannot be versioned or guarded by PostgreSQL. Operations documentation must require waiting until no pending order references that config before rotating the environment secret. The application-managed platform recharge profile uses the guarded system-setting reference.

## 4. Reconciliation state machine

The externally visible state matrix remains:

```text
SUCCESS -> atomic confirm+recover -> paid
CLOSED  -> conditional local closed
NOTPAY  -> WeChat close -> conditional local closed
other   -> retain claim, then release for retry
```

If close throws, query exactly once more:

```text
SUCCESS -> atomic confirm+recover
CLOSED  -> conditional local closed
other/query error -> retain claim, then release; never local-close
```

Before any close request, the service must still own the renewed token. Local closure remains conditional on the same token. Confirmation remains financially idempotent.

JSAPI prepay and every query/close request have a ten-second default timeout. Public responses take a
fresh clock reading after awaited work. If work crosses `payment_expires_at`, the response suppresses
`payment_request` and exposes `payment_action.disabled_reason=ORDER_PAYMENT_EXPIRED`; a late prepay ID
may only be persisted while the order is still pending and unexpired.

## 5. Verification

TDD coverage must include:

- recovery failure rolls back confirmation and a later run succeeds;
- the wrapper calls both existing RPCs and is service-role only;
- one-row claims use a fresh time and never exceed the requested total;
- uncertain orders are not reclaimed in the same run;
- a lost renewal prevents query/close/local close;
- two simulated workers cannot both close the same order;
- disabled/suspended config can reconcile an existing order;
- critical config and secret rotation are rejected while a pending order exists;
- noncritical status/channel changes remain allowed;
- configuration/secret cache loads once per config ID per run;
- release failures are observable and do not stop later orders;
- existing callback, refund, payment request, worker, type, build, and file-size regressions remain green.

Database verification remains local only until the user confirms a target. Required evidence after Docker/local Supabase is available:

```text
supabase migration list
supabase migration up --local
supabase gen types typescript --local
focused RPC smoke
```

## 6. Local implementation status

The reliability work is implemented on `feat/recharge-payment-expiration`. After final-review
remediation, the 33 changed API test files passed 267 tests with zero failures and 925 expectations
with every remote Supabase/database environment variable removed. API typecheck, build, file-size,
and `git diff --check` also passed. A credential-free worker shutdown smoke had already passed.

Database and real-payment verification remain intentionally unexecuted:

- the machine has no Docker CLI or local PostgreSQL, so local Supabase cannot be used;
- the user authorized the remote dev database, and read-only preflight confirmed exactly five pending
  migrations plus 11 historical pending WeChat recharge orders, but no migration had been applied at
  the time of this status update;
- no remote migration, deployment, or database mutation was performed;
- no real WeChat payment/query/close smoke was run against an unconfirmed database target.

The next database step is to apply the five confirmed migrations to the authorized remote dev target,
verify migration alignment, regenerate database types from that schema, and run bounded RPC and
real-payment smoke tests.

## Rollback

Rollback must deploy an application version compatible with the previous RPC signatures and stop the
expiration worker before changing database functions. The following dependency order rolls back the
reliability layer while retaining the original payment-expiration columns, index, and claim-clearing
trigger from `20260718110000`:

```sql
BEGIN;

-- 1. Remove final database-clock claim APIs and restore the previous
--    four-argument exclusion API expected by the prior worker.
DROP FUNCTION IF EXISTS public.billing_renew_recharge_close_claim(uuid, uuid, integer);
DROP FUNCTION IF EXISTS public.billing_claim_expired_recharge_orders(integer, integer, uuid[]);

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
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CLAIM_NOW_REQUIRED';
  END IF;
  IF coalesce(cardinality(p_excluded_ids), 0) > 100 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
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
      AND NOT (orders.id = ANY(coalesce(p_excluded_ids, ARRAY[]::uuid[])))
      AND (
        orders.close_claim_expires_at IS NULL
        OR orders.close_claim_expires_at <= p_now
      )
    ORDER BY orders.payment_expires_at ASC, orders.id ASC
    LIMIT least(greatest(coalesce(p_limit, 100), 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_credit_orders AS orders
  SET
    close_claim_token = gen_random_uuid(),
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

REVOKE ALL ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz, integer, integer, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_expired_recharge_orders(
  timestamptz, integer, integer, uuid[]
) TO service_role;

-- 2. Remove creation/config serialization and every update/delete guard.
DROP FUNCTION IF EXISTS public.billing_create_pending_wechat_recharge_order(
  uuid, text, text, text, text, bigint, bigint, integer, uuid, uuid,
  bigint, timestamptz, jsonb
);
DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret_delete
  ON public.system_settings;
DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_secret
  ON public.system_settings;
DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_config_delete
  ON public.platform_payment_configs;
DROP TRIGGER IF EXISTS tr_guard_pending_recharge_payment_config
  ON public.platform_payment_configs;
DROP FUNCTION IF EXISTS public.guard_pending_recharge_payment_secret();
DROP FUNCTION IF EXISTS public.guard_pending_recharge_payment_config_delete();
DROP FUNCTION IF EXISTS public.guard_pending_recharge_payment_config();
DROP INDEX IF EXISTS public.tenant_credit_orders_pending_wechat_payment_config_idx;
ALTER TABLE public.platform_payment_configs
  DROP CONSTRAINT IF EXISTS platform_payment_configs_recharge_guard_version_check,
  DROP COLUMN IF EXISTS recharge_guard_version;

-- 3. Restore direct confirmation access only after the application no longer
--    calls the atomic wrapper, then remove that wrapper.
GRANT EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge(
  uuid, text, integer, timestamptz, uuid, jsonb
) TO service_role;
DROP FUNCTION IF EXISTS public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
);

COMMIT;
```

This rollback deliberately restores the reviewed risks: caller-clock leases, direct noncanonical
confirmation locking, non-atomic subscription recovery, and mutable credentials during pending
orders. It must be exercised against an isolated schema first. A full feature rollback would also
need a separate forward migration to remove the `20260718110000` expiry columns/trigger/index after
all pending orders and workers are drained; that destructive data change is not part of the routine
reliability rollback.
