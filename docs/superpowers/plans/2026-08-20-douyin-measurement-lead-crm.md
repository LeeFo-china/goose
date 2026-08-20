# Douyin Measurement Appointment and Lead CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a verified Douyin量房申请 into a tenant-owned appointment and actionable lead, automatically link an existing customer, and require staff confirmation before creating a new customer.

**Architecture:** Preserve `marketing_leads` as the acquisition record, add an appointment table and append-only follow-up table, and use service-role RPC commands for atomic submit, assignment, conversion and invalidation. Expose paginated tenant APIs protected by existing Douyin lead permissions, add a dedicated admin workbench, and extend the mini-program form/success page with preferred visit time and estimate linkage.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase/PostgreSQL RPC, Next.js 15, React 19, existing SMS and notification services, Douyin TTML/TTSS.

**Execution order:** Run after the budget plan. Budget linkage remains nullable so a direct free-measurement submission still works when no estimate was created.

---

## File structure

Create:

- `packages/domain/src/douyin-lead.ts` — appointment and lead status/action contracts.
- `packages/domain/src/douyin-lead.test.ts` — shared status tests.
- `supabase/migrations/20260820120000_create_douyin_measurement_appointments.sql` — appointments, follow-ups and atomic commands.
- `apps/api/src/schema/tenant-douyin-leads.ts` — list, assign, follow-up, convert and invalid schemas.
- `apps/api/src/repositories/tenant-douyin-leads.ts` — paginated tenant reads and command calls.
- `apps/api/src/repositories/tenant-douyin-leads.test.ts` — pagination, batch hydration and command tests.
- `apps/api/src/services/tenant-douyin-leads.ts` — permission and workflow orchestration.
- `apps/api/src/services/tenant-douyin-leads.test.ts` — existing-customer/new-customer paths.
- `apps/api/src/controllers/tenant-douyin-leads/index.ts` — tenant lead routes.
- `apps/api/src/controllers/tenant-douyin-leads/index.test.ts` — request/delegation tests.
- `apps/admin/app/(console)/douyin-miniapp/leads/page.tsx` — tenant lead workbench page.
- `apps/admin/components/douyin-miniapp/leads-workbench.tsx` — paginated lead list/detail/actions.
- `apps/admin/components/douyin-miniapp/leads-workbench.test.ts` — UI/state contract tests.

Modify:

- `packages/domain/src/shared.ts` — export lead contracts.
- `packages/domain/src/douyin-miniapp.ts` — add bounded contact-SLA copy to runtime config.
- `packages/domain/src/douyin-miniapp.test.ts` — runtime config compatibility and length tests.
- `apps/api/src/types/database.ts` — regenerate after migration.
- `apps/api/src/schema/douyin-miniapp.ts` — appointment fields and response schema.
- `apps/api/src/services/douyin-miniapp/marketing.ts` — digest and appointment orchestration.
- `apps/api/src/services/douyin-miniapp/marketing.test.ts` — new input, linking and notification behavior.
- `apps/api/src/repositories/douyin-miniapp-marketing.ts` — call the new atomic appointment RPC.
- `apps/api/src/repositories/douyin-miniapp-marketing.test.ts` — strict result and database error mapping.
- `apps/api/src/controllers/douyin-miniapp/index.test.ts` — expanded request contract.
- `apps/api/src/routes/index.ts` — register tenant lead controller.
- `apps/api/src/repositories/customer-sources.ts` — expose Douyin source timeline reads if not already covered.
- `apps/api/src/controllers/customer/shared.ts` — include appointment/estimate source summary in customer detail.
- `apps/api/src/controllers/customer/shared.test.ts` — customer detail display contract.
- `apps/douyin-mini/src/models/index.ts` — appointment result and entry fields.
- `apps/douyin-mini/src/api/leads.ts` — expanded request/result parsing.
- `apps/douyin-mini/src/api/leads.test.ts` — strict appointment response tests.
- `apps/douyin-mini/src/pages/lead/form-model.ts` — visit date/period and estimate mapping.
- `apps/douyin-mini/src/pages/lead/form-model.test.ts` — validation and preserved-input tests.
- `apps/douyin-mini/src/pages/lead/index.ts`
- `apps/douyin-mini/src/pages/lead/index.ttml`
- `apps/douyin-mini/src/pages/lead/index.ttss`
- `apps/douyin-mini/src/pages/lead-success/index.ts`
- `apps/douyin-mini/src/pages/lead-success/index.ttml`
- `apps/douyin-mini/src/pages/lead-success/index.ttss`
- `apps/douyin-mini/src/components/lead-form/index.ts`
- `apps/douyin-mini/src/components/lead-form/index.ttml`
- `apps/douyin-mini/src/components/lead-form/index.ttss`
- `apps/admin/components/layout/menu-config.ts` — add “抖音线索”.

