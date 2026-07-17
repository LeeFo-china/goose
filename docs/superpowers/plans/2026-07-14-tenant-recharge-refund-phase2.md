# Tenant Recharge Refund Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe tenant recharge refund-request workflow for the mini-program, then extend it into platform review and real WeChat refund execution without allowing the mini-program to directly move money.

**Architecture:** Phase 2 is split into independently shippable stages. The tenant mini-program only sees backend-derived `refund_action` and can create a refund request; platform Admin reviews and, in a later stage, executes the real WeChat refund with callbacks, audit, idempotency, and tenant credit reversal. Order list reads should stay tenant-scoped and paginated, while refund state is stored in dedicated refund tables and mirrored onto `tenant_credit_orders` for cheap list rendering.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase migrations/RPC, `@gooes/domain` permissions, WeChat Pay gateway services.

---

## Current Facts

- Tenant recharge code lives under `apps/api/src/controllers/billing-recharge/index.ts`, `apps/api/src/services/billing-recharge.ts`, and `apps/api/src/repositories/billing-recharge.ts`.
- Existing tenant endpoints are `GET /billing/recharge-products`, `POST /billing/recharge-orders`, and `GET /billing/recharge-orders/:id`.
- Tenant recharge record list `GET /billing/recharge-orders` has shipped and is verified. See `docs/miniprogram/2026-07-15-tenant-recharge-records-backend-verification.md`.
- Current list response includes conservative refund fields with `refund_action.enabled = false` and `disabled_reason = REFUND_REQUEST_NOT_SUPPORTED`.
- Platform Admin already has `GET /platform/billing/recharge-orders`, but it is cross-tenant and cannot be used by the mini-program.
- `tenant_credit_orders.status` already allows `refunded`, but current migrations do not include `refund_status`, `refund_requested_at`, `refunded_at`, `refund_amount_fen`, refund request records, WeChat refund records, or refund callbacks.
- Real credit consumption is tracked through `tenant_credit_accounts` and `tenant_credit_ledger`; there is no per-order credit-lot consumption model. Refund eligibility must therefore be conservative and review-based.
- `/Users/leefo/Public/work/orange` is read-only for this repository. Backend plans may reference it but must not modify it.

## Stage Overview

| Stage | Scope | Can Ship Independently | External Money Movement |
| --- | --- | --- | --- |
| 2A | Refund policy and API contract lock | Yes | No |
| 2B | Refund request data model and permission | Yes | No |
| 2C | Tenant refund request API and `refund_action` | Yes | No |
| 2D | Platform review and audit workflow | Yes | No |
| 2E | Real WeChat refund execution | Yes, after 2D | Yes |
| 2F | Refund callback, credit reversal, reconciliation | Required for production refund | Yes |

## Policy Decisions To Lock In Stage 2A

- Refund request window: `30` days from `paid_at`.
- Request amount: full `paid_amount_fen`; partial refund is out of scope until platform settlement rules are designed.
- Credit reversal amount: `credits + bonus_credits`.
- Consumption guard for self-service request:
  - If current `available_credits < credits + bonus_credits`, reject request with `BILLING_RECHARGE_CREDITS_CONSUMED`.
  - If current `available_credits >= credits + bonus_credits`, allow request creation, but still require platform review before real refund because the system cannot prove the original credit lot is unconsumed.
- Mini-program must never call a direct refund endpoint.
- Platform Admin must be the only surface that can approve and execute a real refund.
- If a request is rejected, a later request for the same order is allowed only if there is no active request and the order is still inside the refund window.

---

### Task 1: Stage 2A Contract Document

**Files:**
- Create: `docs/decoration-finance/2026-07-15-tenant-recharge-refund-policy.md`

- [ ] **Step 1: Write the refund policy doc**

Include these concrete sections:

