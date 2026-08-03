# Tenant Douyin Miniapp Phase 1 Workspace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant permissions, enforce one active merchant miniapp per tenant, and ship a read-only tenant workspace that safely aggregates installation, public profile, content counts, and version state.

**Architecture:** Add migration-backed permissions and a partial unique index, then expose a tenant-scoped repository/service/controller. The Admin page is a server-loaded shell with focused client components and no mutation controls in this phase.

**Tech Stack:** PostgreSQL migration, Bun tests, Fastify decorators, Zod, Supabase repository, Next.js App Router, shadcn/Radix, Tailwind CSS.

---

## File Map

Create:

- `supabase/migrations/20260726100000_tenant_douyin_workspace_foundation.sql`
- `apps/api/src/services/tenant-douyin-miniapp/foundation-migration-contract.test.ts`
- `apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts`
- `apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts`
- `apps/api/src/services/tenant-douyin-miniapp/workspace.ts`
- `apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts`
- `apps/api/src/schema/tenant-douyin-miniapp.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`
- `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`
- `apps/admin/app/(console)/douyin-miniapp/workspace/loading.tsx`
- `apps/admin/components/douyin-miniapp/workspace-types.ts`
- `apps/admin/components/douyin-miniapp/workspace-display.ts`
- `apps/admin/components/douyin-miniapp/workspace-display.test.ts`
- `apps/admin/components/douyin-miniapp/workspace.tsx`

Modify:

- `apps/admin/components/layout/menu-config.ts`
- `apps/admin/components/layout/admin-nav-utils.test.ts`
- `apps/api/src/types/database.ts` only after an authorized migration or local type generation

## Task 1: Contract-Test the Foundation Migration

- [ ] **Step 1: Write the failing migration contract test**

Create `apps/api/src/services/tenant-douyin-miniapp/foundation-migration-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726100000_tenant_douyin_workspace_foundation.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("tenant douyin workspace foundation migration", () => {
  test("seeds tenant permissions for system administrators", () => {
    for (const code of [
      "douyin_miniapp.read",
      "douyin_miniapp.manage",
      "douyin_miniapp.audit.submit",
      "douyin_lead.read",
      "douyin_lead.assign",
      "douyin_lead.follow_up",
      "douyin_lead.convert",
    ]) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain("WHERE role.code = 'system_admin'");
  });

  test("rejects dirty data before creating one-active-merchant index", () => {
    expect(migration).toContain("DOUYIN_TENANT_MULTIPLE_ACTIVE_MERCHANT_INSTALLATIONS");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX douyin_miniapp_installations_one_active_merchant_per_tenant",
    );
    expect(migration).toContain(
      "WHERE tenant_id IS NOT NULL AND installation_kind = 'merchant' AND authorization_status = 'active'",
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing migration failure**

Run:

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/foundation-migration-contract.test.ts
```

Expected: FAIL because `20260726100000_tenant_douyin_workspace_foundation.sql` does not exist.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260726100000_tenant_douyin_workspace_foundation.sql` with:

```sql
BEGIN;

