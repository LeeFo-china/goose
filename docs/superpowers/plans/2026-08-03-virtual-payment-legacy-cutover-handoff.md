# Virtual Payment Legacy Cutover and Mini-Program Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在维护窗口将年度品牌权益订单与权益历史增量迁移到通用事实，灰度切换 API/回调/退款，验证一致后冻结旧写入，并向小程序团队交付稳定契约。

**Architecture:** 通过前向 migration 和可重复运行的 cutover 脚本完成 backfill、差异报告和写入口切换，不做长期双写。兼容路由读取通用事实并保留旧 DTO/错误码，观察期内可通过功能开关暂停通用新单并恢复兼容读；历史订单和权益流水永不删除或改写。

**Tech Stack:** Bun、TypeScript、Supabase CLI/PostgreSQL、Fastify、Markdown handoff、现有 smoke/reconciliation 工具

---

**Prerequisite:** 前四个计划的阶段检查点全部通过。`/Users/leefo/Public/work/orange` 仅允许只读检查；本计划不得修改、格式化、提交或推送 Orange 仓库。

## File structure

- Create `supabase/migrations/20260803130000_backfill_branding_virtual_commerce.sql`: 年度订单、权益批次与流水 backfill 及一致性视图。
- Create `supabase/migrations/20260803140000_cutover_generic_virtual_payment_writes.sql`: 撤销旧写权限、兼容函数委托和切换标记。
- Create `apps/api/src/scripts/virtual-product-cutover.ts`: preflight、apply gate、verify 和报告。
- Create `apps/api/src/scripts/virtual-product-cutover.test.ts`: 纯逻辑与命令约束。
- Create `apps/api/src/scripts/virtual-product-smoke.ts`: 新建订单、确认、发放、查账、退款资格 smoke。
- Create `apps/api/src/scripts/virtual-product-smoke.test.ts`: smoke 合同。
- Modify `apps/api/package.json`: 增加 cutover/smoke 命令。
- Modify `apps/api/src/controllers/branding-addon/index.ts`: 旧租户路由只做 DTO 兼容委托。
- Modify `apps/api/src/services/tenant-branding-virtual-orders.ts`: 委托通用订单 Service。
- Modify `apps/api/src/services/branding-virtual-refunds.ts`: 委托通用退款 Service。
- Create `docs/miniprogram/2026-08-03-virtual-product-and-entitlement-handoff.md`: 小程序接入契约和验收清单。
- Create `docs/runbooks/virtual-product-cutover.md`: 发布、观测和前向回退步骤。

### Task 1: Backfill annual orders and entitlement history idempotently

**Files:**
- Create: `supabase/migrations/20260803130000_backfill_branding_virtual_commerce.sql`
- Test: `apps/api/src/scripts/virtual-product-cutover.test.ts`

- [ ] **Step 1: Write the failing migration assertions**

```ts
expect(backfill).toContain('insert into public.tenant_virtual_product_orders');
expect(backfill).toContain('from public.tenant_virtual_addon_orders');
expect(backfill).toContain('on conflict');
expect(backfill).toContain('insert into public.tenant_virtual_entitlement_lots');
expect(backfill).toContain('insert into public.tenant_virtual_entitlement_ledger');
expect(backfill).toContain('create view public.virtual_product_cutover_consistency');
expect(backfill).not.toContain('delete from public.tenant_virtual_addon_orders');
expect(backfill).not.toContain('drop table public.tenant_virtual_addon_orders');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/scripts/virtual-product-cutover.test.ts`

Expected: FAIL because the backfill migration and cutover script are missing.

- [ ] **Step 3: Implement identity-preserving backfill**

Use each legacy order UUID as the generic order UUID. Backfill each legacy virtual order preserving tenant, purchaser, product, amount, merchant/provider identifiers, paid/fulfillment/refund timestamps and states. Freeze the migrated annual rule as duration 1 year with the existing entitlement code. For every fulfilled order, insert one lot keyed by unique `source_order_id` and one grant row keyed by `grant:<legacy-order-id>`; for previously compensated refunds, insert `refund_reverse:<legacy-order-id>` and mark the lot reversed. Use `ON CONFLICT` with equality guards that raise `virtual_cutover_identity_conflict` rather than overwrite a mismatched snapshot.