```markdown
# 租户积分充值退款申请策略

## 退款边界

小程序只允许提交退款申请，不允许直接触发微信退款。
真实退款只能由平台 Admin 审核后执行。

## 退款窗口

订单 `paid_at` 起 30 天内可申请退款。

## 金额和积分口径

- 退款金额：`tenant_credit_orders.paid_amount_fen`
- 反向积分：`tenant_credit_orders.credits + tenant_credit_orders.bonus_credits`
- 不支持部分退款。

## 自助申请拦截

当 `tenant_credit_account_balances.available_credits < credits + bonus_credits` 时，
后端拒绝创建退款申请并返回 `BILLING_RECHARGE_CREDITS_CONSUMED`。

当可用积分足够时，后端只创建 `pending_review` 申请，不执行资金退款。

## 状态机

`pending_review -> approved -> refunding -> refunded`
`pending_review -> rejected`
`approved -> rejected`
`refunding -> failed`
`failed -> refunding`

## 小程序展示

小程序只消费后端返回的 `refund_action`，不得本地推导退款资格。
```

- [ ] **Step 2: Commit**

```bash
git add docs/decoration-finance/2026-07-15-tenant-recharge-refund-policy.md
git commit -m "docs: define tenant recharge refund policy"
```

---

### Task 2: Stage 2B Refund Request Data Model

**Files:**
- Create: `supabase/migrations/<timestamp>_create_tenant_credit_refund_requests.sql`
- Modify after migration apply: `apps/api/src/types/database.ts`

- [ ] **Step 1: Add migration**

Create a migration with this structure:

```sql
ALTER TABLE public.tenant_credit_orders
  ADD COLUMN IF NOT EXISTS refund_status text NULL,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refund_amount_fen integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_refund_status_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_refund_status_check
      CHECK (
        refund_status IS NULL OR refund_status = ANY (
          ARRAY[
            'pending_review',
            'approved',
            'rejected',
            'refunding',
            'refunded',
            'failed'
          ]::text[]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_refund_amount_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_refund_amount_check
      CHECK (refund_amount_fen IS NULL OR refund_amount_fen >= 0);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tenant_credit_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.tenant_credit_orders(id) ON DELETE CASCADE,
  request_no text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  reason text NOT NULL,
  requested_amount_fen integer NOT NULL,
  requested_credits bigint NOT NULL,
  requested_by_employee_id uuid NULL,
  reviewed_by_employee_id uuid NULL,
  reviewed_at timestamptz NULL,
  review_note text NULL,
  out_refund_no text NULL,
  wechat_refund_id text NULL,
  refund_amount_fen integer NULL,
  refunded_at timestamptz NULL,
  failure_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_refund_requests_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending_review',
        'approved',
        'rejected',
        'refunding',
        'refunded',
        'failed'
      ]::text[]
    )
  ),
  CONSTRAINT tenant_credit_refund_requests_reason_check CHECK (
    length(btrim(reason)) BETWEEN 1 AND 500
  ),
  CONSTRAINT tenant_credit_refund_requests_amount_check CHECK (
    requested_amount_fen > 0
    AND requested_credits > 0
    AND (refund_amount_fen IS NULL OR refund_amount_fen >= 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_refund_requests_idempotency_idx
ON public.tenant_credit_refund_requests(tenant_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_refund_requests_active_order_idx
ON public.tenant_credit_refund_requests(order_id)
WHERE status IN ('pending_review', 'approved', 'refunding');

CREATE INDEX IF NOT EXISTS tenant_credit_refund_requests_tenant_created_idx
ON public.tenant_credit_refund_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_refund_requests_status_created_idx
ON public.tenant_credit_refund_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_orders_tenant_refund_status_created_idx
ON public.tenant_credit_orders(tenant_id, refund_status, created_at DESC)
WHERE refund_status IS NOT NULL;

COMMENT ON TABLE public.tenant_credit_refund_requests
IS '租户积分微信充值退款申请和退款执行记录。';
```

- [ ] **Step 2: Add permission seed migration**

Create a second migration only if permission rows are seeded through migrations in this branch:

