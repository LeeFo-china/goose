# Tenant Douyin Template Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform administrators maintain a paginated allowlist of stable Douyin templates and let authorized tenants choose an allowlisted template for a new, fully audited release cycle.

**Architecture:** Keep `is_current` as the single recommended template and add an independent tenant-selectable flag. Platform mutations use service-role-only RPCs with compare-and-swap checks. Tenant reads combine paginated allowlisted templates with existing release history, while the create command re-reads the selected template record and the atomic upload RPC creates a new cycle after a previous released cycle without rewriting history.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase PostgreSQL migrations/RPCs, Next.js, React, shadcn/Radix, Tailwind.

---

### Task 1: Add the allowlist and repeat-release database contract

**Files:**
- Create: `supabase/migrations/20260920193000_add_douyin_template_tenant_allowlist.sql`
- Create: `apps/api/src/services/douyin-miniapp/template-allowlist-migration-contract.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Assert the new migration contains the three allowlist audit columns, current-template backfill, bounded indexes, `set_douyin_deployable_template_selectability`, updated `confirm_douyin_deployable_template`, `deployable_template_id`, repeat-release RPC behavior, `SECURITY DEFINER`, fixed `search_path`, explicit revokes/grants, and rollback comments.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test apps/api/src/services/douyin-miniapp/template-allowlist-migration-contract.test.ts
```

Expected: failure because the migration does not exist.

- [ ] **Step 3: Implement the forward migration**

Add:

```sql
ALTER TABLE public.douyin_miniapp_deployable_templates
  ADD COLUMN is_tenant_selectable boolean NOT NULL DEFAULT false,
  ADD COLUMN selectability_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN selectability_updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL;

UPDATE public.douyin_miniapp_deployable_templates
SET is_tenant_selectable = true
WHERE is_current = true;
```

Create an index beginning with `(channel, is_tenant_selectable)` and recreate template confirmation so a new recommended template is selectable without clearing older selectable rows. Add a CAS RPC that rejects stale expected state and refuses to disable `is_current=true`.

Add nullable `deployable_template_id` to `douyin_miniapp_releases`, backfill only unambiguous identities, remove the permanent delivery-key uniqueness, and recreate the upload claim functions so an exact unfinished cycle is reused while a released exact cycle creates a new row. Preserve the existing one-unfinished-release index and operation lease checks.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run the focused test; expect all cases to pass.

- [ ] **Step 5: Commit the database contract**

```bash
git add supabase/migrations/20260920193000_add_douyin_template_tenant_allowlist.sql \
  apps/api/src/services/douyin-miniapp/template-allowlist-migration-contract.test.ts
git commit -m "feat(douyin): add tenant template allowlist schema"
```

### Task 2: Extend the template repository with paginated allowlist operations

**Files:**
- Modify: `apps/api/src/repositories/douyin-deployable-templates.ts`
- Modify: `apps/api/src/repositories/douyin-deployable-templates.test.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.fixture.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts`

- [ ] **Step 1: Add RED repository tests**

Cover:

```ts
repository.list({ channel: "default", page: 1, pageSize: 20 })
repository.listSelectable({ channel: "default", page: 1, pageSize: 20 })
repository.findSelectableById(templateId, "default")
repository.setSelectability({
  templateRecordId,
  isTenantSelectable: true,
  expectedIsTenantSelectable: false,
  actorEmployeeId,
})
```

Verify `.select(SAFE_SELECT, { count: "exact" })`, `.range(0, 19)`, required filters, stable ordering, RPC arguments, and safe mapping of database business errors.

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
bun test apps/api/src/repositories/douyin-deployable-templates.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts
```

- [ ] **Step 3: Implement repository methods and expanded schema**

Extend `SAFE_SELECT` and `DeployableTemplateSchema` with allowlist fields. Add query interfaces for `order`, `range`, and count responses. Keep page size validation in service/schema and make repository range calculations deterministic.

- [ ] **Step 4: Update existing fixtures and run GREEN**

Add valid allowlist fields to all existing template fixtures, then rerun the focused tests.

- [ ] **Step 5: Commit repository support**

```bash
git add apps/api/src/repositories/douyin-deployable-templates.ts \
  apps/api/src/repositories/douyin-deployable-templates.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.fixture.ts \
  apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts
git commit -m "feat(douyin): expose deployable template allowlist"
```

### Task 3: Add platform allowlist APIs

**Files:**
- Modify: `apps/api/src/schema/platform-douyin-miniapps.ts`
- Modify: `apps/api/src/schema/platform-douyin-miniapps.test.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.test.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.test.ts`

- [ ] **Step 1: Write RED schema, service, and controller tests**

Add strict schemas for paginated list query, UUID params, and CAS body. Test platform permission enforcement, safe pagination response, successful toggle, stale 409 mapping, current-template disable rejection, exact controller routes, and Zod errors.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
bun test apps/api/src/schema/platform-douyin-miniapps.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.test.ts
```

- [ ] **Step 3: Implement service methods**

Add `listTemplates()` and `setTemplateSelectability()` to the promotion service. Use `platform.douyin_miniapp.manage`, require an employee actor, call only repository methods, and return:

```ts
{
  list,
  pagination: { page, pageSize, total, totalPages },
}
```

- [ ] **Step 4: Implement controller routes**

Add:

```text
GET  /platform/douyin-miniapps/deployable-templates
POST /platform/douyin-miniapps/deployable-templates/:templateRecordId/selectability
```

Controllers only validate, call the service, and wrap `ResponseHandler.success`.

- [ ] **Step 5: Run focused tests and verify GREEN**

- [ ] **Step 6: Commit platform APIs**

```bash
git add apps/api/src/schema/platform-douyin-miniapps.ts \
  apps/api/src/schema/platform-douyin-miniapps.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.test.ts
git commit -m "feat(douyin): add platform template allowlist API"
```

