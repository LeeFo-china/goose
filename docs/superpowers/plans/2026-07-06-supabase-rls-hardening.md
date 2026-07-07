# Supabase RLS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Supabase `rls_disabled` advisories and close direct anon/authenticated table/RPC access while preserving the current Fastify API service-role permission model.

**Architecture:** Keep API authorization as the source of truth: Fastify builds `AuthContext`, controllers/services enforce tenant and permission checks, and repositories use `SupabaseDB.getAdminClient()`. Current tenant isolation remains in API/service/repository filters such as `tenant_id`, project ownership, employee scope, and explicit permission checks. RLS and privilege revokes are added as a deny-by-default guard against direct anon/authenticated table and RPC access; this phase does not add permissive tenant table policies and does not use `FORCE ROW LEVEL SECURITY`.

**Tech Stack:** Supabase/Postgres migrations, Bun + TypeScript Fastify API, Supabase JS for direct-access smoke checks.

---

## File Structure

- Create: `docs/security/2026-07-06-supabase-rls-inventory.md` records remote inventory, tenant boundary columns, public grants, public RPCs, post-change evidence, and rollback notes.
- Create: `supabase/migrations/20260706110000_harden_public_direct_access.sql` enables RLS for public base and partitioned tables that still lack RLS, revokes direct table privileges from anon/authenticated, and revokes public function execution from anon/authenticated while keeping service_role execution.
- Create: `apps/api/src/scripts/rls-direct-access-smoke.ts` checks that publish-key direct table/RPC access does not leak rows or execute sensitive RPCs.
- Modify: `docs/permission/README.md` documents the RLS hardening boundary: service-role API remains authoritative; direct Supabase client remains forbidden except explicitly documented public/RLS scenarios.

## Task 1: Capture Remote RLS Inventory

**Files:**
- Create: `docs/security/2026-07-06-supabase-rls-inventory.md`

- [ ] **Step 1: Create the audit document**

````markdown
# Supabase RLS Inventory - 2026-07-06

## Scope

This audit covers `public` schema base tables, partitioned tables, and functions. The backend API currently uses service role through `SupabaseDB.getAdminClient()` after Fastify auth, tenant, and permission checks. RLS and privilege revokes are being added as a deny-by-default guard for direct Supabase table/RPC access.

## Preflight Migration Status

```text
Paste `supabase migration list` output here.
```

## RLS Disabled Tables

```json
Paste the JSON output of the RLS disabled table query here.
```

## anon/authenticated Table Grants

```json
Paste the JSON output of the table grant query here.
```

## Tenant Boundary Matrix

```json
Paste the JSON output of the tenant boundary column query here.
```

## anon/authenticated RPC Grants

```json
Paste the JSON output of the RPC grant query here.
```

## Post-Migration Evidence

```text
Paste post-migration verification output here.
```

## Rollback Notes

The rollback is to disable RLS only on tables listed in the preflight RLS Disabled Tables section if a verified direct-table client regression is found. API service-role regressions should be investigated first because service role should bypass ordinary RLS unless `FORCE ROW LEVEL SECURITY` was added.
````

- [ ] **Step 2: Record migration alignment before any DB change**

Run:

```bash
supabase migration list
```

Expected: Local and Remote rows are aligned before adding the new migration.

- [ ] **Step 3: Query tables missing RLS**

Run:

```bash
supabase db query --linked -o json "
select
  schemaname,
  tablename,
  quote_ident(schemaname) || '.' || quote_ident(tablename) as relation_name
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;
"
```

Expected: JSON contains all public tables still missing RLS. Save the full output in `docs/security/2026-07-06-supabase-rls-inventory.md`.

- [ ] **Step 4: Query anon/authenticated table grants**

Run:

```bash
supabase db query --linked -o json "
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ',' order by privilege_type) as privileges
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_schema, table_name, grantee
order by table_name, grantee;
"
```

Expected: JSON shows which direct table privileges exist for publish-key roles. Save the output in the audit document.

- [ ] **Step 5: Query tenant boundary columns**

Run:

```bash
supabase db query --linked -o json "
select
  table_name,
  array_agg(column_name order by column_name) as boundary_columns
from information_schema.columns
where table_schema = 'public'
  and column_name in (
    'tenant_id',
    'tenant_department_id',
    'owner_id',
    'employee_id',
    'project_id',
    'customer_id',
    'partner_id',
    'business_type',
    'business_id'
  )
group by table_name
order by table_name;
"
```

Expected: JSON identifies tenant-owned tables, project/customer/employee-derived scope tables, platform/global dictionaries, and tables that require service-layer joins for tenant scoping. Save the output in the audit document. A table without `tenant_id` is not automatically public; classify it by API access path before adding any table policy.

- [ ] **Step 6: Query public RPC grants and security mode**

Run:

```bash
supabase db query --linked -o json "
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
order by p.proname, arguments;
"
```