Create `virtual_product_cutover_consistency` with exact columns:

```sql
SELECT
  (SELECT count(*) FROM public.tenant_virtual_addon_orders) AS legacy_order_count,
  (SELECT count(*) FROM public.tenant_virtual_product_orders WHERE product_code = 'custom_support_branding_annual') AS generic_order_count,
  (SELECT count(*) FROM public.tenant_virtual_addon_orders WHERE fulfillment_status = 'granted') AS legacy_fulfilled_count,
  (SELECT count(*) FROM public.tenant_virtual_entitlement_lots WHERE product_id = v_annual_product_id) AS generic_lot_count,
  legacy_paid_amount_fen,
  generic_paid_amount_fen,
  mismatch_count;
```

Define `v_annual_product_id` and both amount aggregates inside the view query via CTEs so the view has no procedural variable dependency.

- [ ] **Step 4: Apply twice locally and verify idempotency**

Run: `supabase db reset && supabase migration up && supabase migration up`

Expected: both runs complete; the second run creates no duplicate orders, lots, or ledger rows.

Run the consistency view through the local SQL query mechanism.

Expected: order counts, fulfilled/lot counts, and paid sums match; `mismatch_count = 0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803130000_backfill_branding_virtual_commerce.sql apps/api/src/scripts/virtual-product-cutover.test.ts
git commit -m "feat(payments): backfill branding commerce into generic facts"
```

### Task 2: Build a guarded cutover CLI and runbook

**Files:**
- Create: `apps/api/src/scripts/virtual-product-cutover.ts`
- Modify: `apps/api/src/scripts/virtual-product-cutover.test.ts`
- Modify: `apps/api/package.json`
- Create: `docs/runbooks/virtual-product-cutover.md`

- [ ] **Step 1: Add failing CLI safety tests**

```ts
expect(parseArgs(['--mode=preflight'])).toEqual({ mode: 'preflight', apply: false });
expect(() => parseArgs(['--mode=cutover'])).toThrow('需要显式传入 --apply');
expect(() => assertSafeTarget({ hostname: 'db.prod.example', expectedProjectRef: 'dev-ref', actualProjectRef: 'prod-ref' })).toThrow();
expect(report.redacted).toBeTrue();
expect(JSON.stringify(report)).not.toContain('openid');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/scripts/virtual-product-cutover.test.ts`

Expected: FAIL because CLI functions do not exist.

- [ ] **Step 3: Implement preflight, explicit apply, and verify modes**

The CLI accepts only:

```text
--mode=preflight
--mode=cutover --apply
--mode=verify
```

It reads the explicit env file passed by `GOOES_ENV_FILE`, checks expected Supabase project ref, queries migration state and the consistency view, blocks cutover on mismatch, pending legacy payment/fulfillment/refund work, non-terminal goods operations, or invalid production mapping, and prints only counts, stable codes, IDs safe for operations, and timestamps. It never logs OpenID hashes, keys, tokens, signatures, or raw messages.

Add scripts:

```json
"virtual-product:cutover": "bun --env-file=${GOOES_ENV_FILE:-.env} src/scripts/virtual-product-cutover.ts",
"virtual-product:smoke": "bun --env-file=${GOOES_ENV_FILE:-.env} src/scripts/virtual-product-smoke.ts"
```

The runbook must give the exact order: database backup/evidence, `supabase migration list`, preflight, maintenance banner, deploy compatible API, apply migrations, run cutover, verify, deploy Admin, run smoke, remove maintenance banner, observe metrics. Forward rollback is: suspend all active virtual products, disable generic order creation by config flag, keep callback/reconciliation processing active, restore legacy-compatible reads, and apply a corrective migration; never down-migrate or delete ledger facts.