### Task 4: Let tenants select an allowlisted template

**Files:**
- Modify: `apps/api/src/schema/tenant-douyin-miniapp.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/release-options.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-releases.ts`
- Modify: `apps/api/src/services/platform-douyin-miniapp-releases/operation-service.ts`

- [ ] **Step 1: Write RED tenant tests**

Cover multiple selectable templates, independent template/history pagination, default recommendation ordering, old-version selection, same exact current-version suppression, template disabled after page load, identity mismatch, unfinished-release conflict, repeat release after a previous `released` row, and compatibility behavior for `/from-current-template`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

- [ ] **Step 3: Implement paginated template projection**

Change the release-options builder to accept `templates: DouyinDeployableTemplate[]`. Each selectable template becomes `source: "confirmed_template"` with `is_recommended`, `selection_kind`, and `create_test_version` only when it is not the exact provider `current` version and no conflicting unfinished cycle exists.

- [ ] **Step 4: Implement exact selected-template creation**

Add `createFromTemplate()` that calls `findSelectableById()`, verifies the expected ID, and passes `deployable_template_id` through the upload claim. Keep `createFromCurrentTemplate()` as a compatibility wrapper that additionally requires `is_current=true`.

- [ ] **Step 5: Add the new controller route and run GREEN**

Add `POST /tenant/douyin-miniapp/releases/from-template`, retain the old route, then run the focused test set.

- [ ] **Step 6: Commit tenant API support**

```bash
git add apps/api/src/schema/tenant-douyin-miniapp.ts \
  apps/api/src/services/tenant-douyin-miniapp/release-options.ts \
  apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts \
  apps/api/src/repositories/douyin-miniapp-releases.ts \
  apps/api/src/services/platform-douyin-miniapp-releases/operation-service.ts
git commit -m "feat(douyin): let tenants select approved templates"
```

### Task 5: Add the platform Admin allowlist controls

**Files:**
- Modify: `apps/admin/app/(console)/platform/douyin-miniapps/page.tsx`
- Modify: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.ts`
- Modify: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.test.ts`
- Modify: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.tsx`
- Modify: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.test.tsx`

- [ ] **Step 1: Write RED UI policy and source-contract tests**

Test recommended-row locking, selectable toggle copy, stale refresh behavior, paginated fetch URL, exact mutation body, and accessible switch labelling.

- [ ] **Step 2: Run focused Admin tests and verify RED**

```bash
bun test apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.test.ts \
  apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.test.tsx
```

- [ ] **Step 3: Implement the platform list**

Fetch page 1 with page size 20 beside status. Render a simple bordered list under the existing status panel, reuse `Button`, `Badge`, `Switch`, `Alert`, and pagination controls, and keep mutation state per row.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit platform Admin UI**

```bash
git add apps/admin/app/'(console)'/platform/douyin-miniapps/page.tsx \
  apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.ts \
  apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.test.ts \
  apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.tsx \
  apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.test.tsx
git commit -m "feat(admin): manage Douyin template allowlist"
```

### Task 6: Update the tenant version picker

**Files:**
- Modify: `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-types.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-version-policy.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-version-policy.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-version-picker.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-actions.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-actions.test.ts`

- [ ] **Step 1: Write RED picker and request tests**

Cover recommendation-first default selection, stable-version and rollback labels, rollback warning, exact `/from-template` request, compatibility response parsing, and independent template pagination fields.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
bun test apps/admin/components/douyin-miniapp/workspace-version-policy.test.ts \
  apps/admin/components/douyin-miniapp/workspace-actions.test.ts
```

- [ ] **Step 3: Implement the picker changes**

Use the server-provided selection kind. Post `{ expected_template_record_id, expected_template_id }` to `/tenant/douyin-miniapp/releases/from-template`. Show a non-destructive warning for rollback choices and keep all existing permission/audit/publish controls.

- [ ] **Step 4: Run focused tests and verify GREEN**

- [ ] **Step 5: Commit tenant Admin UI**

```bash
git add apps/admin/app/'(console)'/douyin-miniapp/workspace/page.tsx \
  apps/admin/components/douyin-miniapp/workspace-types.ts \
  apps/admin/components/douyin-miniapp/workspace-version-policy.ts \
  apps/admin/components/douyin-miniapp/workspace-version-policy.test.ts \
  apps/admin/components/douyin-miniapp/workspace-version-picker.tsx \
  apps/admin/components/douyin-miniapp/workspace-actions.tsx \
  apps/admin/components/douyin-miniapp/workspace-actions.test.ts
git commit -m "feat(admin): select tenant Douyin template versions"
```

### Task 7: Verify the complete change

**Files:**
- Modify only files required to resolve verification failures caused by this feature.

- [ ] **Step 1: Run all focused tests**

```bash
bun test apps/api/src/services/douyin-miniapp/template-allowlist-migration-contract.test.ts \
  apps/api/src/repositories/douyin-deployable-templates.test.ts \
  apps/api/src/services/platform-douyin-template-promotion.test.ts \
  apps/api/src/controllers/platform-douyin-miniapps/index.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

- [ ] **Step 2: Run static checks before builds**

```bash
bun run api:typecheck
pnpm --dir apps/admin check
```

- [ ] **Step 3: Run builds**

```bash
bun run api:build
pnpm --dir apps/admin build
```

- [ ] **Step 4: Verify migration inventory without applying remote changes**

```bash
supabase migration list
```

Record the pending migration. Do not apply it to development or production without a separate deployment instruction.

- [ ] **Step 5: Inspect the final diff and commit any verification-only fixes**

```bash
git diff --check
git status --short
git log --oneline main..HEAD
```
