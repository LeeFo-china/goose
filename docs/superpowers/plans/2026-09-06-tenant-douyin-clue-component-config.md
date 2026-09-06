# Tenant Douyin Clue Component Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a tenant administrator to bind the current authorized Douyin miniapp's clue component ID and switch official-phone lead capture on or off, with SMS fallback and safe reset on AppID replacement.

**Architecture:** Store the AppID-bound component ID in a nullable installation column and keep the existing runtime feature union as the active-mode contract. A service-role-only atomic RPC performs tenant/AppID/CAS validation and updates both storage and runtime mode. A tenant controller/service/repository slice exposes only this operation, and a focused client component in the existing workspace manages the switch.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase/PostgreSQL migrations and RPC, Next.js, React, shadcn/Radix, Tailwind.

---

## File map

- Create `supabase/migrations/20260906101000_add_tenant_douyin_clue_component_config.sql`: installation column, backfill, invariant checks, atomic update RPC and ACL.
- Create `apps/api/src/services/tenant-douyin-miniapp/clue-config-migration-contract.test.ts`: immutable SQL/ACL/ordering contract.
- Modify `apps/api/src/types/database.ts`: official local type generation output.
- Modify `apps/api/src/schema/tenant-douyin-miniapp.ts`: strict PATCH request and response schemas; workspace installation component ID.
- Create `apps/api/src/schema/tenant-douyin-miniapp-clue-config.test.ts`: request/response strictness and mode coupling.
- Create `apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.ts`: RPC adapter and strict envelope parser.
- Create `apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.test.ts`: exact args, envelope, malformed/error redaction tests.
- Create `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.ts`: permission and current-installation orchestration.
- Create `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.test.ts`: permissions, scope, active state and conflicts.
- Modify `apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts`: select and parse stored component ID.
- Modify `apps/api/src/services/tenant-douyin-miniapp/workspace.ts`: expose the stored ID through the existing strict workspace DTO.
- Modify `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`: tenant PATCH route.
- Modify `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`: validation-before-auth and response wrapping.
- Modify `apps/api/src/services/tenant-douyin-miniapp/authorization.ts`: reset official-phone state when a different AppID is authorized.
- Modify `apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts`: replacement AppID reset coverage.
- Modify `apps/api/src/services/platform-douyin-miniapps.ts`: preserve merchant lead-capture runtime fields during platform-level general config edits.
- Modify `apps/api/src/services/platform-douyin-miniapps.test.ts`: platform ownership boundary coverage.
- Modify `apps/admin/components/douyin-miniapp/workspace-types.ts`: official-phone runtime union and stored component ID.
- Create `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx`: focused client settings panel.
- Create `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx`: validation, permissions, loading, error and success behavior.
- Modify `apps/admin/components/douyin-miniapp/workspace.tsx`: render the focused panel without adding state responsibilities to the 497-line overview.
- Modify `apps/admin/components/douyin-miniapp/workspace.test.tsx`: integration-level SSR contract.

### Task 1: Atomic database configuration command

- [ ] **Step 1: Write the failing migration contract test**

Create a focused test that reads `20260906101000_add_tenant_douyin_clue_component_config.sql` and asserts:

```ts
expect(sql).toContain("ADD COLUMN clue_component_id text");
expect(sql).toContain("LOCK TABLE public.douyin_miniapp_installations");
expect(sql).toContain("update_douyin_miniapp_lead_capture_config");
expect(sql).toContain("FOR UPDATE");
expect(sql).toContain("p_expected_updated_at");
expect(sql).toContain("p_authorizer_appid");
expect(sql).toContain("SECURITY DEFINER");
expect(sql).toContain("SET search_path = pg_catalog, public");
expect(sql).toContain("REVOKE ALL ON FUNCTION");
expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
```

Also assert the migration removes `clue_component_id` from SMS runtime features, includes it in official-phone runtime features, backfills only valid existing official configurations, and does not grant anon/authenticated execution.

- [ ] **Step 2: Run the migration contract and observe RED**

Run:

```bash
cd apps/api && bun test src/services/tenant-douyin-miniapp/clue-config-migration-contract.test.ts
```

Expected: FAIL because the migration file is absent.

- [ ] **Step 3: Implement the forward migration**

Add a nullable column with a validated safe ID constraint and an atomic function with this signature:

```sql
public.update_douyin_miniapp_lead_capture_config(
  p_tenant_id uuid,
  p_installation_id uuid,
  p_authorizer_appid text,
  p_expected_updated_at timestamptz,
  p_enabled boolean,
  p_clue_component_id text
) RETURNS jsonb
```

The function must lock the exact active merchant installation, return stable 400/404/409 error envelopes, preserve a stored ID when disabled with a null input, require a valid ID when enabled, update `runtime_config.features` without changing cases/sites, and return an exact data envelope. Use `GREATEST(clock_timestamp(), old.updated_at + interval '1 microsecond')` for a strictly advancing CAS token.

