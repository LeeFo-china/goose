# Douyin Customer Project Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Douyin mini-program customers log in with either Douyin authorized phone or SMS verification, enter "我的项目", and view all construction logs under projects that belong to their customer profile.

**Architecture:** Keep `/douyin-mini/*` public/marketing session tokens separate from customer `auth` tokens. Add a narrow Douyin customer-auth backend that turns a verified phone into customer-only identity candidates, stores short-lived selection state through the existing phone-identity RPCs, binds `douyin_mini` OAuth identity plus customer membership, then reuses the existing `/customer/*` project and log APIs.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase/PostgreSQL migrations and RPC adapters, Douyin mini-program TTML/TTSS, Bun test, TypeScript compiler.

---

## Preconditions And Guardrails

- Read the approved spec first: `docs/superpowers/specs/2026-09-10-douyin-customer-project-logs-design.md`.
- Do not modify `/Users/leefo/Public/work/orange`.
- Do not change `project_logs` schema or add a customer-visible flag. Visibility is controlled by project ownership.
- Keep list endpoints paginated. Reuse current `/customer/projects` and `/customer/projects/:id/logs` pagination defaults and caps.
- All DB changes go through `supabase/migrations/`.
- Do not loosen `douyin_miniapp` JWT claim validation. Customer access must use a normal `auth` token with `login_channel: "douyin"`.
- Do not expose employee or platform partner candidates in the Douyin customer login UI.
- Use `Errors.business`, `Errors.fromZod`, `Errors.unauthorized`, or `Errors.dbError`.
- Use `apply_patch` for manual edits and commit each task separately.

## File Responsibility Map

### New Files

- `supabase/migrations/20260910120000_allow_douyin_mini_oauth_identity.sql`: add `douyin_mini` to `user_oauth_identities_platform_check` and update the column comment.
- `apps/api/src/services/auth-users.ts`: create generic local auth users for non-WeChat platform login.
- `apps/api/src/services/douyin-miniapp/customer-auth.ts`: Douyin customer-auth orchestration, candidate filtering, phone authorization, SMS verification, selection, customer binding, and token construction.
- `apps/api/src/services/douyin-miniapp/customer-auth.test.ts`: service unit tests for SMS, authorized-phone, no-match, single-customer, multiple-customer, stale-selection, and non-customer filtering.
- `apps/api/src/schema/douyin-customer-auth.ts`: strict request schemas for `/douyin-mini/customer-auth/*`.
- `apps/api/src/schema/douyin-customer-auth.test.ts`: schema contract tests.
- `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.ts`: thin Fastify route handlers.
- `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts`: route registration and validation dispatch tests.
- `apps/api/src/plugins/auth/legacy/douyin-customer-assertions.ts`: verify `login_channel: "douyin"` customer auth tokens against active `douyin_mini` OAuth identity and customer membership.
- `apps/douyin-mini/src/state/customer-session.ts`: persisted customer auth token provider and refresh/clear helpers.
- `apps/douyin-mini/src/api/customer-auth.ts`: client functions and strict response parsers for login endpoints.
- `apps/douyin-mini/src/api/customer.ts`: client functions and parsers for `/customer/bootstrap`, projects, detail bootstrap, logs, and comments.
- `apps/douyin-mini/src/pages/customer-login/index.{json,ts,ttml,ttss}`: login page with Douyin phone, SMS fallback, and identity selection.
- `apps/douyin-mini/src/pages/customer-login/page.ts`: testable page state machine.
- `apps/douyin-mini/src/pages/customer-login/page.test.ts`: login page behavior tests.
- `apps/douyin-mini/src/pages/customer-projects/index.{json,ts,ttml,ttss}`: "我的项目" list page.
- `apps/douyin-mini/src/pages/customer-projects/page.ts`: testable project list state.
- `apps/douyin-mini/src/pages/customer-projects/page.test.ts`: project list behavior tests.
- `apps/douyin-mini/src/pages/customer-project-detail/index.{json,ts,ttml,ttss}`: project detail and all construction logs page.
- `apps/douyin-mini/src/pages/customer-project-detail/page.ts`: testable project detail/log pagination state.
- `apps/douyin-mini/src/pages/customer-project-detail/page.test.ts`: detail/log behavior tests.

### Modified Files

- `apps/api/src/repositories/user-identities.ts`: extend `OAuthPlatform` with `"douyin_mini"`.
- `apps/api/src/services/user-identities.ts`: allow sync/cache/event flows to accept the new platform.
- `apps/api/src/repositories/phone-identity-candidates.ts`: add platform-aware active OAuth lookup and optional customer-only candidate query.
- `apps/api/src/services/phone-identity-login/candidates.ts`: support platform-aware binding-state checks without changing WeChat defaults.
- `apps/api/src/services/phone-identity-login/types.ts`: add rebind kind `"douyin_mini"` if customer candidate already belongs to another active Douyin identity.
- `apps/api/src/services/phone-identity-login/bindings.ts`: reuse customer revalidation shape for Douyin customer-only login.
- `apps/api/src/services/wechat-auth-legacy/common.ts`: expose platform-neutral `signAuthToken` helper or keep `signWechatAuthToken` untouched and sign directly in the Douyin service.
- `apps/api/src/utils/jwt.ts`: keep `JwtPayload` fields and add tests proving Douyin customer `auth` tokens verify while strict `douyin_miniapp` tokens remain unchanged.
- `apps/api/src/plugins/auth/legacy-plugin.ts`: run Douyin customer-token assertion on `/customer/*` when `payload.login_channel === "douyin"`.
- `apps/api/src/plugins/auth/legacy/types.ts`: include any new auth reject reason only if needed by tests.
- `apps/api/src/plugins/auth/legacy/routes.ts`: no route bypass for customer-auth; route isolation tests should prove `/douyin-mini/customer-auth/*` still needs a Douyin miniapp session token.
- `apps/api/src/controllers/douyin-miniapp/index.ts`: register customer-auth routes through the new controller.
- `apps/api/src/controllers/douyin-miniapp/index.test.ts`: include the new exact routes in registration expectations.
- `apps/api/src/types/database.ts`: regenerate after migration is applied.
- `apps/douyin-mini/src/models/index.ts`: add customer auth/project/log models and include customer pages in `DOUYIN_ENTRY_PATH_VALUES`.
- `packages/domain/src/douyin-miniapp.ts`: include the three customer pages in the canonical Douyin entry path values if this file owns the source list.
- `apps/douyin-mini/src/app.ts`: create `customerApi` using the customer token provider.
- `apps/douyin-mini/src/app.json`: add customer pages, without adding a tab in this first pass.
- `apps/douyin-mini/src/api/request.ts`: allow `ApiClient` to work with the new customer token provider unchanged.
- `apps/douyin-mini/src/platform/navigation.ts`: add customer page route builders.
- `apps/douyin-mini/src/platform/storage.ts`: store customer session separately from public Douyin miniapp session.
- `apps/douyin-mini/src/pages/home/index.ts`, `index.ttml`, `page.ts`, `page.test.ts`: add a "我的项目" entry that routes to projects if logged in, otherwise login.

