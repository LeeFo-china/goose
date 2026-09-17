# Platform Service Limited-Time Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin managed, scheduled promotion that applies one configurable discount to all three formal platform service packages and freezes the resolved promotion in each new order.

**Architecture:** Add versioned promotion tables and atomic publish/stop RPCs through one migration. Resolve the active promotion with the database clock for both the paginated product read model and the existing pending-order command, keeping `amount_fen` backward compatible while adding explicit base/effective price and promotion fields. Add a simple Admin tab for draft, preview, publish, and stop operations; Orange remains read-only and receives a handoff document.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, Bun, TypeScript, Fastify decorators, Zod, Next.js App Router, React, shadcn/Radix, Tailwind, Bun tests.

---

## File map

**Database and contracts**

- Create `supabase/migrations/20260916170000_create_platform_service_promotions.sql`: promotion tables, constraints, indexes, command RPCs, effective product RPC, and atomic order-pricing update.
- Create `apps/api/src/services/platform-service-promotions-migration-contract.test.ts`: static migration security and business-contract checks.

**API promotion management**

- Create `apps/api/src/schema/platform-service-promotions.ts`: paginated list, draft mutation, params, publish, and stop schemas.
- Create `apps/api/src/repositories/platform-service-promotion-records.ts`: record and command result types plus selected-column constants.
- Create `apps/api/src/repositories/platform-service-promotions.ts`: bounded paginated read RPC and mutation RPC calls only.
- Create `apps/api/src/repositories/platform-service-promotions.test.ts`: query bounding and RPC parameter tests.
- Create `apps/api/src/services/platform-service-promotions.ts`: permission, state/error mapping, and serialized responses.
- Create `apps/api/src/services/platform-service-promotions.test.ts`: business, permission, idempotency, and error tests.
- Create `apps/api/src/controllers/platform-service-promotions/index.ts`: thin HTTP controller.
- Create `apps/api/src/controllers/platform-service-promotions/routes.test.ts`: exact route registration test.
- Modify `apps/api/src/routes/index.ts`: register the new controller.
- Modify `apps/api/src/schema/platform-audit-logs.ts`: register promotion audit action names.

**Tenant pricing and order snapshots**

- Modify `apps/api/src/repositories/platform-service-orders.ts`: use the effective-product RPC and preserve the existing pending-order RPC call.
- Modify `apps/api/src/repositories/platform-service-order-records.ts`: model effective prices and promotion snapshots.
- Modify `apps/api/src/repositories/platform-service-orders.test.ts`: verify bounded effective listing and server-controlled order pricing.
- Modify `apps/api/src/services/platform-service-order-views.ts`: serialize effective product and snapshot product views.
- Modify `apps/api/src/services/platform-service-order-views.test.ts`: cover active/no-promotion representations.
- Modify `apps/api/src/services/tenant-platform-service-orders.ts`: return `server_time` and build the create response from the committed order snapshot.
- Modify `apps/api/src/services/tenant-platform-service-orders.test.ts`: cover active, expired, stopped, idempotent, and snapshot behavior.
- Modify `apps/api/src/repositories/platform-service-order-trial-attribution.ts`: map new stable database errors through `Errors.business`.
- Modify `apps/api/src/repositories/platform-service-order-trial-attribution.test.ts`: verify the new mappings.

**Admin**

- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-types.ts`: page and form types.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.ts`: defaults, date conversion, validation, payload, and price preview.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.test.ts`: pure rule tests.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-rules.ts`: status and money/date display helpers.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-table.tsx`: flat paginated table and row actions.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-form.tsx`: create/edit dialog.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotion-detail.tsx`: preview, publish, and stop confirmation.
- Create `apps/admin/components/platform-service-promotions/platform-service-promotions-page.test.ts`: source contract for tab, API, fields, and confirmations.
- Modify `apps/admin/app/(console)/platform/service-products/page.tsx`: add `tab=products|promotions`, fetch only the active dataset, and keep pagination bounded.
- Modify `apps/admin/app/(console)/platform/service-products/loading.tsx`: include the tab skeleton without card nesting.
- Modify `apps/admin/components/platform-service-products/platform-service-products-page.test.ts`: retain the existing product-tab contract.

**Handoff and evidence**

- Create `docs/miniprogram/2026-09-16-platform-service-limited-time-promotion-handoff.md`: additive client contract and acceptance matrix.
- Create `docs/operations/evidence/2026-09-16-platform-service-promotion-local.md`: commands, test counts, migration status, and remaining live gates.

### Task 1: Add the promotion migration contract

**Files:**
- Create: `apps/api/src/services/platform-service-promotions-migration-contract.test.ts`
- Create: `supabase/migrations/20260916170000_create_platform_service_promotions.sql`

- [ ] **Step 1: Write the failing migration contract test**

Create a test that reads the exact migration and asserts the schema, three formal codes, no smoke product eligibility, atomic commands, database clock, half-open time range, pagination, service-role-only grants, audit calls, and server-side order snapshot.

```ts
import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../supabase/migrations/20260916170000_create_platform_service_promotions.sql",
  import.meta.url,
);

