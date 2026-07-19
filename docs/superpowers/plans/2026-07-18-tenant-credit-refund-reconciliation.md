# Tenant Credit Refund Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WeChat recharge refunds converge safely when callbacks are lost, while rejecting untrusted APIv3 responses and preserving one financial state transition.

**Architecture:** Reuse the existing billing reconciliation worker. A migration-managed lease claims bounded batches of `refunding` requests; a focused service queries WeChat, validates the signed response against the stored order, and routes terminal states through atomic RPCs. Gateway transport, refund-domain validation, repository access, and worker scheduling remain separate units.

**Tech Stack:** Bun 1.3.2, TypeScript, Fastify services/workers, Supabase/PostgreSQL migrations and RPCs, Node `crypto`, WeChat Pay APIv3.

---

## Execution Context

- Worktree: `/Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration-release`
- Branch: `release/recharge-payment-expiration`
- Starting HEAD: `90e75b37` (`docs(billing): 设计退款主动对账方案`)
- Approved design: `docs/superpowers/specs/2026-07-18-tenant-credit-refund-reconciliation-design.md`
- Direct-merchant refund reference:
  `.codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/APIv3/普通商户/支付产品/订单退款/附录/微信支付退款最佳实践-4014959631.md`
- Partner refund reference:
  `.codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/APIv3/合作伙伴/支付产品/订单退款/附录/微信支付退款最佳实践-4014960215.md`
- APIv3 response verification reference:
  `.codex/skills/wechatpay-payment-integration/assets/微信支付官网文档/APIv3/普通商户/通用规则/开发须知/如何验签/如何使用微信支付公钥验签-4013053249.md`
- Do not modify `/Users/leefo/Public/work/orange`.
- Do not push, merge, open a PR, or deploy.
- Database changes are migration-only. The user has authorized the remote dev database; Task 7 is the only task allowed to apply the new migration.
- The dev database already contains payment-expiration migrations `20260718110000` through
  `20260718123000`. They are supplied by the 36 source-feature commits and are not present at the
  starting HEAD. Complete the integration gate after Task 6 before Task 7, otherwise migration
  history would be remote-only and violate the alignment rule.
- After every task: implementer self-review, fresh spec review, then fresh code-quality review. Fix Critical and Important feedback before continuing.

## File Responsibility Map

- `wechat-pay-api-response.ts`: raw APIv3 response reading, signature/timestamp/serial verification, JSON parsing, bounded fetch error mapping.
- `wechat-pay-refund-contract.ts`: strict refund request/query/callback identity, amount, status, and event binding.
- `20260718124000_harden_tenant_credit_refund_reconciliation.sql`: schema columns, indexes, atomic begin/claim/reschedule/close/callback/claimed-confirm RPC changes, callback-compatible confirm hardening, permissions, rollback notes.
- `billing-recharge-refund-reconciliation.ts` repository: bounded claim and token-gated finalize calls plus batch hydration.
- `billing-recharge-refund-reconciliation.ts` service: one refund state machine and batch summary.
- `billing-reconcile-worker.ts`: scheduling only; it does not contain refund business rules.

---

### Task 1: Verify and bound every WeChat APIv3 response

**Files:**
- Create: `apps/api/src/services/wechat-pay-api-response.ts`
- Create: `apps/api/src/services/wechat-pay-api-response.test.ts`
- Modify: `apps/api/src/services/wechat-pay-gateway.ts`
- Modify: `apps/api/src/services/wechat-pay-gateway.test.ts`
- Reuse: `apps/api/src/services/wechat-pay-callback-crypto.ts`

- [ ] **Step 1: Write failing response-verification tests**

Create tests that generate an RSA key pair and sign the exact raw body. The test API must be:

```ts
const result = await readVerifiedWechatPayJson({
  response,
  publicKeyId: "PUB_KEY_ID_TEST",
  publicKeyPem,
  nowSeconds: 1_721_000_000,
});
```

Cover these exact cases:

```ts
test("accepts a current response signed over the unmodified raw body", async () => {
  expect(result.payload).toEqual({ status: "PROCESSING" });
  expect(result.requestId).toBe("wechat-request-id");
});

test.each([
  "wechatpay-timestamp",
  "wechatpay-nonce",
  "wechatpay-serial",
  "wechatpay-signature",
])("rejects a response missing %s", async (header) => {
  await expect(readResponseWithout(header)).rejects.toMatchObject({
    code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
  });
});

test("rejects an unknown public-key id", async () => {
  await expect(readWithSerial("PUB_KEY_ID_OTHER")).rejects.toMatchObject({
    code: "WECHAT_PAY_RESPONSE_SERIAL_MISMATCH",
  });
});

test("rejects timestamps outside the five-minute window", async () => {
  await expect(readAtOffsetSeconds(301)).rejects.toMatchObject({
    code: "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
  });
});

test("rejects invalid and SIGNTEST signatures", async () => {
  await expect(readWithSignature("WECHATPAY/SIGNTEST/invalid"))
    .rejects.toMatchObject({ code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID" });
});

test("rejects signed non-object JSON", async () => {
  await expect(readSigned("[]")).rejects.toMatchObject({
    code: "WECHAT_PAY_RESPONSE_BODY_INVALID",
  });
});
```

- [ ] **Step 2: Run the new test and confirm RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-api-response.test.ts
```

Expected: FAIL because `readVerifiedWechatPayJson` does not exist.

- [ ] **Step 3: Implement the verified raw-response reader**

Implement this exported contract without a new dependency:

```ts
export type VerifiedWechatPayJson = {
  payload: Record<string, unknown>;
  requestId: string | null;
  rawBody: string;
};

