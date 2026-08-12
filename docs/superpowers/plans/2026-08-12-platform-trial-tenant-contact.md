# Platform Trial Tenant Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each decoration company's masked master contact in the platform trial list and detail while preserving the separate, immutable trial-application contact facts.

**Architecture:** Keep `tenant_service_trials.contact_*` as application-only facts and add masked `tenants.contact_*` facts to the existing platform trial read model. A forward migration replaces the existing paginated list RPC so it masks tenant contacts at the SQL response boundary and backfills only the six exact develop fixture tenants. The direct detail query selects tenant master contacts, the service masks them before HTTP serialization, and the Admin UI labels master and application contacts separately.

**Tech Stack:** PostgreSQL/Supabase migrations and RPC, Bun + TypeScript + Zod, Next.js/React, TanStack Table, shadcn/ui, Bun tests.

---

### Task 1: Lock the read-model and privacy contract with failing tests

**Files:**
- Modify: `apps/api/src/repositories/service-trials-effective-list.test.ts`
- Modify: `apps/api/src/repositories/service-trials.test.ts`
- Modify: `apps/api/src/services/platform-service-trials.test.ts`
- Create: `apps/api/src/services/platform-service-trial-tenant-contact-migration-contract.test.ts`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trials-page.test.ts`

- [ ] **Step 1: Add repository list RED cases**

Extend the platform list fixture tenant to include masked fields and assert strict parsing:

```ts
tenant: {
  id: TENANT_ID,
  name: "示例企业",
  slug: "example",
  contact_name: "张*",
  contact_phone: "138****8000",
}
```

Add malformed cases proving raw phone/name or surplus tenant facts produce `DB_ERROR`.

- [ ] **Step 2: Add detail and serialization RED cases**

Make the direct detail fixture return raw master facts:

```ts
tenant: {
  id: TENANT_ID,
  name: "示例企业",
  slug: "example",
  contact_name: "张经理",
  contact_phone: "13800138000",
}
```

Assert the repository selects the two fields and the service response emits `张**` and `138****8000`, never the raw values.

- [ ] **Step 3: Add forward-migration RED contract**

Require a new migration after `20260811103000` that:

```sql
CREATE OR REPLACE FUNCTION public.platform_service_trial_list(...)
```

builds tenant JSON with masked `contact_name`/`contact_phone`, includes master contacts in literal keyword matching, reasserts service-role-only ACL, uses an exact six-UUID develop-only fixture update, and never updates `tenant_service_trials.contact_name/contact_phone`.

- [ ] **Step 4: Add Admin RED cases**

Assert the first column renders a helper that combines both masked master facts and falls back to `未留联系方式`. Assert detail labels contain `装企联系人`, `装企联系电话`, `申请联系人`, and `申请联系电话`.

- [ ] **Step 5: Run RED tests**

Run:

```bash
cd apps/api
bun test \
  src/repositories/service-trials-effective-list.test.ts \
  src/repositories/service-trials.test.ts \
  src/services/platform-service-trials.test.ts \
  src/services/platform-service-trial-tenant-contact-migration-contract.test.ts

cd ../admin
bun test components/platform-service-trials/platform-service-trials-page.test.ts
```

Expected: failures identify missing tenant contact fields, missing masking/bindings, missing migration, and missing UI labels/helper.

### Task 2: Add strict API tenant-contact facts and serialization

**Files:**
- Modify: `apps/api/src/repositories/service-trial-records.ts`
- Modify: `apps/api/src/repositories/service-trials.ts`
- Modify: `apps/api/src/services/service-trial-views.ts`

- [ ] **Step 1: Split raw and masked tenant schemas**

Define strict tenant identity, raw-contact, and masked-contact schemas. Use the masked schema for `TrialListRawSchema` and the raw schema for `TrialDetailSchema`. Keep tenant list rows without platform relations unchanged.

- [ ] **Step 2: Select master contacts only in the detail relation**

Change the bounded detail relation to:

```ts
const TENANT_RELATION =
  "tenant:tenants!tenant_service_trials_tenant_id_fkey(id,name,slug,contact_name,contact_phone)";
