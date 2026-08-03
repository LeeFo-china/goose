# Virtual Payment Fulfillment and Refunds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微信支付确认、自动发放、FEFO 消费、过期、发货通知和退款冲正接到通用订单与权益账本，并保证重放、并发和未知结果安全。

**Architecture:** 数据库 RPC 在一个事务中确认支付和发放权益；微信 `notify_provide_goods` 是提交后的独立可重试动作，绝不重复发放。消耗、到期和退款锁定均由账户/批次行锁完成；退款先进入 `refund_pending` 阻止消费，微信结果明确后再冲正或恢复，未知结果进入异常审计。

**Tech Stack:** Bun、TypeScript、Fastify、Supabase/PostgreSQL、现有微信虚拟支付 Gateway、现有 reconcile worker

---

**Prerequisite:** 完成目录渠道及订单账本计划。本计划开始前不得把现有年度品牌权益回调切走；通用函数和 Service 验证通过后再由最终切换计划启用。

## File structure

- Create `supabase/migrations/20260803120000_create_virtual_entitlement_fulfillment_and_refunds.sql`: 支付确认、发放、消费、过期、退款锁定与冲正 RPC。
- Create `apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts`: SQL 合同。
- Create `apps/api/src/repositories/virtual-entitlement-commands.ts`: 受控 RPC gateway。
- Create `apps/api/src/services/virtual-entitlement-fulfillment.ts`: 支付确认和自动发放。
- Create `apps/api/src/services/virtual-entitlement-consumption.ts`: FEFO 消费与余额不足映射。
- Create `apps/api/src/services/virtual-entitlement-expiry.ts`: 到期批处理。
- Create `apps/api/src/services/virtual-product-refunds.ts`: 退款资格、提交和冲正。
- Modify `apps/api/src/services/wechat-virtual-payment-notifications.ts`: 通用订单分派。
- Modify `apps/api/src/services/wechat-virtual-payment-refund-channel.ts`: 通用退款上下文。
- Modify `apps/api/src/workers/billing-reconcile-worker.ts`: 发货通知、到期和退款恢复任务。
- Modify `apps/api/src/controllers/tenant-virtual-products/index.ts`: 内部消费 API（仅由获权业务模块使用）。
- Modify `apps/api/src/controllers/platform-virtual-products/index.ts`: 重试履约、退款和异常列表。

### Task 1: Create atomic grant, consume, expiry, and refund RPCs

**Files:**
- Create: `supabase/migrations/20260803120000_create_virtual_entitlement_fulfillment_and_refunds.sql`
- Test: `apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts`

- [ ] **Step 1: Write the failing SQL contract**

```ts
for (const fn of [
  'confirm_and_fulfill_virtual_product_order',
  'consume_virtual_entitlement',
  'expire_virtual_entitlement_lots',
  'begin_virtual_product_refund',
  'finish_virtual_product_refund',
]) expect(sql).toContain(`function public.${fn}`);
expect(sql).toContain('for update');
expect(sql).toContain('expires_at asc nulls last');
expect(sql).toContain("state = 'refund_pending'");
expect(sql).toContain("operation = 'refund_reverse'");
expect(sql).toContain("message = 'virtual_entitlement_insufficient_balance'");
expect(sql).toContain('to service_role');
expect(sql).not.toContain('to authenticated');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement payment confirmation and exactly-once grant**

`confirm_and_fulfill_virtual_product_order` must:

```sql
SELECT * INTO v_order
FROM public.tenant_virtual_product_orders
WHERE id = p_order_id
FOR UPDATE;

IF v_order.payment_status = 'paid' AND v_order.fulfillment_status = 'fulfilled' THEN
  RETURN jsonb_build_object('order', to_jsonb(v_order), 'already_processed', true);
END IF;

IF v_order.amount_fen IS DISTINCT FROM p_paid_amount_fen
   OR v_order.offer_id IS DISTINCT FROM p_offer_id
   OR v_order.provider_product_id IS DISTINCT FROM p_provider_product_id THEN
  RAISE EXCEPTION USING MESSAGE = 'virtual_order_payment_mismatch';
END IF;
```

It must enforce unique provider order and transaction IDs, set paid/processing, lock or insert the tenant account, and insert one lot plus one `grant` ledger row using idempotency key `grant:<order_id>`. For duration, compute `base = greatest(now(), account.current_expires_at)` and add the frozen duration. For consumables, add frozen `grant_amount` and calculate fixed expiry from fulfillment time or NULL for permanent. Only after all inserts succeed set `fulfillment_status='fulfilled'` and commit.

- [ ] **Step 4: Implement FEFO consumption and expiry**

`consume_virtual_entitlement` selects active, unexpired lots for one locked account:

```sql
SELECT lot.*
FROM public.tenant_virtual_entitlement_lots AS lot
WHERE lot.account_id = v_account.id
  AND lot.state = 'active'
  AND lot.remaining_amount > 0
  AND (lot.expires_at IS NULL OR lot.expires_at > p_occurred_at)