export async function readVerifiedWechatPayJson(input: {
  response: Response;
  publicKeyId: string | null;
  publicKeyPem: string | null;
  nowSeconds?: number;
}): Promise<VerifiedWechatPayJson>;
```

Read `response.text()` exactly once. Require the four WeChat headers, require configured public key ID/PEM, compare serial, allow at most 300 seconds of clock skew, and call the existing RSA-SHA256 verifier with:

```ts
`${timestamp}\n${nonce}\n${rawBody}\n`
```

Map every failure through `Errors.business`; never expose the signature or raw body in error details.

- [ ] **Step 4: Write failing bounded-transport tests**

Add gateway tests for an injected fetch that rejects and one that waits for the abort signal:

```ts
await expect(gateway.queryTransactionByOutTradeNo(input)).rejects.toMatchObject({
  code: "WECHAT_PAY_TRANSPORT_FAILED",
  details: expect.objectContaining({ operation: "transaction_query" }),
});

await expect(timeoutGateway.requestRefund(refundInput)).rejects.toMatchObject({
  code: "WECHAT_PAY_TRANSPORT_TIMEOUT",
  details: expect.objectContaining({ operation: "refund_request" }),
});
```

Run the two named tests and confirm they fail before modifying gateway fetch behavior.

- [ ] **Step 5: Route gateway calls through verified, bounded transport**

Add injected `requestTimeoutMs` and `nowSecondsFactory` dependencies. Default timeout is 10,000 ms. A shared private method must:

1. create an `AbortController` and clear its timer in `finally`;
2. map abort to `WECHAT_PAY_TRANSPORT_TIMEOUT` and other fetch failures to `WECHAT_PAY_TRANSPORT_FAILED`;
3. call `readVerifiedWechatPayJson` before any payload is trusted;
4. retain response `Request-ID` in safe error details;
5. preserve operation names `jsapi_prepay`, `transaction_query`, `refund_request`, and `refund_query`.

Update gateway tests to return correctly signed `Response` objects. Do not add a test-only bypass for unsigned responses.

- [ ] **Step 6: Verify Task 1 GREEN**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-api-response.test.ts src/services/wechat-pay-gateway.test.ts
cd ../..
bun run api:check
git diff --check
```

Expected: all tests pass, API typecheck/build/file-size pass, diff-check produces no output.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/api/src/services/wechat-pay-api-response.ts \
  apps/api/src/services/wechat-pay-api-response.test.ts \
  apps/api/src/services/wechat-pay-gateway.ts \
  apps/api/src/services/wechat-pay-gateway.test.ts
git commit -m "fix(billing): 验证微信支付接口应答"
```

---

### Task 2: Bind refund API responses to the local order

**Files:**
- Create: `apps/api/src/services/wechat-pay-refund-contract.ts`
- Create: `apps/api/src/services/wechat-pay-refund-contract.test.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-refund-wechat.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-refund-execution.ts`

- [ ] **Step 1: Write failing refund-contract tests**

Define the expected local binding once:

```ts
const expected = {
  outRefundNo: "TRR202607100800000001",
  wechatRefundId: null,
  transactionId: "4200000001",
  outTradeNo: "TC202607020001",
  refundAmountFen: 10000,
  totalAmountFen: 10000,
  currency: "CNY",
} as const;
```

Tests must accept all four documented statuses and reject each mismatch independently:

```ts
expect(parseAndAssertWechatRefund(response, expected)).toMatchObject({
  status: "SUCCESS",
  wechatRefundId: "5030000000202607150000000001",
});

expect(() => parseAndAssertWechatRefund({ ...response, out_refund_no: "other" }, expected))
  .toThrow(expect.objectContaining({ code: "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH" }));
```

Repeat the negative assertion for missing `refund_id`, wrong transaction/trade number, wrong refund/total amount, missing or non-CNY API response currency, and unsupported status. Add a separate case with a non-null stored `expected.wechatRefundId` and reject a different response `refund_id`.

Add callback-event tests requiring exact pairs:

```ts
expect(() => assertWechatRefundEventMatches("REFUND.SUCCESS", "CLOSED"))
  .toThrow(expect.objectContaining({ code: "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH" }));
```

Also test `parseAndAssertWechatRefundCallback(resource, expected)` with the callback field
`refund_status`. Direct-merchant callbacks require `resource.mchid === expected.merchantId`;
service-provider callbacks require both `resource.sp_mchid === expected.merchantId` and
`resource.sub_mchid === expected.subMerchantId`. Use official-shaped direct and partner callback
fixtures containing the documented refund/transaction IDs and amounts. Their `amount` objects do
not define `currency`; after those fields and merchant identities match, bind the result to the
trusted local product currency `CNY`. If an extension supplies `amount.currency`, reject any value
other than `CNY`.

- [ ] **Step 2: Run the new contract test and confirm RED**

```bash
cd apps/api
bun test src/services/wechat-pay-refund-contract.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement one strict refund parser**

Export:

```ts
export type WechatRefundStatus =
  | "PROCESSING"
  | "SUCCESS"
  | "CLOSED"
  | "ABNORMAL";

export function parseAndAssertWechatRefund(
  payload: Record<string, unknown>,
  expected: WechatRefundExpectedBinding,
): WechatRefundValidatedResult;

export function parseAndAssertWechatRefundCallback(
  resource: Record<string, unknown>,
  expected: WechatRefundCallbackExpectedBinding,
): WechatRefundValidatedResult;

export function assertWechatRefundEventMatches(
  eventType: string,
  status: WechatRefundStatus,
): void;
```

The parsers share the same identity/amount/status core and must not substitute a
missing/different `out_refund_no`, `refund_id`, status, amount, or identity with a local fallback.
API request/query results require `amount.currency=CNY`; callback resources use the official
schema without that field and apply the callback rule above. Error details may contain IDs and
integer amounts, but not raw payloads.

- [ ] **Step 4: Use the contract in the execution flow**

