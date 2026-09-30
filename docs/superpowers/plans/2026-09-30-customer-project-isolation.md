# Customer Project Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent customer detail and project-list APIs from ever returning another customer's project when a `customer_id` filter is requested.

**Architecture:** Extend the existing project list query/filter/cache pipeline with a customer dimension, and add one bounded tenant-and-customer-scoped repository lookup for the customer detail summary. Preserve existing access-policy checks and workflow behavior; tests prove the cross-customer boundary before production code changes.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase JS, Bun test.

---

## File map

- Create `apps/api/src/schema/projects.test.ts`: query contract regression tests.
- Modify `apps/api/src/schema/projects.ts`: accept optional UUID `customer_id`.
- Create `apps/api/src/services/projects/legacy/customer-filter.test.ts`: service filter and cache isolation tests.
- Modify `apps/api/src/services/projects/legacy/lists.ts`: forward the filter and include it in cache identity.
- Modify `apps/api/src/repositories/projects/legacy/shared.ts`: type the repository filter.
- Modify `apps/api/src/repositories/projects/legacy-repository.ts`: apply the customer filter to both rows and count.
- Create `apps/api/src/repositories/customer-core.test.ts`: latest-project query contract tests.
- Modify `apps/api/src/repositories/customer-core.ts`: bounded latest-project lookup with stable ordering.
- Create `apps/api/src/controllers/customer/customer-detail-project.test.ts`: detail response isolation tests.
- Modify `apps/api/src/controllers/customer/shared.ts`: attach the trusted latest-project summary.
- Modify `apps/api/src/services/customer-status.test.ts`: workflow boundary regressions only; no production workflow changes expected.

### Task 1: Project query schema contract

**Files:**
- Create: `apps/api/src/schema/projects.test.ts`
- Modify: `apps/api/src/schema/projects.ts`

- [ ] **Step 1: Write the failing schema tests**

```ts
import { describe, expect, test } from 'bun:test';
import { ProjectListQuerySchema } from './projects';

const CUSTOMER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('ProjectListQuerySchema customer filter', () => {
  test('preserves a valid customer_id', () => {
    expect(ProjectListQuerySchema.parse({ customer_id: CUSTOMER_ID }))
      .toMatchObject({ customer_id: CUSTOMER_ID, page: 1, pageSize: 20 });
  });

  test('rejects an invalid customer_id', () => {
    expect(ProjectListQuerySchema.safeParse({ customer_id: 'customer-a' }).success)
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test apps/api/src/schema/projects.test.ts`

Expected: the valid ID assertion fails because `customer_id` was stripped.

- [ ] **Step 3: Add the minimal schema field**

Add to `ProjectListQuerySchema`:

```ts
customer_id: optionalQueryValue(z.uuid('无效的客户 ID')),
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `bun test apps/api/src/schema/projects.test.ts`

Expected: 2 tests pass.

### Task 2: Project service, repository, pagination, and cache isolation

**Files:**
- Create: `apps/api/src/services/projects/legacy/customer-filter.test.ts`
- Modify: `apps/api/src/services/projects/legacy/lists.ts`
- Modify: `apps/api/src/repositories/projects/legacy/shared.ts`
- Modify: `apps/api/src/repositories/projects/legacy-repository.ts`

- [ ] **Step 1: Write failing service and cache tests**

Test the exported `projectListCacheKey` with two UUID customer IDs and assert distinct keys.
Test exported `loadProjects.call(service, input)` with spies on
`projectRepository.count` and `projectRepository.listRows`; assert both receive:

```ts
expect.objectContaining({
  tenantId: TENANT_ID,
  visibleProjectIds: ['project-b'],
  customerId: CUSTOMER_B_ID,
});
```

The service fixture must return one B project for B and an empty page for A, proving that
the same tenant and pagination inputs do not cross customer boundaries.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test apps/api/src/services/projects/legacy/customer-filter.test.ts`

Expected: cache keys collide and repository filters omit `customerId`.

- [ ] **Step 3: Thread the filter through service and types**

In `ProjectCoreListFilters` add:

```ts
customerId?: string;
```

In `loadProjects`, destructure `customer_id: customerId` and include `customerId` in the
filters object. In `projectListCacheKey`, add:

```ts
customer_id: query.customer_id ?? null,
```

- [ ] **Step 4: Apply the filter in the shared repository query**

In `applyProjectListFilters` add:

```ts
if (filters.customerId) {
  filteredQuery = filteredQuery.eq('customer_id', filters.customerId);
}
```

Because `count()` and `listRows()` both call this function, the page rows and exact total use
the same tenant, visibility, and customer constraints.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```bash
bun test apps/api/src/schema/projects.test.ts \
  apps/api/src/services/projects/legacy/customer-filter.test.ts
```

Expected: all focused tests pass.

### Task 3: Trusted `latest_project` on customer detail

**Files:**
- Create: `apps/api/src/repositories/customer-core.test.ts`
- Create: `apps/api/src/controllers/customer/customer-detail-project.test.ts`
- Modify: `apps/api/src/repositories/customer-core.ts`
- Modify: `apps/api/src/controllers/customer/shared.ts`

- [ ] **Step 1: Write a failing repository query test**

Use a deterministic fake Supabase query builder and assert the new method applies:

```ts
expect(calls).toContainEqual(['eq', 'tenant_id', TENANT_ID]);
expect(calls).toContainEqual(['eq', 'customer_id', CUSTOMER_A_ID]);
expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
expect(calls).toContainEqual(['order', 'id', { ascending: false }]);
expect(calls).toContainEqual(['limit', 1]);
```

Also assert it selects exactly `id, customer_id, name, status, created_at` and returns `null`
when no project exists.

- [ ] **Step 2: Write failing detail aggregation tests**

Expose a small pure invariant helper from `customer/shared.ts`:

```ts
export function assertCustomerLatestProject(
  customerId: string,
  project: CustomerLatestProjectSummary | null,
): CustomerLatestProjectSummary | null
```

Test these cases:

```ts
expect(assertCustomerLatestProject(CUSTOMER_A_ID, null)).toBeNull();
expect(assertCustomerLatestProject(CUSTOMER_A_ID, projectA)).toEqual(projectA);
expect(() => assertCustomerLatestProject(CUSTOMER_A_ID, projectB))
  .toThrow('客户项目归属异常');
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
bun test apps/api/src/repositories/customer-core.test.ts \
  apps/api/src/controllers/customer/customer-detail-project.test.ts
```

Expected: imports fail because the repository method and invariant helper do not exist.

- [ ] **Step 4: Implement the bounded repository lookup**

Add to `CustomerCoreRepository`:

```ts
async findLatestProject(input: {
  customerId: string;
  tenantId: string;
}): Promise<CustomerLatestProjectSummary | null> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from('projects')
    .select('id, customer_id, name, status, created_at')
    .eq('tenant_id', input.tenantId)
    .eq('customer_id', input.customerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError('查询客户项目摘要失败', error);
  }

  return (data as CustomerLatestProjectSummary | null) ?? null;
}
```

- [ ] **Step 5: Add the response invariant and aggregation**

The helper returns `null` unchanged, returns a matching project, and throws
`Errors.dbError('客户项目归属异常')` for a mismatched `customer_id`.

In `buildCustomerDetailResponse`, add the repository call to the existing `Promise.all`:

```ts
customerCoreRepository.findLatestProject({
  customerId: customer.id,
  tenantId,
}),
```

Return:

```ts
latest_project: assertCustomerLatestProject(customer.id, latestProject),
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
bun test apps/api/src/repositories/customer-core.test.ts \
  apps/api/src/controllers/customer/customer-detail-project.test.ts
```

Expected: repository boundary, null response, matching response, and mismatch fail-closed tests
all pass.

### Task 4: Customer workflow regressions

**Files:**
- Modify: `apps/api/src/services/customer-status.test.ts`

- [ ] **Step 1: Add the potential-customer action test**

Call `customerStatusService.listCustomerStatusActions` for a potential customer and assert
that the normal progression includes `start_following` and excludes `start_design`.

- [ ] **Step 2: Add the missing-property test**

Configure `getPrimarySummary` to return `null`, submit `start_design` for an arrived customer,
and assert rejection with `客户进入设计前必须先维护房产信息`. Also assert
`findActiveByCustomerProperty`, `createProject`, and `updateCustomerById` were not called.

- [ ] **Step 3: Preserve the idempotent project-reuse test**

Configure `findActiveByCustomerProperty` to return project A, submit `start_design`, and assert:

```ts
expect(findActiveByCustomerProperty).toHaveBeenCalledWith({
  tenantId: 'tenant-1',
  customerId: 'customer-1',
  propertyId: 'property-1',
});
expect(createProject).not.toHaveBeenCalled();
```

- [ ] **Step 4: Run the workflow tests**

Run: `bun test apps/api/src/services/customer-status.test.ts`

Expected: all tests pass without production workflow changes.

### Task 5: Full verification and handoff

**Files:**
- Modify only if verification reveals a scoped defect.

- [ ] **Step 1: Run all directly related tests**

```bash
bun test apps/api/src/schema/projects.test.ts \
  apps/api/src/services/projects/legacy/customer-filter.test.ts \
  apps/api/src/repositories/customer-core.test.ts \
  apps/api/src/controllers/customer/customer-detail-project.test.ts \
  apps/api/src/services/customer-status.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run static and build checks**

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
```

Expected: all exit 0.

- [ ] **Step 3: Review repository boundaries**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: only the planned gooes files changed; orange remains untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add apps/api/src/schema/projects.ts \
  apps/api/src/schema/projects.test.ts \
  apps/api/src/services/projects/legacy/lists.ts \
  apps/api/src/services/projects/legacy/customer-filter.test.ts \
  apps/api/src/repositories/projects/legacy/shared.ts \
  apps/api/src/repositories/projects/legacy-repository.ts \
  apps/api/src/repositories/customer-core.ts \
  apps/api/src/repositories/customer-core.test.ts \
  apps/api/src/controllers/customer/shared.ts \
  apps/api/src/controllers/customer/customer-detail-project.test.ts \
  apps/api/src/services/customer-status.test.ts
git commit -m "fix(customer): 修复客户项目串联"
```

- [ ] **Step 5: Prepare the mini-program handoff message**

Report the final API contract, compatibility note, regression evidence, deployment dependency,
and confirm `/Users/leefo/Public/work/orange` was not modified.
