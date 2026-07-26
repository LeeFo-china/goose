# Tenant Douyin Miniapp Phase 2 Authorization Preview Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow an authorized tenant user to generate a Douyin authorization link, complete tenant binding safely, generate a test QR, submit the current test release for audit, and sync audit state while platform-only publish remains unchanged.

**Architecture:** Add short-lived authorization intents and an authorization-code digest correlation path so browser redirect and platform authorization events can race safely. Add tenant release facades over existing release operations, exposing preview/audit/sync but never upload or publish.

**Tech Stack:** PostgreSQL migration/RPC, Douyin Open Platform V2/V3 APIs, Fastify, Zod, existing credential envelope and release operation services, Next.js, shadcn/Radix.

---

## File Map

Create:

- `supabase/migrations/20260726110000_tenant_douyin_authorization_intents.sql`
- `apps/api/src/services/tenant-douyin-miniapp/authorization-migration-contract.test.ts`
- `apps/api/src/repositories/douyin-miniapp-authorization-intents.ts`
- `apps/api/src/repositories/douyin-miniapp-authorization-intents.test.ts`
- `apps/api/src/services/tenant-douyin-miniapp/authorization.ts`
- `apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts`
- `apps/api/src/services/tenant-douyin-miniapp/releases.ts`
- `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`
- `apps/admin/components/douyin-miniapp/workspace-actions.tsx`
- `apps/admin/components/douyin-miniapp/workspace-actions.test.ts`

Modify:

- `apps/api/src/gateways/douyin-open-platform/client.ts`
- `apps/api/src/gateways/douyin-open-platform/client.test.ts`
- `apps/api/src/repositories/douyin-authorization-events.ts`
- `apps/api/src/services/douyin-miniapp/authorization-events.ts`
- `apps/api/src/services/douyin-miniapp/authorization-events.test.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`
- `apps/api/src/schema/tenant-douyin-miniapp.ts`
- `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`
- `apps/admin/components/douyin-miniapp/workspace.tsx`
- `apps/admin/components/douyin-miniapp/workspace-types.ts`

## Task 1: Add Authorization Intents and Race-Safe Correlation

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/api/src/services/tenant-douyin-miniapp/authorization-migration-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726110000_tenant_douyin_authorization_intents.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("tenant douyin authorization intent migration", () => {
  test("stores only an opaque intent digest and authorization code digest", () => {
    expect(sql).toContain("CREATE TABLE public.douyin_miniapp_authorization_intents");
    expect(sql).toContain("intent_digest text NOT NULL UNIQUE");
    expect(sql).toContain("authorization_code_digest text NULL UNIQUE");
    expect(sql).not.toContain("authorization_code text");
  });

  test("correlates event delivery by code digest", () => {
    expect(sql).toContain(
      "ALTER TABLE public.douyin_authorization_event_deliveries ADD COLUMN authorization_code_digest text NULL",
    );
  });

  test("binds an authorized installation to the intent tenant atomically", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.complete_tenant_douyin_authorization_intent",
    );
    expect(sql).toContain("DOUYIN_AUTHORIZATION_INTENT_CONFLICT");
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/authorization-migration-contract.test.ts
```

Expected: FAIL because the migration is missing.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260726110000_tenant_douyin_authorization_intents.sql`.

The table must contain:

```sql
CREATE TABLE public.douyin_miniapp_authorization_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  requested_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  component_appid text NOT NULL REFERENCES public.douyin_third_party_components(component_appid),
  intent_digest text NOT NULL UNIQUE,
  authorization_code_digest text NULL UNIQUE,
  authorizer_appid text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completing', 'completed', 'expired', 'failed')),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  CHECK (authorization_code_digest IS NULL OR authorization_code_digest ~ '^[0-9a-f]{64}$')
);
```

Add:

- one pending intent per tenant partial unique index;
- expiry lookup index;
- `authorization_code_digest` on `douyin_authorization_event_deliveries`;
- digest format constraint and index;
- RLS enabled and no direct client grants;
- claim, attach-code, complete, and fail RPCs;
- `complete_tenant_douyin_authorization_intent` locks intent, installation, component, and tenant in a documented fixed order;
- completion allows an existing `authorized_unbound` merchant installation or the same tenant's active merchant installation;
- completion generates no deployment key in SQL; the API supplies the generated key and validated runtime config;
- conflicting tenant or a second active merchant installation returns `DOUYIN_AUTHORIZATION_INTENT_CONFLICT`.

Rollback must disable tenant authorization endpoints first, then drop the RPCs/table/index and event digest column.

- [ ] **Step 4: Run the contract test**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/authorization-migration-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726110000_tenant_douyin_authorization_intents.sql \
  apps/api/src/services/tenant-douyin-miniapp/authorization-migration-contract.test.ts
git commit -m "feat(db): add tenant douyin authorization intents"
```

Do not apply the migration in this task.

## Task 2: Add the Official Direct Authorization Link Gateway

- [ ] **Step 1: Add failing gateway tests**

In `apps/api/src/gateways/douyin-open-platform/client.test.ts`:

```ts
test("generates a V3 authorization-only link", async () => {
  const fetch = mock(async () => jsonResponse({
    err_no: 0,
    err_msg: "",
    log_id: "auth-link-log",
    data: { link: "https://open.douyin.com/authorize/example" },
  }));
  const client = new DouyinOpenPlatformClient({ fetch });

  await expect(client.generateAuthorizationLink({
    componentAccessToken: "component-token",
    redirectUri: "https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback?intent=opaque",
  })).resolves.toEqual({
    link: "https://open.douyin.com/authorize/example",
    logId: "auth-link-log",
  });

  expect(fetch).toHaveBeenCalledWith(
    "https://open.douyin.com/api/tpapp/v3/auth/gen_link/",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "access-token": "component-token" }),
      body: JSON.stringify({
        link_type: 1,
        redirect_uri: "https://admin-dev.goodcms.cn/douyin-miniapp/authorize/callback?intent=opaque",
      }),
    }),
  );
});
```

Also test invalid/non-HTTPS link responses and non-zero `err_no`.

- [ ] **Step 2: Run the gateway test**

```bash
bun test apps/api/src/gateways/douyin-open-platform/client.test.ts
```

Expected: FAIL because `generateAuthorizationLink` is missing.

- [ ] **Step 3: Implement the gateway method**

Extend the existing gateway interface and client:

```ts
async generateAuthorizationLink(input: {
  readonly componentAccessToken: string;
  readonly redirectUri: string;
}) {
  const response = await this.requestJson(
    "https://open.douyin.com/api/tpapp/v3/auth/gen_link/",
    {
      method: "POST",
      headers: {
        "access-token": input.componentAccessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        link_type: 1,
        redirect_uri: input.redirectUri,
      }),
    },
  );
  return parseAuthorizationLinkResponse(response);
}
```

Use strict Zod parsing and existing Open Platform error wrappers. Accept only HTTPS links with no embedded credentials.

- [ ] **Step 4: Run gateway tests**

```bash
bun test apps/api/src/gateways/douyin-open-platform/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/gateways/douyin-open-platform/client.ts \
  apps/api/src/gateways/douyin-open-platform/client.test.ts
