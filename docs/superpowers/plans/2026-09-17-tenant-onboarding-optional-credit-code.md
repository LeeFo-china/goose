# Tenant Onboarding Optional Credit Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `unified_social_credit_code` optional end to end for tenant onboarding while preserving validation and duplicate detection for supplied values.

**Architecture:** Normalize all empty input forms to `null` at the API schema boundary. Carry `string | null` through the service, repository records, database column, approval conversion, and admin display; only non-null codes participate in explicit duplicate checks.

**Tech Stack:** Bun, TypeScript, Zod 4, Fastify, Supabase/PostgreSQL, Next.js.

---

### Task 1: Request contract and service behavior

**Files:**
- Modify: `apps/api/src/schema/tenant-onboarding.ts`
- Test: `apps/api/src/schema/tenant-onboarding.test.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applicant-payloads.ts`
- Modify: `apps/api/src/services/tenant-onboarding-applications.ts`
- Test: `apps/api/src/services/tenant-onboarding-applications.test.ts`

- [ ] Add failing schema tests for missing, `null`, empty, whitespace-only, valid and invalid supplied codes.
- [ ] Add failing service tests proving null submission skips `findOpenByCreditCode` and persists `null`.
- [ ] Introduce an optional nullable credit-code schema that normalizes empty input to `null`.
- [ ] Remove unsafe `.trim()` calls from the service and guard duplicate lookup by non-null presence.
- [ ] Run the focused schema and application service tests.

### Task 2: Persistence contract and nullable response types

**Files:**
- Create: `supabase/migrations/<timestamp>_tenant_onboarding_optional_credit_code.sql`
- Modify: `apps/api/src/types/database.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-types.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-parsers.ts`
- Test: `apps/api/src/repositories/tenant-onboarding-parsers.test.ts`
- Modify: `apps/api/src/repositories/tenant-onboarding-review-parsers.ts`
- Test: `apps/api/src/repositories/tenant-onboarding-review-parsers.test.ts`
- Test: `apps/api/src/services/tenant-onboarding-migration-contract.test.ts`

- [ ] Add failing parser and migration contract tests for nullable application credit codes.
- [ ] Create the migration with `supabase migration new` and drop the application column's `NOT NULL` constraint.
- [ ] Update generated database contract and repository types/parsers to `string | null`.
- [ ] Run parser and migration contract tests.

### Task 3: Admin review display

**Files:**
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-types.ts`
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-detail-dialog.tsx`
- Test: `apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts`

- [ ] Add a failing source-contract test for nullable DTO and the “未填写” display fallback.
- [ ] Update the DTO and detail row rendering.
- [ ] Run the focused admin test.

### Task 4: Verification and integration

- [ ] Run all focused tenant-onboarding tests.
- [ ] Run `bun run api:typecheck`, `bun run api:build`, `bun run admin:check`, and `bun run admin:build`.
- [ ] Run Supabase migration status checks and verify local/remote alignment before any production apply.
- [ ] Review the diff for orange write isolation and unrelated changes.
- [ ] Commit the implementation with a Conventional Commit message and merge it to `main` after verification.