```sql
INSERT INTO public.permissions (code, label, module, description)
VALUES (
  'billing.recharge.refund.request',
  '申请积分充值退款',
  'billing',
  '允许租户员工为本租户微信支付积分充值订单提交退款申请'
)
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  module = EXCLUDED.module,
  description = EXCLUDED.description;
```

- [ ] **Step 3: Apply migration locally**

```bash
supabase migration list
supabase db reset
supabase migration list
```

Expected: local migrations include the new migration and `tenant_credit_refund_requests` exists.

- [ ] **Step 4: Regenerate database types**

```bash
supabase gen types typescript --local > apps/api/src/types/database.ts
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations apps/api/src/types/database.ts
git commit -m "feat(db): add tenant recharge refund requests"
```

---

### Task 3: Stage 2B Domain Permission

**Files:**
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: Add permission code**

Add `billing.recharge.refund.request` beside the existing billing recharge permissions:

```ts
'billing.recharge.create',
'billing.recharge.read',
'billing.recharge.refund.request',
```

Add config:

```ts
'billing.recharge.refund.request': {
  label: '申请积分充值退款',
  module: 'billing',
},
```

- [ ] **Step 2: Extend permission test**

Add assertions:

```ts
expect(PERMISSION_CODE_VALUES).toContain("billing.recharge.refund.request");
expect(PermissionCodeConfig["billing.recharge.refund.request"]).toEqual({
  label: "申请积分充值退款",
  module: "billing",
});
```

- [ ] **Step 3: Run domain tests**

```bash
pnpm --filter @gooes/domain test
```

Expected: permission tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/permission.ts packages/domain/src/permission.test.ts
git commit -m "feat(domain): add recharge refund request permission"
```

---

### Task 4: Stage 2C Tenant Refund Request API

**Files:**
- Modify: `apps/api/src/schema/billing-recharge.ts`
- Modify: `apps/api/src/repositories/billing-recharge.ts`
- Modify: `apps/api/src/services/billing-recharge.ts`
- Modify: `apps/api/src/controllers/billing-recharge/index.ts`
- Modify: `apps/api/src/controllers/billing-recharge/routes.test.ts`
- Modify: `apps/api/src/services/billing-recharge.test.ts`

- [ ] **Step 1: Add schemas**

Add query and body schemas:

```ts
export const BillingRechargeRefundRequestSchema = z.object({
  reason: z.string().trim().min(1, "退款原因不能为空").max(500, "退款原因不能超过 500 个字符"),
  idempotency_key: z.uuid("幂等键格式不正确"),
}).strict();

export type BillingRechargeRefundRequestInput =
  z.infer<typeof BillingRechargeRefundRequestSchema>;