Expected: Sensitive tenant, billing, identity, workflow, and mutation RPCs are visible if currently executable by `anon` or `authenticated`; save the output in the audit document. Any remaining direct RPC contract must be explicitly named before proceeding. The repository scan should show no admin/h5 direct Supabase client usage, so the default remediation is to revoke anon/authenticated function execute and keep service_role execute.

- [ ] **Step 7: Commit the audit document**

Run:

```bash
git add docs/security/2026-07-06-supabase-rls-inventory.md
git commit -m "docs: record supabase rls inventory"
```

Expected: A docs-only commit records the preflight facts before any schema change.

## Task 2: Add Deny-by-Default RLS and RPC Execute Migration

**Files:**
- Create: `supabase/migrations/20260706110000_harden_public_direct_access.sql`

- [ ] **Step 1: Create the migration**

```sql
-- Harden public direct access.
--
-- The Fastify API uses service role after AuthContext, tenant, and permission
-- checks. This migration intentionally does not create broad anon or
-- authenticated table policies. Do not add FORCE ROW LEVEL SECURITY in this phase.

do $$
declare
  target record;
begin
  for target in
    select
      format('%I.%I', namespace.nspname, class.relname) as relation_name
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
      and class.relpersistence = 'p'
      and class.relrowsecurity = false
    order by class.relname
  loop
    raise notice 'enable row level security on %', target.relation_name;
    execute format(
      'alter table %s enable row level security',
      target.relation_name
    );
  end loop;
end $$;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public grant execute on functions to service_role;
```

- [ ] **Step 2: Verify migration SQL parses against remote**

Run:

```bash
supabase db query --linked "
begin;
do \$\$
declare
  target record;
begin
  for target in
    select
      format('%I.%I', namespace.nspname, class.relname) as relation_name
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
      and class.relpersistence = 'p'
      and class.relrowsecurity = false
    order by class.relname
  loop
    raise notice 'would enable row level security on %', target.relation_name;
  end loop;
end \$\$;
rollback;
"
```

Expected: The query succeeds and prints notices for the same table set captured in Task 1.

- [ ] **Step 3: Apply migration**

Run:

```bash
supabase db push
```

Expected: `20260706110000_harden_public_direct_access.sql` is applied once.

- [ ] **Step 4: Confirm Security Advisor condition is gone at the SQL level**

Run:

```bash
supabase db query --linked -o json "
select
  schemaname,
  tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;
"
```

Expected: `[]`. If rows remain, inspect whether they are non-business tables before deciding on a follow-up migration.

- [ ] **Step 5: Confirm migration alignment**

Run:

```bash
supabase migration list
```

Expected: Local and Remote both include `20260706110000`.

## Task 3: Add Direct Table Access Smoke

**Files:**
- Create: `apps/api/src/scripts/rls-direct-access-smoke.ts`

- [ ] **Step 1: Add the smoke script**

```typescript
import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const publishKey = requireEnv("SUPABASE_PUBLISH");

const sensitiveTables = [
  "employees",
  "customers",
  "projects",
  "payments",
  "finance_ledger_entries",
  "project_receivable_plans",
  "partner_commission_ledger",
  "platform_partner_members",
] as const;

const client = createClient(supabaseUrl, publishKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

for (const table of sensitiveTables) {
  const { data, error, count } = await client
    .from(table)
    .select("id", { count: "exact" })
    .limit(1);

  if (error) {
    console.log(`${table}: blocked with ${error.code ?? "unknown_code"}`);
    continue;
  }

  const visibleRows = data?.length ?? 0;
  const visibleCount = count ?? 0;
  if (visibleRows > 0 || visibleCount > 0) {
    throw new Error(
      `${table}: publish-key direct access returned ${visibleRows} row(s), count=${visibleCount}`,
    );
  }

  console.log(`${table}: no rows visible to publish-key direct access`);
}
```

- [ ] **Step 2: Run the smoke script**

Run:

```bash
bun --env-file=apps/api/.env apps/api/src/scripts/rls-direct-access-smoke.ts
```

Expected: Each sensitive table prints either `blocked with ...` or `no rows visible to publish-key direct access`. The script exits with code `0`.

- [ ] **Step 3: Run static and build checks**

Run:

```bash
bun run check:permission-boundaries
bun run api:typecheck
bun run api:build
```

Expected: All three commands pass.

## Task 4: Validate API and Direct RPC Lockdown

**Files:**
- Modify: `docs/security/2026-07-06-supabase-rls-inventory.md`

- [ ] **Step 1: Re-check sensitive RPC execution is revoked**

Run:

```bash
supabase db query --linked -o json "
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'assign_platform_lead',
    'billing_manual_recharge',
    'billing_freeze_credits',
    'billing_unfreeze_credits',
    'billing_confirm_wechat_recharge',
    'sync_user_oauth_identity',
    'verify_wechat_identity_binding',
    'create_project_log_fast',
    'save_project_cost_budgets'
  )
order by p.proname, arguments;
"
```