### Task 1: Define appointment and lead workflow contracts

**Files:**
- Create: `packages/domain/src/douyin-lead.ts`
- Create: `packages/domain/src/douyin-lead.test.ts`
- Modify: `packages/domain/src/shared.ts`
- Modify: `packages/domain/src/douyin-miniapp.ts`
- Modify: `packages/domain/src/douyin-miniapp.test.ts`

- [ ] **Step 1: Write the failing shared contract test**

```ts
import { describe, expect, test } from "bun:test";
import {
  DOUYIN_APPOINTMENT_STATUS_VALUES,
  DOUYIN_VISIT_PERIOD_VALUES,
  canTransitionDouyinAppointment,
} from "./douyin-lead";

describe("douyin lead contracts", () => {
  test("defines visit periods and guarded appointment transitions", () => {
    expect(DOUYIN_VISIT_PERIOD_VALUES).toEqual(["morning", "afternoon", "evening"]);
    expect(DOUYIN_APPOINTMENT_STATUS_VALUES).toEqual([
      "pending_confirmation", "confirmed", "completed", "canceled", "invalid",
    ]);
    expect(canTransitionDouyinAppointment("pending_confirmation", "confirmed")).toBe(true);
    expect(canTransitionDouyinAppointment("completed", "confirmed")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test packages/domain/src/douyin-lead.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the contract**

Add visit periods, appointment statuses, lead action result types and an explicit transition map. Re-export from `shared.ts`. Extend the existing Douyin runtime config with optional `contact_sla_text`, trimmed to 1–80 characters; absent configuration must fall back to “工作人员将在营业时间内与你联系” rather than inventing a duration.

- [ ] **Step 4: Run tests**

Run: `bun test packages/domain/src/douyin-lead.test.ts packages/domain/src/douyin-miniapp.test.ts packages/domain/src/shared.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/douyin-lead.ts packages/domain/src/douyin-lead.test.ts packages/domain/src/douyin-miniapp.ts packages/domain/src/douyin-miniapp.test.ts packages/domain/src/shared.ts
git commit -m "feat(domain): add douyin appointment workflow"
```

### Task 2: Add appointment, follow-up and atomic command migration

**Files:**
- Create: `supabase/migrations/20260820120000_create_douyin_measurement_appointments.sql`
- Create: `apps/api/src/services/douyin-miniapp/appointment-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../../supabase/migrations/20260820120000_create_douyin_measurement_appointments.sql",
  import.meta.url,
);