```

Do not add a second query or infer contacts from employees/onboarding rows.

- [ ] **Step 3: Make contact masking idempotent**

Add an idempotent contact-name masker parallel to `maskServiceTrialPhone`, then serialize tenant master contacts through both maskers. Already-masked platform-list facts must remain unchanged; raw detail facts must be masked once.

- [ ] **Step 4: Run focused API tests**

Run the Task 1 API command. Expected: all tests pass, including strict malformed-fact rejection and raw-to-masked detail serialization.

### Task 3: Add the forward migration and exact fixture backfill

**Files:**
- Create: `supabase/migrations/<generated>_expose_platform_trial_tenant_contacts.sql`

- [ ] **Step 1: Generate the migration with Supabase CLI**

Run:

```bash
supabase migration new expose_platform_trial_tenant_contacts
```

Do not edit the already-applied `20260811103000` migration.

- [ ] **Step 2: Replace the list RPC without changing its signature**

Copy the current fixed-shape, paginated function and only extend its tenant JSON and keyword predicate. Mask names as first character plus asterisks and phones as first three plus four asterisks plus last four. Preserve `LIMIT/OFFSET`, exact count, stable ordering, fixed SQL, `SECURITY DEFINER`, `search_path`, and service-role-only ACL.

- [ ] **Step 3: Backfill only the six develop fixtures**

Guard on active global `WECHAT_MINIPROGRAM_ENV_VERSION=develop`; then update the six exact UUIDs with `contact_name='Task9 Dev Fixture'` and phones `19900009101` through `19900009106`. Require all six rows to exist or none; fail closed on partial fixture history. Non-develop environments are a no-op.

- [ ] **Step 4: Run migration contracts and local reset**

Run:

```bash
cd apps/api
bun test src/services/platform-service-trial-list-migration-contract.test.ts \
  src/services/platform-service-trial-dev-fixture-migration-contract.test.ts \
  src/services/platform-service-trial-tenant-contact-migration-contract.test.ts

cd ../..
supabase db reset --local
supabase migration list --local
```

Expected: contracts pass, all migrations replay, and Local includes the new migration. No remote migration or manual DML is performed.

### Task 4: Render master and application contacts distinctly in Admin

**Files:**
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-types.ts`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-rules.ts`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-table.tsx`
- Modify: `apps/admin/components/platform-service-trials/platform-service-trial-detail.tsx`

- [ ] **Step 1: Extend the tenant response type**

Add required nullable masked fields:

```ts
contact_name: string | null;
contact_phone: string | null;
```

- [ ] **Step 2: Add the compact contact-line helper**

Return `联系人 · 手机号` when both exist, the sole value when one exists, and `未留联系方式` when neither exists.

- [ ] **Step 3: Update the first column**

Keep enterprise name as the primary line. Render the compact master-contact line underneath, increase the minimum width only as needed, and never fall back to the tenant slug as if it were contact information.

- [ ] **Step 4: Clarify detail labels**

Show `装企联系人`/`装企联系电话` under enterprise facts and move the trial-row fields to `申请联系人`/`申请联系电话` under application facts. Platform grants therefore show a valid master contact while correctly showing no application contact.

- [ ] **Step 5: Run Admin tests and checks**

Run:

```bash
cd apps/admin
bun test components/platform-service-trials/platform-service-trials-page.test.ts
pnpm check
pnpm build
```

Expected: tests, typecheck, file-size gate, and production build pass.

### Task 5: Complete verification and handoff

**Files:**
- Verify all modified files

- [ ] **Step 1: Run API gates**

```bash
cd apps/api
bun run typecheck
bun run build
bun run check-file-size
```

- [ ] **Step 2: Run the complete focused regression**

Run all trial repository, platform trial service, migration contract, and Admin trial-page tests touched by this plan.

- [ ] **Step 3: Inspect the final diff**

```bash
git diff --check
git status --short
```

Confirm there is no Orange change, no raw phone in HTTP fixtures, no trial-row contact backfill, no broad `LIKE 'dev-trial-%'` update, and no unrelated refactor.

- [ ] **Step 4: Commit the isolated change**

```bash
git add <exact modified paths>
git commit -m "fix(trial): 展示装企主联系方式"
```

Do not push, merge, deploy, or apply the migration remotely without an explicit integration choice.
