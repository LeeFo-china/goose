# Douyin Tenant Version Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly handle a newly confirmed Douyin template that reuses an existing semantic version, expose only actionable tenant versions, and let tenants generate a test QR before submitting the exact package for review.

**Architecture:** Treat `(template_id, template_version)` as the delivery identity and use a deterministic provider summary marker to correlate that identity with Douyin's version-only `latest / audit / current` response. A paginated tenant release-options projection combines the current confirmed template, local release records, and live Douyin stages. The Admin renders one version selector whose actions come from the server projection; write endpoints revalidate tenant ownership, permissions, expected template identity, and provider stage.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase PostgreSQL migrations/RPC, Next.js 15, React 19, shadcn/Radix Select, Tailwind, bun:test.

---

## File Map

- Create `supabase/migrations/20260917230000_support_douyin_same_version_template_revision.sql`: change release delivery identity, add provider summary evidence, and update the atomic upload RPC.
- Create `apps/api/src/services/douyin-miniapp/release-revision-migration-contract.test.ts`: lock migration identity, provider summary, privileges, preflight, and rollback documentation.
- Modify `apps/api/src/repositories/douyin-miniapp-releases.ts`: project and validate `provider_summary`.
- Create `apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.ts`: build and compare safe provider summaries.
- Create `apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.test.ts`: verify length and exact matching.
- Modify `apps/api/src/services/platform-douyin-miniapp-releases/operation-service.ts` and `operation-state.ts`: upload marked summaries and require exact provider evidence.
- Create `apps/api/src/services/tenant-douyin-miniapp/release-options.ts` and `.test.ts`: build the paginated actionable-version projection.
- Modify tenant Douyin release service, workspace service, schema, controller, and their tests for expected-template validation and corrected state semantics.
- Modify `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`: fetch release options.
- Create `apps/admin/components/douyin-miniapp/workspace-version-picker.tsx`, `workspace-version-policy.ts`, and its test.
- Modify the existing workspace actions, types, workspace render, and tests.

### Task 1: Persist Exact Delivery Identity

