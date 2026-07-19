# Douyin Decoration Marketing Miniapp Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first reusable native Douyin miniapp template for decoration companies, with service-provider authorization, strict tenant resolution, public case/site content, SMS lead capture into the tenant's `marketing_leads`, attribution, and a controlled template release path.

**Architecture:** A native TypeScript + TTML/TTSS client lives in `apps/douyin-mini`. Gooes API resolves the tenant only from the authorized miniapp AppID plus server-owned installation data, exchanges `tt.login` codes through Douyin's V2 service-provider APIs, and signs a short Gooes session. Controllers remain HTTP-only, services orchestrate tenant-safe behavior, repositories own Supabase access, and gateways own Douyin OpenAPI calls. Database state, indexes, RLS, permissions, token-refresh leases, idempotent lead submission, and release records are migration-managed.

**Tech Stack:** Bun, TypeScript, Fastify 5, Zod 4, Supabase/PostgreSQL, Node/Bun `crypto`, native Douyin miniapp TypeScript + TTML + TTSS, `@douyin-microapp/typings`, Douyin service-provider V2 OpenAPI.

---

## Execution Context

- Repository: `/Users/leefo/Public/work/gooes`
- Starting HEAD: `0af82f40` (`docs(douyin): 设计装修营销小程序模板`)
- Approved design: `docs/superpowers/specs/2026-07-19-douyin-decoration-marketing-miniapp-template-design.md`
- Miniapp location: `apps/douyin-mini`
- Backend location: `apps/api`
- Database changes: `supabase/migrations/` only
- `/Users/leefo/Public/work/orange` is read-only reference material. Do not modify it, run generators or formatters in it, or perform Git operations there.
- The existing worktree contains unrelated user changes. Stage only the paths named in each task.
- Do not push, deploy, upload a template, call a live merchant release API, or apply migrations to a remote database without a fresh explicit authorization at the corresponding gate.
- Use Bun for repository commands. Do not add a runtime framework such as Taro, React, Vue, or uni-app.
- After each task: inspect `git diff -- <task paths>`, run the named focused verification, run `git diff --check`, and commit only that task.
- File-set notation is exact: `path/index.{ts,json,ttml,ttss}` means the four files `index.ts`, `index.json`, `index.ttml`, and `index.ttss`; `component/*` means those same four `index` files inside that named component directory.

## Verified External Contracts

Implementation must use these exact, currently verified contracts rather than inferred SDK names:

- Component access token V2: `GET https://open.douyin.com/openapi/v2/auth/tp/token/` with `component_appid`, `component_appsecret`, and `component_ticket` query parameters.
- Authorizer token V2: `GET https://open.douyin.com/api/tpapp/v2/auth/get_auth_token/`; header `access-token`; grant type `app_to_tp_authorization_code` or `app_to_tp_refresh_token`.
- Miniapp login exchange V2: `POST https://open.douyin.com/api/apps/v1/microapp/code2session/`; header `access-token`; JSON body with `code` and `app_id`.
- Template-development login exchange: `POST https://developer.toutiao.com/api/apps/v2/jscode2session`; JSON body with the explicitly configured template-development `appid`, its backend-only `secret`, and `code`.
- Template upload V2: `POST https://open.douyin.com/api/apps/v1/package_version/upload/`; JSON body contains stringified `ext_json`, numeric `template_id`, `user_desc`, `user_version`, and optional `tag`.
- Test QR V2: `POST https://open.douyin.com/api/apps/v2/basic_info/get_qr_code/`; JSON body `{ "version": "latest", "path": "pages/home/index" }`.
- Audit V2: `POST https://open.douyin.com/api/apps/v2/package_version/audit/`; JSON body includes `host_names` and `audit_note`.
- Available audit hosts V2: `GET https://open.douyin.com/api/apps/v1/package_version/get_audit_hosts/`.
- Version list V2: `GET https://open.douyin.com/api/apps/v1/package_version/versions/`.
- Release V2: `POST https://open.douyin.com/api/apps/v1/package_version/release/`.
- Callback wrapper fields are `Nonce`, `TimeStamp`, `Encrypt`, and `MsgSignature`; successful handling returns the raw text `success`.
- Callback signature is lowercase SHA-1 over the lexicographically sorted concatenation of message token, timestamp, nonce, and encrypted payload.
- Callback AES key is `base64(message_key + "=")`; decrypt with AES-256-CBC using the first ciphertext block as IV, remove PKCS#7 padding, then parse `16 random bytes + 4-byte big-endian message length + JSON message + component AppID`.
- Component tickets arrive about every 10 minutes and are valid for 3 hours. Component and authorizer access tokens are short-lived; refresh at least five minutes before expiry.
- Native client APIs are `tt.getEnvInfoSync().microapp.appId`, `tt.getExtConfigSync().ext`, and `tt.login`.

Official references:

- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/encryption>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/component-access-token-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/authorizer-access-token-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/login/code2session-v2>
- <https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/basic-abilities/log-in/code-2-session>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/upload-code-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/base-info/qrcode-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/audit-code-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/audit-hosts-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/versions-v2>
- <https://partner.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/auth-app-manage/develop/release-v2>

## Fixed Internal Contracts

### Session identity

The client may send `app_id`, `deployment_key`, a one-time login `code`, and a bounded launch context. It never sends `tenant_id`, installation ID, or an OpenID. The signed server session contains:

```ts
export type DouyinMiniappTokenPayload = JwtPayload & {
  token_type: "douyin_miniapp";
  login_channel: "douyin";
  tenant_id: string;
  douyin_installation_id: string;
  douyin_app_id: string;
  subject_hash: string;
};
```

`subject_hash` is an HMAC-SHA-256 digest over `authorizer_appid + ":" + open_id`, or the anonymous OpenID when the normal OpenID is absent. Its secret is `DOUYIN_SUBJECT_HASH_KEY`. Raw OpenID and `session_key` never enter the JWT, response, `marketing_leads`, ordinary logs, or analytics payloads.

### Installation lifecycle

```text
AUTHORIZED callback -> authorized_unbound -> platform binding -> active
active -> platform disable -> disabled
active/disabled -> UNAUTHORIZED callback -> revoked
UPDATE_AUTHORIZED callback -> exchange new credentials -> retain binding/status
```

Only `active` installations bound to an active tenant can issue sessions. A `template_development` installation may omit `deployment_key`; a `merchant` installation must match it exactly. The development AppID must be explicitly recorded and must never fall back to another tenant.

Merchant login uses the installation's authorizer token and service-provider code2session V2. Template-development login is the only branch that uses ordinary code2Session and `DOUYIN_TEMPLATE_APP_SECRET`; it is allowed only when the request AppID exactly equals `DOUYIN_TEMPLATE_APP_ID` and an active `template_development` installation exists. Merchant login must never fall back to that secret.

### Content classification

- Cases: tenant-owned public projects whose status is `acceptance`.
- Sites: tenant-owned public projects whose status is `started` or `constructing`.
- A forced-public visibility flag never changes a project's case/site classification.
- Lists select only public fields and use `.range()`; detail routes select only the requested project and bounded log/photo data.
- Never reuse the current public-project serializer because it selects customer and address data not permitted in this miniapp.

### Runtime configuration

`douyin_miniapp_installations.runtime_config` is a JSON object validated at every write and read with this shape:

```ts
export const DouyinRuntimeConfigSchema = z.object({
  brand: z.object({
    logo_url: z.url({ protocol: /^https$/ }).nullable(),
    qualifications: z.array(z.object({
      title: z.string().min(1).max(40),
      image_url: z.url({ protocol: /^https$/ }).nullable(),
    }).strict()).max(12),
  }).strict(),
  theme: z.object({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    navigation_text_color: z.enum(["black", "white"]),
  }).strict(),
  features: z.object({
    cases: z.boolean(),
    sites: z.boolean(),
    sms_lead: z.boolean(),
    douyin_phone: z.literal(false),
    phone_capture_mode: z.literal("sms"),
  }).strict(),
  home_banners: z.array(z.object({
    image_url: z.url({ protocol: /^https$/ }),
    title: z.string().max(40),
    subtitle: z.string().max(80),
  }).strict()).max(5),
  trust_metrics: z.array(z.object({
    label: z.string().max(16),
    value: z.string().max(16),
  }).strict()).max(4),
  privacy_policy_version: z.string().min(1).max(40),
}).strict();
```

### Pagination and request bounds

- All returned lists default to `page=1&pageSize=20`; maximum `pageSize=100`.
- Home bootstrap uses fixed limits of 6 cases and 6 sites.
- Site detail returns project logs with the same pagination contract.
- Analytics accepts 1 to 20 events per request and each event payload is at most 2 KB after JSON serialization.
- HTTP gateway timeout is 10 seconds. A single expired-token response may trigger one refresh and one replay; never loop.

