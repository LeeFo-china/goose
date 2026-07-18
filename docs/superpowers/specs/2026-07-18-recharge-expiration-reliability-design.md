# Recharge Expiration Reliability Design

**Date:** 2026-07-18  
**Status:** Implemented and verified in code; migrations not applied by this work
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

The wrapper calls, in one PostgreSQL transaction:

1. `billing_confirm_wechat_recharge(...)`;
2. `billing_recover_subscription_after_recharge(tenant_id)`.

The tenant ID is read from the confirmed order returned by the first function, not accepted independently from the application. The result keeps the existing confirmation keys and adds a `recovery` object.

If recovery raises, PostgreSQL rolls back the credit confirmation, order status change, ledger entry, balance update, and claim-clearing trigger together. The order therefore remains retryable. The idempotent paid branch also invokes recovery, so older paid orders can safely retry the wrapper.

`BillingRechargeRepository.confirmWechatRecharge` will call only the wrapper. `BillingRechargePaymentConfirmation` will stop calling `billingSubscriptionService.recoverAfterRecharge` separately. Callback and expiration paths continue sharing the same service.

The new function is `SECURITY DEFINER`, fixes `search_path`, revokes `PUBLIC`, `anon`, and `authenticated`, and grants only `service_role`.

## 2. Per-order lease ownership

`runExpiredOrderChecks({ batchSize })` remains bounded to 100 outcomes, but no longer preclaims the whole page.

The run performs this loop sequentially:

1. claim one expired order with a fresh database time while excluding order IDs already seen in this run;
2. load or reuse the order's reconciliation configuration and secret;
3. renew that order's claim by `id + status=pending + claim_token` immediately before the first WeChat request;
4. query WeChat, then follow the existing state matrix;
5. retain failed or uncertain claims in memory until the run has finished claiming its bounded set;
6. release retained claims at the end of the run.

The claim RPC accepts at most 100 excluded order IDs and filters them in SQL. This remains correct even if an earlier uncertain order's short lease expires before a long run finishes. Deferring uncertain releases avoids making those orders available to other workers immediately; a crash still relies on the short database lease for recovery.

Add a repository method:

```ts
renewCloseClaim({ orderId, claimToken, now, leaseSeconds })
```

It conditionally extends the lease only when the order is still pending and the token still matches, returning the renewed order or `null`. A `null` result means ownership was lost; the service must not call WeChat close or perform a local transition.

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

The reliability work is implemented on `feat/recharge-payment-expiration` and has completed
implementation, specification review, and quality review locally.

Verification completed on 2026-07-18:

- 261 focused API, repository, migration-contract, WeChat gateway/callback, expiration, and worker
  tests passed with zero failures;
- API TypeScript typecheck, production build, and file-size checks passed;
- `git diff --check` passed;
- a credential-free disabled-worker smoke started with the documented defaults, handled one
  `SIGINT`, logged `worker stopped`, and exited with code 0;
- the mini-program contract and smoke checklist are recorded in
  `docs/miniprogram/2026-07-18-recharge-payment-expiration-handoff.md`.

Database and real-payment verification remain intentionally unexecuted:

- `supabase status` cannot inspect local services because the Docker daemon is not running;
- `supabase migration list --local` cannot connect to local PostgreSQL at `127.0.0.1:54322`;
- no remote migration, deployment, or database mutation was performed;
- no real WeChat payment/query/close smoke was run against an unconfirmed database target.

The next database step is to start local Docker/Supabase, apply the five recharge migrations
locally, verify the local migration list, and then run bounded RPC and real-payment smoke tests.

## Rollback

- Revert application calls to the original confirmation RPC before dropping the wrapper.
- Drop the configuration-guard triggers and their functions.
- Remove the wrapper RPC grants and function.
- Per-order claiming and renewal are application changes; reverting them restores the previous page-claim behavior but also restores the reviewed lease risk.

No destructive table or status change is required.
