# Partner Miniprogram Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend/admin support needed for city partners to log in from the mini-program and view a read-only partner operations dashboard.

**Architecture:** Keep partner self-service separate from platform superadmin endpoints. Superadmin continues to manage partners under `/platform/...`; partner mini-program calls new `/partner/...` endpoints whose data scope is derived from the JWT `partner_id`, never from client-supplied `partner_id`.

**Tech Stack:** Bun + Fastify + Zod + Supabase for API, Next.js admin console, shadcn/ui, existing SMS verification and JWT utilities.

---

## File Structure

Create:

- `supabase/migrations/20260705190000_create_platform_partner_members.sql` - partner login member table, constraints, indexes, and optional seed-safe comments.
- `apps/api/src/schema/platform-partner-portal.ts` - partner login, bind-phone, dashboard query schemas.
- `apps/api/src/repositories/platform-partner-portal.ts` - direct Supabase access for members, scoped partner dashboard reads, and paginated lists.
- `apps/api/src/services/platform-partner-portal.ts` - auth, binding, partner context, and dashboard orchestration.
- `apps/api/src/controllers/platform-partner-portal/index.ts` - `/partner/...` HTTP endpoints.
- `apps/api/src/controllers/platform-partner-portal/routes.test.ts` - route registration and auth boundary tests.
- `apps/api/src/services/platform-partner-portal.test.ts` - business tests for login, binding, and partner data isolation.

Modify:

- `packages/domain/src/auth.ts` - add SMS scene `bind_platform_partner`.
- `apps/api/src/utils/jwt.ts` - add optional `partner_id` to `JwtPayload`.
- `apps/api/src/plugins/auth/legacy/routes.ts` - mark only partner login/send-code/bind-phone as public.
- `apps/api/src/schema/platform-partners.ts` - add superadmin partner member schemas.
- `apps/api/src/repositories/platform-partners.ts` - add superadmin member CRUD reads/writes.
- `apps/api/src/services/platform-partners.ts` - add permission-checked member management.
- `apps/api/src/controllers/platform-partners/index.ts` - add `/platform/partners/:id/members` and member status endpoints.
- `apps/admin/app/(console)/platform/partners/page.tsx` - fetch and render partner members when needed.
- `apps/admin/components/platform-partners/platform-partner-types.ts` - add partner member type.
- `apps/admin/components/platform-partners/platform-partner-actions.tsx` - add create member and status actions.
- `apps/admin/components/platform-partners/platform-partner-tables.tsx` - render member table.
- `apps/admin/components/platform-partners/platform-partner-filters.tsx` - add `members` tab through the page's existing shadcn tabs.
- `docs/2026-07-05-miniprogram-partner-portal-handoff.md` - update from contract draft to implemented endpoint list after backend lands.

Do not modify `/Users/leefo/Public/work/orange` in this repo task. The mini-program team should implement orange changes from the handoff doc after `/partner/...` endpoints are available.

---

## Task 0: Isolate the Work

**Files:**

- No repository files changed in this task.

- [ ] **Step 1: Start from a clean main**

Run:

```bash
git status --short
git branch --show-current
```

Expected:

- Current branch is `main`.
- Only previously accepted docs changes are present, or worktree is clean before creating the implementation branch.

- [ ] **Step 2: Create an isolated worktree**

Run with the worktree skill at execution time:

```bash
git worktree add .worktrees/partner-miniprogram-portal -b feature/partner-miniprogram-portal main
cd .worktrees/partner-miniprogram-portal
```

Expected:

- New worktree exists at `.worktrees/partner-miniprogram-portal`.
- Branch is `feature/partner-miniprogram-portal`.

---

## Task 1: Add Partner Member Persistence

**Files:**

- Create: `supabase/migrations/20260705190000_create_platform_partner_members.sql`
- Modify: `packages/domain/src/auth.ts`
- Test: `apps/api/src/services/platform-partner-portal.test.ts`

- [ ] **Step 1: Write a migration test**

