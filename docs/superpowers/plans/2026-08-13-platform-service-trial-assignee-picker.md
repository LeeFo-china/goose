# Platform Service Trial Assignee Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every platform service trial assignee UUID input with one paginated, searchable, permission-safe platform employee picker.

**Architecture:** Add a trial-owned candidate read path through schema → repository → service → controller so trial managers do not need platform-directory permission. Add one client Combobox that performs debounced remote search and reuse it in grant, review, assign, and filters while keeping UUIDs internal to requests and URLs.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase PostgREST, Next.js App Router, React, shadcn Command/Popover, Tailwind.

---

### Task 1: Define the assignee candidate API contract

**Files:**
- Modify: `apps/api/src/schema/service-trials.ts`
- Modify: `apps/api/src/schema/service-trials.test.ts`
- Create: `apps/api/src/repositories/platform-service-trial-assignees.ts`
- Create: `apps/api/src/repositories/platform-service-trial-assignees.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add cases proving defaults `page=1&pageSize=20`, maximum `pageSize=100`, optional 80-character keyword, optional UUID `includeEmployeeId`, and strict rejection of unknown fields.

```ts
expect(PlatformServiceTrialAssigneeCandidatesQuerySchema.parse({})).toEqual({
  page: 1,
  pageSize: 20,
});
expect(PlatformServiceTrialAssigneeCandidatesQuerySchema.safeParse({
  pageSize: 101,
}).success).toBe(false);
```

- [ ] **Step 2: Run schema tests and verify RED**

Run: `cd apps/api && bun test src/schema/service-trials.test.ts`

Expected: FAIL because `PlatformServiceTrialAssigneeCandidatesQuerySchema` is not exported.

- [ ] **Step 3: Implement the strict query schema**

Reuse `PaginationQuerySchema`, add the same local `optionalQueryValue` preprocessor used by neighboring schemas, normalize empty optional query strings, and export the inferred query type.

```ts
const optionalQueryValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" || normalized === "undefined" || normalized === "null"
      ? undefined
      : normalized;
  }, schema.optional());

export const PlatformServiceTrialAssigneeCandidatesQuerySchema =
  PaginationQuerySchema.extend({
    keyword: optionalQueryValue(z.string().trim().max(80)),
    includeEmployeeId: optionalQueryValue(z.uuid()),
  }).strict();
```

- [ ] **Step 4: Write failing repository tests**

Cover:

- necessary employee columns only;
- `tenant_id IS NULL`, active status and active platform role constraints;
- `.range(offset, to)` and exact count;
- escaped name/phone keyword search;
- one batched role query, never N+1;
- optional historical employee query by exact ID;
- resolved database errors use `Errors.dbError` without leaking sentinel details.

- [ ] **Step 5: Run repository tests and verify RED**

Run: `cd apps/api && bun test src/repositories/platform-service-trial-assignees.test.ts`

Expected: FAIL because the repository module does not exist.

- [ ] **Step 6: Implement the repository**

Define a narrow record and page type. Query active platform candidates with exact count and range, then batch-load active platform roles for returned employee IDs. If `includeEmployeeId` is absent from the page, fetch that single platform employee as historical display context. Do not return full phone outside repository records.

- [ ] **Step 7: Run Task 1 tests and commit**

Run:

```bash
cd apps/api
bun test src/schema/service-trials.test.ts \
  src/repositories/platform-service-trial-assignees.test.ts
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/schema/service-trials.ts \
  apps/api/src/schema/service-trials.test.ts \
  apps/api/src/repositories/platform-service-trial-assignees.ts \
  apps/api/src/repositories/platform-service-trial-assignees.test.ts
