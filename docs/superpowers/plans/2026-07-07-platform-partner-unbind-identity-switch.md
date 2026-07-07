# Platform Partner Unbind And Identity Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of city partner member account self-service: self unbind WeChat, return to visitor, rebind through existing partner phone binding, and switch between visitor/customer/employee/platform partner identities.

**Architecture:** Keep city partner binding scoped to `platform_partner_members.auth_user_id`; do not mutate global WeChat OAuth identity when only unbinding the partner role. Add a database RPC for atomic partner unbind SMS verification and member update, then expose controller/service/repository methods following the existing `platform-partner-portal` and legacy auth patterns.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase migrations/RPC, existing `error-factory.ts`, `ResponseHandler`, `@gooes/domain`, and `bun:test`.

---

## Source Spec

- `docs/2026-07-07-platform-partner-unbind-rebind-identity-switch-handoff.md`

This plan implements Phase 1 only:

- `GET /auth/identities`
- `POST /auth/switch`
- `POST /auth/switch/visitor`
- `POST /partner/auth/unbind-code`
- `POST /partner/auth/unbind-wechat`

This plan excludes old-WeChat-lost manual partner rebind review. That remains a separate Phase 2 feature with its own migration and admin review surface.

## File Structure

Create:

- `apps/api/src/schema/auth-identity-switch.ts`
  - Zod schemas for identity switch requests.
- `apps/api/src/repositories/auth-identity-options.ts`
  - Supabase reads for identity options and target identity lookup.
- `apps/api/src/services/auth-identity-switch.ts`
  - Builds identity option list and signs target identity auth responses.
- `apps/api/src/services/auth-identity-switch.test.ts`
  - Unit tests for multi-identity listing and switching.
- `apps/api/src/services/platform-partner-portal-unbind.test.ts`
  - Unit tests for partner unbind behavior and errors.
- `supabase/migrations/20260707160000_platform_partner_unbind_identity_switch.sql`
  - Adds `unbind_platform_partner` SMS scene and `unbind_platform_partner_member_binding` RPC.

Modify:

- `packages/domain/src/auth.ts`
  - Add `unbind_platform_partner` to `SMS_SCENE_VALUES`.
- `apps/api/src/services/sms/legacy/config.ts`
  - Map `unbind_platform_partner` to the existing bind-customer SMS template.
- `apps/api/src/schema/platform-partner-portal.ts`
  - Add unbind request schema.
- `apps/api/src/repositories/platform-partner-portal.ts`
  - Add `claimMemberUnbind` RPC wrapper and repository port method.
- `apps/api/src/services/platform-partner-portal.ts`
  - Add `sendUnbindCode()` and `unbindWechat()`.
- `apps/api/src/controllers/platform-partner-portal/index.ts`
  - Register partner unbind routes.
- `apps/api/src/controllers/platform-partner-portal/routes.test.ts`
  - Update route order expectations.
- `apps/api/src/services/wechat-auth-legacy-controller.ts`
  - Register identity option and switch routes under auth controller.
- `apps/api/src/plugins/auth/legacy/routes.ts`
  - Allow partner unbind routes as partner portal routes, and allow visitor session access to identity switch routes.

## Task 1: Add SMS Scene And Atomic Unbind RPC

**Files:**

- Modify: `packages/domain/src/auth.ts`
- Modify: `apps/api/src/services/sms/legacy/config.ts`
- Create: `supabase/migrations/20260707160000_platform_partner_unbind_identity_switch.sql`
- Test: `apps/api/src/services/platform-partner-portal-migrations.test.ts`

- [ ] **Step 1: Add the SMS scene to the domain package**

In `packages/domain/src/auth.ts`, update `SMS_SCENE_VALUES`:

```ts
export const SMS_SCENE_VALUES = [
  'bind_customer',
  'bind_employee',
  'admin_login',
  'rebind_wechat',
  'bind_platform_partner',
  'unbind_platform_partner',
  'partner_application',
] as const;
```

- [ ] **Step 2: Map the unbind scene to an existing SMS template**