- [ ] **Step 4: Run tests and dry preflight**

Run: `bun test apps/api/src/scripts/virtual-product-cutover.test.ts`

Expected: PASS.

Run: `GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/.env pnpm --dir apps/api virtual-product:cutover -- --mode=preflight`

Expected: exits 0 only when all gates pass; otherwise exits non-zero with a stable blocking code and no mutation.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/virtual-product-cutover.ts apps/api/src/scripts/virtual-product-cutover.test.ts apps/api/package.json docs/runbooks/virtual-product-cutover.md
git commit -m "chore(payments): add guarded virtual product cutover"
```

### Task 3: Switch legacy routes to generic services and freeze old writes

**Files:**
- Create: `supabase/migrations/20260803140000_cutover_generic_virtual_payment_writes.sql`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/services/tenant-branding-virtual-orders.ts`
- Modify: `apps/api/src/services/branding-virtual-refunds.ts`
- Test: `apps/api/src/controllers/branding-addon/routes-virtual-payment.test.ts`
- Test: `apps/api/src/services/tenant-branding-virtual-orders.test.ts`
- Test: `apps/api/src/services/branding-virtual-refunds.test.ts`

- [ ] **Step 1: Write failing delegation and freeze tests**

```ts
expect(legacyOrderService.createOrder).toHaveBeenCalledWith(auth, {
  product_id: ANNUAL_PRODUCT_ID,
  idempotency_key: body.idempotency_key,
  requested_platform: body.requested_platform,
}, OPENID);
expect(cutoverSql).toContain('revoke insert, update, delete on public.tenant_virtual_addon_orders from service_role');
expect(cutoverSql).toContain('revoke insert, update, delete on public.platform_virtual_payment_products from service_role');
expect(cutoverSql).not.toContain('drop table');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/controllers/branding-addon/routes-virtual-payment.test.ts apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/services/branding-virtual-refunds.test.ts`

Expected: FAIL because legacy services still own writes.

- [ ] **Step 3: Implement compatibility delegation**

Legacy create, payment request, list, detail, refund create/list/detail routes keep their response shape but call generic services with the preserved annual product ID. Map new errors to legacy codes only at the compatibility boundary:

```ts
const LEGACY_ERROR_MAP: Record<string, string> = {
  VIRTUAL_PRODUCT_NOT_READY: 'BRANDING_VIRTUAL_PRODUCT_UNAVAILABLE',
  VIRTUAL_ORDER_IDEMPOTENCY_CONFLICT: 'BRANDING_VIRTUAL_ORDER_IDEMPOTENCY_CONFLICT',
  VIRTUAL_REFUND_NOT_ELIGIBLE: 'BRANDING_VIRTUAL_REFUND_NOT_ELIGIBLE',
  VIRTUAL_REFUND_PARTIALLY_CONSUMED: 'BRANDING_VIRTUAL_REFUND_NOT_ELIGIBLE',
};
```

The cutover migration revokes direct old-table writes from service role, replaces remaining old write RPC bodies with calls to generic RPCs, and stores a non-secret `virtual_product_generic_write_enabled=true` system setting through migration-managed seed data. It does not remove tables, functions, indexes, or old read privileges.

- [ ] **Step 4: Run compatibility tests and local migration**

Run: `bun test apps/api/src/controllers/branding-addon/routes-virtual-payment.test.ts apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/services/branding-virtual-refunds.test.ts`

Expected: PASS.

Run: `supabase db reset && supabase migration list`

