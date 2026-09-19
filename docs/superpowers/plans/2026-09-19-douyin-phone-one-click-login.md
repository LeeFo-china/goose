# Douyin Phone One-Click Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Douyin phone authorization into a complete customer-account login flow while removing phone authorization from free-measurement form filling.

**Architecture:** Keep the official `getPhoneNumber` exchange in `DouyinCustomerAuthService`, but return a restricted Douyin visitor session when a verified phone has no customer match. Persist the discriminated customer/visitor mode in the mini-program, keep visitor sessions away from customer APIs, and force free-measurement capture to the existing SMS path through code, admin UI, and a reversible migration.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase/PostgreSQL migrations, Douyin Mini Program TTML/TTSS.

---

### Task 1: Add a restricted Douyin visitor-session token

**Files:**
- Modify: `apps/api/src/utils/jwt.ts`
- Modify: `apps/api/src/utils/jwt-douyin-miniapp.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts`

- [ ] **Step 1: Write failing JWT tests**

Add tests that call a new `signDouyinVisitorSessionToken` with a complete actor and verified phone, then assert the decoded payload contains only the intended visitor identity:

```ts
const token = signDouyinVisitorSessionToken({
  userId: USER_ID,
  tenantId: TENANT_ID,
  installationId: INSTALLATION_ID,
  appId: "tt-authorizer-1",
  subjectHash: "a".repeat(64),
  verifiedPhone: "13800138000",
});
expect(verifyToken(token)).toMatchObject({
  sub: USER_ID,
  token_type: "visitor_session",
  login_channel: "douyin",
  roles: ["visitor"],
  tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID,
  douyin_app_id: "tt-authorizer-1",
  subject_hash: "a".repeat(64),
  openid: "a".repeat(64),
  visitor_id: USER_ID,
  verified_phone: "13800138000",
});
```

Add table cases that mutate each required Douyin visitor claim and expect `verifyTokenDetailed` to return `invalid`. Add an auth-plugin test proving the token is rejected from customer self-service routes rather than reaching customer-binding assertions.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
cd apps/api
bun test src/utils/jwt-douyin-miniapp.test.ts src/plugins/auth/legacy-plugin-douyin.test.ts
```

Expected: FAIL because `signDouyinVisitorSessionToken` and strict Douyin visitor validation do not exist.

- [ ] **Step 3: Implement the signer and validator**

Add a focused input type and signer without changing the existing WeChat signer:

```ts
export type DouyinVisitorSessionTokenInput = {
  userId: string;
  tenantId: string;
  installationId: string;
  appId: string;
  subjectHash: string;
  verifiedPhone: string;
};

export function signDouyinVisitorSessionToken(
  input: DouyinVisitorSessionTokenInput,
) {
  return signJwtPayload({
    sub: input.userId,
    token_type: "visitor_session",
    login_channel: "douyin",
    roles: ["visitor"],
    tenant_id: input.tenantId,
    douyin_installation_id: input.installationId,
    douyin_app_id: input.appId,
    subject_hash: input.subjectHash,
    openid: input.subjectHash,
    visitor_id: input.userId,
    verified_phone: input.verifiedPhone,
  }, process.env.VISITOR_SESSION_JWT_EXPIRES_IN || "2h");
}
```

In `verifyTokenDetailed`, route `visitor_session + login_channel=douyin` through a validator that requires UUID user/tenant/installation identifiers, the 64-character subject hash, matching `openid`, one `visitor` role, non-empty App ID, and a mainland mobile number. Keep the existing WeChat visitor rule unchanged.

- [ ] **Step 4: Re-run the tests**

Run the command from Step 2. Expected: all focused JWT/auth-plugin tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/jwt.ts apps/api/src/utils/jwt-douyin-miniapp.test.ts apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts
git commit -m "feat(douyin): add restricted visitor login token"
```

### Task 2: Close the zero-customer backend login path

**Files:**
- Modify: `apps/api/src/services/douyin-miniapp/customer-auth-ports.ts`
- Modify: `apps/api/src/services/douyin-miniapp/customer-auth.ts`
- Modify: `apps/api/src/services/douyin-miniapp/customer-auth.test.ts`