### Int64 template identifiers

Douyin template IDs can exceed JavaScript's safe-integer range. Keep `template_id` as a validated decimal string in TypeScript and PostgreSQL `text` with a digits-only check. The upload gateway must serialize that validated string as an unquoted JSON integer literal; never convert it to `number`. Gateway tests use `9133504853504535288` and assert the exact digits reach the request body.

## Dependency Map

```text
Tasks 1-6: service-provider authorization and installation truth
        |
        v
Tasks 7-8: session, tenant-safe bootstrap, public content API
        |
        v
Tasks 9-12: native miniapp shell and content experience
        |
        v
Tasks 13-15: SMS lead capture and analytics
        |
        v
Tasks 16-18: release operations, full verification, controlled rollout
```

---

## Phase A — Service-provider authorization foundation

### Task 1: Add shared Douyin domain contracts and platform permission

**Files:**

- Create: `packages/domain/src/douyin-miniapp.ts`
- Create: `packages/domain/src/douyin-miniapp.test.ts`
- Modify: `packages/domain/src/auth.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Assert these stable values and configuration entries:

```ts
expect(DOUYIN_INSTALLATION_STATUS_VALUES).toEqual([
  "authorized_unbound",
  "active",
  "disabled",
  "revoked",
]);
expect(DOUYIN_INSTALLATION_KIND_VALUES).toEqual([
  "merchant",
  "template_development",
]);
expect(DOUYIN_MARKETING_EVENT_VALUES).toContain("lead_submit_success");
expect(SMS_SCENE_VALUES).toContain("douyin_lead");
expect(PERMISSION_CODE_VALUES).toContain("platform.douyin_miniapp.manage");
```

- [ ] **Step 2: Confirm RED**

```bash
bun test packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts
```

Expected: FAIL because the Douyin exports and permission do not exist.

- [ ] **Step 3: Implement the domain constants**

Export literal tuples and their derived union types for installation kind/status, release status, marketing event name, phone capture mode, and the runtime-config DTO. Add `douyin_lead` to `SMS_SCENE_VALUES`. Add this exact permission configuration:

```ts
"platform.douyin_miniapp.manage": {
  module: "platform",
  resource: "douyin_miniapp",
  action: "manage",
},
```

Do not place credentials, OpenAPI response types, or Supabase row types in the shared domain package.

- [ ] **Step 4: Verify GREEN**

```bash
bun test packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts
bunx tsc -p packages/domain/tsconfig.json --noEmit
git diff --check
```

Expected: tests and typecheck pass; diff-check is silent.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/domain/src/douyin-miniapp.ts \
  packages/domain/src/douyin-miniapp.test.ts \
  packages/domain/src/auth.ts \
  packages/domain/src/permission.ts \
  packages/domain/src/permission.test.ts \
  packages/domain/src/index.ts
git commit -m "feat(douyin): 定义小程序领域契约"
```

---

### Task 2: Create installation and token-state schema with refresh leases

**Files:**

- Create: `supabase/migrations/20260719100000_create_douyin_miniapp_foundation.sql`
- Create: `apps/api/src/services/douyin-miniapp/foundation-migration-contract.test.ts`
- Modify after local generation: `apps/api/src/types/database.ts`
- Create: `apps/api/src/types/database-douyin-miniapp-contract.test.ts`

- [ ] **Step 1: Write the failing SQL contract test**

The test must read the migration and assert all of the following:

```ts
expect(sql).toContain("CREATE TABLE public.douyin_third_party_components");
expect(sql).toContain("CREATE TABLE public.douyin_miniapp_installations");
expect(sql).toContain("UNIQUE (authorizer_appid)");
expect(sql).toContain("UNIQUE (deployment_key)");
expect(sql).toContain("runtime_config jsonb NOT NULL");
expect(sql).toContain("authorization_status text NOT NULL");
expect(sql).toContain("token_refresh_claim_token uuid");
expect(sql).toContain("SECURITY DEFINER");
expect(sql).toContain("SET search_path = pg_catalog, public");
expect(sql).toContain("platform.douyin_miniapp.manage");
```

Also assert that both tables enable RLS, revoke public/authenticated access, and grant the required table/RPC operations only to `service_role`.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/services/douyin-miniapp/foundation-migration-contract.test.ts
```

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Implement the foundation migration**

Create `douyin_third_party_components` with:

- `component_appid` primary key;
- component-ticket envelope columns and receipt time;
- component-access-token envelope columns and expiry;
- a refresh claim token and claim expiry;
- `active`/`disabled` status and timestamps.

Create `douyin_miniapp_installations` with:

- nullable `tenant_id` until binding, `component_appid`, unique `authorizer_appid`, nullable unique `deployment_key`;
- `installation_kind` and lifecycle status checks;
- separate ciphertext/IV/tag/key-version columns for authorizer access and refresh tokens;
- access/refresh expiry, permission snapshot JSON, refresh lease, last refresh error;
- `runtime_config` JSON object with the fixed default configuration;
- decimal-string template ID, template version, and last submit/audit/release timestamps;
- `revoked_at`, `created_at`, and `updated_at`.

Authorizer credential columns are nullable for `authorized_unbound`, `revoked`, and `template_development` rows. Add table checks so an active merchant has a tenant, deployment key, and complete refresh-token envelope, while a template-development row has no deployment key or authorizer credential envelope.

Create these indexes:

```sql
CREATE UNIQUE INDEX douyin_miniapp_installations_deployment_key_key
ON public.douyin_miniapp_installations(deployment_key)
WHERE deployment_key IS NOT NULL;

CREATE INDEX douyin_miniapp_installations_tenant_status_idx
ON public.douyin_miniapp_installations(tenant_id, authorization_status);

CREATE INDEX douyin_miniapp_installations_status_updated_idx
ON public.douyin_miniapp_installations(authorization_status, updated_at DESC);
```

Add atomic claim/complete RPC pairs for component-token and authorizer-token refresh. A claim succeeds only when the token is near expiry and the existing lease is absent/expired. Completion requires the matching claim token. Set a 30-second lease; store newly rotated refresh credentials in the same completion call.

Insert `platform.douyin_miniapp.manage` and grant it with `all` scope only to active platform/system administrator roles, following current permission migrations.

Rollback note in the migration comments: disable callbacks and session issuance first; then drop the refresh RPCs, installation table, component table, role permission, and permission row. Token loss requires merchant re-authorization.

- [ ] **Step 4: Run migration contract tests**

```bash
cd apps/api
bun test src/services/douyin-miniapp/foundation-migration-contract.test.ts
cd ../..
git diff --check
```

Expected: PASS and silent diff-check.

- [ ] **Step 5: Apply locally and regenerate database types**

First verify the local Supabase stack is available:

```bash
supabase status
```

If it is available:

```bash
supabase db reset
supabase gen types typescript --local > apps/api/src/types/database.ts
supabase migration list
```

Expected: reset succeeds and the Local migration column contains `20260719100000`. If local Supabase is unavailable, do not use a remote database as a substitute; record the unrun commands and continue only with SQL contract tests until the environment is restored.

- [ ] **Step 6: Add and run generated-type assertions**

The type test must compile representative `Tables`, `Inserts`, and `Updates` values for both new tables and access fields such as `runtime_config`, `authorization_status`, `access_token_key_version`, and `token_refresh_claim_token`.

```bash
cd apps/api
bun test src/types/database-douyin-miniapp-contract.test.ts
bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add supabase/migrations/20260719100000_create_douyin_miniapp_foundation.sql \
  apps/api/src/services/douyin-miniapp/foundation-migration-contract.test.ts \
  apps/api/src/types/database.ts \
  apps/api/src/types/database-douyin-miniapp-contract.test.ts
git commit -m "feat(douyin): 建立授权安装数据模型"
```

---

### Task 3: Implement credential envelopes and official callback crypto

**Files:**

- Create: `apps/api/src/services/douyin-miniapp/credential-envelope.ts`
- Create: `apps/api/src/services/douyin-miniapp/credential-envelope.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/callback-crypto.ts`
- Create: `apps/api/src/services/douyin-miniapp/callback-crypto.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/config.ts`
- Create: `apps/api/src/services/douyin-miniapp/config.test.ts`

- [ ] **Step 1: Write failing credential-envelope tests**

Use two deterministic 32-byte test keys and assert:

```ts
const sealed = sealDouyinCredential("isvrft.secret", keyring);
expect(sealed.keyVersion).toBe("v2");
expect(sealed.ciphertext).not.toContain("isvrft.secret");
expect(openDouyinCredential(sealed, keyring)).toBe("isvrft.secret");
expect(() => openDouyinCredential({
  ...sealed,
  keyVersion: "missing-version",
}, keyring)).toThrow();
```

Also cover tampered authentication tags, missing active keys, and old-version decrypt during rotation. Expect repository-standard `AppError` codes, never raw `Error`.

- [ ] **Step 2: Write failing callback-crypto tests**

Create a test-only encryptor matching the official Go reference, then assert:

```ts
expect(verifyDouyinCallbackSignature({
  token: "callback-token",
  timestamp: "1721376000",
  nonce: "4464221",
  encrypted: fixture.encrypted,
  signature: fixture.signature,
})).toBe(true);