ORDER BY lot.expires_at ASC NULLS LAST, lot.created_at ASC, lot.id ASC
FOR UPDATE;
```

It calculates total availability before any update; insufficient balance raises `virtual_entitlement_insufficient_balance` and writes nothing. It may span lots, updates each remaining amount/state, and appends one `consume` row per affected lot using `<idempotency_key>:<lot_id>`. `refund_pending` is excluded by the state predicate.

`expire_virtual_entitlement_lots(p_limit integer)` must cap `p_limit` at 100, use `FOR UPDATE SKIP LOCKED`, append a negative `expire` row for remaining consumable quantity, mark lots expired, and update account balance in the same transaction.

- [ ] **Step 5: Implement refund lock and terminal transition**

`begin_virtual_product_refund` locks order and lot. Duration is eligible only before a lot exists. Consumables require `state='active'`, `remaining_amount=original_amount`, no consume row, and no refund_reverse row; then set `refund_pending`. Partial use raises `virtual_refund_partially_consumed`; every other denial raises `virtual_refund_not_eligible`.

`finish_virtual_product_refund` accepts only `succeeded | rejected | unknown`: succeeded appends one full negative `refund_reverse`, updates account, lot `reversed`, and order `succeeded`; rejected restores lot `active` and order `failed`; unknown leaves lot locked and sets order `exception`.

- [ ] **Step 6: Run migration checks and commit**

Run: `bun test apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts && supabase db reset`

Expected: PASS; migrations apply cleanly.

```bash
git add supabase/migrations/20260803120000_create_virtual_entitlement_fulfillment_and_refunds.sql apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts
git commit -m "feat(payments): add atomic entitlement commands"
```

### Task 2: Wire payment confirmation and provide-goods notification

**Files:**
- Create: `apps/api/src/repositories/virtual-entitlement-commands.ts`
- Test: `apps/api/src/repositories/virtual-entitlement-commands.test.ts`
- Create: `apps/api/src/services/virtual-entitlement-fulfillment.ts`
- Test: `apps/api/src/services/virtual-entitlement-fulfillment.test.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-notifications.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-notifications.test.ts`

- [ ] **Step 1: Write failing replay and separation tests**

```ts
await Promise.all([service.confirm(message), service.confirm(message)]);
expect(commands.confirmAndFulfill).toHaveBeenCalledTimes(2);
expect(commands.createdGrantCount).toBe(1);
expect(gateway.notifyProvideGoods).toHaveBeenCalledTimes(1);

gateway.notifyProvideGoods.mockRejectedValue(channelTimeout);
await expect(service.confirm(message)).resolves.toMatchObject({ fulfillment_status: 'fulfilled', provide_goods_status: 'retry_pending' });
expect(commands.createdGrantCount).toBe(1);
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/repositories/virtual-entitlement-commands.test.ts apps/api/src/services/virtual-entitlement-fulfillment.test.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts`

Expected: FAIL because callback processing still calls the branding-specific confirmation path.

- [ ] **Step 3: Implement generic confirmation dispatch**

After existing signature and message checks, resolve the order by merchant/provider identity. Validate AppID, Offer ID, product ID, amount, and transaction identity before RPC. Call `confirmAndFulfill`; after commit, claim a separate provide-goods notification key and call the already verified `wechatVirtualPaymentGateway.notifyProvideGoods` method.

```ts
const fulfilled = await this.commands.confirmAndFulfill(context);
const delivery = await this.deliveryNotifications.claim({
  orderId: fulfilled.order.id,
  idempotencyKey: `provide_goods:${fulfilled.order.id}`,
});
if (delivery.shouldNotify) await this.notifyProvidedGoods(fulfilled.order, delivery);
return { order: fulfilled.order, provide_goods_status: delivery.status };
```

Map all unexpected failures through `Errors.dbError`; do not use `throw new Error()`. A failed notify only updates delivery notification state and never calls the grant RPC again.

- [ ] **Step 4: Run tests and commit**

Run: `bun test apps/api/src/repositories/virtual-entitlement-commands.test.ts apps/api/src/services/virtual-entitlement-fulfillment.test.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts`

Expected: PASS.

```bash
git add apps/api/src/repositories/virtual-entitlement-commands.ts apps/api/src/repositories/virtual-entitlement-commands.test.ts apps/api/src/services/virtual-entitlement-fulfillment.ts apps/api/src/services/virtual-entitlement-fulfillment.test.ts apps/api/src/services/wechat-virtual-payment-notifications.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts
git commit -m "feat(payments): fulfill generic virtual product orders"
```

### Task 3: Add consumption and expiry services

**Files:**
- Create: `apps/api/src/services/virtual-entitlement-consumption.ts`
- Test: `apps/api/src/services/virtual-entitlement-consumption.test.ts`
- Create: `apps/api/src/services/virtual-entitlement-expiry.ts`
- Test: `apps/api/src/services/virtual-entitlement-expiry.test.ts`
- Modify: `apps/api/src/controllers/tenant-virtual-products/index.ts`
- Test: `apps/api/src/controllers/tenant-virtual-products/routes.test.ts`

- [ ] **Step 1: Write failing FEFO and permission tests**

```ts
expect(await service.consume(auth, { entitlementCode: 'ai.calls', amount: 12, idempotencyKey: KEY, sourceType: 'ai_usage', sourceId: SOURCE_ID }))
  .toMatchObject({ consumed: 12, balance_after: 8 });