Expected: all migrations through `20260803140000` apply; local list is aligned with the intended target after approved remote application.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803140000_cutover_generic_virtual_payment_writes.sql apps/api/src/controllers/branding-addon/index.ts apps/api/src/services/tenant-branding-virtual-orders.ts apps/api/src/services/branding-virtual-refunds.ts apps/api/src/controllers/branding-addon/routes-virtual-payment.test.ts apps/api/src/services/tenant-branding-virtual-orders.test.ts apps/api/src/services/branding-virtual-refunds.test.ts
git commit -m "refactor(payments): cut branding writes over to generic commerce"
```

### Task 4: Add end-to-end smoke and observability evidence

**Files:**
- Create: `apps/api/src/scripts/virtual-product-smoke.ts`
- Create: `apps/api/src/scripts/virtual-product-smoke.test.ts`
- Modify: `apps/api/src/services/virtual-entitlement-fulfillment.ts`
- Modify: `apps/api/src/services/virtual-product-refunds.ts`

- [ ] **Step 1: Write failing smoke contract**

```ts
expect(source).toContain('createOrder');
expect(source).toContain('confirmPayment');
expect(source).toContain('assertSingleGrant');
expect(source).toContain('assertTenantBalance');
expect(source).toContain('assertRefundEligibility');
expect(source).toContain('--cleanup-fixture');
expect(source).not.toContain('console.log(message)');
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/scripts/virtual-product-smoke.test.ts`

Expected: FAIL because smoke script does not exist.

- [ ] **Step 3: Implement a fixture-scoped smoke**

The smoke requires explicit fixture tenant, employee, product, and environment IDs; refuses production unless `--allow-production-read-only` is provided; defaults to read-only checks in production; and only creates test orders in local/dev. It verifies create/idempotent replay, payment confirmation replay, one lot/one grant, tenant balance, provide-goods retry separation, refund eligibility matrix, cross-tenant denial, and pagination. `--cleanup-fixture` may remove only rows marked with this smoke run ID in local/dev and must refuse broad or unresolved targets.

Add structured service logs containing `requestId`, order ID, product ID, fulfillment/refund state, retry count, and stable error code. Redaction tests must prove sensitive message fields are absent.

- [ ] **Step 4: Run smoke contract and local smoke**

Run: `bun test apps/api/src/scripts/virtual-product-smoke.test.ts`

Expected: PASS.

Run: `GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/.env pnpm --dir apps/api virtual-product:smoke -- --environment=local --fixture-key=virtual-product-smoke-20260803`

Expected: PASS with one grant and no cross-tenant visibility. The script resolves or creates only rows tagged by the exact local fixture key and refuses the fixture option outside local/dev.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/virtual-product-smoke.ts apps/api/src/scripts/virtual-product-smoke.test.ts apps/api/src/services/virtual-entitlement-fulfillment.ts apps/api/src/services/virtual-product-refunds.ts
git commit -m "test(payments): add generic virtual product smoke"
```

### Task 5: Publish the mini-program handoff without changing Orange

**Files:**
- Create: `docs/miniprogram/2026-08-03-virtual-product-and-entitlement-handoff.md`
- Read-only reference: `/Users/leefo/Public/work/orange`

- [ ] **Step 1: Inspect Orange read-only for existing API consumers**

Run:

```bash
git -C /Users/leefo/Public/work/orange status --short
rg -n "branding/entitlement|virtual-payment|requestVirtualPayment|fulfillment_status" /Users/leefo/Public/work/orange --glob '!node_modules' --glob '!dist'
```

Expected: identify current consumer paths without changing Orange; record its initial `git status` and verify it is unchanged at the end.

- [ ] **Step 2: Write the complete handoff document**

The document must freeze:

- API base URLs by environment without embedding tokens;
- `GET /tenant/virtual-products?page=1&pageSize=20` and filters;
- create order body `{ product_id, idempotency_key, requested_platform }`;
- payment-request path and exact `wx.requestVirtualPayment` payload mapping;
- order detail fields separating `payment_status`, `fulfillment_status`, and `refund_status`;
- entitlement account, lot, and ledger pagination;
- UI state copy: 未支付、支付处理中、发放中、已到账、发放重试中、退款异常；
- idempotency rule: retry network failures with the same key, start a new user purchase with a new UUIDv4;
- the stable new error codes from the design and legacy compatibility mapping;
- `virtual_product.purchase` permission and tenant-owned entitlement semantics;
- security reporting fields allowed on failures: path, HTTP status, stable code, Request-ID, order/product IDs, idempotency reuse flag; never token, OpenID, signature, AppKey, or raw callback.

