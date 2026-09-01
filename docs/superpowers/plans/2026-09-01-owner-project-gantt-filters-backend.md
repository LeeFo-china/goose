# Owner Project Gantt Filters Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-dataset keyword, date-window, timezone, and risk filtering to the existing tenant-owner project Gantt endpoint.

**Architecture:** A migration-managed SQL RPC filters, counts, orders, and paginates before the API loads current-page workflow projections. Zod owns request validation, the repository owns RPC transport/mapping, and the service preserves authorization and response compatibility.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL.

---

### Task 1: Query contract

**Files:**
- Modify: `apps/api/src/schema/tenant-owner-daily-dashboard.ts`
- Create: `apps/api/src/schema/tenant-owner-daily-dashboard.test.ts`
- Modify: `apps/api/src/controllers/tenant-owner-daily-dashboard/routes.test.ts`

- [ ] Add failing tests for trimmed keyword, paired inclusive dates, date order,
      valid IANA timezone, risk enum, defaults, and controller forwarding.
- [ ] Run `cd apps/api && bun test src/schema/tenant-owner-daily-dashboard.test.ts src/controllers/tenant-owner-daily-dashboard/routes.test.ts`; confirm failures are caused by missing fields.
- [ ] Extend `TenantOwnerProjectGanttQuerySchema` with `keyword`,
      `window_start`, `window_end`, `timezone`, and `risk`, using `superRefine`
      for paired/date-order/timezone validation.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Database filter RPC

**Files:**
- Create: `supabase/migrations/20260901110000_add_tenant_owner_project_gantt_filters.sql`
- Create: `apps/api/src/repositories/tenant-owner-dashboard-gantt-rpc.test.ts`

- [ ] Add a failing migration contract test asserting the RPC parameters,
      tenant/status predicates, keyword fields, workflow risk predicates,
      `count(*) over ()`, and `updated_at DESC, id DESC` ordering.
- [ ] Run the contract test and confirm the migration is missing.
- [ ] Add `public.list_tenant_owner_project_gantt(...)` as a stable,
      tenant-scoped function. Build CTEs for active projects, latest runtime,
      version snapshot procedure nodes, completed nodes, assignments,
      acceptances, filtered projects, counted rows, and paged rows.
- [ ] Add only the composite indexes needed for project-member name lookup,
      procedure date/status lookup, and acceptance status lookup.
- [ ] Re-run the migration contract test.

### Task 3: Repository RPC adapter

**Files:**
- Modify: `apps/api/src/repositories/tenant-owner-daily-dashboard.ts`
- Create: `apps/api/src/repositories/tenant-owner-daily-dashboard.test.ts`

- [ ] Add failing repository tests proving every filter is forwarded to the
      RPC, rows map to the unchanged project shape, empty pages retain an exact
      filtered total, and database errors use `Errors.dbError`.
- [ ] Run the repository test and confirm it fails on the old table query.
- [ ] Replace the direct `projects` range query with the filtered RPC and map
      `total_count` into the existing pagination object.
- [ ] Re-run repository tests.

### Task 4: Service behavior

**Files:**
- Modify: `apps/api/src/services/tenant-owner-daily-dashboard.ts`
- Modify: `apps/api/src/services/tenant-owner-daily-dashboard.test.ts`

- [ ] Add failing tests for forwarding all filters, timezone-derived business
      date, current-page-only workflow loading, and hard failure when a
      workflow-dependent filtered request cannot load progress.
- [ ] Run the service tests and confirm the expected failures.
- [ ] Pass normalized filter input to the repository, use the requested
      timezone for the business date, and preserve the existing unfiltered
      partial-error behavior.
- [ ] Re-run service tests.

### Task 5: Migration and endpoint verification

**Files:**
- Modify generated types only if the repository requires an RPC declaration.
- Create a verification record under `docs/verification/` after dev smoke.

- [ ] Run focused tests for schema, controller, repository, and service.
- [ ] Run `bun run api:typecheck`, `bun run api:build`, and
      `bun run api:check-file-size`.
- [ ] Start local Supabase if available, apply the migration, and run SQL smoke
      for each filter, combinations, inclusive boundaries, empty results, and
      page 1/page 2 stability.
- [ ] Run `supabase migration list` and confirm Local/Remote expectations before
      any remote migration.
- [ ] Commit the focused implementation with a Conventional Commit message.

### Task 6: Dev release and handoff

**Files:**
- Modify: `docs/verification/2026-09-01-owner-project-gantt-filters-dev.md`

- [ ] Push the feature branch and merge through the repository's normal PR
      path.
- [ ] Apply the migration to the development database through the approved
      migration workflow and verify migration history alignment.
- [ ] Deploy the API revision to development.
- [ ] Smoke `https://api-dev.goodcms.cn` with pagination, every filter,
      combinations, invalid input, and a token without `dashboard.read`.
- [ ] Record revision, migration, redacted request IDs, HTTP/error contracts,
      and redacted fixture coverage for Orange.