describe("douyin appointment migration", () => {
  test("creates private appointment facts and controlled commands", async () => {
    const sql = await Bun.file(migration).text();
    expect(sql).toContain("CREATE TABLE public.douyin_measurement_appointments");
    expect(sql).toContain("CREATE TABLE public.douyin_lead_follow_ups");
    expect(sql).toContain("FUNCTION public.submit_douyin_measurement_appointment");
    expect(sql).toContain("FUNCTION public.convert_douyin_lead_to_customer");
    expect(sql).toContain("FUNCTION public.mark_douyin_lead_invalid");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-miniapp/appointment-migration-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create tables and indexes**

Create `douyin_measurement_appointments` exactly as the design specifies, plus `preferred_visit_date date`, `preferred_visit_period`, `confirmed_visit_at`, `assigned_employee_id`, `create_idempotency_key`, `create_request_hash`, and integer `version`. Make `marketing_lead_id` required and customer/estimate optional.

Create append-only `douyin_lead_follow_ups` with tenant, lead, appointment, employee, `follow_up_type`, summary, result, `next_follow_up_at`, idempotency key and timestamp. Add list indexes for tenant/status/date, lead/date, assignee/status and customer/date.

Extend `customer_sources` with nullable `marketing_lead_id` and `douyin_measurement_appointment_id` foreign keys plus a partial unique index on `(customer_id, douyin_measurement_appointment_id)`. This makes an existing customer's new Douyin appointment visible in the source timeline without duplicating the customer or source fact.

- [ ] **Step 4: Implement `submit_douyin_measurement_appointment`**

The service-role RPC must:

1. validate installation/tenant/SMS/consent/estimate ownership;
2. reserve the idempotency key and reject same-key/different-body requests;
3. create or update the recent Douyin marketing lead;
4. create exactly one appointment for the idempotency key;
5. query `customers` by `(tenant_id, phone)` under the existing unique-index boundary;
6. link an existing customer without changing customer fields;
7. append one idempotent `customer_sources` row for that existing customer and appointment;
8. never insert a new customer;
9. consume the SMS code;
10. return lead ID, appointment number, status, duplicate flags and `existing_customer_linked`.

- [ ] **Step 5: Implement tenant workflow commands**

Add service-role-only RPCs for assignment, follow-up append, conversion and invalidation. Conversion must lock the lead, re-check `(tenant_id, phone)`, create a `potential`/`douyin` customer only when absent, set `marketing_leads.customer_id` and `lead_status = converted`, update appointments, and append one `customer_sources` row carrying lead/appointment/estimate attribution. Repeated conversion returns the same customer.

Invalidation must reject converted leads and atomically set lead `invalid` plus pending appointments `invalid`.

- [ ] **Step 6: Add RLS, revokes and immutable guards**

Enable RLS; revoke table/function access from public, anon and authenticated; grant command execution to service role only. Add a trigger preventing direct mutation of identity, tenant, lead, customer, estimate and original request fields.

- [ ] **Step 7: Test, dry-run, apply and regenerate**

Run: `bun test apps/api/src/services/douyin-miniapp/appointment-migration-contract.test.ts`

Expected: PASS.

Run: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: only reviewed pending migrations are listed.

Run after review: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: success.

Run: `supabase migration list`

Expected: Local/Remote `20260820120000` align.

Run: `bun run gen && bun run api:typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260820120000_create_douyin_measurement_appointments.sql apps/api/src/services/douyin-miniapp/appointment-migration-contract.test.ts apps/api/src/types/database.ts
git commit -m "feat(douyin): add measurement appointment workflow"
```

### Task 3: Route mini-program submissions through the appointment command

**Files:**
- Modify: `apps/api/src/schema/douyin-miniapp.ts`
- Modify: `apps/api/src/services/douyin-miniapp/marketing.ts`
- Modify: `apps/api/src/services/douyin-miniapp/marketing.test.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-marketing.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-marketing.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: Write failing schema and service tests**

Use a request containing:

```ts
{
  name: "李先生",
  phone: "13800138000",
  sms_code: "123456",
  community: "晴天花园",
  preferred_visit_date: "2026-08-25",
  preferred_visit_period: "afternoon",
  budget_estimate_id: "22222222-2222-4222-8222-222222222222",
  demand: "希望确认柜体和水电范围",
  privacy_policy_version: "v1",
  consented_at: "2026-08-20T10:00:00+08:00",
  idempotency_key: "11111111-1111-4111-8111-111111111111",
  attribution: {
    entry_path: "pages/lead/index",
    scene: "1001",
    source_type: "direct",
  },
}
```

Assert the digest includes preferred time and estimate number, the repository receives resolved tenant/installation/subject, and notification failure does not invalidate a committed appointment.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-miniapp/marketing.test.ts apps/api/src/repositories/douyin-miniapp-marketing.test.ts`

Expected: FAIL because appointment fields and RPC result are absent.

- [ ] **Step 3: Extend strict schemas and repository result parser**

Require community, preferred date and visit period for a measurement appointment. Allow an optional estimate UUID and verify that it resolves to the same tenant, installation and mini-program subject. Parse a strict result with `appointment_no`, `status = pending_confirmation`, duplicate flags and `existing_customer_linked`.

- [ ] **Step 4: Call the new RPC and notify the tenant**

Replace the repository command call with `submit_douyin_measurement_appointment`. After commit, create a tenant notification referencing the marketing lead and appointment number. Catch notification failure, log only non-sensitive IDs, and return the successful appointment.

- [ ] **Step 5: Run focused and API checks**

Run: `bun test apps/api/src/services/douyin-miniapp/marketing.test.ts apps/api/src/repositories/douyin-miniapp-marketing.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/douyin-miniapp.ts apps/api/src/services/douyin-miniapp/marketing.ts apps/api/src/services/douyin-miniapp/marketing.test.ts apps/api/src/repositories/douyin-miniapp-marketing.ts apps/api/src/repositories/douyin-miniapp-marketing.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts
git commit -m "feat(douyin): submit measurement appointments"
```

### Task 4: Add paginated tenant lead APIs

**Files:**
- Create: `apps/api/src/schema/tenant-douyin-leads.ts`
- Create: `apps/api/src/repositories/tenant-douyin-leads.ts`
- Create: `apps/api/src/repositories/tenant-douyin-leads.test.ts`
- Create: `apps/api/src/services/tenant-douyin-leads.ts`
- Create: `apps/api/src/services/tenant-douyin-leads.test.ts`
- Create: `apps/api/src/controllers/tenant-douyin-leads/index.ts`
- Create: `apps/api/src/controllers/tenant-douyin-leads/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing list and workflow tests**

Test default pagination, `pageSize <= 100`, status/assignee/date/keyword filters, tenant scope from auth context, batch customer/employee/appointment hydration and the exact permission for every action.

Permission expectations:

```ts
expect(permissionFor("list")).toBe("douyin_lead.read");
expect(permissionFor("assign")).toBe("douyin_lead.assign");
expect(permissionFor("follow_up")).toBe("douyin_lead.follow_up");
expect(permissionFor("convert")).toBe("douyin_lead.convert");
```

Conversion also requires `customer.create` only when the command reports that no customer currently exists; perform a preflight customer lookup before invoking the command so authorization is decided before mutation.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/repositories/tenant-douyin-leads.test.ts apps/api/src/services/tenant-douyin-leads.test.ts`

Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement repository and service**

Use `.range()` with exact count for lists. Select only lead summary fields and batch-load appointments, customers and employees. Detail may fetch bounded follow-ups with `page=1&pageSize=20`; additional pages use a dedicated paginated route.

- [ ] **Step 4: Implement routes**

```text
GET  /tenant/douyin-miniapp/leads
GET  /tenant/douyin-miniapp/leads/:id
GET  /tenant/douyin-miniapp/leads/:id/follow-ups
POST /tenant/douyin-miniapp/leads/:id/assign
POST /tenant/douyin-miniapp/leads/:id/follow-ups
POST /tenant/douyin-miniapp/leads/:id/convert-customer
POST /tenant/douyin-miniapp/leads/:id/mark-invalid
```

Every body is strict. Assign/follow-up/convert/invalid require idempotency keys; state-changing commands include the expected lead or appointment version.

- [ ] **Step 5: Run controller and API checks**

Run: `bun test apps/api/src/repositories/tenant-douyin-leads.test.ts apps/api/src/services/tenant-douyin-leads.test.ts apps/api/src/controllers/tenant-douyin-leads/index.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-douyin-leads.ts apps/api/src/repositories/tenant-douyin-leads.ts apps/api/src/repositories/tenant-douyin-leads.test.ts apps/api/src/services/tenant-douyin-leads.ts apps/api/src/services/tenant-douyin-leads.test.ts apps/api/src/controllers/tenant-douyin-leads apps/api/src/routes/index.ts
git commit -m "feat(douyin): add tenant lead workflow api"
```

### Task 5: Show Douyin source and appointment in customer detail

**Files:**
- Modify: `apps/api/src/repositories/customer-sources.ts`
- Modify: `apps/api/src/controllers/customer/shared.ts`
- Modify: `apps/api/src/controllers/customer/shared.test.ts`
- Modify: `apps/admin/components/customers/customer-detail-dialog.tsx`
- Modify: `apps/admin/components/customers/customer-detail-display.test.ts`

- [ ] **Step 1: Write failing customer-detail tests**

```ts
expect(detail.sources).toEqual(expect.arrayContaining([
  expect.objectContaining({
    source: "douyin",
    source_label: "抖音小程序",
    metadata: expect.objectContaining({ appointment_no: "DYLF-20260820-000001" }),
  }),
]));
```

Assert that full phone remains permission-gated and budget/AI data is displayed as a snapshot, not recalculated.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/controllers/customer/shared.test.ts apps/admin/components/customers/customer-detail-display.test.ts`

Expected: FAIL because the appointment source summary is not serialized/displayed.

- [ ] **Step 3: Add bounded source hydration and display**

Return the latest 20 customer sources, and for Douyin sources expose appointment number/status, estimate number/range and AI summary fields from stored metadata. Do not include AI raw response, request IP, user agent, subject hash or installation secret.

- [ ] **Step 4: Run API and admin checks**

Run: `bun test apps/api/src/controllers/customer/shared.test.ts apps/admin/components/customers/customer-detail-display.test.ts`

Expected: PASS.

Run: `bun run api:check && bun run admin:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/repositories/customer-sources.ts apps/api/src/controllers/customer/shared.ts apps/api/src/controllers/customer/shared.test.ts apps/admin/components/customers/customer-detail-dialog.tsx apps/admin/components/customers/customer-detail-display.test.ts
git commit -m "feat(customer): show douyin appointment source"
```

### Task 6: Build the tenant Douyin lead workbench

**Files:**
- Create: `apps/admin/app/(console)/douyin-miniapp/leads/page.tsx`
- Create: `apps/admin/components/douyin-miniapp/leads-workbench.tsx`
- Create: `apps/admin/components/douyin-miniapp/leads-workbench.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing UI contract tests**

Test that list rows show name, masked phone, community, appointment time, budget range, status, assignee and customer-link state; actions are hidden without their permissions; converting an existing customer does not request create permission; pagination defaults to 20.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/admin/components/douyin-miniapp/leads-workbench.test.ts`

Expected: FAIL because the page and component do not exist.

- [ ] **Step 3: Implement list/detail/actions**

Use existing admin table, sheet/dialog, badge, select, textarea and pagination components. Keep filters in URL search params. Detail shows source attribution, appointment, deterministic budget, AI advice and follow-up history. Assignment, follow-up, conversion and invalidation use confirmation states and disable double submit.

- [ ] **Step 4: Add navigation**

Add `/douyin-miniapp/leads` with label “抖音线索” and permission `douyin_lead.read` under the tenant business group, adjacent to the Douyin workspace.

- [ ] **Step 5: Run admin checks**

Run: `bun test apps/admin/components/douyin-miniapp/leads-workbench.test.ts`

Expected: PASS.

Run: `bun run admin:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/'(console)'/douyin-miniapp/leads apps/admin/components/douyin-miniapp/leads-workbench.tsx apps/admin/components/douyin-miniapp/leads-workbench.test.ts apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage douyin leads"
```

### Task 7: Extend the mini-program appointment form and success page

**Files:**
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/api/leads.ts`
- Modify: `apps/douyin-mini/src/api/leads.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/lead/form-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/index.ts`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttml`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttss`
- Modify: `apps/douyin-mini/src/pages/lead-success/index.ts`
- Modify: `apps/douyin-mini/src/pages/lead-success/index.ttml`
- Modify: `apps/douyin-mini/src/pages/lead-success/index.ttss`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttml`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttss`

- [ ] **Step 1: Write failing form/API tests**

Test required community/date/period, future date validation, estimate number loading from transient storage, form preservation after SMS/submission failure, strict response parsing and idempotency key reuse after retry.

```ts
expect(validateLeadForm({
  ...validForm,
  preferred_visit_date: "2026-08-25",
  preferred_visit_period: "afternoon",
})).toEqual({});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/douyin-mini/src/pages/lead/form-model.test.ts apps/douyin-mini/src/api/leads.test.ts`

Expected: FAIL because appointment fields/result are not supported.

- [ ] **Step 3: Implement form behavior**

Add a date picker with a minimum of the tenant-local current date and visit-period controls. Prefill area, budget and demand from the stored estimate reference but allow edits to non-snapshot form fields. Do not prefill or persist name/phone beyond existing session behavior.

- [ ] **Step 4: Implement accurate success semantics**

Show appointment number, company name, preferred date/period and configurable contact-SLA copy. Use “申请已提交，工作人员将与你确认具体时间”; do not use “时间已确认”. Provide “查看预算结果” when an estimate is linked and “返回首页”.

- [ ] **Step 5: Run mini-program checks**

Run: `bun run douyin-mini:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/api/leads.ts apps/douyin-mini/src/api/leads.test.ts apps/douyin-mini/src/pages/lead apps/douyin-mini/src/pages/lead-success apps/douyin-mini/src/components/lead-form
git commit -m "feat(douyin-mini): complete measurement appointment flow"
```

### Task 8: Verify lead-to-customer behavior end to end

**Files:**
- Modify only files already listed in this plan when a reproduced failure identifies a root cause.

- [ ] **Step 1: Run full static checks**

Run: `bun run api:check && bun run admin:check && bun run douyin-mini:check`

Expected: PASS.

- [ ] **Step 2: Run migration alignment check**

Run: `supabase migration list`

Expected: Local/Remote `20260820120000` align.

- [ ] **Step 3: Smoke a new-phone path**

Submit with a verified phone that has no customer in the target tenant. Confirm one lead and one appointment exist, no customer exists, the admin notification is visible, follow-up can be appended, conversion creates one potential customer, source metadata is present, and repeated conversion returns the same customer.

- [ ] **Step 4: Smoke an existing-phone path**

Submit with a verified phone already belonging to the target tenant. Confirm the appointment links to the existing customer immediately without changing owner/status/name, no duplicate customer is created, and the customer detail shows the new Douyin source.

- [ ] **Step 5: Smoke invalidation and duplicate submission**

Confirm same idempotency key returns the original appointment, same key/different body returns conflict, a new key can create a second legitimate appointment, invalidation does not create a customer, and converted leads cannot be invalidated.

- [ ] **Step 6: Commit verified corrections if necessary**

Stage only files changed to fix a reproduced verification failure and use:

```bash
git commit -m "fix(douyin): harden lead conversion workflow"
```
