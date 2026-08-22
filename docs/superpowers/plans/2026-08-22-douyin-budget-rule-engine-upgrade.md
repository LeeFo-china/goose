# Douyin Budget Rule Engine Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Douyin mini-program budget rule engine so common layout and style selections affect the estimate without adding customer-side complexity, and fix the tenant Admin budget-pricing page truncation problem in the same delivery.

**Architecture:** Keep pricing deterministic and configurable. The mini-program submits structured layout/style codes plus optional custom text; API/domain validate the contract; tenant pricing versions store version-level factor maps; the calculator applies those maps after the existing area/base/property/scope calculation and before option additions. Admin edits the factor maps on the pricing version, while the public mini UI stays simple.

**Tech Stack:** Bun, TypeScript, Zod, Fastify, Supabase migrations/RPC, Next.js Admin, shadcn/Radix, Douyin mini-program native TTML/TTSS.

---

## Scope

In scope:

- Add canonical layout/style code domains.
- Keep mini customer inputs simple: area, property condition, tier, scope, layout select/custom, style select/custom, partial-only options.
- Make common layout and style codes affect budget totals.
- Keep custom layout/style text for communication only; custom uses the default coefficient.
- Store layout/style factor maps on pricing versions, not on each base item.
- Add Admin controls for factor maps.
- Fix Admin budget-pricing page truncation/overflow while touching that page.
- Preserve existing estimate snapshots; old estimates are not recalculated.
- Use forward-only migrations and local/direct gates before release.

Out of scope:

- AI price calculation.
- Adding more questions such as kitchen count, bathroom count, house age, floor, elevator, demolition strength.
- Recomputing historical estimates.
- Hardcoding tenant-specific prices in mini or API code.

## Canonical factor values

Layout codes:

```ts
export const DOUYIN_BUDGET_LAYOUT_CODE_VALUES = [
  "one_bedroom_one_living",
  "two_bedroom_one_living",
  "two_bedroom_two_living",
  "three_bedroom_one_living",
  "three_bedroom_two_living",
  "four_bedroom_two_living",
  "villa_duplex",
  "custom",
] as const;
```

Style codes:

```ts
export const DOUYIN_BUDGET_STYLE_CODE_VALUES = [
  "modern_simple",
  "cream",
  "new_chinese",
  "nordic",
  "light_luxury",
  "natural_wood",
  "american",
  "french",
  "wabi_sabi",
  "custom",
] as const;
```

Default coefficients, in basis points:

```ts
export const DEFAULT_LAYOUT_COEFFICIENTS_BPS = {
  one_bedroom_one_living: 10_000,
  two_bedroom_one_living: 10_000,
  two_bedroom_two_living: 10_100,
  three_bedroom_one_living: 10_150,
  three_bedroom_two_living: 10_200,
  four_bedroom_two_living: 10_350,
  villa_duplex: 10_800,
  custom: 10_000,
} as const;

export const DEFAULT_STYLE_COEFFICIENTS_BPS = {
  modern_simple: 10_000,
  cream: 10_300,
  new_chinese: 10_800,
  nordic: 10_200,
  light_luxury: 10_700,
  natural_wood: 10_300,
  american: 10_600,
  french: 10_800,
  wabi_sabi: 10_700,
  custom: 10_000,
} as const;
```

Formula:

```text
base subtotal =
  area
  × base unit price range
  × property_condition coefficient
  × decoration_scope coefficient
  × layout coefficient
  × style coefficient

total = base subtotal + option subtotals
```

Round only at the public result boundary, keeping current integer-fen internal behavior.

## Files

Domain:

- Modify: `packages/domain/src/douyin-budget.ts`
- Modify: `packages/domain/src/douyin-budget.test.ts`
- Modify: `packages/domain/src/shared.ts`

API:

- Modify: `apps/api/src/services/douyin-budget/pricing-rules.ts`
- Modify: `apps/api/src/services/douyin-budget/pricing-rules.test.ts`
- Modify: `apps/api/src/schema/tenant-douyin-budget.ts`
- Modify: `apps/api/src/schema/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/repositories/tenant-douyin-budget.ts`
- Modify: `apps/api/src/repositories/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-budget.ts`
- Modify: `apps/api/src/services/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-budget/index.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-budget/routes.test.ts`
- Modify generated after local migration: `apps/api/src/types/database.ts`

Database:

- Create: `supabase/migrations/20260822180000_add_douyin_budget_pricing_factors.sql`
- Create or modify tests near existing migration contracts, expected location:
  `apps/api/src/repositories/tenant-douyin-budget-migration-contract.test.ts`