- [ ] **Step 4: Run local migration gates**

Run exact dry-run, apply, list alignment, catalog ACL checks, post-apply dry-run and official local type generation. Expected: only `20260906101000` is pending before apply; afterwards Local/Remote(local) align and dry-run is up to date.

- [ ] **Step 5: Run real PostgreSQL truth tests**

In a transaction, cover enabled update, disabled update preserving the ID, wrong tenant/AppID 404, stale timestamp 409, malformed ID 400, strict token advance and zero fixture residue after rollback. Verify service_role executes the RPC while anon/authenticated cannot.

- [ ] **Step 6: Commit the migration slice**

```bash
git add supabase/migrations/20260906101000_add_tenant_douyin_clue_component_config.sql \
  apps/api/src/services/tenant-douyin-miniapp/clue-config-migration-contract.test.ts \
  apps/api/src/types/database.ts
git commit -m "feat(douyin): 增加租户线索组件配置命令"
```

### Task 2: Tenant API contract and repository

- [ ] **Step 1: Write failing schema and repository tests**

Cover strict request fields, enabled-without-ID rejection, disabled nullable ID, exact response and RPC args:

```ts
{
  authorizer_appid: "ttd033a68e4e56ccd301",
  enabled: true,
  clue_component_id: "5785490b6443ad9def6f88e69c57920c",
  expected_updated_at: "2026-09-06T00:00:00.000Z"
}
```

Test malformed success/error envelopes and raw Supabase errors all become fixed safe application errors without `details`.

- [ ] **Step 2: Run focused tests and observe RED**

Run:

```bash
cd apps/api && bun test src/repositories/tenant-douyin-miniapp-lead-capture.test.ts src/schema/tenant-douyin-miniapp-clue-config.test.ts
```

Expected: FAIL for missing schemas and repository module.

- [ ] **Step 3: Implement strict schemas and RPC adapter**

Add `TenantDouyinLeadCaptureConfigUpdateSchema` with a `superRefine` requiring a component ID when enabled. Implement `TenantDouyinMiniappLeadCaptureRepository.update()` to call only the new RPC and parse the exact data/error union. No direct table update is allowed in this repository.

- [ ] **Step 4: Expose stored configuration in workspace DTO**

Add `clue_component_id` to `SAFE_INSTALLATION_SELECT` and both internal/public strict installation schemas. Extend existing workspace tests to prove disabled mode can carry a stored ID outside `runtime_config`, while old rows with null remain valid.

- [ ] **Step 5: Run repository/workspace tests GREEN**

Run:

```bash
cd apps/api && bun test src/repositories/tenant-douyin-miniapp-lead-capture.test.ts src/repositories/tenant-douyin-miniapp-workspace.test.ts src/services/tenant-douyin-miniapp/workspace.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the API data boundary**

```bash
git add apps/api/src/schema/tenant-douyin-miniapp.ts \
  apps/api/src/schema/tenant-douyin-miniapp-clue-config.test.ts \
  apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.ts \
  apps/api/src/repositories/tenant-douyin-miniapp-lead-capture.test.ts \
  apps/api/src/repositories/tenant-douyin-miniapp-workspace.ts \
  apps/api/src/repositories/tenant-douyin-miniapp-workspace.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/workspace.ts \
  apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts
git commit -m "feat(douyin): 暴露租户线索组件配置合同"
```

### Task 3: Tenant service, controller and AppID replacement safety

- [ ] **Step 1: Write failing service/controller tests**

Cover missing `douyin_miniapp.manage`, no tenant, no active merchant installation, mismatched AppID, enabled/disabled calls, stable 409 CAS mapping, validation before auth and exact `ResponseHandler.success` wrapping.

- [ ] **Step 2: Write the replacement-AppID regression test**

Start with a previous runtime configuration using `douyin_phone`, authorize a different AppID, and assert the completion command receives preserved brand/theme/content fields but exact SMS features and no old component ID.

- [ ] **Step 3: Run focused tests and observe RED**

Run:

```bash
cd apps/api && bun test src/services/tenant-douyin-miniapp/lead-capture-config.test.ts src/controllers/tenant-douyin-miniapp/index.test.ts src/services/tenant-douyin-miniapp/authorization.test.ts
```

Expected: FAIL for the missing service/route and leaked replacement configuration.

- [ ] **Step 4: Implement service and PATCH route**

The controller parses body first, then obtains tenant auth and calls the service. The service asserts tenant and manage permission, loads the current installation, checks exact AppID, and passes its ID plus caller CAS token to the repository. Map only the stable database business codes; unexpected responses remain a fixed 500 database error.

- [ ] **Step 5: Reset lead capture on different-AppID authorization**

Add a pure helper that copies the previous runtime configuration while replacing only features with:

```ts
{
  cases: previous.features.cases,
  sites: previous.features.sites,
  sms_lead: true,
  douyin_phone: false,
  phone_capture_mode: "sms",
}
```

Use it only when seeding a different AppID installation. Do not alter same-installation update event behavior.

- [ ] **Step 6: Prevent platform config edits from owning tenant lead capture**

For merchant installations, merge platform general runtime edits with the current `features` value before persistence. Template-development behavior remains unchanged. Add a test proving a platform update cannot toggle or replace a merchant component ID.

- [ ] **Step 7: Run focused tests GREEN and commit**

```bash
cd apps/api && bun test src/services/tenant-douyin-miniapp/lead-capture-config.test.ts src/controllers/tenant-douyin-miniapp/index.test.ts src/services/tenant-douyin-miniapp/authorization.test.ts src/services/platform-douyin-miniapps.test.ts
git add apps/api/src/controllers/tenant-douyin-miniapp/index.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.ts \
  apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/authorization.ts \
  apps/api/src/services/tenant-douyin-miniapp/authorization.test.ts \
  apps/api/src/services/platform-douyin-miniapps.ts \
  apps/api/src/services/platform-douyin-miniapps.test.ts