## Task 1: Migration And Platform Type Contract

**Files:**
- Create: `supabase/migrations/20260910120000_allow_douyin_mini_oauth_identity.sql`
- Modify: `apps/api/src/repositories/user-identities.ts`
- Modify: `apps/api/src/services/user-identities.ts`
- Modify: `apps/api/src/types/database.ts`
- Test: `apps/api/src/repositories/user-identities.test.ts`
- Test: `apps/api/src/types/database-douyin-miniapp-contract.test.ts`

- [ ] **Step 1: Write failing platform tests**

Add this focused assertion to `apps/api/src/repositories/user-identities.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { OAuthPlatform } from "./user-identities";

describe("user identity platforms", () => {
  test("allows Douyin mini-program OAuth identities", () => {
    const platform: OAuthPlatform = "douyin_mini";
    expect(platform).toBe("douyin_mini");
  });
});
```

Add a migration contract test to `apps/api/src/types/database-douyin-miniapp-contract.test.ts`:

```ts
test("migration allows douyin_mini user OAuth platform", async () => {
  const migration = await Bun.file(
    new URL("../../../../supabase/migrations/20260910120000_allow_douyin_mini_oauth_identity.sql", import.meta.url),
  ).text();

  expect(migration).toContain("user_oauth_identities_platform_check");
  expect(migration).toContain("'douyin_mini'");
  expect(migration).toContain("wechat_mini/wechat_web/ios/android/web/apple/douyin_mini");
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
bun test apps/api/src/repositories/user-identities.test.ts apps/api/src/types/database-douyin-miniapp-contract.test.ts
```

Expected: FAIL because the platform type and migration file do not exist yet.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260910120000_allow_douyin_mini_oauth_identity.sql`:

```sql
-- Allow Douyin mini-program customer auth credentials.
-- Rollback: deploy an API that no longer writes platform = 'douyin_mini',
-- mark any active douyin_mini identities unbound after export, then restore the
-- previous check constraint without 'douyin_mini'.
BEGIN;

ALTER TABLE public.user_oauth_identities
  DROP CONSTRAINT IF EXISTS user_oauth_identities_platform_check;

ALTER TABLE public.user_oauth_identities
  ADD CONSTRAINT user_oauth_identities_platform_check
  CHECK (platform IN (
    'wechat_mini',
    'wechat_web',
    'ios',
    'android',
    'web',
    'apple',
    'douyin_mini'
  ));

COMMENT ON COLUMN public.user_oauth_identities.platform IS
  '登录平台：wechat_mini/wechat_web/ios/android/web/apple/douyin_mini';

COMMIT;
```

- [ ] **Step 4: Update TypeScript platform unions**

In `apps/api/src/repositories/user-identities.ts`, change:

```ts
export type OAuthPlatform =
  | "wechat_mini"
  | "wechat_web"
  | "ios"
  | "android"
  | "web"
  | "apple"
  | "douyin_mini";
```

No extra service code is needed if `apps/api/src/services/user-identities.ts` already imports `OAuthPlatform`.

- [ ] **Step 5: Regenerate DB types after applying the migration**

Run only after the migration is applied to the target Supabase project:

```bash
supabase migration list
supabase db push
supabase migration list
bun run gen
```

Expected: local and remote migration lists align; `apps/api/src/types/database.ts` includes the updated check-constrained platform values only if Supabase emits that enum-like information.

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun test apps/api/src/repositories/user-identities.test.ts apps/api/src/types/database-douyin-miniapp-contract.test.ts
bun run api:typecheck
git add supabase/migrations/20260910120000_allow_douyin_mini_oauth_identity.sql apps/api/src/repositories/user-identities.ts apps/api/src/services/user-identities.ts apps/api/src/types/database.ts apps/api/src/repositories/user-identities.test.ts apps/api/src/types/database-douyin-miniapp-contract.test.ts
git commit -m "feat(api): allow douyin customer oauth identities"
```

Expected: tests and typecheck pass.

## Task 2: Douyin Customer Auth Backend

**Files:**
- Create: `apps/api/src/schema/douyin-customer-auth.ts`
- Create: `apps/api/src/schema/douyin-customer-auth.test.ts`
- Create: `apps/api/src/services/auth-users.ts`
- Create: `apps/api/src/services/douyin-miniapp/customer-auth.ts`
- Create: `apps/api/src/services/douyin-miniapp/customer-auth.test.ts`
- Modify: `apps/api/src/repositories/phone-identity-candidates.ts`
- Modify: `apps/api/src/services/phone-identity-login/candidates.ts`
- Modify: `apps/api/src/services/phone-identity-login/types.ts`

- [ ] **Step 1: Write strict schema tests**

Create `apps/api/src/schema/douyin-customer-auth.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  DouyinCustomerAuthAuthorizeSchema,
  DouyinCustomerAuthSelectSchema,
  DouyinCustomerAuthSendCodeSchema,
  DouyinCustomerAuthVerifySchema,
} from "./douyin-customer-auth";

describe("douyin customer auth schemas", () => {
  test("accepts exact request bodies", () => {
    expect(DouyinCustomerAuthSendCodeSchema.parse({ phone: "13800138000" }))
      .toEqual({ phone: "13800138000" });
    expect(DouyinCustomerAuthVerifySchema.parse({
      phone: "13800138000",
      code: "123456",
    })).toEqual({ phone: "13800138000", code: "123456" });
    expect(DouyinCustomerAuthAuthorizeSchema.parse({
      douyin_phone_code: "official-phone-code",
    })).toEqual({ douyin_phone_code: "official-phone-code" });
    expect(DouyinCustomerAuthSelectSchema.parse({
      selection_token: "A".repeat(43),
      candidate_id: "11111111-1111-4111-8111-111111111111",
    }).candidate_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects client supplied tenant and customer ids", () => {
    for (const body of [
      { phone: "13800138000", tenant_id: crypto.randomUUID() },
      { phone: "13800138000", code: "123456", customer_id: crypto.randomUUID() },
      { douyin_phone_code: "official-phone-code", target_mode: "employee" },
      { selection_token: "A".repeat(43), candidate_id: crypto.randomUUID(), tenant_id: crypto.randomUUID() },
    ]) {
      const result = "douyin_phone_code" in body
        ? DouyinCustomerAuthAuthorizeSchema.safeParse(body)
        : "selection_token" in body
          ? DouyinCustomerAuthSelectSchema.safeParse(body)
          : "code" in body
            ? DouyinCustomerAuthVerifySchema.safeParse(body)
            : DouyinCustomerAuthSendCodeSchema.safeParse(body);
      expect(result.success).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run schema tests and confirm failure**

Run:

```bash
bun test apps/api/src/schema/douyin-customer-auth.test.ts
```

Expected: FAIL because `douyin-customer-auth.ts` does not exist.

- [ ] **Step 3: Implement schemas**

Create `apps/api/src/schema/douyin-customer-auth.ts`:

```ts
import { z } from "zod";