expect(decryptDouyinCallback({
  encrypted: fixture.encrypted,
  encodingAesKey: fixture.encodingAesKey,
  expectedComponentAppId: "tt-component-1",
})).toEqual(fixture.message);
```

Cover invalid signature, invalid base64, invalid padding, length overflow, invalid JSON, and decrypted component-AppID mismatch.

- [ ] **Step 3: Confirm RED**

```bash
cd apps/api
bun test src/services/douyin-miniapp/credential-envelope.test.ts \
  src/services/douyin-miniapp/callback-crypto.test.ts \
  src/services/douyin-miniapp/config.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement configuration and encryption**

Load static service-provider configuration from:

```text
DOUYIN_COMPONENT_APP_ID
DOUYIN_COMPONENT_APP_SECRET
DOUYIN_COMPONENT_MESSAGE_TOKEN
DOUYIN_COMPONENT_MESSAGE_AES_KEY
DOUYIN_TEMPLATE_APP_ID
DOUYIN_TEMPLATE_APP_SECRET
DOUYIN_CREDENTIAL_KEYS_JSON
DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION
DOUYIN_SUBJECT_HASH_KEY
```

`DOUYIN_CREDENTIAL_KEYS_JSON` is a JSON object whose values are base64-encoded 32-byte keys. Validate all configuration with Zod. Encrypt credentials using AES-256-GCM with a fresh 12-byte IV and return separate `ciphertext`, `iv`, `tag`, and `keyVersion` values. Decrypt by key version and allow old keys that remain in the configured keyring.

Implement callback verification/decryption exactly as described in **Verified External Contracts**. Use `timingSafeEqual` for equal-length signatures and component AppID comparison. Map all failures through `Errors.business` with non-sensitive details.

- [ ] **Step 5: Verify GREEN**

```bash
cd apps/api
bun test src/services/douyin-miniapp/credential-envelope.test.ts \
  src/services/douyin-miniapp/callback-crypto.test.ts \
  src/services/douyin-miniapp/config.test.ts
bun run typecheck
git diff --check
```

Expected: PASS; no secret values appear in snapshots or test output.

- [ ] **Step 6: Commit Task 3**

```bash
git add apps/api/src/services/douyin-miniapp/credential-envelope.ts \
  apps/api/src/services/douyin-miniapp/credential-envelope.test.ts \
  apps/api/src/services/douyin-miniapp/callback-crypto.ts \
  apps/api/src/services/douyin-miniapp/callback-crypto.test.ts \
  apps/api/src/services/douyin-miniapp/config.ts \
  apps/api/src/services/douyin-miniapp/config.test.ts
git commit -m "feat(douyin): 实现授权凭证和回调加密"
```

---

### Task 4: Add strict repositories and the authorization OpenAPI gateway

**Files:**

- Create: `apps/api/src/repositories/douyin-third-party-components.ts`
- Create: `apps/api/src/repositories/douyin-third-party-components.test.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-installations.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-installations.test.ts`
- Create: `apps/api/src/gateways/douyin-open-platform/client.ts`
- Create: `apps/api/src/gateways/douyin-open-platform/client.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/access-tokens.ts`
- Create: `apps/api/src/services/douyin-miniapp/access-tokens.test.ts`

- [ ] **Step 1: Write failing gateway tests**

Inject `fetch` and assert exact URL, method, header, and body for component token, authorization-code exchange, refresh-token exchange, merchant code2session V2, and template-development ordinary code2Session. Cover:

- HTTP failure;
- malformed/non-object JSON;
- HTTP 200 with non-zero `err_no`/`errno`;
- missing required token fields;
- 10-second abort;
- one replay after an expired access-token response and no second replay.

The public gateway contract is:

```ts
export interface DouyinOpenPlatformGateway {
  getComponentAccessToken(input: ComponentTokenInput): Promise<ComponentTokenResult>;
  exchangeAuthorizationCode(input: AuthorizationCodeInput): Promise<AuthorizerTokenResult>;
  refreshAuthorizerToken(input: RefreshAuthorizerTokenInput): Promise<AuthorizerTokenResult>;
  code2Session(input: Code2SessionInput): Promise<Code2SessionResult>;
  code2SessionForTemplate(input: TemplateCode2SessionInput): Promise<Code2SessionResult>;
}
```

- [ ] **Step 2: Write failing repository/service tests**

Assert that repository selects use named exact columns, tenant binding rejects an inactive/nonexistent tenant, active installation lookup always matches `authorizer_appid`, and merchant lookup also matches `deployment_key`. Assert token service uses the migration refresh lease so two concurrent calls make one gateway refresh.

- [ ] **Step 3: Confirm RED**

```bash
cd apps/api
bun test src/gateways/douyin-open-platform/client.test.ts \
  src/repositories/douyin-third-party-components.test.ts \
  src/repositories/douyin-miniapp-installations.test.ts \
  src/services/douyin-miniapp/access-tokens.test.ts
```

Expected: FAIL because the gateway, repositories, and service are absent.

- [ ] **Step 4: Implement the gateway**

Use the global `fetch` type already available to the API; do not add an HTTP dependency. Parse every success and failure body with Zod. Return `log_id` only as safe diagnostic metadata. Never include query strings, access-token headers, codes, refresh tokens, OpenIDs, or response bodies in errors/logs.

- [ ] **Step 5: Implement repositories and refresh orchestration**

Repositories perform only Supabase/RPC operations and validate one-row RPC results. The access-token service:

1. returns an encrypted stored token only when it remains valid for more than five minutes;
2. claims the DB lease before refresh;
3. decrypts credentials only immediately before the gateway call;
4. completes the lease with new encrypted credentials and expiries;
5. polls the row for at most 3 seconds when another worker owns a valid lease;
6. returns `DOUYIN_AUTHORIZATION_EXPIRED` after a refresh-token failure that requires re-authorization.

- [ ] **Step 6: Verify GREEN**

```bash
cd apps/api
bun test src/gateways/douyin-open-platform/client.test.ts \
  src/repositories/douyin-third-party-components.test.ts \
  src/repositories/douyin-miniapp-installations.test.ts \
  src/services/douyin-miniapp/access-tokens.test.ts
bun run typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add apps/api/src/gateways/douyin-open-platform \
  apps/api/src/repositories/douyin-third-party-components.ts \
  apps/api/src/repositories/douyin-third-party-components.test.ts \
  apps/api/src/repositories/douyin-miniapp-installations.ts \
  apps/api/src/repositories/douyin-miniapp-installations.test.ts \
  apps/api/src/services/douyin-miniapp/access-tokens.ts \
  apps/api/src/services/douyin-miniapp/access-tokens.test.ts
git commit -m "feat(douyin): 接入开放平台授权凭证"
```

---

### Task 5: Receive component tickets and authorization lifecycle events

**Files:**

- Create: `apps/api/src/schema/douyin-third-party-events.ts`
- Create: `apps/api/src/services/douyin-miniapp/authorization-events.ts`
- Create: `apps/api/src/services/douyin-miniapp/authorization-events.test.ts`
- Create: `apps/api/src/controllers/douyin-third-party-events/index.ts`
- Create: `apps/api/src/controllers/douyin-third-party-events/index.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing route and controller tests**

Require both callback endpoints to bypass Bearer authentication but still fail closed on bad signatures:

```text
POST /douyin-thirdparty/events/authorization
POST /douyin-thirdparty/events/message
```

Assert valid callbacks return status 200, content type `text/plain`, and body exactly `success`. JSON `{ "success": true }` is not acceptable.

- [ ] **Step 2: Write failing event-service tests**

Cover these decrypted messages:

```json
{ "Ticket": "ticket-value", "MsgType": "Ticket", "Event": "PUSH" }
```

```json
{
  "AppId": "tt-authorizer-1",
  "TpAppId": "tt-component-1",
  "Event": "AUTHORIZED",
  "AuthorizationCode": "auth-code",
  "AuthorizationCodeExpiresIn": 3600
}
```

Also cover `UPDATE_AUTHORIZED`, `UNAUTHORIZED`, duplicate delivery, timestamp older than 300 seconds, component-AppID mismatch, and unsupported events. Unsupported well-formed events should be acknowledged and logged by safe event name only; malformed or untrusted callbacks must be rejected.

- [ ] **Step 3: Confirm RED**

```bash
cd apps/api
bun test src/plugins/auth/legacy/routes.test.ts \
  src/services/douyin-miniapp/authorization-events.test.ts \
  src/controllers/douyin-third-party-events/index.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement callback handling**

