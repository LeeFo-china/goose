# City Partner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first backend/admin capability for the city partner program: manage partners and levels, bind tenants through partner invite codes, record platform revenue from tenant recharge and lead service fees, generate partner commission ledgers, and support monthly manual settlement.

**Architecture:** Extend the existing platform admin model with Supabase migration-managed tables, Fastify controller/service/repository modules under `/platform/*`, and Next.js platform admin pages that reuse the current platform list shell and shadcn/ui components. The first release keeps settlement manual and auditable; WeChat Pay automatic profit sharing remains a data-compatible future enhancement.

**Tech Stack:** Bun + TypeScript + Fastify API, Supabase migrations, existing Supabase admin client, Zod schemas, `@gooes/domain` permission constants, Next.js admin app, shadcn/ui, existing platform list components.

---

## Scope And Rules

- Only edit the `gooes` repository. Do not modify `/Users/leefo/Public/work/orange`; mini-program QR integration is delivered as a handoff document.
- All database changes must be in `supabase/migrations/20260704193000_create_city_partner_mvp.sql`.
- All list endpoints must use pagination with `page=1`, `pageSize=20`, and max `pageSize=100`.
- First release revenue sources are only:
  - Tenant platform recharge consumption.
  - Platform lead service fee after a platform lead is confirmed as closed.
- Lead service fee default rate is `2.5%`.
- First release settlement cycle is monthly natural-month settlement.
- First release settlement method is manual: generate a monthly batch, finance reviews and pays externally, then uploads or records the payment proof in admin.
- Do not auto-trigger WeChat Pay profit sharing in this MVP.
- Partner commission is calculated only from platform income. Tenant construction contract payments, material payments, labor payments, project expenses, and tenant internal profit are outside platform revenue and never enter partner commission.

## File Map

Create:

- `supabase/migrations/20260704193000_create_city_partner_mvp.sql`
- `apps/api/src/schema/platform-partners.ts`
- `apps/api/src/schema/platform-partner-revenue.ts`
- `apps/api/src/repositories/platform-partners.ts`
- `apps/api/src/repositories/platform-partner-revenue.ts`
- `apps/api/src/services/platform-partners.ts`
- `apps/api/src/services/platform-partner-revenue.ts`
- `apps/api/src/services/platform-partners.test.ts`
- `apps/api/src/services/platform-partner-revenue.test.ts`
- `apps/api/src/controllers/platform-partners/index.ts`
- `apps/api/src/controllers/platform-partner-revenue/index.ts`
- `apps/admin/app/(console)/platform/partners/page.tsx`
- `apps/admin/app/(console)/platform/partners/loading.tsx`
- `apps/admin/app/(console)/platform/partners/[id]/page.tsx`
- `apps/admin/app/(console)/platform/partners/revenue/page.tsx`
- `apps/admin/app/(console)/platform/partners/settlements/page.tsx`
- `apps/admin/components/platform-partners/platform-partner-types.ts`
- `apps/admin/components/platform-partners/platform-partner-list-actions.tsx`
- `apps/admin/components/platform-partners/platform-partners-table.tsx`
- `apps/admin/components/platform-partners/platform-partner-mutations.tsx`
- `apps/admin/components/platform-partners/platform-partner-revenue-table.tsx`
- `apps/admin/components/platform-partners/platform-partner-settlement-table.tsx`
- `docs/miniprogram/2026-07-04-city-partner-qr-handoff.md`

Modify:

- `apps/api/src/routes/index.ts`
- `packages/domain/src/permission.ts`
- `packages/domain/src/permission.test.ts`
- `apps/admin/components/layout/menu-config.ts`
- `apps/admin/components/platform/platform-list-page-layout.test.ts`
- `docs/2026-07-04-city-partner-platform-prd.md`

## Domain Model

Use these exact status values:

```text
platform_partners.status:
pending | active | suspended | terminated

platform_partner_levels.status:
active | inactive

platform_partner_invite_codes.status:
active | disabled | expired

tenant_partner_bindings.status:
active | pending_transfer | ended

platform_revenue_events.revenue_type:
tenant_recharge | lead_service_fee

platform_revenue_events.status:
pending | confirmed | refunded | reversed | blocked

partner_commission_ledger.status:
pending | blocked | available | settling | settled | failed | reversed

partner_settlement_batches.status:
draft | reviewing | paid | canceled

partner_settlement_batches.settlement_method:
manual
```

Store all money amounts as integer fen. Store rates as basis points:

```text
2.5% = 250 basis points
10% = 1000 basis points
45% = 4500 basis points
```

---

## Task 1: Add Database Migration Contract Test