Admin:

- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-contract.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-logic.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-logic.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing.tsx`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing.test.ts`

Mini:

- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/budget/index.ts`
- Modify: `apps/douyin-mini/src/pages/budget/index.test.ts`

## Task 1: Domain and mini request contract

**Files:**

- Modify: `packages/domain/src/douyin-budget.ts`
- Modify: `packages/domain/src/douyin-budget.test.ts`
- Modify: `packages/domain/src/shared.ts`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.test.ts`

- [ ] **Step 1: Write failing domain tests**

Add a test that proves the estimate request accepts structured codes and keeps custom text optional:

```ts
expect(DouyinBudgetEstimateRequestSchema.parse({
  area: 100,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  layout_code: "three_bedroom_two_living",
  layout: "三室两厅",
  style_code: "modern_simple",
  style: "现代简约",
  option_codes: [],
})).toMatchObject({
  layout_code: "three_bedroom_two_living",
  style_code: "modern_simple",
});

expect(DouyinBudgetEstimateRequestSchema.safeParse({
  area: 100,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  layout_code: "unknown",
  style_code: "modern_simple",
  option_codes: [],
}).success).toBe(false);
```

- [ ] **Step 2: Run domain RED**

Run:

```bash
bun test packages/domain/src/douyin-budget.test.ts
```

Expected: FAIL because `layout_code` and `style_code` are not exported/accepted.

- [ ] **Step 3: Implement domain constants and schema**

Add `DOUYIN_BUDGET_LAYOUT_CODE_VALUES`, `DOUYIN_BUDGET_STYLE_CODE_VALUES`, labels, and optional `layout_code` / `style_code` fields. Keep old `layout` / `style` fields for compatibility and communication text.

- [ ] **Step 4: Write mini form RED**

In `apps/douyin-mini/src/pages/budget/form-model.test.ts`, assert that selecting “三室两厅” and “现代简约” submits:

```ts
expect(buildEstimateRequest({
  ...form,
  layout: "三室两厅",
  style: "现代简约",
})).toMatchObject({
  layout_code: "three_bedroom_two_living",
  layout: "三室两厅",
  style_code: "modern_simple",
  style: "现代简约",
});

expect(buildEstimateRequest({
  ...form,
  layout: "loft 自定义",
  style: "混搭自定义",
})).toMatchObject({
  layout_code: "custom",
  layout: "loft 自定义",
  style_code: "custom",
  style: "混搭自定义",
});
```

- [ ] **Step 5: Implement mini mapping**

Change `BUDGET_LAYOUT_CHOICES` and `BUDGET_STYLE_CHOICES` to carry `{ code, value, label, custom }`. `buildEstimateRequest()` must map known choices to codes and custom text to `custom`.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun test packages/domain/src/douyin-budget.test.ts
bun --cwd packages/domain run build
bun test apps/douyin-mini/src/pages/budget/form-model.test.ts
```

Commit:

```bash
git add packages/domain/src/douyin-budget.ts packages/domain/src/douyin-budget.test.ts packages/domain/src/shared.ts apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/pages/budget/form-model.ts apps/douyin-mini/src/pages/budget/form-model.test.ts
git commit -m "feat(douyin): 增加预算户型风格因子合同"
```

## Task 2: Database pricing factor persistence

**Files:**

- Create: `supabase/migrations/20260822180000_add_douyin_budget_pricing_factors.sql`
- Modify: migration contract tests for tenant Douyin budget pricing
- Modify generated after local apply: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write failing migration contract**

Assert that the migration:

- Adds `factor_payload jsonb NOT NULL` to `douyin_budget_pricing_versions`.
- Backfills existing rows to default layout/style coefficient maps.
- Validates exact keys for layout/style maps.
- Requires integer coefficients between `1` and `100000`.
- Updates `douyin_budget_pricing_version_payload()` to include `factor_payload`.
- Updates create/replace/update command functions so draft versions always have valid factors.
- Keeps service_role table writes revoked and command ACLs unchanged.

Run:

```bash
bun test apps/api/src/repositories/tenant-douyin-budget-migration-contract.test.ts
```

Expected: FAIL because `20260822180000_add_douyin_budget_pricing_factors.sql` does not exist.

- [ ] **Step 2: Implement forward migration**

Use a forward-only migration:

```sql
ALTER TABLE public.douyin_budget_pricing_versions
ADD COLUMN IF NOT EXISTS factor_payload jsonb;

