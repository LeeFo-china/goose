# Tenant Douyin Miniapp Phase 3 Leads Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn existing `marketing_leads.source = 'douyin_miniapp'` submissions into a tenant-scoped lead pool with manual assignment, follow-up history, single atomic customer conversion, and in-product notifications.

**Architecture:** Extend the existing marketing lead model with assignment fields and add an activity ledger. All state mutations and customer conversion use transaction-safe RPCs; a dedicated tenant service enforces functional permission plus assignee data scope.

**Tech Stack:** PostgreSQL migrations/RPC, Supabase repositories, Fastify, Zod, existing customer sources and notifications, Next.js, TanStack Table, shadcn/Radix.

---

## File Map

Create:

- `supabase/migrations/20260726120000_extend_douyin_lead_operations.sql`
- `apps/api/src/services/tenant-douyin-miniapp/leads-migration-contract.test.ts`
- `apps/api/src/repositories/tenant-douyin-miniapp-leads.ts`
- `apps/api/src/repositories/tenant-douyin-miniapp-leads.test.ts`
- `apps/api/src/services/tenant-douyin-miniapp/leads.ts`
- `apps/api/src/services/tenant-douyin-miniapp/leads.test.ts`
- `apps/api/src/schema/tenant-douyin-miniapp-leads.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/leads-controller.ts`
- `apps/api/src/controllers/tenant-douyin-miniapp/leads-controller.test.ts`
- `apps/admin/app/(console)/douyin-miniapp/leads/page.tsx`
- `apps/admin/app/(console)/douyin-miniapp/leads/loading.tsx`
- `apps/admin/components/douyin-miniapp/leads/lead-types.ts`
- `apps/admin/components/douyin-miniapp/leads/lead-display.ts`
- `apps/admin/components/douyin-miniapp/leads/lead-display.test.ts`
- `apps/admin/components/douyin-miniapp/leads/lead-list.tsx`
- `apps/admin/components/douyin-miniapp/leads/lead-table.tsx`
- `apps/admin/components/douyin-miniapp/leads/lead-detail-sheet.tsx`
- `apps/admin/components/douyin-miniapp/leads/lead-actions.tsx`

Modify:

- `apps/api/src/services/douyin-miniapp/marketing.ts`
- `apps/api/src/services/douyin-miniapp/marketing.test.ts`
- `apps/api/src/services/notifications.ts`
- `apps/api/src/services/notifications.test.ts` if present; otherwise add focused tests
- `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- `apps/admin/components/layout/menu-config.ts`
- `apps/admin/components/layout/notification-menu.tsx`

## Task 1: Extend the Existing Lead Model

- [ ] **Step 1: Write the failing migration contract**

Create `apps/api/src/services/tenant-douyin-miniapp/leads-migration-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726120000_extend_douyin_lead_operations.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("douyin lead operations migration", () => {
  test("extends marketing leads instead of creating a duplicate lead table", () => {
    expect(sql).toContain("ALTER TABLE public.marketing_leads");
    expect(sql).not.toContain("CREATE TABLE public.douyin_miniapp_leads");
  });

  test("adds assignment, activity, source linkage and atomic commands", () => {
    expect(sql).toContain("ADD COLUMN assigned_employee_id uuid NULL");
    expect(sql).toContain("CREATE TABLE public.douyin_miniapp_lead_activities");
    expect(sql).toContain("ADD COLUMN marketing_lead_id uuid NULL");
    for (const command of [
      "assign_douyin_miniapp_lead",
      "follow_up_douyin_miniapp_lead",
      "close_douyin_miniapp_lead",
      "convert_douyin_miniapp_lead_to_customer",
    ]) {
      expect(sql).toContain(`FUNCTION public.${command}`);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/leads-migration-contract.test.ts
```

Expected: FAIL because the migration is missing.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260726120000_extend_douyin_lead_operations.sql` with:

```sql
BEGIN;

ALTER TABLE public.marketing_leads
  ADD COLUMN assigned_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  ADD COLUMN assigned_at timestamptz NULL,
  ADD COLUMN closed_at timestamptz NULL;

ALTER TABLE public.customer_sources
  ADD COLUMN marketing_lead_id uuid NULL
  REFERENCES public.marketing_leads(id) ON DELETE SET NULL;

CREATE TABLE public.douyin_miniapp_lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  marketing_lead_id uuid NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (
    activity_type IN ('created', 'assigned', 'reassigned', 'follow_up', 'converted', 'closed')
  ),
  actor_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  content text NULL CHECK (content IS NULL OR length(content) <= 2000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Add:

- assignment shape check: `assigned_employee_id` and `assigned_at` are both null or both non-null;
- `closed_at` only when `lead_status = 'invalid'`;
- tenant/status/assignee/created index restricted to `source = 'douyin_miniapp'`;
- activity `(tenant_id, marketing_lead_id, created_at DESC, id DESC)` index;
- unique `customer_sources(customer_id, marketing_lead_id)` where lead ID is not null;
- RLS and service-role-only access matching other sensitive tables;
- trigger or RPC validation that assignee employee belongs to the same active tenant.

Implement four SECURITY DEFINER RPCs with `search_path = pg_catalog, public`, input validation, fixed lock order, tenant/source validation, and activity insertion.

`convert_douyin_miniapp_lead_to_customer` must:

1. lock the Douyin marketing lead;
2. reject wrong tenant, unassigned lead, closed lead, or missing phone;
3. return the already converted customer idempotently when the same customer is linked;
4. find an existing customer by tenant and phone, otherwise create a `potential` customer with `source = 'douyin'` and owner equal to the lead assignee;
5. insert `customer_sources` with source `douyin_miniapp` and `marketing_lead_id`;
6. update `marketing_leads.customer_id`, `lead_status = 'converted'`, `followed_by`, and `followed_at`;
7. insert one `converted` activity;
8. return `lead_id`, `customer_id`, `created_customer`, and `status`.

Rollback must disable lead mutation endpoints, then drop RPCs, activity table, indexes, and added columns. It must not delete existing marketing leads or customers.

- [ ] **Step 4: Run the migration contract test**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/leads-migration-contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726120000_extend_douyin_lead_operations.sql \
  apps/api/src/services/tenant-douyin-miniapp/leads-migration-contract.test.ts
git commit -m "feat(db): extend douyin lead operations"
```

Do not apply the migration in this task.

## Task 2: Add Paginated Lead Repository and Data Scope

- [ ] **Step 1: Write repository tests**

Create `tenant-douyin-miniapp-leads.test.ts` covering:

```ts
test("always filters the source and tenant", async () => {
  await repository.list({
    tenantId: TENANT_ID,
    page: 1,
    pageSize: 20,
    dataScope: { kind: "all" },
  });
  expect(filters).toContainEqual(["tenant_id", TENANT_ID]);
  expect(filters).toContainEqual(["source", "douyin_miniapp"]);
  expect(range).toEqual([0, 19]);
});

test("limits own scope to the assigned employee", async () => {
  await repository.list({
    tenantId: TENANT_ID,
    page: 2,
    pageSize: 20,
    dataScope: { kind: "assignee", employeeId: EMPLOYEE_ID },
  });
  expect(filters).toContainEqual(["assigned_employee_id", EMPLOYEE_ID]);
  expect(range).toEqual([20, 39]);
});

test("selects only required lead, assignee and customer fields", async () => {
  await repository.list(baseInput());
  expect(selectClause).not.toMatch(/request_ip|user_agent|subject_hash|sms_code/);
});
```

- [ ] **Step 2: Verify tests fail**

```bash
bun test apps/api/src/repositories/tenant-douyin-miniapp-leads.test.ts
```

Expected: FAIL because the repository is missing.

- [ ] **Step 3: Implement the repository**

Create a repository with:

```ts
list(input: LeadListInput): Promise<Page<TenantDouyinLeadRecord>>
findDetail(input: { tenantId: string; leadId: string; assigneeId?: string }):
  Promise<TenantDouyinLeadRecord | null>
listActivities(input: {
  tenantId: string;
  leadId: string;
  page: number;
  pageSize: number;
}): Promise<Page<DouyinLeadActivity>>
assign(input: AssignLeadCommand): Promise<LeadMutationResult>
followUp(input: FollowUpLeadCommand): Promise<LeadMutationResult>
close(input: CloseLeadCommand): Promise<LeadMutationResult>
convert(input: ConvertLeadCommand): Promise<LeadConversionResult>
```

List selection must include lead identity, safe attribution, status, assignee, customer, and timestamps. Extract `area`, `budget`, `start_time`, `demand`, and attribution from `form_data` in the serializer, not with N+1 queries.

Mutation methods call only RPCs.

- [ ] **Step 4: Run tests and commit**

```bash
bun test apps/api/src/repositories/tenant-douyin-miniapp-leads.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/repositories/tenant-douyin-miniapp-leads*
git commit -m "feat(api): add tenant douyin lead repository"
```

## Task 3: Add Lead Service, Permissions, and Privacy

- [ ] **Step 1: Write service tests**

Create `leads.test.ts` covering:

```ts
test("tenant admin read scope returns all tenant leads", async () => {
  await service.list(adminContext(), query());
  expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({
    tenantId: TENANT_ID,
    dataScope: { kind: "all" },
  }));
});

test("sales read scope returns only own assigned leads", async () => {
  await service.list(salesContext(), query());
  expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({
    dataScope: { kind: "assignee", employeeId: SALES_ID },
  }));
});

test("masks phone without full-phone permission", async () => {
  const result = await service.list(salesContextWithoutPhonePermission(), query());
  expect(result.list[0].phone).toBe("138****8000");
});

test("requires assign and convert permissions independently", async () => {
  await expect(service.assign(readOnlyContext(), LEAD_ID, assignInput()))
    .rejects.toMatchObject({ statusCode: 403 });
  await expect(service.convert(assignOnlyContext(), LEAD_ID, convertInput()))
    .rejects.toMatchObject({ statusCode: 403 });
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/leads.test.ts
```

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement the service**

Create `TenantDouyinMiniappLeadsService`. Data-scope rule:

```ts
private resolveReadScope(authContext: AuthContext) {
  const scope = this.accessPolicy.assertPermission(authContext, "douyin_lead.read");
  if (scope === "all" || authContext.permissions.some(
    (item) => item.code === "douyin_lead.assign",
  )) {
    return { kind: "all" as const };
  }
  if (!authContext.employeeId) throw Errors.forbidden();
  return { kind: "assignee" as const, employeeId: authContext.employeeId };
}
```

Before assign, follow-up, close, or convert:

- derive tenant from auth context;
- require the exact action permission;
- verify current user can read the target lead;
- ensure assigned employee is active in the same tenant;
- serialize phone according to existing customer phone permission codes;
- map database status to `unassigned`, `following_up`, `converted`, or `closed`.

- [ ] **Step 4: Add schemas and controller**

Create strict schemas:

```ts
LeadListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["unassigned", "following_up", "converted", "closed"]).optional(),
  assignee_id: z.uuid().optional(),
  keyword: z.string().trim().max(100).optional(),
});
AssignLeadSchema = z.strictObject({ assignee_employee_id: z.uuid() });
FollowUpLeadSchema = z.strictObject({ content: z.string().trim().min(2).max(2000) });
CloseLeadSchema = z.strictObject({ reason: z.string().trim().min(2).max(500) });
ConvertLeadSchema = z.strictObject({ note: z.string().trim().max(500).nullable().optional() });
```

Routes:

```text
GET  /tenant/douyin-miniapp/leads
GET  /tenant/douyin-miniapp/leads/:id
GET  /tenant/douyin-miniapp/leads/:id/activities
POST /tenant/douyin-miniapp/leads/:id/assign
POST /tenant/douyin-miniapp/leads/:id/follow-ups
POST /tenant/douyin-miniapp/leads/:id/close
POST /tenant/douyin-miniapp/leads/:id/convert-customer
```

- [ ] **Step 5: Run tests and commit**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp/leads.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp/leads-controller.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/schema/tenant-douyin-miniapp-leads.ts \
  apps/api/src/services/tenant-douyin-miniapp/leads* \
  apps/api/src/controllers/tenant-douyin-miniapp
git commit -m "feat(api): add tenant douyin lead operations"
```

## Task 4: Add New-Lead and Assignment Notifications

- [ ] **Step 1: Write notification tests**

Cover:

```ts
test("notifies tenant admins only for a newly created submission", async () => {
  repository.submitLead.mockResolvedValue({
    lead_id: LEAD_ID,
    already_submitted: false,
    updated_existing: false,
    message: SUCCESS_MESSAGE,
  });
  await service.submitLead(user(), input(), metadata());
  expect(notifications.tryNotifyDouyinLeadCreated).toHaveBeenCalledWith(
    expect.objectContaining({ tenantId: TENANT_ID, leadId: LEAD_ID }),
  );
});

test("does not duplicate notifications for a repeated submission", async () => {
  repository.submitLead.mockResolvedValue({
    lead_id: LEAD_ID,
    already_submitted: true,
    updated_existing: true,
    message: SUCCESS_MESSAGE,
  });
  await service.submitLead(user(), input(), metadata());
  expect(notifications.tryNotifyDouyinLeadCreated).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement notification helpers**

Add to `NotificationService`:

```ts
async notifyDouyinLeadCreated(input: {
  tenantId: string;
  leadId: string;
  name: string | null;
  phone: string;
}) {
  return this.createTenantAdminNotifications({
    tenantId: input.tenantId,
    scene: "douyin_lead_created",
    title: "新的抖音咨询",
    content: `${input.name || maskPhone(input.phone) || "业主"}提交了装修咨询，请及时分配。`,
    targetType: "douyin_lead",
    targetId: input.leadId,
    targetUrl: `/douyin-miniapp/leads?leadId=${input.leadId}`,
    payload: { lead_id: input.leadId },
  });
}
```

Add `tryNotifyDouyinLeadCreated`. On assignment, notify the assignee with `createEmployeeNotification`.

- [ ] **Step 3: Integrate after committed DB mutations**

Call notification helpers only after the lead submission or assignment RPC succeeds. Notification failure is best-effort and must not roll back the lead.

- [ ] **Step 4: Run tests and commit**

```bash
bun test apps/api/src/services/douyin-miniapp/marketing.test.ts \
  apps/api/src/services/notifications.test.ts \
  apps/api/src/services/tenant-douyin-miniapp/leads.test.ts
```

Expected: PASS.

```bash
git add apps/api/src/services/douyin-miniapp/marketing* \
  apps/api/src/services/notifications*
git commit -m "feat(api): notify douyin lead activity"
```

## Task 5: Build the Tenant Lead Pool UI

- [ ] **Step 1: Run UI context and component docs**

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs table badge button select input sheet dialog field alert empty skeleton pagination
```

Expected: successful metadata/docs. Use existing local components; do not add or overwrite without reviewing a CLI diff.

- [ ] **Step 2: Write display tests**

Create `lead-display.test.ts`:

```ts
test("maps operational status without color-only meaning", () => {
  expect(leadStatusMeta("unassigned")).toMatchObject({
    label: "待分配",
    variant: "warning",
  });
});

test("hides assign action without permission and foreign sales actions", () => {
  expect(leadActions(leadAssignedTo(OTHER_SALES_ID), salesPermissions())).toEqual([]);
});
```

- [ ] **Step 3: Implement page and flat list workspace**

Use one top-level `Card`:

```tsx
<Card className="flex min-h-0 flex-1 flex-col shadow-none">
  <CardHeader className="border-b">
    <LeadToolbar filters={filters} permissions={permissions} />
  </CardHeader>
  <CardContent className="relative min-h-0 flex-1 overflow-auto p-0">
    <DouyinLeadTable leads={leads} permissions={permissions} />
  </CardContent>
  <CardFooter className="border-t">
    <LeadPagination pagination={pagination} />
  </CardFooter>
</Card>
```

Requirements:

- views: 待分配、跟进中、已转客户、已关闭;
- assignee and keyword filters;
- assignee selectors use the existing tenant employee search API with `page=1&pageSize=20`, remote keyword search, and a hard maximum `pageSize=100`; never preload an unbounded employee list;
- paginated URL state;
- sticky table header;
- horizontal overflow for narrow width;
- row opens a detail `Sheet` with a required title;
- assign/follow-up/close/convert actions use dialogs with Field composition;
- preserve table during refresh with a contextual overlay;
- render explicit loading, empty, error, no-permission, and long-text states.

- [ ] **Step 4: Add navigation and notification deep link handling**

Add “抖音线索” below “小程序工作台” with `douyin_lead.read`. Read `leadId` from the URL and open the detail sheet after the list loads.

Do not add a second global notification system; reuse `notification-menu.tsx`.

- [ ] **Step 5: Run tests, checks, and browser smoke**

```bash
bun test apps/admin/components/douyin-miniapp/leads
pnpm --dir apps/admin check
```

Verify desktop, narrow viewport, 100-character demand, masked phone, no permission, own-assignee scope, empty list, and concurrent assignment error.

Also verify the assignee selector requests the first 20 matching employees, pages or searches remotely, and does not issue an unbounded employee query.

- [ ] **Step 6: Commit**

```bash
git add 'apps/admin/app/(console)/douyin-miniapp/leads' \
  apps/admin/components/douyin-miniapp/leads \
  apps/admin/components/layout/menu-config.ts \
  apps/admin/components/layout/notification-menu.tsx
git commit -m "feat(admin): add douyin lead pool"
```

## Task 6: Phase 3 Verification Gate

- [ ] **Step 1: Run focused and package checks**

```bash
bun test apps/api/src/services/tenant-douyin-miniapp \
  apps/api/src/repositories/tenant-douyin-miniapp-leads.test.ts \
  apps/api/src/controllers/tenant-douyin-miniapp \
  apps/api/src/services/douyin-miniapp/marketing.test.ts
bun run api:check
pnpm --dir apps/admin check
bun run check:permission-boundaries
```

Expected: all exit `0`.

- [ ] **Step 2: Migration authorization gate**

Present the exact pending migration, preflight query, indexes, and rollback. Apply only to the explicitly authorized development database. Then:

```bash
supabase migration list
```

Expected: Local/Remote aligned through `20260726120000`.

- [ ] **Step 3: API and UI smoke**

Verify:

1. miniapp consultation creates one `marketing_leads` row and one submission fact;
2. duplicate submission does not duplicate lead or notification;
3. admin can assign;
4. sales sees only assigned leads;
5. follow-up appends activity;
6. conversion creates or reuses one customer and one customer source;
7. repeated conversion is idempotent;
8. wrong tenant and wrong assignee receive `403` or `404`;
9. all lists paginate.

- [ ] **Step 4: Query performance**

Run `EXPLAIN ANALYZE` for the default tenant/status/created list and assignee list on representative development data. Record plans and confirm the intended indexes are used.

- [ ] **Step 5: Record evidence**

Create and commit `docs/operations/evidence/2026-07-26-tenant-douyin-miniapp-phase3.md`.

Phase 3 exit gate: existing Douyin submissions operate as a dedicated, tenant-safe lead pool with reliable assignment, history, notification, and single customer conversion.