**Files:**

- Create: `apps/api/src/services/platform-partners.test.ts`

- [ ] **Step 1: Add a migration contract test before creating the migration**

Create `apps/api/src/services/platform-partners.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const migrationDir = join(import.meta.dir, "../../../supabase/migrations");

function readCityPartnerMigration() {
  const file = readdirSync(migrationDir)
    .filter((name) => name.endsWith("_create_city_partner_mvp.sql"))
    .sort()
    .at(-1);
  expect(file).toBeTruthy();
  return readFileSync(join(migrationDir, file as string), "utf8");
}

describe("city partner MVP migration", () => {
  test("creates partner, revenue, commission, and settlement tables", () => {
    const sql = readCityPartnerMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_levels");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partners");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_invite_codes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_partner_bindings");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_revenue_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_commission_ledger");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_batches");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.partner_settlement_items");
    expect(sql).toContain("lead_service_fee_default_rate_bps integer NOT NULL DEFAULT 250");
    expect(sql).toContain("settlement_cycle text NOT NULL DEFAULT 'monthly'");
    expect(sql).toContain("settlement_method text NOT NULL DEFAULT 'manual'");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails because the migration does not exist**

```bash
bun test apps/api/src/services/platform-partners.test.ts
```

Expected result: the test fails on missing migration.

---

## Task 2: Add City Partner Migration

**Files:**

- Create: `supabase/migrations/20260704193000_create_city_partner_mvp.sql`
- Test: `apps/api/src/services/platform-partners.test.ts`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260704193000_create_city_partner_mvp.sql` with these tables and seed rows:

```sql
CREATE TABLE IF NOT EXISTS public.platform_partner_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  tenant_recharge_commission_bps integer NOT NULL,
  lead_service_fee_commission_bps integer NOT NULL,
  lead_service_fee_default_rate_bps integer NOT NULL DEFAULT 250,
  settlement_cycle text NOT NULL DEFAULT 'monthly',
  settlement_method text NOT NULL DEFAULT 'manual',
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expired_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_levels_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT platform_partner_levels_recharge_rate_check CHECK (tenant_recharge_commission_bps BETWEEN 0 AND 10000),
  CONSTRAINT platform_partner_levels_lead_rate_check CHECK (lead_service_fee_commission_bps BETWEEN 0 AND 10000),
  CONSTRAINT platform_partner_levels_service_fee_rate_check CHECK (lead_service_fee_default_rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT platform_partner_levels_settlement_cycle_check CHECK (settlement_cycle = 'monthly'),
  CONSTRAINT platform_partner_levels_settlement_method_check CHECK (settlement_method = 'manual')
);

CREATE TABLE IF NOT EXISTS public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject_type text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  level_id uuid NOT NULL REFERENCES public.platform_partner_levels(id),
  region_codes text[] NOT NULL DEFAULT '{}'::text[],
  contract_status text NOT NULL DEFAULT 'pending',
  settlement_account_status text NOT NULL DEFAULT 'pending',
  settlement_account jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partners_status_check CHECK (status IN ('pending', 'active', 'suspended', 'terminated')),
  CONSTRAINT platform_partners_subject_type_check CHECK (subject_type IN ('personal', 'individual_business', 'company'))
);

CREATE TABLE IF NOT EXISTS public.platform_partner_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  code text NOT NULL UNIQUE,
  region_code text NULL,
  campaign_code text NULL,
  status text NOT NULL DEFAULT 'active',
  scan_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  approved_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_invite_codes_status_check CHECK (status IN ('active', 'disabled', 'expired'))
);

CREATE TABLE IF NOT EXISTS public.tenant_partner_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  invite_code_id uuid NULL REFERENCES public.platform_partner_invite_codes(id),
  source_type text NOT NULL,
  source_id text NULL,
  status text NOT NULL DEFAULT 'active',
  bound_at timestamptz NOT NULL DEFAULT now(),
  unbound_at timestamptz NULL,
  changed_by_employee_id uuid NULL REFERENCES public.employees(id),
  change_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_partner_bindings_status_check CHECK (status IN ('active', 'pending_transfer', 'ended')),
  CONSTRAINT tenant_partner_bindings_source_type_check CHECK (source_type IN ('invite_code', 'manual', 'lead_source'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_partner_bindings_one_active_idx
  ON public.tenant_partner_bindings(tenant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.platform_revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_type text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  partner_id uuid NULL REFERENCES public.platform_partners(id),
  partner_level_id uuid NULL REFERENCES public.platform_partner_levels(id),
  binding_id uuid NULL REFERENCES public.tenant_partner_bindings(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  gross_amount_fen bigint NOT NULL,
  revenue_amount_fen bigint NOT NULL,
  paid_amount_fen bigint NOT NULL DEFAULT 0,
  service_fee_rate_bps integer NULL,
  commission_rate_bps integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz NULL,
  paid_at timestamptz NULL,
  refundable_until timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_revenue_events_type_check CHECK (revenue_type IN ('tenant_recharge', 'lead_service_fee')),
  CONSTRAINT platform_revenue_events_status_check CHECK (status IN ('pending', 'confirmed', 'refunded', 'reversed', 'blocked')),
  CONSTRAINT platform_revenue_events_amount_check CHECK (gross_amount_fen >= 0 AND revenue_amount_fen >= 0 AND paid_amount_fen >= 0),
  CONSTRAINT platform_revenue_events_rate_check CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT platform_revenue_events_service_fee_rate_check CHECK (service_fee_rate_bps IS NULL OR service_fee_rate_bps BETWEEN 0 AND 10000)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_events_source_unique_idx
  ON public.platform_revenue_events(revenue_type, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  revenue_event_id uuid NOT NULL REFERENCES public.platform_revenue_events(id),
  revenue_type text NOT NULL,
  base_amount_fen bigint NOT NULL,
  commission_rate_bps integer NOT NULL,
  commission_amount_fen bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NULL,
  settlement_batch_id uuid NULL,
  blocked_reason text NULL,
  failure_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_commission_ledger_status_check CHECK (status IN ('pending', 'blocked', 'available', 'settling', 'settled', 'failed', 'reversed')),
  CONSTRAINT partner_commission_ledger_amount_check CHECK (base_amount_fen >= 0 AND commission_amount_fen >= 0),
  CONSTRAINT partner_commission_ledger_rate_check CHECK (commission_rate_bps BETWEEN 0 AND 10000)
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_ledger_event_unique_idx
  ON public.partner_commission_ledger(revenue_event_id);

CREATE TABLE IF NOT EXISTS public.partner_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount_fen bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  settlement_method text NOT NULL DEFAULT 'manual',
  payment_reference text NULL,
  payment_proof_url text NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id),
  paid_by_employee_id uuid NULL REFERENCES public.employees(id),
  paid_at timestamptz NULL,
  remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_settlement_batches_status_check CHECK (status IN ('draft', 'reviewing', 'paid', 'canceled')),
  CONSTRAINT partner_settlement_batches_method_check CHECK (settlement_method = 'manual'),
  CONSTRAINT partner_settlement_batches_period_check CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.partner_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.partner_settlement_batches(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES public.partner_commission_ledger(id),
  revenue_event_id uuid NOT NULL REFERENCES public.platform_revenue_events(id),
  amount_fen bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_settlement_items_amount_check CHECK (amount_fen >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_settlement_items_ledger_unique_idx
  ON public.partner_settlement_items(ledger_id);

DO $$
BEGIN
  ALTER TABLE public.partner_commission_ledger
    ADD CONSTRAINT partner_commission_ledger_settlement_batch_fk
    FOREIGN KEY (settlement_batch_id)
    REFERENCES public.partner_settlement_batches(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.platform_partner_levels (
  code,
  name,
  tenant_recharge_commission_bps,
  lead_service_fee_commission_bps,
  lead_service_fee_default_rate_bps,
  settlement_cycle,
  settlement_method,
  sort_order,
  requirements
)
VALUES
  ('certified_partner', '认证合伙人', 1000, 2500, 250, 'monthly', 'manual', 10, '{"description":"完成主体认证和合作协议"}'::jsonb),
  ('city_partner', '城市合伙人', 1500, 3500, 250, 'monthly', 'manual', 20, '{"description":"有效装企数和月平台收入达标"}'::jsonb),
  ('city_operation_center', '城市运营中心', 2000, 4500, 250, 'monthly', 'manual', 30, '{"description":"具备团队化区域运营能力"}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tenant_recharge_commission_bps = EXCLUDED.tenant_recharge_commission_bps,
  lead_service_fee_commission_bps = EXCLUDED.lead_service_fee_commission_bps,
  lead_service_fee_default_rate_bps = EXCLUDED.lead_service_fee_default_rate_bps,
  settlement_cycle = EXCLUDED.settlement_cycle,
  settlement_method = EXCLUDED.settlement_method,
  sort_order = EXCLUDED.sort_order,
  requirements = EXCLUDED.requirements,
  updated_at = now();
```

- [ ] **Step 2: Add indexes for list and reconciliation paths**

Append these indexes in the same migration:

```sql
CREATE INDEX IF NOT EXISTS platform_partners_status_created_idx
  ON public.platform_partners(status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partners_phone_idx
  ON public.platform_partners(phone);

CREATE INDEX IF NOT EXISTS platform_partner_invite_codes_partner_idx
  ON public.platform_partner_invite_codes(partner_id, status);

CREATE INDEX IF NOT EXISTS tenant_partner_bindings_partner_idx
  ON public.tenant_partner_bindings(partner_id, status, bound_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_partner_created_idx
  ON public.platform_revenue_events(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_tenant_created_idx
  ON public.platform_revenue_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_status_created_idx
  ON public.platform_revenue_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_commission_ledger_partner_status_idx
  ON public.partner_commission_ledger(partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_settlement_batches_partner_period_idx
  ON public.partner_settlement_batches(partner_id, period_start DESC, period_end DESC);
```

- [ ] **Step 3: Run the migration contract test**

```bash
bun test apps/api/src/services/platform-partners.test.ts
```

Expected result: pass.

---

## Task 3: Add Domain Permissions

**Files:**

- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] **Step 1: Add permission code values**

Add these codes to `PERMISSION_CODE_VALUES`:

```ts
"platform.partner.read",
"platform.partner.manage",
"platform.partner.level.manage",
"platform.partner.binding.manage",
"platform.partner.revenue.read",
"platform.partner.revenue.manage",
"platform.partner.commission.read",
"platform.partner.commission.manage",
"platform.partner.settlement.manage",
```

- [ ] **Step 2: Add permission display config**

Add labels to `PermissionCodeConfig`:

```ts
"platform.partner.read": { label: "查看城市合伙人", module: "platform_partner" },
"platform.partner.manage": { label: "管理城市合伙人", module: "platform_partner" },
"platform.partner.level.manage": { label: "管理合伙人等级", module: "platform_partner" },
"platform.partner.binding.manage": { label: "管理合伙人装企绑定", module: "platform_partner" },
"platform.partner.revenue.read": { label: "查看合伙人平台收入", module: "platform_partner" },
"platform.partner.revenue.manage": { label: "管理合伙人平台收入", module: "platform_partner" },
"platform.partner.commission.read": { label: "查看合伙人佣金", module: "platform_partner" },
"platform.partner.commission.manage": { label: "管理合伙人佣金", module: "platform_partner" },
"platform.partner.settlement.manage": { label: "管理合伙人结算", module: "platform_partner" },
```

- [ ] **Step 3: Extend the existing domain permission test**

Add assertions that every new code exists in `PERMISSION_CODE_VALUES` and `PermissionCodeConfig`.

- [ ] **Step 4: Verify domain package**

```bash
pnpm --filter @gooes/domain test
pnpm --filter @gooes/domain typecheck
```

If the domain package has no test script in the current checkout, run the existing package-level check command shown by `pnpm --filter @gooes/domain run`.

---

## Task 4: Add Partner Schemas

**Files:**

- Create: `apps/api/src/schema/platform-partners.ts`

- [ ] **Step 1: Define list and mutation schemas**

Use `PaginationQuerySchema` and strict object schemas:

```ts
import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformPartnerStatusSchema = z.enum([
  "pending",
  "active",
  "suspended",
  "terminated",
]);

export const PlatformPartnerListQuerySchema = PaginationQuerySchema.extend({
  status: PlatformPartnerStatusSchema.optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
});

export const PlatformPartnerCreateSchema = z.object({
  name: z.string().trim().min(1, "合伙人名称不能为空").max(120, "合伙人名称不能超过 120 个字符"),
  subject_type: z.enum(["personal", "individual_business", "company"]),
  contact_name: z.string().trim().min(1, "联系人不能为空").max(60, "联系人不能超过 60 个字符"),
  phone: z.string().trim().min(6, "手机号不能为空").max(30, "手机号不能超过 30 个字符"),
  level_id: z.uuid("无效的合伙人等级 ID"),
  region_codes: z.array(z.string().trim().min(1).max(12)).default([]),
  contract_status: z.string().trim().max(40).default("pending"),
  settlement_account_status: z.string().trim().max(40).default("pending"),
  settlement_account: z.record(z.string(), z.unknown()).default({}),
  remark: z.string().trim().max(500).optional(),
}).strict();

export const PlatformPartnerUpdateSchema = PlatformPartnerCreateSchema.partial().strict();

export const PlatformPartnerIdParamSchema = z.object({
  id: z.uuid("无效的合伙人 ID"),
});

export const PlatformPartnerStatusUpdateSchema = z.object({
  status: PlatformPartnerStatusSchema,
  reason: z.string().trim().min(1, "状态变更原因不能为空").max(300, "状态变更原因不能超过 300 个字符"),
}).strict();

export const PlatformPartnerInviteCodeCreateSchema = z.object({
  region_code: z.string().trim().max(12, "区域编码不能超过 12 个字符").optional(),
  campaign_code: z.string().trim().max(80, "活动编码不能超过 80 个字符").optional(),
  expires_at: z.string().datetime("过期时间格式无效").optional(),
}).strict();

export const TenantPartnerBindingCreateSchema = z.object({
  tenant_id: z.uuid("无效的租户 ID"),
  partner_id: z.uuid("无效的合伙人 ID"),
  invite_code_id: z.uuid("无效的邀请码 ID").optional(),
  source_type: z.enum(["invite_code", "manual", "lead_source"]),
  source_id: z.string().trim().max(120, "来源 ID 不能超过 120 个字符").optional(),
  change_reason: z.string().trim().min(1, "绑定原因不能为空").max(300, "绑定原因不能超过 300 个字符"),
}).strict();

export type PlatformPartnerListQuery = z.infer<typeof PlatformPartnerListQuerySchema>;
export type PlatformPartnerCreateInput = z.infer<typeof PlatformPartnerCreateSchema>;
export type PlatformPartnerUpdateInput = z.infer<typeof PlatformPartnerUpdateSchema>;
export type PlatformPartnerStatusUpdateInput = z.infer<typeof PlatformPartnerStatusUpdateSchema>;
export type PlatformPartnerInviteCodeCreateInput = z.infer<typeof PlatformPartnerInviteCodeCreateSchema>;
export type TenantPartnerBindingCreateInput = z.infer<typeof TenantPartnerBindingCreateSchema>;
```

- [ ] **Step 2: Confirm page size max comes from the existing pagination schema**

Read `apps/api/src/schema/request.ts`. If `PaginationQuerySchema` already caps `pageSize` at `100`, reuse it. If it does not, update that shared schema only after checking all callers.

---

## Task 5: Add Partner Repository And Service

**Files:**

- Create: `apps/api/src/repositories/platform-partners.ts`
- Create: `apps/api/src/services/platform-partners.ts`
- Test: `apps/api/src/services/platform-partners.test.ts`

- [ ] **Step 1: Implement repository methods with bounded selects**

Repository methods:

```ts
listPartners(input: { page: number; pageSize: number; status?: string; keyword?: string; region_code?: string })
findPartnerById(partnerId: string)
listLevels()
createPartner(input)
updatePartner(partnerId: string, input)
updatePartnerStatus(partnerId: string, input)
createInviteCode(input)
listInviteCodes(partnerId: string)
createTenantBinding(input)
findActiveTenantBinding(tenantId: string)
listTenantBindings(input: { page: number; pageSize: number; partner_id?: string; tenant_id?: string })
```

Every list method must use `.select(..., { count: "exact" })`, `.order(...)`, and `.range(from, to)`.

- [ ] **Step 2: Implement service authorization and business rules**

Service rules:

- Read methods require platform admin.
- Mutating partner, invite code, and binding methods require `authContext.employeeId`.
- Creating a binding must reject tenants that already have an active binding.
- Creating an invite code requires an active partner.
- Suspending or terminating a partner must not delete historical bindings or ledgers.
- All business errors must use `Errors.badRequest()` or `Errors.forbidden()`.

- [ ] **Step 3: Add service unit tests with repository doubles**

Add tests for:

- Non-platform admin is forbidden.
- Creating a binding rejects an existing active tenant binding.
- Creating an invite code rejects a suspended partner.
- Status change preserves historical data by calling only the status update repository method.

- [ ] **Step 4: Verify service tests**

```bash
bun test apps/api/src/services/platform-partners.test.ts
```

---

## Task 6: Add Partner Controller And Routes

**Files:**

- Create: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Implement controller methods**

Routes:

```text
GET    /platform/partners
POST   /platform/partners
GET    /platform/partners/levels
GET    /platform/partners/:id
PATCH  /platform/partners/:id
PATCH  /platform/partners/:id/status
POST   /platform/partners/:id/invite-codes
GET    /platform/partners/:id/invite-codes
GET    /platform/partner-bindings
POST   /platform/partner-bindings
```

Controller behavior:

- Extend `PlatformBaseController`.
- Use `getRequiredPlatformAdminContext(request)`.
- Parse `request.query`, `request.params`, and `request.body` with the schemas from `platform-partners.ts`.
- Return all success responses through `ResponseHandler.success(reply, data)`.

