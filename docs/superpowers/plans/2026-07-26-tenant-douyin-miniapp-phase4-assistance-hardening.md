# Tenant Douyin Miniapp Phase 4 Assistance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a traceable platform-assistance workflow, close security and performance gaps, verify every UI state, and produce a controlled development rollout package.

**Architecture:** Add a small support-request ledger with atomic lifecycle RPCs, tenant and platform service facades, and a platform queue. Finish with contract tests, response-secret scanning, performance checks, browser/mobile smoke, and deployment evidence.

**Tech Stack:** PostgreSQL migration/RPC, existing platform audit log and notification services, Fastify, Next.js, shadcn/Radix, Bun checks, Playwright/browser smoke.

---

## File Map

Create:

- `supabase/migrations/20260726130000_create_douyin_miniapp_support_requests.sql`
- `apps/api/src/services/tenant-douyin-miniapp/support-migration-contract.test.ts`
- `apps/api/src/repositories/douyin-miniapp-support-requests.ts`
- `apps/api/src/repositories/douyin-miniapp-support-requests.test.ts`
- `apps/api/src/services/tenant-douyin-miniapp/support.ts`
- `apps/api/src/services/tenant-douyin-miniapp/support.test.ts`
- `apps/api/src/services/platform-douyin-miniapp-support.ts`
- `apps/api/src/services/platform-douyin-miniapp-support.test.ts`
- `apps/api/src/schema/douyin-miniapp-support.ts`
- `apps/api/src/controllers/platform-douyin-miniapp-support/index.ts`
- `apps/api/src/controllers/platform-douyin-miniapp-support/index.test.ts`
- `apps/admin/components/douyin-miniapp/support-panel.tsx`
- `apps/admin/components/douyin-miniapp/support-display.ts`
- `apps/admin/components/douyin-miniapp/support-display.test.ts`
- `apps/admin/app/(console)/platform/douyin-miniapps/support/page.tsx`
- `apps/admin/app/(console)/platform/douyin-miniapps/support/loading.tsx`
- `apps/admin/components/platform-douyin-miniapp-support/support-list.tsx`
- `apps/api/src/scripts/tenant-douyin-miniapp-readiness.ts`
- `apps/api/src/scripts/tenant-douyin-miniapp-readiness.test.ts`
- `docs/operations/runbooks/tenant-douyin-miniapp-rollout.md`

Modify:

- `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- `apps/api/src/services/platform-audit-logs.ts` only if a public recording method is missing
- `apps/admin/components/douyin-miniapp/workspace.tsx`
- `apps/admin/components/layout/menu-config.ts`
- `apps/api/package.json`

## Task 1: Add the Support Request Ledger

- [ ] **Step 1: Write the failing migration contract**

Create `support-migration-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726130000_create_douyin_miniapp_support_requests.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("douyin support request migration", () => {
  test("creates a tenant-bound request ledger with atomic lifecycle commands", () => {
    expect(sql).toContain("CREATE TABLE public.douyin_miniapp_support_requests");
    for (const command of [
      "create_douyin_miniapp_support_request",
      "claim_douyin_miniapp_support_request",
      "resolve_douyin_miniapp_support_request",
      "cancel_douyin_miniapp_support_request",
    ]) {
      expect(sql).toContain(`FUNCTION public.${command}`);
    }
  });

  test("prevents duplicate open requests for the same incident", () => {
    expect(sql).toContain(
      "CREATE UNIQUE INDEX douyin_miniapp_support_requests_open_incident_unique",
    );
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/support-migration-contract.test.ts
```

Expected: FAIL because the migration is missing.

- [ ] **Step 3: Create the migration**

Create `20260726130000_create_douyin_miniapp_support_requests.sql`:

```sql
CREATE TABLE public.douyin_miniapp_support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  installation_id uuid NOT NULL REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT,
  release_id uuid NULL REFERENCES public.douyin_miniapp_releases(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (
    category IN ('authorization', 'runtime', 'preview', 'audit', 'status_sync')
  ),
  error_code text NOT NULL CHECK (error_code ~ '^[A-Z0-9_]{3,100}$'),
  description text NOT NULL CHECK (btrim(description) <> '' AND length(description) <= 1000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
  requested_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  assigned_platform_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  resolution text NULL CHECK (resolution IS NULL OR length(resolution) <= 2000),
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Add:

- tenant/install/category/error/status indexes;
- unique open incident index over installation, category, error code where status is open or in progress;
- RLS and service-role-only access;
- create RPC verifies installation belongs to tenant;
- claim/resolve RPC requires platform employee input and locks row;
- cancel RPC requires the same tenant and only cancels `open`;
- idempotent create returns the existing open request;
- updated-at trigger;
- rollback that disables endpoints before dropping RPCs/table/indexes.

- [ ] **Step 4: Run test and commit**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/support-migration-contract.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/20260726130000_create_douyin_miniapp_support_requests.sql \
  apps/api/src/services/tenant-douyin-miniapp/support-migration-contract.test.ts
git commit -m "feat(db): add douyin miniapp support requests"
```

Do not apply the migration in this task.

## Task 2: Add Tenant and Platform Support Services

- [ ] **Step 1: Write repository/service tests**

Cover:

```ts
test("tenant create derives tenant and current installation", async () => {
  await tenantService.create(tenantContext(TENANT_ID), input());
  expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
    tenantId: TENANT_ID,
    installationId: INSTALLATION_ID,
    requestedByEmployeeId: EMPLOYEE_ID,
  }));
});

test("platform list requires global douyin manage permission", async () => {
  await expect(platformService.list(platformContextWithoutPermission(), query()))
    .rejects.toMatchObject({ statusCode: 403 });
});

test("tenant cannot resolve and platform cannot create as tenant", () => {
  expect("resolve" in tenantService).toBe(false);
  expect("create" in platformService).toBe(false);
});
```

- [ ] **Step 2: Implement repository**

Expose:

```ts
create(input)
listTenant(input)
cancel(input)
listPlatform(input)
claim(input)
resolve(input)
```

Every list is paginated. Select tenant and installation display metadata in one query; no N+1.

- [ ] **Step 3: Implement tenant service**

Tenant routes require `douyin_miniapp.read`; create also requires `douyin_miniapp.manage`. Only allow error codes from the server-known workspace/release error allowlist. Do not let the browser submit arbitrary logs, headers, URLs, or secret-bearing payloads.

Routes:

```text
GET  /tenant/douyin-miniapp/support-requests?page=1&pageSize=20
POST /tenant/douyin-miniapp/support-requests
POST /tenant/douyin-miniapp/support-requests/:id/cancel
```

- [ ] **Step 4: Implement platform service**

Require platform admin, employee ID, and `platform.douyin_miniapp.manage` scope `all`.

Routes:

```text
GET  /platform/douyin-miniapps/support-requests
POST /platform/douyin-miniapps/support-requests/:id/claim
POST /platform/douyin-miniapps/support-requests/:id/resolve
```

Record claim and resolve actions through the existing platform audit log service with request ID, tenant ID, installation ID, category, and error code. Never record secret values.

- [ ] **Step 5: Run tests and commit**

```bash
bun test apps/api/src/repositories/douyin-miniapp-support-requests.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/support.test.ts \
  apps/api/src/services/platform-douyin-miniapp-support.test.ts \
  apps/api/src/controllers/platform-douyin-miniapp-support/index.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/repositories/douyin-miniapp-support-requests* \
  apps/api/src/services/tenant-douyin-miniapp/support* \
  apps/api/src/services/platform-douyin-miniapp-support* \
  apps/api/src/schema/douyin-miniapp-support.ts \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/controllers/platform-douyin-miniapp-support
git commit -m "feat(api): add douyin support workflow"
```

## Task 3: Add Tenant Support Panel and Platform Queue

- [ ] **Step 1: Run UI context and component docs**

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs alert badge button dialog field textarea table skeleton empty
```

Expected: successful metadata/docs; no component overwrite.

- [ ] **Step 2: Write display tests**

Create `support-display.test.ts`:

```ts
test("maps each support state to text and semantic badge", () => {
  expect(supportStatusMeta("open")).toEqual({
    label: "等待平台处理",
    variant: "warning",
  });
  expect(supportStatusMeta("resolved")).toEqual({
    label: "已解决",
    variant: "success",
  });
});

test("offers assistance only for allowlisted recoverable errors", () => {
  expect(canRequestSupport("DOUYIN_AUDIT_REJECTED")).toBe(true);
  expect(canRequestSupport("DOUYIN_COMPONENT_APP_SECRET")).toBe(false);
});
```

- [ ] **Step 3: Implement tenant support panel**

Place a flat section at the end of the existing workspace card. Show current requests, latest resolution, and “申请平台协助” only when the workspace has an allowlisted error or abnormal state.

The create dialog uses:

- read-only category and error code;
- optional description, maximum 1000 characters;
- explicit statement that credentials and screenshots containing secrets must not be pasted;
- disabled/loading/error states.

- [ ] **Step 4: Implement platform queue**

Create a single-card paginated queue with status/category filters, tenant name, app name, error code, age, assigned operator, and fixed right action column. Claim and resolve use dialogs with explicit confirmation and resolution text.

Add a platform menu item guarded by `platform.douyin_miniapp.manage`.

- [ ] **Step 5: Run checks, browser smoke, and commit**

```bash
bun test apps/admin/components/douyin-miniapp/support-display.test.ts
pnpm --dir apps/admin check
```

Verify empty, duplicate open request, claim conflict, long description, resolved request, permission denied, and narrow width.

```bash
git add apps/admin/components/douyin-miniapp \
  'apps/admin/app/(console)/platform/douyin-miniapps/support' \
  apps/admin/components/platform-douyin-miniapp-support \
  apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): add douyin support workflow"
```

## Task 4: Add a Readiness Script and Security Contracts

- [ ] **Step 1: Write readiness tests**

Create `tenant-douyin-miniapp-readiness.test.ts` with a fake gateway/repository. Cover:

```ts
test("fails when tenant has multiple active merchant installations", async () => {
  const report = await checkReadiness(fixture({ activeMerchantCount: 2 }));
  expect(report.failures).toContain("multiple_active_merchant_installations");
});

test("fails when tenant response schemas expose secret field names", async () => {
  const report = await checkReadiness(fixture({
    responseKeys: ["installation_id", "deployment_key"],
  }));
  expect(report.failures).toContain("tenant_response_secret_field");
});
```

- [ ] **Step 2: Implement readiness checks**

The script is read-only and reports JSON:

```ts
type ReadinessReport = {
  checked_at: string;
  environment: string;
  checks: Array<{ name: string; status: "pass" | "fail"; detail: string }>;
  failures: string[];
};
```

Checks:

- migration history expected versions present;
- no duplicate active merchant installation;
- active installations have active tenant and required development permission;
- published profile exists for online installations;
- latest release state is structurally valid;
- tenant response schemas contain no secret field names;
- lead list indexes exist;
- support queue indexes exist.

Do not print row secrets, phones, tokens, runtime config, or deployment keys.

- [ ] **Step 3: Add package command**

In `apps/api/package.json`:

```json
"douyin:tenant-readiness": "bun --env-file=.env src/scripts/tenant-douyin-miniapp-readiness.ts"
```

- [ ] **Step 4: Add static secret-boundary tests**

Add tests that serialize every tenant workspace, release, lead, and support schema and assert these substrings are absent:

```text
component_app_secret
component_access_token
authorizer_access_token
authorizer_refresh_token
deployment_key
message_token
message_aes_key
credential_ciphertext
```

- [ ] **Step 5: Run tests and commit**

```bash
bun test apps/api/src/scripts/tenant-douyin-miniapp-readiness.test.ts \
  apps/api/src/services/tenant-douyin-miniapp
bun run api:check
```

Expected: PASS and exit `0`.

```bash
git add apps/api/src/scripts/tenant-douyin-miniapp-readiness* \
  apps/api/package.json \
  apps/api/src/services/tenant-douyin-miniapp
git commit -m "test(douyin): add tenant rollout readiness checks"
```

## Task 5: Complete Product UI Audit

- [ ] **Step 1: Run static Admin checks**

```bash
pnpm --dir apps/admin check
```

Expected: exit `0`.

- [ ] **Step 2: Run the required UI skill audit**

Apply:

- `$shadcn`: verify actual component APIs, group composition, Field validation, dialog titles, semantic tokens, and no unreviewed component overwrite;
- `$design-taste-frontend`: run its preflight only where relevant to product UI, especially no template cards, no decorative motion, complete states, contrast, and copy review;
- `$impeccable`: run product register audit for hierarchy, density, permissions, error recovery, responsive structure, and accessibility;
- `admin-design`: verify flat list workspace, fixed toolbar/footer, table scroll, Gooes tokens, and no nested cards.

- [ ] **Step 3: Browser matrix**

Capture and review:

```text
1440x900: workspace active, audit rejected, lead list
1280x720: workspace and platform support queue
768x1024: workspace and lead detail
390x844: filters wrapped, table horizontal scroll, dialogs
```

For each width verify:

- no clipped labels or buttons;
- visible keyboard focus;
- loading skeleton matches final layout;
- empty state teaches next action;
- errors stay near the affected section;
- permission-disabled actions explain why;
- reduced-motion mode removes nonessential transitions;
- long Chinese public name, audit reason, lead demand, and support description wrap safely.

- [ ] **Step 4: Fix only confirmed UI defects**

Apply small scoped patches. Do not change information architecture or introduce new dependencies. Re-run `pnpm --dir apps/admin check` after each patch group.

- [ ] **Step 5: Commit audit fixes**

```bash
git add apps/admin/app apps/admin/components
git commit -m "fix(admin): harden tenant douyin workspace states"
```

Stage only files actually changed by the audit.

## Task 6: Development Rollout and Evidence

- [ ] **Step 1: Run all static and focused verification**

```bash
bun test apps/api/src/gateways/douyin-open-platform \
  apps/api/src/services/douyin-miniapp \
  apps/api/src/services/tenant-douyin-miniapp \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/controllers/platform-douyin-miniapp-support \
  apps/admin/components/douyin-miniapp \
  apps/admin/components/platform-douyin-miniapp-support
bun run api:check
pnpm --dir apps/admin check
bun run douyin-mini:check
bun run check:permission-boundaries
```

Expected: all commands exit `0`.

- [ ] **Step 2: Migration authorization gate**

List all still-pending Phase 1-4 migrations and apply only to the explicitly authorized development database. Never use `repair` or manual DDL/DML.

After application:

```bash
supabase migration list
```

Expected: Local/Remote aligned through `20260726130000`.

- [ ] **Step 3: Run readiness**

```bash
cd apps/api
bun --env-file=.env src/scripts/tenant-douyin-miniapp-readiness.ts
```

Expected: JSON report with no failures.

- [ ] **Step 4: API and Admin smoke**

Verify with one platform operator, one tenant admin, one tenant operator, and two sales users:

- tenant isolation;
- permission delegation;
- authorization and reauthorization;
- preview, audit submit, sync, and platform publish boundary;
- new lead notification;
- assignment and own-data scope;
- follow-up, close, conversion, and idempotent retry;
- support request, platform claim, and resolution.

- [ ] **Step 5: Mobile miniapp smoke**

Cold-start scan the current test QR and verify:

- tenant public name and brand;
- published case list/detail;
- active site list/detail;
- consultation submission;
- Admin lead arrival and notification;
- content update without code re-upload.

- [ ] **Step 6: Write rollout runbook**

Create `docs/operations/runbooks/tenant-douyin-miniapp-rollout.md` containing:

- required environment variables by name only;
- required Douyin domains and callback URLs;
- migration order;
- readiness command;
- deployment order API then Admin;
- smoke actors and test tenant;
- rollback: disable tenant navigation/operations, retain data, roll back API/Admin version, do not drop lead/customer facts;
- support escalation data: time, request ID, sanitized error code, installation ID, release ID, Douyin log ID.

- [ ] **Step 7: Record and commit final evidence**

Create `docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-final.md` with commit SHAs, migration alignment, deployment revision, readiness JSON, browser screenshots, mobile result, and remaining non-blocking risks.

```bash
git add docs/operations/runbooks/tenant-douyin-miniapp-rollout.md \
  docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-final.md
git commit -m "docs(douyin): record tenant workspace rollout"
```

Phase 4 exit gate: support workflow, security boundaries, performance, UI quality, Admin roles, and mobile flow are verified with reproducible evidence.
