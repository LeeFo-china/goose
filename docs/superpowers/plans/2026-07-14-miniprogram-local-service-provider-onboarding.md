# 小程序本地服务商自主入驻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立装修公司自主申请、平台终审、城市合伙人非阻断协查、审核通过后原子创建租户并归因，以及发布后按 visitor 定位区域实时展示本地服务商的完整后端与后台能力。

**Architecture:** 新建独立装企入驻申请、审核记录和服务商公开资料模型；申请人与 visitor、合伙人与 `partner_id`、平台审核人与权限分别隔离。申请提交只持久化申请，平台通过由 PostgreSQL RPC 在单事务内创建租户、管理员、默认组织、初始服务区域、可选合伙人绑定和 draft 公开资料。visitor 本地服务商列表从有效定位上下文实时分页查询 `published` 服务商，不再以小程序本地候选快照作为最终列表。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod、Supabase/PostgreSQL migrations 与 RPC、Next.js 15、React、shadcn/Radix、Tailwind、Bun test。

---

## Scope and execution order

该规格包含三个依赖顺序明确的子系统，保留在同一主计划中，但实施时按检查点交付：

1. **Backend checkpoint:** 数据模型、申请 API、平台终审、合伙人协查、服务商发布和 visitor 实时列表可通过 API 独立验收。
2. **Admin checkpoint:** gooes 平台后台和租户后台能够操作上述 API。
3. **Mini-program handoff checkpoint:** gooes 只生成 orange 的精确对接文档；orange 仓库保持只读，由小程序团队实施。

本计划不修改公开项目的区域展示规则，不实现已有租户认领/绑定转移，不引入 OCR、征信、
Redis、消息队列或新外部依赖。

在执行 Task 1 前使用 `using-git-worktrees` 创建隔离 worktree。不要直接在当前 `main` 上实施代码。

## File responsibility map

### Database and shared domain

- Create: `supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql`
  - application/review/profile/notification tables、租户主体字段、权限、约束和索引。
- Create: `supabase/migrations/20260714220000_create_tenant_onboarding_approval_rpc.sql`
  - 原子终审开通 RPC 和初始化 helper。
- Create: `supabase/migrations/20260714230000_create_service_provider_publication_rpc.sql`
- Create: `apps/api/src/services/tenant-service-provider-publication-migration.test.ts`
  - 服务商发布/退回事务和实时列表索引。
- Modify: `packages/domain/src/permission.ts`
  - 新增平台终审、平台发布、租户服务商资料权限。
- Modify: `packages/domain/src/permission.test.ts`
  - 固化权限代码和模块归属。
- Modify: `apps/api/src/types/database.ts`
  - migration 应用后从目标数据库机械生成，不手写新增表/RPC 类型。

### API

- Create: `apps/api/src/schema/tenant-onboarding.ts`
  - applicant、platform、partner 和 publication 请求 schema。
- Create: `apps/api/src/repositories/tenant-onboarding.ts`
  - 申请、审核记录、候选合伙人和审批 RPC 访问。
- Create: `apps/api/src/repositories/tenant-onboarding-notifications.ts`
  - 通知投递去重、状态和重试记录。
- Create: `apps/api/src/repositories/tenant-service-providers.ts`
  - 公开资料、服务区域与 visitor 实时分页查询。
- Create: `apps/api/src/services/tenant-onboarding-region-match.ts`
  - 行政区父子解析和唯一候选选择。
- Create: `apps/api/src/services/tenant-onboarding-applications.ts`
  - visitor 提交、查看、补资料和撤回。
- Create: `apps/api/src/services/tenant-onboarding-review.ts`
  - 平台终审和归因确认。
- Create: `apps/api/src/services/tenant-onboarding-notifications.ts`
  - 事务后短信通知、失败记录和后台重发。
- Create: `apps/api/src/services/tenant-onboarding-partner-assist.ts`
  - 合伙人任务列表、详情和非阻断协查。
- Create: `apps/api/src/services/tenant-service-providers.ts`
  - 租户资料维护、平台发布和 visitor 列表。
- Create: `apps/api/src/controllers/tenant-onboarding/index.ts`
  - visitor applicant HTTP routes。
- Create: `apps/api/src/controllers/platform-tenant-onboarding/index.ts`
  - 平台审核与发布 HTTP routes。
- Create: `apps/api/src/controllers/partner-onboarding-applications/index.ts`
  - 合伙人协查 HTTP routes。
- Create: `apps/api/src/controllers/tenant-service-provider/index.ts`
  - 租户公开资料 HTTP routes。
- Create: `apps/api/src/controllers/visitor-local-service-providers/index.ts`
  - visitor 实时分页列表。
- Modify: `apps/api/src/controllers/uploads/index.ts`
  - visitor 营业执照私有直传。
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/shared.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/paths.ts`
- Modify: `apps/api/src/repositories/platform-file-objects.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/paths.ts`
  - 支持按 scene 注册 `private` visibility，并为 visitor 私有路径增加隔离段。
- Modify: `apps/api/src/repositories/platform-file-objects.ts`
  - 私有申请资料以 `owner_visitor_id` 建立可查询所有权。
- Modify: `apps/api/src/services/files/file-url-resolver.ts`
  - 平台审核使用强制签名且最长 10 分钟的私有读取 URL。
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
  - 新 visitor/partner route 分类，移除长期公开申请依赖。
- Modify: `apps/api/src/routes/index.ts`
  - 注册新 controllers。
- Modify: `apps/api/src/errors/error-codes.ts`
  - 稳定业务错误码。
- Modify: `apps/api/src/schema/platform-audit-logs.ts`
  - 审核、协查、发布审计 action。
- Modify: `apps/api/src/services/sms/legacy/shared.ts`
- Modify: `apps/api/src/services/sms/legacy/config.ts`
  - 独立入驻状态通知模板用途，不复用验证码模板。

### Admin

- Create: `apps/admin/app/(console)/platform/tenant-onboarding/page.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-types.ts`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-filters.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-table.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-actions.tsx`
- Create: `apps/admin/components/tenant-onboarding/service-provider-publication-table.tsx`
  - 平台申请队列、详情、补资料、通过、驳回和发布审核。
- Create: `apps/admin/app/(console)/settings/service-provider/page.tsx`
- Create: `apps/admin/components/service-provider/service-provider-workspace.tsx`
- Create: `apps/admin/components/service-provider/service-provider-actions.tsx`
- Create: `apps/admin/components/service-provider/service-provider-types.ts`
  - 租户公开资料、服务区域和提交发布。
- Modify: `apps/admin/components/layout/menu-config.ts`
  - 平台和租户菜单入口。
- Modify: `apps/admin/components/platform/platform-list-page-layout.test.ts`
  - 平台列表布局契约。

### Handoff and compatibility

- Create: `docs/2026-07-14-local-service-provider-onboarding-miniprogram-handoff.md`
  - orange 精确 API、字段、页面、状态和 smoke 清单。
- Modify: `docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md`
  - 标注旧即时开通接口 deprecated 和 14 日兼容窗口。
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/services/platform-partner-tenant-onboarding.ts`
  - 保持旧客户端兼容语义并增加到期 `410` 关闭门禁。

---

### Task 1: Lock shared permissions and migration contract

**Files:**
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Create: `apps/api/src/services/tenant-onboarding-migration-contract.test.ts`
- Create: `supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql`

- [ ] **Step 1: Write failing domain permission tests**

Add this assertion to `packages/domain/src/permission.test.ts`:

```ts
test("exposes tenant onboarding and service provider permissions", () => {
  expect(PermissionCodeConfig["platform.tenant_onboarding.review"]).toEqual({
    label: "审核装企入驻",
    module: "platform_tenant_onboarding",
  });
  expect(PermissionCodeConfig["platform.service_provider.publish"]).toEqual({
    label: "审核服务商发布",
    module: "platform_tenant_onboarding",
  });
  expect(PermissionCodeConfig["service_provider.profile.read"]).toEqual({
    label: "查看服务商资料",
    module: "service_provider",
  });
  expect(PermissionCodeConfig["service_provider.profile.manage"]).toEqual({
    label: "管理服务商资料",
    module: "service_provider",
  });
});
```

- [ ] **Step 2: Write a failing migration contract test**

Create `apps/api/src/services/tenant-onboarding-migration-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql",
);