git commit -m "feat(douyin): generate tenant authorization links"
```

## Task 3: Implement Tenant Authorization Service and Callback

- [ ] **Step 1: Write repository and service tests**

Create the authorization repository tests and `authorization.test.ts`. Cover:

```ts
test("creates a ten-minute opaque intent and returns a 24-hour Douyin link", async () => {
  const result = await service.startAuthorization(tenantContext());
  expect(intentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
    tenantId: TENANT_ID,
    requestedByEmployeeId: EMPLOYEE_ID,
    intentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
  }));
  expect(result.link).toMatch(/^https:\/\//);
  expect(result.intent_expires_at).toBeDefined();
});

test("never returns the raw intent stored in the database", async () => {
  await service.startAuthorization(tenantContext());
  expect(intentRepository.create.mock.calls[0][0].intentDigest).not.toBe(returnedOpaqueIntent);
});

test("completes callback through the event digest when event exchange won the race", async () => {
  gateway.exchangeAuthorizationCode.mockRejectedValueOnce(codeAlreadyUsedError());
  eventRepository.findAuthorizerByCodeDigest.mockResolvedValueOnce("tt-authorizer");
  installationRepository.findByAuthorizer.mockResolvedValueOnce(authorizedUnboundInstallation());
  await expect(service.completeAuthorizationCallback(input())).resolves.toMatchObject({
    status: "completed",
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bun test apps/api/src/repositories/douyin-miniapp-authorization-intents.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts
```

Expected: FAIL because the repository/service are missing.

- [ ] **Step 3: Implement the repository**

`DouyinMiniappAuthorizationIntentsRepository` must expose only:

```ts
type AuthorizationIntentRepositoryPort = {
  create(input: CreateIntentInput): Promise<AuthorizationIntentRecord>;
  claim(input: { intentDigest: string; authorizationCodeDigest: string }):
    Promise<AuthorizationIntentClaim>;
  complete(input: CompleteIntentInput): Promise<AuthorizationIntentRecord>;
  fail(input: { intentId: string; failureCode: string }): Promise<void>;
  findAuthorizerByCodeDigest(codeDigest: string): Promise<string | null>;
};
```

All mutations call migration RPCs. Do not write the table with ad hoc `.update()`.

- [ ] **Step 4: Implement the service**

Create `TenantDouyinMiniappAuthorizationService` with:

```ts
async startAuthorization(authContext: AuthContext) {
  const tenantId = this.accessPolicy.assertTenantId(authContext);
  this.accessPolicy.assertPermission(authContext, "douyin_miniapp.manage");
  const employeeId = requireEmployeeId(authContext);
  await this.assertNoActiveMerchantInstallation(tenantId);

  const opaqueIntent = randomBytes(32).toString("base64url");
  await this.intents.create({
    tenantId,
    requestedByEmployeeId: employeeId,
    componentAppId: this.config.componentAppId,
    intentDigest: sha256(opaqueIntent),
    expiresAt: addMinutes(this.now(), 10),
  });

  const componentAccessToken = await this.accessTokens.getComponentAccessToken();
  const redirectUri = this.redirectUri(opaqueIntent);
  const generated = await this.gateway.generateAuthorizationLink({
    componentAccessToken,
    redirectUri,
  });
  return { link: generated.link, intent_expires_at: addMinutes(this.now(), 10) };
}
```

Callback flow:

1. hash opaque intent and authorization code;
2. claim the intent atomically;
3. try exchange once;
4. if exchange succeeds, seal access/refresh tokens using existing credential-envelope helpers and complete the intent/binding RPC;
5. if exchange reports an already-consumed code, find the authorizer through event delivery digest and poll the installation for at most the existing Open Platform timeout budget;
6. complete binding with a newly generated deployment key and validated default runtime config;
7. never log raw code, opaque intent, access token, refresh token, or deployment key.

- [ ] **Step 5: Update authorization event correlation**

When processing `AUTHORIZED` or `UPDATE_AUTHORIZED`, compute SHA-256 of the authorization code and pass it into the event claim/finalization repository. If token exchange loses to the browser callback, treat an already active matching installation as completed instead of repeatedly retrying.

Add race-order tests for:

- event wins;
- callback wins;
- duplicate callback;
- expired intent;
- wrong tenant;
- second active merchant installation.

- [ ] **Step 6: Add controller routes**

Add:

```ts
@Post("/tenant/douyin-miniapp/authorization-link")
startAuthorization(...)

@Post("/tenant/douyin-miniapp/authorization-callback")
completeAuthorization(...)
```

The callback body schema is:

```ts
z.strictObject({
  intent: z.string().min(32).max(200),
  authorization_code: z.string().min(8).max(4096),
  expires_in: z.coerce.number().int().positive().max(7200),
});
```

The browser callback page reads the query parameters and POSTs them to the authenticated tenant API. It must never render or persist the authorization code.

- [ ] **Step 7: Run focused tests and commit**

```bash
bun test apps/api/src/repositories/douyin-miniapp-authorization-intents.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts \
  apps/api/src/services/douyin-miniapp/authorization-events.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/repositories/douyin-miniapp-authorization-intents* \
  apps/api/src/services/tenant-douyin-miniapp/authorization* \
  apps/api/src/services/douyin-miniapp/authorization-events* \
  apps/api/src/repositories/douyin-authorization-events.ts \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/schema/tenant-douyin-miniapp.ts
git commit -m "feat(douyin): complete tenant authorization flow"
```

## Task 4: Add Tenant Preview, Audit, and Sync Facades

- [ ] **Step 1: Write tenant release service tests**

Create `releases.test.ts` covering:

```ts
test("rejects a release owned by another tenant", async () => {
  repository.findReleaseTargetById.mockResolvedValue(releaseTarget(OTHER_TENANT_ID));
  await expect(service.getTestQr(tenantContext(TENANT_ID), RELEASE_ID))
    .rejects.toMatchObject({ statusCode: 404 });
});

test("allows audit submit with tenant permission but exposes no publish method", async () => {
  await service.submitAudit(
    tenantContext(TENANT_ID, ["douyin_miniapp.audit.submit"]),
    RELEASE_ID,
    auditInput,
  );
  expect(operations.submitAudit).toHaveBeenCalledTimes(1);
  expect("publish" in service).toBe(false);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/releases.test.ts
```

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement the tenant release facade**

Reuse `PlatformDouyinMiniappReleaseOperations`; do not copy upload/audit logic.

Expose:

```ts
list(authContext, query)
getTestQr(authContext, releaseId)
submitAudit(authContext, releaseId, input)
syncStatus(authContext, releaseId)
```

For every method:

- derive tenant ID from `AuthContext`;
- find the tenant's current active merchant installation server-side;
- verify the release belongs to that installation;
- require `douyin_miniapp.read`, `douyin_miniapp.manage`, or `douyin_miniapp.audit.submit`;
- sanitize the returned release;
- do not expose upload or publish.

The audit preflight must require active authorization, development permission, published service-provider profile, a test QR URL, and complete audit inputs.

- [ ] **Step 4: Add routes**

Add paginated release list and actions:

```text
GET  /tenant/douyin-miniapp/releases?page=1&pageSize=20
POST /tenant/douyin-miniapp/releases/:releaseId/test-qr
POST /tenant/douyin-miniapp/releases/:releaseId/submit-audit
POST /tenant/douyin-miniapp/releases/:releaseId/sync-status
```

Use existing release input schemas where their platform-specific fields are safe; otherwise define strict tenant schemas.

- [ ] **Step 5: Run tests and commit**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/releases.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/services/tenant-douyin-miniapp/releases* \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/schema/tenant-douyin-miniapp.ts
git commit -m "feat(api): add tenant douyin release actions"
```

## Task 5: Add Admin Authorization, Preview, and Audit Interactions

- [ ] **Step 1: Run UI context and component docs**

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs button badge alert dialog field input skeleton
```

Expected: successful metadata and docs. Do not add or overwrite components.

- [ ] **Step 2: Write pure action-state tests**

Create `workspace-actions.test.ts`:

```ts
test("does not offer publish to tenant users", () => {
  expect(availableWorkspaceActions(approvedWorkspace())).toEqual([
    "sync_status",
  ]);
});

test("requires every audit checklist item", () => {
  expect(canSubmitAudit({
    authorizationActive: true,
    profilePublished: true,
    testQrReady: true,
    auditFieldsComplete: false,
  })).toBe(false);
});
```

- [ ] **Step 3: Implement action components**

`workspace-actions.tsx` must include:

- “授权抖音小程序” opens the returned link in a new browser tab;
- callback page immediately exchanges query parameters and then removes them from browser history;
- “生成体验二维码” shows a disabled/loading state and then a QR image;
- “提交审核” opens a dialog with Field-based inputs and the checklist;
- “同步审核状态” keeps the last trusted status visible while pending;
- no publish button, upload form, template ID, or platform credential.

Use `sonner` only for transient success. Render validation and platform errors inline with `Alert`.

- [ ] **Step 4: Add callback page**

Create:

```text
apps/admin/app/(console)/douyin-miniapp/authorize/callback/page.tsx
apps/admin/components/douyin-miniapp/authorization-callback.tsx
```

The client component must:

```ts
const params = new URLSearchParams(window.location.search);
const payload = {
  intent: params.get("intent"),
  authorization_code: params.get("authorization_code"),
  expires_in: params.get("expires_in"),
};
window.history.replaceState({}, "", "/douyin-miniapp/authorize/callback");
```

Validate all values before POST. After success, redirect to `/douyin-miniapp/workspace`. On failure, show a recoverable error and a workspace link without printing the code.

- [ ] **Step 5: Run Admin tests and checks**

```bash
bun test apps/admin/components/douyin-miniapp/workspace-actions.test.ts
pnpm --dir apps/admin check
```

Expected: PASS and exit `0`.

- [ ] **Step 6: Browser smoke and commit**

Verify loading, popup-blocked, callback success, expired intent, QR success, audit preflight failure, audit submit, audit rejected, and sync failure. Confirm network responses contain no secrets.

```bash
git add 'apps/admin/app/(console)/douyin-miniapp' \
  apps/admin/components/douyin-miniapp
git commit -m "feat(admin): add douyin authorization and audit flow"
```

## Task 6: Phase 2 Verification Gate

- [ ] **Step 1: Run complete checks**

```bash
bun test apps/api/src/gateways/douyin-open-platform/client.test.ts \
  apps/api/src/services/tenant-douyin-miniapp \
  apps/api/src/services/douyin-miniapp/authorization-events.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp
bun run api:check
pnpm --dir apps/admin check
```

Expected: all exit `0`.

- [ ] **Step 2: Migration authorization gate**

Present `20260726110000_tenant_douyin_authorization_intents.sql`, its rollback, and dirty-data checks. Apply only to the explicitly authorized development database, then:

```bash
supabase migration list
```

Expected: Local/Remote aligned through `20260726110000`.

- [ ] **Step 3: Real authorization smoke**

Using a test tenant and test miniapp:

1. create one authorization link;
2. complete mobile authorization;
3. verify the installation binds to the initiating tenant;
4. verify a second active merchant bind fails;
5. generate test QR;
6. submit audit;
7. sync status;
8. verify platform-only publish still returns `403` to tenant credentials.

- [ ] **Step 4: Record evidence**

Create and commit `docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-phase2.md`.

Phase 2 exit gate: tenant authorization, preview, audit submit, and sync work without leaking credentials, while formal publish remains platform-only.
