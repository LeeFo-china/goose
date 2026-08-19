# Service Role Shared Table Read Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the trusted API role's employee and supplier-product reads without editing applied migrations or widening untrusted database roles.

**Architecture:** Add a forward-only repair migration after `20260819124000` and a migration contract that proves the table-level grants, post-grant assertions, and future non-regression. Validate the real PostgreSQL role after a local reset, then apply only the repair migration to development before merging.

**Tech Stack:** Bun, TypeScript, Supabase/PostgreSQL migrations, GitHub Actions, GitHub CLI.

---

### Task 1: Add the failing migration contract

**Files:**
- Create: `apps/api/src/services/service-role-shared-table-read-repair-migration-contract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const migrationName =
  "20260819125000_restore_service_role_shared_table_reads.sql";
const migrationUrl = new URL(
  `../../../../supabase/migrations/${migrationName}`,
  import.meta.url,
);
const migrationSql = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8")
  : "";

describe("service role shared table read repair migration", () => {
  test("is a bounded forward-only migration", () => {
    expect(migrationSql).toMatch(/^-- Rollback: forward-only\./);
    expect(migrationSql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    expect(migrationSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(migrationSql).toContain("SET LOCAL statement_timeout = '5min';");
  });

  test("restores and verifies trusted shared-table reads", () => {
    for (const table of ["employees", "supplier_products"]) {
      expect(migrationSql).toContain(
        `GRANT SELECT ON TABLE public.${table} TO service_role;`,
      );
      expect(migrationSql).toContain(
        `has_table_privilege('service_role', 'public.${table}', 'SELECT')`,
      );
    }
  });

  test("does not widen untrusted roles or direct writes", () => {
    expect(migrationSql).not.toMatch(/\bTO (?:PUBLIC|anon|authenticated)\b/);
    expect(migrationSql).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*ON TABLE/i,
    );
  });

  test("prevents later migrations from revoking the repaired reads", () => {
    const migrationsDirectory = new URL(
      "../../../../supabase/migrations/",
      import.meta.url,
    );
    const laterSql = readdirSync(migrationsDirectory)
      .filter((name) => name > migrationName && name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(new URL(name, migrationsDirectory), "utf8"))
      .join("\n");

    expect(laterSql).not.toMatch(
      /REVOKE SELECT ON TABLE public\.(?:employees|supplier_products)/i,
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd apps/api
bun test src/services/service-role-shared-table-read-repair-migration-contract.test.ts
```

Expected: FAIL because the repair migration is absent and `migrationSql` is
empty.

### Task 2: Add the minimal forward repair migration

**Files:**
- Create: `supabase/migrations/20260819125000_restore_service_role_shared_table_reads.sql`
- Test: `apps/api/src/services/service-role-shared-table-read-repair-migration-contract.test.ts`

- [ ] **Step 1: Add the migration**

```sql
-- Rollback: forward-only. Revoke these table-level reads only after the API
-- uses a dedicated least-privilege role or audited RPCs for employee and
-- supplier-product reads; restoring the previous column-only grants now would
-- recreate the development login and product-read outage.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

GRANT SELECT ON TABLE public.employees TO service_role;
GRANT SELECT ON TABLE public.supplier_products TO service_role;

DO $service_role_shared_table_read_repair$
BEGIN
  IF NOT has_table_privilege(
    'service_role',
    'public.employees',
    'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_EMPLOYEE_SELECT_REPAIR_FAILED';
  END IF;

  IF NOT has_table_privilege(
    'service_role',
    'public.supplier_products',
    'SELECT'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'SERVICE_ROLE_SUPPLIER_PRODUCT_SELECT_REPAIR_FAILED';
  END IF;
END;
$service_role_shared_table_read_repair$;

COMMIT;
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run:

```bash
cd apps/api
bun test src/services/service-role-shared-table-read-repair-migration-contract.test.ts
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 3: Run API static verification**

Run:

```bash
cd apps/api
bun run check
```

Expected: typecheck, build, and API file-size check pass.

### Task 3: Verify PostgreSQL role behavior locally

**Files:**
- Verify: `supabase/migrations/20260819125000_restore_service_role_shared_table_reads.sql`

- [ ] **Step 1: Reset the local database**

Run from the repository root:

```bash
supabase db reset
```

Expected: every migration through `20260819125000` applies successfully.

- [ ] **Step 2: Execute representative reads as service_role**

Run:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -v ON_ERROR_STOP=1 \
  -c "BEGIN; SET LOCAL ROLE service_role; SELECT id, tenant_id, user_id, phone, status FROM public.employees LIMIT 0; SELECT id, supplier_id, product_code, name, category_id, brand_id, status, ownership_scope, owner_tenant_id FROM public.supplier_products LIMIT 0; ROLLBACK;"
```

Expected: both projections succeed with no `42501`.

### Task 4: Review, publish, and repair development

**Files:**
- Review all changes against:
  `docs/superpowers/specs/2026-08-19-service-role-shared-table-read-repair-design.md`

- [ ] **Step 1: Run full focused verification and review**

Run the new contract, existing supplier migration contracts, API check, and
`git diff --check`. Request spec-compliance and code-quality review before
publishing.

- [ ] **Step 2: Commit and push without bypassing hooks**

```bash
git add apps/api/src/services/service-role-shared-table-read-repair-migration-contract.test.ts \
  supabase/migrations/20260819125000_restore_service_role_shared_table_reads.sql \
  docs/superpowers/plans/2026-08-19-service-role-shared-table-read-repair.md
git commit -m "fix(db): 恢复服务角色共享表读取权限"
git push -u origin fix/service-role-shared-table-reads
```

- [ ] **Step 3: Create the pull request**

Create a PR to `main` documenting root cause, migration rollback boundary,
local role smoke, and production hold.

- [ ] **Step 4: Plan and apply the development migration**

```bash
gh workflow run migrate-dev-database.yml \
  --ref fix/service-role-shared-table-reads \
  -f mode=plan \
  -f confirm_dev_project_ref=fclnkyatvfvmzgzdqlba
```

Verify exactly one pending migration, then dispatch `mode=apply` with the same
branch and project confirmation. Run a second `mode=plan` and require
`pending_count=0`.

- [ ] **Step 5: Verify development behavior**

Log in through `https://admin-dev.goodcms.cn/api/auth/login`, require HTTP
200, then require HTTP 200 and valid response shapes from project-health and a
paginated supplier-product path. Do not print session cookies.

- [ ] **Step 6: Squash-merge and monitor automatic deployment**

After PR checks pass, squash-merge to `main`. Monitor `Build Docker Images`
and the resulting `Auto Deploy Dev` run through completion. Confirm the
production migration workflow was not triggered.