INSERT INTO public.permissions(code, name, module, resource, action, description, status)
VALUES
  ('douyin_miniapp.read', '查看抖音小程序', 'douyin_miniapp', 'douyin_miniapp', 'read', '查看租户抖音小程序工作台', 'active'),
  ('douyin_miniapp.manage', '管理抖音小程序', 'douyin_miniapp', 'douyin_miniapp', 'manage', '发起授权和生成体验二维码', 'active'),
  ('douyin_miniapp.audit.submit', '提交抖音审核', 'douyin_miniapp', 'douyin_miniapp', 'audit_submit', '提交抖音小程序审核', 'active'),
  ('douyin_lead.read', '查看抖音线索', 'douyin_miniapp', 'douyin_lead', 'read', '查看权限范围内的抖音线索', 'active'),
  ('douyin_lead.assign', '分配抖音线索', 'douyin_miniapp', 'douyin_lead', 'assign', '分配和改派抖音线索负责人', 'active'),
  ('douyin_lead.follow_up', '跟进抖音线索', 'douyin_miniapp', 'douyin_lead', 'follow_up', '记录抖音线索跟进', 'active'),
  ('douyin_lead.convert', '转化抖音线索', 'douyin_miniapp', 'douyin_lead', 'convert', '将抖音线索转为客户', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions(role_id, permission_id, access_scope)
SELECT role.id, permission.id, 'all'
FROM public.roles AS role
JOIN public.permissions AS permission
  ON permission.code IN (
    'douyin_miniapp.read',
    'douyin_miniapp.manage',
    'douyin_miniapp.audit.submit',
    'douyin_lead.read',
    'douyin_lead.assign',
    'douyin_lead.follow_up',
    'douyin_lead.convert'
  )
WHERE role.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE
SET access_scope = EXCLUDED.access_scope;

DO $$
BEGIN
  IF EXISTS (
    SELECT installation.tenant_id
    FROM public.douyin_miniapp_installations AS installation
    WHERE installation.tenant_id IS NOT NULL
      AND installation.installation_kind = 'merchant'
      AND installation.authorization_status = 'active'
    GROUP BY installation.tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_MULTIPLE_ACTIVE_MERCHANT_INSTALLATIONS';
  END IF;
END;
$$;

CREATE UNIQUE INDEX douyin_miniapp_installations_one_active_merchant_per_tenant
ON public.douyin_miniapp_installations(tenant_id)
WHERE tenant_id IS NOT NULL
  AND installation_kind = 'merchant'
  AND authorization_status = 'active';

COMMIT;
```

Rollback:

```sql
DROP INDEX IF EXISTS public.douyin_miniapp_installations_one_active_merchant_per_tenant;
DELETE FROM public.role_permissions
WHERE permission_id IN (
  SELECT id FROM public.permissions
  WHERE code LIKE 'douyin_miniapp.%' OR code LIKE 'douyin_lead.%'
);
DELETE FROM public.permissions
WHERE code LIKE 'douyin_miniapp.%' OR code LIKE 'douyin_lead.%';
```

- [ ] **Step 4: Run the contract test**

Run:

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/foundation-migration-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726100000_tenant_douyin_workspace_foundation.sql \
  apps/api/src/services/tenant-douyin-miniapp/foundation-migration-contract.test.ts
git commit -m "feat(db): add tenant douyin workspace foundation"
```

Do not run `db push` in this task.

## Task 2: Add the Tenant-Safe Workspace Repository

- [ ] **Step 1: Write repository tests**

Create `apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts`. Use a query stub to assert:

```ts
test("selects only tenant-safe installation fields", async () => {
  const repository = new TenantDouyinMiniappWorkspaceRepository(fakeClient());
  await repository.findCurrentInstallation(TENANT_ID);
  expect(selects).toEqual([
    "id,authorizer_appid,installation_kind,authorization_status,permission_snapshot,runtime_config,template_version,template_release_id,created_at,updated_at",
  ]);
  expect(selects.join(",")).not.toMatch(
    /deployment_key|access_token|refresh_token|ciphertext|component_appid/,
  );
});

test("loads the internal tenant name separately from the public brand name", async () => {
  const repository = new TenantDouyinMiniappWorkspaceRepository(fakeClient());
  await repository.findTenantSummary(TENANT_ID);
  expect(selects).toContain("id,name");
  expect(filters).toContainEqual(["tenants.id", TENANT_ID]);
});

test("counts public cases, active sites, and active service areas without loading rows", async () => {
  const repository = new TenantDouyinMiniappWorkspaceRepository(fakeClient());
  await repository.getPublicContentCounts(TENANT_ID);
  expect(headCountCalls).toEqual([
    ["projects", "cases"],
    ["projects", "sites"],
    ["tenant_service_areas", "active"],
  ]);
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bun test apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts
```

Expected: FAIL because the repository is missing.

- [ ] **Step 3: Implement the repository**

Create `apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts` with one class and focused methods:

```ts
export class TenantDouyinMiniappWorkspaceRepository {
  constructor(private readonly client: WorkspaceDatabaseClient = adminClient()) {}

  async findTenantSummary(tenantId: string) {
    return this.one(
      this.client.from("tenants")
        .select("id,name")
        .eq("id", tenantId),
      TenantSummarySchema,
      "查询租户信息失败",
    );
  }

  async findCurrentInstallation(tenantId: string) {
    return this.one(
      this.client.from("douyin_miniapp_installations")
        .select(SAFE_INSTALLATION_SELECT)
        .eq("tenant_id", tenantId)
        .eq("installation_kind", "merchant")
        .in("authorization_status", ["active", "disabled", "revoked"])
        .order("updated_at", { ascending: false })
        .limit(1),
      InstallationSchema,
      "查询租户抖音小程序失败",
    );
  }

  async findProfile(tenantId: string) {
    return this.one(
      this.client.from("tenant_service_provider_profiles")
        .select(PROFILE_SELECT)
        .eq("tenant_id", tenantId),
      ProfileSchema,
      "查询小程序公开资料失败",
    );
  }

  async findLatestRelease(installationId: string) {
    return this.one(
      this.client.from("douyin_miniapp_releases")
        .select(SAFE_RELEASE_SELECT)
        .eq("installation_id", installationId)
        .order("created_at", { ascending: false })
        .limit(1),
      ReleaseSchema,
      "查询抖音小程序版本失败",
    );
  }
}
```

`SAFE_INSTALLATION_SELECT` must contain only the fields asserted by the test. `SAFE_RELEASE_SELECT` may include version, status, test QR URL, audit note/result, timestamps, and must exclude internal operation claims and platform operator IDs.

Implement three `{ count: "exact", head: true }` queries: cases and sites use the same public filters as `DouyinMiniappContentRepository`, while service areas query `tenant_service_areas` by `tenant_id` and `status = 'active'`. The aggregate must expose the tenant's internal `tenants.name` separately from `tenant_service_provider_profiles.public_name`; never use one as an implicit fallback for the other.

- [ ] **Step 4: Run repository tests**

```bash
bun test apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts \
  apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts
git commit -m "feat(api): add tenant douyin workspace repository"
```

## Task 3: Add Workspace Service, Schema, and Controller

- [ ] **Step 1: Write service tests**

Create `apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts` covering:

```ts
test("requires tenant workspace read permission", async () => {
  const service = createService({ permissionScope: null });
  await expect(service.getWorkspace(tenantContext())).rejects.toMatchObject({
    statusCode: 403,
  });
});

test("uses auth tenant and returns no secret fields", async () => {
  const service = createService({ permissionScope: "all" });
  const result = await service.getWorkspace(tenantContext(TENANT_ID));
  expect(repository.findCurrentInstallation).toHaveBeenCalledWith(TENANT_ID);
  expect(JSON.stringify(result)).not.toMatch(
    /deployment_key|access_token|refresh_token|component_app_secret/,
  );
});

test("returns an explicit unbound workspace", async () => {
  const service = createService({ installation: null });
  expect(await service.getWorkspace(tenantContext())).toMatchObject({
    authorization_state: "unbound",
    installation: null,
    latest_release: null,
  });
});

test("keeps internal tenant identity and public miniapp identity distinct", async () => {
  const service = createService({
    tenant: { id: TENANT_ID, name: "后台租户名称" },
    profile: { public_name: "抖音公开品牌名" },
    counts: { cases: 3, sites: 2, active_service_areas: 1 },
  });
  expect(await service.getWorkspace(tenantContext())).toMatchObject({
    tenant: { id: TENANT_ID, name: "后台租户名称" },
    public_profile: { public_name: "抖音公开品牌名" },
    public_content: { cases: 3, sites: 2, active_service_areas: 1 },
  });
});
```

- [ ] **Step 2: Run service tests and verify failure**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts
```

Expected: FAIL because `workspace.ts` does not exist.

- [ ] **Step 3: Implement service and response schema**

Create `apps/api/src/schema/tenant-douyin-miniapp.ts` with strict Zod schemas for the safe aggregate. Create `apps/api/src/services/tenant-douyin-miniapp/workspace.ts`:

```ts
const READ_PERMISSION = "douyin_miniapp.read";

export class TenantDouyinMiniappWorkspaceService {
  constructor(
    private readonly repository = new TenantDouyinMiniappWorkspaceRepository(),
    private readonly accessPolicy = accessPolicyService,
  ) {}

  async getWorkspace(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantId(authContext);
    this.accessPolicy.assertPermission(authContext, READ_PERMISSION);

    const installation = await this.repository.findCurrentInstallation(tenantId);
    const [tenant, profile, counts, latestRelease] = await Promise.all([
      this.repository.findTenantSummary(tenantId),
      this.repository.findProfile(tenantId),
      this.repository.getPublicContentCounts(tenantId),
      installation
        ? this.repository.findLatestRelease(installation.id)
        : Promise.resolve(null),
    ]);

    return TenantDouyinWorkspaceSchema.parse(
      buildWorkspace({ tenant, installation, profile, counts, latestRelease }),
    );
  }
}
```

Keep status mapping in a pure exported `buildWorkspace` function so tests can cover combinations.

- [ ] **Step 4: Add controller tests and controller**

Create `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts` asserting exact route registration and `ResponseHandler.success`. Create the controller:

```ts
export class TenantDouyinMiniappController extends BaseController {
  constructor(private readonly workspace = tenantDouyinMiniappWorkspaceService) {
    super("tenant-douyin-miniapp");
  }

  @Get("/tenant/douyin-miniapp/workspace")
  async getWorkspace(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(await this.workspace.getWorkspace(authContext));
  }
}
```

Use the repository's established base controller class that exposes `getRequiredTenantContext`; do not duplicate authentication parsing.

- [ ] **Step 5: Run focused API tests**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-douyin-miniapp.ts \
  apps/api/src/services/tenant-douyin-miniapp/workspace.ts \
  apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
git commit -m "feat(api): expose tenant douyin workspace"
```

## Task 4: Add the Read-Only Admin Workspace

- [ ] **Step 1: Run the UI context gate**

From `apps/admin`:

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs badge card alert empty skeleton separator button
```

Expected: commands return the current Radix/shadcn project metadata and documentation URLs. Do not add or overwrite components.

- [ ] **Step 2: Write display tests**

Create `apps/admin/components/douyin-miniapp/workspace-display.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  authorizationLabel,
  releaseLabel,
  workspaceNextAction,
} from "./workspace-display";

describe("tenant douyin workspace display", () => {
  test("maps unbound workspace to authorization guidance", () => {
    expect(authorizationLabel("unbound")).toBe("未授权");
    expect(workspaceNextAction({ authorization_state: "unbound" })).toBe(
      "授权抖音小程序",
    );
  });

  test("keeps sync failure separate from audit failure", () => {
    expect(releaseLabel("sync_error")).toBe("状态同步失败");
    expect(releaseLabel("audit_rejected")).toBe("审核驳回");
  });
});
```

- [ ] **Step 3: Run the test and verify failure**

```bash
bun test apps/admin/components/douyin-miniapp/workspace-display.test.ts
```

Expected: FAIL because the display module is missing.

- [ ] **Step 4: Implement types, display mapping, and workspace**

Create the files from the File Map. `workspace.tsx` must render:

```tsx
<div className="flex min-h-0 flex-1 flex-col gap-4">
  <WorkspaceHeader workspace={workspace} />
  {loadError ? <Alert variant="destructive">...</Alert> : null}
  <Card className="min-h-0 flex-1 shadow-none">
    <CardHeader className="border-b">
      <WorkspaceStatusRow workspace={workspace} />
    </CardHeader>
    <CardContent className="flex flex-col gap-5 p-5">
      <PublicContentSummary workspace={workspace} />
      <Separator />
      <ReleaseSummary workspace={workspace} />
    </CardContent>
  </Card>
</div>
```

Use `Badge`, `Alert`, `Skeleton`, `Separator`, and `Button` from existing local UI components. Do not nest cards. Buttons for authorization, QR, and audit are disabled with “下一阶段开放” helper text in Phase 1.

`PublicContentSummary` must:

- display the internal tenant name and public miniapp brand name as two labeled fields;
- display counts for published cases, active sites, and active service areas;
- link “维护公开资料” to `/settings/service-provider`;
- link case/site maintenance to `/projects`;
- never imply that changing `tenants.name` immediately changes the public miniapp name.

- [ ] **Step 5: Add the page and navigation**

The server page must:

- require an Admin session;
- check `douyin_miniapp.read`;
- fetch only `/tenant/douyin-miniapp/workspace`;
- pass a typed error into the client workspace;
- never fetch platform endpoints.

Add to `apps/admin/components/layout/menu-config.ts`:

```ts
{
  label: "抖音小程序",
  items: [
    {
      href: "/douyin-miniapp/workspace",
      label: "小程序工作台",
      icon: AppWindow,
      permission: "douyin_miniapp.read",
    },
  ],
},
```

Update `admin-nav-utils.test.ts` to assert the menu is inactive without permission and active on the workspace route.

- [ ] **Step 6: Run Admin tests and checks**

```bash
bun test apps/admin/components/douyin-miniapp/workspace-display.test.ts \
  apps/admin/components/layout/admin-nav-utils.test.ts
pnpm --dir apps/admin check
```

Expected: all commands exit `0`.

- [ ] **Step 7: Commit**

```bash
git add 'apps/admin/app/(console)/douyin-miniapp/workspace' \
  apps/admin/components/douyin-miniapp \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/layout/admin-nav-utils.test.ts
git commit -m "feat(admin): add tenant douyin workspace"
```

## Task 5: Phase 1 Verification Gate

- [ ] **Step 1: Run focused and package checks**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp \
  apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp
bun run api:check
pnpm --dir apps/admin check
bun run check:permission-boundaries
```

Expected: all commands exit `0`.

- [ ] **Step 2: Inspect secrets in response contracts**

```bash
rg -n 'deployment_key|access_token|refresh_token|ciphertext|component_app_secret' \
  apps/api/src/schema/tenant-douyin-miniapp.ts \
  apps/admin/components/douyin-miniapp
```

Expected: no matches.

- [ ] **Step 3: Browser smoke**

Run the existing Admin dev command against development API and verify:

- no-permission state;
- unbound state;
- active installation state;
- long public name;
- profile pending review;
- latest release audit rejected;
- narrow viewport;
- no nested cards or overflow.

- [ ] **Step 4: Migration execution gate**

Do not apply the migration automatically. Present:

```text
Pending migration:
20260726100000_tenant_douyin_workspace_foundation.sql

Preflight:
No tenant may have more than one active merchant installation.

Rollback:
Drop the partial unique index, then remove seeded role permissions and permission rows.
```

Only after explicit environment-specific authorization, apply it to the development database and run:

```bash
supabase migration list
```

Expected: Local and Remote both show `20260726100000`.

- [ ] **Step 5: Record Phase 1 evidence**

Create `docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-phase1.md` with command outputs, migration alignment, tested tenant, and screenshots. Commit:

```bash
git add docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-phase1.md
git commit -m "docs(douyin): record tenant workspace phase1 evidence"
```

The partial unique index intentionally applies only to active `merchant` installations. Template-development installations may coexist because they belong to the platform's development workflow, not a tenant's single production merchant binding.

Phase 1 exit gate: the read-only tenant workspace works with tenant-safe responses, correct permissions, distinct internal/public names, service-area visibility, and one-active-merchant database protection.
