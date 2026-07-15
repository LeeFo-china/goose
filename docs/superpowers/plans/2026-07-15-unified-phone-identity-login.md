# Unified Phone Identity Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one mini-program phone verification flow that discovers customer, tenant employee, and platform partner identities, directly authenticates a single identity, securely selects among multiple identities, and returns a verified visitor session without creating a customer when no identity exists.

**Architecture:** Add a focused `phone-identity-login` service module that orchestrates existing identity repositories and binding services. Persist verification and selection state in additive Supabase tables; use restricted RPCs only for SMS consumption, selection state transitions, and bounded retention cleanup, while TypeScript remains responsible for candidate rules, revalidation, binding, token construction, share attribution, and HTTP responses.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations and RPCs, `node:crypto`, Bun test.

---

## Preconditions And Guardrails

- Execute this plan from an isolated worktree created with the `using-git-worktrees` skill. The current main worktree contains unrelated untracked documents and must not be used as a cleanup target.
- Read [the approved design](../specs/2026-07-15-unified-phone-identity-login-design.md) and the read-only Orange handoff at `/Users/leefo/Public/work/orange/docs/2026-07-15-unified-phone-identity-login-backend-handoff.md` before Task 1.
- Do not modify `/Users/leefo/Public/work/orange`.
- Do not manually execute DDL or repair data on the remote database. Apply every database change through `supabase/migrations/`.
- Keep every new API source file below 500 lines. Run `bun run api:check-file-size` before integration smoke.
- Do not remove or change the old `/auth/send-code`, `/auth/verify-role`, partner login, tenant selection, identity switch, or rebind interfaces.
- Use `Errors.business`, `Errors.fromZod`, `Errors.unauthorized`, or `Errors.dbError`; do not add direct `throw new Error()` calls.
- The current database guarantees at most one non-disabled platform partner member per phone. Preserve that constraint.

## File Responsibility Map

### New Files

- `apps/api/src/schema/phone-identity-login.ts`: request schemas and inferred input types for the three new endpoints.
- `apps/api/src/schema/phone-identity-login.test.ts`: strict schema contract tests.
- `apps/api/src/repositories/phone-identity-login.ts`: session/candidate RPC adapter and atomic state result parsing.
- `apps/api/src/repositories/phone-identity-login.test.ts`: repository RPC contract and malformed-result tests.
- `apps/api/src/repositories/phone-identity-candidates.ts`: bounded customer, employee, partner, membership, and OAuth candidate reads.
- `apps/api/src/repositories/phone-identity-candidates.test.ts`: selected-column, limit, and query-shape tests.
- `apps/api/src/services/phone-identity-login/types.ts`: internal candidate, session, dependency, and response unions.
- `apps/api/src/services/phone-identity-login/candidates.ts`: normalization, availability, binding-state, de-duplication, sorting, and limit logic.
- `apps/api/src/services/phone-identity-login/candidates.test.ts`: candidate matrix unit tests.
- `apps/api/src/services/phone-identity-login/bindings.ts`: selected customer/employee/partner revalidation and formal auth construction.
- `apps/api/src/services/phone-identity-login/bindings.test.ts`: one-target binding and rebind error tests.
- `apps/api/src/services/phone-identity-login/service.ts`: send, verify, select state machine.
- `apps/api/src/services/phone-identity-login/service.test.ts`: zero/single/multiple identity and selection idempotency tests.
- `apps/api/src/services/phone-identity-login/index.ts`: public exports and production singleton wiring.
- `apps/api/src/services/phone-identity-login-migration.test.ts`: SQL DDL, RPC, privilege, constraint, and index contract tests.
- `apps/api/src/controllers/wechat/routes.test.ts`: route registration contract for the new endpoints.
- `apps/api/src/services/platform-leads.test.ts`: verified visitor and trusted attribution tests.
- `apps/api/src/utils/auth/request-device.ts`: shared bounded request-device header extraction for SMS limits.
- `apps/api/src/scripts/phone-identity-login-smoke.ts`: environment-backed API and database smoke using explicit test phone variables.
- `supabase/migrations/20260715100000_create_phone_identity_login.sql`: SMS scene, session/candidate tables, phone indexes, and restricted RPCs.
- `docs/application_integration_documentation/2026-07-15-unified-phone-identity-login-backend.md`: final contract, errors, test matrix, deployment commit, and Orange ownership.

### Modified Files

- `packages/domain/src/auth.ts`: add the `login_identity` SMS scene.
- `packages/domain/src/auth.test.ts`: preserve all legacy scenes and assert the new scene.
- `apps/api/src/errors/error-codes.ts`: add stable unified-login codes.
- `apps/api/src/services/wechat-auth-legacy-controller.ts`: add three thin controller methods.
- `apps/api/src/repositories/wechat-customer-identities.ts`: apply explicit phone candidate limit and selected fields needed by binding.
- `apps/api/src/repositories/wechat-employee-identities.ts`: return employee display, tenant, department, and post fields; add selected-ID lookup.
- `apps/api/src/services/wechat-employee-identities.ts`: expose selected employee lookup and binding methods.
- `apps/api/src/services/wechat-auth-legacy/employee.ts`: extract binding of a specified employee while retaining old unique-phone behavior.
- `apps/api/src/repositories/platform-partner-portal.ts`: add bounded phone member list and selected member lookup reuse.
- `apps/api/src/repositories/platform-partner-portal-types.ts`: extend repository port for phone candidate reads.
- `apps/api/src/services/platform-partner-portal.ts`: expose selected-member authentication without code2session.
- `apps/api/src/services/platform-partner-portal-binding.ts`: bind exactly the selected partner member without falling back by phone.
- `apps/api/src/controllers/platform-partner-portal/index.ts`: reuse shared request-device extraction without changing routes.
- `apps/api/src/services/tenant-share-links.ts`: add read-only login context resolution and trusted attribution resolution.
- `apps/api/src/repositories/tenant-share-links.ts`: add read-only lookup by ID and keep mutation RPC separate.
- `apps/api/src/utils/jwt.ts`: allow verified visitor claims to include `sub` and `share_link_id`.
- `apps/api/src/services/wechat-auth-legacy/common.ts`: sign a verified visitor session with internal auth user and trusted share reference.
- `apps/api/src/services/wechat-auth-legacy/common.test.ts`: preserve initial visitor claims and verify unified-login visitor claims.
- `apps/api/src/plugins/auth/legacy/routes.ts`: allow visitor and partner tokens to call the new routes and allow visitor lead submission.
- `apps/api/src/plugins/auth/legacy/routes.test.ts`: assert exact token-route boundaries.
- `apps/api/src/schema/platform-leads.ts`: accept optional `share_token` for context recovery.
- `apps/api/src/controllers/platform-leads/index.ts`: pass trusted share claim from JWT.
- `apps/api/src/services/platform-leads.ts`: resolve trusted share attribution and sanitize platform visitor scope.
- `apps/api/src/repositories/platform-leads.ts`: accept service-constructed source context without trusting client attribution fields.
- `apps/api/src/types/database.ts`: regenerate after the migration is applied.

## Task 1: Domain Scene, Error Codes, And Request Schemas

**Files:**
- Modify: `packages/domain/src/auth.ts`
- Modify: `packages/domain/src/auth.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Create: `apps/api/src/schema/phone-identity-login.ts`
- Create: `apps/api/src/schema/phone-identity-login.test.ts`

- [ ] **Step 1: Write the failing domain and schema tests**

Add this assertion to `packages/domain/src/auth.test.ts`:

```ts
test("exports the unified identity login scene without removing legacy scenes", () => {
  const scene: SmsScene = "login_identity";

  expect(SMS_SCENE_VALUES).toContain(scene);
  expect(SMS_SCENE_VALUES).toContain("bind_customer");
  expect(SMS_SCENE_VALUES).toContain("bind_employee");
  expect(SMS_SCENE_VALUES).toContain("bind_platform_partner");
  expect(new Set(SMS_SCENE_VALUES).size).toBe(SMS_SCENE_VALUES.length);
});
```

Create `apps/api/src/schema/phone-identity-login.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  PhoneIdentityLoginSelectSchema,
  PhoneIdentityLoginSendCodeSchema,
  PhoneIdentityLoginVerifySchema,
} from "./phone-identity-login";

