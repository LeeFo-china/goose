# Tenant Onboarding Share Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure tenant-onboarding share links, non-blocking attribution on application submission, and paginated attribution statistics.

**Architecture:** A dedicated Supabase migration owns link persistence and atomic counter/attribution functions. Thin Fastify controllers validate HTTP input, services enforce employee/session ownership and shape responses, and repositories contain all Supabase access. The existing applicant submission RPC remains the transaction boundary.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations.

---

### Task 1: Define the HTTP contracts

**Files:**
- Modify: `apps/api/src/schema/tenant-onboarding.ts`
- Modify: `apps/api/src/schema/tenant-onboarding.test.ts`

- [ ] Add failing schema tests for optional `share_token`, rejection of direct referrer identity fields, link token params, empty create body, and paginated list inputs.
- [ ] Run `bun test src/schema/tenant-onboarding.test.ts` from `apps/api` and verify failures are caused by missing schemas.
- [ ] Add strict Zod schemas and exported input types with `pageSize <= 100`.
- [ ] Re-run the schema test and verify it passes.

### Task 2: Add the database migration and SQL contract

**Files:**
- Create: `supabase/migrations/20260918063501_tenant_onboarding_share_attribution.sql`
- Create: `apps/api/src/services/tenant-onboarding-share-attribution-migration-contract.test.ts`

- [ ] Write a failing migration contract test covering the link table, RLS/revokes, indexes, atomic open function, application attribution columns, and updated atomic submit function.
- [ ] Run the contract test and verify it fails because the migration is absent.
- [ ] Create the migration with bounded locks/timeouts, additive columns/indexes, the open RPC, paginated stats RPC, and a replacement submission RPC that derives attribution from a valid token.
- [ ] Re-run the contract test and verify it passes.

### Task 3: Add repository and service behavior

**Files:**
- Create: `apps/api/src/repositories/tenant-onboarding-share-links.ts`
- Create: `apps/api/src/services/tenant-onboarding-share-links.ts`
- Create: `apps/api/src/services/tenant-onboarding-share-links.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-types.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applicant-payloads.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applications.test.ts`

- [ ] Write failing service tests for idempotent token creation, platform and tenant employee identity snapshots, invalid-open degradation, ownership checks, and application payload token forwarding.
- [ ] Run the focused tests and verify the expected failures.
- [ ] Implement typed repository boundaries and service orchestration; use one stats RPC and paginated `.range()` for application lists.
- [ ] Extend applicant record parsing/selects and forward only `share_token` into the atomic submission payload.
- [ ] Re-run focused tests and verify they pass.

### Task 4: Wire controllers and authentication boundaries

**Files:**
- Modify: `apps/api/src/controllers/tenant-onboarding/index.ts`
- Modify: `apps/api/src/controllers/tenant-onboarding/routes.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin.test.ts`

- [ ] Add failing route tests for create/open/list/application-list endpoints, UUID idempotency validation, employee authentication, and visitor-only open tracking.
- [ ] Run the route tests and verify failures reflect missing routes/classification.
- [ ] Add thin controller handlers and mark only `POST /tenant-onboarding/share-links/:token/open` as a visitor-session route.
- [ ] Re-run the route tests and verify they pass.

### Task 5: Verify and commit

**Files:**
- Modify: `apps/api/src/types/database.ts` only if generated types are needed by touched typed clients.
- Review: all files above.

- [ ] Run all tenant-onboarding schema, controller, service, repository, and migration contract tests.
- [ ] Run `pnpm --dir apps/api typecheck`.
- [ ] Run `pnpm --dir apps/api build` and `bun scripts/check-api-file-size.ts`.
- [ ] Run migration static checks and inspect `git diff --check` plus `git status`.
- [ ] Commit focused changes with a Conventional Commit message.
