# Virtual Payment Delivery Retry Design

## Goal

Restore delivery retries after a failed provider call without weakening the
existing exact-claim and exact-attempt protections. This change adds the
database and repository command needed to start a new delivery attempt. It does
not implement or change the reconciliation worker.

## Command boundary

Add a narrow service-role RPC:

```text
branding_begin_virtual_payment_delivery_retry(
  order_id uuid,
  claim_token uuid,
  attempt_key uuid
) returns boolean
```

The repository exposes this RPC as
`beginReconciliationDeliveryRetry({ orderId, claimToken, attemptKey })`.
Terminal reporting stays in `markReconciliationDelivery`, whose TypeScript
input continues to accept only `succeeded | failed`. Callers cannot pass an
arbitrary status string through the repository.

## State transition

The begin command locks the order, captures a fresh clock after the lock, and
requires the exact unexpired reconciliation claim. It accepts only an order in
`payment_status=succeeded`, `fulfillment_status=granted`, and
`provider_delivery_status=failed`.

The new attempt key must be non-null and different from the failed attempt key.
A reused key, a pending attempt, or a succeeded terminal delivery is a state
conflict reported as `BRANDING_VIRTUAL_DELIVERY_STATE_INVALID` (409).

On success, the command atomically:

- changes delivery status from `failed` to `pending`;
- increments `provider_delivery_attempt_count` once;
- stores the new attempt key;
- clears provider request ID, provided-at time, delivery errors, and
  reconciliation errors;
- sets `reconcile_next_at` to the fresh command time;
- preserves the current reconciliation claim token and expiry.

The existing trigger keeps pending work due without replacing the explicit
timestamp. The existing delivery constraint accepts the resulting pending row.

## Crash and terminal behavior

If the process crashes after begin, the row remains pending with the durable
attempt key. A later claim returns that key and the worker can call the provider
gateway directly; it must not call begin again, so the attempt counter is not
incremented twice.

Terminal reporting continues to require `pending` plus the exact attempt key.
Success remains terminal and releases the lease. Failure records the error,
schedules the next reconciliation time, and releases the lease. A later claim
may start another retry with another new key, making the attempt counter
monotonic.

## Verification

Repository tests verify the exact RPC name and typed parameters. Migration
contract tests cover failed-to-pending begin, pending-to-success,
pending-to-failed scheduling, counter monotonicity, same-key rejection,
pending/succeeded rejection, exact fresh lease validation, trigger behavior,
constraints, and service-role-only grants. Focused tests, the complete
branding-virtual test set, API checks, and diff checks run before commit.