UPDATE public.douyin_budget_pricing_versions
SET factor_payload = jsonb_build_object(
  'layout_coefficients_bps', jsonb_build_object(
    'one_bedroom_one_living', 10000,
    'two_bedroom_one_living', 10000,
    'two_bedroom_two_living', 10100,
    'three_bedroom_one_living', 10150,
    'three_bedroom_two_living', 10200,
    'four_bedroom_two_living', 10350,
    'villa_duplex', 10800,
    'custom', 10000
  ),
  'style_coefficients_bps', jsonb_build_object(
    'modern_simple', 10000,
    'cream', 10300,
    'new_chinese', 10800,
    'nordic', 10200,
    'light_luxury', 10700,
    'natural_wood', 10300,
    'american', 10600,
    'french', 10800,
    'wabi_sabi', 10700,
    'custom', 10000
  )
)
WHERE factor_payload IS NULL;

ALTER TABLE public.douyin_budget_pricing_versions
ALTER COLUMN factor_payload SET NOT NULL;
```

Then add a validator function and exact `CHECK` constraint. If an existing protection trigger blocks column updates, update only the relevant trigger/function in this forward migration.

- [ ] **Step 3: Add factor update command**

Add a service-role-only function:

```sql
public.update_douyin_budget_pricing_factors(
  p_tenant_id uuid,
  p_pricing_version_id uuid,
  p_expected_updated_at timestamptz,
  p_factor_payload jsonb
) returns jsonb
```

Rules:

- Scoped by tenant.
- Draft only.
- Optimistic lock on `updated_at`.
- Exact JSON validation.
- Returns the same pricing version payload envelope as other pricing commands.
- No raw DB errors.

- [ ] **Step 4: Local migration gates**

Run:

```bash
supabase db push --local --dry-run
supabase db push --local
supabase migration list --local
supabase gen types typescript --local > /tmp/gooes-database.ts
```

Expected:

- Dry-run lists only `20260822180000`.
- Apply succeeds.
- Local/Remote columns align through `20260822180000`.
- Generated types include `factor_payload` and the new RPC.

- [ ] **Step 5: Real DB truth**

Use local 127.0.0.1 only:

- Create draft, verify default factors exist.
- Update factors with exact token, verify `updated_at` advances.
- Old token returns stable `STALE`.
- Invalid factor key returns stable `INVALID`.
- Active version factor update returns stable conflict.
- Direct service_role table UPDATE remains rejected.

- [ ] **Step 6: Commit**

Run:

```bash
bun test apps/api/src/repositories/tenant-douyin-budget-migration-contract.test.ts
bun run api:typecheck
git diff --check
```

Commit:

```bash
git add supabase/migrations/20260822180000_add_douyin_budget_pricing_factors.sql apps/api/src/types/database.ts apps/api/src/repositories/tenant-douyin-budget-migration-contract.test.ts
git commit -m "feat(douyin): 增加预算报价系数配置"
```

## Task 3: API calculator and tenant pricing endpoints

**Files:**

- Modify: `apps/api/src/services/douyin-budget/pricing-rules.ts`
- Modify: `apps/api/src/services/douyin-budget/pricing-rules.test.ts`
- Modify: `apps/api/src/schema/tenant-douyin-budget.ts`
- Modify: `apps/api/src/schema/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/repositories/tenant-douyin-budget.ts`
- Modify: `apps/api/src/repositories/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-budget.ts`
- Modify: `apps/api/src/services/tenant-douyin-budget.test.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-budget/index.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-budget/routes.test.ts`

- [ ] **Step 1: Write calculator RED**

Add a test in `pricing-rules.test.ts`:

```ts
const base = calculateDouyinBudgetEstimate({
  request: {
    area: 100,
    property_condition: "rough",
    decoration_tier: "comfortable",
    decoration_scope: "whole_house",
    layout_code: "modern_simple" as never,
    style_code: "modern_simple",
    option_codes: [],
  },
  pricing,
});
const villa = calculateDouyinBudgetEstimate({
  request: { ...baseRequest, layout_code: "villa_duplex" },
  pricing,
});
expect(villa.minimum_total).toBeGreaterThan(base.minimum_total);
```

Use the correct function names from the file before writing the test. The assertion must prove same area/tier/scope changes when layout/style codes change.

- [ ] **Step 2: Implement factor parsing and formula**

Update pricing normalization so `DouyinBudgetPricingRules` includes:

```ts
factorPayload: {
  layoutCoefficientsBps: Record<DouyinBudgetLayoutCode, number>;
  styleCoefficientsBps: Record<DouyinBudgetStyleCode, number>;
}
```

Apply both coefficients in the existing base subtotal path. Do not apply factors to fixed option items.

- [ ] **Step 3: Update calculation basis**

Add basis lines such as:

```text
户型复杂度：三室两厅 ×1.02
风格复杂度：现代简约 ×1.00
```

Custom values should say:

```text
自定义户型用于量房沟通，预算按基础复杂度计算
自定义风格用于方案沟通，预算按基础复杂度计算
```

- [ ] **Step 4: Add tenant factor endpoint**

Add or extend a route under:

```text
/tenant/douyin-miniapp/budget/pricing-versions/:id/factors
```

Payload:

```ts
{
  expected_updated_at: string;
  factor_payload: {
    layout_coefficients_bps: Record<DouyinBudgetLayoutCode, number>;
    style_coefficients_bps: Record<DouyinBudgetStyleCode, number>;
  };
}
```

Controller validates HTTP only; service checks tenant manage permission; repository calls `update_douyin_budget_pricing_factors`.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test apps/api/src/services/douyin-budget/pricing-rules.test.ts
bun test apps/api/src/schema/tenant-douyin-budget.test.ts apps/api/src/repositories/tenant-douyin-budget.test.ts apps/api/src/services/tenant-douyin-budget.test.ts apps/api/src/controllers/tenant-douyin-budget/routes.test.ts
bun run api:check
git diff --check
```