describe("platform service promotion migration", () => {
  test("creates versioned promotions without enabling one", async () => {
    const sql = await Bun.file(migration).text();
    const ddl = sql.slice(0, sql.indexOf("CREATE OR REPLACE FUNCTION"));
    expect(sql).toContain("CREATE TABLE public.platform_service_promotions");
    expect(sql).toContain("CREATE TABLE public.platform_service_promotion_versions");
    expect(sql).toContain("discount_rate_basis_points integer NOT NULL DEFAULT 2000");
    expect(sql).toContain("platform_service_1y");
    expect(sql).toContain("platform_service_2y");
    expect(sql).toContain("platform_service_3y");
    expect(sql).not.toMatch(/platform_service_smoke_1fen[\s\S]+discount/i);
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+public\.platform_service_promotions/i);
  });

  test("publishes, stops, lists and prices with database time", async () => {
    const sql = await Bun.file(migration).text();
    for (const name of [
      "platform_service_create_promotion_draft",
      "platform_service_save_promotion_draft",
      "platform_service_publish_promotion",
      "platform_service_stop_promotion",
      "platform_service_list_promotions",
      "platform_service_list_effective_products",
      "platform_service_create_pending_order",
    ]) expect(sql).toContain(name);
    expect(sql).toContain("clock_timestamp()");
    expect(sql).toContain("tstzrange(starts_at, ends_at, '[)')");
    expect(sql).toContain("SERVICE_PROMOTION_OVERLAP");
    expect(sql).toContain("SERVICE_PROMOTION_PRICE_NOT_LOWER");
    expect(sql).toContain("'promotion', v_promotion_snapshot");
    expect(sql).toContain("write_platform_command_audit");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails because the migration is absent**

Run:

```bash
bun test apps/api/src/services/platform-service-promotions-migration-contract.test.ts
```

Expected: FAIL while reading `20260916170000_create_platform_service_promotions.sql`.

- [ ] **Step 3: Create the migration foundation**

Use `platform_service_promotions` for stable identity and pointers, and `platform_service_promotion_versions` for draft/published history. The essential constraints must match this shape:

```sql
CREATE TABLE public.platform_service_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  draft_version_id uuid NULL,
  published_version_id uuid NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at timestamptz NULL,
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(code) <> '' AND char_length(code) <= 80)
);

CREATE TABLE public.platform_service_promotion_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.platform_service_promotions(id) ON DELETE RESTRICT,
  version_no integer NOT NULL CHECK (version_no > 0),
  publication_status text NOT NULL CHECK (
    publication_status IN ('draft', 'published', 'superseded', 'stopped')
  ),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 80),
  badge_text text NOT NULL CHECK (btrim(badge_text) <> '' AND char_length(badge_text) <= 20),
  title text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 60),
  summary text NOT NULL CHECK (btrim(summary) <> '' AND char_length(summary) <= 200),
  rules_text text NOT NULL CHECK (char_length(rules_text) <= 2000),
  discount_rate_basis_points integer NOT NULL DEFAULT 2000
    CHECK (discount_rate_basis_points BETWEEN 1 AND 9999),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  published_at timestamptz NULL,
  stopped_at timestamptz NULL,
  stop_reason text NULL CHECK (stop_reason IS NULL OR char_length(btrim(stop_reason)) BETWEEN 1 AND 500),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  published_by_employee_id uuid NULL REFERENCES public.employees(id),
  stopped_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, version_no),
  UNIQUE (id, promotion_id),
  CHECK (
    publication_status = 'draft'
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  )
);

ALTER TABLE public.platform_service_promotions
  ADD CONSTRAINT platform_service_promotions_draft_version_fk
  FOREIGN KEY (draft_version_id, id)
  REFERENCES public.platform_service_promotion_versions(id, promotion_id);
```

Add the matching published pointer, updated-at trigger, RLS, service-role grants, `(publication_status, starts_at, ends_at)` index, and GiST exclusion constraint over published `[starts_at, ends_at)` ranges. Do not insert an active campaign.

- [ ] **Step 4: Add atomic create, save, publish, and stop RPCs**

Each command must lock the promotion row when one exists and check `p_expected_version` for save, publish, and stop. Create/update write `platform_service_promotion_create` or `platform_service_promotion_update` audit entries in the same transaction; publish/stop use `get_platform_command_idempotent_result` plus `write_platform_command_audit` for replay. Publish must load exactly the three formal products and reject a calculated price that is not below each published daily price.

```sql
v_effective_amount_fen := GREATEST(
  1,
  round(v_product_version.list_amount_fen * v_draft.discount_rate_basis_points / 10000.0)::bigint
);
IF v_effective_amount_fen >= v_product_version.amount_fen THEN
  RAISE EXCEPTION USING ERRCODE = 'P0001',
    MESSAGE = 'SERVICE_PROMOTION_PRICE_NOT_LOWER';
END IF;
```

Publishing a replacement version must mark the prior version `superseded` before setting the draft to `published`. Stop must only change publication status and stop metadata; it must not edit content, rate, or schedule.

- [ ] **Step 5: Add bounded Admin and tenant read RPCs**

`platform_service_list_promotions` returns the requested promotion page, current draft/published versions, derived phase, three current price-preview rows, pagination, and one `server_time`. It uses `LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)` and rejects page sizes outside 1–100.

Return one bounded JSON page and a single database timestamp. `amount_fen` and `effective_amount_fen` must both be the current amount, while `base_amount_fen` preserves the published daily price.

```sql
RETURN jsonb_build_object(
  'list', COALESCE(v_items, '[]'::jsonb),
  'pagination', jsonb_build_object(
    'page', p_page,
    'pageSize', p_page_size,
    'total', v_total,
    'totalPages', CASE WHEN v_total = 0 THEN 0 ELSE ceil(v_total::numeric / p_page_size)::integer END
  ),
  'server_time', v_now
);
```

The query must use `LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)` and select only the published product fields required by the client.

- [ ] **Step 6: Replace the current pending-order RPC body with server pricing**

Keep the latest function signature, including `p_source_trial_id`, so existing repository calls remain valid. Inside the transaction, resolve and lock the enabled product and published version by `p_product_code`, verify `p_terms_version`, resolve the active promotion with `v_now`, compute the final amount, and overwrite the supplied product/price snapshot values before insert.

```sql
v_product_snapshot := jsonb_build_object(
  'product_id', v_product.id,
  'product_version_id', v_product_version.id,
  'code', v_product.code,
  'title', v_product_version.title,
  'pricing_version', v_product_version.version,
  'term_years', v_product_version.term_years,
  'list_amount_fen', v_product_version.list_amount_fen,
  'base_amount_fen', v_product_version.amount_fen,
  'amount_fen', v_effective_amount_fen,
  'service_scope', v_product_version.service_scope,
  'terms_version', v_product_version.terms_version,
  'terms_content', v_product_version.terms_content
);

IF v_promotion_version.id IS NOT NULL THEN
  v_product_snapshot := v_product_snapshot || jsonb_build_object(
    'promotion', jsonb_build_object(
      'id', v_promotion.id,
      'version_id', v_promotion_version.id,
      'version', v_promotion_version.version_no,
      'name', v_promotion_version.name,
      'badge_text', v_promotion_version.badge_text,
      'discount_rate_basis_points', v_promotion_version.discount_rate_basis_points,
      'starts_at', v_promotion_version.starts_at,
      'ends_at', v_promotion_version.ends_at,
      'base_amount_fen', v_product_version.amount_fen,
      'effective_amount_fen', v_effective_amount_fen
    )
  );
END IF;
```

Also extend `platform_service_publish_product_version` so it rejects a new daily product price that would be less than or equal to a scheduled/active promotion price.

- [ ] **Step 7: Run the migration contract test**

Run:

```bash
bun test apps/api/src/services/platform-service-promotions-migration-contract.test.ts
```

Expected: all promotion migration contract tests PASS.

- [ ] **Step 8: Commit the database contract**

```bash
git add supabase/migrations/20260916170000_create_platform_service_promotions.sql \
  apps/api/src/services/platform-service-promotions-migration-contract.test.ts
git commit -m "feat(db): 增加技术服务限时活动模型"
```

### Task 2: Add promotion schemas and repository

**Files:**
- Create: `apps/api/src/schema/platform-service-promotions.ts`
- Create: `apps/api/src/repositories/platform-service-promotion-records.ts`
- Create: `apps/api/src/repositories/platform-service-promotions.ts`
- Create: `apps/api/src/repositories/platform-service-promotions.test.ts`

- [ ] **Step 1: Write repository tests first**

Cover bounded page/pageSize parameters and exact RPC names/parameters for list, create, save, publish, and stop.

```ts
test("publishes with optimistic version and idempotency", async () => {
  await repository.publish({
    promotionId: PROMOTION_ID,
    expectedVersion: 3,
    idempotencyKey: IDEMPOTENCY_KEY,
    actorEmployeeId: EMPLOYEE_ID,
    actorUserId: USER_ID,
  });
  expect(client.rpc).toHaveBeenCalledWith(
    "platform_service_publish_promotion",
    {
      p_promotion_id: PROMOTION_ID,
      p_expected_version: 3,
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_actor_employee_id: EMPLOYEE_ID,
      p_actor_user_id: USER_ID,
    },
  );
});
```

- [ ] **Step 2: Run tests and confirm missing modules fail**

Run:

```bash
bun test apps/api/src/repositories/platform-service-promotions.test.ts
```

Expected: FAIL because the repository and record modules do not exist.

- [ ] **Step 3: Add strict Zod request schemas**

```ts
const PromotionContentShape = {
  name: z.string().trim().min(1).max(80),
  badge_text: z.string().trim().min(1).max(20),
  title: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(200),
  rules_text: z.string().trim().max(2000),
  discount_rate_basis_points: z.number().int().min(1).max(9999),
  starts_at: z.iso.datetime().nullable(),
  ends_at: z.iso.datetime().nullable(),
};

export const PlatformServicePromotionUpdateSchema = z.object({
  ...PromotionContentShape,
  expected_version: z.number().int().positive(),
}).strict().superRefine(validatePromotionTimePair);

export const PlatformServicePromotionCreateSchema = z.object({
  name: PromotionContentShape.name.default("平台技术服务限时优惠"),
  badge_text: PromotionContentShape.badge_text.default("限时 2 折"),
  title: PromotionContentShape.title.default("平台技术服务限时优惠"),
  summary: PromotionContentShape.summary.default("1 年、2 年、3 年套餐同步限时优惠"),
  rules_text: PromotionContentShape.rules_text.default(""),
  discount_rate_basis_points:
    PromotionContentShape.discount_rate_basis_points.default(2000),
  starts_at: PromotionContentShape.starts_at.default(null),
  ends_at: PromotionContentShape.ends_at.default(null),
}).strict().superRefine(validatePromotionTimePair);

export const PlatformServicePromotionPublishSchema = z.object({
  expected_version: z.number().int().positive(),
  idempotency_key: z.uuid(),
}).strict();

export const PlatformServicePromotionStopSchema =
  PlatformServicePromotionPublishSchema.extend({
    reason: z.string().trim().min(1).max(500),
  }).strict();
```

Draft validation allows both timestamps to be null but rejects only-one-set and `ends_at <= starts_at`.

- [ ] **Step 4: Implement focused record types and repository methods**

Expose `list`, `createDraft`, `saveDraft`, `publish`, and `stop`. The list calls `platform_service_list_promotions` with normalized page/pageSize; SQL performs the bounded range and returns one product-price preview for the page. Every write calls only its migration RPC and wraps database failures with `Errors.dbError` unless the error contains a stable business code that the service must map.

```ts
export type PlatformServicePromotionCommandResult = {
  idempotent: boolean;
  promotion: PlatformServicePromotionRecord;
  draft: PlatformServicePromotionVersionRecord | null;
  published: PlatformServicePromotionVersionRecord | null;
  price_preview: PromotionPricePreview[];
  server_time: string;
};
```

- [ ] **Step 5: Run repository and schema tests**

Run:

```bash
bun test apps/api/src/repositories/platform-service-promotions.test.ts \
  apps/api/src/schema/platform-service-products.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit repository boundary**

```bash
git add apps/api/src/schema/platform-service-promotions.ts \
  apps/api/src/repositories/platform-service-promotion-records.ts \
  apps/api/src/repositories/platform-service-promotions.ts \
  apps/api/src/repositories/platform-service-promotions.test.ts
git commit -m "feat(api): 增加限时活动数据访问"
```

### Task 3: Add promotion service and platform routes

**Files:**
- Create: `apps/api/src/services/platform-service-promotions.ts`
- Create: `apps/api/src/services/platform-service-promotions.test.ts`
- Create: `apps/api/src/controllers/platform-service-promotions/index.ts`
- Create: `apps/api/src/controllers/platform-service-promotions/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`

- [ ] **Step 1: Write service tests for authorization and stable errors**

```ts
test("requires platform product manage permission", async () => {
  await expect(service.listPromotions(platformAuth([]), { page: 1, pageSize: 20 }))
    .rejects.toMatchObject({ statusCode: 403 });
});

test.each([
  ["SERVICE_PROMOTION_OVERLAP", 409],
  ["SERVICE_PROMOTION_PRICE_NOT_LOWER", 422],
  ["SERVICE_PROMOTION_PRODUCT_UNAVAILABLE", 409],
  ["SERVICE_PROMOTION_VERSION_CONFLICT", 409],
])("maps %s", async (code, statusCode) => {
  repository.publish = async () => { throw databaseError(code); };
  await expect(service.publish(platformManager(), PROMOTION_ID, publishInput))
    .rejects.toMatchObject({ statusCode, code });
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
bun test apps/api/src/services/platform-service-promotions.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service**

Require `tenantId === null`, platform mode, `employeeId`, `authUserId`, and `platform.service_product.manage`. Normalize pagination to default 20 and maximum 100. Map each database message through `Errors.business`:

```ts
const PROMOTION_ERRORS = {
  SERVICE_PROMOTION_NOT_FOUND: [404, "限时活动不存在"],
  SERVICE_PROMOTION_VERSION_CONFLICT: [409, "限时活动已被更新，请刷新后重试"],
  SERVICE_PROMOTION_TIME_INVALID: [422, "活动时间无效"],
  SERVICE_PROMOTION_OVERLAP: [409, "活动时间与已发布活动重叠"],
  SERVICE_PROMOTION_PRICE_NOT_LOWER: [422, "活动价必须低于三档套餐的日常价"],
  SERVICE_PROMOTION_PRODUCT_UNAVAILABLE: [409, "三档正式套餐尚未全部发布"],
  SERVICE_PROMOTION_INVALID_STATE: [409, "当前活动状态不允许执行此操作"],
} as const;
```

The create method supplies default `2000`, “限时 2 折”, “平台技术服务限时优惠”, and “1 年、2 年、3 年套餐同步限时优惠”; timestamps remain null.

- [ ] **Step 4: Add thin controller routes**

Register exactly:

```ts
@Get("/platform/billing/service-promotions")
@Post("/platform/billing/service-promotions")
@Patch("/platform/billing/service-promotions/:id")
@Post("/platform/billing/service-promotions/:id/publish")
@Post("/platform/billing/service-promotions/:id/stop")
```

Each route uses `getRequiredPlatformPermissionContext(request, "platform.service_product.manage")`, Zod `safeParse`, `Errors.fromZod`, the service method, and `ResponseHandler.success`.

- [ ] **Step 5: Register audit actions and controller**

Add these action literals to `PlatformAuditLogActionSchema`:

```ts
"platform_service_promotion_create",
"platform_service_promotion_update",
"platform_service_promotion_publish",
"platform_service_promotion_stop",
```

Import and call `PlatformServicePromotionsController.registerExtraRoutes(app)` beside the existing product controller.

- [ ] **Step 6: Run focused API tests**

Run:

```bash
bun test apps/api/src/services/platform-service-promotions.test.ts \
  apps/api/src/controllers/platform-service-promotions/routes.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit the platform API**

```bash
git add apps/api/src/services/platform-service-promotions.ts \
  apps/api/src/services/platform-service-promotions.test.ts \
  apps/api/src/controllers/platform-service-promotions \
  apps/api/src/routes/index.ts apps/api/src/schema/platform-audit-logs.ts
git commit -m "feat(api): 增加限时活动管理接口"
```

### Task 4: Return effective prices and freeze promotion order snapshots

**Files:**
- Modify: `apps/api/src/repositories/platform-service-orders.ts`
- Modify: `apps/api/src/repositories/platform-service-order-records.ts`
- Modify: `apps/api/src/repositories/platform-service-orders.test.ts`
- Modify: `apps/api/src/services/platform-service-order-views.ts`
- Modify: `apps/api/src/services/platform-service-order-views.test.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.ts`
- Modify: `apps/api/src/services/tenant-platform-service-orders.test.ts`
- Modify: `apps/api/src/repositories/platform-service-order-trial-attribution.ts`
- Modify: `apps/api/src/repositories/platform-service-order-trial-attribution.test.ts`

- [ ] **Step 1: Add failing tenant product and order tests**

Test the additive response contract and ensure order creation ignores any application-computed amount in favor of the RPC result.

```ts
expect(result).toMatchObject({
  server_time: "2026-09-16T04:00:00.000Z",
  list: [{
    code: "platform_service_1y",
    list_amount_fen: 980000,
    base_amount_fen: 980000,
    amount_fen: 196000,
    effective_amount_fen: 196000,
    base_price_rate_basis_points: 10000,
    price_rate_basis_points: 2000,
    promotion: {
      badge_text: "限时 2 折",
      discount_rate_basis_points: 2000,
    },
  }],
});

expect(created.order.product_snapshot.promotion.version_id)
  .toBe(PROMOTION_VERSION_ID);
expect(created.order.amount_fen).toBe(196000);
expect(created.product.amount_fen).toBe(196000);
```

Also test no promotion, scheduled, exact start, exact end, stopped, and idempotent replay fixtures.

- [ ] **Step 2: Run focused tests and confirm the old contract fails**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/services/platform-service-order-views.test.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts
```

Expected: FAIL on missing effective pricing and promotion snapshot fields.

- [ ] **Step 3: Switch product listing to the bounded RPC**

Replace the REST table listing in `listEnabledProducts` with:

```ts
const { data, error } = await this.clientProvider().rpc(
  "platform_service_list_effective_products",
  { p_page: input.page, p_page_size: input.pageSize },
);
if (error) throw Errors.dbError("查询平台技术服务商品失败", error);
return parseEffectiveProductPage(data);
```

The parser must reject malformed root/list/pagination values with a stable wrapped database/read-model error; it must not coerce arbitrary strings into money.

- [ ] **Step 4: Add explicit promotion snapshot types and serializers**

```ts
export type PlatformServicePromotionSnapshot = {
  id: string;
  version_id: string;
  version: number;
  name: string;
  badge_text: string;
  discount_rate_basis_points: number;
  starts_at: string;
  ends_at: string;
  base_amount_fen: number;
  effective_amount_fen: number;
};
```

`serializeTenantServiceProduct` must preserve the RPC fields. Add `serializeTenantServiceProductSnapshot(order.product_snapshot)` for the create-order response so a concurrent product publication cannot make the response disagree with the committed order.

- [ ] **Step 5: Keep order intent small and trust the committed RPC result**

Continue passing the existing RPC signature for compatibility, but treat product IDs, versions, amounts, and snapshots as precheck hints only. After `createPendingOrder` returns, build the response product from its snapshot:

```ts
return {
  idempotent: false,
  order: serializeTenantServiceOrder(order, responseNow, { canCancelPayment: true }),
  product: serializeTenantServiceProductSnapshot(order.product_snapshot),
  payment_request: paymentRequest,
  server_time: responseNow.toISOString(),
};
```

Idempotent replay must use the same snapshot serializer.

- [ ] **Step 6: Map database pricing errors**

Extend `throwPendingOrderCreationError` to recognize:

```ts
if (message.includes("SERVICE_TERMS_VERSION_STALE")) {
  throw Errors.business(409, "服务条款已更新，请重新确认后下单", "SERVICE_TERMS_VERSION_STALE");
}
if (message.includes("SERVICE_PRODUCT_NOT_FOUND")) {
  throw Errors.business(404, "平台技术服务商品不存在", "SERVICE_PRODUCT_NOT_FOUND");
}
```

Promotion validity is maintained by publish-time checks and the product-publish guard. Unknown errors remain wrapped through `Errors.dbError` without leaking SQL details.

- [ ] **Step 7: Run all platform service sales tests**

Run:

```bash
bun test apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/repositories/platform-service-order-trial-attribution.test.ts \
  apps/api/src/services/platform-service-order-views.test.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts \
  apps/api/src/services/platform-service-products.test.ts \
  apps/api/src/services/platform-service-order-payment-confirmation.test.ts
```

Expected: all selected tests PASS and existing payment/terms behavior remains green.

- [ ] **Step 8: Commit tenant pricing integration**

```bash
git add apps/api/src/repositories/platform-service-orders.ts \
  apps/api/src/repositories/platform-service-order-records.ts \
  apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/repositories/platform-service-order-trial-attribution.ts \
  apps/api/src/repositories/platform-service-order-trial-attribution.test.ts \
  apps/api/src/services/platform-service-order-views.ts \
  apps/api/src/services/platform-service-order-views.test.ts \
  apps/api/src/services/tenant-platform-service-orders.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts
git commit -m "feat(api): 按限时活动锁定服务订单价格"
```

### Task 5: Add Admin form rules and types

**Files:**
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-types.ts`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.ts`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.test.ts`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-rules.ts`

- [ ] **Step 1: Write pure form-rule tests**

```ts
test("creates a two-tenths draft without scheduling it", () => {
  expect(DEFAULT_PROMOTION_FORM_VALUES).toEqual(expect.objectContaining({
    badgeText: "限时 2 折",
    discountRate: "2",
    startsAt: "",
    endsAt: "",
  }));
});

test("builds ISO timestamps and basis points", () => {
  expect(buildPromotionPayload({
    ...DEFAULT_PROMOTION_FORM_VALUES,
    startsAt: "2026-09-20T10:00",
    endsAt: "2026-09-30T22:00",
  }, 4)).toEqual({
    ok: true,
    body: expect.objectContaining({
      expected_version: 4,
      discount_rate_basis_points: 2000,
      starts_at: new Date("2026-09-20T10:00").toISOString(),
      ends_at: new Date("2026-09-30T22:00").toISOString(),
    }),
  });
});
```

Also cover 0/10 folds, fractional precision beyond one decimal, missing one timestamp, end before start, maximum text lengths, and preview values `196000/392000/588000`.

- [ ] **Step 2: Run form tests and verify failure**

Run:

```bash
pnpm --dir apps/admin exec bun test components/platform-service-promotions/platform-service-promotion-form-data.test.ts
```

Expected: FAIL because the form modules do not exist.

- [ ] **Step 3: Implement form types and conversion rules**

Use browser-local `datetime-local` values and convert with `new Date(value).toISOString()`. Present discount as Chinese fold units while sending basis points:

```ts
function parseDiscountRate(value: string) {
  if (!/^\d(?:\.\d)?$/.test(value.trim())) {
    return { ok: false as const, message: "折扣只能填写 0.1 至 9.9 折" };
  }
  const basisPoints = Math.round(Number(value) * 1000);
  if (basisPoints < 1 || basisPoints > 9999) {
    return { ok: false as const, message: "折扣必须低于原价" };
  }
  return { ok: true as const, basisPoints };
}

export function calculatePromotionAmount(listAmountFen: number, rate: number) {
  return Math.max(1, Math.round((listAmountFen * rate) / 10_000));
}
```

Define page, promotion, version, price-preview, form, and phase types without `any`.

- [ ] **Step 4: Run form tests**

Run:

```bash
pnpm --dir apps/admin exec bun test components/platform-service-promotions/platform-service-promotion-form-data.test.ts
```

Expected: all form-rule tests PASS.

- [ ] **Step 5: Commit Admin rules**

```bash
git add apps/admin/components/platform-service-promotions/platform-service-promotion-types.ts \
  apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.ts \
  apps/admin/components/platform-service-promotions/platform-service-promotion-form-data.test.ts \
  apps/admin/components/platform-service-promotions/platform-service-promotion-rules.ts
git commit -m "feat(admin): 增加限时活动表单规则"
```

### Task 6: Build the Admin promotion tab

**Files:**
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-table.tsx`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-form.tsx`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotion-detail.tsx`
- Create: `apps/admin/components/platform-service-promotions/platform-service-promotions-page.test.ts`
- Modify: `apps/admin/app/(console)/platform/service-products/page.tsx`
- Modify: `apps/admin/app/(console)/platform/service-products/loading.tsx`
- Modify: `apps/admin/components/platform-service-products/platform-service-products-page.test.ts`

- [ ] **Step 1: Write the Admin source-contract test**

Assert the page has linked `products` and `promotions` tabs, fetches only the active endpoint, preserves page/pageSize, and contains all required labels and confirmations.

```ts
for (const text of [
  "限时活动",
  "运营内容",
  "折扣",
  "开始时间",
  "结束时间",
  "1 年套餐",
  "2 年套餐",
  "3 年套餐",
  "确认发布活动",
  "确认停止活动",
]) expect(source).toContain(text);

expect(page).toContain("/platform/billing/service-promotions?");
expect(page).toContain('tab === "promotions"');
expect(source).toContain("expected_version");
expect(source).toContain("crypto.randomUUID()");
```

- [ ] **Step 2: Run the page tests and verify failure**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/platform-service-promotions/platform-service-promotions-page.test.ts \
  components/platform-service-products/platform-service-products-page.test.ts
```

Expected: promotion test FAIL; existing product page tests remain PASS.

- [ ] **Step 3: Add server-rendered tab selection and bounded fetches**

Normalize `tab` to `products | promotions`. Use linked Radix tab triggers following `platform-device-tabs-nav.tsx`. Fetch `/platform/billing/service-products` only for the product tab and `/platform/billing/service-promotions` only for the promotion tab. Keep `page=1&pageSize=20` defaults and maximum 100.

```tsx
<Tabs value={tab}>
  <TabsList className={platformTabsListClassName}>
    <TabsTrigger value="products" asChild>
      <Link href="/platform/service-products?tab=products">套餐</Link>
    </TabsTrigger>
    <TabsTrigger value="promotions" asChild>
      <Link href="/platform/service-products?tab=promotions">限时活动</Link>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

- [ ] **Step 4: Build the flat activity table and form**

The table contains activity, discount, interval, derived phase, version, updated time, and one “查看配置” action. The dialog groups plain fields under “运营内容” and “价格与时间”; use existing `Input`, `Textarea`, `Field`, `Dialog`, and `type="datetime-local"`. Do not introduce a card inside the dialog or table.

Create calls `POST /platform/billing/service-promotions`; edit calls `PATCH /platform/billing/service-promotions/:id`. Show API errors in `StatusAlert` and keep the form open on failure.

- [ ] **Step 5: Build price preview and guarded actions**

The detail view displays three plain rows from the backend `price_preview`; it must not recalculate authoritative prices for publish confirmation. Publish uses:

```ts
await requestBackendJson(
  `/platform/billing/service-promotions/${promotion.id}/publish`,
  {
    method: "POST",
    body: JSON.stringify({
      expected_version: promotion.version,
      idempotency_key: crypto.randomUUID(),
    }),
    fallbackMessage: "发布限时活动失败",
  },
);
```

Stop requires a 1–500 character reason and uses destructive confirmation. Disable closing and repeated submission while a command is pending.

- [ ] **Step 6: Update loading state and run Admin tests**

Run:

```bash
pnpm --dir apps/admin exec bun test \
  components/platform-service-promotions/platform-service-promotion-form-data.test.ts \
  components/platform-service-promotions/platform-service-promotions-page.test.ts \
  components/platform-service-products/platform-service-products-page.test.ts
```

Expected: all selected Admin tests PASS.

- [ ] **Step 7: Run Admin static checks**

Run:

```bash
pnpm --dir apps/admin check
```

Expected: TypeScript and file-size checks exit 0. If a new component exceeds the repository limit, split form fields, table, and action confirmation by responsibility instead of bypassing the check.

- [ ] **Step 8: Commit the Admin UI**

```bash
git add apps/admin/app/'(console)'/platform/service-products/page.tsx \
  apps/admin/app/'(console)'/platform/service-products/loading.tsx \
  apps/admin/components/platform-service-products/platform-service-products-page.test.ts \
  apps/admin/components/platform-service-promotions
git commit -m "feat(admin): 管理技术服务限时活动"
```

### Task 7: Write the mini-program handoff

**Files:**
- Create: `docs/miniprogram/2026-09-16-platform-service-limited-time-promotion-handoff.md`

- [ ] **Step 1: Document the additive product response**

Include an exact masked example:

```json
{
  "data": {
    "list": [{
      "code": "platform_service_1y",
      "list_amount_fen": 980000,
      "base_amount_fen": 980000,
      "amount_fen": 196000,
      "effective_amount_fen": 196000,
      "base_price_rate_basis_points": 10000,
      "price_rate_basis_points": 2000,
      "promotion": {
        "id": "masked",
        "version_id": "masked",
        "version": 1,
        "badge_text": "限时 2 折",
        "title": "平台技术服务限时优惠",
        "summary": "1 年、2 年、3 年套餐同步限时优惠",
        "rules_text": "活动期内创建订单可享活动价。",
        "discount_rate_basis_points": 2000,
        "starts_at": "2026-09-20T02:00:00.000Z",
        "ends_at": "2026-09-30T14:00:00.000Z"
      }
    }],
    "pagination": { "page": 1, "pageSize": 20, "total": 3, "totalPages": 1 },
    "server_time": "2026-09-20T02:00:01.000Z"
  }
}
```

- [ ] **Step 2: Document client behavior and acceptance**

State that Orange must use `amount_fen`, never submit campaign price, calibrate countdown from `server_time`, refresh at end/background return, and accept the order response as final. Include acceptance for no activity, exact start/end, activity stopping, 401, stale terms 409, idempotent retries, and a pending order paid after activity expiry. Explicitly prohibit returning token, payment signature, OpenID, or user data as evidence.

- [ ] **Step 3: Verify the handoff contains no Orange mutation instruction**

Run:

```bash
if rg -n '修改 /Users/leefo/Public/work/orange|git add.*orange|git commit.*orange' \
  docs/miniprogram/2026-09-16-platform-service-limited-time-promotion-handoff.md; then
  exit 1
else
  echo "orange-mutation-instructions=0"
fi
```

Expected: no matches.

- [ ] **Step 4: Commit the handoff**

```bash
git add docs/miniprogram/2026-09-16-platform-service-limited-time-promotion-handoff.md
git commit -m "docs(miniprogram): 交接技术服务限时活动"
```

### Task 8: Run full local verification and record evidence

**Files:**
- Create: `docs/operations/evidence/2026-09-16-platform-service-promotion-local.md`
- Modify only if generation changes it: `apps/api/src/types/database.ts`

- [ ] **Step 1: Run all focused API tests**

Run:

```bash
bun test \
  apps/api/src/services/platform-service-promotions-migration-contract.test.ts \
  apps/api/src/repositories/platform-service-promotions.test.ts \
  apps/api/src/services/platform-service-promotions.test.ts \
  apps/api/src/controllers/platform-service-promotions/routes.test.ts \
  apps/api/src/repositories/platform-service-orders.test.ts \
  apps/api/src/repositories/platform-service-order-trial-attribution.test.ts \
  apps/api/src/services/platform-service-order-views.test.ts \
  apps/api/src/services/tenant-platform-service-orders.test.ts \
  apps/api/src/services/platform-service-products.test.ts \
  apps/api/src/services/platform-service-order-payment-confirmation.test.ts
```

Expected: 0 failures.

- [ ] **Step 2: Run API and Admin checks**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
```

Expected: all three commands exit 0.

- [ ] **Step 3: Validate the migration in an isolated complete Supabase environment**

Use the repository’s established isolated migration workflow. Do not run manual DDL/DML against any remote database. After applying the migration locally, run:

```bash
supabase migration list --local
```

Expected: `20260916170000` appears as applied locally and the isolated Local/Remote columns align. Exercise the RPCs in a transaction and roll back test data after verifying: draft default 2000, three price previews, half-open boundary, overlap rejection, stop recovery, and order snapshot.

- [ ] **Step 4: Regenerate database types only from the verified schema**

Run the repository command against the designated development project only after the migration is applied there:

```bash
bun run gen
git diff -- apps/api/src/types/database.ts
```

Expected: generated promotion table/function types only; no unrelated schema drift. If the development migration has not been applied, leave generated types unchanged and record that gate instead of fabricating types.

- [ ] **Step 5: Record local evidence**

Write the exact commit SHA, commands, pass/fail counts, migration validation environment, unperformed live payment checks, and rollback statement. Do not include secrets, payment request fields, signed URLs, OpenIDs, or user details.

- [ ] **Step 6: Run final repository checks**

Run:

```bash
git diff --check
git status --short
git log --oneline -8
```

Expected: no whitespace errors; status contains only the evidence file and any reviewed generated database type change.

- [ ] **Step 7: Commit verification evidence**

```bash
git add docs/operations/evidence/2026-09-16-platform-service-promotion-local.md
git add apps/api/src/types/database.ts 2>/dev/null || true
git diff --cached --check
git commit -m "docs(operations): 记录限时活动本地验证"
```

### Task 9: Development release gate

**Files:**
- Modify: `docs/operations/evidence/2026-09-16-platform-service-promotion-local.md`

- [ ] **Step 1: Push an immutable release branch only after all local checks pass**

Use the current reviewed commit as the release SHA. Do not release a dirty worktree and do not mix later commits into the workflow run.

```bash
release_branch="release/platform-service-promotion-dev-20260916"
release_sha="$(git rev-parse HEAD)"
git branch -f "$release_branch" "$release_sha"
git push --force-with-lease origin "$release_branch:$release_branch"
test "$(git rev-parse "$release_branch")" = "$release_sha"
```

Expected: the remote release branch points to the exact reviewed SHA.

- [ ] **Step 2: Run the development migration plan**

```bash
gh workflow run migrate-dev-database.yml --ref "$release_branch" \
  -f mode=plan \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Expected: the workflow head equals the release SHA and the only new pending migration for this feature is `20260916170000`.

- [ ] **Step 3: Apply the development migration through the workflow**

```bash
gh workflow run migrate-dev-database.yml --ref "$release_branch" \
  -f mode=apply \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Expected: workflow succeeds and its post-apply `supabase migration list` shows Local/Remote alignment. Do not run a manual remote `db push`.

- [ ] **Step 4: Release API and Admin from the same SHA**

```bash
gh workflow run release-dev.yml --ref "$release_branch" \
  -f operation=release \
  -f service=api,admin
```

Expected: API deploys before Admin, both revisions report healthy, and the workflow head remains the reviewed release SHA.

- [ ] **Step 5: Perform development smoke without a real charge**

Verify through authenticated Admin/API:

1. Create a draft and confirm the default is 2 folds with blank times.
2. Set a future one-hour interval and confirm all three previews.
3. Publish, verify “待开始”, then stop the activity.
4. Confirm `GET /billing/service-products?page=1&pageSize=20` returns normal prices after stopping.
5. Do not submit a WeChat payment in this smoke; real payment and Orange true-device acceptance remain separate gates.

- [ ] **Step 6: Append development evidence and commit it**

Record workflow run IDs, exact release SHA, migration count before/after, health result, masked promotion ID/version, and the remaining Orange/payment gates.

```bash
git add docs/operations/evidence/2026-09-16-platform-service-promotion-local.md
git diff --cached --check
git commit -m "docs(operations): 记录限时活动开发发布"
```

Production migration, API/Admin release, activity publication, and real WeChat payment are excluded from this plan’s automatic execution. They require a separate production release request after development and Orange true-device acceptance.