Include a smoke matrix for Android, HarmonyOS, Windows, and iOS while keeping user price identical. State that annual rights are manual one-time purchases because the mini-program does not currently qualify for automatic renewal.

- [ ] **Step 3: Verify documentation and Orange immutability**

Run:

```bash
rg -n "pageSize=20|virtual_product.purchase|fulfillment_status|Request-ID|Android|HarmonyOS|iOS" docs/miniprogram/2026-08-03-virtual-product-and-entitlement-handoff.md
git -C /Users/leefo/Public/work/orange status --short
```

Expected: all required contract topics appear and Orange status exactly matches Step 1.

- [ ] **Step 4: Commit**

```bash
git add docs/miniprogram/2026-08-03-virtual-product-and-entitlement-handoff.md
git commit -m "docs(miniprogram): hand off virtual product commerce"
```

### Task 6: Final verification and cleanup gate

**Files:**
- Modify only after usage proof: `apps/admin/components/settings/platform-virtual-payment-mapping-card.tsx`
- Modify only after usage proof: `apps/admin/components/settings/platform-virtual-payment-goods-flow.tsx`
- Modify only after usage proof: `apps/admin/components/settings/use-platform-virtual-payment-goods-lifecycle.ts`
- Create after observation period: a separately reviewed future migration for obsolete checks/functions; do not include destructive cleanup in the cutover migrations.

- [ ] **Step 1: Prove no active imports or route consumers remain**

Run:

```bash
rg -n "platform-virtual-payment-mapping-card|platform-virtual-payment-goods-flow|use-platform-virtual-payment-goods-lifecycle" apps/admin
rg -n "/tenant/branding/virtual-payment|/platform/payment/wechat-virtual/branding-entitlement" apps docs --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/**'
```

Expected: only compatibility tests/docs or explicitly retained adapters remain. If runtime imports remain, keep the files and record the consumer; do not delete them.

- [ ] **Step 2: Run repository verification**

Run: `bun test packages/domain/src/virtual-product.test.ts packages/domain/src/permission.test.ts`

Expected: PASS.

Run: `bun run api:check && pnpm --dir apps/admin check && pnpm --dir apps/admin build && bun run check:file-size`

Expected: PASS.

Run: `supabase migration list`

Expected: Local and Remote migration versions align through the approved cutover migration.

- [ ] **Step 3: Verify cutover evidence**

Run: `GOOES_ENV_FILE=/Users/leefo/Public/work/gooes/.env pnpm --dir apps/api virtual-product:cutover -- --mode=verify`

Expected: zero identity, count, amount, lot, or ledger mismatches; no stuck old writes; no duplicate grants; no unknown channel operation hidden as success.

- [ ] **Step 4: Remove only proven-unreferenced Admin files and commit**

If Step 1 reports zero runtime imports for all three files, remove exactly those files with `apply_patch`, rerun Admin check/build, then commit:

```bash
git add apps/admin/components/settings/platform-virtual-payment-mapping-card.tsx apps/admin/components/settings/platform-virtual-payment-goods-flow.tsx apps/admin/components/settings/use-platform-virtual-payment-goods-lifecycle.ts
git commit -m "chore(admin): remove obsolete single-product controls"
```

If any runtime import remains, skip deletion and do not create this commit.

## Release checkpoint

- [ ] Product/catalog, channel, Admin, order/ledger, fulfillment/refund, cutover, and handoff phase evidence is attached.
- [ ] Annual product and all historical order/channel identities are preserved.
- [ ] New and legacy routes return equivalent annual-product business outcomes during the compatibility window.
- [ ] Old tables are read-only, not dropped; no irreversible cleanup ships in the same release.
- [ ] API and Admin checks/builds pass, migrations align, smoke passes, and alerts cover fulfillment retry, provide-goods retry, refund exception, and unknown channel task counts.
- [ ] Orange working tree is unchanged and the mini-program team receives only the handoff document and environment release facts.