Controller responsibilities are limited to wrapper validation, calling the service, and returning raw `success`. Service responsibilities:

- verify the 5-minute timestamp window, signature, decryption, and decrypted component AppID;
- store the latest ticket encrypted;
- exchange `AUTHORIZED`/`UPDATE_AUTHORIZED` codes, encrypt returned credentials, and upsert by `authorizer_appid`;
- create new authorizations as `authorized_unbound` with null tenant and deployment key;
- preserve an existing tenant/deployment binding on `UPDATE_AUTHORIZED`;
- set `revoked` and clear encrypted token fields on `UNAUTHORIZED`;
- make duplicate deliveries idempotent.

Do not log the callback body, signature, ticket, authorization code, or app contact fields.

- [ ] **Step 5: Verify GREEN**

```bash
cd apps/api
bun test src/plugins/auth/legacy/routes.test.ts \
  src/services/douyin-miniapp/authorization-events.test.ts \
  src/controllers/douyin-third-party-events/index.test.ts
bun run check
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/api/src/schema/douyin-third-party-events.ts \
  apps/api/src/services/douyin-miniapp/authorization-events.ts \
  apps/api/src/services/douyin-miniapp/authorization-events.test.ts \
  apps/api/src/controllers/douyin-third-party-events \
  apps/api/src/plugins/auth/legacy/routes.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/routes/index.ts
git commit -m "feat(douyin): 处理小程序授权事件"
```

---

### Task 6: Add platform installation binding and runtime configuration API

**Files:**

- Create: `apps/api/src/schema/platform-douyin-miniapps.ts`
- Create: `apps/api/src/services/platform-douyin-miniapps.ts`
- Create: `apps/api/src/services/platform-douyin-miniapps.test.ts`
- Create: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Create: `apps/api/src/controllers/platform-douyin-miniapps/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing service/controller tests**

Implement and test:

```text
GET   /platform/douyin-miniapps?page=1&pageSize=20
GET   /platform/douyin-miniapps/:id
POST  /platform/douyin-miniapps/:id/bind
POST  /platform/douyin-miniapps/template-development
PATCH /platform/douyin-miniapps/:id/config
POST  /platform/douyin-miniapps/:id/rotate-deployment-key
POST  /platform/douyin-miniapps/:id/disable
POST  /platform/douyin-miniapps/:id/enable
```

Tests must prove page-size capping, `platform.douyin_miniapp.manage` enforcement, tenant existence/status validation, one AppID to one tenant, no secret fields in responses, and a cryptographically random deployment key with at least 128 bits of entropy.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/services/platform-douyin-miniapps.test.ts \
  src/controllers/platform-douyin-miniapps/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement platform management**

Use `PlatformBaseController.getRequiredPlatformAdminContext`, Zod safe parsing, `ResponseHandler.success`, the access-policy service, and the installation repository. `bind` accepts only `tenant_id` plus a complete runtime config. It changes `authorized_unbound` to `active`. The template-development endpoint creates the single explicit development installation only when the configured AppID equals `DOUYIN_TEMPLATE_APP_ID`; it accepts a tenant plus complete runtime config, stores no deployment key or authorizer credentials, and is idempotent for the same tenant. Rotation invalidates the old deployment key immediately and must be followed by a new merchant build before that installation can log in again.

List repository query:

```ts
const from = (page - 1) * pageSize;
const to = from + pageSize - 1;
```

Select only identifiers, tenant summary, status, permissions, template metadata, safe timestamps, and runtime config.

- [ ] **Step 4: Verify GREEN**

```bash
cd apps/api
bun test src/services/platform-douyin-miniapps.test.ts \
  src/controllers/platform-douyin-miniapps/index.test.ts
bun run check
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/api/src/schema/platform-douyin-miniapps.ts \
  apps/api/src/services/platform-douyin-miniapps.ts \
  apps/api/src/services/platform-douyin-miniapps.test.ts \
  apps/api/src/controllers/platform-douyin-miniapps \
  apps/api/src/routes/index.ts
git commit -m "feat(douyin): 管理授权小程序安装"
```

---

## Phase B — Session and tenant-safe public content

### Task 7: Exchange `tt.login` code for a tenant-bound Gooes session

**Files:**

- Modify: `apps/api/src/utils/jwt.ts`
- Create: `apps/api/src/utils/jwt-douyin-miniapp.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin.ts`
- Create: `apps/api/src/schema/douyin-miniapp.ts`
- Create: `apps/api/src/services/douyin-miniapp/session.ts`
- Create: `apps/api/src/services/douyin-miniapp/session.test.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing JWT and route tests**

Add `douyin_miniapp` to `token_type`, `douyin` to `login_channel`, and a `signDouyinMiniappToken` helper with default expiry `DOUYIN_MINIAPP_SESSION_EXPIRES_IN || "2h"`. Assert verification rejects this token when any required field is absent.

Route rules:

- `POST /douyin-mini/auth/session` bypasses auth;
- every other `/douyin-mini/*` route requires `douyin_miniapp` token;
- a Douyin token is rejected on non-Douyin routes;
- regular employee/customer/partner tokens are rejected on protected Douyin routes.

- [ ] **Step 2: Write failing session tests**

Use the fixed request contract:

```ts
const request = {
  app_id: "tt-authorizer-1",
  deployment_key: "deployment-public-key",
  code: "one-time-login-code",
  launch_context: {
    entry_path: "pages/case-detail/index",
    scene: "021001",
    source_type: "short_video",
    campaign_code: "summer-2026",
    content_id: "video-100",
  },
};
```

Prove AppID/deployment mismatch, missing merchant deployment key, inactive installation, inactive tenant, expired authorization, and forged `tenant_id` are rejected. Prove a registered `template_development` AppID can omit deployment key and no other AppID can. Prove template development uses ordinary code2Session with the configured template secret, while merchant sessions use authorizer code2session V2 and never read that secret.

- [ ] **Step 3: Confirm RED**

```bash
cd apps/api
bun test src/utils/jwt-douyin-miniapp.test.ts \
  src/plugins/auth/legacy/routes.test.ts \
  src/services/douyin-miniapp/session.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement session issuance**

Validate launch context with strict allowlists and lengths. Resolve installation by `app_id`; cross-check deployment key according to installation kind; resolve active tenant; for a merchant obtain its authorizer token and call service-provider code2session V2; for the one explicit template-development AppID call ordinary code2Session with its backend-only template secret. Require `open_id` or `anonymous_open_id`, derive `subject_hash`, and sign the short session.

Return only:

```json
{
  "access_token": "gooes-jwt",
  "expires_in": 7200,
  "installation": {
    "status": "active",
    "template_version": "1.0.0"
  }
}
```

Do not echo tenant ID, installation ID, AppID, OpenID, session key, or deployment key.

- [ ] **Step 5: Verify GREEN**

```bash
cd apps/api
bun test src/utils/jwt-douyin-miniapp.test.ts \
  src/plugins/auth/legacy/routes.test.ts \
  src/services/douyin-miniapp/session.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
bun run check
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/api/src/utils/jwt.ts \
  apps/api/src/utils/jwt-douyin-miniapp.test.ts \
  apps/api/src/plugins/auth/legacy/routes.ts \
  apps/api/src/plugins/auth/legacy/routes.test.ts \
  apps/api/src/plugins/auth/legacy-plugin.ts \
  apps/api/src/schema/douyin-miniapp.ts \
  apps/api/src/services/douyin-miniapp/session.ts \
  apps/api/src/services/douyin-miniapp/session.test.ts \
  apps/api/src/controllers/douyin-miniapp \
  apps/api/src/routes/index.ts
git commit -m "feat(douyin): 签发租户隔离小程序会话"
```

---

### Task 8: Add Bootstrap, company, cases, and sites APIs with privacy-safe projections

**Files:**

- Create: `apps/api/src/repositories/douyin-miniapp-content.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-content.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/content.ts`
- Create: `apps/api/src/services/douyin-miniapp/content.test.ts`
- Modify: `apps/api/src/schema/douyin-miniapp.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: Write failing repository projection tests**

Assert every list applies `tenant_id`, correct statuses, public visibility, `.range(from, to)`, and necessary-field selects only. The query/select text and returned DTOs must not contain:

```text
customer
customer_id
phone
wx_openid
signed_amount
address
building_info
latitude
longitude
```

Allowed project fields include ID, display title, cover/public images, style tags, layout, area, budget band, community, district/city, status/stage, and dates. V1 does not reuse raw project-log `content` as marketing copy; when no dedicated public summary exists, the description is null and the miniapp hides that section.