const ChinaMobilePhoneSchema = z.string().trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");
const SmsCodeSchema = z.string().trim()
  .regex(/^\d{4,6}$/, "验证码格式不正确");
const SelectionTokenSchema = z.string().trim()
  .min(43, "选择 token 过短")
  .max(128, "选择 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "选择 token 格式不正确");

export const DouyinCustomerAuthSendCodeSchema = z.strictObject({
  phone: ChinaMobilePhoneSchema,
});
export const DouyinCustomerAuthVerifySchema = z.strictObject({
  phone: ChinaMobilePhoneSchema,
  code: SmsCodeSchema,
});
export const DouyinCustomerAuthAuthorizeSchema = z.strictObject({
  douyin_phone_code: z.string().trim().min(1).max(512),
});
export const DouyinCustomerAuthSelectSchema = z.strictObject({
  selection_token: SelectionTokenSchema,
  candidate_id: z.uuid("无效的候选身份 ID"),
});

export type DouyinCustomerAuthSendCodeInput =
  z.infer<typeof DouyinCustomerAuthSendCodeSchema>;
export type DouyinCustomerAuthVerifyInput =
  z.infer<typeof DouyinCustomerAuthVerifySchema>;
export type DouyinCustomerAuthAuthorizeInput =
  z.infer<typeof DouyinCustomerAuthAuthorizeSchema>;
export type DouyinCustomerAuthSelectInput =
  z.infer<typeof DouyinCustomerAuthSelectSchema>;
```

- [ ] **Step 4: Write service tests before implementation**

Create `apps/api/src/services/douyin-miniapp/customer-auth.test.ts` with these cases:

```ts
import { describe, expect, mock, test } from "bun:test";
import { DouyinCustomerAuthService } from "./customer-auth";

const douyinUser = {
  token_type: "douyin_miniapp" as const,
  login_channel: "douyin" as const,
  tenant_id: "33333333-3333-4333-8333-333333333333",
  douyin_installation_id: "22222222-2222-4222-8222-222222222222",
  douyin_app_id: "tt-authorizer-1",
  subject_hash: "a".repeat(64),
};

const activeCustomer = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: douyinUser.tenant_id,
  user_id: null,
  name: "张三",
  phone: "13800138000",
  tenant: { id: douyinUser.tenant_id, name: "青禾装饰", slug: "qinghe", status: "active" },
};