```

- [ ] **Step 2: Add repository methods**

Add methods for:

- `findRefundRequestByIdempotencyKey({ tenantId, idempotencyKey })`
- `findActiveRefundRequestByOrderId({ tenantId, orderId })`
- `createRefundRequest(input)`
- `markOrderRefundRequested({ tenantId, orderId, refundStatus, requestedAt })`

Each method must scope by `tenant_id` and wrap Supabase errors with `Errors.dbError`.

- [ ] **Step 3: Add service method**

Add `requestRefund(authContext, orderId, input)` with these checks in order:

1. `assertCanRequestRefund(authContext)` requiring `billing.recharge.refund.request`.
2. Find order by current tenant and ID.
3. Return existing request on matching idempotency key.
4. Reject missing order with `BILLING_RECHARGE_ORDER_NOT_FOUND`.
5. Reject non-`wechat_pay` order with `BILLING_RECHARGE_ORDER_CHANNEL_INVALID`.
6. Reject `status = refunded` with `BILLING_RECHARGE_ORDER_ALREADY_REFUNDED`.
7. Reject `status !== paid` with `BILLING_RECHARGE_ORDER_NOT_PAID`.
8. Reject active request with `BILLING_RECHARGE_REFUND_REQUEST_PENDING`.
9. Reject `paid_at` older than 30 days with `BILLING_RECHARGE_REFUND_WINDOW_EXPIRED`.
10. Reject insufficient available credits with `BILLING_RECHARGE_CREDITS_CONSUMED`.
11. Create `pending_review` request and update order mirror fields.

- [ ] **Step 4: Add controller route**

Add route after `GET /billing/recharge-orders/:id`:

```ts
@Post("/billing/recharge-orders/:id/refund-requests")
async requestRefund(request: FastifyRequest, reply: FastifyReply) {
  const authContext = await this.getBillingAllowedAuthContext(request);
  const paramsResult = BillingRechargeOrderParamSchema.safeParse(request.params || {});
  if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
  const bodyResult = BillingRechargeRefundRequestSchema.safeParse(request.body || {});
  if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

  const data = await billingRechargeService.requestRefund(
    authContext,
    paramsResult.data.id,
    bodyResult.data,
  );
  return ResponseHandler.success(data);
}
```

- [ ] **Step 5: Add route test expectation**

Expected route list should include:

```ts
{ method: "POST", path: "/billing/recharge-orders/:id/refund-requests" },
```

- [ ] **Step 6: Add service tests**

Cover these cases:

- creates a `pending_review` request for paid WeChat order inside the window.
- returns existing request for the same idempotency key.
- rejects unpaid order with `BILLING_RECHARGE_ORDER_NOT_PAID`.
- rejects refunded order with `BILLING_RECHARGE_ORDER_ALREADY_REFUNDED`.
- rejects active request with `BILLING_RECHARGE_REFUND_REQUEST_PENDING`.
- rejects insufficient credits with `BILLING_RECHARGE_CREDITS_CONSUMED`.
- rejects missing `billing.recharge.refund.request` with `FORBIDDEN`.

- [ ] **Step 7: Verify**

```bash
pnpm --filter api test apps/api/src/controllers/billing-recharge/routes.test.ts apps/api/src/services/billing-recharge.test.ts
pnpm --filter api build
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/schema/billing-recharge.ts apps/api/src/repositories/billing-recharge.ts apps/api/src/services/billing-recharge.ts apps/api/src/controllers/billing-recharge/index.ts apps/api/src/controllers/billing-recharge/routes.test.ts apps/api/src/services/billing-recharge.test.ts
git commit -m "feat(api): add tenant recharge refund requests"
```

---

### Task 5: Stage 2C Refund Action On Tenant Order Views

**Files:**
- Modify: `apps/api/src/services/billing-recharge.ts`
- Modify: `apps/api/src/services/billing-recharge.test.ts`

- [ ] **Step 1: Extend order view**

Update `toOrderView` to include:

```ts
product_title: readProductTitle(order.metadata),
refund_status: order.refund_status ?? null,
refund_requested_at: order.refund_requested_at ?? null,
refunded_at: order.refunded_at ?? null,
refund_amount_fen: order.refund_amount_fen ?? null,
refund_action: this.buildRefundAction(order),
```

- [ ] **Step 2: Add metadata reader**

```ts
function readProductTitle(metadata: Record<string, unknown>) {
  const snapshot = metadata.product_snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const title = (snapshot as { title?: unknown }).title;
  return typeof title === "string" && title.trim() ? title : null;
}
```

- [ ] **Step 3: Add refund action builder**

Use these outputs:

- `pending`: `{ enabled: false, label: "不可退款", disabled_reason: "ORDER_NOT_PAID", requires_reason: true }`
- `closed`: `{ enabled: false, label: "不可退款", disabled_reason: "ORDER_CLOSED", requires_reason: true }`
- `refunded`: `{ enabled: false, label: "已退款", disabled_reason: "ORDER_ALREADY_REFUNDED", requires_reason: true }`
- `paid + pending_review/approved/refunding`: `{ enabled: false, label: "退款审核中", disabled_reason: "REFUND_REQUEST_PENDING", requires_reason: true }`
- `paid + refunded`: `{ enabled: false, label: "已退款", disabled_reason: "ORDER_ALREADY_REFUNDED", requires_reason: true }`
- `paid + null/rejected/failed`: `{ enabled: true, label: "申请退款", disabled_reason: null, requires_reason: true }`

- [ ] **Step 4: Add tests**

Assert `product_title` and all major `refund_action` states.

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter api test apps/api/src/services/billing-recharge.test.ts
pnpm --filter api build
git add apps/api/src/services/billing-recharge.ts apps/api/src/services/billing-recharge.test.ts
git commit -m "feat(api): expose recharge refund action"
```