For request/query responses, validate against the stable local request and order before
`saveWechatRefundResult`. Add `requestId: string | null` to the gateway refund result types;
the gateway copies the verified HTTP `Request-ID` into that field, and the strict parser retains
it as `requestId` for safe metadata/audit use. The parser returns camel-case domain fields and
never persists `raw` response bodies.

The callback integration is deliberately deferred until Task 4, after migration-managed atomic
callback terminal RPCs exist. Do not add a non-atomic callback workaround in this task.

- [ ] **Step 5: Verify Task 2 GREEN**

```bash
cd apps/api
bun test \
  src/services/wechat-pay-refund-contract.test.ts \
  src/services/platform-billing-recharge-refund-execution.test.ts
cd ../..
bun run api:check
git diff --check
```

Expected: zero failures and all API checks pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api/src/services/wechat-pay-refund-contract.ts \
  apps/api/src/services/wechat-pay-refund-contract.test.ts \
  apps/api/src/services/platform-billing-recharge-refund-wechat.ts \
  apps/api/src/services/platform-billing-recharge-refund-execution.ts
git commit -m "fix(billing): 绑定微信退款响应身份"
```

---

### Task 3: Add lease and atomic refund RPCs through one migration

**Files:**
- Create: `supabase/migrations/20260718124000_harden_tenant_credit_refund_reconciliation.sql`
- Create: `apps/api/src/services/tenant-credit-refund-reconciliation-sql-contract.test.ts`

- [ ] **Step 1: Write failing SQL contract tests**

Read the exact migration URL and assert the schema/RPC safety contract:

```ts
const migration = new URL(
  "../../../../supabase/migrations/20260718124000_harden_tenant_credit_refund_reconciliation.sql",
  import.meta.url,
);

test("adds a bounded partial due index and paired lease fields", () => {
  const source = sql();
  expect(source).toContain("reconcile_next_at timestamptz");
  expect(source).toContain("reconcile_attempt_count integer NOT NULL DEFAULT 0");
  expect(source).toContain("reconcile_claim_token uuid");
  expect(source).toContain("reconcile_claim_expires_at timestamptz");
  expect(source).toContain("reconcile_last_error text");
  expect(source).toContain("tenant_credit_refund_reconcile_last_error_check");
  expect(source).toContain("WHERE status = 'refunding'");
});

test("claims no more than 100 rows with skip locked", () => {
  const source = sql();
  expect(source).toContain("billing_claim_wechat_recharge_refunds");
  expect(source).toMatch(/p_limit NOT BETWEEN 1 AND 100/);
  expect(source).toMatch(/p_lease_seconds NOT BETWEEN 30 AND 900/);
  expect(source).toContain("FOR UPDATE SKIP LOCKED");
  expect(source).toContain("reconcile_attempt_count =");
  expect(source).toContain("RETURNS TABLE(");
  expect(source).not.toContain("RETURNING request.*");
});

test("backfills historical active requests without overwriting terminal mirrors", () => {
  const source = sql();
  expect(source).toMatch(
    /status = 'refunding'[\s\S]*reconcile_next_at IS NULL/,
  );
  expect(source).toMatch(
    /refund_status IS NULL[\s\S]*refund_status = 'approved'/,
  );
});

test("finalizes only the matching claim token", () => {
  const source = sql();
  expect(source).toContain("billing_reschedule_wechat_recharge_refund");
  expect(source).toContain("billing_close_wechat_recharge_refund");
  expect(source).toContain("billing_confirm_claimed_wechat_recharge_refund");
  expect(source.match(/reconcile_claim_token = p_claim_token/g)?.length ?? 0)
    .toBeGreaterThanOrEqual(3);
});

test("begins request and order refunding in one transaction", () => {
  const source = sql();
  expect(source).toContain("billing_begin_wechat_recharge_refund");
  expect(source).toMatch(/tenant_credit_refund_requests[\s\S]+FOR UPDATE/);
  expect(source).toMatch(/tenant_credit_orders[\s\S]+FOR UPDATE/);
});