- [ ] **Step 2: Register routes**

Add import and register call in `apps/api/src/routes/index.ts`:

```ts
import PlatformPartnersController from "@/controllers/platform-partners";

PlatformPartnersController.registerExtraRoutes(app);
```

- [ ] **Step 3: Run API typecheck**

```bash
pnpm --dir apps/api run typecheck
```

If the API package only exposes Bun scripts in the current checkout, use the package's existing typecheck command from `apps/api/package.json`.

---

## Task 7: Add Revenue And Commission Schemas

**Files:**

- Create: `apps/api/src/schema/platform-partner-revenue.ts`

- [ ] **Step 1: Define list and creation schemas**

Create schemas for:

```text
PlatformRevenueEventListQuerySchema
PartnerCommissionLedgerListQuerySchema
PartnerSettlementBatchListQuerySchema
LeadServiceFeeRevenueCreateSchema
RechargeRevenueSyncSchema
PartnerSettlementBatchCreateSchema
PartnerSettlementBatchMarkPaidSchema
```

Core schema values:

```ts
export const LeadServiceFeeRevenueCreateSchema = z.object({
  platform_lead_id: z.uuid("无效的平台线索 ID"),
  tenant_id: z.uuid("无效的租户 ID"),
  customer_id: z.uuid("无效的客户 ID").optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
  contract_amount_fen: z.coerce.number().int().min(1, "装修成交金额必须大于 0"),
  service_fee_rate_bps: z.coerce.number().int().min(0).max(10000).default(250),
  paid_amount_fen: z.coerce.number().int().min(0, "到账金额不能小于 0"),
  paid_at: z.string().datetime("到账时间格式无效").optional(),
  evidence_urls: z.array(z.string().url("凭证地址无效")).default([]),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
}).strict();

export const PartnerSettlementBatchCreateSchema = z.object({
  partner_id: z.uuid("无效的合伙人 ID"),
  period_start: z.string().date("结算开始日期格式无效"),
  period_end: z.string().date("结算结束日期格式无效"),
  ledger_ids: z.array(z.uuid("无效的佣金账本 ID")).min(1, "结算明细不能为空"),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
}).strict();

export const PartnerSettlementBatchMarkPaidSchema = z.object({
  payment_reference: z.string().trim().min(1, "付款流水不能为空").max(120, "付款流水不能超过 120 个字符"),
  payment_proof_url: z.string().url("付款凭证地址无效").optional(),
  paid_at: z.string().datetime("付款时间格式无效"),
  remark: z.string().trim().max(500, "备注不能超过 500 个字符").optional(),
}).strict();
```

---

## Task 8: Add Revenue And Commission Service

**Files:**

- Create: `apps/api/src/repositories/platform-partner-revenue.ts`
- Create: `apps/api/src/services/platform-partner-revenue.ts`
- Create: `apps/api/src/services/platform-partner-revenue.test.ts`

- [ ] **Step 1: Implement repository methods**

Repository methods:

```ts
listRevenueEvents(input)
listCommissionLedger(input)
listSettlementBatches(input)
findActiveTenantBinding(tenantId: string)
findPartnerLevel(levelId: string)
createRevenueEvent(input)
createCommissionLedger(input)
createSettlementBatch(input)
createSettlementItems(input)
markLedgersSettling(input)
markSettlementPaid(input)
markLedgersSettled(input)
findPaidRechargeOrdersWithoutRevenue(input)
```

Every list query must select only required columns and use `.range()`.

- [ ] **Step 2: Implement lead service fee revenue creation**

Rules:

- Default `service_fee_rate_bps` to `250`.
- Calculate `revenue_amount_fen = Math.floor(contract_amount_fen * service_fee_rate_bps / 10000)`.
- Require an active tenant-partner binding unless the platform admin explicitly selects a partner in the input.
- Snapshot partner level and commission rate at revenue event creation.
- Create one `partner_commission_ledger` row if the revenue event is confirmed.
- Commission amount is `Math.floor(revenue_amount_fen * commission_rate_bps / 10000)`.
- Do not include any tenant construction contract payment as platform revenue; only the platform service fee is the commission base.

- [ ] **Step 3: Implement recharge revenue sync**

Rules:

- Sync only paid recharge orders.
- Use the tenant's active binding at paid time.
- Create one revenue event per recharge order with `revenue_type = "tenant_recharge"`.
- Use the partner level's `tenant_recharge_commission_bps`.
- Ignore gift credits, compensation credits, test orders, and refunded orders.
- Re-running sync must be idempotent through the unique revenue source index.