Commit:

```bash
git add apps/api/src/services/douyin-budget/pricing-rules.ts apps/api/src/services/douyin-budget/pricing-rules.test.ts apps/api/src/schema/tenant-douyin-budget.ts apps/api/src/schema/tenant-douyin-budget.test.ts apps/api/src/repositories/tenant-douyin-budget.ts apps/api/src/repositories/tenant-douyin-budget.test.ts apps/api/src/services/tenant-douyin-budget.ts apps/api/src/services/tenant-douyin-budget.test.ts apps/api/src/controllers/tenant-douyin-budget/index.ts apps/api/src/controllers/tenant-douyin-budget/routes.test.ts
git commit -m "feat(douyin): 应用户型风格预算系数"
```

## Task 4: Admin factor editor and page truncation fix

**Files:**

- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-contract.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-logic.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing-logic.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing.tsx`
- Modify: `apps/admin/components/douyin-miniapp/budget-pricing.test.ts`

- [ ] **Step 1: Write Admin contract RED**

Add tests proving:

- `BudgetPricingVersion` contains `factor_payload`.
- Factor editor displays all layout and style factors.
- Factors are edited as percentages but saved as basis points.
- Custom layout/style default factors exist and are editable.
- Save factors uses `/factors`.
- Page container does not clip bottom content or sticky actions.

The truncation test should assert the component contains a scroll-safe shell:

```ts
expect(source).toContain("min-h-0");
expect(source).toContain("pb-24");
expect(source).toContain("overflow-y-auto");
```

If the actual root layout uses a different existing pattern, adjust the exact strings to that pattern before implementing.

- [ ] **Step 2: Implement factor normalization**

In `budget-pricing-logic.ts`, add:

```ts
export function coefficientBpsToPercentInput(value: number): string
export function percentInputToCoefficientBps(value: string): { ok: true; value: number } | { ok: false; message: string }
export function buildPricingFactorsPayload(expectedUpdatedAt: string, factorPayload: BudgetPricingFactorPayload)
```

Rules:

- `10000` displays as `100`.
- `10300` displays as `103`.
- Allow two decimal places.
- Save range `1..100000` bps.
- Keep exact required keys.

- [ ] **Step 3: Implement Admin UI**

Add two fieldsets:

- `户型复杂度系数`
- `风格复杂度系数`

Use compact rows, no nested card grid. Keep the existing page under 500 lines. If `budget-pricing.tsx` approaches 500 lines, extract a single component:

```text
apps/admin/components/douyin-miniapp/budget-pricing-factors.tsx
```

This component only renders factor fields and field errors.

- [ ] **Step 4: Fix truncation**

Fix the budget-pricing page layout so long content can scroll and bottom actions are not hidden:

- Add `min-h-0` to grid/flex parents that need child scrolling.
- Add bottom padding such as `pb-24` to the main content area.
- Avoid fixed-height cards unless they have internal `overflow-y-auto`.
- Keep action buttons reachable at 1280×720 and 390×844 viewport equivalents.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test apps/admin/components/douyin-miniapp/budget-pricing.test.ts apps/admin/components/douyin-miniapp/budget-pricing-logic.test.ts
bun run admin:check
node .agents/skills/impeccable/scripts/detect.mjs --json apps/admin/components/douyin-miniapp/budget-pricing.tsx
git diff --check
```