describe("tenant onboarding workflow migration", () => {
  test("creates applications, reviews, profiles, constraints, and indexes", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_onboarding_applications");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_onboarding_application_reviews");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_service_provider_profiles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.tenant_onboarding_notification_deliveries");
    expect(sql).toContain("tenant_onboarding_applications_open_subject_unique_idx");
    expect(sql).toContain("platform_partners_region_codes_gin_idx");
    expect(sql).toContain("owner_visitor_id");
    expect(sql).toContain("expire_tenant_onboarding_partner_assists");
    expect(sql).toContain("'region_auto_assignment'");
    expect(sql).toContain("'platform.tenant_onboarding.review'");
    expect(sql).toContain("'service_provider.profile.manage'");
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
bun test packages/domain/src/permission.test.ts apps/api/src/services/tenant-onboarding-migration-contract.test.ts
```

Expected: FAIL because the permission codes and migration file do not exist.

- [ ] **Step 4: Add permission constants**

Add these exact values to `PERMISSION_CODE_VALUES` and `PermissionCodeConfig`:

```ts
"platform.tenant_onboarding.review",
"platform.service_provider.publish",
"service_provider.profile.read",
"service_provider.profile.manage",
```

```ts
"platform.tenant_onboarding.review": {
  label: "审核装企入驻",
  module: "platform_tenant_onboarding",
},
"platform.service_provider.publish": {
  label: "审核服务商发布",
  module: "platform_tenant_onboarding",
},
"service_provider.profile.read": {
  label: "查看服务商资料",
  module: "service_provider",
},
"service_provider.profile.manage": {
  label: "管理服务商资料",
  module: "service_provider",
},
```

- [ ] **Step 5: Create the workflow migration**

The migration must create these exact status constraints and ownership fields:

```sql
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS unified_social_credit_code text NULL;

ALTER TABLE public.platform_file_objects
ADD COLUMN IF NOT EXISTS owner_visitor_id text NULL;

CREATE INDEX IF NOT EXISTS platform_file_objects_visitor_scene_idx
ON public.platform_file_objects (owner_visitor_id, scene, created_at DESC)
WHERE owner_visitor_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_unified_social_credit_code_unique_idx
ON public.tenants (upper(btrim(unified_social_credit_code)))
WHERE unified_social_credit_code IS NOT NULL
  AND btrim(unified_social_credit_code) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS tenant_service_areas_tenant_adcode_unique_idx
ON public.tenant_service_areas (tenant_id, adcode)
WHERE adcode IS NOT NULL AND btrim(adcode) <> '';

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_no text NOT NULL UNIQUE,
  visitor_id text NOT NULL,
  visitor_context_id uuid NULL REFERENCES public.user_location_contexts(id) ON DELETE SET NULL,
  company_name text NOT NULL,
  unified_social_credit_code text NOT NULL,
  business_license_file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  admin_name text NOT NULL,
  admin_phone text NOT NULL,
  address_province text NULL,
  address_city text NOT NULL,
  address_district text NULL,
  address_region_code text NOT NULL,
  address text NOT NULL,
  address_latitude double precision NULL,
  address_longitude double precision NULL,
  service_region_codes text[] NOT NULL,
  source_channel text NOT NULL,
  invite_code_id uuid NULL REFERENCES public.platform_partner_invite_codes(id) ON DELETE SET NULL,
  candidate_partner_id uuid NULL REFERENCES public.platform_partners(id) ON DELETE SET NULL,
  candidate_match_reason text NULL,
  candidate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_partner_id uuid NULL REFERENCES public.platform_partners(id) ON DELETE SET NULL,
  attribution_source_type text NULL,
  status text NOT NULL DEFAULT 'submitted',
  partner_assist_status text NOT NULL DEFAULT 'not_applicable',
  partner_assist_requested_at timestamptz NULL,
  partner_assist_due_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  converted_tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  privacy_policy_version text NOT NULL,
  onboarding_terms_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  idempotency_key text NOT NULL,
  withdrawn_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_applications_status_check CHECK (
    status IN ('submitted', 'reviewing', 'supplement_required', 'approved', 'rejected', 'withdrawn')
  ),
  CONSTRAINT tenant_onboarding_applications_assist_status_check CHECK (
    partner_assist_status IN (
      'not_applicable', 'pending', 'verified', 'supplement_suggested', 'not_recommended', 'expired'
    )
  ),
  CONSTRAINT tenant_onboarding_applications_source_check CHECK (
    source_channel IN ('local_services', 'partner_invite')
  ),
  CONSTRAINT tenant_onboarding_applications_regions_check CHECK (
    cardinality(service_region_codes) BETWEEN 1 AND 20
  ),
  CONSTRAINT tenant_onboarding_applications_idempotency_unique UNIQUE (visitor_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboarding_applications_open_subject_unique_idx
ON public.tenant_onboarding_applications (upper(btrim(unified_social_credit_code)))
WHERE status IN ('submitted', 'reviewing', 'supplement_required');

CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboarding_applications_converted_tenant_unique_idx
ON public.tenant_onboarding_applications (converted_tenant_id)
WHERE converted_tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_platform_queue_idx
ON public.tenant_onboarding_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_onboarding_applications_partner_queue_idx
ON public.tenant_onboarding_applications (
  candidate_partner_id, partner_assist_status, partner_assist_due_at, created_at DESC
)
WHERE candidate_partner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.tenant_onboarding_applications(id) ON DELETE RESTRICT,
  review_stage text NOT NULL,
  decision text NOT NULL,
  actor_type text NOT NULL,
  actor_visitor_id text NULL,
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_partner_member_id uuid NULL REFERENCES public.platform_partner_members(id) ON DELETE SET NULL,
  before_status text NULL,
  after_status text NULL,
  before_partner_assist_status text NULL,
  after_partner_assist_status text NULL,
  required_fields text[] NOT NULL DEFAULT '{}'::text[],
  remark text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_reviews_stage_check CHECK (
    review_stage IN ('applicant', 'partner_assist', 'platform_review', 'system')
  ),
  CONSTRAINT tenant_onboarding_reviews_actor_check CHECK (
    actor_type IN ('visitor', 'partner_member', 'platform_employee', 'system')
  )
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_reviews_application_created_idx
ON public.tenant_onboarding_application_reviews (application_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.tenant_service_provider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  public_name text NULL,
  introduction text NULL,
  public_phone text NULL,
  address_province text NULL,
  address_city text NULL,
  address_district text NULL,
  address_region_code text NULL,
  address text NULL,
  address_latitude double precision NULL,
  address_longitude double precision NULL,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  submitted_at timestamptz NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  published_at timestamptz NULL,
  suspended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_provider_profiles_status_check CHECK (
    status IN ('draft', 'pending_review', 'published', 'suspended')
  ),
  CONSTRAINT tenant_service_provider_profiles_latitude_check CHECK (
    address_latitude IS NULL OR address_latitude BETWEEN -90 AND 90
  ),
  CONSTRAINT tenant_service_provider_profiles_longitude_check CHECK (
    address_longitude IS NULL OR address_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX IF NOT EXISTS tenant_service_provider_profiles_status_updated_idx
ON public.tenant_service_provider_profiles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_onboarding_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.tenant_onboarding_applications(id) ON DELETE CASCADE,
  application_version integer NOT NULL,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'sms',
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_onboarding_notification_event_check CHECK (
    event_type IN ('submitted', 'supplement_required', 'approved', 'rejected')
  ),
  CONSTRAINT tenant_onboarding_notification_channel_check CHECK (channel IN ('sms')),
  CONSTRAINT tenant_onboarding_notification_status_check CHECK (
    status IN ('pending', 'sent', 'failed')
  ),
  CONSTRAINT tenant_onboarding_notification_attempts_check CHECK (attempt_count >= 0),
  CONSTRAINT tenant_onboarding_notification_unique UNIQUE (
    application_id, application_version, event_type, channel
  )
);

CREATE INDEX IF NOT EXISTS tenant_onboarding_notifications_application_created_idx
ON public.tenant_onboarding_notification_deliveries (application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_onboarding_notifications_status_updated_idx
ON public.tenant_onboarding_notification_deliveries (status, updated_at DESC);
```

Add a `BEFORE UPDATE OR DELETE` trigger that raises a stable
exception for review rows so history is append-only even through the service role. Add updated-at
triggers, enable RLS on all new tables without anon/authenticated policies, and add the indexes
named by the test; the API accesses them through the existing service-role repository boundary.

The notification table stores no raw phone, token or message body; retry resolves the current
authorized recipient from the application. Add `(status, updated_at)` for bounded platform retry
views.

Create a service-role-only `expire_tenant_onboarding_partner_assists(p_cutoff timestamptz,
p_partner_id uuid DEFAULT NULL)` function. In one transaction it updates only due `pending` rows whose
main status is non-terminal, returns affected IDs, and inserts an `expired` partner-assist review event
for each affected row. Revoke execution from PUBLIC/anon/authenticated.

Drop and recreate `tenant_partner_bindings_source_type_check` with exactly
`invite_code/manual/lead_source/region_auto_assignment/platform_manual/transfer_approved`, preserving
all three historical values from `20260704193000_create_city_partner_mvp.sql`.

Insert the four permissions and grant platform permissions to `platform_admin` roles and
profile permissions to each tenant's `system_admin` role using the existing
`role_permissions` pattern.

- [ ] **Step 6: Run GREEN verification**

Run:

```bash
bun test packages/domain/src/permission.test.ts apps/api/src/services/tenant-onboarding-migration-contract.test.ts
git diff --check
```

Expected: all tests PASS and `git diff --check` exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/permission.ts packages/domain/src/permission.test.ts \
  apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql
git commit -m "feat(onboarding): 建立装企入驻数据模型"
```

### Task 2: Define schemas, records, and stable errors

**Files:**
- Create: `apps/api/src/schema/tenant-onboarding.ts`
- Create: `apps/api/src/repositories/tenant-onboarding-types.ts`
- Create: `apps/api/src/schema/tenant-onboarding.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/schema/platform-audit-logs.ts`

- [ ] **Step 1: Write failing schema tests**

Create tests covering a valid local-services submission, an optional invite code, max 20
service regions, required consent versions, six main statuses, six assist statuses, platform
approval version, supplement fields, and pagination capped at 100:

```ts
import { describe, expect, test } from "bun:test";
import {
  SubmitTenantOnboardingApplicationSchema,
  TenantOnboardingApplicationListQuerySchema,
  ApproveTenantOnboardingApplicationSchema,
} from "./tenant-onboarding";

const validInput = {
  company_name: "固始晴天装饰工程有限公司",
  unified_social_credit_code: "91411525MA9G000000",
  business_license_file_id: "00000000-0000-4000-8000-000000000901",
  admin_name: "王总",
  admin_phone: "13900139000",
  sms_code: "123456",
  company_location: {
    province: "河南省",
    city: "信阳市",
    district: "固始县",
    region_code: "411525",
    address: "蓼城大道 1 号",
    latitude: 32.168,
    longitude: 115.654,
  },
  service_region_codes: ["411525"],
  visitor_context_id: "00000000-0000-4000-8000-000000000801",
  source_channel: "local_services",
  privacy_policy_version: "2026.07",
  onboarding_terms_version: "2026.07",
  agree_privacy: true,
};

describe("tenant onboarding schemas", () => {
  test("accepts a complete applicant payload", () => {
    expect(SubmitTenantOnboardingApplicationSchema.safeParse(validInput).success).toBe(true);
  });

  test("rejects more than 20 service regions", () => {
    const result = SubmitTenantOnboardingApplicationSchema.safeParse({
      ...validInput,
      service_region_codes: Array.from({ length: 21 }, (_, index) => String(410000 + index)),
    });
    expect(result.success).toBe(false);
  });

  test("caps list pages at 100", () => {
    expect(TenantOnboardingApplicationListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  test("requires optimistic version on approval", () => {
    expect(ApproveTenantOnboardingApplicationSchema.safeParse({
      version: 3,
      attribution_mode: "unassigned",
      review_remark: "主体信息核验通过",
    }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/schema/tenant-onboarding.test.ts`.

Expected: FAIL because the schema file does not exist.

- [ ] **Step 3: Implement schemas and types**

Use `PaginationQuerySchema` and export these inferred types:

```ts
const UnifiedSocialCreditCodeSchema = z.string().trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[0-9A-HJ-NPQRTUWXY]{18}$/, "统一社会信用代码格式不正确"));
const MobilePhoneSchema = z.string().trim().regex(/^1[3-9]\d{9}$/, "手机号格式不正确");
const AdministrativeRegionCodeSchema = z.string().regex(/^\d{6}$/, "行政区代码格式不正确");

export const TenantOnboardingApplicationStatusSchema = z.enum([
  "submitted", "reviewing", "supplement_required", "approved", "rejected", "withdrawn",
]);

export const TenantOnboardingPartnerAssistStatusSchema = z.enum([
  "not_applicable", "pending", "verified", "supplement_suggested", "not_recommended", "expired",
]);

export const ApproveTenantOnboardingApplicationSchema = z.object({
  version: z.number().int().positive(),
  attribution_mode: z.enum(["auto", "partner", "unassigned"]),
  final_partner_id: z.uuid("无效的城市合伙人 ID").optional(),
  review_remark: z.string().trim().min(1, "请填写审核说明").max(500),
}).strict().superRefine((value, context) => {
  if (value.attribution_mode === "partner" && !value.final_partner_id) {
    context.addIssue({
      code: "custom",
      path: ["final_partner_id"],
      message: "请选择最终归因合伙人",
    });
  }
});
```

The submission schema uses the constants above, requires 1–20 unique service region codes, latitude
`[-90, 90]`, longitude `[-180, 180]`, non-empty consent versions and `agree_privacy: z.literal(true)`.
Supplement and all review mutations require a positive integer `version`; list schemas extend the
existing `PaginationQuerySchema` so string query values coerce and `pageSize=101` fails.

Create record types in `tenant-onboarding-types.ts` for application, review, partner brief,
profile, pagination and RPC result. Keep repository records snake_case and service responses
identical to API field names; do not introduce duplicate camelCase DTOs.

- [ ] **Step 4: Add stable error and audit codes**

Add these stable values to `ErrorCodes`:

```ts
TENANT_ONBOARDING_APPLICATION_DUPLICATED
TENANT_ONBOARDING_SUBJECT_EXISTS
TENANT_ONBOARDING_PHONE_MEMBER_EXISTS
TENANT_ONBOARDING_LICENSE_REQUIRED
TENANT_ONBOARDING_REGION_INVALID
TENANT_ONBOARDING_STATE_CONFLICT
TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED
TENANT_ONBOARDING_PARTNER_AMBIGUOUS
TENANT_ONBOARDING_REVIEW_FORBIDDEN
TENANT_ONBOARDING_APPLICATION_NOT_FOUND
TENANT_ONBOARDING_DOCUMENT_FORBIDDEN
TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED
```

Add audit actions:

```ts
"tenant_onboarding_submit",
"tenant_onboarding_start_review",
"tenant_onboarding_request_supplement",
"tenant_onboarding_request_partner_assist",
"tenant_onboarding_approve",
"tenant_onboarding_reject",
"tenant_onboarding_withdraw",
"tenant_onboarding_partner_assist",
"tenant_onboarding_notification_retry",
"service_provider_submit_review",
"service_provider_publish",
"service_provider_return_draft",
"service_provider_suspend",
```

- [ ] **Step 5: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/schema/tenant-onboarding.test.ts
cd ../..
bun run api:typecheck
git add apps/api/src/schema/tenant-onboarding.ts \
  apps/api/src/schema/tenant-onboarding.test.ts \
  apps/api/src/repositories/tenant-onboarding-types.ts \
  apps/api/src/errors/error-codes.ts apps/api/src/schema/platform-audit-logs.ts
git commit -m "feat(onboarding): 定义装企申请契约"
```

Expected: schema tests PASS and API typecheck exits 0.

### Task 3: Implement administrative-area partner resolution

**Files:**
- Create: `apps/api/src/services/tenant-onboarding-region-match.ts`
- Create: `apps/api/src/services/tenant-onboarding-region-match.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-types.ts`

- [ ] **Step 1: Write failing resolver tests**

Cover city `411500` matching district `411525`, district specificity beating city, a unique
candidate, two equal candidates returning ambiguous, inactive partner exclusion, invite partner
priority only when coverage is valid, and no-candidate output.

```ts
test("returns ambiguous instead of selecting the first equal partner", async () => {
  const service = createResolver({
    areas: [
      { adcode: "411500", parent_code: "410000", level: "city" },
      { adcode: "411525", parent_code: "411500", level: "district" },
    ],
    partners: [
      activePartner("partner-a", ["411500"]),
      activePartner("partner-b", ["411500"]),
    ],
  });

  await expect(service.resolve({ serviceRegionCodes: ["411525"], inviteCode: null }))
    .resolves.toMatchObject({ kind: "ambiguous", partnerIds: ["partner-a", "partner-b"] });
});
```

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/services/tenant-onboarding-region-match.test.ts`.

Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement the resolver with injected repository ports**

Expose one stable result union:

```ts
export type TenantOnboardingPartnerResolution =
  | { kind: "none"; partnerIds: []; selectedPartner: null; reason: "no_eligible_partner" }
  | { kind: "unique"; partnerIds: [string]; selectedPartner: PartnerBrief; reason: "invite_code" | "region" }
  | { kind: "ambiguous"; partnerIds: string[]; selectedPartner: null; reason: "same_specificity" };
```

Load the submitted administrative areas and their ancestors from the existing administrative-area
repository, then query only `active` partners whose `region_codes` overlap the ancestor set. Rank
district over city over province. Never use string prefix matching and never select index zero for an
ambiguous result.

- [ ] **Step 4: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-onboarding-region-match.test.ts
cd ../..
git add apps/api/src/services/tenant-onboarding-region-match.ts \
  apps/api/src/services/tenant-onboarding-region-match.test.ts \
  apps/api/src/repositories/tenant-onboarding-types.ts
git commit -m "feat(onboarding): 增加合伙人区域解析"
```

### Task 4: Implement applicant repository and service

**Files:**
- Create: `apps/api/src/repositories/tenant-onboarding.ts`
- Create: `apps/api/src/repositories/tenant-onboarding-notifications.ts`
- Create: `apps/api/src/services/tenant-onboarding-applications.ts`
- Create: `apps/api/src/services/tenant-onboarding-notifications.ts`
- Create: `apps/api/src/services/tenant-onboarding-applications.test.ts`
- Create: `apps/api/src/services/tenant-onboarding-notifications.test.ts`
- Modify: `apps/api/src/services/sms/legacy/shared.ts`
- Modify: `apps/api/src/services/sms/legacy/config.ts`

- [ ] **Step 1: Write failing service tests**

Tests must prove:

- `sendCode` uses the existing `smsVerificationCodeService.sendCode` with scene
  `partner_tenant_onboarding`, visitor request IP/device and the existing rate limits.
- submission verifies the same scene and marks the code consumed only after the application insert
  succeeds.
- visitor ID is mandatory and owns every read/write.
- location context must belong to the same visitor.
- business license file must be private, active, owned by the visitor, and use
  `tenant_onboarding_license` scene.
- same visitor + idempotency key returns the original application.
- existing open credit-code application returns
  `TENANT_ONBOARDING_APPLICATION_DUPLICATED`.
- a concurrent `23505` from the open-subject or visitor/idempotency unique index is re-read and mapped
  to the original application/stable duplicate result instead of a generic database error.
- unique partner creates `candidate_partner_id`, `partner_assist_status=pending`, requested time and
  due time 48 hours later.
- no/ambiguous partner stores `not_applicable` and no candidate partner.
- supplement is allowed only from `supplement_required` with matching version.
- withdrawal is allowed only from non-terminal states.
- successful submit returns `next_action=wait_for_review`, `estimated_review_hours=48`, `created`
  and `idempotent`; it never returns tenant/member tokens.
- notification delivery is deduplicated by application/version/event, uses `sendSmsTemplate`, records
  a sanitized failure, and never rolls back or changes a successful application submission.

Use injected repository, SMS, location-context, file, and region-resolver ports. Do not connect unit
tests to Supabase.

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/services/tenant-onboarding-applications.test.ts`.

Expected: FAIL because repository/service files do not exist.

- [ ] **Step 3: Implement bounded repository methods**

Implement these methods with necessary selects and pagination only:

```ts
createApplication(input)
findByVisitorAndIdempotencyKey(visitorId, idempotencyKey)
findOpenByCreditCode(normalizedCreditCode)
findOwnedById(applicationId, visitorId)
listOwned({ visitorId, page, pageSize })
updateSupplement({ applicationId, visitorId, expectedVersion, patch })
withdraw({ applicationId, visitorId, expectedVersion })
appendReviewEvent(input)
```

All update queries must include `id`, owner, current status and `version`, then increment version.
Return `null` when optimistic conditions do not match; service converts this to
`TENANT_ONBOARDING_STATE_CONFLICT`.

- [ ] **Step 4: Implement service flow**

Add the bounded send-code entry point before submit:

```ts
sendCode(input: {
  phone: string;
  requestIp: string | null;
  requestDevice: string | null;
}) {
  return this.smsService.sendCode({
    phone: input.phone,
    scene: "partner_tenant_onboarding",
    requestIp: input.requestIp,
    requestDevice: input.requestDevice,
  });
}
```

The submit method order is fixed:

```ts
async submit(input: SubmitInput, context: { visitorId: string; idempotencyKey: string }) {
  const existing = await this.repository.findByVisitorAndIdempotencyKey(
    context.visitorId,
    context.idempotencyKey,
  );
  if (existing) return { application: existing, created: false, idempotent: true };

  const verificationCode = await this.verifySmsCode(input.admin_phone, input.sms_code);
  await this.assertOwnedLocationContext(input.visitor_context_id, context.visitorId);
  await this.assertPrivateBusinessLicense(input.business_license_file_id, context.visitorId);
  await this.assertNoOpenSubject(input.unified_social_credit_code);
  const resolution = await this.regionResolver.resolve({
    serviceRegionCodes: input.service_region_codes,
    inviteCode: input.invite_code ?? null,
  });
  const application = await this.repository.createApplication(
    this.buildCreateRecord(input, context, resolution),
  );
  await this.smsService.markVerified(verificationCode.id);
  return {
    application,
    next_action: "wait_for_review" as const,
    estimated_review_hours: 48,
    created: true,
    idempotent: false,
  };
}
```

The idempotent early return uses the same response envelope with `created=false` and
`idempotent=true`. After the application transaction commits, call
`notificationService.deliver({ applicationId, version, eventType: "submitted" })`; that service catches
provider/config failures and persists `failed` without throwing back into the business result. Do not
create a tenant, employee, service area or binding in this service.

- [ ] **Step 5: Implement first-phase SMS notification delivery**

Extend the internal `SmsTemplatePurpose` union and config lookup with four purposes:

```ts
"tenant_onboarding_submitted"
"tenant_onboarding_supplement_required"
"tenant_onboarding_approved"
"tenant_onboarding_rejected"
```

Map each provider to a dedicated settings key; never reuse verification-code templates. The delivery
service inserts/finds the unique delivery row, increments attempts, calls existing `sendSmsTemplate`,
and writes `sent` or sanitized `failed`. The retry method accepts only a delivery ID that belongs to
the reviewed application. Do not add Redis, a queue, a dependency or synchronous failure propagation.

- [ ] **Step 6: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-onboarding-applications.test.ts \
  src/services/tenant-onboarding-notifications.test.ts
cd ../..
bun run api:typecheck
git add apps/api/src/repositories/tenant-onboarding.ts \
  apps/api/src/repositories/tenant-onboarding-notifications.ts \
  apps/api/src/services/tenant-onboarding-applications.ts \
  apps/api/src/services/tenant-onboarding-notifications.ts \
  apps/api/src/services/tenant-onboarding-applications.test.ts \
  apps/api/src/services/tenant-onboarding-notifications.test.ts \
  apps/api/src/services/sms/legacy/shared.ts apps/api/src/services/sms/legacy/config.ts
git commit -m "feat(onboarding): 增加装企申请服务"
```

### Task 5: Expose visitor applicant routes and private license upload

**Files:**
- Create: `apps/api/src/controllers/tenant-onboarding/index.ts`
- Create: `apps/api/src/controllers/tenant-onboarding/routes.test.ts`
- Modify: `apps/api/src/controllers/uploads/index.ts`
- Modify: `apps/api/src/controllers/uploads/index.test.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/shared.ts`
- Modify: `apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing route and upload tests**

Assert exact routes:

```ts
expect(routes).toEqual([
  { method: "POST", path: "/tenant-onboarding/applications/send-code" },
  { method: "POST", path: "/tenant-onboarding/applications" },
  { method: "GET", path: "/tenant-onboarding/applications/mine" },
  { method: "GET", path: "/tenant-onboarding/applications/:id" },
  { method: "PATCH", path: "/tenant-onboarding/applications/:id/supplement" },
  { method: "POST", path: "/tenant-onboarding/applications/:id/withdraw" },
]);
```

Auth tests must assert these routes are `visitor_session` routes and are not public routes. Upload
tests must assert a visitor can init/complete `tenant_onboarding_license`, another upload scene is
still forbidden, completed license objects use `visibility: "private"`, and
`/uploads/public-url` rejects the license object. Two visitor IDs must receive different object-key
prefixes; visitor B cannot complete visitor A's object key or attach A's file record.

- [ ] **Step 2: Run RED verification**

```bash
cd apps/api
bun test src/controllers/tenant-onboarding/routes.test.ts \
  src/controllers/uploads/index.test.ts src/plugins/auth/legacy/routes.test.ts
```

Expected: new routes and upload scene assertions FAIL.

- [ ] **Step 3: Implement visitor identity and idempotency checks in controller**

Use this helper in the controller:

```ts
function requireVisitor(request: FastifyRequest) {
  const visitorId = request.user?.visitor_id?.trim();
  if (request.user?.token_type !== "visitor_session" || !visitorId) {
    throw Errors.unauthorized("需要 visitor 登录态");
  }
  return visitorId;
}

function requireIdempotencyKey(request: FastifyRequest) {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (!key || key.length > 120) {
    throw Errors.business(400, "缺少有效的 Idempotency-Key", ErrorCodes.VALIDATION_ERROR);
  }
  return key;
}
```

Each handler only parses request data, calls the applicant service, and returns
`ResponseHandler.success`. Submit returns `reply.code(202)` before the success payload.

- [ ] **Step 4: Extend upload scene without making it public**

Add `tenant_onboarding_license` to `DIRECT_UPLOAD_SCENES` and `PlatformUploadScene`, allow it only
for `visitor_session`, limit it to image MIME types and 5 MB, and pass this visibility into storage:

```ts
const PRIVATE_DIRECT_UPLOAD_SCENES = new Set<UploadScene>([
  "tenant_onboarding_license",
]);

visibility: PRIVATE_DIRECT_UPLOAD_SCENES.has(scene) ? "private" : "public",
```

Add `visibility: PlatformFileVisibility` and `visitorId: string | null` to direct-complete input. For
this scene, build and verify the exact prefix
`private/tenant-onboarding-license/visitors/<sha256(visitor_id)>/`; do not put raw visitor IDs in COS
keys. Persist `owner_type='visitor'`, `owner_visitor_id=visitorId`, `public_url=NULL` and private
visibility through `platformFileObjectRepository.createOrFindByObjectKey`. On duplicate object keys,
the repository must also verify visitor ownership before returning an existing record. Do not add the
license scene to `PUBLIC_DIRECT_UPLOAD_SCENES` or `PUBLIC_STORED_FILE_SCENES`.
The private complete response returns the file ID and active status required by the application form;
it must not return `public_url` or a permanent access URL.

Extend `parseStoredObjectKey` so `private/...` is recognized as a platform object. Public URL access
must reject that prefix before calling `resolveStoredFileUrl`, even for the owning visitor.

- [ ] **Step 5: Register controllers and visitor route classification**

Add the controller import and `registerExtraRoutes` call in `routes/index.ts`. Extend
`isVisitorSessionRoute` for all applicant routes and keep `isPublicRoute` false.

- [ ] **Step 6: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/controllers/tenant-onboarding/routes.test.ts \
  src/controllers/uploads/index.test.ts src/plugins/auth/legacy/routes.test.ts
cd ../..
bun run api:check
git add apps/api/src/controllers/tenant-onboarding apps/api/src/controllers/uploads/index.ts \
  apps/api/src/controllers/uploads/index.test.ts \
  apps/api/src/services/files/platform-file-storage/legacy/shared.ts \
  apps/api/src/services/files/platform-file-storage/legacy/direct-upload.ts \
  apps/api/src/services/files/platform-file-storage/legacy/paths.ts \
  apps/api/src/repositories/platform-file-objects.ts \
  apps/api/src/plugins/auth/legacy/routes.ts apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/routes/index.ts
git commit -m "feat(onboarding): 开放访客装企申请接口"
```

### Task 6: Create the atomic approval RPC

**Files:**
- Create: `supabase/migrations/20260714220000_create_tenant_onboarding_approval_rpc.sql`
- Create: `apps/api/src/services/tenant-onboarding-approval-migration.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding.ts`

- [ ] **Step 1: Write a failing migration contract test**

Create `tenant-onboarding-approval-migration.test.ts` and assert the migration contains:

```ts
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.approve_tenant_onboarding_application");
expect(sql).toContain("FOR UPDATE");
expect(sql).toContain("application_version_conflict");
expect(sql).toContain("subject_exists");
expect(sql).toContain("admin_phone_exists");
expect(sql).toContain("partner_ambiguous");
expect(sql).toContain("tenant_service_provider_profiles");
expect(sql).toContain("tenant_template_applications");
expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.approve_tenant_onboarding_application");
```

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/services/tenant-onboarding-approval-migration.test.ts`.

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement an idempotent default-tenant initialization helper**

Inside the migration, create a private service-role-only helper:

```sql
CREATE OR REPLACE FUNCTION public.initialize_default_decoration_tenant(
  p_tenant_id uuid,
  p_admin_name text,
  p_admin_phone text,
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

Translate the exact operations currently performed by
`apps/api/src/repositories/platform-tenants/legacy/initialization.ts` into this helper:

1. Upsert the enabled default department templates into `tenant_departments`.
2. Upsert default employee posts.
3. Upsert default roles, locate `system_admin`, and grant all active permissions.
4. Insert the active admin employee with the ADMIN department and SYSTEM_ADMIN post.
5. Upsert `employee_roles` for the admin and system-admin role.
6. Upsert `tenant_template_applications` for
   `default_decoration_company / 2026.05.10`.
7. Return this exact JSON shape:

```sql
jsonb_build_object(
  'template_code', 'default_decoration_company',
  'template_version', '2026.05.10',
  'departments_count', v_departments_count,
  'posts_count', v_posts_count,
  'roles_count', v_roles_count,
  'admin_employee_id', v_admin_employee_id,
  'admin_role_id', v_admin_role_id
)
```

Use the same template codes and enabled defaults as the existing TypeScript implementation. Every
upsert must use an existing unique constraint so retrying the helper does not duplicate rows.

- [ ] **Step 4: Implement the approval RPC**

Use this signature and return contract:

```sql
CREATE OR REPLACE FUNCTION public.approve_tenant_onboarding_application(
  p_application_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_tenant_slug text,
  p_final_partner_id uuid DEFAULT NULL,
  p_attribution_source_type text DEFAULT NULL,
  p_review_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
```

The function must:

1. Select the application by primary key into `v_application` and lock that exact row with
   `FOR UPDATE`.
2. Return the existing tenant and `idempotent=true` if already approved.
3. Return `application_state_conflict` for rejected/withdrawn or any non-reviewable state.
4. Return `application_version_conflict` when versions differ.
5. Check normalized credit code against `tenants` and return `subject_exists`.
6. Check active employees by admin phone and return `admin_phone_exists`.
7. Revalidate the supplied partner is active and covers an application service-region ancestor;
   return `partner_unavailable` otherwise.
8. Require explicit `p_final_partner_id` or null when the candidate snapshot says ambiguous; never
   select the first candidate.
9. Recheck that no active binding exists for a converted/existing tenant; never overwrite one.
10. Insert the tenant with status `active`, copied legal code, address and contact fields.
11. Call `initialize_default_decoration_tenant`.
12. Insert application service regions into `tenant_service_areas` as `inactive`.
13. Insert the optional binding and a `draft` service-provider profile.
14. Update application to `approved`, convert a still-pending assist to `expired`, increment version,
    and insert a platform-final review row with before/after states.
15. Return `{status, application_id, tenant_id, binding_id, profile_id, initialization, idempotent}`.

Revoke PUBLIC/anon/authenticated execution and grant only `service_role`, following
`approve_platform_partner_member_rebind_request`.

- [ ] **Step 5: Add the repository RPC adapter**

```ts
async approveApplication(input: ApproveTenantOnboardingRpcInput) {
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "approve_tenant_onboarding_application",
    {
      p_application_id: input.applicationId,
      p_expected_version: input.expectedVersion,
      p_reviewer_employee_id: input.reviewerEmployeeId,
      p_tenant_slug: input.tenantSlug,
      p_final_partner_id: input.finalPartnerId,
      p_attribution_source_type: input.attributionSourceType,
      p_review_remark: input.reviewRemark,
    },
  );
  if (error) throw Errors.dbError("审核通过装企入驻失败", error);
  return data as TenantOnboardingApprovalRpcResult;
}
```

- [ ] **Step 6: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-onboarding-approval-migration.test.ts
cd ../..
bun run api:typecheck
git add supabase/migrations/20260714220000_create_tenant_onboarding_approval_rpc.sql \
  apps/api/src/services/tenant-onboarding-approval-migration.test.ts \
  apps/api/src/repositories/tenant-onboarding.ts
git commit -m "feat(onboarding): 增加原子入驻审批事务"
```

### Task 7: Implement platform review service and routes

**Files:**
- Create: `apps/api/src/services/tenant-onboarding-review.ts`
- Create: `apps/api/src/services/tenant-onboarding-review.test.ts`
- Create: `apps/api/src/controllers/platform-tenant-onboarding/index.ts`
- Create: `apps/api/src/controllers/platform-tenant-onboarding/routes.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-notifications.ts`
- Modify: `apps/api/src/services/tenant-onboarding-notifications.ts`
- Modify: `apps/api/src/services/files/file-url-resolver.ts`
- Create: `apps/api/src/services/files/file-url-resolver-private.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing review service tests**

Cover:

- list/get require platform admin plus `platform.tenant_onboarding.review`.
- list is paginated, selects only application/list fields, and supports `status`, `region_code`,
  `candidate_partner_id`, `assist_status` and bounded `keyword` filters.
- review history and notification deliveries use separate `page=1&pageSize=20` queries capped at 100;
  application detail never embeds an unbounded history list.
- request supplement stores `required_fields`, moves state, increments version and appends review.
- request partner assist accepts an explicitly selected, freshly eligible partner for a non-terminal
  application, sets a 48-hour due time and appends a review event; it never sets `final_partner_id` or
  blocks a later platform decision.
- start review moves only `submitted -> reviewing` with version check and an append-only review event;
  it is idempotent for the same current version and does not assign final approval ownership.
- reject requires a reason, writes terminal state, and converts any pending assist to `expired`.
- approve re-runs region resolution, rejects unresolved ambiguity, and maps every RPC status to a
  stable `ErrorCodes` value.
- approve is allowed while partner assist is still `pending` or already `expired`; it never waits for
  or treats `not_recommended` as a veto.
- repeated approved RPC result returns `idempotent: true`.
- audit writes happen only after the database mutation succeeds.
- supplement/approve/reject attempt their corresponding post-commit notification; provider failure is
  visible as a failed delivery and never changes the completed review result. Retry requires review
  permission and a delivery belonging to the application.
- the license-access action requires the review permission, verifies the application/file relation,
  and returns a private signed URL with at most 10 minutes TTL; list/detail responses never contain
  an unsigned object key or permanent public URL.

Use this explicit RPC status mapping:

```ts
const approvalStatusErrors = {
  application_not_found: [404, "入驻申请不存在", ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND],
  application_state_conflict: [409, "申请状态已变化", ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT],
  application_version_conflict: [409, "申请已被其他审核人更新", ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT],
  subject_exists: [409, "该企业主体已经入驻", ErrorCodes.TENANT_ONBOARDING_SUBJECT_EXISTS],
  admin_phone_exists: [409, "负责人手机号已属于现有员工", ErrorCodes.TENANT_ONBOARDING_PHONE_MEMBER_EXISTS],
  partner_ambiguous: [409, "存在多个同级城市合伙人，请明确选择", ErrorCodes.TENANT_ONBOARDING_PARTNER_AMBIGUOUS],
  partner_unavailable: [409, "城市合伙人状态或区域已变化", ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT],
} as const;
```

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/services/tenant-onboarding-review.test.ts`.

Expected: FAIL because review service does not exist.

- [ ] **Step 3: Implement the service**

Keep permission checks in service, database queries in repository, and generate tenant slugs with a
bounded collision retry before calling the RPC. Do not recreate tenant initialization in TypeScript.

For `attribution_mode=auto`, accept only a fresh unique resolution. For `partner`, verify the selected
partner is present in the fresh eligible set. For `unassigned`, pass null explicitly.

- [ ] **Step 4: Write route contract tests and controller**

Assert these exact routes:

```ts
expect(routes).toEqual([
  { method: "GET", path: "/platform/tenant-onboarding/applications" },
  { method: "GET", path: "/platform/tenant-onboarding/applications/:id" },
  { method: "GET", path: "/platform/tenant-onboarding/applications/:id/reviews" },
  { method: "GET", path: "/platform/tenant-onboarding/applications/:id/notifications" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/license-access" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/notifications/:deliveryId/retry" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/start-review" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/request-partner-assist" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/request-supplement" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/approve" },
  { method: "POST", path: "/platform/tenant-onboarding/applications/:id/reject" },
]);
```

Controller extends `PlatformBaseController`, parses Zod schemas, uses
`getRequiredPlatformAdminContext`, and delegates all business rules.

The signed license response is `{ url, expires_at }`. Resolve it through the existing private-file
URL resolver/storage service only after service-level authorization. Add an explicit
`resolveSignedStoredFileUrl(objectKey, { ttlSeconds: 600 })` path that always signs the COS key and
clamps TTL to 600 seconds instead of falling back to a public URL; cover it with the private resolver
test. Do not call or expose
`/uploads/public-url`, and never write the signed URL/object key to logs or audit metadata.

- [ ] **Step 5: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-onboarding-review.test.ts \
  src/controllers/platform-tenant-onboarding/routes.test.ts \
  src/services/files/file-url-resolver-private.test.ts
cd ../..
bun run api:check
git add apps/api/src/services/tenant-onboarding-review.ts \
  apps/api/src/services/tenant-onboarding-review.test.ts \
  apps/api/src/controllers/platform-tenant-onboarding \
  apps/api/src/repositories/tenant-onboarding.ts \
  apps/api/src/repositories/tenant-onboarding-notifications.ts \
  apps/api/src/services/tenant-onboarding-notifications.ts \
  apps/api/src/services/files/file-url-resolver.ts \
  apps/api/src/services/files/file-url-resolver-private.test.ts apps/api/src/routes/index.ts
git commit -m "feat(onboarding): 增加平台装企入驻审核"
```

### Task 8: Implement partner non-blocking assist API

**Files:**
- Create: `apps/api/src/services/tenant-onboarding-partner-assist.ts`
- Create: `apps/api/src/services/tenant-onboarding-partner-assist.test.ts`
- Create: `apps/api/src/controllers/partner-onboarding-applications/index.ts`
- Create: `apps/api/src/controllers/partner-onboarding-applications/routes.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing isolation and state tests**

Tests must prove:

- platform-partner token is required.
- repository list/detail queries include `candidate_partner_id = token.partner_id` before execution.
- list uses `.range()` and `pageSize <= 100`.
- response masks phone as `139****9000` and does not select `business_license_file_id` or license URL.
- response exposes only company name, city/district, declared service regions and masked contact;
  it omits street address, coordinates, consent metadata and unified social credit code.
- decisions are only `verified`, `supplement_suggested`, and `not_recommended`.
- final/expired/non-pending tasks return `TENANT_ONBOARDING_STATE_CONFLICT`.
- assist updates only assist status and appends a review; it never changes main status.
- a task receives `partner_assist_due_at = requested_at + interval '48 hours'`; at or after the
  cutoff it atomically becomes `expired`, cannot be reviewed, and does not change/block main status.

- [ ] **Step 2: Run RED verification**

Run `cd apps/api && bun test src/services/tenant-onboarding-partner-assist.test.ts`.

Expected: FAIL because assist service does not exist.

- [ ] **Step 3: Implement service and repository filters**

Use `PlatformPartnerPortalService.requireCurrentPartnerMember` behavior as the reference, but expose a
small shared identity resolver instead of making the assist service call another controller. The
repository signatures must require `partnerId`:

```ts
listPartnerAssistTasks({ partnerId, page, pageSize, status })
findPartnerAssistTask({ applicationId, partnerId })
submitPartnerAssist({ applicationId, partnerId, memberId, decision, remark, expectedVersion })
expireDuePartnerAssistTasks({ partnerId?: string, cutoff })
```

The update condition includes `candidate_partner_id`, `partner_assist_status='pending'`, main status
not terminal, and `version`.

Run `expireDuePartnerAssistTasks({ cutoff: now })` before partner queue/detail reads and before a
platform review reads assist state. The update is one bounded SQL statement on the partner queue
index and appends one `expired` review event per changed application. Do not add Redis, a queue or a
blocking scheduler; a later reminder job may call the same idempotent expiry method.

- [ ] **Step 4: Add routes and auth classification**

```http
GET  /partner/onboarding-applications?page=1&pageSize=20
GET  /partner/onboarding-applications/:id
POST /partner/onboarding-applications/:id/assist-review
```

Classify these as partner portal routes, not public or visitor routes.

- [ ] **Step 5: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-onboarding-partner-assist.test.ts \
  src/controllers/partner-onboarding-applications/routes.test.ts \
  src/plugins/auth/legacy/routes.test.ts
cd ../..
bun run api:check
git add apps/api/src/services/tenant-onboarding-partner-assist.ts \
  apps/api/src/services/tenant-onboarding-partner-assist.test.ts \
  apps/api/src/controllers/partner-onboarding-applications \
  apps/api/src/repositories/tenant-onboarding.ts \
  apps/api/src/plugins/auth/legacy/routes.ts apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/routes/index.ts
git commit -m "feat(onboarding): 增加合伙人装企协查"
```

### Task 9: Implement service-provider profile, publication transaction, and visitor list

**Files:**
- Create: `supabase/migrations/20260714230000_create_service_provider_publication_rpc.sql`
- Create: `apps/api/src/repositories/tenant-service-providers.ts`
- Create: `apps/api/src/services/tenant-service-providers.ts`
- Create: `apps/api/src/services/tenant-service-providers.test.ts`
- Create: `apps/api/src/controllers/tenant-service-provider/index.ts`
- Create: `apps/api/src/controllers/tenant-service-provider/routes.test.ts`
- Create: `apps/api/src/controllers/visitor-local-service-providers/index.ts`
- Create: `apps/api/src/controllers/visitor-local-service-providers/routes.test.ts`
- Modify: `apps/api/src/controllers/platform-tenant-onboarding/index.ts`
- Modify: `apps/api/src/schema/tenant-onboarding.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing publication and listing tests**

Cover:

- tenant reads/updates only its own profile and inactive areas.
- profile management requires `service_provider.profile.manage`.
- submit requires public name, phone, address coordinates, and at least one inactive service area.
- publish requires `platform.service_provider.publish`.
- publication queue does not run one area query per row; it returns bounded summary/count fields and
  loads full areas from a separate paginated detail endpoint.
- publishing profile and selected areas is atomic.
- returning to draft keeps areas inactive.
- editing critical profile fields or service areas while published/suspended atomically deactivates
  all areas and moves the profile to `pending_review`; editing a pending review returns it to `draft`
  so stale content cannot be approved.
- suspending a provider excludes it without suspending the tenant.
- visitor list requires visitor token and active location context.
- list selects only public fields, filters tenant active + profile published + area active, uses
  `.range()`, and returns empty pagination for no context/match.
- city A does not see city B and there is no fallback tenant.

- [ ] **Step 2: Run RED verification**

Run:

```bash
cd apps/api
bun test src/services/tenant-service-providers.test.ts \
  src/services/tenant-service-provider-publication-migration.test.ts
```

Expected: FAIL because service-provider implementation does not exist.

- [ ] **Step 3: Create publication RPC migration**

Create service-role-only functions:

```sql
public.update_tenant_service_provider_profile(
  p_tenant_id uuid,
  p_expected_version integer,
  p_patch jsonb
) RETURNS jsonb
```

```sql
public.upsert_tenant_service_provider_area(
  p_tenant_id uuid,
  p_area_id uuid,
  p_expected_profile_version integer,
  p_area jsonb
) RETURNS jsonb
```

```sql
public.submit_tenant_service_provider_profile(
  p_tenant_id uuid,
  p_expected_version integer
) RETURNS jsonb
```

```sql
public.publish_tenant_service_provider(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
) RETURNS jsonb
```

```sql
public.return_tenant_service_provider_to_draft(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
) RETURNS jsonb
```

```sql
public.suspend_tenant_service_provider(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
) RETURNS jsonb
```

Publish locks profile and areas, requires profile `pending_review`, requires tenant `active`, requires
at least one area, sets selected areas `active`, sets profile `published`, records reviewer metadata and
increments version in the same transaction. Return-to-draft sets every area `inactive`, sets profile
`draft`, records reviewer metadata/reason and increments version. After a successful RPC, the service
writes the corresponding platform audit log; a failed RPC must not produce a success audit event.

Submit locks the profile, requires `draft`, validates all required public fields and at least one
inactive area, then moves it to `pending_review`. Suspend locks profile/areas, requires `published`,
sets profile `suspended`, deactivates all areas, records reviewer metadata and increments version.

Profile and area mutation functions allowlist every JSON field and reject unknown keys. They always
write tenant-managed areas as `inactive`. When current status is `published` or `suspended`, a critical
profile/area change sets profile status to `pending_review` and deactivates all areas in the same
transaction. When current status is `pending_review`, editing cancels that review by returning to
`draft`; `draft` stays `draft`. Every path checks/increments profile version. Revoke PUBLIC/anon/
authenticated execution and grant only `service_role`.

- [ ] **Step 4: Implement repository and service boundaries**

Repository methods:

```ts
getTenantProfile(tenantId)
updateTenantProfile({ tenantId, expectedVersion, patch }) // publication RPC adapter
listTenantAreas({ tenantId, page, pageSize })
createTenantArea({ tenantId, expectedProfileVersion, input }) // publication RPC adapter
updateTenantArea({ tenantId, areaId, expectedProfileVersion, input }) // publication RPC adapter
submitTenantProfile({ tenantId, expectedVersion })
listPlatformPublicationQueue(query)
getPlatformPublicationDetail(tenantId)
listPlatformPublicationAreas({ tenantId, page, pageSize })
publishProfile(input)
returnProfileToDraft(input)
suspendProfile(input)
listVisitorProviders({ context, page, pageSize })
```

Do not call `tenantServiceAreaRepository.listActiveForMatching()` because it loads all active areas.
The visitor query must filter and paginate in Postgres with only public columns.

- [ ] **Step 5: Add routes**

Tenant routes:

```http
GET   /tenant/service-provider-profile
PATCH /tenant/service-provider-profile
GET   /tenant/service-provider-areas?page=1&pageSize=20
POST  /tenant/service-provider-areas
PATCH /tenant/service-provider-areas/:id
POST  /tenant/service-provider-profile/submit
```

Platform routes:

```http
GET  /platform/service-provider-publications?page=1&pageSize=20
GET  /platform/service-provider-publications/:tenantId
GET  /platform/service-provider-publications/:tenantId/areas?page=1&pageSize=20
POST /platform/service-provider-publications/:tenantId/publish
POST /platform/service-provider-publications/:tenantId/return-draft
POST /platform/service-provider-publications/:tenantId/suspend
```

Visitor route:

```http
GET /visitor/local-service-providers?page=1&pageSize=20
```

Add visitor auth classification only for the visitor route. Tenant routes use ordinary auth context;
platform routes use platform context and permissions.

- [ ] **Step 6: Run GREEN verification and commit**

```bash
cd apps/api
bun test src/services/tenant-service-providers.test.ts \
  src/services/tenant-service-provider-publication-migration.test.ts \
  src/controllers/tenant-service-provider/routes.test.ts \
  src/controllers/visitor-local-service-providers/routes.test.ts \
  src/controllers/platform-tenant-onboarding/routes.test.ts
cd ../..
bun run api:check
git add supabase/migrations/20260714230000_create_service_provider_publication_rpc.sql \
  apps/api/src/services/tenant-service-provider-publication-migration.test.ts \
  apps/api/src/repositories/tenant-service-providers.ts \
  apps/api/src/services/tenant-service-providers.ts \
  apps/api/src/services/tenant-service-providers.test.ts \
  apps/api/src/controllers/tenant-service-provider \
  apps/api/src/controllers/visitor-local-service-providers \
  apps/api/src/controllers/platform-tenant-onboarding \
  apps/api/src/schema/tenant-onboarding.ts \
  apps/api/src/plugins/auth/legacy/routes.ts apps/api/src/routes/index.ts
git commit -m "feat(onboarding): 增加服务商发布和区域列表"
```

### Task 10: Build the platform onboarding and publication console

**Files:**
- Create: `apps/admin/app/(console)/platform/tenant-onboarding/page.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-types.ts`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-filters.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-table.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-actions.tsx`
- Create: `apps/admin/components/tenant-onboarding/service-provider-publication-table.tsx`
- Create: `apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/platform/platform-list-page-layout.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

The tests must assert:

```ts
expect(pageSource).toContain("PlatformListPageShell");
expect(pageSource).toContain("normalizePlatformListPageSize");
expect(pageSource).toContain('value="applications"');
expect(pageSource).toContain('value="publications"');
expect(actionsSource).toContain("requestBackendJson");
expect(actionsSource).toContain("Idempotency-Key");
expect(menuSource).toContain('permission: "platform.tenant_onboarding.review"');
```

Also add `tenant onboarding` to the `platformPages` array in
`platform-list-page-layout.test.ts`, so the page must use the fixed-height measured-pagination shell.

- [ ] **Step 2: Run RED verification**

```bash
cd apps/admin
bun test components/tenant-onboarding/tenant-onboarding-page-layout.test.ts \
  components/platform/platform-list-page-layout.test.ts
```

Expected: FAIL because the page and components do not exist.

- [ ] **Step 3: Define API-aligned UI types**

Keep the API field names unchanged. Define:

```ts
export type TenantOnboardingApplicationStatus =
  | "submitted" | "reviewing" | "supplement_required"
  | "approved" | "rejected" | "withdrawn";

export type TenantOnboardingPartnerAssistStatus =
  | "not_applicable" | "pending" | "verified"
  | "supplement_suggested" | "not_recommended" | "expired";

export type ServiceProviderPublicationStatus =
  | "draft" | "pending_review" | "published" | "suspended";
```

Add list/detail records, partner brief, review history, profile and the shared
`{ list, pagination }` response shape. Do not invent a frontend-only status.

- [ ] **Step 4: Implement server-side loading and filters**

The page must:

1. Redirect unauthenticated users to `/login`.
2. Require `platform_admin`; show the existing in-page access error when absent.
3. Use `getAdminToken`, `buildBackendUrl`, `parseBackendJson`, and `cache: "no-store"`.
4. Keep applications and publications in shadcn `Tabs`; only fetch the active tab.
5. Parse `page/pageSize/status/assist_status/candidate_partner_id/keyword/region_code`, default to
   page 1 and measured page size, and pass bounded values to the backend.
6. Use `PlatformListPageShell` with a compact toolbar, semantic status badges, pagination, loading,
   empty and error states. Avoid nested cards and marketing-style copy.

Application columns: application number, company, region, submitted time, candidate/final partner,
assist status, main status and fixed actions. Publication columns: company/public name, service
regions, submitted time, profile status and fixed actions.

Load review history and notification deliveries only when the detail dialog opens, through their
separate paginated endpoints. For publication review, load the profile detail and areas through the
separate detail/area endpoints. Render “加载更多”/pagination instead of requesting all history or
areas.

- [ ] **Step 5: Implement review actions with conflict-safe refresh**

Use Radix/shadcn dialogs and `requestBackendJson` for:

- view license: request the short-lived private URL only when the reviewer opens the detail dialog;
- retry failed applicant notification from the review timeline, with confirmation and attempt count;
- start review from a submitted row before showing final review actions;
- explicitly request non-blocking partner assist when no unique candidate was auto-assigned;
- request supplement: required field list + reason;
- approve: `version`, attribution mode, optional partner, review remark;
- reject: `version` + required reason;
- publish/return/suspend: `version` + required review remark.

Each mutation uses a new UUID in `Idempotency-Key`, disables buttons while pending, shows the backend
error code/message, closes only on success, and calls `router.refresh()`. If the backend returns a
state/version conflict, keep the form data and provide a “刷新后重试” action.

- [ ] **Step 6: Add navigation and run GREEN verification**

Add one platform nav item:

```ts
{
  href: "/platform/tenant-onboarding",
  label: "服务商入驻",
  icon: ClipboardCheck,
  permission: "platform.tenant_onboarding.review",
}
```

Run:

```bash
cd apps/admin
bun test components/tenant-onboarding/tenant-onboarding-page-layout.test.ts \
  components/platform/platform-list-page-layout.test.ts
pnpm run check
cd ../..
git add apps/admin/app/'(console)'/platform/tenant-onboarding \
  apps/admin/components/tenant-onboarding \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/platform/platform-list-page-layout.test.ts
git commit -m "feat(admin): 增加服务商入驻审核台"
```

Expected: source-contract tests PASS and admin check exits 0.

### Task 11: Build the tenant service-provider settings workspace

**Files:**
- Create: `apps/admin/app/(console)/settings/service-provider/page.tsx`
- Create: `apps/admin/components/service-provider/service-provider-types.ts`
- Create: `apps/admin/components/service-provider/service-provider-workspace.tsx`
- Create: `apps/admin/components/service-provider/service-provider-actions.tsx`
- Create: `apps/admin/components/service-provider/service-provider-workspace.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing workspace tests**

Assert the page and workspace expose the two publication gates and never imply that onboarding
approval automatically makes the provider public:

```ts
expect(pageSource).toContain("/tenant/service-provider-profile");
expect(pageSource).toContain("/tenant/service-provider-areas");
expect(workspaceSource).toContain("提交平台发布审核");
expect(workspaceSource).toContain("当前资料状态");
expect(actionsSource).toContain("service_provider.profile.manage");
expect(menuSource).toContain('href: "/settings/service-provider"');
```

- [ ] **Step 2: Run RED verification**

Run `cd apps/admin && bun test components/service-provider/service-provider-workspace.test.ts`.

Expected: FAIL because the settings workspace does not exist.

- [ ] **Step 3: Implement the server page and permission state**

Load profile and the first paginated area page with the current admin token. The page must render
read-only data when the user has `service_provider.profile.read`, enable mutations only with
`service_provider.profile.manage`, and render an explicit forbidden state if neither permission is
present. Do not fetch more than 100 areas; use page/pageSize and ordinary pagination.

- [ ] **Step 4: Implement profile and area editing**

Use local shadcn form controls in grouped sections:

- public name, contact phone, introduction, address and coordinates;
- service-area table with inactive/published status badges;
- add/edit area dialog using the existing administrative-area selector pattern;
- one compact primary action, “提交平台发布审核”.

All tenant-managed area creates/updates must send `status: "inactive"` implicitly via the backend
contract; the client must not be able to publish an area. Preserve unsaved input when a request fails.

- [ ] **Step 5: Implement mutation and state feedback**

Use `requestBackendJson`, optimistic `version`, pending-button disablement and `router.refresh()`.
Display these state-specific notices:

- `draft`: continue editing and submit;
- `pending_review`: platform review pending; editing explicitly cancels the current review and the
  backend returns it to `draft`, after which the user must resubmit;
- `published`: currently public; saving any first-phase critical field/area immediately changes it to
  `pending_review` and removes it from visitor results until platform republishes;
- `suspended`: not public; editing critical content changes it to `pending_review`, otherwise contact
  platform operations.

Do not use success copy such as “入驻成功即展示”.

- [ ] **Step 6: Add tenant navigation, verify, and commit**

Add under the tenant “系统” group:

```ts
{
  href: "/settings/service-provider",
  label: "服务商资料",
  icon: Building2,
  permission: "service_provider.profile.read",
}
```

Run:

```bash
cd apps/admin
bun test components/service-provider/service-provider-workspace.test.ts
pnpm run check
cd ../..
git add apps/admin/app/'(console)'/settings/service-provider \
  apps/admin/components/service-provider apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 增加服务商资料发布入口"
```

### Task 12: Produce the mini-program handoff and retire immediate activation safely

**Files:**
- Create: `docs/2026-07-14-local-service-provider-onboarding-miniprogram-handoff.md`
- Modify: `docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md`
- Create: `apps/api/src/services/partner-tenant-onboarding-compatibility.test.ts`
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/api/src/controllers/platform-partners/routes.test.ts`
- Modify: `apps/api/src/services/platform-partner-tenant-onboarding.ts`

- [ ] **Step 1: Write the exact handoff document**

The document must be directly implementable by the orange team and include:

1. Repository boundary: orange remains read-only in this work; likely touch points are
   `src/packageVisitor/pages/visitor-local-services/index.tsx`, a new onboarding form/status package,
   and the existing API client/auth/location helpers.
2. Page flow: local service page CTA → eligibility/login → license private upload → SMS → submit →
   status/detail → supplement/withdraw.
3. Every endpoint from Tasks 5, 7, 8 and 9 with method, auth/token type, headers, request, success
   response, pagination and stable errors.
4. Exact `Idempotency-Key` rules: one UUID per user submission intent; reuse the same key for retries;
   do not generate a new key after transport timeout.
5. Exact status labels and allowed client actions. Main status and partner-assist status remain
   separate; the mini-program must not display partner assist as final approval.
6. File flow: init direct upload with `tenant_onboarding_license`, upload to signed URL, complete,
   submit returned private file ID; never request `/uploads/public-url` for the license.
7. Location/list rule: call `GET /visitor/local-service-providers`; render empty state when no provider
   matches; never reuse `matched_tenants` as the authoritative provider list and never fall back across
   regions.
8. Field mapping table, loading/empty/error/offline behavior, analytics events and a copy deck.
9. Smoke matrix for no match, unique partner, ambiguous partner, duplicate subject, supplement,
   approval, publication, cross-region isolation and repeated-submit idempotency.
10. The partner-portal “装企协查” list/detail/action mapping from Task 8, while explicitly excluding
    approval, tenant creation and attribution changes.
11. Ownership matrix: gooes owns backend/admin/contracts; orange team owns mini-program pages and API
    calls.

- [ ] **Step 2: Add a compatibility contract test without changing old-client semantics early**

The test must lock the transition behavior into three phases:

- before cutover is scheduled: the old path keeps its current legacy response, so an old mini-program
  never interprets the new `202 submitted` envelope as “入驻成功”;
- scheduled compatibility window: `LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT` must be no later than
  14 natural days after the new mini-program version becomes fully available; before that instant the
  old response is unchanged;
- at/after cutoff: both legacy send-code and submit routes return stable
  `410 TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED` before SMS verification or any tenant mutation.

Inject clock/cutoff parsing into the service/controller test; do not mutate process-wide time. Assert
that an invalid non-empty cutoff fails startup validation and that submit never reaches initialization
once the cutoff is due.

- [ ] **Step 3: Add the cutoff guard but keep it unscheduled in the first deployment**

Use the stable `TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED` code from Task 2. Read the optional
ISO-8601 cutoff once through the existing environment/config pattern and return
`Errors.business(410, "请升级小程序后重新申请", ErrorCodes.TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED)`
before send-code/submit processing when due.

Do not configure a cutoff and do not change the legacy success response in the initial backend
deployment. The direct-activation risk is time-boxed operational debt: the release checklist records
owner, mini-program full-release timestamp, configured cutoff and deletion follow-up. The cutoff must
be at most full-release + 14 natural days. After traffic reaches zero, a separately reviewed release
removes both routes and code used only by direct activation.

- [ ] **Step 4: Mark the old handoff deprecated and verify documentation**

At the top of the 2026-07-07 handoff, add a deprecation notice linking the new document and explicitly
state that “邀请入驻成功即创建租户” is legacy-only until the scheduled cutoff. Add source assertions
for the new endpoints, the 14-day maximum, the rule that the old path must never return the new `202`
envelope, cross-region empty behavior and the orange read-only boundary.

- [ ] **Step 5: Run verification and commit**

```bash
cd apps/api
bun test src/services/partner-tenant-onboarding-compatibility.test.ts
cd ../..
bun run api:check
rg -n "Idempotency-Key|tenant_onboarding_license|14 日|禁止跨区域|orange.*只读" \
  docs/2026-07-14-local-service-provider-onboarding-miniprogram-handoff.md \
  docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md
git add docs/2026-07-14-local-service-provider-onboarding-miniprogram-handoff.md \
  docs/2026-07-07-partner-tenant-onboarding-miniprogram-handoff.md \
  apps/api/src/services/partner-tenant-onboarding-compatibility.test.ts \
  apps/api/src/controllers/platform-partners/index.ts \
  apps/api/src/controllers/platform-partners/routes.test.ts \
  apps/api/src/services/platform-partner-tenant-onboarding.ts
git commit -m "feat(onboarding): 增加旧入驻入口关闭门禁"
```

### Task 13: Verify migrations, query plans, and API smoke before applying database changes

**Files:**
- Modify only if evidence requires an index correction:
  `supabase/migrations/20260714210000_create_tenant_onboarding_workflow.sql`
- Modify only if evidence requires an index correction:
  `supabase/migrations/20260714230000_create_service_provider_publication_rpc.sql`
- Create: `docs/verification/2026-07-14-tenant-onboarding-verification.md`

- [ ] **Step 1: Verify local migration order without printing secrets**

Load `/Users/leefo/Public/work/gooes/.env` in the shell without echoing values, verify
`SUPABASE_DB_DIRECT_URL` is present, then run:

```sql
SELECT tenant_id, adcode, count(*)
FROM public.tenant_service_areas
WHERE adcode IS NOT NULL AND btrim(adcode) <> ''
GROUP BY tenant_id, adcode
HAVING count(*) > 1;
```

Run this as a read-only preflight through the configured Supabase query tool or `psql` against the
same target. Expected: zero rows. If duplicates exist, stop; design a separate reviewed cleanup
migration instead of deleting rows manually or weakening the new uniqueness invariant.

Then run:

```bash
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected dry-run set: exactly the three onboarding migrations from this plan. If there are unrelated
pending migrations, stop and reconcile them before applying anything.

- [ ] **Step 2: Apply migrations only after an explicit target-environment gate**

Before `supabase db push`, report the target project reference/host without credentials and obtain
confirmation that this is the intended environment. Then run:

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote align for all migrations. Do not execute manual DDL or DML against the remote
database.

Regenerate checked-in types from the same confirmed database URL, then inspect that all four new
tables and RPC signatures exist before replacing the file:

```bash
supabase gen types typescript --db-url "$SUPABASE_DB_DIRECT_URL" --schema public \
  > /tmp/gooes-database.ts
rg -n "tenant_onboarding_applications|tenant_service_provider_profiles|approve_tenant_onboarding_application|publish_tenant_service_provider" \
  /tmp/gooes-database.ts
mv /tmp/gooes-database.ts apps/api/src/types/database.ts
```

This redirect is generated output, not a hand-written file edit. Never print or commit the database
URL.

Rollback plan: application/API code can be rolled back while the additive tables/columns remain
dormant. Do not drop approved tenants automatically. A destructive schema rollback requires a new,
separately reviewed migration after exporting application/review/profile data and verifying no
converted tenant depends on it.

- [ ] **Step 3: Verify database invariants through the API/service role**

Run a disposable smoke case and clean up only through existing API/test fixtures:

1. submit and repeat with the same idempotency key;
2. request supplement and reject a stale version;
3. approve once and retry approval;
4. verify exactly one tenant, admin, template application, profile and optional partner binding;
5. verify service areas remain inactive until publication;
6. publish and confirm the matching visitor sees the provider;
7. confirm a visitor in another city receives an empty list;
8. suspend the profile and confirm it disappears while tenant remains active.
9. verify a future/absent legacy cutoff preserves the old response during the declared window and a
   reached cutoff returns `410` without creating a tenant.

Record IDs with redacted phone/license data in the verification document.

- [ ] **Step 4: Run `EXPLAIN (ANALYZE, BUFFERS)` on bounded representative queries**

Use test/staging data, never production writes, for:

- platform application list filtered by `status`, ordered by `created_at DESC`, limited to 20;
- partner assist list filtered by `candidate_partner_id` and `partner_assist_status`, limited to 20;
- visitor provider list filtered by location-region ancestry, active tenant/area and published profile,
  limited to 20.

Store plan summaries (index used, rows scanned/returned, execution time) in the verification document.
If a sequential scan remains on a realistically large table, adjust only the pending migration index,
rerun the migration contract test and repeat the plan before database apply.

- [ ] **Step 5: Run backend/admin verification and commit evidence**

```bash
bun test packages/domain/src/permission.test.ts \
  apps/api/src/schema/tenant-onboarding.test.ts \
  apps/api/src/services/tenant-onboarding-migration-contract.test.ts \
  apps/api/src/services/tenant-onboarding-region-match.test.ts \
  apps/api/src/services/tenant-onboarding-applications.test.ts \
  apps/api/src/services/tenant-onboarding-notifications.test.ts \
  apps/api/src/services/tenant-onboarding-approval-migration.test.ts \
  apps/api/src/services/tenant-onboarding-review.test.ts \
  apps/api/src/services/tenant-onboarding-partner-assist.test.ts \
  apps/api/src/services/tenant-service-providers.test.ts \
  apps/api/src/services/files/file-url-resolver-private.test.ts \
  apps/api/src/services/partner-tenant-onboarding-compatibility.test.ts
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
git -C /Users/leefo/Public/work/orange status --short
```

Expected: all checks pass. The final command is read-only; compare it with the status captured before
implementation and confirm this work did not modify orange.

Commit verification evidence only after replacing secrets, raw tokens, full phone numbers and private
file URLs with redacted values:

```bash
git add apps/api/src/types/database.ts \
  docs/verification/2026-07-14-tenant-onboarding-verification.md
git commit -m "test(onboarding): 记录入驻全链路验证"
```

### Task 14: Final compatibility, review, and branch handoff

**Files:**
- Review all files listed in Tasks 1–13.

- [ ] **Step 1: Run repository-wide boundary checks**

```bash
bun run check:permission-boundaries
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
git diff --check
git status --short
```

- [ ] **Step 2: Review the implementation against the approved design**

Confirm every invariant:

- platform is the only final onboarding and publication reviewer;
- partner assist expires after 48 hours and never blocks or vetoes platform review;
- ambiguous equal-rank partners are never auto-selected;
- onboarding approval creates one active tenant but no public provider listing;
- all tenant-managed service areas remain inactive until platform publication;
- visitor provider list is live, paginated, public-field-only and strictly regional;
- license files are private and never exposed through public URL;
- all state transitions use version checks and stable error codes;
- the old invitation endpoint never returns the new `202` envelope to legacy clients, and its reached
  cutoff path prevents SMS/tenant creation; release evidence records a cutoff no later than 14 days
  after the new mini-program becomes fully available;
- orange has no modifications from this implementation.

- [ ] **Step 3: Request code review and address findings**

Use `requesting-code-review` for the complete branch. Re-run the focused test for every corrected
finding, then repeat Step 1. Do not merge with unresolved high/medium findings.

- [ ] **Step 4: Hand off the completed branch**

Use `finishing-a-development-branch` only after all verification is green. Present commit range,
migration status, smoke evidence, the mini-program handoff path and the known old-endpoint removal
date/gate. Merge, push or cleanup only when explicitly requested at that stage.