- [ ] **Step 4: Implement monthly manual settlement**

Rules:

- Batch period must be a full natural month or a subset of one natural month selected by finance.
- All selected ledgers must belong to the same partner.
- Only `available` ledgers can enter a batch.
- Creating a batch marks ledgers as `settling`.
- Marking a batch paid requires `payment_reference`, `paid_at`, and the current employee ID.
- Marking paid sets batch `status = "paid"` and selected ledgers `status = "settled"`.
- Canceling a draft or reviewing batch returns ledgers to `available`.

- [ ] **Step 5: Add unit tests**

Test:

- Lead service fee defaults to 2.5%.
- Lead service fee commission base uses service fee, not construction contract amount.
- Recharge sync is idempotent.
- Settlement rejects ledgers from multiple partners.
- Mark paid requires an employee ID and payment reference.

- [ ] **Step 6: Verify revenue service tests**

```bash
bun test apps/api/src/services/platform-partner-revenue.test.ts
```

---

## Task 9: Add Revenue Controller And Routes

**Files:**

- Create: `apps/api/src/controllers/platform-partner-revenue/index.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Implement controller routes**

Routes:

```text
GET  /platform/partner-revenue/events
POST /platform/partner-revenue/lead-service-fees
POST /platform/partner-revenue/recharge-events/sync
GET  /platform/partner-commissions
GET  /platform/partner-settlements
POST /platform/partner-settlements/monthly-batches
POST /platform/partner-settlements/:id/mark-paid
```

- [ ] **Step 2: Register routes**

Add import and register call in `apps/api/src/routes/index.ts`:

```ts
import PlatformPartnerRevenueController from "@/controllers/platform-partner-revenue";