test("keeps every reconciliation RPC service-role-only", () => {
  const RPC_NAMES = [
    "billing_begin_wechat_recharge_refund",
    "billing_claim_wechat_recharge_refunds",
    "billing_reschedule_wechat_recharge_refund",
    "billing_close_wechat_recharge_refund",
    "billing_apply_wechat_recharge_refund_callback_state",
    "billing_confirm_wechat_recharge_refund",
    "billing_confirm_claimed_wechat_recharge_refund",
  ] as const;

  for (const name of RPC_NAMES) {
    expect(sql()).toMatch(new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${name}[^;]+FROM PUBLIC, anon, authenticated;`,
      "s",
    ));
    expect(sql()).toMatch(new RegExp(
      `GRANT EXECUTE ON FUNCTION public\\.${name}[^;]+TO service_role;`,
      "s",
    ));
  }
});
```

- [ ] **Step 2: Run the SQL contract test and confirm RED**

```bash
cd apps/api
bun test src/services/tenant-credit-refund-reconciliation-sql-contract.test.ts
```

Expected: FAIL because the migration file is absent.

- [ ] **Step 3: Implement the migration**

The migration must run inside `BEGIN/COMMIT`, include rollback comments that require stopping the
worker, dropping RPCs/indexes, and proving no active leases before dropping columns, and state
that completed refunds/ledger entries are never automatically reversed. It must also state that
the historical due-time backfill and safe mirror repair are not automatically reverted. Use
`SECURITY DEFINER SET search_path = pg_catalog, public`, and implement these exact contracts:

```sql
ALTER TABLE public.tenant_credit_refund_requests
  ADD COLUMN IF NOT EXISTS reconcile_next_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reconcile_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconcile_claim_token uuid NULL,
  ADD COLUMN IF NOT EXISTS reconcile_claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reconcile_last_error text NULL,
  ADD COLUMN IF NOT EXISTS reconcile_last_checked_at timestamptz NULL;

ALTER TABLE public.tenant_credit_refund_requests
  ADD CONSTRAINT tenant_credit_refund_reconcile_attempt_count_check
    CHECK (reconcile_attempt_count >= 0),
  ADD CONSTRAINT tenant_credit_refund_reconcile_lease_check CHECK (
    (reconcile_claim_token IS NULL AND reconcile_claim_expires_at IS NULL)
    OR
    (reconcile_claim_token IS NOT NULL AND reconcile_claim_expires_at IS NOT NULL)
  ),
  ADD CONSTRAINT tenant_credit_refund_reconcile_last_error_check CHECK (
    reconcile_last_error IS NULL OR char_length(reconcile_last_error) <= 200
  );

CREATE INDEX IF NOT EXISTS tenant_credit_refund_reconcile_due_idx
ON public.tenant_credit_refund_requests(reconcile_next_at, id)
WHERE status = 'refunding' AND reconcile_next_at IS NOT NULL;
```

After the columns and constraints exist, run migration DML for the historical two-write gap:

```sql
UPDATE public.tenant_credit_refund_requests AS request
SET reconcile_next_at = pg_catalog.now()
WHERE request.status = 'refunding'
  AND request.reconcile_next_at IS NULL;

UPDATE public.tenant_credit_orders AS credit_order
SET refund_status = 'refunding'
FROM public.tenant_credit_refund_requests AS request
WHERE request.order_id = credit_order.id
  AND request.tenant_id = credit_order.tenant_id
  AND request.status = 'refunding'
  AND (
    credit_order.refund_status IS NULL
    OR credit_order.refund_status = 'approved'
  );
```

The first update makes every historical active refund immediately claimable. The second repairs
only the safe stale mirror left by the legacy two-write flow; it must never overwrite
`refunded`, `failed`, `rejected`, or any other mirror state. Neither update moves credits or
creates ledger entries.

Use these exact function signatures so repository calls, privilege smoke, and generated types
share one contract:

```sql
billing_begin_wechat_recharge_refund(uuid, text, timestamptz) RETURNS jsonb
billing_claim_wechat_recharge_refunds(integer, integer, uuid, timestamptz)
  RETURNS TABLE(
    id uuid,
    tenant_id uuid,
    order_id uuid,
    reason text,
    requested_amount_fen integer,
    out_refund_no text,
    wechat_refund_id text,
    refund_amount_fen integer,
    reconcile_attempt_count integer
  )
billing_reschedule_wechat_recharge_refund(
  uuid, uuid, timestamptz, timestamptz, text, jsonb, text, integer
) RETURNS boolean
billing_close_wechat_recharge_refund(uuid, uuid, timestamptz, jsonb) RETURNS boolean
billing_apply_wechat_recharge_refund_callback_state(
  uuid, text, text, timestamptz, jsonb
) RETURNS boolean
billing_confirm_wechat_recharge_refund(
  uuid, text, text, integer, timestamptz, uuid, jsonb
) RETURNS jsonb
billing_confirm_claimed_wechat_recharge_refund(
  uuid, uuid, text, text, integer, timestamptz, jsonb
) RETURNS jsonb
```

`billing_begin_wechat_recharge_refund` must lock request then order, conditionally move `approved|failed` to `refunding`, set the order mirror in the same transaction, preserve an existing stable number, and set `reconcile_next_at = p_now + interval '1 minute'`.

`billing_claim_wechat_recharge_refunds` must reject lease seconds outside 30..900, select due or
expired-lease rows ordered by `(reconcile_next_at, id)`, limit to `p_limit`, use
`FOR UPDATE SKIP LOCKED`, then assign one `p_claim_token`, expiry, and increment count. It returns
only the nine fields in the `RETURNS TABLE` contract; never return the full request row.

`billing_reschedule_wechat_recharge_refund` must require `status='refunding'` and exact claim token, clear lease, set the supplied next time/check time/error, and merge object metadata.
It also accepts nullable `p_wechat_refund_id` and `p_refund_amount_fen`; when present, it saves
them in the same token-gated update. A worker must not perform a separate unclaimed write.
Reject a supplied blank `p_wechat_refund_id` defensively.

`billing_close_wechat_recharge_refund` must lock request/order, require exact token and `refunding`, set request/order mirror to `failed`, clear the lease, and merge a stable `CLOSED` reason.

`billing_apply_wechat_recharge_refund_callback_state` must lock request/order, validate the stable
`out_refund_no`, and accept only `CLOSED|ABNORMAL`. `CLOSED` atomically moves request/order mirror
to `failed`; `ABNORMAL` keeps both active/refunding, clears any worker lease, and schedules the
next query for 30 minutes later. This RPC is the callback path and does not require a worker claim
token.

Keep `billing_confirm_wechat_recharge_refund` as the callback SUCCESS compatibility RPC. Replace
it with the existing function body plus these changes:

```sql
latest_notification_id = coalesce(p_notification_id, latest_notification_id)
```

and clear all reconciliation scheduling/lease fields when status becomes `refunded`. Callback
callers continue passing their real notification UUID.

Add `billing_confirm_claimed_wechat_recharge_refund` for worker SUCCESS. It locks the refund
request, requires exact `status='refunding'` plus `reconcile_claim_token=p_claim_token`, and
returns SQL `NULL` when callback or another owner won. While holding that lock, call
`billing_confirm_wechat_recharge_refund` in the same transaction with `p_notification_id` set to
`NULL::uuid`; do not copy its credit/ledger logic.
Reject NULL `p_refund_request_id` and NULL `p_claim_token` with stable SQL exceptions before the
lock query. SQL `NULL` return is reserved for valid arguments whose claim/status no longer match.

Revoke all seven functions from `PUBLIC`, `anon`, and `authenticated`; grant only `service_role`.

- [ ] **Step 4: Verify migration contract GREEN**

```bash
cd apps/api
bun test src/services/tenant-credit-refund-reconciliation-sql-contract.test.ts
cd ../..
git diff --check
```

Expected: contract tests pass and diff-check is empty. Do not apply the migration in this task.

- [ ] **Step 5: Commit Task 3**

```bash
git add supabase/migrations/20260718124000_harden_tenant_credit_refund_reconciliation.sql \
  apps/api/src/services/tenant-credit-refund-reconciliation-sql-contract.test.ts
git commit -m "feat(billing): 增加退款对账租约"
```

---

### Task 4: Use atomic begin and token-gated repositories

**Files:**
- Modify: `apps/api/src/repositories/platform-billing-recharge-refunds.ts`
- Modify: `apps/api/src/repositories/billing-recharge-refund-callbacks.ts`
- Modify: `apps/api/src/repositories/platform-payment-configs.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-refund-execution.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-refund-execution.test.ts`
- Modify: `apps/api/src/services/wechat-pay-callback-refunds.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks-credit-refund.test.ts`
- Create: `apps/api/src/repositories/billing-recharge-refund-reconciliation.ts`
- Create: `apps/api/src/repositories/billing-recharge-refund-reconciliation.test.ts`

- [ ] **Step 1: Write failing atomic-execution tests**

Replace the two repository mocks with one `beginWechatRefund` mock and assert exact ordering:

```ts
expect(repository.beginWechatRefund).toHaveBeenCalledWith({
  requestId: "refund-request-1",
  outRefundNo: "TRR202607100800000001",
  now: expect.any(String),
});
expect(events).toEqual([
  "wechat-query-transaction",
  "begin-wechat-refund",
  "wechat-refund",
  "save-wechat-result",
]);
```

Add a test where the RPC returns `null`; expect
`BILLING_RECHARGE_REFUND_EXECUTE_STATE_INVALID` and no WeChat refund call.

Run the execution test and confirm RED against the existing two-write port.

- [ ] **Step 2: Implement the atomic execution repository method**

Expose this port:

```ts
beginWechatRefund(input: {
  requestId: string;
  outRefundNo: string;
  now: string;
}): Promise<PlatformRechargeRefundRequestRecord | null>;
```

Call `billing_begin_wechat_recharge_refund` through the admin client, wrap database errors with `Errors.dbError`, hydrate the returned request in one batched path, and remove execution-service use of `markRequestRefunding` plus `markOrderRefundStatus`.

- [ ] **Step 3: Write failing reconciliation-repository tests**

Assert the repository:

```ts
await repository.claimDue({
  limit: 20,
  leaseSeconds: 120,
  claimToken: "00000000-0000-4000-8000-000000000001",
  now: "2026-07-18T12:00:00.000Z",
});
```

calls the claim RPC with bounded values, consumes only the nine minimal claim fields from Task 3,
fetches all order IDs with one `.in(...)`, fetches all config IDs with one `.in(...)`, and returns
hydrated rows. A limit of 101 must throw
`BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID` before any RPC; lease seconds outside 30..900
must fail before the RPC as well.

Also test token-gated `reschedule`, `close`, and `confirmSuccess` argument mapping.
`reschedule` carries optional refund ID/amount in the same RPC. `confirmSuccess` must call
`billing_confirm_claimed_wechat_recharge_refund` with the exact `claimToken`; it has no
notification argument and must not create a fake notification. A SQL `NULL` result means callback
or another lease owner won and is returned as an idempotent race（幂等竞争）. Keep
`BillingConfirmWechatRechargeRefundInput.notificationId` non-null for callback SUCCESS, which
continues calling `billing_confirm_wechat_recharge_refund` with the real notification ID.
Callback-repository tests must assert exact mapping for
`billing_apply_wechat_recharge_refund_callback_state` and no table-by-table terminal writes.

- [ ] **Step 4: Implement focused reconciliation repository ports**

Export record/input types and these methods:

```ts
claimDue(input: ClaimDueRefundsInput): Promise<ClaimedRefund[]>;
reschedule(input: RescheduleClaimedRefundInput): Promise<boolean>;
close(input: CloseClaimedRefundInput): Promise<boolean>;
confirmSuccess(input: ConfirmClaimedRefundInput): Promise<ConfirmRefundResult | null>;
```

`null` is the expected idempotent lost-claim/callback race, not a database or financial failure.
The input must contain `claimToken`, and the repository maps it to
`billing_confirm_claimed_wechat_recharge_refund` rather than the callback compatibility RPC.

Add `findWechatPayConfigById(id)` using `.select("*").eq("id", id).maybeSingle()` and change
manual execution to require `order.payment_config_id` and load that exact config instead of the
current active profile. Claim hydration must not call it once per row. Implement a batch
`findWechatPayConfigsByIds(ids)` with one `.in(...)` for the reconciliation repository.

Add `applyWechatRechargeRefundCallbackState` to
`billing-recharge-refund-callbacks.ts`; it calls the callback-state RPC and replaces the existing
request-update/order-update pair.

- [ ] **Step 5: Bind callback terminal states after the atomic RPC exists**

Add callback tests that exercise `parseAndAssertWechatRefundCallback` and compare documented
merchant fields against `matched.config`:

```ts
direct_merchant: resource.mchid === config.merchant_id
service_provider_sub_merchant:
  resource.sp_mchid === config.merchant_id &&
  resource.sub_mchid === config.sub_merchant_id
```

Require exact `event_type`/refund-status pairs. `REFUND.SUCCESS` uses the existing confirm RPC,
`REFUND.CLOSED` calls `applyWechatRechargeRefundCallbackState` with `CLOSED`, and
`REFUND.ABNORMAL` calls it with `ABNORMAL`. Remove the current OR-based success shortcut and the
two-write failure repository path. Tests must prove `ABNORMAL` does not release the active
request.

- [ ] **Step 6: Verify Task 4 GREEN**

```bash
cd apps/api
bun test \
  src/services/platform-billing-recharge-refund-execution.test.ts \
  src/repositories/billing-recharge-refund-reconciliation.test.ts \
  src/services/wechat-pay-callbacks-credit-refund.test.ts
cd ../..
bun run api:check
git diff --check
```

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api/src/repositories/platform-billing-recharge-refunds.ts \
  apps/api/src/repositories/billing-recharge-refund-callbacks.ts \
  apps/api/src/repositories/platform-payment-configs.ts \
  apps/api/src/repositories/billing-recharge-refund-reconciliation.ts \
  apps/api/src/repositories/billing-recharge-refund-reconciliation.test.ts \
  apps/api/src/services/platform-billing-recharge-refund-execution.ts \
  apps/api/src/services/platform-billing-recharge-refund-execution.test.ts \
  apps/api/src/services/wechat-pay-callback-refunds.ts \
  apps/api/src/services/wechat-pay-callbacks-credit-refund.test.ts
git commit -m "refactor(billing): 原子切换退款执行状态"
```

---

### Task 5: Implement the leased refund reconciliation state machine

**Files:**
- Create: `apps/api/src/services/billing-recharge-refund-reconciliation.ts`
- Create: `apps/api/src/services/billing-recharge-refund-reconciliation.test.ts`
- Create if fixtures keep the test below 500 lines: `apps/api/src/services/billing-recharge-refund-reconciliation.test-fixtures.ts`
- Modify: `apps/api/src/services/wechat-pay-gateway.ts` only if the validated result needs a retained Request-ID field

- [ ] **Step 1: Write failing backoff and batch tests**

Specify the schedule as a pure exported function:

```ts
expect(refundReconcileDelayMs(1)).toBe(60_000);
expect(refundReconcileDelayMs(5)).toBe(60_000);
expect(refundReconcileDelayMs(6)).toBe(5 * 60_000);
expect(refundReconcileDelayMs(7)).toBe(10 * 60_000);
expect(refundReconcileDelayMs(8)).toBe(20 * 60_000);
expect(refundReconcileDelayMs(9)).toBe(30 * 60_000);
expect(refundReconcileDelayMs(100)).toBe(30 * 60_000);
```

Assert `runBatch({ limit: 20 })` claims once and returns a summary with:

```ts
{
  claimed: 1,
  success: 0,
  processing: 1,
  closed: 0,
  abnormal: 0,
  rescheduled: 1,
  failed: 0,
}
```

- [ ] **Step 2: Run the new service test and confirm RED**

```bash
cd apps/api
bun test src/services/billing-recharge-refund-reconciliation.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add failing state-machine cases one at a time**

Add and run each case before its production branch:

1. `SUCCESS` calls `confirmSuccess` once with the exact claim token plus validated
   IDs/amount/time and never reschedules; a `null` result is an idempotent race.
2. `PROCESSING` calls `reschedule` with the pure backoff result.
3. `CLOSED` calls token-gated `close` and does not reschedule.
4. `ABNORMAL` remains `refunding`, records `WECHAT_REFUND_ABNORMAL`, and schedules 30 minutes.
5. `RESOURCE_NOT_EXISTS` retries `requestRefund` once using the exact original transaction ID, reason, amounts, config, secret, and `outRefundNo`.
6. A second uncertain request preserves `refunding` and reschedules.
7. Invalid signature/field mismatch/timeout reschedules without confirming or closing.
8. A callback that wins first makes boolean finalize return `false` or claimed SUCCESS return
   `null`; service counts either as an idempotent race, not a failure.
9. One row failure does not prevent later claimed rows from running.
10. A fake clock proves the service derives a 120-second deadline from the exact claim time and
    starts no later row/provider call when less than the exported gateway timeout-based 30-second
    worst-row budget remains; untouched claims wait for lease expiry/reclaim.
11. After `RESOURCE_NOT_EXISTS`, less than one gateway timeout plus a 10-second finalize margin
    prevents `requestRefund` and token-reschedules with
    `BILLING_RECHARGE_REFUND_RECONCILE_LEASE_BUDGET_EXHAUSTED` at the actual query-completion time.
12. Advancing-clock tests prove checked time and backoff start at actual row completion, and an
    invalid injected Date fails with a stable error before provider or persistence work.
13. If the first ABNORMAL reschedule throws, the recovery call preserves the exact 30-minute
    schedule, `WECHAT_REFUND_ABNORMAL`, and ABNORMAL metadata instead of generic backoff.

- [ ] **Step 4: Implement the smallest state machine**

Constructor dependencies must be injectable:

```ts
type Dependencies = {
  repository?: RefundReconciliationRepositoryPort;
  secretBundleService?: Pick<typeof wechatPaySecretBundleService, "load">;
  wechatPayGateway?: Pick<
    typeof wechatPayGateway,
    "queryRefundByOutRefundNo" | "requestRefund"
  >;
  nowFactory?: () => Date;
  claimTokenFactory?: () => string;
};
```

`runBatch` validates `limit` in 1..100, claims once, processes rows sequentially to avoid refund API bursts, catches per-row errors, and never changes a terminal row without its claim token. It must load the secret referenced by the exact stored payment config, use `parseAndAssertWechatRefund`, and never trust raw gateway fields.

Derive the lease deadline from the exact claim timestamp. Bind the worst-row and retry budgets to
the gateway's exported default timeout (`2 * timeout + 10s finalize margin` and
`timeout + 10s finalize margin`). Read and validate `nowFactory()` before each row/provider call
and after every provider response; stop the batch before the safety cutoff, and calculate all
checked/metadata/next-at values from the actual row completion time. ABNORMAL persistence recovery
must reuse the exact original token-gated reschedule input.

Use stable metadata keys:

```ts
{
  reconcile_source: "billing_reconcile_worker",
  reconcile_checked_at: now.toISOString(),
  wechat_refund_status: validated.status,
  wechat_request_id: validated.requestId,
}
```

Do not store raw responses, Authorization, signatures, or secrets.

- [ ] **Step 5: Verify Task 5 GREEN**

```bash
cd apps/api
bun test \
  src/services/billing-recharge-refund-reconciliation.test.ts \
  src/services/platform-billing-recharge-refund-execution.test.ts \
  src/services/wechat-pay-callbacks-credit-refund.test.ts
cd ../..
bun run api:check
git diff --check
```

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/api/src/services/billing-recharge-refund-reconciliation.ts \
  apps/api/src/services/billing-recharge-refund-reconciliation.test.ts \
  apps/api/src/services/billing-recharge-refund-reconciliation.test-fixtures.ts \
  apps/api/src/services/wechat-pay-gateway.ts
git commit -m "feat(billing): 实现退款主动对账"
```

Only stage optional files when created or modified.

---

### Task 6: Wire the existing worker and release manifests

**Files:**
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.test.ts`
- Modify: `apps/api/package.json`
- Modify: `deploy/docker-compose.api.yml`
- Modify: `deploy/docker-compose.dev.yml`
- Modify: `.github/workflows/build-docker-images.yml`
- Modify: `.github/workflows/deploy-docker-services.yml`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `apps/api/src/services/release-deployments/legacy/shared.ts`
- Modify: `apps/api/src/services/release-deployments/legacy/candidates.ts`
- Modify: `apps/api/src/services/release-deployments/legacy/dispatch.test.ts`

- [ ] **Step 1: Write failing worker tests**

Inject both child services and assert isolation:

```ts
await tick({ subscriptionService, refundReconciliationService, logger });

expect(subscriptionService.runDueChecks).toHaveBeenCalledWith({ batchSize: 100 });
expect(refundReconciliationService.runBatch).toHaveBeenCalledWith({ limit: 20 });
```

Add one test where subscriptions throw and refunds still run, and one where refunds throw and subscription result is still logged. Keep the existing process-level no-overlap behavior.

Add config tests:

```ts
expect(getWorkerConfig()).toMatchObject({
  enabled: true,
  intervalMs: 60_000,
  batchSize: 100,
  refundBatchSize: 20,
});
```

Clamp `BILLING_REFUND_RECONCILE_BATCH_SIZE` to 1..100.

- [ ] **Step 2: Run worker tests and confirm RED**

```bash
cd apps/api
bun test src/workers/billing-reconcile-worker.test.ts
```

Expected: FAIL because tick has no refund reconciliation dependency/config.

- [ ] **Step 3: Integrate the service without adding business logic**

Worker tick calls the two services independently and logs one combined safe summary. It must not query repositories or inspect refund statuses itself.

Add package script:

```json
"worker:billing-reconcile": "bun src/workers/billing-reconcile-worker.ts"
```

- [ ] **Step 4: Add the existing worker to deployment manifests**

Use service name `billing-reconcile-worker` and container names
`gooes-billing-reconcile-worker` / `gooes-billing-reconcile-worker-dev`. Reuse the API image and run:

```yaml
command: ["bun", "src/workers/billing-reconcile-worker.ts"]
```

Add the service to the same build/deploy allowlists, selection maps, health/runtime evidence checks, and release-service TypeScript union used by `cos-reconcile-worker`. Do not start or deploy it in this task.

- [ ] **Step 5: Verify Task 6 GREEN**

```bash
cd apps/api
bun test \
  src/workers/billing-reconcile-worker.test.ts \
  src/services/release-deployments/legacy/*.test.ts
cd ../..
bun run api:check
git diff --check
```

Also parse both Compose files without starting containers:

```bash
docker compose -f deploy/docker-compose.api.yml config --quiet
docker compose -f deploy/docker-compose.dev.yml config --quiet
```

If Docker is unavailable, use the repository's existing YAML/static workflow tests and record Docker unavailability; do not install a new dependency.

- [ ] **Step 6: Commit Task 6**

```bash
git add apps/api/src/workers/billing-reconcile-worker.ts \
  apps/api/src/workers/billing-reconcile-worker.test.ts \
  apps/api/package.json \
  deploy/docker-compose.api.yml deploy/docker-compose.dev.yml \
  .github/workflows/build-docker-images.yml \
  .github/workflows/deploy-docker-services.yml \
  .github/workflows/deploy-dev.yml \
  apps/api/src/services/release-deployments/legacy
git commit -m "feat(billing): 接入退款对账任务"
```

---

## Integration Gate Before Task 7

After Task 6 passes implementer, spec, and code-quality review:

1. Return to the outer release plan and replay the exact 36 recharge payment-expiration commits
   from `309bc1868b8673c8e74846f614efd5f6ce27d138..d4f30272` in source order.
2. Resolve overlaps manually. In particular, preserve every gateway method
   (`createJsapiPrepay`, `closeTransactionByOutTradeNo`,
   `queryTransactionByOutTradeNo`, `requestRefund`, `queryRefundByOutRefundNo`) and the new
   verified-response wrapper; do not resolve the gateway wholesale with `ours` or `theirs`.
3. Verify non-overlapping source-owned files are patch-equivalent. For overlapping files, record
   a method-level comparison proving the original behavior and the reconciliation hardening are
   both present. Then run the expanded release path-boundary check covering both the original
   36-commit path union and this approved reconciliation plan's files.
4. Dispatch a fresh pre-migration reviewer over `90e75b37..HEAD`; fix all Critical and Important
   findings and rerun changed tests plus `bun run api:check`.
5. Confirm local migration files now include `20260718110000`, `20260718121000`,
   `20260718122000`, `20260718122500`, and `20260718123000`. Only then start Task 7.

Do not push, merge, deploy, or apply `20260718124000` during this gate.

---

### Task 7: Apply the migration to authorized dev and run release-grade verification

**Files:**
- Modify after generation: `apps/api/src/types/database.ts`
- Create: `apps/api/src/scripts/tenant-credit-refund-reconciliation-smoke.ts`
- Create: `docs/verification/2026-07-18-tenant-credit-refund-reconciliation.md`

- [ ] **Step 1: Prove the exact remote target and pending migration**

Load only the authorized repository environment:

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected before apply, after the integration gate: existing authorized dev migrations align; only
`20260718124000_harden_tenant_credit_refund_reconciliation.sql` is local-only. If any other local-only migration appears, stop and report BLOCKED without applying anything.

- [ ] **Step 2: Dry-run and apply only the migration**

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: dry-run lists only `20260718124000`; apply exits zero; Local/Remote align through `20260718124000`. Do not run SQL manually and do not use migration repair.

- [ ] **Step 3: Generate types from the same dev database**

```bash
supabase gen types typescript \
  --db-url "$SUPABASE_DB_DIRECT_URL" \
  --schema public > /tmp/gooes-database.ts
```

Inspect the generated diff before replacing the tracked file. It must include the six reconciliation
columns, the claim RPC's explicit nine-field table result, and all seven refund/reconciliation RPC
contracts without unrelated schema loss. Then use `apply_patch` or the repository's accepted
generation command to update `apps/api/src/types/database.ts`; do not hand-invent Supabase
function types. If the installed CLI cannot generate from `--db-url`, preserve the existing type
file, record the exact command/error, and keep untyped repository boundaries already used by this
project.

- [ ] **Step 4: Implement and run focused database smoke without real refund**

Create `tenant-credit-refund-reconciliation-smoke.ts` using the already installed `Bun.SQL`
API. It must require `SUPABASE_DB_DIRECT_URL`, never print the URL, and perform these exact checks:

1. query `pg_indexes` for `tenant_credit_refund_reconcile_due_idx` and `pg_constraint` for
   `tenant_credit_refund_reconcile_attempt_count_check` plus
   `tenant_credit_refund_reconcile_lease_check` plus
   `tenant_credit_refund_reconcile_last_error_check`; use `pg_get_constraintdef` to require the
   last-error definition to enforce a maximum of 200 characters;
2. call `has_function_privilege` for both `anon` and `authenticated` against all seven exact
   signatures from Task 3, requiring every result to be `false`;
3. query for historical `status='refunding' AND reconcile_next_at IS NULL` requests and require
   zero rows; also join active requests to orders and require zero stale mirrors where
   `refund_status IS NULL OR refund_status='approved'`. This is read-only evidence that the
   migration backfill and conservative mirror repair ran; never rewrite other mirror states;
4. open a `Bun.SQL.begin` transaction, call claim with `p_limit=101`, and require the stable
   `BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID` database error; the thrown error must force
   rollback;
5. open a second `Bun.SQL.begin` transaction, claim one row with `p_now` equal to
   `1970-01-01T00:00:00.000Z`, `p_lease_seconds=120`, and a fresh UUID; require an empty result,
   then throw/catch a private sentinel so the transaction is proven rolled back.

Run:

```bash
cd apps/api
bun src/scripts/tenant-credit-refund-reconciliation-smoke.ts
cd ../..
```

Expected output is a secret-free JSON summary with `objects=true`, `privileges=true`,
`historical_backfill=true`, `safe_mirror_repair=true`, `invalid_limit=true`, `empty_claim=true`,
and `rolled_back=true`. Do not create a refund, call WeChat, alter a business row, or commit
transaction data.

- [ ] **Step 5: Run all changed API tests from the clean release base**

```bash
cd apps/api
git -C ../.. diff --name-only 309bc1868b8673c8e74846f614efd5f6ce27d138...HEAD \
  | rg '^apps/api/.+\.test\.ts$' \
  | sed 's#^apps/api/##' \
  | xargs bun test
cd ../..
```

Expected: zero failures.

- [ ] **Step 6: Run stable suites and repository gates**

```bash
bun run test
bun run api:check
git diff --check 309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD
```

Expected: stable suites pass, API typecheck/build/file-size pass, and diff-check is empty.

- [ ] **Step 7: Write verification evidence and commit**

The verification document must record:

- release branch/HEAD and Bun version;
- exact migration list before/dry-run/after;
- remote dev identity evidence without secrets;
- generated-type outcome;
- focused/changed/stable test counts;
- API check and diff-check results;
- no real refund, no orange change, no push/merge/deploy.

Commit:

```bash
git add apps/api/src/types/database.ts \
  apps/api/src/scripts/tenant-credit-refund-reconciliation-smoke.ts \
  docs/verification/2026-07-18-tenant-credit-refund-reconciliation.md
git commit -m "docs(billing): 记录退款对账验收"
git status --short
```

Expected final status: empty. If generated types are unchanged or generation is unavailable,
stage only the verification document and state that fact in the commit body.

---

## Final Task-Series Review

After Task 7 passes its own spec and code-quality reviews:

1. Dispatch a fresh final reviewer over `90e75b37..HEAD` against the approved design.
2. Require no unresolved Critical or Important issues.
3. Re-run the exact changed-test command, `bun run test`, `bun run api:check`, migration list, `git diff --check`, and clean-status check from fresh output.
4. Confirm both the replayed payment-expiration source and the refund reconciliation design are
   represented in the final path-boundary/equivalence evidence. Do not push, merge, open a PR, or
   deploy.
