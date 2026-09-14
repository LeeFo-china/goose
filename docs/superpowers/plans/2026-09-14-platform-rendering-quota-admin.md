# Platform Rendering Quota Admin Implementation Plan

> **For agentic workers:** Use `executing-plans` to implement the checked tasks in this session. Do not dispatch subagents; the user requested direct execution.

**Goal:** Add a platform-superadmin tenant rendering quota page with accurate daily usage, guarded updates and recent audit history.

**Architecture:** The tenant detail links to a dedicated server-rendered page. The page fetches existing settings and paginated audit data, plus a new superadmin-only usage endpoint backed by an indexed aggregate RPC. A client form converts yuan to integer fen and submits the existing versioned PUT command.

**Tech Stack:** Next.js 15, React 19, local shadcn/Radix components, Fastify, Zod, Supabase/Postgres, Bun tests.

---

### Task 1: Daily usage aggregate

**Files:** Create `supabase/migrations/20260914070000_platform_customer_rendering_daily_usage.sql`, `supabase/tests/platform_customer_rendering_daily_usage.sql`; modify `apps/api/src/repositories/platform-customer-rendering-settings.ts` and its tests.

- [ ] Add a SQL test that creates two same-day jobs and one prior-day job under a rolled-back transaction, then asserts `task_count=2` and `budget_used_fen=coalesce(actual,reserved)` for today. Run it first and observe the missing function failure.
- [ ] Add a `service_role`-only `get_tenant_customer_rendering_daily_usage(uuid)` function. Select `budget_date`, `count(*)::integer` and `coalesce(sum(coalesce(actual_cost_fen,reserved_cost_fen)),0)::bigint` for `(tenant_id, Asia/Shanghai today)`. Reuse `customer_rendering_jobs_tenant_budget_idx`; revoke PUBLIC/anon/authenticated execution.
- [ ] Add repository test expecting a single RPC call with `p_tenant_id`, then implement `getDailyUsage(tenantId)` with a strict Zod response including `budget_date`, `task_count`, `budget_used_fen`.
- [ ] Run the repository test, API typecheck, and isolated SQL test. Confirm the migration is the only database change.

### Task 2: Authenticated usage API and audit filter

**Files:** Modify `apps/api/src/controllers/platform-customer-rendering-settings/index.ts`, `apps/api/src/services/platform-customer-rendering-settings.ts`, `apps/api/src/schema/platform-audit-logs.ts` and focused tests.

- [ ] Add failing controller/service tests for `GET /platform/customer-rendering-settings/:tenantId/usage`: no platform-superadmin context must fail before repository access; valid tenant must return the usage response wrapped in `ResponseHandler.success`.
- [ ] Implement the GET route using the existing tenant params and empty-query schemas. The service calls the repository and keeps the same superadmin check as settings GET/PUT.
- [ ] Add the existing audit action string `customer_rendering_settings_update` to `PlatformAuditLogActionSchema` so `action=...` can filter existing audit rows. Test query acceptance.
- [ ] Run focused API tests and `bun run api:check`.

### Task 3: Exact form validation and request state

**Files:** Create `apps/admin/components/platform-customer-rendering-settings/settings-form-data.ts`, `settings-form-data.test.ts`, `settings-form.tsx`, `settings-types.ts`.

- [ ] Add failing tests for `yuanToFen` (`"0.01"→1`, `"1.23"→123`, reject more than two decimals/exponent/zero) and `buildSettingsCommand` (task bounds, reserve ≤ budget, reason length, preserved `expected_version`).
- [ ] Implement pure conversion and validation without floating-point multiplication.
- [ ] Implement a client form with local Field/Input/Switch/Textarea/Button/Alert components. Save through `/api/backend/platform/customer-rendering-settings/:tenantId`; on 409 keep user input and show conflict; on success refresh page and audit. Disable duplicate saves; label enabled action explicitly.
- [ ] Run focused form tests and Admin typecheck.

### Task 4: Tenant page, usage and audit UI

**Files:** Create `apps/admin/app/(console)/platform/tenants/[id]/rendering-settings/page.tsx`, `loading.tsx`, `apps/admin/components/platform-customer-rendering-settings/settings-overview.tsx`, `settings-audit.tsx`; modify tenant detail page, Admin audit label/options and relevant tests.

- [ ] Add a platform-superadmin-only link from tenant detail. The new page checks `is_platform_super_admin` before any backend calls; ordinary sessions see a denied state.
- [ ] Fetch tenant, settings, usage and audit independently with `cache: no-store`; audit query uses `page=1&pageSize=10`, tenant ID, resource type, and action. Render clear empty/error/loading states, status and current-day usage, and recent audit details without raw JSON.
- [ ] Add `customer_rendering_settings_update` to Admin action labels and filter options. Render the audit resource scoped to the selected tenant.
- [ ] Run focused Admin tests, `pnpm --dir apps/admin check`, `pnpm --dir apps/admin build`, and a local browser smoke if static checks pass.

### Task 5: Review and delivery

**Files:** Review only changed files and the two planning documents.

- [ ] Run migration status checks against an isolated database, review SQL permission grants and `EXPLAIN ANALYZE` for the daily aggregate; do not write production data directly.
- [ ] Review UI paths, auth, pagination, 409 behavior, yuan/fen boundaries, no sensitive metadata, and `git diff --check`.
- [ ] Commit the implementation with a Conventional Commit message. Open a reviewable PR with validation evidence; preserve other worktrees and untracked user files.
