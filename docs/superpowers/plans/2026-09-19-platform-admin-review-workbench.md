# Platform Admin Review Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a super-admin-only mobile review API for tenant onboarding and partner applications with paginated reads, atomic versioned actions, idempotent retries, private license preview, summary counts, and unified review logs.

**Architecture:** Add a focused `/platform/admin` facade that maps the mini-program contract onto the existing tenant-onboarding domain and a hardened partner-application command RPC. Keep current Web Admin routes compatible. Use authoritative domain review tables for logs and repository-level paginated read models.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase/PostgreSQL migrations and RPCs.

---

### Task 1: Freeze the mobile API contract

**Files:**
- Create: `apps/api/src/schema/platform-admin-review-workbench.ts`
- Create: `apps/api/src/schema/platform-admin-review-workbench.test.ts`

- [ ] Write failing schema tests for page defaults, `pageSize <= 50`, target types, UUID idempotency header, `expected_version`, required remarks, partner level code, region codes, and unsupported automatic service-provider publication.
- [ ] Run `cd apps/api && bun test src/schema/platform-admin-review-workbench.test.ts` and confirm the module is missing.
- [ ] Implement strict Zod schemas and inferred input types; validation errors remain compatible with `Errors.fromZod`.
- [ ] Re-run the schema test and confirm it passes.

### Task 2: Add the partner review database contract

**Files:**
- Create: `supabase/migrations/20260919120000_platform_admin_mobile_review_workbench.sql`
- Create: `apps/api/src/services/platform-admin-review-workbench-migration-contract.test.ts`

- [ ] Write a failing SQL contract test that requires the version column, six-state constraint, review table, bounded indexes, row lock, idempotency lookup before state/version checks, request-hash conflict, version increment, review insert, and atomic partner/member/invite creation.
- [ ] Run the contract test and confirm it fails because the migration does not exist.
- [ ] Add the migration with additive schema changes and an admin-client-only RPC returning structured status/result JSON.
- [ ] Run the contract test and confirm it passes.

### Task 3: Implement partner review repository and service behavior

**Files:**
- Modify: `apps/api/src/repositories/platform-partner-applications.ts`
- Modify: `apps/api/src/services/platform-partner-applications.ts`
- Modify: `apps/api/src/services/platform-partner-applications.test.ts`
- Modify: `apps/api/src/schema/platform-partner-applications.ts`

- [ ] Add failing tests for masked list/detail DTOs, `supplement_required`, version conflict, terminal conflict, idempotent approval replay, required supplement fields, level-code resolution, and default invite-code result.
- [ ] Run the focused service test and verify the new cases fail for missing behavior.
- [ ] Add minimal repository RPC/list/detail/review methods and service mappings; keep current Web Admin signatures working.
- [ ] Re-run the focused tests and confirm all pass.

### Task 4: Implement mobile read models and tenant adapters

**Files:**
- Create: `apps/api/src/repositories/platform-admin-review-workbench.ts`
- Create: `apps/api/src/services/platform-admin-review-workbench.ts`
- Create: `apps/api/src/services/platform-admin-review-workbench.test.ts`
- Modify: `apps/api/src/services/tenant-onboarding-review.ts`

- [ ] Add failing tests for summary totals/latest limit, phone masking, source filter, tenant approve/reject/supplement input mapping, no auto-publish, private license preview, and unified log pagination without N+1.
- [ ] Run the focused tests and verify they fail because the facade is missing.
- [ ] Implement the read repository with explicit selects, `.range()`/`.limit()`, parallel aggregate queries, and batched reviewer hydration.
- [ ] Implement the service facade with super-admin authorization assumed from the controller context, exact response DTOs, existing tenant service delegation, and partner service delegation.
- [ ] Re-run the tests and confirm all pass.

### Task 5: Register super-admin-only routes

**Files:**
- Create: `apps/api/src/controllers/platform-admin-review-workbench/index.ts`
- Create: `apps/api/src/controllers/platform-admin-review-workbench/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] Add a failing route test enumerating the 13 handoff routes and checking that no route is public or scoped.
- [ ] Run the route test and confirm it fails because the controller is missing.
- [ ] Implement thin controller methods that parse params/query/body/header, call `getRequiredPlatformSuperAdminContext()`, delegate to the service, and wrap with `ResponseHandler.success`.
- [ ] Register the controller and rerun the route test.

### Task 6: Preserve Web Admin compatibility and error codes

**Files:**
- Modify: `apps/api/src/errors/error-codes.ts`
- Modify: `apps/api/src/services/platform-partner-applications.test.ts`
- Modify: `apps/api/src/controllers/platform-partner-applications/routes.test.ts`
- Modify: `apps/api/src/controllers/platform-tenant-onboarding/routes.test.ts`

- [ ] Add failing assertions for `VERSION_CONFLICT`, `ALREADY_REVIEWED`, `DUPLICATED_SUBJECT`, and unchanged existing route lists.
- [ ] Implement only the missing error constants/mappings and compatibility adapters.
- [ ] Run both old and new controller/service suites and confirm all pass.

### Task 7: Verify, document, and prepare integration

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-platform-admin-review-workbench.md`

- [ ] Run focused tests for schema, migration contract, services, repositories, and routes.
- [ ] Run `cd apps/api && bun run typecheck` or the package's actual typecheck command discovered from `package.json`.
- [ ] Run `bun run api:build` from the repository root.
- [ ] Run `supabase migration list` and record whether Local/Remote align; do not apply a remote migration without a separate deployment request.
- [ ] Inspect `git diff --check`, `git status --short`, and the final diff for Orange writes, unrelated files, secrets, unbounded list queries, and direct `throw new Error()`.
- [ ] Update this checklist, commit the feature with a Conventional Commit message, and report the exact verification evidence and any deployment dependency.