- [ ] **Step 2: Write failing service/controller tests**

Implement:

```text
GET /douyin-mini/bootstrap
GET /douyin-mini/company
GET /douyin-mini/cases?page=1&pageSize=20
GET /douyin-mini/cases/:id
GET /douyin-mini/sites?page=1&pageSize=20
GET /douyin-mini/sites/:id
GET /douyin-mini/sites/:id/logs?page=1&pageSize=20
```

Case list additionally accepts optional `style` and `layout` strings of 1–40 characters; both are exact, tenant-scoped filters against existing project/property fields. Unknown query keys fail schema validation.

Prove session tenant wins over all request inputs, cross-tenant IDs return not found, default/max pagination is enforced, and bootstrap uses bounded parallel queries rather than per-item queries.

- [ ] **Step 3: Confirm RED**

```bash
cd apps/api
bun test src/repositories/douyin-miniapp-content.test.ts \
  src/services/douyin-miniapp/content.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement dedicated content repository**

Do not call or copy `PUBLIC_PROJECT_LIST_SELECT` or `PUBLIC_PROJECT_DETAIL_SELECT`. Build new constant selects with no customer/address fields. Lists use one count query and one bounded data query; they return nullable `cover_image_url` rather than performing per-project log reads, and the client uses the first tenant banner as the visual fallback. Bootstrap uses `Promise.all` for company profile, up to 6 cases, and up to 6 sites. Detail may fetch project and bounded public logs in parallel; it must never fetch all logs.

Read company name, introduction, public phone, approved service areas, and public address from the published tenant service-provider profile. Runtime logo/qualifications/theme/features/banner/metrics come from the installation row. Validate runtime config on read; invalid stored config is `DOUYIN_INSTALLATION_DISABLED`, not a partially trusted response.

- [ ] **Step 5: Implement DTO mapping and controllers**

Return standard pagination:

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Map budget to a display band; never expose exact contract/signed amounts. Map location to community plus city/district only. Public progress log selects contain only ID, stage code, node name, images, and creation time—never raw `content`. Filter images to HTTPS URLs and cap each log at 9 images.

- [ ] **Step 6: Verify GREEN and performance shape**

```bash
cd apps/api
bun test src/repositories/douyin-miniapp-content.test.ts \
  src/services/douyin-miniapp/content.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
bun run check
git diff --check
```

If a local database with representative data is available, run `EXPLAIN (ANALYZE, BUFFERS)` for case/site status + tenant queries and record the plan in the task notes. Expected: the tenant/status/public filtering uses an existing suitable project index; otherwise add a focused index in a new migration before continuing.

- [ ] **Step 7: Commit Task 8**

```bash
git add apps/api/src/repositories/douyin-miniapp-content.ts \
  apps/api/src/repositories/douyin-miniapp-content.test.ts \
  apps/api/src/services/douyin-miniapp/content.ts \
  apps/api/src/services/douyin-miniapp/content.test.ts \
  apps/api/src/schema/douyin-miniapp.ts \
  apps/api/src/controllers/douyin-miniapp/index.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts
git commit -m "feat(douyin): 提供装修公开内容接口"
```

---

## Phase C — Native Douyin miniapp

### Task 9: Scaffold the native TypeScript project and authenticated request layer

**Files:**

- Create: `apps/douyin-mini/package.json`
- Create: `apps/douyin-mini/tsconfig.json`
- Create: `apps/douyin-mini/project.config.json`
- Create: `apps/douyin-mini/src/app.ts`
- Create: `apps/douyin-mini/src/app.json`
- Create: `apps/douyin-mini/src/app.ttss`
- Create: `apps/douyin-mini/src/config/index.ts`
- Create: `apps/douyin-mini/src/models/index.ts`
- Create: `apps/douyin-mini/src/platform/env-info.ts`
- Create: `apps/douyin-mini/src/platform/ext-config.ts`
- Create: `apps/douyin-mini/src/platform/login.ts`
- Create: `apps/douyin-mini/src/platform/storage.ts`
- Create: `apps/douyin-mini/src/platform/navigation.ts`
- Create: `apps/douyin-mini/src/api/request.ts`
- Create: `apps/douyin-mini/src/api/auth.ts`
- Create: `apps/douyin-mini/src/api/bootstrap.ts`
- Create: `apps/douyin-mini/src/state/session.ts`
- Create: `apps/douyin-mini/src/state/bootstrap.ts`
- Create: `apps/douyin-mini/src/state/session.test.ts`
- Create: `apps/douyin-mini/src/pages/service-unavailable/index.{ts,json,ttml,ttss}`
- Modify: `package.json`
- Update mechanically: `bun.lock`

- [ ] **Step 1: Verify the actual typings package before coding**

First create `apps/douyin-mini/package.json` with the declared package name, `private: true`, `type: "module"`, and the scripts from Step 3; create the empty source directory and the two config files with `apply_patch`. Then install and inspect the real declarations:

```bash
bun add --cwd apps/douyin-mini --dev typescript @douyin-microapp/typings
rg -n "getEnvInfoSync|getExtConfigSync|login\(|request\(|getStorageSync|setStorageSync|navigateTo|switchTab|reLaunch" \
  node_modules/@douyin-microapp/typings \
  apps/douyin-mini/node_modules/@douyin-microapp/typings