- [ ] **Step 1: Write failing service tests**

Replace the existing zero-candidate `CUSTOMER_CONTEXT_MISSING` expectation with two explicit cases:

```ts
test("authorized phone without a customer returns an authenticated visitor", async () => {
  const visitorTokenSigner = mock(() => "douyin-visitor-token");
  const syncOauthIdentityBestEffort = mock(async () => undefined);
  const service = makeService({
    visitorTokenSigner,
    candidateRepository: {
      ...baseCandidateRepository(),
      listCustomersByPhone: mock(async () => []),
    },
    userIdentities: {
      ...baseUserIdentities(),
      syncOauthIdentityBestEffort,
    },
  });

  await expect(service.authorizePhone({
    request: { user: douyinUser, id: "req-no-project", log: testLog() },
    input: { douyin_phone_code: "official-phone-code" },
  })).resolves.toMatchObject({
    status: "authenticated",
    auth: {
      token: "douyin-visitor-token",
      mode: "platform_visitor",
      has_customer_profile: false,
      roles: ["visitor"],
      phone_masked: "138****8000",
      tenant: null,
      customer: null,
    },
  });
});
```

Add the equivalent `verifySms` test. Both tests must assert that the resolved local user is synchronized with the `douyin_mini` OAuth identity and that no customer binding or customer token signer runs. Preserve the single- and multi-candidate tests.

- [ ] **Step 2: Run the service test and confirm failure**

Run:

```bash
cd apps/api
bun test src/services/douyin-miniapp/customer-auth.test.ts
```

Expected: FAIL because zero candidates still throw `CUSTOMER_CONTEXT_MISSING`.

- [ ] **Step 3: Add a separate visitor signer dependency**

Extend `DouyinCustomerAuthDependencies` with:

```ts
visitorTokenSigner?: (input: DouyinVisitorSessionTokenInput) => string;
```

Default it to `signDouyinVisitorSessionToken` in the service constructor. Do not overload the existing customer `TokenSigner` because the payloads have different security boundaries.

- [ ] **Step 4: Implement the zero-candidate result**

Replace the zero-candidate throw with a private `buildVerifiedVisitorAuth` flow:

```ts
const authUserId = existing?.authUserId ??
  await this.resolveAuthUserId(actor, null);
await this.dependencies.userIdentities.syncOauthIdentityBestEffort({
  userId: authUserId,
  platform: "douyin_mini",
  openid: actor.subjectHash,
  unionid: null,
  source: "douyin_customer_auth",
});
return {
  status: "authenticated" as const,
  auth: {
    token: this.visitorTokenSigner({
      userId: authUserId,
      tenantId: actor.tenantId,
      installationId: actor.installationId,
      appId: actor.appId,
      subjectHash: actor.subjectHash,
      verifiedPhone: phone,
    }),
    user_id: authUserId,
    visitor_id: authUserId,
    roles: ["visitor"] as ["visitor"],
    mode: "platform_visitor" as const,
    authMode: "platform_visitor" as const,
    verified_phone: phone,
    phone_masked: maskPhone(phone),
    has_customer_profile: false as const,
    tenant: null,
    customer: null,
  },
};
```

Do not query again, create a CRM customer, or loosen candidate filters.

- [ ] **Step 5: Re-run the service tests and API typecheck**

Run:

```bash
cd apps/api
bun test src/services/douyin-miniapp/customer-auth.test.ts
bun run typecheck
```

Expected: tests and typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/douyin-miniapp/customer-auth-ports.ts apps/api/src/services/douyin-miniapp/customer-auth.ts apps/api/src/services/douyin-miniapp/customer-auth.test.ts
git commit -m "fix(douyin): complete phone login without project"
```

### Task 3: Persist customer versus visitor login state

**Files:**
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/state/customer-session.ts`
- Modify: `apps/douyin-mini/src/state/customer-session.test.ts`
- Modify: `apps/douyin-mini/src/platform/storage.ts`
- Modify: `apps/douyin-mini/src/pages/home/page.ts`
- Modify: `apps/douyin-mini/src/pages/home/material-controller.test.ts`

- [ ] **Step 1: Write failing model/session/navigation tests**

Add a visitor branch to the auth-result fixture and test:

```ts
manager.acceptAuth({
  token: "visitor-token",
  mode: "platform_visitor",
  phoneMasked: "138****8000",
});
expect(manager.isAuthenticated()).toBe(true);
expect(manager.hasCustomerProfile()).toBe(false);
expect(manager.getAuthState()).toEqual({
  mode: "platform_visitor",
  phoneMasked: "138****8000",
});
```

Add migration coverage proving a stored legacy session without `mode` is treated as `customer`. Update the home-page test so an authenticated visitor navigates to `pages/customer-login/index`, while a customer navigates to `pages/customer-projects/index`.

- [ ] **Step 2: Run focused mini-program tests and confirm failure**

Run:

```bash
cd apps/douyin-mini
bun test src/state/customer-session.test.ts src/pages/home/material-controller.test.ts
```

Expected: FAIL because session mode APIs do not exist.

- [ ] **Step 3: Extend the stored session and auth union**

Define:

```ts
export type CustomerAuthResult =
  | CustomerProfileAuthResult
  | {
      token: string;
      user_id: string;
      visitor_id: string;
      mode: "platform_visitor";
      authMode?: "platform_visitor";
      roles: ["visitor"];
      verified_phone: string;
      phone_masked: string;
      has_customer_profile: false;
      tenant: null;
      customer: null;
    };

export type StoredSession = {
  accessToken: string;
  expiresAt: number;
  mode?: "customer" | "platform_visitor";
  phoneMasked?: string;
};
```

Keep `mode` optional only for legacy storage compatibility.

- [ ] **Step 4: Implement session mode methods and guarded home navigation**

`CustomerSessionManager.acceptAuth` accepts `mode` and `phoneMasked`. Add:

```ts
getAuthState() {
  const session = this.getUsableSession();
  return session
    ? { mode: session.mode ?? "customer", phoneMasked: session.phoneMasked ?? "" }
    : null;
}

hasCustomerProfile() {
  return this.getAuthState()?.mode === "customer";
}
```

Use `hasCustomerProfile()` in `onMyProjects`. Keep `isAuthenticated()` true for either valid mode.

- [ ] **Step 5: Re-run focused tests and typecheck**

Run:

```bash
cd apps/douyin-mini
bun test src/state/customer-session.test.ts src/pages/home/material-controller.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/state/customer-session.ts apps/douyin-mini/src/state/customer-session.test.ts apps/douyin-mini/src/platform/storage.ts apps/douyin-mini/src/pages/home/page.ts apps/douyin-mini/src/pages/home/material-controller.test.ts
git commit -m "feat(douyin): persist visitor login mode"
```

### Task 4: Finish the customer login and logout UX

**Files:**
- Modify: `apps/douyin-mini/src/components/privacy-consent/index.ts`
- Modify: `apps/douyin-mini/src/components/privacy-consent/index.ttml`
- Modify: `apps/douyin-mini/src/pages/customer-login/index.json`
- Modify: `apps/douyin-mini/src/pages/customer-login/index.ttml`
- Modify: `apps/douyin-mini/src/pages/customer-login/index.ttss`
- Modify: `apps/douyin-mini/src/pages/customer-login/page.ts`
- Modify: `apps/douyin-mini/src/pages/customer-login/page.test.ts`
- Modify: `apps/douyin-mini/src/pages/customer-projects/index.ttml`
- Modify: `apps/douyin-mini/src/pages/customer-projects/index.ttss`
- Modify: `apps/douyin-mini/src/pages/customer-projects/page.ts`
- Modify or create: `apps/douyin-mini/src/pages/customer-projects/page.test.ts`

- [ ] **Step 1: Write failing login-page tests**

Cover these observable behaviors:

```ts
expect(page.data.consented).toBe(false);
page.onDouyinPhone(phoneCallback("code-before-consent"));
expect(authorizeDouyinCustomerPhone).not.toHaveBeenCalled();
expect(page.data.consentError).toBe("请先阅读并同意隐私政策与用户协议");

authorizeDouyinCustomerPhone.mockResolvedValue(visitorAuthResult);
page.onConsentChange({ detail: { checked: true } });
await page.onDouyinPhone(phoneCallback("official-code"));
expect(acceptAuth).toHaveBeenCalledWith({
  token: "visitor-token",
  mode: "platform_visitor",
  phoneMasked: "138****8000",
});
expect(navigateToPage).not.toHaveBeenCalledWith("pages/customer-projects/index");
expect(page.data.authenticatedVisitor).toBe(true);
```