Commit:

```bash
git add apps/admin/components/douyin-miniapp/budget-pricing-contract.ts apps/admin/components/douyin-miniapp/budget-pricing-logic.ts apps/admin/components/douyin-miniapp/budget-pricing-logic.test.ts apps/admin/components/douyin-miniapp/budget-pricing.tsx apps/admin/components/douyin-miniapp/budget-pricing.test.ts
git commit -m "feat(admin): 配置预算户型风格系数"
```

## Task 5: Mini UI wiring

**Files:**

- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/budget/form-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/budget/index.ts`
- Modify: `apps/douyin-mini/src/pages/budget/index.test.ts`

- [ ] **Step 1: Write mini page RED**

Assert:

- Select options still render the same visible labels.
- Known layout/style submit structured codes.
- Custom layout/style submit `custom` code and preserve text.
- Result basis shows layout/style factor lines returned by API.
- No extra fields are added to the customer form.

- [ ] **Step 2: Implement mini wiring**

Update select handling so `BudgetTextChoice` tracks code and text separately. Keep existing UI shape: select + optional custom input.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test apps/douyin-mini/src/pages/budget/form-model.test.ts apps/douyin-mini/src/pages/budget/index.test.ts
bun run douyin-mini:check
git diff --check
```

Commit:

```bash
git add apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/pages/budget/form-model.ts apps/douyin-mini/src/pages/budget/form-model.test.ts apps/douyin-mini/src/pages/budget/index.ts apps/douyin-mini/src/pages/budget/index.test.ts
git commit -m "feat(douyin-mini): 提交预算户型风格因子"
```

## Task 6: End-to-end local/dev validation

**Files:**

- Add or modify focused integration tests only if missing coverage appears during implementation.
- No business seed prices in migrations.

- [ ] **Step 1: Local DB proof**

Run against local Supabase:

- Same area/tier/scope, `modern_simple` vs `light_luxury` produces different totals.
- Same area/tier/scope, `three_bedroom_two_living` vs `villa_duplex` produces different totals.
- `custom` layout/style uses default coefficient.
- Old active pricing versions receive default factor maps.
- Admin factor update changes only new estimates.
- Existing estimates remain unchanged.

- [ ] **Step 2: Dev DB migration gate**

Using `/Users/leefo/Public/work/gooes/.env` direct dev database settings:

```bash
source /Users/leefo/Public/work/gooes/.env
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected:

- Dry-run lists only the new migration.
- Apply succeeds.
- Local/Remote align through the new migration.

- [ ] **Step 3: Full checks**

Run:

```bash
bun run api:check
bun run admin:check
bun run douyin-mini:check
bun --cwd packages/domain run build
git diff --check
```

- [ ] **Step 4: Manual smoke**

In Douyin simulator:

1. Open budget page.
2. Submit 100㎡, 毛坯, 舒适, 全屋, 三室两厅, 现代简约.
3. Submit 100㎡, 毛坯, 舒适, 全屋, 别墅/复式, 现代简约.
4. Confirm totals differ.
5. Submit 100㎡, 毛坯, 舒适, 全屋, 三室两厅, 轻奢.
6. Confirm totals differ from 现代简约.
7. Click预约免费量房.
8. Submit appointment.
9. Admin leads page shows linked budget.

In Admin:

1. Open 抖音小程序 → 预算报价配置.
2. Confirm page is scrollable and not clipped.
3. Edit one style coefficient in a draft.
4. Save and activate.
5. Confirm mini new estimate uses the new coefficient.

## Release notes

- Migration must run before API/Admin/Mini deployment.
- Old mini clients without `layout_code` and `style_code` remain valid; API should default missing codes to `custom`.
- Old pricing versions get default factor maps via migration.
- Existing estimates keep stored result snapshots and are not recalculated.
- Rollback is forward-only: add a reviewed migration restoring default factors or disabling factor application; do not manually edit remote DB.

## Self-review checklist

- Spec coverage: customer complexity unchanged, deterministic rules upgraded, Admin truncation included, no AI pricing.
- Placeholder scan: no unresolved placeholder markers.
- Type consistency: `layout_code`, `style_code`, `factor_payload`, `layout_coefficients_bps`, and `style_coefficients_bps` are used consistently.
- Risk boundary: DB changes are migration-only; no tenant-specific price seed; no orange repository changes.