git commit -m "feat(trial): 增加平台跟进人候选查询"
```

### Task 2: Expose candidates through service and controller boundaries

**Files:**
- Modify: `apps/api/src/services/platform-service-trials.ts`
- Modify: `apps/api/src/services/platform-service-trials.test.ts`
- Modify: `apps/api/src/controllers/platform-service-trials/index.ts`
- Modify: `apps/api/src/controllers/platform-service-trials/routes.test.ts`

- [ ] **Step 1: Write failing service tests**

Add tests proving:

- `platform.service_trial.manage` is required;
- `platform.operator.read` is not required;
- ordinary active candidates are selectable;
- historical inactive candidate is returned once with `historical=true` and `selectable=false`;
- phone is always masked;
- pagination is preserved and no extra repository calls occur.

```ts
const result = await service.listAssigneeCandidates(manageContext, query);
expect(result.list[0]).toMatchObject({
  phone_masked: "138****8000",
  selectable: true,
  historical: false,
});
```

- [ ] **Step 2: Run service tests and verify RED**

Run: `cd apps/api && bun test src/services/platform-service-trials.test.ts`

Expected: FAIL because `listAssigneeCandidates` is missing.

- [ ] **Step 3: Implement the service projection**

Inject the new repository port, assert only `platform.service_trial.manage`, mask phones with the existing platform-operator masking convention, sort role labels stably, and fail closed on malformed records.

- [ ] **Step 4: Write failing controller tests**

Assert exact registration before `/:id`, explicit read route metadata, request-aware platform context, Zod parsing, delegation, response wrapping, and invalid query rejection before service invocation.

```ts
{
  method: "GET",
  path: "/platform/billing/service-trials/assignee-candidates",
  tenantServiceAccess: "read",
}
```

- [ ] **Step 5: Run controller tests and verify RED**

Run: `cd apps/api && bun test src/controllers/platform-service-trials/routes.test.ts`

Expected: FAIL because the route is not registered.

- [ ] **Step 6: Implement the controller route**

Place the static route before `/:id`, call `getRequiredPlatformStaffContext(request)`, validate with the new schema, delegate to the service, and return `ResponseHandler.success(data)`.

- [ ] **Step 7: Run Task 2 tests and commit**

Run:

```bash
cd apps/api
bun test src/services/platform-service-trials.test.ts \
  src/controllers/platform-service-trials/routes.test.ts
bun run typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/services/platform-service-trials.ts \
  apps/api/src/services/platform-service-trials.test.ts \
  apps/api/src/controllers/platform-service-trials/index.ts \
  apps/api/src/controllers/platform-service-trials/routes.test.ts
git commit -m "feat(trial): 暴露跟进人候选接口"
```

### Task 3: Build the reusable searchable assignee Combobox

**Files:**
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-assignee-combobox.tsx`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-assignee-options.ts`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-assignee-options.test.ts`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-types.ts`

- [ ] **Step 1: Write failing interaction and source-contract tests**

Cover the component's pure query, projection and selection-state helpers:

- endpoint and query construction with page, pageSize, keyword and includeEmployeeId;
- page reset when keyword changes;
- readable label `姓名 · 脱敏手机号 · 角色`;
- selection returns only the employee UUID to the parent;
- guided required mode has no clear option;
- assign/filter mode exposes an explicit clear action;
- historical inactive value is labeled and disabled;
- candidate response binding rejects malformed pagination and records;
- a source-contract assertion locks 250ms debounce, AbortController cleanup, loading, empty and request-error UI states.

- [ ] **Step 2: Run component tests and verify RED**

Run: `cd apps/admin && bun test components/platform-service-trials/platform-service-trial-assignee-options.test.ts`

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement the Combobox**

Use existing local components only:

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button type="button" variant="outline" role="combobox">
      <span className="truncate">{selectedLabel || placeholder}</span>
      <ChevronsUpDown />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
    <Command shouldFilter={false}>
      <CommandInput value={keyword} onValueChange={setKeyword} />
      <CommandList>
        <CommandEmpty>{loading ? "加载中..." : error || "没有匹配的平台人员"}</CommandEmpty>
        <CommandGroup>
          {allowClear && value ? (
            <CommandItem value="clear" onSelect={() => onChange(null)}>
              取消当前分配
            </CommandItem>
          ) : null}
          {candidates.map((candidate) => (
            <CommandItem
              key={candidate.id}
              value={candidate.id}
              disabled={!candidate.selectable}
              onSelect={() => onChange(candidate.id)}
            >
              {formatTrialAssigneeCandidate(candidate)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Keep the selected candidate object in state so the trigger never falls back to displaying a UUID. Fetch no more than 20 records per page; provide previous/next controls when `totalPages > 1`. Put query construction, response validation and label formatting in `platform-service-trial-assignee-options.ts` so they are directly testable without introducing a browser-test dependency.

- [ ] **Step 4: Run Task 3 tests and commit**

Run:

```bash
cd apps/admin
bun test components/platform-service-trials/platform-service-trial-assignee-options.test.ts
pnpm check
```

Expected: PASS.

Commit:

```bash
git add apps/admin/components/platform-service-trials/platform-service-trial-assignee-combobox.tsx \
  apps/admin/components/platform-service-trials/platform-service-trial-assignee-options.ts \
  apps/admin/components/platform-service-trials/platform-service-trial-assignee-options.test.ts \
  apps/admin/components/platform-service-trials/platform-service-trial-types.ts