Also test that SMS send/verify require consent, a customer result still navigates, reload restores a visitor empty state, “申请免费量房” navigates to the lead page, and logout clears the session and returns to the login form.

- [ ] **Step 2: Write failing project-page tests**

Assert that `onLoad` redirects a visitor to the login page before `fetchCustomerProjects` runs, and that `onLogout` clears the session and navigates to the login page.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
cd apps/douyin-mini
bun test src/pages/customer-login/page.test.ts src/pages/customer-projects/page.test.ts
```

Expected: FAIL for missing consent, visitor empty state, mode guard, and logout.

- [ ] **Step 4: Reuse privacy consent with a login scene**

Add a typed `scene` property with default `lead`. Render:

```xml
<view class="consent-copy">
  我已阅读并同意由 {{companyName}} 按照
  <text class="policy-link" style="color: {{primaryColor}}" catchtap="onOpenPolicy">《隐私政策与用户协议》</text>
  {{scene === 'customer_login' ? '处理本次账号登录信息。' : '处理本次咨询信息。'}}
</view>
```

Register the existing component in the customer-login page JSON and navigate policy clicks to `pages/privacy/index`.

- [ ] **Step 5: Implement login state transitions**

Add `consented`, `consentError`, `authenticatedVisitor`, and `phoneMasked` page state. Before phone authorization, SMS sending, or SMS verification, call a shared guard:

```ts
requireConsent() {
  if (this.data.consented) return true;
  this.setData({ consentError: "请先阅读并同意隐私政策与用户协议" });
  return false;
}
```

In `runAuth`, persist the discriminated mode. Navigate only for `customer`; for `platform_visitor` remain on the page and show:

- title: “登录成功”
- description: “当前手机号暂未关联装修项目”
- masked phone
- actions: “申请免费量房” and “退出登录”

Add loading text “正在登录” to the primary button. Keep rejection and platform errors distinct from successful no-project state.

- [ ] **Step 6: Guard projects and add logout**

Before loading projects:

```ts
if (!dependencies.getApp().customerSession.hasCustomerProfile()) {
  await dependencies.navigateToPage("pages/customer-login/index");
  return;
}
```

Add a visible “退出登录” button. Its handler clears the session and navigates to the login page.

- [ ] **Step 7: Re-run tests and typecheck**

Run:

```bash
cd apps/douyin-mini
bun test src/pages/customer-login/page.test.ts src/pages/customer-projects/page.test.ts src/state/customer-session.test.ts src/pages/home/material-controller.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/douyin-mini/src/components/privacy-consent apps/douyin-mini/src/pages/customer-login apps/douyin-mini/src/pages/customer-projects
git commit -m "feat(douyin): complete phone login experience"
```

### Task 5: Remove Douyin phone authorization from free measurement

**Files:**
- Modify: `apps/douyin-mini/src/components/lead-form/index.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttml`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttss`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttml`
- Modify: `apps/douyin-mini/src/pages/lead/lead-page.ts`
- Modify: `apps/douyin-mini/src/pages/lead/lead-page.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/lead/form-model.test.ts`

- [ ] **Step 1: Write failing lead tests**

Change fixtures with `douyin_phone: true` to prove the UI still behaves as SMS-only. Assert the page model no longer exposes `douyinPhoneEnabled`/`douyinPhoneAuthorized`, submissions always use:

```ts
verification_method: "sms",
sms_code: "123456",
```

and the TTML contains no `open-type="getPhoneNumber"` or `binddouyinphone`.

- [ ] **Step 2: Run focused tests and static scan**

Run:

```bash
cd apps/douyin-mini
bun test src/pages/lead/lead-page.test.ts src/pages/lead/form-model.test.ts
rg -n 'getPhoneNumber|binddouyinphone|douyinPhone' src/pages/lead src/components/lead-form
```

Expected: tests or assertions FAIL and the scan finds the old authorization path.

- [ ] **Step 3: Delete the lead-only authorization state and event path**

Remove `DOUYIN_PHONE_AUTHORIZATION_TTL_MS`, `douyinPhoneAuthorization`, related data properties, `onDouyinPhoneNumber`, and all submission branching based on a Douyin phone code. Keep SMS cooldown, editable phone, privacy consent, idempotency, and attribution unchanged.

Pass no Douyin-phone properties/events from `pages/lead/index.ttml`. In the form component always render the editable phone field and the SMS verification row.

- [ ] **Step 4: Re-run tests, scan, and typecheck**

Run:

```bash
cd apps/douyin-mini
bun test src/pages/lead/lead-page.test.ts src/pages/lead/form-model.test.ts
! rg -n 'getPhoneNumber|binddouyinphone|douyinPhone' src/pages/lead src/components/lead-form
bun run typecheck
```

Expected: tests PASS, scan exits successfully with no matches, typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/douyin-mini/src/components/lead-form apps/douyin-mini/src/pages/lead
git commit -m "fix(douyin): keep free measurement on sms"
```

