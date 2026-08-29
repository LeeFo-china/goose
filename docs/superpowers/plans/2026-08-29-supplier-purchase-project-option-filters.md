# Supplier Purchase Project Option Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `GET /supplier-purchase-batch-project-options` with backend-clock-based `last_7_days` and Asia/Shanghai `current_month` filters that run before database pagination while preserving authorization, scope, response, and unfiltered behavior.

**Architecture:** Zod validates the new query parameters. A focused service helper converts a window to UTC boundaries using the existing injected clock; the repository translates those boundaries to PostgREST predicates before ordering and `.range()`. A nontransactional migration adds the composite filtered-query index.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase JS/PostgREST, PostgreSQL migrations, Bun test.

---

## File map

- Modify `apps/api/src/schema/supplier-purchase-batches.ts`: project-option query parameters.
- Modify `apps/api/src/schema/supplier-purchase-batches.test.ts`: schema contract.
- Modify `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`: HTTP handoff.
- Create `apps/api/src/services/supplier-purchase-batch-project-option-window.ts`: UTC boundaries.
- Create `apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts`: boundary tests.
- Modify `apps/api/src/services/supplier-purchase-batches.ts`: service orchestration.
- Modify `apps/api/src/services/supplier-purchase-batches.test.ts`: service handoff test.
- Modify `apps/api/src/repositories/supplier-purchase-batches.ts`: DB predicates and order.
- Create `apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts`: query contract.
- Create `supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql`: concurrent index.
- Create `apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts`: migration contract.
- Modify `scripts/release-orchestration-contract.test.ts`: release parser integration contract.
- Modify `docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md`: four-migration release and recovery procedure.

## Task 1: Lock the HTTP query contract

**Files:**
- Modify: `apps/api/src/schema/supplier-purchase-batches.test.ts:85-110`
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts:158-190`
- Modify: `apps/api/src/schema/supplier-purchase-batches.ts:46-55`

- [ ] **Step 1: Write the failing schema tests**

Split the current shared option test and add these exact project assertions:

```ts
expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
  keyword: " 水泥 ",
  pageSize: "100",
  updatedWindow: "current_month",
  timezone: "Asia/Shanghai",
})).toEqual({
  page: 1,
  pageSize: 100,
  keyword: "水泥",
  updatedWindow: "current_month",
  timezone: "Asia/Shanghai",
});
expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
  updatedWindow: "last_7_days",
})).toEqual({ page: 1, pageSize: 20, updatedWindow: "last_7_days" });
expect(SupplierPurchaseBatchProjectOptionQuerySchema.parse({
  timezone: "Asia/Shanghai",
})).toEqual({ page: 1, pageSize: 20, timezone: "Asia/Shanghai" });