```

Expected: the installed package exposes the three used `tt` methods. If names differ in the installed version, use its real declarations and update this task's adapter signatures before implementation; do not cast the API to `any`.

- [ ] **Step 2: Write the failing session-state tests**

Use dependency-injected platform adapters. Cover cold login, stored valid session, 401-triggered single relogin, concurrent request single-flight, failed relogin without a loop, and service-unavailable navigation.

- [ ] **Step 3: Configure native TypeScript**

`project.config.json` must have `miniprogramRoot: "src/"` and TypeScript in `setting.useCompilerPlugins`. Package scripts:

```json
{
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "check": "bun run test && bun run typecheck"
  }
}
```

Add root scripts `douyin-mini:test`, `douyin-mini:typecheck`, and `douyin-mini:check`. Keep zero runtime npm dependencies.

- [ ] **Step 4: Implement adapters and request flow**

`readDouyinEnvironment()` returns the actual appId, envType, and version. `readDeploymentConfig()` returns only `deployment_key`. `loginOnce()` wraps `tt.login`. Session storage saves only the Gooes JWT and expiry.

The request layer must:

- use the HTTPS API base URL from non-secret config;
- attach Bearer token;
- time out at 10 seconds;
- normalize Gooes error responses;
- retry one time only after a 401 session refresh;
- never attach tenant/deployment fields after login.

- [ ] **Step 5: Implement App launch and unavailable page**

App launch captures only allowlisted attribution, initializes one session, then loads bootstrap. Map installation/tenant/auth errors to a safe unavailable-state code. Do not show server stack details or credential values.

- [ ] **Step 6: Verify GREEN**

```bash
bun run douyin-mini:check
bun run api:check
git diff --check
```

Expected: miniapp tests/typecheck and API check pass.

- [ ] **Step 7: Commit Task 9**

```bash
git add apps/douyin-mini package.json bun.lock
git commit -m "feat(douyin): 创建原生小程序工程"
```

---

### Task 10: Build the reusable visual primitives and tab shell

**Files:**

- Create: `apps/douyin-mini/src/components/tenant-brand/*`
- Create: `apps/douyin-mini/src/components/hero-banner/*`
- Create: `apps/douyin-mini/src/components/trust-metrics/*`
- Create: `apps/douyin-mini/src/components/case-card/*`
- Create: `apps/douyin-mini/src/components/site-card/*`
- Create: `apps/douyin-mini/src/components/image-gallery/*`
- Create: `apps/douyin-mini/src/components/lead-cta/*`
- Create: `apps/douyin-mini/src/components/pagination-loader/*`
- Create: `apps/douyin-mini/src/components/empty-state/*`
- Create: `apps/douyin-mini/src/components/error-state/*`
- Create: `apps/douyin-mini/src/components/page-skeleton/*`
- Create: `apps/douyin-mini/src/platform/navigation.test.ts`
- Create: `apps/douyin-mini/src/assets/tabbar/*`
- Modify: `apps/douyin-mini/src/app.json`
- Modify: `apps/douyin-mini/src/app.ttss`

- [ ] **Step 1: Write failing pure navigation/view-model tests**

Test route builders reject unknown paths and encode only the case/site ID. Test image-gallery and metric view-model builders cap array sizes and reject non-HTTPS image URLs.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/douyin-mini
bun test src/platform/navigation.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the visual system**

Use warm neutral surfaces, a configurable terracotta primary color, 16px content gutters, 12px card radii, one restrained shadow, and system fonts. Components must expose clear empty/loading/error states and at least 44px interactive targets. Avoid dynamic TTSS generation; expose the primary color through page/component style properties.

Configure four tabs exactly:

```text
首页 | 案例 | 工地 | 免费咨询
```

Use original local tab icons, not copied Orange assets. Static assets must be optimized; each tab icon is under 40 KB and every other raster is under 100 KB.

- [ ] **Step 4: Verify in IDE before page composition**

```bash
bun run douyin-mini:check
```

Then import `apps/douyin-mini` in Douyin IDE and compile. Expected: no missing-component, TTML, TTSS, or TypeScript compiler errors; the four-tab shell renders in the simulator.

- [ ] **Step 5: Commit Task 10**

```bash
git add apps/douyin-mini/src/components \
  apps/douyin-mini/src/platform/navigation.test.ts \
  apps/douyin-mini/src/assets/tabbar \
  apps/douyin-mini/src/app.json \
  apps/douyin-mini/src/app.ttss
git commit -m "feat(douyin): 建立装修模板视觉组件"
```

---

### Task 11: Implement home, company, privacy, cases, and case detail

**Files:**

- Create: `apps/douyin-mini/src/api/cases.ts`
- Create: `apps/douyin-mini/src/api/company.ts`
- Create: `apps/douyin-mini/src/utils/pagination.ts`
- Create: `apps/douyin-mini/src/utils/pagination.test.ts`
- Create: `apps/douyin-mini/src/pages/home/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/company/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/privacy/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/cases/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/case-detail/index.{ts,json,ttml,ttss}`
- Modify: `apps/douyin-mini/src/app.json`

- [ ] **Step 1: Write failing pagination reducer tests**

Cover first-page loading, append, retry without clearing old items, end-of-list detection, refresh reset, and stale response rejection by request sequence.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/douyin-mini
bun test src/utils/pagination.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement API wrappers and pages**

Home section order is fixed: brand/city, hero CTA, trust metrics, 6 featured cases, 6 active sites, service process, service regions, lead CTA. Use the already-loaded bootstrap; do not refetch every section.

Cases use page/pageSize 20 and lightweight client-visible style/layout filters backed by server query parameters. Detail loads one ID, shows public imagery, layout, area, budget band, design text, and a persistent consultation CTA. Company and privacy display only bootstrap/company public information and the exact current privacy version.

- [ ] **Step 4: Verify behavior**

```bash
bun run douyin-mini:check
```

In IDE: test initial loading, empty list, first-page error, next-page error, retry, case deep link, back navigation, and CTA navigation. Expected: data remains visible after next-page failure and no duplicate items appear.

- [ ] **Step 5: Commit Task 11**

```bash
git add apps/douyin-mini/src/api/cases.ts \
  apps/douyin-mini/src/api/company.ts \
  apps/douyin-mini/src/utils/pagination.ts \
  apps/douyin-mini/src/utils/pagination.test.ts \
  apps/douyin-mini/src/pages/home \
  apps/douyin-mini/src/pages/company \
  apps/douyin-mini/src/pages/privacy \
  apps/douyin-mini/src/pages/cases \
  apps/douyin-mini/src/pages/case-detail \
  apps/douyin-mini/src/app.json
git commit -m "feat(douyin): 展示装修品牌和案例"
```

---

### Task 12: Implement sites and public construction progress

**Files:**

- Create: `apps/douyin-mini/src/api/sites.ts`
- Create: `apps/douyin-mini/src/pages/sites/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/site-detail/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/site-detail/site-progress.ts`
- Create: `apps/douyin-mini/src/pages/site-detail/site-progress.test.ts`
- Modify: `apps/douyin-mini/src/app.json`

- [ ] **Step 1: Write failing site-progress tests**

Assert logs remain newest-first, malformed/non-HTTPS image values are removed, a page append is stable, and presentation never derives or displays owner/customer/address fields.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/douyin-mini
bun test src/pages/site-detail/site-progress.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement site pages**

Site list displays community, city/district, area, current public stage, cover image, and update date. Detail displays only community-level location, project facts, bounded progress logs, public photos, and CTA. Load more logs with page/pageSize 20; do not preload all construction history.

- [ ] **Step 4: Verify behavior**

```bash
bun run douyin-mini:check
```

In IDE: test empty sites, pagination, detail deep link, multiple log pages, bad-image filtering, weak network retry, and back/forward state restoration.

- [ ] **Step 5: Commit Task 12**

```bash
git add apps/douyin-mini/src/api/sites.ts \
  apps/douyin-mini/src/pages/sites \
  apps/douyin-mini/src/pages/site-detail \
  apps/douyin-mini/src/app.json
git commit -m "feat(douyin): 展示公开在建工地"
```

---

## Phase D — SMS lead capture and attribution

### Task 13: Create the atomic Douyin lead and analytics database model

**Files:**

- Create: `supabase/migrations/20260719101000_create_douyin_miniapp_marketing.sql`
- Create: `apps/api/src/services/douyin-miniapp/marketing-migration-contract.test.ts`
- Modify after local generation: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/types/database-douyin-miniapp-contract.test.ts`

- [ ] **Step 1: Write the failing SQL contract test**

Assert the migration:

- adds `douyin_miniapp_installation_id` to `marketing_leads` and `marketing_events`;
- adds `source` and `subject_hash` to `marketing_events` while preserving H5 defaults;
- adds `douyin_lead` to the current SMS scene constraint;
- creates `douyin_miniapp_lead_submissions` with unique `(douyin_miniapp_installation_id, idempotency_key)`;
- creates partial lead and event indexes;
- creates `submit_douyin_miniapp_lead` as `SECURITY DEFINER` with fixed search path;
- revokes the RPC from public/authenticated and grants it only to `service_role`.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/services/douyin-miniapp/marketing-migration-contract.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement schema and indexes**

Create:

```sql
CREATE INDEX marketing_leads_douyin_phone_created_idx
ON public.marketing_leads(tenant_id, phone, created_at DESC)
WHERE source = 'douyin_miniapp' AND phone IS NOT NULL;

CREATE INDEX marketing_events_douyin_funnel_idx
ON public.marketing_events(tenant_id, source, event_name, created_at DESC)
WHERE source = 'douyin_miniapp';
```

Extend the event-name constraint to include all nine approved Douyin event names while retaining all current H5 names.

- [ ] **Step 4: Implement the atomic RPC**

The RPC input includes installation ID, tenant ID, normalized phone/form fields, SMS code, request digest, idempotency key, subject hash, safe request metadata, privacy version/time, and allowlisted attribution JSON. It must:

1. lock/check an existing submission by installation + idempotency key;
2. return its saved result only when request digest matches, otherwise raise `DOUYIN_IDEMPOTENCY_CONFLICT`;
3. lock the newest pending `douyin_lead` SMS row matching phone and code, return `SMS_CODE_INVALID` when absent, and return `SMS_CODE_EXPIRED` when its expiry is not in the future;
4. take `pg_advisory_xact_lock(hashtextextended(tenant_id::text || ':' || phone, 0))`;
5. find the newest tenant/source/phone lead within 24 hours;
6. insert a new `marketing_leads` row or update the existing row's safe form/attribution fields;
7. mark the SMS row verified;
8. insert the immutable submission result and `lead_submit`/`lead_submit_success` events;
9. return `lead_id`, `already_submitted`, `updated_existing`, and the fixed success message.

Recheck that input tenant and installation match the active installation inside the RPC. Never trust the TypeScript caller alone.

- [ ] **Step 5: Verify locally and regenerate types**

```bash
cd apps/api
bun test src/services/douyin-miniapp/marketing-migration-contract.test.ts
cd ../..
supabase db reset
supabase gen types typescript --local > apps/api/src/types/database.ts
supabase migration list
cd apps/api
bun test src/types/database-douyin-miniapp-contract.test.ts
```

Expected: both `20260719100000` and `20260719101000` appear locally and tests pass. If local Supabase is unavailable, do not apply remotely; retain the SQL test evidence and mark local DB verification pending.

- [ ] **Step 6: Inspect query plans**

On representative local rows, run `EXPLAIN (ANALYZE, BUFFERS)` for the 24-hour lead lookup and tenant/source/event funnel lookup. Expected: both new partial indexes are used. Save the command/output summary in the implementation log; do not commit production PII or raw plans containing real phone values.

- [ ] **Step 7: Commit Task 13**

```bash
git add supabase/migrations/20260719101000_create_douyin_miniapp_marketing.sql \
  apps/api/src/services/douyin-miniapp/marketing-migration-contract.test.ts \
  apps/api/src/types/database.ts \
  apps/api/src/types/database-douyin-miniapp-contract.test.ts
git commit -m "feat(douyin): 原子写入装修营销线索"
```

---

### Task 14: Add SMS, lead submission, and bounded analytics APIs

**Files:**

- Create: `apps/api/src/repositories/douyin-miniapp-marketing.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-marketing.test.ts`
- Create: `apps/api/src/services/douyin-miniapp/marketing.ts`
- Create: `apps/api/src/services/douyin-miniapp/marketing.test.ts`
- Modify: `apps/api/src/schema/douyin-miniapp.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: Write failing repository and service tests**

Implement:

```text
POST /douyin-mini/sms/send
POST /douyin-mini/leads
POST /douyin-mini/events
```

Tests must prove:

- SMS always uses scene `douyin_lead`, current session subject as device limiter, and request IP from Fastify;
- lead service removes unexpected tenant/installation fields before digesting;
- canonical request digest is stable across JSON key order;
- repository makes one RPC call and validates its exact one-row result;
- same idempotency key + same digest returns the stored success;
- same key + different digest returns conflict;
- same tenant/phone within 24h updates one lead; different tenants create separate leads;
- analytics is a single batch insert of 1–20 allowlisted events with safe fields only.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/repositories/douyin-miniapp-marketing.test.ts \
  src/services/douyin-miniapp/marketing.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement strict schemas**

Lead fields follow the approved design. Normalize phone before validation/digest. Require the runtime config's exact current `privacy_policy_version`; require `consented_at` to be a valid ISO time not in the future by more than five minutes. Attribution fields are strict and capped; unknown keys fail rather than being persisted.

Analytics schema:

```ts
z.object({
  events: z.array(z.object({
    event_name: z.enum(DOUYIN_MARKETING_EVENT_VALUES),
    occurred_at: z.iso.datetime(),
    attribution: DouyinAttributionSchema,
    entity_id: z.uuid().optional(),
  }).strict()).min(1).max(20),
}).strict();
```

- [ ] **Step 4: Implement controller/service/repository layers**

Controller parses HTTP data and returns `ResponseHandler.success`. Service derives tenant/installation/subject only from `request.user`, orchestrates SMS/domain validation, and generates the digest. Repository directly calls the atomic RPC or performs one bounded analytics insert. Every failure goes through `error-factory.ts`.

After SMS dispatch succeeds, insert one server-authoritative `sms_send` event. Translate the RPC's stable SQL error markers (`SMS_CODE_INVALID`, `SMS_CODE_EXPIRED`, `DOUYIN_IDEMPOTENCY_CONFLICT`, and installation/tenant failures) into `Errors.business`; all unknown database failures use `Errors.dbError`. Never return PostgreSQL exception text to the miniapp.

Do not log form bodies, phone, SMS code, subject hash, or attribution query strings. Safe audit log fields are request ID, installation ID, tenant ID, operation, result code, and whether an existing lead was updated.

- [ ] **Step 5: Verify GREEN**

```bash
cd apps/api
bun test src/repositories/douyin-miniapp-marketing.test.ts \
  src/services/douyin-miniapp/marketing.test.ts \
  src/controllers/douyin-miniapp/index.test.ts
bun run check
git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 14**

```bash
git add apps/api/src/repositories/douyin-miniapp-marketing.ts \
  apps/api/src/repositories/douyin-miniapp-marketing.test.ts \
  apps/api/src/services/douyin-miniapp/marketing.ts \
  apps/api/src/services/douyin-miniapp/marketing.test.ts \
  apps/api/src/schema/douyin-miniapp.ts \
  apps/api/src/controllers/douyin-miniapp/index.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts
git commit -m "feat(douyin): 接入短信留资和营销事件"
```

---

### Task 15: Build the native consultation flow and analytics queue

**Files:**

- Create: `apps/douyin-mini/src/api/leads.ts`
- Create: `apps/douyin-mini/src/platform/analytics.ts`
- Create: `apps/douyin-mini/src/platform/analytics.test.ts`
- Create: `apps/douyin-mini/src/utils/idempotency.ts`
- Create: `apps/douyin-mini/src/utils/idempotency.test.ts`
- Create: `apps/douyin-mini/src/components/lead-form/*`
- Create: `apps/douyin-mini/src/components/sms-code-input/*`
- Create: `apps/douyin-mini/src/components/privacy-consent/*`
- Create: `apps/douyin-mini/src/pages/lead/index.{ts,json,ttml,ttss}`
- Create: `apps/douyin-mini/src/pages/lead-success/index.{ts,json,ttml,ttss}`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/case-detail/index.ts`
- Modify: `apps/douyin-mini/src/pages/site-detail/index.ts`
- Modify: `apps/douyin-mini/src/app.json`

- [ ] **Step 1: Write failing idempotency and analytics tests**

Idempotency key remains stable for one submit attempt and rotates only after success or a user edit following success. Analytics queue deduplicates one event ID, caps storage at 100 events, flushes in batches of 20, retains failed batches, and never stores arbitrary launch query objects.

Before wiring the phone CTA, inspect the installed typing declaration for `makePhoneCall` and use its real options/result types. If the installed typing does not expose the API, keep the service phone copyable and omit the call button rather than adding an `any` cast.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/douyin-mini
bun test src/utils/idempotency.test.ts src/platform/analytics.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement consultation UX**

Form contains name, phone, SMS code, community, area, budget, start time, demand, privacy checkbox/link, hidden policy version, and idempotency key. SMS button enforces the server-returned cooldown. Submission disables the button while pending. Network/SMS/privacy errors retain all fields. Success navigates to one success page whose copy covers both new and duplicate leads.

Do not implement Douyin phone authorization in this task; `douyin_phone=false` and `phone_capture_mode="sms"` remain explicit.

- [ ] **Step 4: Instrument approved events**

The client queue records launch, page views, case/site views, CTA click, and phone call click. The backend records `sms_send` after successful SMS dispatch, and the atomic lead RPC records `lead_submit` plus `lead_submit_success`; the client must not enqueue those three server-authoritative events a second time. Include only the allowlisted attribution fields and entity ID. Flush on batch size, app hide, and a short debounce; analytics failure never blocks content or lead success.

- [ ] **Step 5: Verify GREEN and IDE flows**

```bash
bun run douyin-mini:check
bun run api:check
git diff --check
```

In IDE and a test session, verify: SMS cooldown, wrong/expired code, privacy refusal, offline submit, repeated tap, duplicate lead success, form preservation, success back navigation, and event batches no larger than 20.

- [ ] **Step 6: Commit Task 15**

```bash
git add apps/douyin-mini/src/api/leads.ts \
  apps/douyin-mini/src/platform/analytics.ts \
  apps/douyin-mini/src/platform/analytics.test.ts \
  apps/douyin-mini/src/utils/idempotency.ts \
  apps/douyin-mini/src/utils/idempotency.test.ts \
  apps/douyin-mini/src/components/lead-form \
  apps/douyin-mini/src/components/sms-code-input \
  apps/douyin-mini/src/components/privacy-consent \
  apps/douyin-mini/src/pages/lead \
  apps/douyin-mini/src/pages/lead-success \
  apps/douyin-mini/src/pages/home/index.ts \
  apps/douyin-mini/src/pages/case-detail/index.ts \
  apps/douyin-mini/src/pages/site-detail/index.ts \
  apps/douyin-mini/src/app.json
git commit -m "feat(douyin): 完成装修咨询留资闭环"
```

---

## Phase E — Template delivery and controlled rollout

### Task 16: Persist release operations and extend the official gateway

**Files:**

- Create: `supabase/migrations/20260719102000_create_douyin_miniapp_releases.sql`
- Create: `apps/api/src/services/douyin-miniapp/release-migration-contract.test.ts`
- Modify after local generation: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/types/database-douyin-miniapp-contract.test.ts`
- Modify: `apps/api/src/gateways/douyin-open-platform/client.ts`
- Modify: `apps/api/src/gateways/douyin-open-platform/client.test.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-releases.ts`
- Create: `apps/api/src/repositories/douyin-miniapp-releases.test.ts`

- [ ] **Step 1: Write failing migration/gateway tests**

Create `douyin_miniapp_releases` with installation, decimal-string template ID, semantic version, description, channel, sanitized `ext_json`, status, Douyin log ID, QR URL, audit hosts/note/result, timestamps, and platform operator ID. Add `(installation_id, created_at DESC)` and `(status, updated_at DESC)` indexes, RLS, and service-role grants.

Gateway tests assert exact upload, QR, available-audit-hosts, audit, version-list, and release endpoints from **Verified External Contracts**, strict response validation, and no access-token leakage.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/services/douyin-miniapp/release-migration-contract.test.ts \
  src/gateways/douyin-open-platform/client.test.ts \
  src/repositories/douyin-miniapp-releases.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement release schema and gateway methods**

Release statuses are `created`, `uploaded`, `testing`, `audit_pending`, `audit_rejected`, `audit_approved`, `released`, and `failed`. Store safe response metadata only. `ext_json` is built server-side and must equal this shape before stringification:

```ts
{
  extEnable: true,
  extAppid: installation.authorizer_appid,
  ext: { deployment_key: installation.deployment_key },
}
```

Reject null merchant deployment keys, mismatched `extAppid`, unknown top-level keys, and any serialized keys matching `/token|secret|phone|openid/i`.

For upload JSON, validate `template_id` with `/^[1-9][0-9]{0,18}$/`, JSON-stringify every other field independently, and interpolate only those validated digits as the numeric literal. Do not call `Number`, `parseInt`, or `BigInt` followed by `JSON.stringify`.

- [ ] **Step 4: Verify locally and regenerate types**

```bash
cd apps/api
bun test src/services/douyin-miniapp/release-migration-contract.test.ts \
  src/gateways/douyin-open-platform/client.test.ts \
  src/repositories/douyin-miniapp-releases.test.ts
cd ../..
supabase db reset
supabase gen types typescript --local > apps/api/src/types/database.ts
supabase migration list
```

Expected: all three Douyin migrations align locally. Do not apply remotely in this task.

- [ ] **Step 5: Commit Task 16**

```bash
git add supabase/migrations/20260719102000_create_douyin_miniapp_releases.sql \
  apps/api/src/services/douyin-miniapp/release-migration-contract.test.ts \
  apps/api/src/types/database.ts \
  apps/api/src/types/database-douyin-miniapp-contract.test.ts \
  apps/api/src/gateways/douyin-open-platform/client.ts \
  apps/api/src/gateways/douyin-open-platform/client.test.ts \
  apps/api/src/repositories/douyin-miniapp-releases.ts \
  apps/api/src/repositories/douyin-miniapp-releases.test.ts
git commit -m "feat(douyin): 记录模板交付版本"
```

---

### Task 17: Add guarded platform upload, QR, audit, and release operations

**Files:**

- Create: `apps/api/src/services/platform-douyin-miniapp-releases.ts`
- Create: `apps/api/src/services/platform-douyin-miniapp-releases.test.ts`
- Modify: `apps/api/src/schema/platform-douyin-miniapps.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

Implement:

```text
GET  /platform/douyin-miniapps/:id/releases?page=1&pageSize=20
POST /platform/douyin-miniapps/:id/releases/upload
POST /platform/douyin-miniapps/:id/releases/:releaseId/test-qr
POST /platform/douyin-miniapps/:id/releases/:releaseId/submit-audit
POST /platform/douyin-miniapps/:id/releases/:releaseId/sync-status
POST /platform/douyin-miniapps/:id/releases/:releaseId/publish
```

Tests must enforce platform permission, installation/release ownership, active authorization, required permission snapshot, state transitions, page-size cap, semantic version, safe audit note, and refusal to publish unless synced status is `audit_approved`.

- [ ] **Step 2: Confirm RED**

```bash
cd apps/api
bun test src/services/platform-douyin-miniapp-releases.test.ts \
  src/controllers/platform-douyin-miniapps/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement guarded release orchestration**

Upload obtains one fresh authorizer token, constructs ext JSON server-side, calls upload V2, persists the release, and updates installation template metadata. QR only requests `latest`. Audit requires the host list returned by Douyin's available-host API, not a guessed value. Sync reads the versions V2 endpoint and records an allowlisted result. Publish requires a fresh status sync immediately before calling release V2.

No endpoint performs bulk release. Each merchant is an explicit operation with an audit record. Failed gateway calls keep the previous stable installation release metadata and save only safe error code/log ID.

- [ ] **Step 4: Verify GREEN**

```bash
cd apps/api
bun test src/services/platform-douyin-miniapp-releases.test.ts \
  src/controllers/platform-douyin-miniapps/index.test.ts
bun run check
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 17**

```bash
git add apps/api/src/services/platform-douyin-miniapp-releases.ts \
  apps/api/src/services/platform-douyin-miniapp-releases.test.ts \
  apps/api/src/schema/platform-douyin-miniapps.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.test.ts
git commit -m "feat(douyin): 管理模板提审发布流程"
```

---

### Task 18: Run the full quality, migration, privacy, and rollout gates

**Files:**

- Create: `docs/operations/douyin-miniapp-template-runbook.md`
- Create: `docs/operations/douyin-miniapp-template-smoke-checklist.md`
- Modify only if verification exposes a scoped defect: files already introduced by Tasks 1–17

- [ ] **Step 1: Create the operational runbook**

Document:

- required environment variable names without values;
- service-provider console callback URLs;
- how to bind an authorized AppID to a tenant;
- how to create the explicit template-development installation;
- local/remote migration verification;
- template IDE upload -> template library ID -> merchant upload -> QR -> audit -> release;
- credential rotation and token-refresh alerting;
- deployment-key rotation impact;
- disable/revoke handling;
- rollback by resubmitting the previous stable template through the normal audit/release flow;
- logs/metrics for session exchange, bootstrap, SMS, leads, event batches, token refresh, and release failures.

- [ ] **Step 2: Run repository verification**

```bash
bun run douyin-mini:check
bun run api:check
bun test packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts
bun test
git diff --check
```

Expected: all commands pass. If the root suite reports unrelated pre-existing failures, rerun the affected named suite, record the exact failing test and baseline evidence, and do not claim a fully green repository.

- [ ] **Step 3: Run migration alignment gate**

```bash
supabase migration list
```

Before any remote application, review the exact three new migrations and obtain explicit approval. After approved application:

```bash
supabase db push
supabase migration list
```

Expected: Local and Remote align through `20260719102000`. If they do not align, stop; do not manually patch remote DDL/DML.

- [ ] **Step 4: Run privacy/security scans**

```bash
rg -n "console\.(log|info|debug)|throw new Error|tenant_id" \
  apps/api/src/controllers/douyin-* \
  apps/api/src/services/douyin-miniapp \
  apps/douyin-mini/src

rg -n "component_appsecret|authorizer_access_token|authorizer_refresh_token|session_key|open_id|sms_code" \
  apps/douyin-mini \
  docs/operations/douyin-miniapp-template-*.md
```

Expected: no raw exception/log anti-patterns, no client tenant selector, and no secret values in miniapp/docs. Legitimate backend config/type references and miniapp form field names such as `sms_code` must be individually reviewed; names are allowed, credential/phone/code values are not.

- [ ] **Step 5: Execute the test-installation smoke checklist**

On the explicit development installation and one authorized test merchant, verify:

1. app/deployment mismatch rejection;
2. correct tenant bootstrap and no cross-tenant content;
3. disabled/revoked tenant behavior;
4. case/site pagination and privacy projection;
5. SMS rate limit, invalid/expired code, and valid code;
6. one lead under concurrent repeat taps;
7. 24-hour same-tenant dedup and different-tenant separation;
8. analytics allowlist/batch bounds;
9. Android and iOS navigation, deep links, weak network, and state recovery;
10. upload, test QR, audit-state sync, and controlled release on the authorized test merchant only.

- [ ] **Step 6: Perform staged rollout**

The live actions in this step require explicit approval each time. Roll out to one merchant, observe for at least one business day, then 3–5 merchants. Monitor success/error counts and manually inspect lead routing. Do not enable bulk operations. Keep the previous stable template ID/version available.

- [ ] **Step 7: Commit Task 18**

```bash
git add docs/operations/douyin-miniapp-template-runbook.md \
  docs/operations/douyin-miniapp-template-smoke-checklist.md
git commit -m "docs(douyin): 补充模板发布运维手册"
```

---

## Final Definition of Done

- [ ] Native project compiles in the installed Douyin IDE and passes `douyin-mini:check`.
- [ ] API/domain focused tests and `api:check` pass.
- [ ] Root tests pass or every unrelated baseline failure is explicitly documented with evidence.
- [ ] Three migrations are version-controlled, locally executed, type-generated, and Local/Remote aligned only after approval.
- [ ] No client request can choose a tenant or installation.
- [ ] Merchant AppID and deployment key are cross-checked; development AppID exception is explicit and isolated.
- [ ] Raw OpenID, session key, SMS code, phone, and provider credentials do not appear in ordinary logs or client storage beyond the user-entered form phone/code before submission.
- [ ] Cases/sites are paginated and use privacy-safe projections with no N+1 reads.
- [ ] SMS consumption, idempotency, 24-hour dedup, lead write, and success events are one database transaction.
- [ ] Same phone can create separate leads for separate tenant installations.
- [ ] Release ext JSON is server-generated and contains only AppID plus public deployment key.
- [ ] Upload/audit/publish operations are permissioned, single-installation, auditable, and state-guarded.
- [ ] One authorized test merchant passes the full smoke checklist before the first live merchant rollout.