### Task 6: Lock lead capture to SMS in backend, admin, and migration

**Files:**
- Create: `supabase/migrations/20260919160000_disable_douyin_lead_phone_capture.sql`
- Create: `apps/api/src/services/tenant-douyin-miniapp/disable-lead-phone-migration-contract.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/bootstrap-feature-contract.ts`
- Modify: `apps/api/src/services/douyin-miniapp/bootstrap-feature-contract.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/authorization.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx`

- [ ] **Step 1: Write failing migration and service contract tests**

Require the migration to:

- update every installation while preserving unrelated feature keys;
- set `douyin_phone=false` and `phone_capture_mode=sms`;
- replace `update_douyin_miniapp_lead_capture_config` with a signature-compatible function that rejects `p_enabled=true` using a structured `DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE` error;
- keep `service_role` as the only executable role;
- include lock and statement timeouts and rollback guidance comments.

Update bootstrap tests so both `legacy_0_1_10` and `runtime` contracts return SMS mode without mutating their input. Add a service test that rejects attempts to enable Douyin phone capture through `Errors.business`.

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
cd apps/api
bun test src/services/tenant-douyin-miniapp/disable-lead-phone-migration-contract.test.ts src/services/douyin-miniapp/bootstrap-feature-contract.test.ts src/services/tenant-douyin-miniapp/authorization.test.ts
```

Expected: FAIL because runtime still passes through Douyin phone mode and no migration exists.

- [ ] **Step 3: Add the migration**

Use `jsonb_set` to preserve unrelated runtime configuration:

```sql
UPDATE public.douyin_miniapp_installations AS installation
SET runtime_config = jsonb_set(
  jsonb_set(installation.runtime_config, '{features,douyin_phone}', 'false'::jsonb, true),
  '{features,phone_capture_mode}',
  '"sms"'::jsonb,
  true
),
updated_at = GREATEST(clock_timestamp(), installation.updated_at + interval '1 microsecond')
WHERE installation.runtime_config #>> '{features,douyin_phone}' IS DISTINCT FROM 'false'
   OR installation.runtime_config #>> '{features,phone_capture_mode}' IS DISTINCT FROM 'sms';
```

Replace the existing five-argument RPC in the same transaction. For `p_enabled=true` return:

```sql
jsonb_build_object('error', jsonb_build_object(
  'status_code', 409,
  'code', 'DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE'
))
```

For `p_enabled=false` retain optimistic `updated_at` handling and return an idempotent disabled result.

- [ ] **Step 4: Harden runtime bootstrap and service behavior**

Make `bootstrapFeatures` always return a copy with SMS phone fields:

```ts
export function bootstrapFeatures(
  features: DouyinRuntimeConfig["features"],
  _contract: DouyinBootstrapFeatureContract,
): DouyinRuntimeConfig["features"] {
  return { ...features, douyin_phone: false, phone_capture_mode: "sms" };
}
```

Reject `enabled=true` in the service before the repository call with `Errors.business` and `DOUYIN_LEAD_PHONE_MODE_UNAVAILABLE`. Add the error code to the existing error-code registry if absent.

- [ ] **Step 5: Replace the admin toggle with an informational SMS-only state**

Remove the switch, save request, pending state, and response parser. Render:

```tsx
<section aria-labelledby="douyin-lead-capture-heading">
  <div className="flex flex-wrap items-center gap-2">
    <h2 id="douyin-lead-capture-heading" className="text-sm font-semibold">手机号留资</h2>
    <Badge variant="secondary">短信验证码模式</Badge>
  </div>
  <p className="mt-2 text-xs text-muted-foreground">
    免费量房由用户填写手机号并完成短信验证；抖音手机号快捷登录仅用于客户账号登录。
  </p>