describe("phone identity login schemas", () => {
  test("accepts the three valid request forms", () => {
    expect(PhoneIdentityLoginSendCodeSchema.safeParse({
      phone: "13800138000",
    }).success).toBe(true);
    expect(PhoneIdentityLoginVerifySchema.safeParse({
      phone: "13800138000",
      code: "123456",
      share_token: "share_token_123",
    }).success).toBe(true);
    expect(PhoneIdentityLoginSelectSchema.safeParse({
      selection_token: "A".repeat(43),
      candidate_id: "00000000-0000-4000-8000-000000000001",
    }).success).toBe(true);
  });

  test("rejects role, database identity, and unknown fields", () => {
    for (const body of [
      { phone: "13800138000", target_role: "customer" },
      { phone: "13800138000", code: "123456", auth_user_id: crypto.randomUUID() },
      { selection_token: "A".repeat(43), candidate_id: crypto.randomUUID(), tenant_id: crypto.randomUUID() },
    ]) {
      const schema = "code" in body
        ? PhoneIdentityLoginVerifySchema
        : "selection_token" in body
          ? PhoneIdentityLoginSelectSchema
          : PhoneIdentityLoginSendCodeSchema;
      expect(schema.safeParse(body).success).toBe(false);
    }
  });

  test("rejects malformed phone, code, token, and share token", () => {
    expect(PhoneIdentityLoginSendCodeSchema.safeParse({ phone: "1380013800" }).success)
      .toBe(false);
    expect(PhoneIdentityLoginVerifySchema.safeParse({
      phone: "13800138000",
      code: "12a456",
    }).success).toBe(false);
    expect(PhoneIdentityLoginVerifySchema.safeParse({
      phone: "13800138000",
      code: "123456",
      share_token: "contains spaces",
    }).success).toBe(false);
    expect(PhoneIdentityLoginSelectSchema.safeParse({
      selection_token: "short",
      candidate_id: "not-a-uuid",
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
bun test packages/domain/src/auth.test.ts apps/api/src/schema/phone-identity-login.test.ts
```

Expected: FAIL because `login_identity` and `phone-identity-login.ts` do not exist.

- [ ] **Step 3: Add the domain scene and stable error constants**

Insert `"login_identity"` into `SMS_SCENE_VALUES` in `packages/domain/src/auth.ts` without removing or reordering legacy values.

Add these keys to `ErrorCodes` in `apps/api/src/errors/error-codes.ts`:

```ts
SMS_CODE_REQUIRED: "SMS_CODE_REQUIRED",
SMS_CODE_INVALID: "SMS_CODE_INVALID",
SMS_CODE_EXPIRED: "SMS_CODE_EXPIRED",
SMS_CODE_RATE_LIMITED: "SMS_CODE_RATE_LIMITED",
AUTH_SESSION_REQUIRED: "AUTH_SESSION_REQUIRED",
IDENTITY_ACCOUNT_UNAVAILABLE: "IDENTITY_ACCOUNT_UNAVAILABLE",
IDENTITY_OPTION_UNAVAILABLE: "IDENTITY_OPTION_UNAVAILABLE",
IDENTITY_SELECTION_IN_PROGRESS: "IDENTITY_SELECTION_IN_PROGRESS",
IDENTITY_SELECTION_CONSUMED: "IDENTITY_SELECTION_CONSUMED",
IDENTITY_SELECTION_EXPIRED: "IDENTITY_SELECTION_EXPIRED",
IDENTITY_CANDIDATE_LIMIT_EXCEEDED: "IDENTITY_CANDIDATE_LIMIT_EXCEEDED",
```

- [ ] **Step 4: Implement the strict request schemas**

Create `apps/api/src/schema/phone-identity-login.ts`:

```ts
import { z } from "zod";

const ChinaMobilePhoneSchema = z.string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

const SmsCodeSchema = z.string()
  .trim()
  .regex(/^\d{4,6}$/, "验证码格式不正确");

const ShareTokenSchema = z.string()
  .trim()
  .min(8, "分享 token 过短")
  .max(80, "分享 token 过长")
  .regex(/^[A-Za-z0-9_-]+$/, "分享 token 格式不正确");

export const PhoneIdentityLoginSendCodeSchema = z.object({
  phone: ChinaMobilePhoneSchema,
}).strict();

export const PhoneIdentityLoginVerifySchema = z.object({
  phone: ChinaMobilePhoneSchema,
  code: SmsCodeSchema,
  share_token: ShareTokenSchema.optional(),
}).strict();

export const PhoneIdentityLoginSelectSchema = z.object({
  selection_token: z.string()
    .trim()
    .min(43, "选择凭证格式不正确")
    .max(128, "选择凭证格式不正确")
    .regex(/^[A-Za-z0-9_-]+$/, "选择凭证格式不正确"),
  candidate_id: z.uuid("无效的候选 ID"),
}).strict();

export type PhoneIdentityLoginSendCodeInput =
  z.infer<typeof PhoneIdentityLoginSendCodeSchema>;
export type PhoneIdentityLoginVerifyInput =
  z.infer<typeof PhoneIdentityLoginVerifySchema>;
export type PhoneIdentityLoginSelectInput =
  z.infer<typeof PhoneIdentityLoginSelectSchema>;
```

- [ ] **Step 5: Run focused tests and domain build**

Run:

```bash
bun test packages/domain/src/auth.test.ts apps/api/src/schema/phone-identity-login.test.ts
bun --cwd packages/domain run build
```

Expected: all tests PASS and domain build exits 0.

- [ ] **Step 6: Commit the contract foundation**

```bash
git add packages/domain/src/auth.ts packages/domain/src/auth.test.ts \
  apps/api/src/errors/error-codes.ts \
  apps/api/src/schema/phone-identity-login.ts \
  apps/api/src/schema/phone-identity-login.test.ts
git commit -m "feat(auth): add unified phone login contracts"
```

## Task 2: Additive Session Migration And Atomic RPC Contracts

**Files:**
- Create: `supabase/migrations/20260715100000_create_phone_identity_login.sql`
- Create: `apps/api/src/services/phone-identity-login-migration.test.ts`

- [ ] **Step 1: Write the failing SQL contract test**

Create `apps/api/src/services/phone-identity-login-migration.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "../../../../supabase/migrations/20260715100000_create_phone_identity_login.sql",
  import.meta.url,
), "utf8");

describe("phone identity login migration", () => {
  test("adds the SMS scene without removing legacy scenes", () => {
    for (const scene of [
      "bind_customer",
      "bind_employee",
      "bind_platform_partner",
      "tenant_onboarding_application",
      "login_identity",
    ]) {
      expect(sql).toContain(`'${scene}'`);
    }
  });

  test("creates bounded session and candidate storage", () => {
    expect(sql).toContain("CREATE TABLE public.phone_identity_login_sessions");
    expect(sql).toContain("CREATE TABLE public.phone_identity_login_candidates");
    expect(sql).toContain("phone_identity_login_sessions_token_hash_unique_idx");
    expect(sql).toContain("phone_identity_login_sessions_status_expires_idx");
    expect(sql).toContain("phone_identity_login_candidates_session_idx");
    expect(sql).toMatch(/jsonb_array_length\(p_candidates\) NOT BETWEEN 2 AND 100/);
    expect(sql).toContain("ALTER TABLE public.phone_identity_login_sessions ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.phone_identity_login_candidates ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.phone_identity_login_sessions FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON TABLE public.phone_identity_login_candidates FROM PUBLIC, anon, authenticated");
  });

  test("locks SMS and selection rows before state changes", () => {
    expect(sql).toMatch(/claim_phone_identity_login_verification[\s\S]*FOR UPDATE/);
    expect(sql).toMatch(/reserve_phone_identity_selection[\s\S]*FOR UPDATE/);
    expect(sql).toContain("status = 'verified'");
    expect(sql).toContain("status = 'binding'");
    expect(sql).toContain("status = 'consumed'");
  });

  test("restricts every mutation RPC to service role", () => {
    for (const name of [
      "claim_phone_identity_login_verification",
      "begin_phone_identity_selection",
      "reserve_phone_identity_selection",
      "finalize_phone_identity_selection",
      "release_phone_identity_selection",
      "purge_phone_identity_login_sessions",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`,
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
      ));
    }
  });

  test("adds phone-first indexes and preserves partner uniqueness", () => {
    expect(sql).toContain("customers_phone_identity_login_idx");
    expect(sql).toContain("employees_phone_identity_login_idx");
    expect(sql).not.toContain("DROP INDEX IF EXISTS platform_partner_members_phone_active_unique_idx");
  });

  test("purges only a bounded expired audit batch", () => {
    expect(sql).toMatch(/purge_phone_identity_login_sessions[\s\S]*p_limit integer DEFAULT 500/);
    expect(sql).toMatch(/p_limit NOT BETWEEN 1 AND 1000/);
    expect(sql).toMatch(/expires_at < p_before[\s\S]*LIMIT p_limit[\s\S]*FOR UPDATE SKIP LOCKED/);
  });
});
```

- [ ] **Step 2: Run the SQL contract test and confirm it fails**

Run:

```bash
bun test apps/api/src/services/phone-identity-login-migration.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create tables, constraints, and indexes in one transaction**

Create `supabase/migrations/20260715100000_create_phone_identity_login.sql` beginning with:

```sql
-- Add unified phone identity verification and short-lived selection sessions.
-- Rollback: deploy the previous API first, then drop the six RPCs, the two
-- session tables and phone-first indexes. Restore the old SMS scene constraint
-- only after proving no login_identity rows remain.
BEGIN;

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check CHECK (
  scene IN (
    'bind_customer',
    'bind_employee',
    'admin_login',
    'rebind_wechat',
    'bind_platform_partner',
    'unbind_platform_partner',
    'rebind_platform_partner',
    'partner_application',
    'partner_tenant_onboarding',
    'tenant_onboarding_application',
    'login_identity'
  )
);

CREATE TABLE public.phone_identity_login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_verification_code_id uuid NOT NULL UNIQUE
    REFERENCES public.sms_verification_codes(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  openid_hash text NOT NULL CHECK (length(openid_hash) = 64),
  verified_phone text NOT NULL CHECK (verified_phone ~ '^1[3-9][0-9]{9}$'),
  selection_token_hash text NULL CHECK (
    selection_token_hash IS NULL OR length(selection_token_hash) = 64
  ),
  status text NOT NULL DEFAULT 'verified' CHECK (
    status IN ('verified', 'selection_required', 'binding', 'consumed', 'expired')
  ),
  selected_candidate_id uuid NULL,
  share_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(share_context) = 'object'
  ),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX phone_identity_login_sessions_token_hash_unique_idx
ON public.phone_identity_login_sessions(selection_token_hash)
WHERE selection_token_hash IS NOT NULL;

CREATE INDEX phone_identity_login_sessions_status_expires_idx
ON public.phone_identity_login_sessions(status, expires_at);

CREATE INDEX phone_identity_login_sessions_auth_created_idx
ON public.phone_identity_login_sessions(auth_user_id, created_at DESC);

CREATE TABLE public.phone_identity_login_candidates (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL
    REFERENCES public.phone_identity_login_sessions(id) ON DELETE CASCADE,
  target_mode text NOT NULL CHECK (
    target_mode IN ('customer', 'tenant_employee', 'platform_partner')
  ),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  partner_id uuid NULL REFERENCES public.platform_partners(id) ON DELETE RESTRICT,
  partner_member_id uuid NULL
    REFERENCES public.platform_partner_members(id) ON DELETE RESTRICT,
  binding_state text NOT NULL CHECK (
    binding_state IN ('current', 'bindable', 'rebind_required')
  ),
  display_snapshot jsonb NOT NULL CHECK (jsonb_typeof(display_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phone_identity_login_candidate_target_check CHECK (
    (target_mode = 'customer' AND tenant_id IS NOT NULL AND customer_id IS NOT NULL
      AND employee_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'tenant_employee' AND tenant_id IS NOT NULL AND employee_id IS NOT NULL
      AND customer_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'platform_partner' AND partner_id IS NOT NULL
      AND partner_member_id IS NOT NULL AND tenant_id IS NULL
      AND customer_id IS NULL AND employee_id IS NULL)
  ),
  UNIQUE(session_id, id)
);

ALTER TABLE public.phone_identity_login_sessions
ADD CONSTRAINT phone_identity_login_sessions_selected_candidate_fkey
FOREIGN KEY (id, selected_candidate_id)
REFERENCES public.phone_identity_login_candidates(session_id, id)
DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX phone_identity_login_candidates_session_idx
ON public.phone_identity_login_candidates(session_id, id);

ALTER TABLE public.phone_identity_login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_identity_login_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.phone_identity_login_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.phone_identity_login_candidates FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS customers_phone_identity_login_idx
ON public.customers(phone, tenant_id, id)
WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_phone_identity_login_idx
ON public.employees(phone, tenant_id, status, id)
WHERE phone IS NOT NULL;
```

- [ ] **Step 4: Add exact RPC state contracts**

Implement the following signatures in the same migration. Each function must be `LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public` and must return exactly the listed statuses:

```sql
public.claim_phone_identity_login_verification(
  p_phone text,
  p_code text,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_now timestamptz,
  p_expires_at timestamptz
) RETURNS TABLE(status text, session_id uuid)
-- statuses: claimed, sms_invalid, sms_expired

public.begin_phone_identity_selection(
  p_session_id uuid,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_selection_token_hash text,
  p_share_context jsonb,
  p_candidates jsonb,
  p_now timestamptz
) RETURNS TABLE(status text)
-- statuses: ready, session_not_found, session_expired, state_conflict

public.reserve_phone_identity_selection(
  p_selection_token_hash text,
  p_candidate_id uuid,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_now timestamptz
) RETURNS TABLE(status text, session_id uuid, target_mode text,
  tenant_id uuid, customer_id uuid, employee_id uuid,
  partner_id uuid, partner_member_id uuid)
-- statuses: reserved, same_candidate_in_progress, same_candidate_consumed,
-- selection_consumed, in_progress, expired, option_unavailable,
-- session_not_found

public.finalize_phone_identity_selection(
  p_session_id uuid,
  p_candidate_id uuid,
  p_now timestamptz
) RETURNS TABLE(status text)
-- statuses: consumed, state_conflict

public.release_phone_identity_selection(
  p_session_id uuid,
  p_candidate_id uuid,
  p_now timestamptz
) RETURNS TABLE(status text)
-- statuses: released, consumed, state_conflict

public.purge_phone_identity_login_sessions(
  p_before timestamptz,
  p_limit integer DEFAULT 500
) RETURNS integer
-- deleted session count; p_limit must be between 1 and 1000
```

Inside `claim_phone_identity_login_verification`, select the latest matching `login_identity` row `FOR UPDATE`; return `sms_expired` when the latest matching code exists but `expired_at <= p_now`, return `sms_invalid` when no pending unexpired row exists, update exactly one pending row to verified, and insert exactly one session referencing that SMS row.

Inside `begin_phone_identity_selection`, lock the verified session `FOR UPDATE`, reject expired/non-verified sessions, reject non-array candidates and `jsonb_array_length(p_candidates) NOT BETWEEN 2 AND 100`, validate each object against the allowed keys, insert all candidates with `jsonb_to_recordset`, then update the session to `selection_required`.

The TypeScript repository must send every candidate in this exact JSON shape; the RPC rejects missing or additional keys:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "target_mode": "customer",
  "tenant_id": "00000000-0000-4000-8000-000000000002",
  "customer_id": "00000000-0000-4000-8000-000000000003",
  "employee_id": null,
  "partner_id": null,
  "partner_member_id": null,
  "binding_state": "bindable",
  "display_snapshot": {
    "role_label": "客户",
    "title": "某某装饰",
    "subtitle": "张三",
    "rebind_kind": null
  }
}
```

Inside `reserve_phone_identity_selection`, lock by token hash `FOR UPDATE`, compare auth user and openid hash before returning candidate data, check expiry, return same/different consumed statuses from `selected_candidate_id`, and never return a candidate outside the persisted session. When expiry is observed, update the row to `expired` before returning. Set `binding` and the selected candidate only from `selection_required`. When the row is already `binding`, return `same_candidate_in_progress` with the persisted candidate for the same candidate ID and `in_progress` for a different candidate ID. This lets the service inspect and finish an interrupted same-candidate attempt without repeating a binding mutation.

Inside `finalize` and `release`, update only when both session and selected candidate match. `finalize` changes `binding` to `consumed`; `release` changes `binding` back to `selection_required` and clears `selected_candidate_id`.

Inside `purge_phone_identity_login_sessions`, reject a limit outside 1-1000, select rows with `expires_at < p_before` ordered by `expires_at, id`, cap with `LIMIT p_limit FOR UPDATE SKIP LOCKED`, and delete those sessions. Candidate rows are removed by the existing cascade. The operational caller always supplies `now() - interval '24 hours'`, preserving the approved 24-hour audit window.

End the migration with explicit revoke/grant statements for all six signatures and `COMMIT;`.

- [ ] **Step 5: Run SQL contract tests and inspect migration syntax locally**

Run:

```bash
bun test apps/api/src/services/phone-identity-login-migration.test.ts
supabase db lint --local
```

Expected: Bun test PASS. `supabase db lint --local` exits 0; if the local stack is unavailable, record that as an execution blocker and do not apply remote SQL yet.

- [ ] **Step 6: Commit the additive migration**

```bash
git add supabase/migrations/20260715100000_create_phone_identity_login.sql \
  apps/api/src/services/phone-identity-login-migration.test.ts
git commit -m "feat(auth): add phone identity login sessions"
```

## Task 3: Session Repository And Result Parsing

**Files:**
- Create: `apps/api/src/repositories/phone-identity-login.ts`
- Create: `apps/api/src/repositories/phone-identity-login.test.ts`

- [ ] **Step 1: Write failing repository tests**

Test all five application-state RPC names, exact parameter mapping, each allowed status, malformed UUID/status rejection, and Supabase error wrapping. The retention RPC remains an operational database function and is covered by the migration contract and smoke script rather than the request repository. Use a constructor-injected port:

```ts
type RpcPort = {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};
```

The first test must assert:

```ts
const rpc = mock(async () => ({
  data: [{
    status: "claimed",
    session_id: "00000000-0000-4000-8000-000000000001",
  }],
  error: null,
}));
const repository = new PhoneIdentityLoginRepository({ rpc });

await expect(repository.claimVerification({
  phone: "13800138000",
  code: "123456",
  authUserId: "00000000-0000-4000-8000-000000000002",
  openidHash: "a".repeat(64),
  now: "2026-07-15T10:00:00.000Z",
  expiresAt: "2026-07-15T10:05:00.000Z",
})).resolves.toEqual({
  status: "claimed",
  sessionId: "00000000-0000-4000-8000-000000000001",
});
```

- [ ] **Step 2: Run the repository test and confirm failure**

```bash
bun test apps/api/src/repositories/phone-identity-login.test.ts
```

Expected: FAIL because the repository is absent.

- [ ] **Step 3: Implement a typed repository with strict parsers**

Export these result unions from `phone-identity-login.ts`:

```ts
export type ClaimVerificationResult =
  | { status: "claimed"; sessionId: string }
  | { status: "sms_invalid" | "sms_expired"; sessionId: null };

export type ReserveSelectionResult =
  | {
    status:
      | "reserved"
      | "same_candidate_in_progress"
      | "same_candidate_consumed";
    sessionId: string;
    candidate: {
      id: string;
      targetMode: "customer" | "tenant_employee" | "platform_partner";
      tenantId: string | null;
      customerId: string | null;
      employeeId: string | null;
      partnerId: string | null;
      partnerMemberId: string | null;
    };
  }
  | {
    status:
      | "selection_consumed"
      | "in_progress"
      | "expired"
      | "option_unavailable"
      | "session_not_found";
    sessionId: string | null;
  };
```

Implement public methods:

```ts
claimVerification(input: ClaimVerificationInput): Promise<ClaimVerificationResult>;
beginSelection(input: BeginSelectionInput): Promise<BeginSelectionResult>;
reserveSelection(input: ReserveSelectionInput): Promise<ReserveSelectionResult>;
finalizeSelection(input: FinalizeSelectionInput): Promise<"consumed" | "state_conflict">;
releaseSelection(input: FinalizeSelectionInput): Promise<"released" | "consumed" | "state_conflict">;
```

Every parser must verify that RPC data is an array with exactly one object, validate status membership, validate required UUIDs with one shared UUID regex, and throw `Errors.dbError("统一手机号登录状态返回异常", data)` for malformed output.

- [ ] **Step 4: Run repository tests**

```bash
bun test apps/api/src/repositories/phone-identity-login.test.ts
```

Expected: PASS with all RPC mappings and malformed-result cases covered.

- [ ] **Step 5: Commit the repository adapter**

```bash
git add apps/api/src/repositories/phone-identity-login.ts \
  apps/api/src/repositories/phone-identity-login.test.ts
git commit -m "feat(auth): add phone login session repository"
```

## Task 4: Bounded Candidate And Share Context Reads

**Files:**
- Create: `apps/api/src/repositories/phone-identity-candidates.ts`
- Create: `apps/api/src/repositories/phone-identity-candidates.test.ts`
- Modify: `apps/api/src/repositories/tenant-share-links.ts`
- Modify: `apps/api/src/services/tenant-share-links.ts`
- Test: `apps/api/src/services/tenant-share-links.test.ts`

- [ ] **Step 1: Write failing bounded-query tests**

Use injected Supabase table ports to assert that customer and employee phone reads select only required fields, call `.eq("phone", phone)`, sort by stable IDs, and call `.range(0, 100)`. Assert the partner read calls `.eq("phone", phone).range(0, 1)` because current uniqueness permits at most one non-disabled row plus one disabled diagnostic row.

The repository result types must include:

```ts
type PhoneCustomerRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  tenant: RelationOne<{ id: string; name: string | null; status: string | null }>;
};

type PhoneEmployeeRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  tenant: RelationOne<{ id: string; name: string | null; status: string | null }>;
  tenant_department: RelationOne<{ alias_name: string | null; code: string | null }>;
  post: RelationOne<{ name: string | null; code: string | null }>;
};
```

- [ ] **Step 2: Write failing share resolver tests**

Add tests that call `tenantShareLinkService.resolveLoginContext(token)` and verify:

- active link + active tenant returns IDs and does not call `bindCustomer`;
- expired link returns `TENANT_SHARE_LINK_NOT_AVAILABLE`;
- disabled tenant returns the same unavailable code;
- `resolveAttribution({ shareLinkId, shareToken })` rejects mismatched IDs;
- lookup by ID returns trusted IDs without returning the raw token.

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
bun test apps/api/src/repositories/phone-identity-candidates.test.ts \
  apps/api/src/services/tenant-share-links.test.ts
```

Expected: FAIL because candidate reads and read-only share methods do not exist.

- [ ] **Step 4: Implement bounded candidate reads**

Create `PhoneIdentityCandidateRepository` with these methods:

```ts
listCustomersByPhone(phone: string): Promise<PhoneCustomerRecord[]>;
listEmployeesByPhone(phone: string): Promise<PhoneEmployeeRecord[]>;
listPartnerMembersByPhone(phone: string): Promise<PlatformPartnerMemberRecord[]>;
listActiveMembershipKeys(authUserId: string): Promise<Set<string>>;
listActiveWechatOauthUserIds(userIds: string[]): Promise<Set<string>>;
```

Use these membership keys:

```ts
`${identity_type}:${tenant_id ?? ""}:${identity_id}`
```

Batch OAuth lookup with one `.in("user_id", uniqueIds)` query filtered by `platform=wechat_mini` and `status=active`; return an empty set without querying when `uniqueIds.length === 0`.

- [ ] **Step 5: Implement non-mutating share lookup**

Add `findPublicById(id)` to `TenantShareLinkRepository` using the same minimal tenant and employee hydration as `findPublicByToken`.

Add these service methods:

```ts
async resolveLoginContext(token: string) {
  const record = await tenantShareLinkRepository.findPublicByToken(token);
  return this.requireAvailableContext(record);
}

async resolveAttribution(input: {
  shareLinkId?: string | null;
  shareToken?: string | null;
}) {
  const byId = input.shareLinkId
    ? await tenantShareLinkRepository.findPublicById(input.shareLinkId)
    : null;
  const byToken = input.shareToken
    ? await tenantShareLinkRepository.findPublicByToken(input.shareToken)
    : null;
  if (byId && byToken && byId.id !== byToken.id) {
    throw Errors.business(409, "分享归因上下文不一致", "SHARE_CONTEXT_MISMATCH");
  }
  const record = byId ?? byToken;
  return record ? this.requireAvailableContext(record) : null;
}
```

`requireAvailableContext` must check link status, expiry, tenant active state, and return only `shareLinkId`, `tenantId`, `shareEmployeeId`, and `source`.

- [ ] **Step 6: Run tests and commit**

```bash
bun test apps/api/src/repositories/phone-identity-candidates.test.ts \
  apps/api/src/services/tenant-share-links.test.ts
git add apps/api/src/repositories/phone-identity-candidates.ts \
  apps/api/src/repositories/phone-identity-candidates.test.ts \
  apps/api/src/repositories/tenant-share-links.ts \
  apps/api/src/services/tenant-share-links.ts \
  apps/api/src/services/tenant-share-links.test.ts
git commit -m "feat(auth): add bounded phone identity discovery"
```

## Task 5: Candidate Normalization And Stable Ordering

**Files:**
- Create: `apps/api/src/services/phone-identity-login/types.ts`
- Create: `apps/api/src/services/phone-identity-login/candidates.ts`
- Create: `apps/api/src/services/phone-identity-login/candidates.test.ts`

- [ ] **Step 1: Define failing candidate matrix tests**

Cover these exact cases in a table-driven test:

1. no raw records -> `rawMatchCount=0`, no candidates;
2. inactive tenant customer only -> raw match but no candidate;
3. disabled employee only -> raw match but no candidate;
4. pending-bind active partner -> bindable partner candidate;
5. same customer duplicated -> one `tenant_id + customer_id` candidate;
6. two tenant customers -> two candidates;
7. customer and employee -> two candidates;
8. current user/membership -> `current`;
9. unbound record -> `bindable`;
10. record bound to another user with active WeChat OAuth -> `rebind_required`;
11. share tenant customer sorts first;
12. aggregate over 100 candidates -> `IDENTITY_CANDIDATE_LIMIT_EXCEEDED`.

- [ ] **Step 2: Run the candidate test and confirm failure**

```bash
bun test apps/api/src/services/phone-identity-login/candidates.test.ts
```

Expected: FAIL because the module is absent.

- [ ] **Step 3: Define internal candidate types**

In `types.ts`, export:

```ts
export type PhoneIdentityTargetMode =
  | "customer"
  | "tenant_employee"
  | "platform_partner";

export type PhoneIdentityBindingState =
  | "current"
  | "bindable"
  | "rebind_required";

export type PhoneIdentityCandidate = {
  candidateId: string;
  targetMode: PhoneIdentityTargetMode;
  bindingState: PhoneIdentityBindingState;
  rebindKind?: "tenant_wechat" | "platform_partner";
  tenantId: string | null;
  customerId: string | null;
  employeeId: string | null;
  partnerId: string | null;
  partnerMemberId: string | null;
  roleLabel: string;
  title: string;
  subtitle: string;
  sharePreferred: boolean;
};

export type CandidateDiscoveryResult = {
  rawMatchCount: number;
  candidates: PhoneIdentityCandidate[];
};
```

- [ ] **Step 4: Implement pure normalization**

Export `buildPhoneIdentityCandidates(input)` from `candidates.ts`. Generate candidate IDs with an injected `createCandidateId` defaulting to `randomUUID`. Use `relationOne` for Supabase relations. Determine binding state with:

```ts
function resolveBindingState(input: {
  currentAuthUserId: string;
  recordUserId: string | null;
  membershipCurrent: boolean;
  recordUserHasActiveWechat: boolean;
}): PhoneIdentityBindingState {
  if (input.recordUserId === input.currentAuthUserId || input.membershipCurrent) {
    return "current";
  }
  if (!input.recordUserId || !input.recordUserHasActiveWechat) {
    return "bindable";
  }
  return "rebind_required";
}
```

Sort by `sharePreferred`, binding rank `current/bindable/rebind_required`, mode rank `customer/tenant_employee/platform_partner`, normalized title, then business ID. Throw:

```ts
Errors.business(
  422,
  "该手机号关联身份过多，请联系平台处理",
  ErrorCodes.IDENTITY_CANDIDATE_LIMIT_EXCEEDED,
)
```

when the de-duplicated result exceeds 100.

- [ ] **Step 5: Run tests and commit**

```bash
bun test apps/api/src/services/phone-identity-login/candidates.test.ts
git add apps/api/src/services/phone-identity-login/types.ts \
  apps/api/src/services/phone-identity-login/candidates.ts \
  apps/api/src/services/phone-identity-login/candidates.test.ts
git commit -m "feat(auth): normalize phone identity candidates"
```

## Task 6: Bind A Specific Customer, Employee, Or Partner

**Files:**
- Modify: `apps/api/src/services/wechat-auth-legacy/employee.ts`
- Modify: `apps/api/src/repositories/wechat-employee-identities.ts`
- Modify: `apps/api/src/services/wechat-employee-identities.ts`
- Modify: `apps/api/src/repositories/platform-partner-portal.ts`
- Modify: `apps/api/src/repositories/platform-partner-portal-types.ts`
- Modify: `apps/api/src/services/platform-partner-portal.ts`
- Create: `apps/api/src/services/phone-identity-login/bindings.ts`
- Create: `apps/api/src/services/phone-identity-login/bindings.test.ts`
- Test: `apps/api/src/services/wechat-auth-legacy/verify-role.test.ts`
- Test: `apps/api/src/services/platform-partner-portal.test.ts`

- [ ] **Step 1: Write failing selected-binding tests**

Test `PhoneIdentityBindings.authenticate` with injected adapters. Assert:

- customer ID is reloaded with tenant ID before `bindCustomerToAuthUser`;
- employee ID is reloaded and status/tenant checked before binding;
- partner member ID is reloaded and checked before binding;
- changed phone or inactive tenant/member returns `IDENTITY_OPTION_UNAVAILABLE`;
- customer/employee rebind propagates `WECHAT_ALREADY_BOUND` details;
- partner rebind propagates `PARTNER_MEMBER_ALREADY_BOUND`;
- employee auth output is `mode/authMode=tenant_employee`.
- `buildCurrentAuth` reloads and signs an already-current identity without executing a bind or rebind mutation.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
bun test apps/api/src/services/phone-identity-login/bindings.test.ts
```

Expected: FAIL because selected binding adapters do not exist.

- [ ] **Step 3: Extract specified employee binding without changing the legacy wrapper**

Refactor `bindEmployeeRole` into:

```ts
export async function bindEmployeeRole(this: any,
  request: FastifyRequest,
  authUserId: string,
  phone: string,
  openid: string | null,
) {
  const employees = await wechatEmployeeIdentityService
    .listEmployeeLoginCandidatesByPhone(phone);
  if (employees.length === 0) {
    throw Errors.badRequest("该手机号未绑定员工身份");
  }
  if (employees.length > 1) {
    throw Errors.badRequest("该手机号绑定了多个员工档案，请联系管理员处理");
  }
  return bindSelectedEmployeeRole.call(
    this,
    request,
    authUserId,
    phone,
    openid,
    employees[0]!,
  );
}
```

Move the existing status, tenant, membership, OAuth, rebind, cache, and binding logic unchanged into exported `bindSelectedEmployeeRole`. Add repository/service method `getEmployeeLoginCandidateById(employeeId)` using the same selected fields and `.eq("id", employeeId).maybeSingle()`.

- [ ] **Step 4: Expose selected partner authentication**

Add a public method to `PlatformPartnerPortalService`:

```ts
async authenticateSelectedMember(input: {
  memberId: string;
  phone: string;
  userId: string;
  openid: string;
  unionid?: string | null;
}) {
  const member = await this.repository.findMemberById(input.memberId);
  if (!member || member.phone !== input.phone) {
    throw Errors.business(
      409,
      "身份选项已不可用",
      ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
    );
  }
  const bound = await bindPlatformPartnerMemberWithoutSmsCode({
    repository: this.repository,
    phone: input.phone,
    authUserId: input.userId,
    memberId: input.memberId,
  });
  this.assertUsableMember(bound);
  return this.buildAuthResponse(
    bound,
    input.userId,
    input.openid,
    input.unionid ?? null,
  );
}
```

Extend `bindPlatformPartnerMemberWithoutSmsCode` to accept `memberId`, load exactly that member, compare phone, and never fall back to another same-phone record.

- [ ] **Step 5: Implement the binding dispatcher**

Create `PhoneIdentityBindings.authenticate(input)` with a discriminated switch over `candidate.targetMode`. It must reload the selected record, compare the verified phone and persisted IDs, call the existing customer session signer, the extracted selected employee binder plus `buildEmployeeLoginContextByEmployeeId`, or `authenticateSelectedMember`.

Also expose `inspectCurrentBinding(input): Promise<"current" | "unbound" | "indeterminate">` and `buildCurrentAuth(input)`. `buildCurrentAuth` must first require `inspectCurrentBinding` to return `current`, then construct the same response from current database state without calling a binding mutation. This is the only path used for consumed or interrupted selection retries.

Map only stale/unavailable records to `IDENTITY_OPTION_UNAVAILABLE`. Do not catch and rewrite `WECHAT_ALREADY_BOUND` or `PARTNER_MEMBER_ALREADY_BOUND`.

- [ ] **Step 6: Run legacy and new regression tests**

```bash
bun test apps/api/src/services/phone-identity-login/bindings.test.ts \
  apps/api/src/services/wechat-auth-legacy/verify-role.test.ts \
  apps/api/src/services/platform-partner-portal.test.ts
```

Expected: all PASS; old multi-employee `/auth/verify-role` behavior remains unchanged.

- [ ] **Step 7: Commit selected binding support**

```bash
git add apps/api/src/services/wechat-auth-legacy/employee.ts \
  apps/api/src/repositories/wechat-employee-identities.ts \
  apps/api/src/services/wechat-employee-identities.ts \
  apps/api/src/repositories/platform-partner-portal.ts \
  apps/api/src/repositories/platform-partner-portal-types.ts \
  apps/api/src/services/platform-partner-portal.ts \
  apps/api/src/services/platform-partner-portal-binding.ts \
  apps/api/src/services/phone-identity-login/bindings.ts \
  apps/api/src/services/phone-identity-login/bindings.test.ts \
  apps/api/src/services/wechat-auth-legacy/verify-role.test.ts \
  apps/api/src/services/platform-partner-portal.test.ts
git commit -m "feat(auth): authenticate selected phone identity"
```

## Task 7: Send And Verify State Machine

**Files:**
- Create: `apps/api/src/services/phone-identity-login/service.ts`
- Create: `apps/api/src/services/phone-identity-login/service.test.ts`
- Create: `apps/api/src/services/phone-identity-login/index.ts`
- Modify: `apps/api/src/utils/jwt.ts`
- Modify: `apps/api/src/services/wechat-auth-legacy/common.ts`
- Modify: `apps/api/src/services/wechat-auth-legacy/common.test.ts`

- [ ] **Step 1: Write failing send and verify tests**

Use constructor-injected dependencies and a fixed clock. Cover:

- send uses `scene=login_identity`, request IP, and request device;
- send never invokes candidate discovery;
- wrong, expired, and missing auth session errors;
- `sms_invalid` maps to HTTP 400 `SMS_CODE_INVALID`, `sms_expired` maps to HTTP 400 `SMS_CODE_EXPIRED`, and unavailable-only maps to HTTP 403 `IDENTITY_ACCOUNT_UNAVAILABLE`;
- zero raw identities returns `visitor_verified` and never calls bindings;
- unavailable-only raw identities returns `IDENTITY_ACCOUNT_UNAVAILABLE`;
- one current/bindable candidate authenticates directly;
- one rebind candidate propagates the stable rebind error;
- multiple candidates call `beginSelection` and return masked phone plus 300 seconds;
- share context sorts matching tenant first without calling customer creation;
- production logs receive counts and IDs but not phone, code, raw token, or openid.
- the verified visitor token includes internal `sub` and trusted `share_link_id`, while its public response keeps `user_id: null`;
- the initial `/auth` visitor session still omits `sub` and `verified_phone`.

The verified visitor assertion must include these claims:

```ts
{
  token_type: "visitor_session",
  sub: "00000000-0000-4000-8000-000000000001",
  openid: "visitor-openid",
  visitor_id: "wechat_visitor_hash",
  roles: ["visitor"],
  verified_phone: "13800138000",
  share_link_id: "00000000-0000-4000-8000-000000000002",
}
```

- [ ] **Step 2: Run service tests and confirm failure**

```bash
bun test apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/wechat-auth-legacy/common.test.ts
```

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement trusted mini-program actor resolution**

Add a private method:

```ts
private async requireWechatActor(
  user: JwtPayload | undefined,
  request: FastifyRequest,
) {
  const openid = typeof user?.openid === "string" ? user.openid.trim() : "";
  if (!openid || user?.login_channel === "admin_web") {
    throw Errors.unauthorized(
      "请先建立有效的小程序微信会话",
      ErrorCodes.AUTH_SESSION_REQUIRED,
    );
  }
  const authUserId = user?.sub ?? await this.resolveAuthUserId(request);
  return {
    authUserId,
    openid,
    unionid: user?.unionid ?? null,
    openidHash: createHash("sha256").update(openid).digest("hex"),
  };
}
```

Production wiring must resolve a visitor without `sub` using the existing `getAuthUserIdForRoleVerification` behavior, not a client value.

- [ ] **Step 4: Implement `sendCode`**

Call `smsVerificationCodeService.sendCode` with `scene: "login_identity"`. Return its `{ success, cooldown_seconds }` result. Do not query any identity table in this method.

- [ ] **Step 5: Implement `verify`**

Perform operations in this order:

1. require WeChat actor;
2. call `claimVerification` with a five-minute session expiry;
3. map `sms_invalid` and `sms_expired` to the exact stable errors above;
4. resolve optional share context without mutation;
5. load customers, employees, partner members, memberships, and OAuth user IDs using bounded parallel queries;
6. normalize candidates;
7. zero raw matches -> sign verified visitor auth with `sub` and share link ID;
8. unavailable-only -> `IDENTITY_ACCOUNT_UNAVAILABLE`;
9. one current/bindable -> authenticate it;
10. one rebind-required -> call binding dispatcher so the existing error/details are returned;
11. multiple -> generate 32 random bytes, hash token, persist candidate rows with `beginSelection`, return public candidates.

Before implementing the zero-identity branch, add `share_link_id?: string | null` to `JwtPayload`. Extend `signVisitorSession` input with optional `authUserId` and `shareLinkId`, and pass them as `sub` and `share_link_id` to `signVisitorSessionToken`. Only unified verified login supplies `authUserId` and verified phone; the initial `/auth` visitor flow must preserve its existing claims.

Public candidate serialization must be exactly:

```ts
{
  candidate_id: candidate.candidateId,
  target_mode: candidate.targetMode,
  role_label: candidate.roleLabel,
  title: candidate.title,
  subtitle: candidate.subtitle,
  binding_state: candidate.bindingState,
  ...(candidate.rebindKind ? { rebind_kind: candidate.rebindKind } : {}),
}
```

- [ ] **Step 6: Wire production dependencies in `index.ts`**

Export `PhoneIdentityLoginService` for tests and `phoneIdentityLoginService` for controllers. Production dependencies must use the session repository, candidate repository, SMS service, tenant share service, binding dispatcher, `randomBytes`, current time, and verified visitor signer.

Emit the structured events `phone_identity_login_sms_sent`, `phone_identity_login_verified`, `phone_identity_login_selection_required`, `phone_identity_login_authenticated`, `phone_identity_login_selection_rejected`, and `phone_identity_login_rebind_required` at their corresponding transitions. Include request ID, session ID, target mode, candidate count, binding state, duration, error code, and only a masked phone when needed; never include code, raw token, JWT, openid, or business-record payloads.

- [ ] **Step 7: Run tests and commit**

```bash
bun test apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/wechat-auth-legacy/common.test.ts
git add apps/api/src/services/phone-identity-login/service.ts \
  apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/phone-identity-login/index.ts \
  apps/api/src/utils/jwt.ts \
  apps/api/src/services/wechat-auth-legacy/common.ts \
  apps/api/src/services/wechat-auth-legacy/common.test.ts
git commit -m "feat(auth): verify unified phone identities"
```

## Task 8: Selection, Idempotency, And Failure Recovery

**Files:**
- Modify: `apps/api/src/services/phone-identity-login/service.ts`
- Modify: `apps/api/src/services/phone-identity-login/service.test.ts`

- [ ] **Step 1: Add failing selection tests**

Cover each repository result:

- `session_not_found` and `option_unavailable` -> `IDENTITY_OPTION_UNAVAILABLE`;
- `expired` -> HTTP 410 `IDENTITY_SELECTION_EXPIRED`;
- `selection_consumed` -> HTTP 409 `IDENTITY_SELECTION_CONSUMED`;
- `in_progress` -> HTTP 409 `IDENTITY_SELECTION_IN_PROGRESS`;
- `reserved` -> bind and finalize;
- `same_candidate_consumed` -> reload and issue a new equivalent auth without another bind mutation;
- `same_candidate_in_progress` with current binding -> finalize and issue auth without another bind mutation;
- `same_candidate_in_progress` with unbound state -> release and retry through a fresh reservation;
- `same_candidate_in_progress` with indeterminate state -> keep binding and return in-progress;
- business conflict before mutation -> release and propagate rebind/unavailable error;
- confirmed current binding after uncertain failure -> finalize and return auth;
- confirmed unbound after uncertain failure -> release and return the original wrapped error;
- indeterminate binding state -> leave binding and return in-progress.

- [ ] **Step 2: Run the selection tests and confirm failure**

```bash
bun test apps/api/src/services/phone-identity-login/service.test.ts
```

Expected: FAIL on selection cases.

- [ ] **Step 3: Implement `select` status mapping**

Hash the submitted selection token, call `reserveSelection` with current actor and current time, then use an exhaustive switch. Never query by client-provided business ID.

For `reserved`, call the binding dispatcher with the candidate returned by the RPC. On success, call `finalizeSelection`; require `consumed`. If finalization throws or returns `state_conflict`, return `IDENTITY_SELECTION_IN_PROGRESS` so the client retries the same token and candidate through `same_candidate_in_progress`; do not repeat the binding mutation.

For `same_candidate_consumed`, call `buildCurrentAuth` and return a fresh equivalent auth. For `same_candidate_in_progress`, inspect current binding: finalize and call `buildCurrentAuth` when current, release and reserve once again when unbound, or keep `binding` and return `IDENTITY_SELECTION_IN_PROGRESS` when indeterminate.

For known pre-write business errors (`WECHAT_ALREADY_BOUND`, `PARTNER_MEMBER_ALREADY_BOUND`, `IDENTITY_OPTION_UNAVAILABLE`), call `releaseSelection` before rethrowing. For unknown errors, call `bindings.inspectCurrentBinding`; finalize and use `buildCurrentAuth` if current, release if unbound, and keep binding plus return `IDENTITY_SELECTION_IN_PROGRESS` when indeterminate.

- [ ] **Step 4: Run complete service tests**

```bash
bun test apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/phone-identity-login/bindings.test.ts
```

Expected: PASS for all verification, selection, and failure-recovery cases.

- [ ] **Step 5: Commit secure selection behavior**

```bash
git add apps/api/src/services/phone-identity-login/service.ts \
  apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/phone-identity-login/bindings.ts \
  apps/api/src/services/phone-identity-login/bindings.test.ts
git commit -m "feat(auth): add idempotent identity selection"
```

## Task 9: Controller Routes And Token-Type Allowlist

**Files:**
- Modify: `apps/api/src/services/wechat-auth-legacy-controller.ts`
- Create: `apps/api/src/controllers/wechat/routes.test.ts`
- Modify: `apps/api/src/controllers/platform-partner-portal/index.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Create: `apps/api/src/utils/auth/request-device.ts`

- [ ] **Step 1: Write failing controller and allowlist tests**

Controller route test must assert these additions without removing existing routes:

```ts
expect(routes).toContainEqual({
  method: "POST",
  path: "/auth/phone-login/send-code",
});
expect(routes).toContainEqual({
  method: "POST",
  path: "/auth/phone-login/verify",
});
expect(routes).toContainEqual({
  method: "POST",
  path: "/auth/phone-login/select",
});
```

Route policy tests must assert:

- all three are visitor session routes;
- all three are partner portal routes;
- none are public or bypass routes;
- `POST /platform/leads` is a visitor session route;
- `GET /platform/leads` remains protected;
- admin and H5 token rejection remains in the auth plugin.

Add a controller test for an omitted or blank verify `code`; it must return HTTP 400 `SMS_CODE_REQUIRED` before calling the service. Other malformed codes continue through Zod and return `VALIDATION_ERROR`.

- [ ] **Step 2: Run route tests and confirm failure**

```bash
bun test apps/api/src/controllers/wechat/routes.test.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts
```

Expected: FAIL because routes are not registered or allowed.

- [ ] **Step 3: Add thin controller methods**

In `wechat-auth-legacy-controller.ts`, import the three schemas and service, then add methods that follow this exact structure:

```ts
@Post("/auth/phone-login/send-code")
async sendPhoneIdentityLoginCode(request: FastifyRequest, reply: FastifyReply) {
  const parsed = PhoneIdentityLoginSendCodeSchema.safeParse(request.body ?? {});
  if (!parsed.success) throw Errors.fromZod(parsed.error);
  const data = await phoneIdentityLoginService.sendCode({
    input: parsed.data,
    user: request.user,
    request,
    requestIp: request.ip ?? null,
    requestDevice: getRequestDevice(request),
  });
  return reply.send(ResponseHandler.success(data, "验证码已发送"));
}
```

Implement verify and select with the same shape, schema-specific input, and messages `身份验证成功` and `登录成功`. Before parsing verify, detect an omitted or blank `code` and throw `Errors.business(400, "请输入验证码", ErrorCodes.SMS_CODE_REQUIRED)`. Move `getRequestDevice` into a small shared auth request utility if importing the existing partner controller helper would create a controller dependency.

- [ ] **Step 4: Update exact route classifiers**

Add one helper `isPhoneIdentityLoginRoute(method, url)` and call it from `isVisitorSessionRoute` and `isPartnerPortalRoute`. Do not add these paths to `publicRoutes`, `isPartnerAuthRoute`, or `shouldBypassAuth`.

- [ ] **Step 5: Run route tests and commit**

```bash
bun test apps/api/src/controllers/wechat/routes.test.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts
git add apps/api/src/services/wechat-auth-legacy-controller.ts \
  apps/api/src/controllers/wechat/routes.test.ts \
  apps/api/src/controllers/platform-partner-portal/index.ts \
  apps/api/src/plugins/auth/legacy/routes.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/utils/auth/request-device.ts
git commit -m "feat(auth): expose unified phone login routes"
```

## Task 10: Platform Lead Attribution From A Verified Visitor

**Files:**
- Modify: `apps/api/src/schema/platform-leads.ts`
- Modify: `apps/api/src/controllers/platform-leads/index.ts`
- Modify: `apps/api/src/services/platform-leads.ts`
- Modify: `apps/api/src/repositories/platform-leads.ts`
- Create: `apps/api/src/services/platform-leads.test.ts`

- [ ] **Step 1: Write failing platform lead tests**

Instantiate `PlatformLeadService` with injected repository and share resolver. Test:

- no auth user -> 401;
- no verified phone -> 401;
- different request phone -> 400;
- platform visitor source strips client `tenant_id`, `project_id`, and attribution keys;
- trusted share link produces `source_context.share_link_id`, `share_employee_id`, `attributed_tenant_id`, and `share_source`;
- trusted share attribution does not set `platform_leads.tenant_id`;
- mismatched optional `share_token` returns `SHARE_CONTEXT_MISMATCH`;
- visitor project detail retains its separately validated tenant/project fields.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
bun test apps/api/src/services/platform-leads.test.ts
```

Expected: FAIL because trusted lead attribution is absent.

- [ ] **Step 3: Add trusted lead attribution**

Extend `PlatformLeadSubmitSchema` with optional validated `share_token`, change `source` to `z.enum(["platform_visitor", "visitor_project_detail"])`, and keep `source_context` strict. Do not add attribution IDs to the client schema.

Export `PlatformLeadService`, add constructor-injected `repository` and `shareLinks` dependencies, and keep production defaults pointing to `platformLeadRepository` and `tenantShareLinkService`. Pass `request.user?.share_link_id` from controller context. In service:

```ts
const attribution = await this.shareLinks.resolveAttribution({
  shareLinkId: context.shareLinkId,
  shareToken: input.share_token,
});
const sourceContext = {
  ...(input.source_context ?? {}),
  ...(attribution
    ? {
      share_link_id: attribution.shareLinkId,
      share_employee_id: attribution.shareEmployeeId,
      attributed_tenant_id: attribution.tenantId,
      share_source: attribution.source,
    }
    : {}),
};
```

Remove `share_token` before repository insert. For `source=platform_visitor`, force `tenant_id` and `project_id` to null. Repository input must accept a service-owned record containing `sourceContext` rather than accepting arbitrary attribution from the request.

- [ ] **Step 4: Run tests and commit**

```bash
bun test apps/api/src/services/platform-leads.test.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts
git add apps/api/src/schema/platform-leads.ts \
  apps/api/src/controllers/platform-leads/index.ts \
  apps/api/src/services/platform-leads.ts \
  apps/api/src/services/platform-leads.test.ts \
  apps/api/src/repositories/platform-leads.ts
git commit -m "feat(auth): support verified visitor lead attribution"
```

## Task 11: Static Verification And Generated Database Types

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Modify only as required by compiler output: files changed in Tasks 1-10

- [ ] **Step 1: Run the minimum static verification before any server or E2E command**

```bash
bun run api:typecheck
```

Expected: PASS. If it fails, read the exact installed Supabase, Fastify, and Zod type definitions before changing imports or method names. Do not start dev servers while typecheck is red.

- [ ] **Step 2: Apply the pending migration to the linked non-production project**

First inspect:

```bash
supabase migration list
```

Expected: `20260715100000` appears only under Local before application. Confirm the linked project is the intended development environment.

Apply:

```bash
supabase db push
```

Expected: exactly `20260715100000_create_phone_identity_login.sql` is applied.

- [ ] **Step 3: Verify migration alignment**

```bash
supabase migration list
```

Expected: `20260715100000` appears in both Local and Remote columns. Stop if any unrelated pending migration is present or Local/Remote remains misaligned.

- [ ] **Step 4: Regenerate actual Supabase types**

```bash
supabase gen types typescript --linked > apps/api/src/types/database.ts
```

Expected: generated types include `phone_identity_login_sessions`, `phone_identity_login_candidates`, and all six RPC names.

- [ ] **Step 5: Run full static checks**

```bash
bun run api:check
```

Expected: typecheck, API build, and 500-line file-size check all PASS.

- [ ] **Step 6: Commit generated types and compiler-driven fixes**

```bash
git add apps/api/src/types/database.ts
git commit -m "chore(auth): align unified login database types"
```

Before committing, use `git diff --cached --name-only` and verify no unrelated API file was staged.

## Task 12: Database Execution Plans And End-To-End Smoke

**Files:**
- Create: `apps/api/src/scripts/phone-identity-login-smoke.ts`
- Create: `docs/application_integration_documentation/2026-07-15-unified-phone-identity-login-backend.md`

- [ ] **Step 1: Add an environment-gated smoke script**

The script must require these variables and exit through `Errors.badRequest`-compatible reporting rather than embedding phone data:

```text
PHONE_LOGIN_ZERO_PHONE
PHONE_LOGIN_CUSTOMER_PHONE
PHONE_LOGIN_EMPLOYEE_PHONE
PHONE_LOGIN_PARTNER_PHONE
PHONE_LOGIN_MULTI_PHONE
PHONE_LOGIN_DISABLED_PHONE
PHONE_LOGIN_REBIND_PHONE
PHONE_LOGIN_SHARE_TOKEN
PHONE_LOGIN_AUTH_TOKEN
```

The script must call the three endpoints, verify response status branches, query database counts before and after zero-identity verification, assert no customer or lead was created, then submit one lead and assert only the lead count increments. In an explicit maintenance phase, call `purge_phone_identity_login_sessions` with `p_before` set to 24 hours before the script clock and `p_limit=500`; assert the returned count is within 0-500 and that no newer session was deleted.

- [ ] **Step 2: Run focused and full automated tests**

```bash
bun test packages/domain/src/auth.test.ts \
  apps/api/src/schema/phone-identity-login.test.ts \
  apps/api/src/repositories/phone-identity-login.test.ts \
  apps/api/src/repositories/phone-identity-candidates.test.ts \
  apps/api/src/services/phone-identity-login-migration.test.ts \
  apps/api/src/services/phone-identity-login/candidates.test.ts \
  apps/api/src/services/phone-identity-login/bindings.test.ts \
  apps/api/src/services/phone-identity-login/service.test.ts \
  apps/api/src/services/platform-leads.test.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/controllers/wechat/routes.test.ts
```

Expected: all focused tests PASS with zero failures.

Then run:

```bash
bun test apps/api/src
```

Expected: the entire API Bun test suite PASS.

- [ ] **Step 3: Verify phone-first execution plans**

Run `EXPLAIN (ANALYZE, BUFFERS)` through the approved Supabase query tool for:

```sql
WITH sample_phone AS (
  SELECT phone
  FROM public.customers
  WHERE phone IS NOT NULL
  GROUP BY phone
  ORDER BY count(*) DESC, phone
  LIMIT 1
)
SELECT id, tenant_id, user_id, name
FROM public.customers
WHERE phone = (SELECT phone FROM sample_phone)
ORDER BY id
LIMIT 101;
```

and:

```sql
WITH sample_phone AS (
  SELECT phone
  FROM public.employees
  WHERE phone IS NOT NULL
  GROUP BY phone
  ORDER BY count(*) DESC, phone
  LIMIT 1
)
SELECT id, tenant_id, user_id, name, status
FROM public.employees
WHERE phone = (SELECT phone FROM sample_phone)
ORDER BY id
LIMIT 101;
```

Expected: the plans use `customers_phone_identity_login_idx` and `employees_phone_identity_login_idx` for representative data. Record actual planning/execution time and buffers in the handoff document.

- [ ] **Step 4: Start API only after static checks are green**

```bash
bun run api:dev
```

Expected: API starts on the configured development port with no import, migration, or route registration error.

- [ ] **Step 5: Run the environment-backed smoke**

```bash
bun --env-file=apps/api/.env apps/api/src/scripts/phone-identity-login-smoke.ts
```

Expected: the script reports PASS for zero, single customer, single employee, single partner, multiple identity, disabled-only, rebind, share attribution, token tamper, expiry, same-candidate retry, and different-candidate consumed cases.

- [ ] **Step 6: Write the final backend handoff**

Create `docs/application_integration_documentation/2026-07-15-unified-phone-identity-login-backend.md` containing:

- final endpoint paths and exact schema;
- `login_identity` scene;
- visitor/auth/partner allowlist and excluded token types;
- 300-second token, SHA-256 storage, bound fields, state machine, and idempotency;
- candidate rules and current partner-phone uniqueness;
- verified visitor `sub` behavior while response `user_id` remains null;
- share attribution keys and guarantee that `platform_leads.tenant_id` remains null;
- final stable error table;
- migration Local/Remote result;
- 24-hour session retention, the bounded cleanup RPC, its non-production run result, and the production scheduler/operations owner;
- focused/full test command counts;
- execution plan evidence;
- masked test phone matrix;
- deployment environment, backend commit, and Orange files owned by the mini-program team.

- [ ] **Step 7: Commit smoke and handoff evidence**

```bash
git add apps/api/src/scripts/phone-identity-login-smoke.ts \
  docs/application_integration_documentation/2026-07-15-unified-phone-identity-login-backend.md
git commit -m "docs(auth): deliver unified phone login handoff"
```

## Task 13: Final Regression And Release Gate

**Files:**
- Verify only; modify files only to fix a reproduced failure inside this feature scope.

- [ ] **Step 1: Run the complete repository verification gate**

```bash
bun run api:check
bun test apps/api/src
bun run check:permission-boundaries
bun run audit:supabase-writes
```

Expected: all commands exit 0. Record exact test totals and any pre-existing warnings.

- [ ] **Step 2: Verify migration state one final time**

```bash
supabase migration list
```

Expected: Local and Remote are aligned through `20260715100000`.

- [ ] **Step 3: Review scope and compatibility**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
rg -n "create_customer_if_missing|bind_customer_from_tenant_share" \
  apps/api/src/services/phone-identity-login apps/api/src/repositories/phone-identity-login.ts
```

Expected:

- only files listed in this plan plus compiler-required nearby tests changed;
- unified login code contains no `create_customer_if_missing`;
- unified login code does not call `bind_customer_from_tenant_share`;
- Orange has not been modified;
- old routes remain registered.

- [ ] **Step 4: Review secrets and logging**

```bash
rg -n "console\.log|request\.log.*(code|phone|selection_token|openid)|JWT_SECRET|SERVICE_ROLE_KEY" \
  apps/api/src/services/phone-identity-login \
  apps/api/src/repositories/phone-identity-login.ts \
  apps/api/src/scripts/phone-identity-login-smoke.ts
```

Expected: no secret, raw code, raw phone, raw selection token, JWT, or openid logging. Environment variable names may appear only in the smoke script configuration loader.

- [ ] **Step 5: Prepare the integration commit identifier**

```bash
git log --oneline --decorate main..HEAD
git status --short
```

Expected: clean feature worktree and an ordered commit series matching Tasks 1-12. Report the final commit to the Orange team; do not push or merge unless explicitly requested.

## Spec Coverage Checklist

- Three unified endpoints: Tasks 1, 7, 9.
- Zero/single/multiple identity state machine: Tasks 5, 7, 8.
- Database-backed opaque selection token: Tasks 2, 3, 8.
- SMS single consumption and rate limiting: Tasks 1, 2, 7.
- Customer, employee, and partner candidates: Tasks 4-6.
- Multi-tenant customer and employee identities: Tasks 4, 5, 12.
- Single rebind and two separate rebind systems: Tasks 5, 6, 7.
- Verified visitor without customer/lead creation: Tasks 7, 10, 12.
- Platform lead phone equality and share attribution: Task 10.
- No share-triggered customer creation: Tasks 4, 7, 13.
- Auth route/token isolation: Task 9.
- Stable errors and response modes: Tasks 1, 6-10.
- Bounded queries and execution plans: Tasks 2, 4, 5, 12.
- Migration-only database change and alignment: Tasks 2, 11, 13.
- Old-client compatibility and additive rollback: Tasks 6, 9, 13.
- Final OpenAPI-style handoff and test matrix: Task 12.