describe("DouyinCustomerAuthService", () => {
  test("sendCode requires a Douyin miniapp session and sends login_identity SMS", async () => {
    const sendCode = mock(async () => ({ success: true as const, cooldown_seconds: 60 }));
    const service = makeService({ sendCode });

    await expect(service.sendCode({
      request: { user: douyinUser, id: "req-1", log: testLog() },
      input: { phone: "13800138000" },
      requestIp: "127.0.0.1",
    })).resolves.toEqual({ success: true, cooldown_seconds: 60 });
    expect(sendCode).toHaveBeenCalledWith({
      phone: "13800138000",
      scene: "login_identity",
      requestIp: "127.0.0.1",
      requestDevice: douyinUser.subject_hash,
      requestIpLimit: 5,
    });
  });

  test("authorized Douyin phone authenticates a single customer and signs customer auth", async () => {
    const service = makeService({
      getPhoneNumberInfo: mock(async () => ({ phone: "13800138000" })),
      listCustomersByPhone: mock(async () => [activeCustomer]),
    });

    const result = await service.authorizePhone({
      request: { user: douyinUser, id: "req-2", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    });

    expect(result).toMatchObject({
      status: "authenticated",
      auth: {
        mode: "customer",
        roles: ["customer"],
        tenant: { id: douyinUser.tenant_id, name: "青禾装饰" },
        customer: { id: activeCustomer.id, name: "张三", phone: "13800138000" },
        verified_phone: "13800138000",
      },
    });
  });

  test("multiple customer candidates return selection_required without employee candidates", async () => {
    const service = makeService({
      claimVerification: mock(async () => ({ status: "claimed" as const, sessionId: "99999999-9999-4999-8999-999999999999" })),
      listCustomersByPhone: mock(async () => [activeCustomer, { ...activeCustomer, id: "44444444-4444-4444-8444-444444444444", tenant: { id: activeCustomer.tenant_id, name: "同城装饰", slug: "tc", status: "active" } }]),
      listEmployeesByPhone: mock(async () => [{ id: "emp", tenant_id: activeCustomer.tenant_id }]),
      beginSelection: mock(async () => "ready" as const),
    });

    const result = await service.verifySms({
      request: { user: douyinUser, id: "req-3", log: testLog() },
      input: { phone: "13800138000", code: "123456" },
    });

    expect(result.status).toBe("selection_required");
    if (result.status === "selection_required") {
      expect(result.candidates.every((item) => item.target_mode === "customer")).toBe(true);
    }
  });

  test("zero customer match does not create a customer profile", async () => {
    const service = makeService({
      listCustomersByPhone: mock(async () => []),
    });

    await expect(service.authorizePhone({
      request: { user: douyinUser, id: "req-4", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "CUSTOMER_CONTEXT_MISSING",
    });
  });
});

function testLog() {
  return { info: () => undefined, warn: () => undefined };
}

function makeService(
  overrides: Partial<ConstructorParameters<typeof DouyinCustomerAuthService>[0]> = {},
) {
  return new DouyinCustomerAuthService({
    smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
      reserveBypassCode: mock(async () => ({ code: "123456" })),
    },
    sessionRepository: {
      claimVerification: mock(async () => ({
        status: "claimed" as const,
        sessionId: "99999999-9999-4999-8999-999999999999",
      })),
      beginSelection: mock(async () => "ready" as const),
      reserveSelection: mock(async () => ({
        status: "reserved" as const,
        sessionId: "99999999-9999-4999-8999-999999999999",
        verifiedPhone: "13800138000",
        candidate: {
          id: activeCustomer.id,
          targetMode: "customer" as const,
          tenantId: activeCustomer.tenant_id,
          customerId: activeCustomer.id,
          employeeId: null,
          partnerId: null,
          partnerMemberId: null,
        },
      })),
      finalizeSelection: mock(async () => "consumed" as const),
      releaseSelection: mock(async () => "released" as const),
    },
    candidateRepository: {
      listCustomersByPhone: mock(async () => [activeCustomer]),
      listEmployeesByPhone: mock(async () => []),
      listPartnerMembersByPhone: mock(async () => []),
      listActiveMembershipKeys: mock(async () => new Set<string>()),
      listActiveOauthUserIds: mock(async () => new Set<string>()),
    },
    authUsers: {
      createLocalPlatformUser: mock(async () =>
        "77777777-7777-4777-8777-777777777777"
      ),
    },
    userIdentities: {
      findActiveOauthIdentity: mock(async () => null),
      syncOauthIdentityBestEffort: mock(async () => undefined),
      syncBusinessMembershipBestEffort: mock(async () => undefined),
    },
    customerIdentity: {
      getCustomerTenantOptionById: mock(async () => activeCustomer),
      bindCustomerAuthUser: mock(async () => undefined),
    },
    accessTokens: {
      getAuthorizerAccessToken: mock(async () => "authorizer-access-token"),
    },
    phoneGateway: {
      getPhoneNumberInfo: mock(async () => ({ phone: "13800138000" })),
    },
    douyinPhoneNumberPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    tokenSigner: mock(() => "customer-auth-token"),
    now: () => new Date("2026-09-10T00:00:00.000Z"),
    createSelectionToken: () => "S".repeat(43),
    ...overrides,
  });
}
```

- [ ] **Step 5: Implement generic auth user creation**

Create `apps/api/src/services/auth-users.ts`:

```ts
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type AuthUserPlatform = "douyin_mini";

export class AuthUsersService {
  constructor(private readonly adminClient = SupabaseDB.getAdminClient()) {}

  async createLocalPlatformUser(input: {
    platform: AuthUserPlatform;
    subject: string;
    source: string;
  }) {
    const emailLocalPart = `${input.platform}.${input.subject}.${crypto.randomUUID()}`;
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email: `${emailLocalPart}@auth.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        platform: input.platform,
        subject: input.subject,
        source: input.source,
      },
    });
    if (error || !data.user) {
      throw Errors.dbError("创建登录用户失败", error ?? { message: "createUser returned no user" });
    }
    return data.user.id;
  }
}

export const authUsersService = new AuthUsersService();
```

- [ ] **Step 6: Implement Douyin customer-auth service**

Create `apps/api/src/services/douyin-miniapp/customer-auth.ts` with these public methods:

```ts
export class DouyinCustomerAuthService {
  async sendCode(input: {
    request: { user?: JwtPayload; id?: string; log?: RequestLogger };
    input: DouyinCustomerAuthSendCodeInput;
    requestIp: string | null;
  }) {}

  async verifySms(input: {
    request: { user?: JwtPayload; id?: string; log?: RequestLogger };
    input: DouyinCustomerAuthVerifyInput;
  }) {}

  async authorizePhone(input: {
    request: { user?: JwtPayload; id?: string; log?: RequestLogger };
    input: DouyinCustomerAuthAuthorizeInput;
  }) {}

  async select(input: {
    request: { user?: JwtPayload; id?: string; log?: RequestLogger };
    input: DouyinCustomerAuthSelectInput;
  }) {}
}
```

The implementation rules:

```ts
function requireDouyinActor(request: { user?: JwtPayload }) {
  const user = request.user;
  if (
    user?.token_type !== "douyin_miniapp" ||
    user.login_channel !== "douyin" ||
    !user.tenant_id ||
    !user.douyin_installation_id ||
    !user.douyin_app_id ||
    !user.subject_hash
  ) {
    throw Errors.unauthorized("请先建立有效的抖音小程序会话", ErrorCodes.AUTH_SESSION_REQUIRED);
  }
  return user;
}
```

Candidate discovery must:

```ts
const customers = await candidateRepository.listCustomersByPhone(phone);
const activeMembershipKeys = await candidateRepository.listActiveMembershipKeys(authUserId);
const relatedUserIds = customers
  .map((item) => item.user_id)
  .filter((id): id is string => typeof id === "string" && id.length > 0);
const activeDouyinOauthUserIds =
  await candidateRepository.listActiveOauthUserIds(relatedUserIds, "douyin_mini");
const discovery = buildPhoneIdentityCandidates({
  currentAuthUserId: authUserId,
  customers,
  employees: [],
  partnerMembers: [],
  activeMembershipKeys,
  activeOauthUserIds: activeDouyinOauthUserIds,
  platform: "douyin_mini",
});
```

Auth user resolution must use `userIdentityService.findActiveOauthIdentity({ platform: "douyin_mini", openid: subjectHash })`; on miss call `authUsersService.createLocalPlatformUser`, then `userIdentityService.syncOauthIdentityBestEffort({ platform: "douyin_mini", openid: subjectHash, unionid: null })`.

Customer authentication must:

```ts
await wechatCustomerIdentityService.bindCustomerAuthUser({
  authUserId,
  customer,
});
await userIdentityService.syncOauthIdentityBestEffort({
  userId: authUserId,
  platform: "douyin_mini",
  openid: actor.subject_hash,
  unionid: null,
  source: "douyin_customer_login",
});
await userIdentityService.syncBusinessMembershipBestEffort({
  userId: authUserId,
  tenantId: customer.tenant_id,
  identityType: "customer",
  identityId: customer.id,
  source: "douyin_customer_login",
});
const token = signToken({
  sub: authUserId,
  token_type: "auth",
  login_channel: "douyin",
  roles: ["customer"],
  tenant_id: customer.tenant_id,
  tenant_slug: tenant?.slug ?? null,
  customer_id: customer.id,
  verified_phone: verifiedPhone,
  subject_hash: actor.subject_hash,
  douyin_installation_id: actor.douyin_installation_id,
  douyin_app_id: actor.douyin_app_id,
});
```

For zero candidates, throw:

```ts
throw Errors.business(
  404,
  "未找到客户档案，请联系装修公司确认预留手机号",
  ErrorCodes.CUSTOMER_CONTEXT_MISSING,
);
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
bun test apps/api/src/schema/douyin-customer-auth.test.ts apps/api/src/services/douyin-miniapp/customer-auth.test.ts
bun run api:typecheck
git add apps/api/src/schema/douyin-customer-auth.ts apps/api/src/schema/douyin-customer-auth.test.ts apps/api/src/services/auth-users.ts apps/api/src/services/douyin-miniapp/customer-auth.ts apps/api/src/services/douyin-miniapp/customer-auth.test.ts apps/api/src/repositories/phone-identity-candidates.ts apps/api/src/services/phone-identity-login/candidates.ts apps/api/src/services/phone-identity-login/types.ts
git commit -m "feat(api): add douyin customer phone login service"
```

Expected: focused tests and typecheck pass.

## Task 3: Routes And Auth Plugin Boundary

**Files:**
- Create: `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts`
- Create: `apps/api/src/plugins/auth/legacy/douyin-customer-assertions.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts`

- [ ] **Step 1: Write route and auth boundary tests**

In `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts`, assert exact routes:

```ts
expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
  "POST /douyin-mini/customer-auth/phone/send-code",
  "POST /douyin-mini/customer-auth/phone/verify",
  "POST /douyin-mini/customer-auth/phone/authorize",
  "POST /douyin-mini/customer-auth/select",
]);
```

In `apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts`, add an injection test:

```ts
app.post("/douyin-mini/customer-auth/phone/send-code", async (request) => ({ user: request.user }));
app.get("/customer/projects", async (request) => ({ user: request.user }));

const miniToken = signDouyinMiniappToken(douyinPayload);
const customerToken = signToken({
  sub: "11111111-1111-4111-8111-111111111111",
  token_type: "auth",
  login_channel: "douyin",
  roles: ["customer"],
  tenant_id: douyinPayload.tenant_id,
  customer_id: "55555555-5555-4555-8555-555555555555",
  subject_hash: douyinPayload.subject_hash,
  douyin_installation_id: douyinPayload.douyin_installation_id,
  douyin_app_id: douyinPayload.douyin_app_id,
});

expect((await app.inject({
  method: "POST",
  url: "/douyin-mini/customer-auth/phone/send-code",
  headers: { authorization: `Bearer ${miniToken}` },
  payload: { phone: "13800138000" },
})).statusCode).toBe(200);
expect((await app.inject({
  method: "POST",
  url: "/douyin-mini/customer-auth/phone/send-code",
  headers: { authorization: `Bearer ${customerToken}` },
  payload: { phone: "13800138000" },
})).statusCode).toBe(401);
expect((await app.inject({
  method: "GET",
  url: "/customer/projects",
  headers: { authorization: `Bearer ${miniToken}` },
})).statusCode).toBe(401);
```

Mock `douyinCustomerAssertions.assertDouyinCustomerBinding` in the test module so the customer token can reach `/customer/projects` only when the assertion resolves.

- [ ] **Step 2: Run route/auth tests and confirm failure**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts
```

Expected: FAIL because routes and assertions are missing.

- [ ] **Step 3: Implement the controller**

Create `apps/api/src/controllers/douyin-miniapp/customer-auth-controller.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  DouyinCustomerAuthAuthorizeSchema,
  DouyinCustomerAuthSelectSchema,
  DouyinCustomerAuthSendCodeSchema,
  DouyinCustomerAuthVerifySchema,
} from "@/schema/douyin-customer-auth";
import { douyinCustomerAuthService } from "@/services/douyin-miniapp/customer-auth";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

export class DouyinCustomerAuthController {
  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.post("/douyin-mini/customer-auth/phone/send-code", this.sendCode);
    fastify.post("/douyin-mini/customer-auth/phone/verify", this.verify);
    fastify.post("/douyin-mini/customer-auth/phone/authorize", this.authorize);
    fastify.post("/douyin-mini/customer-auth/select", this.select);
  }

  sendCode = async (request: FastifyRequest) => {
    const result = DouyinCustomerAuthSendCodeSchema.safeParse(request.body || {});
    if (!result.success) throw Errors.fromZod(result.error);
    const data = await douyinCustomerAuthService.sendCode({
      request,
      input: result.data,
      requestIp: resolveTrustedClientIp(request),
    });
    return ResponseHandler.success(data, "验证码已发送");
  };

  verify = async (request: FastifyRequest) => {
    const result = DouyinCustomerAuthVerifySchema.safeParse(request.body || {});
    if (!result.success) throw Errors.fromZod(result.error);
    const data = await douyinCustomerAuthService.verifySms({ request, input: result.data });
    return ResponseHandler.success(data, data.status === "selection_required" ? "请选择登录身份" : "登录成功");
  };

  authorize = async (request: FastifyRequest) => {
    const result = DouyinCustomerAuthAuthorizeSchema.safeParse(request.body || {});
    if (!result.success) throw Errors.fromZod(result.error);
    const data = await douyinCustomerAuthService.authorizePhone({ request, input: result.data });
    return ResponseHandler.success(data, data.status === "selection_required" ? "请选择登录身份" : "登录成功");
  };

  select = async (request: FastifyRequest) => {
    const result = DouyinCustomerAuthSelectSchema.safeParse(request.body || {});
    if (!result.success) throw Errors.fromZod(result.error);
    const data = await douyinCustomerAuthService.select({ request, input: result.data });
    return ResponseHandler.success(data, "登录成功");
  };
}

export default new DouyinCustomerAuthController();
```

Register it from `apps/api/src/controllers/douyin-miniapp/index.ts` inside `registerExtraRoutes`.

- [ ] **Step 4: Implement Douyin customer token assertion**

Create `apps/api/src/plugins/auth/legacy/douyin-customer-assertions.ts`:

```ts
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import type { VerifiedJwtPayload } from "./types";

export async function assertDouyinCustomerBinding(payload: VerifiedJwtPayload) {
  if (payload.login_channel !== "douyin") return;
  if (
    payload.token_type !== "auth" ||
    !payload.sub ||
    !payload.subject_hash ||
    !payload.tenant_id ||
    !payload.customer_id ||
    !Array.isArray(payload.roles) ||
    !payload.roles.includes("customer")
  ) {
    throw Errors.unauthorized("当前抖音客户登录凭证无效", ErrorCodes.TOKEN_INVALID);
  }

  const activeOauth = await userIdentityService.findActiveOauthIdentity({
    platform: "douyin_mini",
    openid: payload.subject_hash,
  });
  if (activeOauth?.user_id !== payload.sub) {
    throw Errors.unauthorized(
      "当前抖音登录凭证已失效，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }

  const hasMembership = await userIdentityService.hasActiveBusinessMembership({
    userId: payload.sub,
    tenantId: payload.tenant_id,
    identityType: "customer",
    identityId: payload.customer_id,
  });
  if (!hasMembership) {
    throw Errors.unauthorized(
      "当前客户身份已失效，请重新登录",
      ErrorCodes.CUSTOMER_CONTEXT_MISSING,
    );
  }
}
```

In `apps/api/src/plugins/auth/legacy-plugin.ts`, before `assertWechatCustomerBootstrap` / `assertWechatIdentityBinding`, branch:

```ts
if (payload.login_channel === "douyin") {
  await logAuthStage(request, "assert_douyin_customer_binding", () =>
    assertDouyinCustomerBinding(payload)
  );
  request.user = payload;
  return true;
}
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts
bun run api:typecheck
git add apps/api/src/controllers/douyin-miniapp/customer-auth-controller.ts apps/api/src/controllers/douyin-miniapp/customer-auth-controller.test.ts apps/api/src/controllers/douyin-miniapp/index.ts apps/api/src/controllers/douyin-miniapp/index.test.ts apps/api/src/plugins/auth/legacy/douyin-customer-assertions.ts apps/api/src/plugins/auth/legacy-plugin.ts apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts
git commit -m "feat(api): expose douyin customer auth routes"
```

Expected: tests and typecheck pass.

## Task 4: Mini-Program Customer Session And API Clients

**Files:**
- Create: `apps/douyin-mini/src/state/customer-session.ts`
- Create: `apps/douyin-mini/src/api/customer-auth.ts`
- Create: `apps/douyin-mini/src/api/customer.ts`
- Modify: `apps/douyin-mini/src/platform/storage.ts`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/app.ts`
- Test: `apps/douyin-mini/src/state/customer-session.test.ts`
- Test: `apps/douyin-mini/src/api/customer-auth.test.ts`
- Test: `apps/douyin-mini/src/api/customer.test.ts`

- [ ] **Step 1: Write API/parser tests**

For `apps/douyin-mini/src/api/customer-auth.test.ts`, use the existing `clientWith` pattern from `api/materials.test.ts` and assert:

```ts
expect(calls[0]).toMatchObject({
  path: "/douyin-mini/customer-auth/phone/send-code",
  method: "POST",
  data: { phone: "13800138000" },
});
expect(parsedAuthenticated.status).toBe("authenticated");
expect(parsedSelection.status).toBe("selection_required");
await expect(authorizeDouyinCustomerPhone(client, { douyin_phone_code: "" }))
  .rejects.toMatchObject({ code: "INVALID_CUSTOMER_AUTH_REQUEST" });
```

For `apps/douyin-mini/src/api/customer.test.ts`, assert exact paths:

```ts
expect(calls.map((call) => call.path)).toEqual([
  "/customer/bootstrap?page=1&pageSize=20&include=home_summary",
  "/customer/projects?page=1&pageSize=20&include=home_summary",
  `/customer/projects/${PROJECT_ID}/detail-bootstrap?log_page_size=10`,
  `/customer/projects/${PROJECT_ID}/logs?page=1&pageSize=10`,
]);
```

- [ ] **Step 2: Implement customer session storage**

Add to `apps/douyin-mini/src/platform/storage.ts`:

```ts
const CUSTOMER_SESSION_STORAGE_KEY = "gooes_douyin_customer_session_v1";

export function readStoredCustomerSession(): StoredSession | null {
  return parseStoredSession(tt.getStorageSync(CUSTOMER_SESSION_STORAGE_KEY));
}

export function writeStoredCustomerSession(session: StoredSession): void {
  tt.setStorageSync(CUSTOMER_SESSION_STORAGE_KEY, session);
}

export function clearStoredCustomerSession(): void {
  tt.removeStorageSync(CUSTOMER_SESSION_STORAGE_KEY);
}
```

Create `apps/douyin-mini/src/state/customer-session.ts`:

```ts
import type { SessionTokenProvider } from "../api/request";
import { ApiRequestError } from "../api/request";
import type { StoredSession } from "../models";

export class CustomerSessionManager implements SessionTokenProvider {
  private currentSession: StoredSession | null = null;

  constructor(private readonly storage: {
    readStoredCustomerSession(): StoredSession | null;
    writeStoredCustomerSession(session: StoredSession): void;
    clearStoredCustomerSession(): void;
    now(): number;
  }) {}

  setAuthenticatedToken(token: string, expiresInSeconds: number): void {
    const session = {
      accessToken: token,
      expiresAt: this.storage.now() + expiresInSeconds * 1000,
    };
    this.currentSession = session;
    this.storage.writeStoredCustomerSession(session);
  }

  clear(): void {
    this.currentSession = null;
    this.storage.clearStoredCustomerSession();
  }

  hasUsableToken(): boolean {
    const session = this.currentSession ?? this.storage.readStoredCustomerSession();
    return Boolean(session && session.expiresAt > this.storage.now() + 30_000);
  }

  async getAccessToken(): Promise<string> {
    const session = this.currentSession ?? this.storage.readStoredCustomerSession();
    if (session && session.expiresAt > this.storage.now() + 30_000) return session.accessToken;
    this.clear();
    throw new ApiRequestError(401, "CUSTOMER_SESSION_REQUIRED", "请先登录");
  }

  async refreshAfterUnauthorized(): Promise<string> {
    this.clear();
    throw new ApiRequestError(401, "CUSTOMER_SESSION_REQUIRED", "请先登录");
  }
}
```

- [ ] **Step 3: Implement API clients and models**

In `apps/douyin-mini/src/models/index.ts`, add:

```ts
export type CustomerAuthUser = {
  token: string;
  expires_in?: number;
  mode: "customer";
  roles: string[];
  tenant: { id: string; name: string | null; slug?: string | null };
  customer: { id: string; name: string | null; phone: string | null };
  verified_phone?: string;
};

export type CustomerAuthResult =
  | { status: "authenticated"; auth: CustomerAuthUser }
  | {
    status: "selection_required";
    selection_token: string;
    expires_in: number;
    phone_masked: string;
    candidates: Array<{
      candidate_id: string;
      target_mode: "customer";
      role_label: "客户";
      title: string;
      subtitle: string;
      binding_state: "current" | "bindable" | "rebind_required";
    }>;
  };
```

Create `apps/douyin-mini/src/api/customer-auth.ts` with four exported functions:

```ts
export async function sendCustomerLoginSms(client: ApiClient, input: { phone: string }) {}
export async function verifyCustomerLoginSms(client: ApiClient, input: { phone: string; code: string }) {}
export async function authorizeDouyinCustomerPhone(client: ApiClient, input: { douyin_phone_code: string }) {}
export async function selectDouyinCustomerIdentity(client: ApiClient, input: { selection_token: string; candidate_id: string }) {}
```

Create `apps/douyin-mini/src/api/customer.ts` with:

```ts
export async function fetchCustomerBootstrap(client: ApiClient, query = { page: 1, pageSize: 20 }) {}
export async function fetchCustomerProjects(client: ApiClient, query = { page: 1, pageSize: 20 }) {}
export async function fetchCustomerProjectDetailBootstrap(client: ApiClient, projectId: string) {}
export async function fetchCustomerProjectLogs(client: ApiClient, projectId: string, query = { page: 1, pageSize: 10 }) {}
```

Parsers must reject unknown response shapes with `ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效")`.

- [ ] **Step 4: Wire app context**

In `apps/douyin-mini/src/app.ts`, instantiate:

```ts
const customerSession = new CustomerSessionManager({
  now: () => Date.now(),
  readStoredCustomerSession,
  writeStoredCustomerSession,
  clearStoredCustomerSession,
});
const customerApi = new ApiClient(transport, customerSession);
```

Extend `DouyinAppContext`:

```ts
customerApi: ApiClient;
customerSession: CustomerSessionManager;
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test apps/douyin-mini/src/state/customer-session.test.ts apps/douyin-mini/src/api/customer-auth.test.ts apps/douyin-mini/src/api/customer.test.ts
bun run douyin-mini:typecheck
git add apps/douyin-mini/src/state/customer-session.ts apps/douyin-mini/src/state/customer-session.test.ts apps/douyin-mini/src/api/customer-auth.ts apps/douyin-mini/src/api/customer-auth.test.ts apps/douyin-mini/src/api/customer.ts apps/douyin-mini/src/api/customer.test.ts apps/douyin-mini/src/platform/storage.ts apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/app.ts
git commit -m "feat(douyin-mini): add customer session api clients"
```

Expected: focused tests and typecheck pass.

## Task 5: Mini-Program Pages And Navigation

**Files:**
- Create: `apps/douyin-mini/src/pages/customer-login/index.{json,ts,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/customer-login/page.ts`
- Create: `apps/douyin-mini/src/pages/customer-login/page.test.ts`
- Create: `apps/douyin-mini/src/pages/customer-projects/index.{json,ts,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/customer-projects/page.ts`
- Create: `apps/douyin-mini/src/pages/customer-projects/page.test.ts`
- Create: `apps/douyin-mini/src/pages/customer-project-detail/index.{json,ts,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/customer-project-detail/page.ts`
- Create: `apps/douyin-mini/src/pages/customer-project-detail/page.test.ts`
- Modify: `apps/douyin-mini/src/app.json`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `packages/domain/src/douyin-miniapp.ts`
- Modify: `apps/douyin-mini/src/platform/navigation.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`
- Modify: `apps/douyin-mini/src/pages/home/page.ts`
- Modify: `apps/douyin-mini/src/pages/home/page.test.ts`

- [ ] **Step 1: Write navigation and page-state tests**

Add navigation tests:

```ts
expect(buildCustomerLoginRoute()).toBe("/pages/customer-login/index");
expect(buildCustomerProjectsRoute()).toBe("/pages/customer-projects/index");
expect(buildCustomerProjectDetailRoute(PROJECT_ID))
  .toBe(`/pages/customer-project-detail/index?id=${PROJECT_ID}`);
expect(() => buildCustomerProjectDetailRoute("bad")).toThrow();
```

In `customer-login/page.test.ts`, cover:

```ts
// SMS login stores authenticated token and navigates to projects.
// Douyin phone login falls back to SMS mode when no code is returned.
// selection_required renders candidates and select stores authenticated token.
// CUSTOMER_CONTEXT_MISSING shows "未找到客户档案，请联系装修公司确认预留手机号".
```

In `customer-projects/page.test.ts`, cover:

```ts
// no customer session redirects to login.
// first page loads /customer/projects.
// reaching bottom loads next page only once.
// selecting a project navigates to customer-project-detail with id.
```

In `customer-project-detail/page.test.ts`, cover:

```ts
// invalid or missing id shows error state without API calls.
// page loads detail-bootstrap and first logs.
// reaching bottom fetches next logs page.
// logs list preserves every server log returned for the owned project.
```

- [ ] **Step 2: Register pages and routes**

Add pages to `apps/douyin-mini/src/app.json`:

```json
"pages/customer-login/index",
"pages/customer-projects/index",
"pages/customer-project-detail/index"
```

Add paths to `DOUYIN_ENTRY_PATH_VALUES` in `apps/douyin-mini/src/models/index.ts` and the canonical domain source.

Update `apps/douyin-mini/src/platform/navigation.ts`:

```ts
export function buildCustomerLoginRoute(): string {
  return buildPageRoute("pages/customer-login/index");
}
export function buildCustomerProjectsRoute(): string {
  return buildPageRoute("pages/customer-projects/index");
}
export function buildCustomerProjectDetailRoute(id: string): string {
  const normalized = normalizeUuid(id);
  return `${buildPageRoute("pages/customer-project-detail/index")}?id=${encodeURIComponent(normalized)}`;
}
export function navigateToCustomerLogin(): Promise<void> {
  return navigate("navigateTo", buildCustomerLoginRoute());
}
export function navigateToCustomerProjects(): Promise<void> {
  return navigate("navigateTo", buildCustomerProjectsRoute());
}
export function navigateToCustomerProjectDetail(id: string): Promise<void> {
  return navigate("navigateTo", buildCustomerProjectDetailRoute(id));
}
```

- [ ] **Step 3: Implement login page**

`apps/douyin-mini/src/pages/customer-login/index.ts`:

```ts
import type { DouyinAppContext } from "../../app";
import {
  authorizeDouyinCustomerPhone,
  selectDouyinCustomerIdentity,
  sendCustomerLoginSms,
  verifyCustomerLoginSms,
} from "../../api/customer-auth";
import { navigateToCustomerProjects } from "../../platform/navigation";
import { createCustomerLoginPageDefinition } from "./page";

Page(createCustomerLoginPageDefinition({
  getApp: () => getApp<DouyinAppContext>(),
  authorizeDouyinCustomerPhone,
  sendCustomerLoginSms,
  verifyCustomerLoginSms,
  selectDouyinCustomerIdentity,
  navigateToCustomerProjects,
  showToast: (options) => { void tt.showToast(options); },
}));
```

`page.ts` must keep state fields:

```ts
data: {
  mode: "choice" as "choice" | "sms" | "selection",
  phone: "",
  code: "",
  phoneReady: false,
  sending: false,
  submitting: false,
  error: "",
  selectionToken: "",
  candidates: [] as CustomerAuthSelectionCandidate[],
}
```

On authenticated result:

```ts
app.customerSession.setAuthenticatedToken(result.auth.token, result.auth.expires_in ?? 7 * 24 * 60 * 60);
await dependencies.navigateToCustomerProjects();
```

`index.ttml` should include:

```xml
<button open-type="getPhoneNumber" bindgetphonenumber="onDouyinPhoneNumber">授权手机号登录</button>
<button bindtap="onUseSms">使用手机号验证码登录</button>
<input type="number" maxlength="11" value="{{phone}}" bindinput="onPhoneInput" />
<sms-code-input value="{{code}}" phone-ready="{{phoneReady}}" sending="{{sending}}" cooldown="{{cooldown}}" bindchange="onCodeInput" bindsend="onSendSms" />
<button bindtap="onVerifySms" loading="{{submitting}}" disabled="{{submitting}}">登录</button>
<view tt:for="{{candidates}}" tt:key="candidate_id" data-candidateid="{{item.candidate_id}}" bindtap="onSelectCandidate">{{item.title}} {{item.subtitle}}</view>
```

- [ ] **Step 4: Implement projects page**

Use `app.customerSession.hasUsableToken()` in `onLoad`; if false, call `navigateToCustomerLogin`.

Load:

```ts
const result = await dependencies.fetchCustomerProjects(app.customerApi, {
  page: pending.page,
  pageSize: 20,
});
```

Render project name, status label, address/property community, designer, and recent logs if present. Empty state title: `暂无项目`.

- [ ] **Step 5: Implement detail/logs page**

On `onLoad(options)`, validate `options.id` as UUID. Load:

```ts
const [detail, logs] = await Promise.all([
  dependencies.fetchCustomerProjectDetailBootstrap(app.customerApi, projectId),
  dependencies.fetchCustomerProjectLogs(app.customerApi, projectId, { page: 1, pageSize: 10 }),
]);
```

Render all server-returned logs page by page. Each log item must show `stage_label`, `node_name`, `content`, `created_at`, employee name, images, `comment_count`, and rating summary when present.

- [ ] **Step 6: Add home entry**

In home page TTML, add a compact action near the top:

```xml
<button class="customer-project-entry ui-pressable" hover-class="ui-pressable--pressed" bindtap="onMyProjects">
  我的项目
</button>
```

In `pages/home/page.ts`:

```ts
onMyProjects() {
  const app = dependencies.getApp();
  this.navigateWithFeedback(
    app.customerSession.hasUsableToken()
      ? dependencies.navigateToCustomerProjects()
      : dependencies.navigateToCustomerLogin(),
  );
}
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
bun test apps/douyin-mini/src/platform/navigation.test.ts apps/douyin-mini/src/pages/home/page.test.ts apps/douyin-mini/src/pages/customer-login/page.test.ts apps/douyin-mini/src/pages/customer-projects/page.test.ts apps/douyin-mini/src/pages/customer-project-detail/page.test.ts
bun run douyin-mini:typecheck
git add apps/douyin-mini/src/app.json apps/douyin-mini/src/models/index.ts packages/domain/src/douyin-miniapp.ts apps/douyin-mini/src/platform/navigation.ts apps/douyin-mini/src/pages/home/index.ts apps/douyin-mini/src/pages/home/index.ttml apps/douyin-mini/src/pages/home/page.ts apps/douyin-mini/src/pages/home/page.test.ts apps/douyin-mini/src/pages/customer-login apps/douyin-mini/src/pages/customer-projects apps/douyin-mini/src/pages/customer-project-detail
git commit -m "feat(douyin-mini): add customer project log pages"
```

Expected: focused tests and typecheck pass.

## Task 6: End-To-End Verification And Handoff Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-09-10-douyin-customer-project-logs-design.md`
- Create: `docs/application_integration_documentation/2026-09-10-douyin-customer-project-logs.md`

- [ ] **Step 1: Run backend verification**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: all commands pass.

- [ ] **Step 2: Run mini-program verification**

Run:

```bash
bun run douyin-mini:test
bun run douyin-mini:typecheck
```

Expected: all commands pass.

- [ ] **Step 3: Run full stable test gate if time allows**

Run:

```bash
bun run test
```

Expected: stable workspace test suite passes. If it fails outside touched files, record the failing command and first relevant failure.

- [ ] **Step 4: Verify migration alignment**

Run:

```bash
supabase migration list
```

Expected: the new migration appears in Local and Remote after DB deployment. If Remote is not deployed in this session, record that DB deployment remains pending.

- [ ] **Step 5: Create integration handoff**

Create `docs/application_integration_documentation/2026-09-10-douyin-customer-project-logs.md`:

```md
# 抖音小程序客户项目施工日志集成说明

## 登录接口

- POST /douyin-mini/customer-auth/phone/send-code
- POST /douyin-mini/customer-auth/phone/verify
- POST /douyin-mini/customer-auth/phone/authorize
- POST /douyin-mini/customer-auth/select

所有接口使用抖音小程序会话 token：Authorization: Bearer <douyin_miniapp_token>。

## 客户接口

登录成功后使用返回的 customer auth token 请求：

- GET /customer/bootstrap?page=1&pageSize=20&include=home_summary
- GET /customer/projects?page=1&pageSize=20&include=home_summary
- GET /customer/projects/:id/detail-bootstrap
- GET /customer/projects/:id/logs?page=1&pageSize=10
- GET /customer/projects/:id/logs/:logId/comments?page=1&pageSize=20

## 可见性规则

客户通过 tenant_id + customer_id + project_id 归属校验后，可以看到该项目下全部施工日志。

## 常见错误

- CUSTOMER_CONTEXT_MISSING：未找到客户档案或客户身份已失效。
- AUTH_SESSION_REQUIRED：缺少有效抖音小程序会话。
- SMS_CODE_INVALID：验证码错误。
- SMS_CODE_EXPIRED：验证码过期。
- IDENTITY_SELECTION_EXPIRED：身份选择凭证过期。
```

- [ ] **Step 6: Final commit**

Run:

```bash
git add docs/application_integration_documentation/2026-09-10-douyin-customer-project-logs.md docs/superpowers/specs/2026-09-10-douyin-customer-project-logs-design.md
git commit -m "docs: add douyin customer project log handoff"
```

Expected: commit includes only documentation updates.

## Self Review

- Spec coverage: login has two paths, no customer auto-create, customer-only candidate filtering, multi-tenant selection, token separation, project ownership, all logs visible after ownership, paginated list calls, and frontend pages.
- Placeholder scan: no placeholder markers or vague error-handling steps remain.
- Type consistency: backend uses `douyin_mini` for `user_oauth_identities.platform`, `douyin_miniapp` for public session token type, and `login_channel: "douyin"` for customer `auth` token.

## Execution Options

1. Subagent-Driven: dispatch a fresh subagent per task, review between tasks, faster iteration.
2. Inline Execution: execute tasks in this session with checkpoints.