</section>
```

Update the component test to assert no switch or save button is rendered.

- [ ] **Step 6: Run API/admin checks**

Run:

```bash
cd apps/api
bun test src/services/tenant-douyin-miniapp/disable-lead-phone-migration-contract.test.ts src/services/douyin-miniapp/bootstrap-feature-contract.test.ts src/services/tenant-douyin-miniapp/authorization.test.ts
bun run typecheck
cd ../admin
env -u NO_COLOR bun test components/douyin-miniapp/workspace-lead-capture-config.test.tsx
pnpm run typecheck
```

Expected: the focused Bun test and both package typechecks PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260919160000_disable_douyin_lead_phone_capture.sql apps/api/src/services apps/api/src/errors apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx
git commit -m "fix(douyin): restrict lead capture to sms"
```

### Task 7: Complete cross-layer verification and prepare 0.1.40

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-douyin-phone-one-click-login.md`

- [ ] **Step 1: Run focused regression suites**

```bash
cd apps/api
bun test src/utils/jwt-douyin-miniapp.test.ts src/plugins/auth/legacy-plugin-douyin.test.ts src/services/douyin-miniapp/customer-auth.test.ts src/services/douyin-miniapp/bootstrap-feature-contract.test.ts src/services/tenant-douyin-miniapp/authorization.test.ts src/services/tenant-douyin-miniapp/disable-lead-phone-migration-contract.test.ts
cd ../douyin-mini
bun test src/state/customer-session.test.ts src/pages/home/material-controller.test.ts src/pages/customer-login/page.test.ts src/pages/customer-projects/page.test.ts src/pages/lead/lead-page.test.ts src/pages/lead/form-model.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run package checks**

```bash
cd /Users/leefo/Public/work/gooes
bun run api:check
bun run douyin-mini:check
pnpm --dir apps/admin check
```

Expected: typechecks, builds, tests, and file-size guards PASS.

- [ ] **Step 3: Validate migration without changing production**

Run `supabase migration list` with the repository's configured project context and verify the new migration is Local-only before deployment. If the local Supabase database is available, execute the migration inside a transaction and roll it back after contract validation. Do not run production DDL manually.

- [ ] **Step 4: Perform static release scans**

```bash
! rg -n 'getPhoneNumber|binddouyinphone|douyinPhone' apps/douyin-mini/src/pages/lead apps/douyin-mini/src/components/lead-form
rg -n 'open-type="getPhoneNumber"' apps/douyin-mini/src/pages/customer-login/index.ttml
! rg -n 'AI.*效果图|生成.*效果图|装修生图' apps/douyin-mini/src
git diff --check
git status --short
```

Expected: no lead-page phone authorization, exactly one customer-login authorization entry, no AI rendering UI, and no whitespace errors.

- [ ] **Step 5: Review security and repository boundaries**

Inspect the final diff and confirm:

- no edits under `/Users/leefo/Public/work/orange`;
- no raw phone, phone-code, token, or key logging;
- visitor sessions cannot reach customer project routes;
- all errors use the error factory;
- the migration preserves unrelated JSON keys and documents rollback;
- no dependency was added;
- no unrelated refactor was introduced.

- [ ] **Step 6: Commit plan verification and report deployment order**

Update this file with commands and exact results, then:

```bash
git add docs/superpowers/plans/2026-09-19-douyin-phone-one-click-login.md
git commit -m "docs(douyin): record phone login verification"
```

The release report must state: deploy API, apply the tracked production migration, verify bootstrap SMS mode, build/upload template `0.1.40`, generate an experience version, run two real-device login cases, then submit review.