git commit -m "feat(admin): 增加试用跟进人选择器"
```

### Task 4: Replace UUID inputs in all four entry points

**Files:**
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-action-dialog.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-approval-fields.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-filters.tsx`
- Modify: `apps/admin/app/(console)/platform/service-orders/page.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-page-state.ts`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts`
- Create: `apps/admin/components/platform-service-trials/platform-service-trial-assignee-integration.test.ts`

- [ ] **Step 1: Write failing integration/source-contract tests**

Assert:

- no label or placeholder contains `跟进人员工 ID`, `员工 ID`, or `UUID`;
- approval fields use the Combobox and make guided trials required;
- assign dialog permits explicit clear and renders before/after summary;
- grant and review payloads still send the selected `assignee_employee_id`;
- filter uses a readable picker but serializes `trialAssigneeEmployeeId` into the URL;
- page reload passes the filter UUID as `includeEmployeeId` to restore its label.

- [ ] **Step 2: Run integration tests and verify RED**

Run:

```bash
cd apps/admin
bun test components/platform-service-trials/platform-service-trials-page.test.ts \
  components/platform-service-trials/platform-service-trial-assignee-integration.test.ts
```

Expected: FAIL because the old UUID inputs remain.

- [ ] **Step 3: Replace approval and assign inputs**

Pass `value`, `onChange`, `required`, `allowClear`, and the current readable candidate to the shared Combobox. Preserve existing idempotency, `expected_version`, reason validation and mutation flow. Add confirmation copy derived from old and new candidate labels.

- [ ] **Step 4: Replace the list filter**

Keep `PlatformServiceTrialFilters` as the focused client boundary for selection state. Preserve the surrounding GET form and independent trial URL keys. Submit a hidden `trialAssigneeEmployeeId` field; the visible control contains no raw UUID.

- [ ] **Step 5: Run Task 4 tests and commit**

Run:

```bash
cd apps/admin
bun test components/platform-service-trials/platform-service-trials-page.test.ts \
  components/platform-service-trials/platform-service-trial-assignee-integration.test.ts \
  components/platform-service-trials/platform-service-trial-assignee-options.test.ts
pnpm check
pnpm build
```

Expected: PASS.

Commit:

```bash
git add apps/admin/components/platform-service-trials \
  'apps/admin/app/(console)/platform/service-orders/page.tsx'
git commit -m "fix(admin): 用人员选择器分配试用跟进人"
```

### Task 5: Full verification and review

**Files:**
- Verify all changed files

- [ ] **Step 1: Run focused API and Admin regression suites**

```bash
cd apps/api
bun test src/schema/service-trials.test.ts \
  src/repositories/platform-service-trial-assignees.test.ts \
  src/services/platform-service-trials.test.ts \
  src/controllers/platform-service-trials/routes.test.ts

cd ../admin
bun test components/platform-service-trials/*.test.ts \
  components/platform-service-orders/platform-service-orders-page.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run repository gates**

```bash
bun run api:check
pnpm --dir apps/admin check
pnpm --dir apps/admin build
bun run check:permission-boundaries
bun run check:file-size
git diff --check origin/main...HEAD
```

Expected: all commands exit 0 and every handwritten TS/TSX file remains under 500 lines.

- [ ] **Step 3: Run browser smoke**

Open the trial tab in the dev/local Admin and verify:

1. grant picker searches by name/phone and does not show UUID;
2. review guided mode requires a person;
3. assign shows current/new readable labels and explicit clear;
4. filter selects a person and persists through URL reload;
5. keyboard focus, empty, loading and error states remain usable.

- [ ] **Step 4: Review the complete diff**

Compare `origin/main...HEAD` against the design document. Confirm no permission expansion, no unpaginated list, no full phone leakage, no Orange changes, no new dependency, and no database migration.

- [ ] **Step 5: Commit any review-only corrections separately**

```bash
git add apps/api/src/schema/service-trials.ts \
  apps/api/src/repositories/platform-service-trial-assignees.ts \
  apps/api/src/services/platform-service-trials.ts \
  apps/api/src/controllers/platform-service-trials/index.ts \
  apps/admin/components/platform-service-trials \
  'apps/admin/app/(console)/platform/service-orders/page.tsx'
git commit -m "fix(trial): 收紧跟进人选择边界"
```