In `apps/api/src/services/sms/legacy/config.ts`, extend `getTemplateConfigKey()`:

```ts
  if (input.purpose === "unbind_platform_partner") {
    return `${prefix}_BIND_CUSTOMER`;
  }
```

Place it beside `bind_customer`, `rebind_wechat`, and `partner_application` because the message is another verification-code SMS.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260707160000_platform_partner_unbind_identity_switch.sql`:

```sql
ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check
CHECK (
  scene = ANY (
    ARRAY[
      'bind_customer'::text,
      'bind_employee'::text,
      'admin_login'::text,
      'rebind_wechat'::text,
      'bind_platform_partner'::text,
      'unbind_platform_partner'::text,
      'partner_application'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.unbind_platform_partner_member_binding(
  p_member_id uuid,
  p_auth_user_id uuid,
  p_partner_id uuid,
  p_code text
)
RETURNS TABLE(status text, member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sms_id uuid;
  v_member record;
BEGIN
  SELECT
      member.id,
      member.phone,
      member.auth_user_id,
      member.status AS member_status,
      partner.status AS partner_status
    INTO v_member
  FROM public.platform_partner_members AS member
  JOIN public.platform_partners AS partner ON partner.id = member.partner_id
  WHERE member.id = p_member_id
    AND member.partner_id = p_partner_id
  LIMIT 1
  FOR UPDATE OF member, partner;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'member_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_member.partner_status <> 'active' OR v_member.member_status = 'disabled' THEN
    RETURN QUERY SELECT 'partner_unavailable'::text, v_member.id;
    RETURN;
  END IF;

  IF v_member.auth_user_id IS NULL OR v_member.auth_user_id <> p_auth_user_id THEN
    RETURN QUERY SELECT 'member_not_bound'::text, v_member.id;
    RETURN;
  END IF;

  SELECT sms.id
    INTO v_sms_id
  FROM public.sms_verification_codes AS sms
  WHERE sms.phone = v_member.phone
    AND sms.scene = 'unbind_platform_partner'
    AND sms.code = p_code
    AND sms.status = 'pending'
    AND sms.expired_at > now()
  ORDER BY sms.created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_sms_id IS NULL THEN
    RETURN QUERY SELECT 'sms_invalid'::text, v_member.id;
    RETURN;
  END IF;

  UPDATE public.platform_partner_members
  SET auth_user_id = NULL,
      status = 'pending_bind'
  WHERE id = v_member.id
    AND auth_user_id = p_auth_user_id;

  UPDATE public.sms_verification_codes
  SET status = 'verified',
      verified_at = now()
  WHERE id = v_sms_id;

  RETURN QUERY SELECT 'unbound'::text, v_member.id;
END;
$$;

REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) TO service_role;
```

- [ ] **Step 4: Add migration coverage**

In `apps/api/src/services/platform-partner-portal-migrations.test.ts`, add assertions that read the migration file and verify:

```ts
expect(sql).toContain("'unbind_platform_partner'::text");
expect(sql).toContain("CREATE OR REPLACE FUNCTION public.unbind_platform_partner_member_binding");
expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.unbind_platform_partner_member_binding");
```

- [ ] **Step 5: Run targeted verification**

Run:

```bash
cd apps/api && bun test src/services/platform-partner-portal-migrations.test.ts
```

Expected: all tests in that file pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/domain/src/auth.ts apps/api/src/services/sms/legacy/config.ts apps/api/src/services/platform-partner-portal-migrations.test.ts supabase/migrations/20260707160000_platform_partner_unbind_identity_switch.sql
git commit -m "feat(partner): 增加合伙人解绑短信场景"
```

## Task 2: Implement Partner Self Unbind API

**Files:**

- Modify: `apps/api/src/schema/platform-partner-portal.ts`
- Modify: `apps/api/src/repositories/platform-partner-portal.ts`
- Modify: `apps/api/src/services/platform-partner-portal.ts`
- Modify: `apps/api/src/controllers/platform-partner-portal/index.ts`
- Modify: `apps/api/src/controllers/platform-partner-portal/routes.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Create: `apps/api/src/services/platform-partner-portal-unbind.test.ts`

- [ ] **Step 1: Add schemas**

In `apps/api/src/schema/platform-partner-portal.ts`, add:

```ts
export const PartnerAuthUnbindWechatSchema = z.object({
  sms_code: z.string().trim().length(6, "验证码必须为 6 位"),
  confirm: z.literal(true, {
    error: "请确认解绑微信",
  }),
}).strict();

export type PartnerAuthUnbindWechatInput =
  z.infer<typeof PartnerAuthUnbindWechatSchema>;
```

- [ ] **Step 2: Extend repository types**

In `apps/api/src/repositories/platform-partner-portal.ts`, add result type:

```ts
export type PlatformPartnerMemberUnbindClaimResult =
  | { status: "unbound"; memberId: string }
  | { status: "sms_invalid"; memberId?: string | null }
  | { status: "member_not_found" }
  | { status: "partner_unavailable"; memberId?: string | null }
  | { status: "member_not_bound"; memberId?: string | null };
```

Add to `PlatformPartnerPortalRepositoryPort`:

```ts
claimMemberUnbind(input: {
  memberId: string;
  authUserId: string;
  partnerId: string;
  code: string;
}): Promise<PlatformPartnerMemberUnbindClaimResult>;
```

- [ ] **Step 3: Add repository RPC wrapper**

In `PlatformPartnerPortalRepository`, add:

```ts
  async claimMemberUnbind(input: {
    memberId: string;
    authUserId: string;
    partnerId: string;
    code: string;
  }) {
    const { data, error } = await this.rpc(
      "unbind_platform_partner_member_binding",
      {
        p_member_id: input.memberId,
        p_auth_user_id: input.authUserId,
        p_partner_id: input.partnerId,
        p_code: input.code,
      },
    );

    if (error) throw Errors.dbError("解除合伙人成员微信绑定失败", error);

    const [record] = (data || []) as Array<{
      status: PlatformPartnerMemberUnbindClaimResult["status"];
      member_id: string | null;
    }>;
    if (!record) {
      throw Errors.dbError("解除合伙人成员微信绑定失败", {
        message: "unbind_platform_partner_member_binding returned no rows",
      });
    }

    if (record.status === "unbound") {
      if (!record.member_id) {
        throw Errors.dbError("解除合伙人成员微信绑定失败", {
          message: "unbind_platform_partner_member_binding returned unbound without member_id",
        });
      }
      return { status: "unbound", memberId: record.member_id } as const;
    }

    if (
      record.status === "sms_invalid" ||
      record.status === "partner_unavailable" ||
      record.status === "member_not_bound"
    ) {
      return { status: record.status, memberId: record.member_id } as const;
    }

    if (record.status === "member_not_found") {
      return { status: record.status } as const;
    }

    throw Errors.dbError("解除合伙人成员微信绑定失败", {
      message: `unknown unbind status: ${record.status}`,
    });
  }
```

- [ ] **Step 4: Write failing service tests**

Create `apps/api/src/services/platform-partner-portal-unbind.test.ts` with tests for:

```ts
test("sendUnbindCode sends SMS to current active partner member phone", async () => {
  const sent: unknown[] = [];
  const service = await createService({
    smsService: {
      sendCode: async (input) => {
        sent.push(input);
        return { success: true as const, cooldown_seconds: 60 };
      },
    },
  });

  await service.sendUnbindCode(partnerUser, "127.0.0.1");

  expect(sent).toEqual([
    {
      phone: "13800138000",
      scene: "unbind_platform_partner",
      requestIp: "127.0.0.1",
    },
  ]);
});

test("unbindWechat clears only partner member binding and returns visitor auth", async () => {
  const service = await createService({
    repository: createRepository({
      claimMemberUnbind: async () => ({
        status: "unbound",
        memberId: activeMember.id,
      }),
    }),
    visitorSessionSigner: () => "visitor-token",
  });

  const result = await service.unbindWechat(partnerUser, {
    sms_code: "123456",
    confirm: true,
  });

  expect(result.auth).toMatchObject({
    token: "visitor-token",
    roles: ["visitor"],
    mode: "platform_visitor",
    authMode: "platform_visitor",
  });
});
```

Use the existing test helper style from `apps/api/src/services/platform-partner-portal.test.ts`; keep repository mocks local to this test file.

- [ ] **Step 5: Implement service methods**

In `apps/api/src/services/platform-partner-portal.ts`:

- Add `const UNBIND_SMS_SCENE = "unbind_platform_partner";`
- Add an injectable `visitorSessionSigner` dependency or reuse `signVisitorSession` through a narrow helper.
- Add `sendUnbindCode(user, requestIp)`.
- Add `unbindWechat(user, input)`.

The service behavior must:

- use `requireCurrentPartnerMember(user)`;
- send SMS to `partnerUser.member.phone`;
- call `repository.claimMemberUnbind()`;
- map `sms_invalid` to `SMS_CODE_INVALID`;
- map `member_not_bound` to `PARTNER_MEMBER_NOT_BOUND`;
- map `partner_unavailable` to `PARTNER_ACCOUNT_DISABLED`;
- return `{ success, message, auth }` with a visitor session auth payload;
- not call `userIdentityService.unbindOauthIdentityBestEffort`.

- [ ] **Step 6: Register controller routes**

In `apps/api/src/controllers/platform-partner-portal/index.ts`:

```ts
  @Post("/partner/auth/unbind-code")
  async unbindCode(request: FastifyRequest, reply: FastifyReply) {
    const data = await platformPartnerPortalService.sendUnbindCode(
      request.user,
      request.ip ?? null,
    );
    return ResponseHandler.success(data);
  }

  @Post("/partner/auth/unbind-wechat")
  async unbindWechat(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = PartnerAuthUnbindWechatSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformPartnerPortalService.unbindWechat(
      request.user,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
```

Import `PartnerAuthUnbindWechatSchema`.

- [ ] **Step 7: Update route classification**

In `apps/api/src/plugins/auth/legacy/routes.ts`:

- Add `"/partner/auth/unbind-code"` and `"/partner/auth/unbind-wechat"` to `partnerPortalRoutes`.
- Update `isPartnerPortalRoute()` so `POST` partner auth unbind routes are allowed as partner portal routes.

- [ ] **Step 8: Update route registration test**

In `apps/api/src/controllers/platform-partner-portal/routes.test.ts`, update expected routes to include:

```ts
{ method: "POST", path: "/partner/auth/unbind-code" },
{ method: "POST", path: "/partner/auth/unbind-wechat" },
```

Place them after `GET /partner/auth/me` or next to existing partner auth routes; keep the expectation in the same order as controller registration.

- [ ] **Step 9: Run targeted verification**

```bash
cd apps/api && bun test src/services/platform-partner-portal-unbind.test.ts src/controllers/platform-partner-portal/routes.test.ts src/plugins/auth/legacy/routes.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 10: Commit Task 2**

```bash
git add apps/api/src/schema/platform-partner-portal.ts apps/api/src/repositories/platform-partner-portal.ts apps/api/src/services/platform-partner-portal.ts apps/api/src/controllers/platform-partner-portal/index.ts apps/api/src/controllers/platform-partner-portal/routes.test.ts apps/api/src/plugins/auth/legacy/routes.ts apps/api/src/services/platform-partner-portal-unbind.test.ts
git commit -m "feat(partner): 支持合伙人成员自助解绑微信"
```

## Task 3: Implement Identity Options And Switch

**Files:**

- Create: `apps/api/src/schema/auth-identity-switch.ts`
- Create: `apps/api/src/repositories/auth-identity-options.ts`
- Create: `apps/api/src/services/auth-identity-switch.ts`
- Create: `apps/api/src/services/auth-identity-switch.test.ts`
- Modify: `apps/api/src/services/wechat-auth-legacy-controller.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`

- [ ] **Step 1: Add identity switch schema**

Create `apps/api/src/schema/auth-identity-switch.ts`:

```ts
import { z } from "zod";

export const AuthIdentityModeSchema = z.enum([
  "platform_visitor",
  "platform_partner",
  "tenant_employee",
  "customer",
]);

export const SwitchIdentitySchema = z.object({
  target_mode: AuthIdentityModeSchema,
  partner_member_id: z.string().uuid("无效的合伙人成员 ID").optional(),
  tenant_id: z.string().uuid("无效的租户 ID").optional(),
  employee_id: z.string().uuid("无效的员工 ID").optional(),
  customer_id: z.string().uuid("无效的客户 ID").optional(),
}).strict();

export type AuthIdentityMode = z.infer<typeof AuthIdentityModeSchema>;
export type SwitchIdentityInput = z.infer<typeof SwitchIdentitySchema>;
```

- [ ] **Step 2: Add repository reads**

Create `apps/api/src/repositories/auth-identity-options.ts` with methods:

- `listPartnerMembersByAuthUserId(authUserId)`
- `listBusinessMemberships(authUserId)`
- `listEmployeesByIds(employeeIds)`
- `listCustomersByIds(customerIds)`

Queries must select only needed fields and use `.in()` on deduplicated ids. Each method returns `[]` when ids are empty.

- [ ] **Step 3: Write failing service tests**

Create `apps/api/src/services/auth-identity-switch.test.ts` covering:

- a user with partner, employee, and customer receives all identity options plus visitor;
- switching to `platform_visitor` returns a visitor session auth;
- switching to `platform_partner` returns `token_type=platform_partner` auth;
- switching to an unavailable partner member rejects with `IDENTITY_OPTION_NOT_FOUND`;
- visitor session token can call switch routes through `isVisitorSessionRoute()`.

Use dependency injection for repository and token signers, mirroring the pattern in `PlatformPartnerPortalService`.

- [ ] **Step 4: Implement identity service**

Create `apps/api/src/services/auth-identity-switch.ts` with:

- `listOptions(user?: JwtPayload)`
- `switchIdentity(user: JwtPayload | undefined, input: SwitchIdentityInput)`

Rules:

- require `user.sub`;
- always include `platform_visitor`;
- only include active partner members whose partner is active;
- only include active employees whose tenant is active;
- include customers whose tenant is active;
- switch target must match one listed option;
- return existing auth response shapes for each target mode.

For `platform_partner`, reuse the same response serialization shape as `PlatformPartnerPortalService` and sign:

```ts
{
  sub: authUserId,
  token_type: "platform_partner",
  login_channel: "wechat",
  roles: ["platform_partner"],
  partner_id: member.partner_id,
  openid: user.openid,
  unionid: user.unionid ?? null,
}
```

For `platform_visitor`, sign a visitor session token with the same shape used by `/auth` visitor responses.

- [ ] **Step 5: Add routes to legacy WeChat controller**

In `apps/api/src/services/wechat-auth-legacy-controller.ts`, add imports:

```ts
import { SwitchIdentitySchema } from "@/schema/auth-identity-switch";
import { authIdentitySwitchService } from "@/services/auth-identity-switch";
```

Add methods:

```ts
  @Get("/auth/identities")
  async identityOptions(request: FastifyRequest, reply: FastifyReply) {
    const data = await authIdentitySwitchService.listOptions(request.user);
    return ResponseHandler.success(data);
  }

  @Post("/auth/switch")
  async switchIdentity(request: FastifyRequest, reply: FastifyReply) {
    const bodyResult = SwitchIdentitySchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await authIdentitySwitchService.switchIdentity(
      request.user,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/auth/switch/visitor")
  async switchToVisitor(request: FastifyRequest, reply: FastifyReply) {
    const data = await authIdentitySwitchService.switchIdentity(
      request.user,
      { target_mode: "platform_visitor" },
    );
    return ResponseHandler.success(data);
  }
```

Ensure `Errors` and `ResponseHandler` are imported if not already available in this file.

- [ ] **Step 6: Update route auth classification**

In `apps/api/src/plugins/auth/legacy/routes.ts`, add:

```ts
  if (
    (method === "GET" || method === "HEAD") &&
    url === "/auth/identities"
  ) {
    return true;
  }

  if (
    method === "POST" &&
    (url === "/auth/switch" || url === "/auth/switch/visitor")
  ) {
    return true;
  }
```

to shared identity switch route classification used by both `isVisitorSessionRoute()` and `isPartnerPortalRoute()`, because visitor sessions must be able to open the switcher and `platform_partner` tokens must be able to switch back to visitor/customer/employee.

- [ ] **Step 7: Run targeted verification**

```bash
cd apps/api && bun test src/services/auth-identity-switch.test.ts src/plugins/auth/legacy/routes.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add apps/api/src/schema/auth-identity-switch.ts apps/api/src/repositories/auth-identity-options.ts apps/api/src/services/auth-identity-switch.ts apps/api/src/services/auth-identity-switch.test.ts apps/api/src/services/wechat-auth-legacy-controller.ts apps/api/src/plugins/auth/legacy/routes.ts
git commit -m "feat(auth): 增加多身份切换接口"
```

## Task 4: Run Full API Verification And Migration Status

**Files:**

- No source edits expected.

- [ ] **Step 1: Run API typecheck**

```bash
pnpm run api:typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run API build**

```bash
pnpm run api:build
```

Expected: exit code 0.

- [ ] **Step 3: Run API file size check**

```bash
pnpm run api:check-file-size
```

Expected: exit code 0 or an existing documented failure unrelated to this change. If it fails on modified files, split the file before continuing.

- [ ] **Step 4: Check migration status before applying**

```bash
supabase migration list
```

Expected: local migrations include `20260707160000_platform_partner_unbind_identity_switch`; remote may be behind before applying.

- [ ] **Step 5: Apply migration only when ready**

Use the project’s normal Supabase apply workflow with the correct environment. After applying, run:

```bash
supabase migration list
```

Expected: Local and Remote are aligned for the new migration.

- [ ] **Step 6: Commit verification notes if documentation changed**

If a smoke note is created, commit it separately:

```bash
git add docs/<smoke-note-path>
git commit -m "docs(partner): 记录合伙人解绑联调验证"
```

## Task 5: Prepare Mini-Program Handoff Message

**Files:**

- Modify if needed: `docs/2026-07-07-platform-partner-unbind-rebind-identity-switch-handoff.md`

- [ ] **Step 1: Update the handoff doc implementation status**

After Tasks 1-4 pass, update the handoff doc status from “后端接口待实现后再进入联调” to a precise state:

```md
状态：Phase 1 后端接口已实现，待发布联调环境后小程序端对接
```

- [ ] **Step 2: Confirm API list in the doc**

Make sure the doc lists these Phase 1 endpoints as implemented:

- `GET /auth/identities`
- `POST /auth/switch`
- `POST /auth/switch/visitor`
- `POST /partner/auth/unbind-code`
- `POST /partner/auth/unbind-wechat`

- [ ] **Step 3: Commit doc status update**

```bash
git add docs/2026-07-07-platform-partner-unbind-rebind-identity-switch-handoff.md
git commit -m "docs(partner): 更新合伙人解绑接口状态"
```

## Execution Notes

- Use an isolated worktree before implementing.
- Keep orange read-only; mini-program changes are communicated through docs and handoff text only.
- Do not push without explicit instruction.
- Do not apply database changes without confirming the target environment and migration list.
- Do not implement Phase 2 partner rebind requests in this Phase 1 branch.

## Final Verification Checklist

- `cd apps/api && bun test src/services/platform-partner-portal-unbind.test.ts`
- `cd apps/api && bun test src/services/auth-identity-switch.test.ts`
- `cd apps/api && bun test src/controllers/platform-partner-portal/routes.test.ts src/plugins/auth/legacy/routes.test.ts`
- `pnpm run api:typecheck`
- `pnpm run api:build`
- `pnpm run api:check-file-size`
- `supabase migration list`