---

### Task 6: Stage 2D Platform Review API

**Files:**
- Create: `apps/api/src/controllers/platform-billing-recharge-refunds/index.ts`
- Create: `apps/api/src/schema/platform-billing-recharge-refunds.ts`
- Create: `apps/api/src/repositories/platform-billing-recharge-refunds.ts`
- Create: `apps/api/src/services/platform-billing-recharge-refunds.ts`
- Add tests beside the new service/controller files.

- [ ] **Step 1: Add platform list and detail**

Implement:

```http
GET /platform/billing/recharge-refund-requests?page=1&pageSize=20&status=pending_review&keyword=TC...
GET /platform/billing/recharge-refund-requests/:id
```

List must paginate, select only needed fields, and support keyword on `request_no`, order `order_no`, `out_trade_no`, and `transaction_id`.

- [ ] **Step 2: Add review actions**

Implement:

```http
POST /platform/billing/recharge-refund-requests/:id/approve
POST /platform/billing/recharge-refund-requests/:id/reject
```

Bodies:

```json
{ "review_note": "同意退款，进入退款执行" }
```

```json
{ "review_note": "积分已消费，不予退款" }
```

- [ ] **Step 3: Add permissions**

Use platform permission codes:

- `platform.billing.recharge_refund.read`
- `platform.billing.recharge_refund.review`

- [ ] **Step 4: Add audit logs**

Write platform audit log entries for approve/reject with:

- `resource_type = tenant_credit_refund_request`
- `resource_id = request.id`
- before/after status
- operator employee ID

- [ ] **Step 5: Verify and commit**

```bash
pnpm --filter api test apps/api/src/services/platform-billing-recharge-refunds.test.ts apps/api/src/controllers/platform-billing-recharge-refunds/routes.test.ts
pnpm --filter api build
git add apps/api/src/controllers/platform-billing-recharge-refunds apps/api/src/schema/platform-billing-recharge-refunds.ts apps/api/src/repositories/platform-billing-recharge-refunds.ts apps/api/src/services/platform-billing-recharge-refunds.ts
git commit -m "feat(api): add platform recharge refund review"
```

---

### Task 7: Stage 2E Real WeChat Refund Execution

**Files:**
- Modify: `apps/api/src/services/wechat-pay-gateway.ts`
- Create: `apps/api/src/services/platform-billing-recharge-refund-execution.ts`
- Modify: `apps/api/src/services/platform-billing-recharge-refunds.ts`
- Add gateway and execution tests.

- [ ] **Step 1: Add gateway method**

Add a method equivalent to:

```ts
requestRefund(input: {
  config: PlatformPaymentConfigRecord;
  secretBundle: WechatPaySecretBundle;
  transactionId: string;
  outRefundNo: string;
  reason: string;
  refundAmountFen: number;
  totalAmountFen: number;
}): Promise<{
  out_refund_no: string;
  refund_id: string | null;
  status: string;
  raw: Record<string, unknown>;
}>;
```

- [ ] **Step 2: Add execution endpoint**

Implement:

```http
POST /platform/billing/recharge-refund-requests/:id/execute
```

Rules:

- only `approved` or `failed` requests can execute.
- require `transaction_id`.
- generate deterministic `out_refund_no` from request number if absent.
- update request and order to `refunding` before calling WeChat.
- save WeChat refund ID/status/raw response.
- keep operation idempotent by `out_refund_no`.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter api test apps/api/src/services/platform-billing-recharge-refund-execution.test.ts
pnpm --filter api build
git add apps/api/src/services/wechat-pay-gateway.ts apps/api/src/services/platform-billing-recharge-refund-execution.ts apps/api/src/services/platform-billing-recharge-refunds.ts
git commit -m "feat(api): execute platform recharge refunds"
```

---

### Task 8: Stage 2F Refund Callback And Credit Reversal

**Files:**
- Create migration for refund RPC and callback notification storage if WeChat refund callbacks are not reusable.
- Modify: `apps/api/src/services/wechat-pay-callbacks.ts`
- Modify: `apps/api/src/repositories/billing-recharge.ts`
- Add tests for callback idempotency and credit reversal.

- [ ] **Step 1: Add RPC for successful refund**

Create `billing_confirm_wechat_recharge_refund` that:

1. locks the refund request and order.
2. verifies request is `refunding`.
3. verifies order is `paid`.
4. locks tenant credit account.
5. requires `available_credits >= credits + bonus_credits`.
6. decrements `balance_credits`.
7. inserts `tenant_credit_ledger` row:
   - `direction = out`
   - `event_type = wechat_recharge_refund`
   - `source_type = tenant_credit_refund_request`
   - `source_id = refund_request.id`
8. updates request to `refunded`.
9. updates order `status = refunded`, `refund_status = refunded`, `refunded_at`, `refund_amount_fen`.

- [ ] **Step 2: Add callback handler**

Handle WeChat refund success/failure callbacks idempotently:

- success calls the RPC.
- failure marks request `failed` and order mirror `refund_status = failed`.
- duplicate notify IDs return success without duplicate ledger.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter api test apps/api/src/services/wechat-pay-callbacks*.test.ts
pnpm --filter api build
supabase migration list
git add supabase/migrations apps/api/src/services/wechat-pay-callbacks.ts apps/api/src/repositories/billing-recharge.ts apps/api/src/services/*test.ts
git commit -m "feat(api): confirm recharge refunds from wechat callbacks"
```

---

### Task 9: Stage 2F Reconciliation, Smoke, And Handoff

**Files:**
- Create: `docs/decoration-finance/2026-07-15-tenant-recharge-refund-smoke.md`
- Create or update backend handoff doc under `docs/miniprogram/`.

- [ ] **Step 1: Add smoke checklist**

Cover:

- tenant can create refund request from paid order.
- unpaid/closed/refunded orders cannot create request.
- duplicate idempotency key returns existing request.
- insufficient credits blocks self-service request.
- platform can approve/reject.
- execute creates or reuses `out_refund_no`.
- callback success creates one reverse ledger row.
- callback duplicate does not create a second ledger row.
- order list shows correct `refund_action`.

- [ ] **Step 2: Add mini-program handoff**

Document:

- `GET /billing/recharge-orders` response fields.
- `POST /billing/recharge-orders/:id/refund-requests` request and response.
- `refund_action` rendering rules.
- no direct refund from mini-program.

- [ ] **Step 3: Final verification**

```bash
pnpm --filter @gooes/domain test
pnpm --filter api test
pnpm --filter api build
supabase migration list
```

- [ ] **Step 4: Commit**

```bash
git add docs/decoration-finance docs/miniprogram
git commit -m "docs: add recharge refund smoke and handoff"
```

---

## Recommended Release Gates

1. Release after Task 5 if the product only needs mini-program refund request creation and status display.
2. Release after Task 6 if platform operators need a review queue but will process actual refunds manually.
3. Release after Task 8 only when finance, settlement, and operations accept the real refund accounting behavior.

## Do Not Implement

- Do not create an endpoint that only sets `tenant_credit_orders.status = refunded`.
- Do not allow the mini-program to trigger WeChat refund execution.
- Do not run DDL/DML manually against remote databases; all schema and seed changes must be migrations.
- Do not modify `/Users/leefo/Public/work/orange` from this repository.