expect(commands.consume).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT_ID, amount: 12 }));
await expect(service.consume(otherTenant, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
await expect(service.consume(auth, overdraw)).rejects.toMatchObject({ code: 'VIRTUAL_ENTITLEMENT_INSUFFICIENT_BALANCE' });
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/virtual-entitlement-consumption.test.ts apps/api/src/services/virtual-entitlement-expiry.test.ts apps/api/src/controllers/tenant-virtual-products/routes.test.ts`

Expected: FAIL because consumption and expiry services are absent.

- [ ] **Step 3: Implement an internal service boundary**

```ts
export type ConsumeVirtualEntitlementInput = {
  entitlementCode: string;
  amount: number;
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
};

async consume(auth: AuthContext, input: ConsumeVirtualEntitlementInput) {
  if (!auth.tenantId) throw Errors.forbidden();
  if (!this.allowedSources.has(input.sourceType)) {
    throw Errors.business(400, '不支持的权益消费来源', 'VIRTUAL_ENTITLEMENT_SOURCE_INVALID');
  }
  try {
    return await this.commands.consume({ ...input, tenantId: auth.tenantId, actorEmployeeId: auth.employeeId });
  } catch (error) {
    throw mapEntitlementCommandError(error);
  }
}
```

Do not expose a general-purpose tenant UI endpoint that can arbitrarily debit balances. Register `POST /tenant/virtual-entitlements/:code/consume` only behind an internal service credential/auth decorator already used by internal business modules; if no such decorator exists, omit the HTTP route and export the typed Service method for in-process callers. Record that decision in the route test.

Expiry service calls `expireLots(100)` until fewer than 100 rows are returned, with a 10-batch cap per scheduler tick.

- [ ] **Step 4: Run tests and commit**

Run: `bun test apps/api/src/services/virtual-entitlement-consumption.test.ts apps/api/src/services/virtual-entitlement-expiry.test.ts apps/api/src/controllers/tenant-virtual-products/routes.test.ts`

Expected: PASS.

```bash
git add apps/api/src/services/virtual-entitlement-consumption.ts apps/api/src/services/virtual-entitlement-consumption.test.ts apps/api/src/services/virtual-entitlement-expiry.ts apps/api/src/services/virtual-entitlement-expiry.test.ts apps/api/src/controllers/tenant-virtual-products
git commit -m "feat(api): add virtual entitlement consumption and expiry"
```

### Task 4: Implement refund eligibility, channel submission, and reversal

**Files:**
- Create: `apps/api/src/services/virtual-product-refunds.ts`
- Test: `apps/api/src/services/virtual-product-refunds.test.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-refund-channel.ts`
- Modify: `apps/api/src/services/wechat-virtual-payment-refund-channel.test.ts`
- Modify: `apps/api/src/controllers/platform-virtual-products/index.ts`
- Test: `apps/api/src/controllers/platform-virtual-products/routes.test.ts`

- [ ] **Step 1: Write failing refund matrix tests**

```ts
for (const scenario of [
  ['duration-fulfilled', 'VIRTUAL_REFUND_NOT_ELIGIBLE'],
  ['consumable-unused', null],
  ['consumable-partial', 'VIRTUAL_REFUND_PARTIALLY_CONSUMED'],
  ['consumable-expired', 'VIRTUAL_REFUND_NOT_ELIGIBLE'],
  ['already-reversed', 'VIRTUAL_REFUND_NOT_ELIGIBLE'],
] as const) await expectRefundOutcome(service, scenario[0], scenario[1]);

expect(commands.beginRefund).toHaveBeenCalledBefore(gateway.refundOrder);
expect(commands.finishRefund).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded' }));
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/virtual-product-refunds.test.ts apps/api/src/services/wechat-virtual-payment-refund-channel.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: FAIL because generic refund handling does not exist.

- [ ] **Step 3: Implement safe refund orchestration**

Require `platform.virtual_refund.manage`; call `beginRefund` before any WeChat API. On explicit success call `finishRefund({ refundId, outcome: 'succeeded' })`; on explicit business rejection call `finishRefund({ refundId, outcome: 'rejected' })`; on timeout, malformed response, or ambiguous network result call `finishRefund({ refundId, outcome: 'unknown' })` and return `refund_status='exception'` with request ID. Do not restore the lot on an unknown result.

Add:

```text
POST /platform/virtual-product-orders/:id/refunds
GET /platform/virtual-entitlement-exceptions?page=1&pageSize=20
```

The create body is `{ idempotency_key: UUIDv4, reason: 1..500, evidence_summary: 0..1000 }`; amount, channel order IDs, lot ID, and refund amount are always server-derived.

- [ ] **Step 4: Run tests and commit**

Run: `bun test apps/api/src/services/virtual-product-refunds.test.ts apps/api/src/services/wechat-virtual-payment-refund-channel.test.ts apps/api/src/controllers/platform-virtual-products/routes.test.ts`

Expected: PASS.

```bash
git add apps/api/src/services/virtual-product-refunds.ts apps/api/src/services/virtual-product-refunds.test.ts apps/api/src/services/wechat-virtual-payment-refund-channel.ts apps/api/src/services/wechat-virtual-payment-refund-channel.test.ts apps/api/src/controllers/platform-virtual-products
git commit -m "feat(payments): add safe virtual product refunds"
```

### Task 5: Extend reconciliation without coupling grant and delivery retries

**Files:**
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts`
- Modify: `apps/api/src/services/branding-virtual-payment-reconciliation.ts`
- Modify: `apps/api/src/services/branding-virtual-payment-reconciliation.test.ts`

- [ ] **Step 1: Add failing worker tests**

```ts
expect(run.provideGoodsRetried).toBe(1);
expect(run.fulfillmentRetried).toBe(0);
expect(run.expiredLots).toBe(2);
expect(run.refundExceptionsChecked).toBe(1);
expect(commands.grantCalls).toBe(0);
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts apps/api/src/services/branding-virtual-payment-reconciliation.test.ts`

Expected: FAIL because the worker only knows branding-specific work.

- [ ] **Step 3: Add bounded generic reconciliation phases**

In each worker tick, run in order: paid-but-unfulfilled order claim (limit 20), provide-goods notification retries (limit 20), expiry batches (10 × 100 maximum), and refund exception query/reconcile (limit 20). Each phase catches and records its own `AppError`, increments structured counters, and allows later phases to proceed. Existing branding-specific functions remain compatibility delegates until cutover.

- [ ] **Step 4: Run full phase verification**

Run: `bun test apps/api/src/services/virtual-entitlement-fulfillment-migration.test.ts apps/api/src/repositories/virtual-entitlement-commands.test.ts apps/api/src/services/virtual-entitlement-fulfillment.test.ts apps/api/src/services/virtual-entitlement-consumption.test.ts apps/api/src/services/virtual-entitlement-expiry.test.ts apps/api/src/services/virtual-product-refunds.test.ts apps/api/src/services/wechat-virtual-payment-notifications.test.ts apps/api/src/services/wechat-virtual-payment-refund-channel.test.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/billing-reconcile-worker.ts apps/api/src/workers/billing-reconcile-worker-virtual-payment.test.ts apps/api/src/services/branding-virtual-payment-reconciliation.ts apps/api/src/services/branding-virtual-payment-reconciliation.test.ts
git commit -m "feat(payments): reconcile virtual entitlement delivery"
```

## Phase checkpoint

- [ ] Replay the same callback, transaction, fulfillment retry, provide-goods retry, and refund notification; each changes money/entitlement facts at most once.
- [ ] Run concurrent consumption against two finite lots and prove total remaining never becomes negative and insufficient requests write no partial ledger.
- [ ] Prove expiring lots are unavailable at query/consume time even before the archive worker writes expire rows.
- [ ] Prove `refund_pending` cannot be consumed and unknown refund outcomes remain locked in the exception list.
- [ ] Confirm duration renewal uses `max(now, current_expires_at)` and fulfilled duration orders reject automatic refunds.
- [ ] Confirm worker logs contain stable codes and request IDs but no OpenID, token, AppKey, signature, or raw WeChat body.