**Files:**
- Create: `supabase/migrations/20260917230000_support_douyin_same_version_template_revision.sql`
- Create: `apps/api/src/services/douyin-miniapp/release-revision-migration-contract.test.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-releases.ts`
- Test: `apps/api/src/repositories/douyin-miniapp-releases.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from "bun:test";

const path = new URL(
  "../../../../../supabase/migrations/20260917230000_support_douyin_same_version_template_revision.sql",
  import.meta.url,
);
const sql = await Bun.file(path).text();

describe("Douyin same-version template revision migration", () => {
  test("uses exact template identity and stores provider evidence", () => {
    expect(sql).toContain("ADD COLUMN provider_summary text NULL");
    expect(sql).toContain(
      "UNIQUE (installation_id, template_id, template_version)",
    );
    expect(sql).toContain("release.template_id = p_template_id");
    expect(sql).toContain("release.template_version = p_template_version");
    expect(sql).toContain("'[#' || p_template_id || '] '");
  });

  test("fails closed and preserves RPC privileges", () => {
    expect(sql).toContain("DOUYIN_RELEASE_EXACT_DELIVERY_DUPLICATES_EXIST");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2",
    );
    expect(sql).toContain("Rollback:");
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
bun test apps/api/src/services/douyin-miniapp/release-revision-migration-contract.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the forward migration**

Start with the guarded schema change:

```sql
BEGIN;
LOCK TABLE public.douyin_miniapp_releases IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.douyin_miniapp_releases
ADD COLUMN provider_summary text NULL,
ADD CONSTRAINT douyin_miniapp_releases_provider_summary_check CHECK (
  provider_summary IS NULL OR (
    provider_summary = btrim(provider_summary)
    AND length(provider_summary) BETWEEN 1 AND 200
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases
    GROUP BY installation_id, template_id, template_version
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'DOUYIN_RELEASE_EXACT_DELIVERY_DUPLICATES_EXIST';
  END IF;
END;
$$;

ALTER TABLE public.douyin_miniapp_releases
DROP CONSTRAINT douyin_miniapp_releases_delivery_key_unique,
ADD CONSTRAINT douyin_miniapp_releases_delivery_key_unique
  UNIQUE (installation_id, template_id, template_version);
```

Replace the legacy upload RPC body so newly inserted rows calculate `provider_summary` as a trimmed 200-character value beginning with `[#<template_id>] `. Update the exact-row lookup to include both `template_id` and `template_version`. Update the v2 wrapper return table and projection to include `provider_summary`, while preserving `SECURITY DEFINER`, `search_path`, revoked public roles, and the `service_role` grant. End with a forward-only rollback procedure and `COMMIT`.

- [ ] **Step 4: Extend the repository projection and schema**

Add `provider_summary` to `RELEASE_SELECT` and `ReleaseSchema`:

```ts
provider_summary: z.string().trim().min(1).max(200).nullable(),
```

Update RPC row parsing and repository tests so `getOrCreateAndClaimUpload()` and ordinary release reads preserve the field.

- [ ] **Step 5: Run focused tests and commit**

```bash
bun test \
  apps/api/src/services/douyin-miniapp/release-revision-migration-contract.test.ts \
  apps/api/src/repositories/douyin-miniapp-releases.test.ts
```

Expected: PASS.

```bash
git add supabase/migrations/20260917230000_support_douyin_same_version_template_revision.sql \
  apps/api/src/services/douyin-miniapp/release-revision-migration-contract.test.ts \
  apps/api/src/repositories/douyin-miniapp-releases.ts \
  apps/api/src/repositories/douyin-miniapp-releases.test.ts
git commit -m "fix(douyin): 支持同版本模板修订交付"
```

### Task 2: Require Exact Provider Evidence

**Files:**
- Create: `apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.ts`
- Create: `apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.test.ts`
- Modify: `apps/api/src/services/platform-douyin-miniapp-releases/operation-service.ts`
- Modify: `apps/api/src/services/platform-douyin-miniapp-releases/operation-state.ts`
- Test: `apps/api/src/services/platform-douyin-miniapp-releases/operation-service.recovery.test.ts`

- [ ] **Step 1: Write failing provider-summary tests**

```ts
expect(buildDouyinDeliverySummary("78690", "装修行业生产模板"))
  .toBe("[#78690] 装修行业生产模板");
expect(Array.from(buildDouyinDeliverySummary("78690", "设".repeat(300))).length)
  .toBeLessThanOrEqual(200);
expect(matchesDouyinDeliveryStage(markedRelease, {
  version: "0.1.39",
  summary: "[#78690] 装修行业生产模板",
})).toBe(true);
expect(matchesDouyinDeliveryStage(markedRelease, {
  version: "0.1.39",
  summary: "[#78689] 旧模板",
})).toBe(false);
```

- [ ] **Step 2: Run the tests and verify RED**

```bash
bun test apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement deterministic summary helpers**

```ts
const MAX_PROVIDER_SUMMARY_LENGTH = 200;

export function buildDouyinDeliverySummary(
  templateId: string,
  description: string,
) {
  const prefix = `[#${templateId}] `;
  const remaining = MAX_PROVIDER_SUMMARY_LENGTH - Array.from(prefix).length;
  return prefix + Array.from(description.trim()).slice(0, remaining).join("");
}

export function matchesDouyinDeliveryStage(
  release: Pick<DouyinMiniappReleaseRecord,
    "template_version" | "provider_summary">,
  stage: SafeDouyinVersionStage | undefined,
) {
  if (!stage || stage.version !== release.template_version) return false;
  return release.provider_summary === null
    ? true
    : stage.summary === release.provider_summary;
}
```

- [ ] **Step 4: Apply exact matching to release operations**

Use persisted `provider_summary` as `userDescription` for new uploads. Replace version-only checks in `recoveryPatch()`, marked-release QR preflight, submit-audit preflight, sync, and publish with `matchesDouyinDeliveryStage()`. A marked release with the correct version and wrong summary must fail through the existing error factory.

Legacy rows with `provider_summary=null` keep their existing version-only behavior; Task 3 excludes ambiguous legacy rows once a marked same-version revision exists.

- [ ] **Step 5: Add the timeout regression**

```ts
h.gateway.getVersionList = mock(async () => ({
  latest: { version: "0.1.39", summary: "[#78689] 旧模板" },
  logId: "versions-log",
}));
expect(await caught(() => h.operations.upload(
  installation, INSTALLATION_ID, OPERATOR_ID, sameVersionInput,
))).toMatchObject({ code: "DOUYIN_RELEASE_OUTCOME_UNCERTAIN" });
```

Add the matching-summary success case beside it.

- [ ] **Step 6: Run focused tests and commit**

```bash
bun test \
  apps/api/src/services/platform-douyin-miniapp-releases/delivery-summary.test.ts \
  apps/api/src/services/platform-douyin-miniapp-releases/operation-service.recovery.test.ts \
  apps/api/src/services/platform-douyin-miniapp-releases.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/services/platform-douyin-miniapp-releases
git commit -m "fix(douyin): 校验远端精确模板交付"
```

### Task 3: Build the Actionable Version API

**Files:**
- Create: `apps/api/src/services/tenant-douyin-miniapp/release-options.ts`
- Create: `apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.ts`
- Test: `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/workspace.ts`
- Test: `apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts`
- Modify: `apps/api/src/schema/tenant-douyin-miniapp.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- Test: `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/services/platform-douyin-miniapp-releases/default-service.ts`

- [ ] **Step 1: Write failing workspace classification tests**

```ts
expect(buildWorkspace({
  ...base,
  currentTemplate: {
    ...deployableTemplate,
    template_id: "78690",
    template_version: "0.1.39",
  },
  latestRelease: {
    ...release,
    template_id: "78689",
    template_version: "0.1.39",
    status: "testing",
  },
}).available_template?.state).toBe("revision_available");

expect(buildWorkspace({
  ...base,
  currentTemplate: { ...deployableTemplate, description: "新说明" },
  latestRelease: {
    ...release,
    template_id: deployableTemplate.template_id,
    template_version: deployableTemplate.template_version,
    description: "旧说明",
    status: "testing",
  },
}).available_template?.state).toBe("in_progress");
```

Run:

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts
```

Expected: FAIL because `revision_available` is not yet in the response schema.

- [ ] **Step 2: Correct template state semantics**

Add `revision_available` to the workspace schema and Admin type. Change `availableTemplate()` so description never controls identity, same version plus different template ID returns `revision_available`, lower/invalid versions remain `stale_version`, and exact identity maps to `in_progress` or `up_to_date` according to release status.

- [ ] **Step 3: Write failing release-options tests**

Cover the following exact cases:

```ts
test("offers the confirmed same-version revision instead of the legacy test release", async () => {
  // confirmed: 0.1.39 / 78690
  // local testing: 0.1.39 / 78689
  // provider latest: 0.1.39 / summary for 78689
  const result = await service.list(auth, { page: 1, pageSize: 20 });
  expect(result.list).toEqual([
    expect.objectContaining({
      source: "confirmed_template",
      template_id: "78690",
      stage: "ready_to_upload",
      actions: ["create_test_version"],
    }),
  ]);
});
```

Also test exact marked `latest` matching, mismatched summary exclusion, sanitized provider-unavailable fallback, and rejection of `pageSize > 100` before repository access.

- [ ] **Step 4: Implement the projection service**

Create `TenantDouyinMiniappReleaseOptionsService` with injected workspace, template, release, access-token, and gateway ports. Return:

```ts
type TenantDouyinReleaseOptionsResponse = {
  list: TenantDouyinReleaseOption[];
  provider_state: "fresh" | "unavailable";
  provider_message: string | null;
  history: SanitizedRelease[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
```

The provider failure branch keeps sanitized local history readable and removes audit/publish actions. Never expose access tokens, deployment keys, raw provider payloads, provider log IDs, or platform operator IDs.

- [ ] **Step 5: Add expected-template validation to creation**

Define:

```ts
export const TenantDouyinCreateReleaseSchema = z.strictObject({
  expected_template_record_id: z.uuid(),
  expected_template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
});
```

Change `createFromCurrentTemplate(authContext, input)` to compare both values against `findCurrent("default")`. On mismatch throw:

```ts
Errors.business(
  409,
  "平台当前模板已更新，请刷新版本列表后重试",
  "DOUYIN_DEPLOYABLE_TEMPLATE_CHANGED",
)
```

Allow same-version different-template revisions while retaining audit-pending, audit-approved, `created`, and active-lease protections. Add a failing-then-passing service test for `0.1.39 / 78689 -> 0.1.39 / 78690`.

- [ ] **Step 6: Register and test the controller route**

```ts
@Get("/tenant/douyin-miniapp/release-options")
async listReleaseOptions(request: FastifyRequest) {
  const query = TenantDouyinReleaseListQuerySchema.safeParse(request.query || {});
  if (!query.success) throw Errors.fromZod(query.error);
  const authContext = await this.getRequiredTenantContext(request);
  return ResponseHandler.success(
    await (await this.releaseProvider()).listOptions(authContext, query.data),
  );
}
```

Parse `TenantDouyinCreateReleaseSchema` in the creation route and forward the validated input. Update controller mocks and route expectations.

- [ ] **Step 7: Run focused tests and commit**

```bash
bun test \
  apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/release-options.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/releases.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/services/tenant-douyin-miniapp \
  apps/api/src/schema/tenant-douyin-miniapp.ts \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/services/platform-douyin-miniapp-releases/default-service.ts
git commit -m "feat(douyin): 提供租户可操作版本"
```

### Task 4: Replace the Conflicting Admin Actions

**Files:**
- Modify: `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-types.ts`
- Create: `apps/admin/components/douyin-miniapp/workspace-version-picker.tsx`
- Create: `apps/admin/components/douyin-miniapp/workspace-version-policy.ts`
- Create: `apps/admin/components/douyin-miniapp/workspace-version-policy.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-actions.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace.tsx`
- Test: `apps/admin/components/douyin-miniapp/workspace.test.tsx`

- [ ] **Step 1: Write failing selection-policy tests**

```ts
expect(selectDefaultReleaseOption([
  releaseOption({ stage: "testing", actions: ["submit_audit"] }),
  templateOption({
    stage: "ready_to_upload",
    actions: ["create_test_version"],
  }),
])?.source).toBe("confirmed_template");

expect(versionActionCopy(templateRevision)).toEqual({
  title: "0.1.39 · 新模板修订",
  description: "版本号相同，但模板包已经更新。",
  primaryLabel: "生成 0.1.39 测试码",
});
```

Run and expect RED because the policy module is missing.

- [ ] **Step 2: Fetch and type release options**

Add `TenantDouyinReleaseOption`, `TenantDouyinReleaseOptionsResponse`, and pagination types. Fetch `/tenant/douyin-miniapp/release-options?page=1&pageSize=20` in parallel with workspace and readiness. A release-options failure must not hide the rest of the workspace; pass a dedicated load error.

- [ ] **Step 3: Implement the single selector and history**

Use local `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`. The trigger contains version and stage. The selected detail contains full template ID, confirmation/update time, and server description. Disable selection while a write is pending.

Render a flat paginated history below the actions using semantic rows and separators. Each row shows version, template ID suffix, state, update time, and safe failure reason. Historical rows contain no write buttons.

- [ ] **Step 4: Bind actions to the selected option**

For a confirmed-template option call:

```ts
requestBackendJson<Release>(
  "/tenant/douyin-miniapp/releases/from-current-template",
  {
    method: "POST",
    body: JSON.stringify({
      expected_template_record_id: selected.id,
      expected_template_id: selected.template_id,
    }),
    fallbackMessage: "生成测试码失败",
  },
);
```

For a release option, use its UUID in existing action routes. After success update the selected release and QR in local state immediately. Use delayed `router.refresh()` only to reconcile server-rendered readiness and history; remove the mandatory `window.location.reload()` dependency.

- [ ] **Step 5: Remove the misleading notice**

Delete the same-version `stale_version` warning. True rollback and invalid-version states remain destructive `Alert` content. The version picker owns normal new-version and revision messaging.

- [ ] **Step 6: Add render regressions**

```ts
expect(html).toContain("0.1.39 · 新模板修订");
expect(html).toContain("生成 0.1.39 测试码");
expect(html).not.toContain("当前可发布模板版本异常");
expect(html).not.toContain("平台当前模板不是该租户的新版本");
```

Also cover provider unavailable, permission denied, pending progress, generated QR, and testing-to-submit transitions.

- [ ] **Step 7: Run Admin tests and commit**

```bash
bun test \
  apps/admin/components/douyin-miniapp/workspace-version-policy.test.ts \
  apps/admin/components/douyin-miniapp/workspace-actions.test.ts \
  apps/admin/components/douyin-miniapp/workspace.test.tsx \
  apps/admin/components/douyin-miniapp/workspace-page-contract.test.ts
```

Expected: PASS.

```bash
git add apps/admin/app/'(console)'/douyin-miniapp/workspace/page.tsx \
  apps/admin/components/douyin-miniapp
git commit -m "fix(admin): 重做抖音租户版本工作区"
```

### Task 5: Verify and Prepare Production Release

**Files:**
- Modify only files required by verification findings.

- [ ] **Step 1: Run the complete focused regression set**

Run all tests changed in Tasks 1 through 4. Expected: all pass without unhandled promise rejections.

- [ ] **Step 2: Run static gates before browser smoke**

```bash
bun run api:check
bun run admin:check
```

Expected: API typecheck/build/file-size and Admin file-size/typecheck all pass.

- [ ] **Step 3: Validate the migration locally**

```bash
bun x supabase start
bun x supabase db reset
bun x supabase migration list --local
```

Expected: migration `20260917230000` applies locally and the complete Local chain is present.

- [ ] **Step 4: Run the Admin browser smoke**

Verify desktop and mobile widths:

1. `0.1.39` same-version revision defaults to “生成测试码”.
2. Selector options contain only actionable versions.
3. History remains read-only.
4. Pending state disables selection/actions and announces progress.
5. Generated QR appears without a full-page reload.
6. The selected exact release transitions to “提交审核”.

- [ ] **Step 5: Review Git and commit verification fixes**

```bash
git diff --check
git status --short
git log --oneline --decorate -8
```

If verification required changes, commit them with a focused Conventional Commit message. Do not combine unrelated files.

- [ ] **Step 6: Prepare production migration evidence**

```bash
bun x supabase projects list
bun x supabase migration list --linked
```

Verify the linked project ref matches the approved production target and confirm `20260917230000` is the only new migration from this change. After authorized deployment, run `supabase migration list` again and confirm Local/Remote alignment before exercising the tenant flow.

- [ ] **Step 7: Production acceptance**

For 河南晴天装饰工程有限公司:

1. Open the tenant Douyin workspace.
2. Confirm `0.1.39 · 新模板修订` is selected.
3. Generate the test QR and verify the new template ID is persisted.
4. Scan the QR with an authorized Douyin account.
5. Confirm the page offers “提交审核” for that exact release.
6. Submit only after the QR content is accepted.