PlatformPartnerRevenueController.registerExtraRoutes(app);
```

- [ ] **Step 3: Run API verification**

```bash
bun test apps/api/src/services/platform-partners.test.ts apps/api/src/services/platform-partner-revenue.test.ts
pnpm --dir apps/api run typecheck
```

---

## Task 10: Add Admin Navigation And Partner List Page

**Files:**

- Modify: `apps/admin/components/layout/menu-config.ts`
- Create: `apps/admin/app/(console)/platform/partners/page.tsx`
- Create: `apps/admin/app/(console)/platform/partners/loading.tsx`
- Create: `apps/admin/components/platform-partners/platform-partner-types.ts`
- Create: `apps/admin/components/platform-partners/platform-partner-list-actions.tsx`
- Create: `apps/admin/components/platform-partners/platform-partners-table.tsx`
- Create: `apps/admin/components/platform-partners/platform-partner-mutations.tsx`

- [ ] **Step 1: Add menu item**

Add an item in the `平台运营` group:

```ts
{ href: "/platform/partners", label: "城市合伙人", icon: Handshake },
```

Import `Handshake` from `lucide-react`.

- [ ] **Step 2: Implement the partner list page**

Use the current platform list pattern from `apps/admin/app/(console)/platform/tenants/page.tsx`:

- `PlatformListPageShell`.
- `normalizePlatformListPageSize`.
- shadcn `Card`, `Badge`, `Button`, `Input`, `Select`, `Dialog`, and `Table` wrappers already used in admin.
- Server-side `fetch(buildBackendUrl(...), { cache: "no-store" })`.
- `getAdminSession()` and `getAdminToken()`.
- Platform access guard with `session.roles.includes("platform_admin")`.

List filters:

```text
keyword
status
region_code
page
pageSize
```

Remove explanatory list-header text under the table title. The header should stay compact like the recently adjusted platform pages.

- [ ] **Step 3: Implement mutations**

Dialogs/actions:

- Create partner.
- Edit partner.
- Change partner status with reason.
- Generate invite code.
- Copy invite URL.

All mutation requests go through `/api/backend/platform/...` and use the existing admin request helper pattern.

---

## Task 11: Add Admin Partner Detail Page

**Files:**

- Create: `apps/admin/app/(console)/platform/partners/[id]/page.tsx`
- Modify or create supporting components under `apps/admin/components/platform-partners/`

- [ ] **Step 1: Show partner profile and operational state**

Sections:

- Basic profile.
- Level and rates snapshot.
- Region codes.
- Contract and settlement account status.
- Active invite codes.
- Bound tenants.
- Revenue summary.
- Commission summary.

- [ ] **Step 2: Keep UI operational, not marketing-style**

Use dense admin layout:

- Compact cards for repeated summary metrics only.
- Tables for invite codes and bound tenants.
- No nested cards.
- No large hero section.
- shadcn components for tabs, dialogs, forms, badges, select controls, and buttons.

---

## Task 12: Add Revenue And Settlement Admin Pages

**Files:**

- Create: `apps/admin/app/(console)/platform/partners/revenue/page.tsx`
- Create: `apps/admin/app/(console)/platform/partners/settlements/page.tsx`
- Create: `apps/admin/components/platform-partners/platform-partner-revenue-table.tsx`
- Create: `apps/admin/components/platform-partners/platform-partner-settlement-table.tsx`

- [ ] **Step 1: Add revenue page**

Tabs using shadcn `Tabs`:

```text
收入事件
佣金账本
```

Actions:

- Confirm lead service fee revenue.
- Sync paid recharge revenue events.
- Freeze or release commission ledger rows when service methods are available.

Filters:

```text
partner
tenant
revenue_type
status
date range
keyword
```

- [ ] **Step 2: Add settlement page**

Tabs using shadcn `Tabs`:

```text
可结算
结算批次
```

Actions:

- Generate monthly manual settlement batch.
- Review batch.
- Mark paid.
- Upload or record payment proof URL.

First release text in the page should be concise and operational:

```text
月结人工结算
```

Avoid long explanatory paragraphs in the page body.

---

## Task 13: Add Mini-Program Handoff Document

**Files:**

- Create: `docs/miniprogram/2026-07-04-city-partner-qr-handoff.md`

- [ ] **Step 1: Document QR contract without changing orange**

Include:

- Partner invite URL format.
- Query keys:

```text
partner_invite_code
region_code
campaign_code
```

- Expected mini-program behavior:
  - Read invite code from scene/query.
  - Preserve invite code through company onboarding form.
  - Submit invite code to the backend onboarding API once that endpoint is provided.
  - Do not allow an existing tenant to overwrite partner binding automatically.

- [ ] **Step 2: Add backend assumptions**

Document that gooes will expose invite code lookup and tenant binding behavior under `/platform/partners` and `/platform/partner-bindings` for admin operations. Public onboarding API work needs a separate backend contract before the mini-program team starts integration.

---

## Task 14: Update Platform Layout Tests

**Files:**

- Modify: `apps/admin/components/platform/platform-list-page-layout.test.ts`

- [ ] **Step 1: Add partner pages to layout checks**

Extend existing platform list layout assertions to include:

```text
../../app/(console)/platform/partners/page.tsx
../../app/(console)/platform/partners/revenue/page.tsx
../../app/(console)/platform/partners/settlements/page.tsx
```

- [ ] **Step 2: Add shadcn tabs assertion**

Assert revenue and settlement pages import tabs from `@/components/ui/tabs`, matching the updated platform pages.

---

## Task 15: Verification

**Files:**

- All files touched by tasks above.

- [ ] **Step 1: Run focused API tests**

```bash
bun test apps/api/src/services/platform-partners.test.ts apps/api/src/services/platform-partner-revenue.test.ts
```

- [ ] **Step 2: Run API typecheck**

```bash
pnpm --dir apps/api run typecheck
```

- [ ] **Step 3: Run admin checks**

```bash
pnpm --dir apps/admin run check
```

- [ ] **Step 4: Run domain checks**

```bash
pnpm --filter @gooes/domain run typecheck
```

- [ ] **Step 5: Verify migration status before applying remotely**

```bash
supabase migration list
```

Confirm the new migration appears locally. Before applying to a remote database, confirm the exact migration list and the rollback plan with the owner.

- [ ] **Step 6: Run whitespace and diff checks**

```bash
git diff --check
git status --short --branch
```

## Rollback Plan

- If the migration has not been applied remotely, revert the migration file and related code in one commit.
- If the migration has been applied remotely and no production data exists, add a follow-up migration that drops the new city partner tables in reverse dependency order.
- If production data exists, do not drop tables. Add a follow-up migration that disables partner menu access, marks new partner records inactive, and leaves revenue and settlement audit records intact.

## Acceptance Criteria

- Platform admin can create and manage partner levels, partners, invite codes, and tenant bindings.
- A tenant can have at most one active partner binding.
- Lead service fee revenue defaults to 2.5% and calculates partner commission from platform service fee only.
- Paid tenant recharge orders can generate idempotent partner revenue events when a tenant has an active partner binding.
- Commission ledger rows snapshot partner, level, revenue type, base amount, rate, and commission amount.
- Monthly manual settlement batches can be generated, reviewed, marked paid, and traced back to revenue events.
- No automatic WeChat Pay profit sharing is triggered in MVP.
- Admin pages use existing platform shell patterns and shadcn components.
- All new list endpoints are paginated and cap `pageSize` at `100`.