for (const input of [
  { updatedWindow: "last_month" },
  { timezone: "UTC" },
  { updated_window: "last_7_days" },
]) {
  expect(SupplierPurchaseBatchProjectOptionQuerySchema.safeParse(input).success)
    .toBe(false);
}
expect(SupplierPurchaseBatchCostCategoryQuerySchema.safeParse({
  updatedWindow: "last_7_days",
}).success).toBe(false);
expect(SupplierPurchaseBatchCostCategoryQuerySchema.safeParse({
  timezone: "Asia/Shanghai",
}).success).toBe(false);
```

- [ ] **Step 2: Extend the controller handoff test**

Use this request and expected service input in `parses and wraps the three auxiliary pages`:

```ts
await value.listProjectOptions({
  query: {
    page: "2",
    pageSize: "100",
    keyword: "项目",
    updatedWindow: "current_month",
    timezone: "Asia/Shanghai",
  },
} as never);
expect(listProjectOptions).toHaveBeenCalledWith(auth, {
  page: 2,
  pageSize: 100,
  keyword: "项目",
  updatedWindow: "current_month",
  timezone: "Asia/Shanghai",
});
await expect(value.listProjectOptions({
  query: { updatedWindow: "last_month", timezone: "UTC" },
} as never)).rejects.toMatchObject({
  statusCode: 400,
  code: "VALIDATION_ERROR",
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
bun test apps/api/src/schema/supplier-purchase-batches.test.ts \
  apps/api/src/controllers/supplier-purchase-batches/routes.test.ts
```

Expected: FAIL because strict project-option parsing rejects both new fields.

- [ ] **Step 4: Implement the project-only schema**

```ts
const optionQuery = PaginationQuerySchema.extend({
  keyword: keyword.optional(),
}).strict();
export const SupplierPurchaseBatchProjectOptionQuerySchema =
  optionQuery.extend({
    updatedWindow: z.enum(["last_7_days", "current_month"], {
      message: "无效的项目更新时间范围",
    }).optional(),
    timezone: z.enum(["Asia/Shanghai"], {
      message: "无效的项目更新时间时区",
    }).optional(),
  }).strict();
export const SupplierPurchaseBatchCostCategoryQuerySchema = optionQuery;
```

Do not default `timezone` in Zod. The service uses Shanghai for the only supported calendar calculation.

- [ ] **Step 5: Run the Task 1 tests and verify GREEN**

Expected: both files PASS; invalid values surface as HTTP 400 / `VALIDATION_ERROR`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/supplier-purchase-batches.ts \
  apps/api/src/schema/supplier-purchase-batches.test.ts \
  apps/api/src/controllers/supplier-purchase-batches/routes.test.ts
git commit -m "feat(supplier): 校验采购项目时间筛选"
```

## Task 2: Implement deterministic time boundaries

**Files:**
- Create: `apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts`
- Create: `apps/api/src/services/supplier-purchase-batch-project-option-window.ts`

- [ ] **Step 1: Write the failing boundary test**

```ts
import { describe, expect, test } from "bun:test";
import { resolveSupplierPurchaseBatchProjectOptionWindow } from
  "./supplier-purchase-batch-project-option-window";

const NOW = new Date("2026-08-29T03:04:05.000Z");

describe("supplier purchase batch project option window", () => {
  test("uses one closed backend-clock interval for seven days", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow(
      "last_7_days",
      NOW,
    )).toEqual({
      updated_at_from: "2026-08-22T03:04:05.000Z",
      updated_at_to: "2026-08-29T03:04:05.000Z",
    });
  });

  test("converts the Shanghai month to a UTC half-open interval", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow(
      "current_month",
      NOW,
    )).toEqual({
      updated_at_from: "2026-07-31T16:00:00.000Z",
      updated_at_before: "2026-08-31T16:00:00.000Z",
    });
  });

  test("handles the Shanghai year boundary", () => {
    expect(resolveSupplierPurchaseBatchProjectOptionWindow(
      "current_month",
      new Date("2025-12-31T16:00:00.000Z"),
    )).toEqual({
      updated_at_from: "2025-12-31T16:00:00.000Z",
      updated_at_before: "2026-01-31T16:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
bun test apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the boundary helper**

```ts
import type {
  SupplierPurchaseBatchProjectOptionQuery,
} from "@/schema/supplier-purchase-batches";

type UpdatedWindow = NonNullable<
  SupplierPurchaseBatchProjectOptionQuery["updatedWindow"]
>;
export type SupplierPurchaseBatchProjectOptionUpdatedAtRange = {
  updated_at_from: string;
  updated_at_to?: string;
  updated_at_before?: string;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function resolveSupplierPurchaseBatchProjectOptionWindow(
  window: UpdatedWindow,
  now: Date,
): SupplierPurchaseBatchProjectOptionUpdatedAtRange {
  if (window === "last_7_days") {
    return {
      updated_at_from: new Date(now.getTime() - SEVEN_DAYS_MS).toISOString(),
      updated_at_to: now.toISOString(),
    };
  }
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  const year = shanghaiNow.getUTCFullYear();
  const month = shanghaiNow.getUTCMonth();
  return {
    updated_at_from: shanghaiMonthBoundary(year, month),
    updated_at_before: shanghaiMonthBoundary(year, month + 1),
  };
}

function shanghaiMonthBoundary(year: number, month: number): string {
  return new Date(
    Date.UTC(year, month, 1) - SHANGHAI_UTC_OFFSET_MS,
  ).toISOString();
}
```

- [ ] **Step 4: Run the boundary test and verify GREEN**

Expected: 3 PASS with the exact UTC strings above.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/supplier-purchase-batch-project-option-window.ts \
  apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts
git commit -m "feat(supplier): 计算采购项目更新时间边界"
```

## Task 3: Wire boundaries through the service

**Files:**
- Modify: `apps/api/src/services/supplier-purchase-batches.test.ts:225-265`
- Modify: `apps/api/src/services/supplier-purchase-batches.ts:1-15,145-160`

- [ ] **Step 1: Extend the existing service contract test**

In `uses the designed access boundary for auxiliary pages`, replace the project-option call with:

```ts
await service.listProjectOptions(context, {
  page: 1,
  pageSize: 20,
  keyword: "一期",
  updatedWindow: "current_month",
  timezone: "Asia/Shanghai",
});
```

Change its repository expectation to:

```ts
expect(deps.repository.listProjectOptions).toHaveBeenCalledWith({
  tenant_id: TENANT_ID,
  visible_project_ids: [PROJECT_ID],
  page: 1,
  pageSize: 20,
  keyword: "一期",
  updated_at_from: "2026-07-31T16:00:00.000Z",
  updated_at_before: "2026-08-31T16:00:00.000Z",
});
```

Keep the assertions for `requireView`, `requireManage`, and `assertProjectUpdate` unchanged.

- [ ] **Step 2: Run the service test and verify RED**

```bash
bun test apps/api/src/services/supplier-purchase-batches.test.ts
```

Expected: FAIL because the service does not pass UTC boundaries.

- [ ] **Step 3: Implement service orchestration**

Import:

```ts
import {
  resolveSupplierPurchaseBatchProjectOptionWindow,
} from "@/services/supplier-purchase-batch-project-option-window";
```

Replace `listProjectOptions` with:

```ts
async listProjectOptions(
  auth: AuthContext,
  query: SupplierPurchaseBatchProjectOptionQuery,
) {
  const scope = await this.access.requireView(auth);
  const visibleProjectIds = await this.access.getVisibleProjectIds(auth);
  const updatedAtRange = query.updatedWindow
    ? resolveSupplierPurchaseBatchProjectOptionWindow(
      query.updatedWindow,
      this.nowFactory(),
    )
    : {};
  return this.repository.listProjectOptions({
    tenant_id: scope.tenantId,
    visible_project_ids: visibleProjectIds,
    page: query.page,
    pageSize: query.pageSize,
    ...(query.keyword ? { keyword: query.keyword } : {}),
    ...updatedAtRange,
  });
}
```

This preserves authorization order and only reads the injected clock when a window exists.

- [ ] **Step 4: Run service and boundary tests**

```bash
bun test apps/api/src/services/supplier-purchase-batches.test.ts \
  apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts
bun run api:check-file-size
```

Expected: all tests and the file-size gate PASS. If the existing service test crosses the enforced limit, move only this project-option case into a new focused service test file; do not weaken the limit.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/supplier-purchase-batches.ts \
  apps/api/src/services/supplier-purchase-batches.test.ts
git commit -m "feat(supplier): 编排采购项目时间筛选"
```

## Task 4: Filter before repository pagination

**Files:**
- Create: `apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-batches.ts:35-90,238-270`

- [ ] **Step 1: Create a focused PostgREST query test**

Use the installed `@supabase/supabase-js` query builder with a stubbed fetch:

```ts
import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "72000000-0000-4000-8000-000000000001";
const PROJECT_ID = "72000000-0000-4000-8000-000000000002";
const FROM = "2026-08-22T03:04:05.000Z";
const TO = "2026-08-29T03:04:05.000Z";

async function repositoryFor() {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify([{
      id: PROJECT_ID,
      name: "脱敏项目",
      status: "active",
    }]), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": "0-0/1",
      },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPurchaseBatchesRepository } = await import(
    "./supplier-purchase-batches"
  );
  return {
    repository: new SupplierPurchaseBatchesRepository(() => client as never),
    requests,
  };
}
```

Add this closed-range test:

```ts
test("intersects scope, keyword, and seven days before paging", async () => {
  const { repository, requests } = await repositoryFor();
  await repository.listProjectOptions({
    tenant_id: TENANT_ID,
    visible_project_ids: [PROJECT_ID],
    keyword: "脱敏",
    updated_at_from: FROM,
    updated_at_to: TO,
    page: 2,
    pageSize: 20,
  });
  const url = new URL(requests[0]!.url);
  expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
  expect(url.searchParams.get("id")).toBe(`in.(${PROJECT_ID})`);
  expect(url.searchParams.get("or")).toContain("name.ilike");
  expect(url.searchParams.getAll("updated_at")).toEqual([
    `gte.${FROM}`,
    `lte.${TO}`,
  ]);
  expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
  expect(url.searchParams.get("offset")).toBe("20");
  expect(url.searchParams.get("limit")).toBe("20");
});
```

Add this month/unfiltered compatibility test:

```ts
test("uses a half-open month and preserves unfiltered order", async () => {
  const filtered = await repositoryFor();
  await filtered.repository.listProjectOptions({
    tenant_id: TENANT_ID,
    visible_project_ids: null,
    updated_at_from: "2026-07-31T16:00:00.000Z",
    updated_at_before: "2026-08-31T16:00:00.000Z",
    page: 1,
    pageSize: 20,
  });
  const filteredUrl = new URL(filtered.requests[0]!.url);
  expect(filteredUrl.searchParams.getAll("updated_at")).toEqual([
    "gte.2026-07-31T16:00:00.000Z",
    "lt.2026-08-31T16:00:00.000Z",
  ]);
  expect(filteredUrl.searchParams.get("order"))
    .toBe("updated_at.desc,id.desc");

  const unfiltered = await repositoryFor();
  await unfiltered.repository.listProjectOptions({
    tenant_id: TENANT_ID,
    visible_project_ids: null,
    page: 1,
    pageSize: 20,
  });
  const unfilteredUrl = new URL(unfiltered.requests[0]!.url);
  expect(unfilteredUrl.searchParams.has("updated_at")).toBe(false);
  expect(unfilteredUrl.searchParams.get("order")).toBe("name.asc,id.asc");
});
```

- [ ] **Step 2: Run the new repository test and verify RED**

```bash
bun test apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts
```

Expected: FAIL because repository input and query methods do not support time fields.

- [ ] **Step 3: Extend repository types**

```ts
export type BatchProjectOptionInput = PageInput & {
  tenant_id: string;
  visible_project_ids: string[] | null;
  keyword?: string;
  updated_at_from?: string;
  updated_at_to?: string;
  updated_at_before?: string;
};
```

Add these installed Supabase builder methods to local `Query`:

```ts
gte: (column: string, value: unknown) => Query;
lte: (column: string, value: unknown) => Query;
lt: (column: string, value: unknown) => Query;
```

- [ ] **Step 4: Add predicates and conditional ordering before `.range()`**

After `applyKeyword`, use:

```ts
if (input.updated_at_from) {
  request = request.gte("updated_at", input.updated_at_from);
}
if (input.updated_at_to) {
  request = request.lte("updated_at", input.updated_at_to);
}
if (input.updated_at_before) {
  request = request.lt("updated_at", input.updated_at_before);
}
request = input.updated_at_from
  ? request
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
  : request
    .order("name", { ascending: true })
    .order("id", { ascending: true });
const { data, error, count } = await request.range(...pageRange(pagination));
```

Keep `select("id,name,status", { count: "exact" })`, scope, keyword escaping, empty-scope short circuit, parsing, and `Errors.dbError` unchanged.

- [ ] **Step 5: Run repository tests and verify GREEN**

```bash
bun test apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts \
  apps/api/src/repositories/supplier-purchase-batches.test.ts
```

Expected: new and existing repository contracts PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/supplier-purchase-batches.ts \
  apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts
git commit -m "feat(supplier): 分页前筛选采购项目更新时间"
```

## Task 5: Add the supporting index migration

**Files:**
- Create: `apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts`
- Create: `supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql`
- Modify: `scripts/release-orchestration-contract.test.ts`
- Modify: `docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";

describe("supplier purchase batch project option index migration", () => {
  test("builds the tenant and update ordering index safely", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(sql).toMatch(
      /^-- gooes:migration-mode=nontransactional\n-- gooes:expected-index=public\.projects_tenant_updated_id_purchase_batch_idx\|public\.projects\|false\|btree\|tenant_id,updated_at,id\|pg_catalog\.uuid_ops,pg_catalog\.timestamptz_ops,pg_catalog\.uuid_ops\|null\n/,
    );
    expect(sql).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
    expect(sql).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS\s+projects_tenant_updated_id_purchase_batch_idx\s+ON public\.projects\(tenant_id, updated_at DESC, id DESC\)/i);
    expect(sql).toContain("-- Rollback: forward-only.");
    expect(sql).not.toMatch(/^\s*DROP\s+INDEX/im);
    expect(sql).toContain("SET lock_timeout = '5s';");
    expect(sql).toContain("SET statement_timeout = '30min';");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
bun test apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the nontransactional migration**

```sql
-- gooes:migration-mode=nontransactional
-- gooes:expected-index=public.projects_tenant_updated_id_purchase_batch_idx|public.projects|false|btree|tenant_id,updated_at,id|pg_catalog.uuid_ops,pg_catalog.timestamptz_ops,pg_catalog.uuid_ops|null
-- Existing projects may already contain substantial data. Build this index
-- without a write-blocking ShareLock while the project option API stays live.
-- Failure/retry: release tooling validates pg_index readiness and removes only
-- this listed INVALID index concurrently before retrying.
-- Rollback: forward-only. After reverting the filtered API revision, leave this
-- additive index in place; retaining it is safe. Any later removal requires a
-- separately reviewed timestamped migration after release tooling supports
-- expected-absence/drop contracts.

SET lock_timeout = '5s';
SET statement_timeout = '30min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS
  projects_tenant_updated_id_purchase_batch_idx
ON public.projects(tenant_id, updated_at DESC, id DESC);

RESET statement_timeout;
RESET lock_timeout;
```

- [ ] **Step 4: Verify the migration and release parser**

```bash
bun test apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts \
  scripts/release-orchestration-contract.test.ts
```

Expected: PASS; the release contract loads the actual migration, exercises the
nontransactional parser helpers through DDL then migration-history recording, and
requires the runbook to document the new version and forward-only recovery path.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260829170000_prepare_supplier_purchase_batch_project_option_filters.sql \
  apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts \
  scripts/release-orchestration-contract.test.ts \
  docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md
git commit -m "perf(supplier): 索引采购项目更新时间筛选"
```

## Task 6: Verify, review, merge, deploy dev, and hand off

**Files:**
- Verify all files from Tasks 1-5.
- Do not modify `/Users/leefo/Public/work/orange`.

- [ ] **Step 1: Run the complete focused regression set**

```bash
bun test apps/api/src/schema/supplier-purchase-batches.test.ts \
  apps/api/src/controllers/supplier-purchase-batches/routes.test.ts \
  apps/api/src/services/supplier-purchase-batch-project-option-window.test.ts \
  apps/api/src/services/supplier-purchase-batches.test.ts \
  apps/api/src/repositories/supplier-purchase-batch-project-options.test.ts \
  apps/api/src/repositories/supplier-purchase-batches.test.ts \
  apps/api/src/services/supplier-purchase-batch-project-option-index-migration-contract.test.ts
```

Expected: all focused tests PASS with zero failures.

- [ ] **Step 2: Run static and package gates**

```bash
bun run api:check
git diff --check origin/main...HEAD
git status --short
```

Expected: typecheck, build, and file-size checks PASS; diff check emits no output; worktree is clean after commits.

- [ ] **Step 3: Run the stable workspace suite**

```bash
bun run test
```

Expected: stable suite PASS. Record exact evidence for any unrelated pre-existing failure; do not suppress it.

- [ ] **Step 4: Request code review and resolve findings**

Use `superpowers:requesting-code-review` against `origin/main...HEAD`. Review must cover schema isolation, exact boundaries, one injected-clock read, permissions/project scope, predicates/count before `.range()`, stable order, migration safety, no Orange writes, and no sensitive data.

For each valid finding, first add a failing regression test, then make the smallest fix, rerun Steps 1-3, and commit using Conventional Commits.

- [ ] **Step 5: Rebase latest main and reverify**

```bash
git fetch origin main
git rebase origin/main
bun run api:check
bun run test
git diff --check origin/main...HEAD
```

Expected: clean rebase and green gates. If main changed relevant query or migration code, stop and re-review merged behavior.

- [ ] **Step 6: Fast-forward remote main**

```bash
RELEASE_SHA="$(git rev-parse HEAD)"
test "$(git merge-base origin/main "${RELEASE_SHA}")" = "$(git rev-parse origin/main)"
git push origin "${RELEASE_SHA}:refs/heads/main"
git ls-remote origin refs/heads/main
```

Expected: remote main equals `RELEASE_SHA`. If branch protection rejects direct push, open a PR for this exact branch, require green checks, merge it, and continue with the merge SHA.

- [ ] **Step 7: Monitor established dev migration/API deployment**

The main push triggers `Build Docker Images` and then `Auto Deploy Dev`:

```bash
RELEASE_SHA="$(git rev-parse origin/main)"
BUILD_RUN_ID="$(gh run list --workflow "Build Docker Images" \
  --branch main --commit "${RELEASE_SHA}" --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
test -n "${BUILD_RUN_ID}"
gh run watch "${BUILD_RUN_ID}" --compact --exit-status
DEV_RUN_ID="$(gh run list --workflow "Auto Deploy Dev" \
  --branch main --commit "${RELEASE_SHA}" --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
test -n "${DEV_RUN_ID}"
gh run watch "${DEV_RUN_ID}" --compact --exit-status
```

Expected: the build for `RELEASE_SHA`, development migration verification, and API deployment all succeed; API headers expose `x-gooes-revision: RELEASE_SHA`.

Verify migration history without printing the connection string:

```bash
pnpm dlx supabase@2.99.0 migration list --db-url "${SUPABASE_DB_DIRECT_URL}"
```

Expected: migration `20260829170000` appears in both Local and Remote columns.

- [ ] **Step 8: Run authenticated dev smoke**

Load an approved employee token into `GOOES_DEV_EMPLOYEE_TOKEN` without printing it, then call:

```bash
curl -fsS -D /tmp/gooes-project-options-all.headers \
  -H "Authorization: Bearer ${GOOES_DEV_EMPLOYEE_TOKEN}" \
  "https://api-dev.goodcms.cn/supplier-purchase-batch-project-options?page=1&pageSize=20"
curl -fsS -D /tmp/gooes-project-options-seven-days.headers \
  -H "Authorization: Bearer ${GOOES_DEV_EMPLOYEE_TOKEN}" \
  "https://api-dev.goodcms.cn/supplier-purchase-batch-project-options?page=1&pageSize=20&updatedWindow=last_7_days&timezone=Asia%2FShanghai"
curl -fsS -D /tmp/gooes-project-options-month.headers \
  -H "Authorization: Bearer ${GOOES_DEV_EMPLOYEE_TOKEN}" \
  "https://api-dev.goodcms.cn/supplier-purchase-batch-project-options?page=1&pageSize=20&updatedWindow=current_month&timezone=Asia%2FShanghai"
```

Also send one unknown window and one invalid timezone without `-f`; both must return HTTP 400 / `VALIDATION_ERROR`. Capture only masked project IDs/names, counts, status codes, `x-gooes-revision`, and Request-ID. Remove the temporary header files after extracting non-sensitive evidence.

- [ ] **Step 9: Produce the Orange handoff**

Report the final main commit/dev revision; final parameters; closed last-7-days and half-open Shanghai month boundaries; unchanged permissions, scope, response, pagination, and unfiltered order; masked success/error Request-IDs; and samples from these three existing dev groups:

- within 7 days;
- current month but older than 7 days;
- older than current month.

If dev data lacks a group, report it explicitly. Do not backdate through SQL, add test fixtures to production migrations, expose credentials, or modify Orange.