git commit -m "feat(douyin): 开放租户手机号留资配置接口"
```

### Task 4: Tenant Admin settings panel

- [ ] **Step 1: Write failing UI behavior tests**

Render the panel with authorized/unbound, manage/read-only, SMS/official modes. Assert the current AppID is visible, enabling without an ID produces an inline error, disabling retains the ID in the request, save uses the exact tenant endpoint, controls lock during submission, successful response advances the token, and 409 triggers a workspace refresh rather than a success toast.

- [ ] **Step 2: Run focused tests and observe RED**

Run:

```bash
cd apps/admin && bun test components/douyin-miniapp/workspace-lead-capture-config.test.tsx components/douyin-miniapp/workspace.test.tsx
```

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the focused client component**

Use existing `Card`, `Switch`, `Input`, `Label`, `Button`, `Alert` and local backend request helpers. The UI must show:

```text
手机号留资
当前小程序：ttd033a68e4e56ccd301
抖音官方手机号快捷留资 [Switch]
线索组件 ID [Input]
```

Keep the input available while disabled, require it inline only when enabling, expose loading/error/success states accessibly, and state that the ID must come from the current miniapp's Douyin console. Do not display any platform secret or private key state.

- [ ] **Step 4: Wire the panel into the workspace**

Import the focused component into `workspace.tsx` and pass only `canManage` plus installation data. Keep the main workspace file below the repository file-size gate; move no unrelated presentation logic.

- [ ] **Step 5: Run Admin focused tests GREEN and commit**

```bash
cd apps/admin && bun test components/douyin-miniapp/workspace-lead-capture-config.test.tsx components/douyin-miniapp/workspace.test.tsx components/douyin-miniapp/workspace-page-contract.test.ts
git add apps/admin/components/douyin-miniapp/workspace-types.ts \
  apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx \
  apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx \
  apps/admin/components/douyin-miniapp/workspace.tsx \
  apps/admin/components/douyin-miniapp/workspace.test.tsx
git commit -m "feat(admin): 配置抖音手机号留资方式"
```

### Task 5: Full verification and current tenant activation

- [ ] **Step 1: Run package checks**

```bash
bun run domain:build
bun run api:check
bun run admin:check
bun run douyin-mini:check
git diff --check
```

Expected: all exit 0 and all TypeScript/TSX production files remain within the repository threshold.

- [ ] **Step 2: Run compatibility focused suites**

Run the Douyin bootstrap, lead page, official phone, authorization, workspace and platform config suites. Expected: old SMS fixtures parse unchanged and official-phone fixtures still render the component before interaction.

- [ ] **Step 3: Verify database alignment and catalog**

Confirm local migration history alignment, no pending local migration, column/check validity, RPC owner/search path/ACL and exact current row behavior. Do not connect to or mutate production until the code and migration are reviewed.

- [ ] **Step 4: Request independent code review**

Review the complete task diff for Critical/Important/Minor findings, especially tenant scope, AppID replacement, CAS, raw database error leakage, Admin mutation authority and rollback compatibility. Resolve all Critical/Important findings before release.

- [ ] **Step 5: Configure the current installation after deployment**

Through the new tenant endpoint/UI, bind AppID `ttd033a68e4e56ccd301` to component ID `5785490b6443ad9def6f88e69c57920c` and enable official-phone mode. Verify the stored column, runtime features and new CAS token without exposing credentials.

- [ ] **Step 6: Real Douyin verification**

Close and reopen the Douyin miniapp so bootstrap runs before form render. Confirm the free-measurement page shows “授权手机号并提交”, complete one authorized submission, verify the tenant lead appears once, and then disable/re-enable once to prove SMS fallback and retained ID.