Expected: Each returned row has `anon_execute = false`, `authenticated_execute = false`, and `service_role_execute = true`.

- [ ] **Step 2: Run focused API smoke checks**

Run:

```bash
bun run api:check
```

Expected: Typecheck, build, and API file-size checks pass.

- [ ] **Step 3: Run tenant isolation verification**

Run this against the API environment that points at the migrated database:

```bash
set -a
source /tmp/gooes-phase5h.env
set +a
API_BASE_URL=${API_BASE_URL:-http://127.0.0.1:3000} STRICT_TENANT_VERIFY=1 \
bun run verify:tenant:phase5h
```

If `/tmp/gooes-phase5h.env` does not exist, seed deterministic Phase 5H
fixtures first using the same environment file as the API server:

```bash
bun --env-file=apps/api/.env scripts/seed-phase5h-tenant-verification.ts --format=shell > /tmp/gooes-phase5h.env
```

Expected: All configured checks pass with zero failures and zero skips in strict mode. This verifies that the API/service-layer tenant isolation still blocks cross-tenant reads after RLS is enabled.

- [ ] **Step 4: Run finance and workflow service tests that already exist**

Run:

```bash
bun test apps/api/src/services/finance-ledger.test.ts \
  apps/api/src/services/finance-reconciliation.test.ts \
  apps/api/src/services/project-receivables.test.ts \
  apps/api/src/services/project-cost-budgets.test.ts \
  apps/api/src/scripts/workflow-destructive-cleanup-verify.test.ts
```

Expected: All selected tests pass. These do not prove remote RLS behavior, but they catch service-layer permission regressions in the finance/workflow areas touched by recent work.

- [ ] **Step 5: Save post-migration evidence**

Add these exact entries to `docs/security/2026-07-06-supabase-rls-inventory.md` under `Post-Migration Evidence`:

```text
supabase migration list: Local/Remote aligned through 20260706110000
RLS disabled query: [] for public schema
tenant boundary matrix: captured and reviewed; no broad tenant table policy introduced
rls-direct-access-smoke: passed
check:permission-boundaries: passed
api:check: passed
verify:tenant:phase5h: passed in strict mode
focused bun test command: passed
sensitive RPC metadata check: anon/authenticated execute false; service_role execute true
```

## Task 5: Document the Permission Boundary

**Files:**
- Modify: `docs/permission/README.md`

- [ ] **Step 1: Add the RLS hardening note after the Core Conclusion section**

```markdown
## Supabase RLS 边界

Supabase RLS 用作数据库直连面的防线，不替代 API 层权限模型。业务接口仍必须先经过 Fastify auth、`AuthContext`、租户上下文和权限点校验，再通过 `SupabaseDB.getAdminClient()` 访问数据库。

`public` schema 业务表默认启用 RLS 且不配置宽泛的 anon/authenticated 表级 policy。`public` schema 函数默认撤销 anon/authenticated 的直接 `EXECUTE`，只保留 service_role 给后端 API 使用。公开访问优先通过经过审计的 API 暴露；如未来确实需要 direct Supabase RPC，必须单独记录函数名、入参边界和 abuse 防护。除非对应文档明确说明 public/RLS 场景，业务代码不得新增 `SupabaseDB.getClient()`。

本阶段不启用 `FORCE ROW LEVEL SECURITY`。如果未来小程序或后台直接使用 Supabase 用户会话访问表，需要先设计包含 `tenant_id`、`employee_id` 和权限 claims 的 JWT/RLS 合同，再新增细粒度 policy。
```

- [ ] **Step 2: Run docs and permission checks**

Run:

```bash
bun run check:permission-boundaries
```

Expected: The boundary check passes and still reports no `SupabaseDB.getClient()` business usage.

- [ ] **Step 3: Commit migration, smoke script, and docs**

Run:

```bash
git add supabase/migrations/20260706110000_harden_public_direct_access.sql \
  apps/api/src/scripts/rls-direct-access-smoke.ts \
  docs/security/2026-07-06-supabase-rls-inventory.md \
  docs/permission/README.md
git commit -m "chore: enable rls for public business tables"
```

Expected: Commit contains the migration, direct-access smoke script, inventory evidence, and permission boundary documentation.

## Rollback Plan

- If API service-role endpoints fail, first verify that `FORCE ROW LEVEL SECURITY` was not added. Ordinary RLS should not block service role.
- If a confirmed direct Supabase client use case breaks, do not add broad table policies immediately. Prefer moving that access through the Fastify API or an audited `SECURITY DEFINER` RPC.
- If emergency rollback is required, create a new migration that disables RLS only on the exact table names captured in `docs/security/2026-07-06-supabase-rls-inventory.md` under `RLS Disabled Tables`. The rollback migration must contain one `alter table <captured relation_name> disable row level security;` statement per captured table and must not use a blanket loop.
- After rollback, run `supabase migration list`, the API smoke checks, and the RLS disabled inventory query again. Record the reason and evidence in the security audit document.