Create the first test in `apps/api/src/services/platform-partner-portal.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("platform partner portal migration", () => {
  test("creates partner members table and indexes", () => {
    const migrationsDir = join(process.cwd(), "../../supabase/migrations");
    const migrationName = readdirSync(migrationsDir)
      .find((name) => name.endsWith("_create_platform_partner_members.sql"));

    expect(migrationName).toBeTruthy();
    const migrationPath = join(migrationsDir, migrationName!);
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.platform_partner_members");
    expect(sql).toContain("partner_id uuid NOT NULL REFERENCES public.platform_partners(id)");
    expect(sql).toContain("auth_user_id uuid NULL");
    expect(sql).toContain("platform_partner_members_partner_phone_idx");
    expect(sql).toContain("platform_partner_members_auth_user_status_idx");
    expect(sql).toContain("platform_partner_members_partner_status_idx");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts
```

Expected:

- FAIL because the migration file does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260705190000_create_platform_partner_members.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.platform_partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  auth_user_id uuid NULL,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'pending_bind',
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_members_role_check CHECK (role IN ('owner', 'operator')),
  CONSTRAINT platform_partner_members_status_check CHECK (status IN ('pending_bind', 'active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_partner_phone_idx
  ON public.platform_partner_members(partner_id, phone);

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_partner_auth_user_idx
  ON public.platform_partner_members(partner_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_partner_members_auth_user_status_idx
  ON public.platform_partner_members(auth_user_id, status)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_partner_members_partner_status_idx
  ON public.platform_partner_members(partner_id, status);
```

- [ ] **Step 4: Add SMS scene**

Modify `packages/domain/src/auth.ts` so `SMS_SCENE_VALUES` includes the new scene:

```ts
export const SMS_SCENE_VALUES = [
  "bind_customer",
  "bind_employee",
  "rebind_wechat",
  "bind_platform_partner",
] as const;
```

- [ ] **Step 5: Verify**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts
pnpm --dir apps/api run typecheck
```

Expected:

- Migration test PASS.
- API typecheck PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add supabase/migrations/20260705190000_create_platform_partner_members.sql packages/domain/src/auth.ts apps/api/src/services/platform-partner-portal.test.ts
git commit -m "feat(api): add platform partner member model"
```

---

## Task 2: Implement Partner Portal Auth

**Files:**

- Create: `apps/api/src/schema/platform-partner-portal.ts`
- Create: `apps/api/src/repositories/platform-partner-portal.ts`
- Create: `apps/api/src/services/platform-partner-portal.ts`
- Create: `apps/api/src/controllers/platform-partner-portal/index.ts`
- Create: `apps/api/src/controllers/platform-partner-portal/routes.test.ts`
- Modify: `apps/api/src/utils/jwt.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Test: `apps/api/src/services/platform-partner-portal.test.ts`

- [ ] **Step 1: Write auth service tests**

Append tests to `apps/api/src/services/platform-partner-portal.test.ts`:

```ts
import { mock } from "bun:test";

const activePartner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  status: "active",
  region_codes: ["411500"],
  level: { id: "level-1", code: "city_partner", name: "城市合伙人" },
};

describe("PlatformPartnerPortalService auth", () => {
  test("logs in an active bound partner member", async () => {
    const repository = {
      findMemberByAuthUserId: mock(async () => ({
        id: "member-1",
        auth_user_id: "auth-1",
        partner_id: activePartner.id,
        phone: "18600000000",
        status: "active",
        partner: activePartner,
      })),
    };
    const { PlatformPartnerPortalService } = await import("./platform-partner-portal");
    const service = new PlatformPartnerPortalService({
      repository,
      wechatSessionResolver: async () => ({ openid: "openid-1", unionid: null }),
      authUserResolver: async () => ({ userId: "auth-1", isNewUser: false }),
      tokenSigner: () => "partner-token",
    } as never);

    const result = await service.login({ code: "wx-code" });

    expect(result.token).toBe("partner-token");
    expect(result.authMode).toBe("platform_partner");
    expect(result.roles).toEqual(["platform_partner"]);
    expect(result.partner.id).toBe(activePartner.id);
  });

  test("rejects login when wechat user has no bound partner member", async () => {
    const repository = {
      findMemberByAuthUserId: mock(async () => null),
    };
    const { PlatformPartnerPortalService } = await import("./platform-partner-portal");
    const service = new PlatformPartnerPortalService({
      repository,
      wechatSessionResolver: async () => ({ openid: "openid-1", unionid: null }),
      authUserResolver: async () => ({ userId: "auth-1", isNewUser: false }),
      tokenSigner: () => "partner-token",
    } as never);

    await expect(service.login({ code: "wx-code" })).rejects.toMatchObject({
      code: "PARTNER_WECHAT_NOT_BOUND",
      statusCode: 401,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts
```

Expected:

- FAIL because `platform-partner-portal` service does not exist.

- [ ] **Step 3: Add schemas**

Create `apps/api/src/schema/platform-partner-portal.ts`:

```ts
import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PartnerAuthLoginSchema = z.object({
  code: z.string().trim().min(1, "缺少微信登录 code"),
}).strict();

export const PartnerAuthSendCodeSchema = z.object({
  phone: z.string().trim().min(6, "手机号不能为空").max(30, "手机号不能超过 30 个字符"),
}).strict();

export const PartnerAuthBindPhoneSchema = PartnerAuthSendCodeSchema.extend({
  code: z.string().trim().min(1, "缺少微信登录 code"),
  sms_code: z.string().trim().length(6, "验证码必须为 6 位"),
}).strict();

export const PartnerDashboardSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式必须为 YYYY-MM").optional(),
});

export const PartnerDashboardTenantListQuerySchema =
  PaginationQuerySchema.extend({
    status: z.enum(["active", "pending_transfer", "ended"]).optional(),
  });

export const PartnerDashboardRevenueEventListQuerySchema =
  PaginationQuerySchema.extend({
    revenue_type: z.enum(["tenant_recharge", "lead_service_fee"]).optional(),
    status: z.enum(["pending", "confirmed", "refunded", "reversed", "blocked"]).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式必须为 YYYY-MM").optional(),
  });

export const PartnerDashboardCommissionLedgerListQuerySchema =
  PaginationQuerySchema.extend({
    status: z.enum(["pending", "blocked", "available", "settling", "settled", "failed", "reversed"]).optional(),
  });

export const PartnerDashboardSettlementListQuerySchema =
  PaginationQuerySchema.extend({
    status: z.enum(["draft", "reviewing", "paid", "canceled"]).optional(),
  });

export type PartnerAuthLoginInput = z.infer<typeof PartnerAuthLoginSchema>;
export type PartnerAuthSendCodeInput = z.infer<typeof PartnerAuthSendCodeSchema>;
export type PartnerAuthBindPhoneInput = z.infer<typeof PartnerAuthBindPhoneSchema>;
export type PartnerDashboardSummaryQuery = z.infer<typeof PartnerDashboardSummaryQuerySchema>;
export type PartnerDashboardTenantListQuery = z.infer<typeof PartnerDashboardTenantListQuerySchema>;
export type PartnerDashboardRevenueEventListQuery = z.infer<typeof PartnerDashboardRevenueEventListQuerySchema>;
export type PartnerDashboardCommissionLedgerListQuery = z.infer<typeof PartnerDashboardCommissionLedgerListQuerySchema>;
export type PartnerDashboardSettlementListQuery = z.infer<typeof PartnerDashboardSettlementListQuerySchema>;
```

- [ ] **Step 4: Extend JWT payload**

Modify `apps/api/src/utils/jwt.ts`:

```ts
export type JwtPayload = {
  sub?: string;
  token_type?: "auth" | "visitor_session" | "h5_marketing";
  openid?: string;
  unionid?: string | null;
  visitor_id?: string;
  login_channel?: "wechat" | "admin_web";
  roles?: string[];
  tenant_id?: string | null;
  tenant_slug?: string | null;
  employee_id?: string | null;
  customer_id?: string | null;
  partner_id?: string | null;
  verified_phone?: string | null;
  iat?: number;
  exp?: number;
};
```

- [ ] **Step 5: Add public auth routes**

Modify `apps/api/src/plugins/auth/legacy/routes.ts` so `isPublicRoute` returns true for:

```ts
if (
  method === "POST" &&
  (
    url === "/partner/auth/login" ||
    url === "/partner/auth/send-code" ||
    url === "/partner/auth/bind-phone"
  )
) {
  return true;
}
```

- [ ] **Step 6: Implement repository and service**

Implement `apps/api/src/repositories/platform-partner-portal.ts` with these exported records and methods:

```ts
export type PlatformPartnerMemberRecord = {
  id: string;
  partner_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  role: "owner" | "operator";
  status: "pending_bind" | "active" | "disabled";
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  partner?: PlatformPartnerRecord | null;
};

export interface PlatformPartnerPortalRepositoryPort {
  findMemberByAuthUserId(authUserId: string): Promise<PlatformPartnerMemberRecord | null>;
  findBindableMemberByPhone(phone: string): Promise<PlatformPartnerMemberRecord | null>;
  bindMemberAuthUser(memberId: string, authUserId: string): Promise<PlatformPartnerMemberRecord>;
  findPartnerById(partnerId: string): Promise<PlatformPartnerRecord | null>;
}

```

The repository class must implement `PlatformPartnerPortalRepositoryPort` and export a singleton named `platformPartnerPortalRepository`.

Implement `apps/api/src/services/platform-partner-portal.ts` with:

```ts
export type PartnerAuthPartnerPayload = {
  id: string;
  name: string;
  status: string;
  region_codes: string[];
  level: { code: string; name: string } | null;
};

export type PartnerAuthResponse = {
  token: string;
  user_id: string;
  roles: ["platform_partner"];
  authMode: "platform_partner";
  partner: PartnerAuthPartnerPayload;
};

export type PartnerAuthMeResponse = Omit<PartnerAuthResponse, "token">;

export interface PlatformPartnerPortalServicePort {
  login(input: PartnerAuthLoginInput): Promise<PartnerAuthResponse>;
  sendCode(input: PartnerAuthSendCodeInput & { requestIp: string | null }): Promise<{ success: true }>;
  bindPhone(input: PartnerAuthBindPhoneInput & { requestIp: string | null }): Promise<PartnerAuthResponse>;
  me(user: JwtPayload | undefined): Promise<PartnerAuthMeResponse>;
}
```

The service class must implement `PlatformPartnerPortalServicePort` and export a singleton named `platformPartnerPortalService`.

Use existing helpers instead of new auth infrastructure:

- `signToken` from `apps/api/src/utils/jwt.ts`
- `smsVerificationCodeService` from `apps/api/src/services/sms-verification-codes.ts`
- WeChat session/auth user resolution patterns from `apps/api/src/services/wechat-auth-legacy/login.ts` and `identity.ts`
- `Errors.business(...)` with codes from the handoff doc

- [ ] **Step 7: Implement controller**

Create `apps/api/src/controllers/platform-partner-portal/index.ts`:

```ts
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  PartnerAuthBindPhoneSchema,
  PartnerAuthLoginSchema,
  PartnerAuthSendCodeSchema,
} from "@/schema/platform-partner-portal";
import { platformPartnerPortalService } from "@/services/platform-partner-portal";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformPartnerPortalController extends BaseController {
  constructor() {
    super("platform-partner-portal");
  }

  @Post("/partner/auth/login")
  async login(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthLoginSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformPartnerPortalService.login(bodyResult.data);
    return ResponseHandler.success(data, "登录成功");
  }

  @Post("/partner/auth/send-code")
  async sendCode(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthSendCodeSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformPartnerPortalService.sendCode({
      ...bodyResult.data,
      requestIp: request.ip ?? null,
    });
    return ResponseHandler.success(data, "验证码已发送");
  }

  @Post("/partner/auth/bind-phone")
  async bindPhone(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthBindPhoneSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await platformPartnerPortalService.bindPhone({
      ...bodyResult.data,
      requestIp: request.ip ?? null,
    });
    return ResponseHandler.success(data, "绑定成功");
  }

  @Get("/partner/auth/me")
  async me(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.me(request.user);
    return ResponseHandler.success(data);
  }
}

export default new PlatformPartnerPortalController();
```

- [ ] **Step 8: Add route tests**

Create `apps/api/src/controllers/platform-partner-portal/routes.test.ts` by following existing route tests. Assert the registered routes include:

```ts
[
  "POST /partner/auth/login",
  "POST /partner/auth/send-code",
  "POST /partner/auth/bind-phone",
  "GET /partner/auth/me",
]
```

- [ ] **Step 9: Verify**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts src/controllers/platform-partner-portal/routes.test.ts
pnpm --dir apps/api run typecheck
```

Expected:

- Partner auth tests PASS.
- Route tests PASS.
- API typecheck PASS.

- [ ] **Step 10: Commit**

Run:

```bash
git add apps/api/src/schema/platform-partner-portal.ts apps/api/src/repositories/platform-partner-portal.ts apps/api/src/services/platform-partner-portal.ts apps/api/src/controllers/platform-partner-portal apps/api/src/utils/jwt.ts apps/api/src/plugins/auth/legacy/routes.ts
git commit -m "feat(api): add partner portal auth"
```

---

## Task 3: Implement Scoped Partner Dashboard APIs

**Files:**

- Modify: `apps/api/src/repositories/platform-partner-portal.ts`
- Modify: `apps/api/src/services/platform-partner-portal.ts`
- Modify: `apps/api/src/controllers/platform-partner-portal/index.ts`
- Test: `apps/api/src/services/platform-partner-portal.test.ts`
- Test: `apps/api/src/controllers/platform-partner-portal/routes.test.ts`

- [ ] **Step 1: Write isolation and pagination tests**

Append tests that call service methods with a JWT-like partner user:

```ts
const partnerUser = {
  sub: "auth-1",
  roles: ["platform_partner"],
  login_channel: "wechat" as const,
  partner_id: activePartner.id,
};

test("lists only tenants for the current partner", async () => {
  const repository = {
    listTenantBindings: mock(async (input: { partnerId: string }) => {
      expect(input.partnerId).toBe(activePartner.id);
      return { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    }),
  };
  const { PlatformPartnerPortalService } = await import("./platform-partner-portal");
  const service = new PlatformPartnerPortalService({ repository } as never);
  await service.listTenants(partnerUser, { page: 1, pageSize: 20 });
});

test("rejects partner dashboard access without partner_id token", async () => {
  const { PlatformPartnerPortalService } = await import("./platform-partner-portal");
  const service = new PlatformPartnerPortalService({ repository: {} } as never);
  await expect(service.summary({ sub: "auth-1", roles: ["platform_partner"] }, {}))
    .rejects.toMatchObject({ statusCode: 403 });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts
```

Expected:

- FAIL because dashboard methods do not exist.

- [ ] **Step 3: Add repository reads**

Add repository methods using `.range()` for lists and `partner_id` filters for every query:

```ts
listInviteCodes(partnerId: string)
listTenantBindings(input: { partnerId: string; page: number; pageSize: number; status?: string })
listRevenueEvents(input: { partnerId: string; page: number; pageSize: number; revenue_type?: string; status?: string; month?: string })
listCommissionLedgers(input: { partnerId: string; page: number; pageSize: number; status?: string })
listSettlementBatches(input: { partnerId: string; page: number; pageSize: number; status?: string })
getMonthlySummary(input: { partnerId: string; month: string })
```

For `month`, derive `[start, end)` dates in service and pass them into repository instead of string-filtering timestamps.

- [ ] **Step 4: Add service methods**

Add:

```ts
summary(user: JwtPayload | undefined, query: PartnerDashboardSummaryQuery)
listInviteCodes(user: JwtPayload | undefined)
listTenants(user: JwtPayload | undefined, query: PartnerDashboardTenantListQuery)
listRevenueEvents(user: JwtPayload | undefined, query: PartnerDashboardRevenueEventListQuery)
listCommissionLedger(user: JwtPayload | undefined, query: PartnerDashboardCommissionLedgerListQuery)
listSettlements(user: JwtPayload | undefined, query: PartnerDashboardSettlementListQuery)
```

Each method must call a shared `requirePartnerUser(user)` that checks:

```ts
roles.includes("platform_partner")
typeof user.partner_id === "string"
user.partner_id.length > 0
```

- [ ] **Step 5: Add controller endpoints**

Add to `apps/api/src/controllers/platform-partner-portal/index.ts`:

```ts
@Get("/partner/dashboard/summary")
@Get("/partner/invite-codes")
@Get("/partner/dashboard/tenants")
@Get("/partner/dashboard/revenue-events")
@Get("/partner/dashboard/commission-ledger")
@Get("/partner/dashboard/settlements")
```

Each endpoint must parse its matching schema and return `ResponseHandler.success(data)`.

- [ ] **Step 6: Extend route tests**

Assert these routes are registered:

```ts
[
  "GET /partner/dashboard/summary",
  "GET /partner/invite-codes",
  "GET /partner/dashboard/tenants",
  "GET /partner/dashboard/revenue-events",
  "GET /partner/dashboard/commission-ledger",
  "GET /partner/dashboard/settlements",
]
```

- [ ] **Step 7: Verify**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts src/controllers/platform-partner-portal/routes.test.ts
pnpm --dir apps/api run typecheck
```

Expected:

- Service tests PASS.
- Route tests PASS.
- API typecheck PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/api/src/repositories/platform-partner-portal.ts apps/api/src/services/platform-partner-portal.ts apps/api/src/controllers/platform-partner-portal apps/api/src/services/platform-partner-portal.test.ts
git commit -m "feat(api): add partner portal dashboard"
```

---

## Task 4: Add Superadmin Partner Member Management

**Files:**

- Modify: `apps/api/src/schema/platform-partners.ts`
- Modify: `apps/api/src/repositories/platform-partners.ts`
- Modify: `apps/api/src/services/platform-partners.ts`
- Modify: `apps/api/src/controllers/platform-partners/index.ts`
- Modify: `apps/admin/app/(console)/platform/partners/page.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-types.ts`
- Modify: `apps/admin/components/platform-partners/platform-partner-actions.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-tables.tsx`
- Modify: `apps/admin/components/platform-partners/platform-partner-filters.tsx`
- Test: `apps/api/src/services/platform-partners.test.ts`
- Test: `apps/api/src/controllers/platform-partners/routes.test.ts`
- Test: `apps/admin/components/platform-partners/platform-partner-page-layout.test.ts`

- [ ] **Step 1: Write API tests for member management**

Add tests that verify:

```ts
service.createPartnerMember(authContext, partnerId, {
  name: "张三",
  phone: "18600000000",
  role: "owner",
});

service.listPartnerMembers(authContext, partnerId);

service.updatePartnerMemberStatus(authContext, memberId, {
  status: "disabled",
  reason: "离职",
});
```

Expected assertions:

- Uses `platform.partner.manage`.
- Requires active or pending partner to create member.
- Does not overwrite `auth_user_id`.
- Status update only changes `status` and `updated_by_employee_id`; the status change reason is written to `remark` in the same style as current partner status updates.

- [ ] **Step 2: Add schemas**

Add to `apps/api/src/schema/platform-partners.ts`:

```ts
export const PlatformPartnerMemberCreateSchema = z.object({
  name: z.string().trim().min(1, "成员姓名不能为空").max(60, "成员姓名不能超过 60 个字符"),
  phone: z.string().trim().min(6, "手机号不能为空").max(30, "手机号不能超过 30 个字符"),
  role: z.enum(["owner", "operator"]).default("owner"),
}).strict();

export const PlatformPartnerMemberStatusUpdateSchema = z.object({
  status: z.enum(["pending_bind", "active", "disabled"]),
  reason: z.string().trim().min(1, "状态变更原因不能为空").max(300, "状态变更原因不能超过 300 个字符"),
}).strict();

export const PlatformPartnerMemberIdParamSchema = z.object({
  memberId: z.uuid("无效的合伙人成员 ID"),
});
```

- [ ] **Step 3: Add API endpoints**

Add:

```http
GET /platform/partners/:id/members
POST /platform/partners/:id/members
PATCH /platform/partner-members/:memberId/status
```

Controller must use `getRequiredPlatformAdminContext`.

- [ ] **Step 4: Add admin UI**

Add a shadcn tab named `members` on `/platform/partners`.

Minimum UI:

- Table columns: 合伙人、姓名、手机号、角色、绑定状态、微信绑定、创建时间、操作。
- Create action: name, phone, role.
- Status action: pending_bind/active/disabled with reason.

- [ ] **Step 5: Verify**

Run:

```bash
bun test src/services/platform-partners.test.ts src/controllers/platform-partners/routes.test.ts
pnpm --dir apps/api run typecheck
bun test components/platform-partners/platform-partner-page-layout.test.ts
pnpm --dir apps/admin run typecheck
```

Expected:

- API tests PASS.
- Admin page layout test PASS.
- API/admin typecheck PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/api/src/schema/platform-partners.ts apps/api/src/repositories/platform-partners.ts apps/api/src/services/platform-partners.ts apps/api/src/controllers/platform-partners apps/admin/app/(console)/platform/partners/page.tsx apps/admin/components/platform-partners
git commit -m "feat(admin): manage partner login members"
```

---

## Task 5: Update Docs and Handoff

**Files:**

- Modify: `docs/2026-07-05-miniprogram-partner-portal-handoff.md`
- Create: `docs/2026-07-05-miniprogram-partner-portal-acceptance.md`

- [ ] **Step 1: Update handoff status**

Change the handoff document status from contract draft to implemented backend contract after Tasks 1-4 pass.

- [ ] **Step 2: Add acceptance note**

Create `docs/2026-07-05-miniprogram-partner-portal-acceptance.md` with:

```md
# 小程序城市合伙人登录与看板验收记录

日期：2026-07-05
分支：feature/partner-miniprogram-portal

## 已实现

- 合伙人成员模型和手机号首次绑定。
- `/partner/auth/login`
- `/partner/auth/send-code`
- `/partner/auth/bind-phone`
- `/partner/auth/me`
- `/partner/dashboard/summary`
- `/partner/invite-codes`
- `/partner/dashboard/tenants`
- `/partner/dashboard/revenue-events`
- `/partner/dashboard/commission-ledger`
- `/partner/dashboard/settlements`
- 超管合伙人成员管理。

## 业务边界

合伙人只查看平台收入分佣，不查看装企自有收支、项目成本和利润。

## 已验证

- API service and route tests passed.
- API typecheck passed.
- Admin typecheck passed.
- Migration dry-run checked before remote apply.
```

- [ ] **Step 3: Verify docs**

Run:

```bash
git diff --check
```

Expected:

- PASS with no whitespace errors.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/2026-07-05-miniprogram-partner-portal-handoff.md docs/2026-07-05-miniprogram-partner-portal-acceptance.md
git commit -m "docs: update partner miniprogram portal handoff"
```

---

## Task 6: Full Verification and Database Apply

**Files:**

- No planned code edits.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test src/services/platform-partner-portal.test.ts src/controllers/platform-partner-portal/routes.test.ts src/services/platform-partners.test.ts src/controllers/platform-partners/routes.test.ts
```

Expected:

- PASS.

- [ ] **Step 2: Run typechecks**

Run:

```bash
pnpm --dir apps/api run typecheck
pnpm --dir apps/admin run typecheck
```

Expected:

- PASS.

- [ ] **Step 3: Run file-size checks**

Run:

```bash
bun scripts/check-api-file-size.ts
pnpm --dir apps/admin run check:file-size
```

Expected:

- PASS.

- [ ] **Step 4: Check migration dry-run**

Run with the configured remote DB URL from local env:

```bash
supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected:

- Only `20260705190000_create_platform_partner_members.sql` is pending.

- [ ] **Step 5: Apply migration after confirming dry-run**

Run:

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected:

- Local and Remote both include `20260705190000`.

- [ ] **Step 6: Final smoke**

Use a test partner and member:

1. Superadmin creates partner member with phone.
2. `POST /partner/auth/send-code` accepts the phone.
3. In test-login mode or controlled SMS environment, `POST /partner/auth/bind-phone` returns `authMode: platform_partner`.
4. `GET /partner/dashboard/summary` with partner token returns only that partner's counts.
5. `GET /partner/dashboard/tenants?page=1&pageSize=101` returns validation error.

- [ ] **Step 7: Final commit or merge request**

Run:

```bash
git status --short
git log --oneline --max-count=8
```

Expected:

- Worktree clean.
- Commits are small and ordered by tasks.

---

## Self-Review

- Spec coverage: Covers partner login, first-time phone binding, partner token, scoped dashboard, superadmin member management, docs, migration, and verification.
- Boundary: Keeps orange read-only and gives mini-program team a stable handoff contract.
- Data safety: All list endpoints are paginated; partner scoping is server-side from token.
- Migration safety: DDL is migration-only and includes dry-run plus migration list verification.
