# OCR Tenant Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform-managed, default-deny tenant rollout policy so Tencent OCR can be enabled for one tenant at a time without exposing the globally configured provider to every tenant.

**Architecture:** A migration creates one policy row per configured tenant plus a read-only tenant overview view. The OCR service combines the existing platform master switch with the tenant policy before reading files or calling Tencent, while platform Admin receives paginated list and upsert APIs and a shadcn-based management view.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Supabase PostgreSQL migrations, Next.js 15 App Router, shadcn/Radix/Tailwind, Bun tests.

---

## Source Documents

- Design: `docs/tencent-ocr/2026-07-23-tencent-ocr-tenant-rollout-design.md`
- Phase 1 PRD: `docs/tencent-ocr/2026-07-22-tencent-ocr-platform-prd.md`
- OCR service: `apps/api/src/services/ocr/service.ts`
- Platform OCR page: `apps/admin/app/(console)/platform/ocr/page.tsx`

## File Structure

Create:

- `supabase/migrations/20260723110000_create_ocr_tenant_policies.sql`: policy table, overview view, indexes, RLS and permission seed.
- `apps/api/src/repositories/ocr-tenant-policies.ts`: tenant policy lookup, platform paginated list and upsert.
- `apps/api/src/repositories/ocr-tenant-policies.test.ts`: bounded queries, pagination and upsert contract.
- `apps/api/src/services/ocr/tenant-policy.ts`: platform authorization, effective policy and audit orchestration.
- `apps/api/src/services/ocr/tenant-policy.test.ts`: default-deny, fallback quota, save validation and audit behavior.
- `apps/admin/components/platform-ocr/platform-ocr-tenant-policy-table.tsx`: policy list and edit trigger.
- `apps/admin/components/platform-ocr/platform-ocr-tenant-policy-dialog.tsx`: shadcn policy editor.

Modify:

- `packages/domain/src/ocr.ts`: Phase 1 policy document types and shared policy type.
- `packages/domain/src/ocr.test.ts`: stable policy contract tests.
- `packages/domain/src/permission.ts`: `platform.ocr.tenant_policy.manage`.
- `packages/domain/src/permission.test.ts`: permission contract.
- `apps/api/src/errors/error-codes.ts`: `OCR_TENANT_NOT_ENABLED`.
- `apps/api/src/schema/ocr.ts`: platform policy list, params and update schemas.
- `apps/api/src/services/ocr/service.ts`: enforce effective tenant policy and quota override.
- `apps/api/src/services/ocr/service.test.ts`: runtime rollout gates.
- `apps/api/src/services/ocr/index.ts`: export policy service when needed by controller.
- `apps/api/src/controllers/ocr/index.ts`: platform list and update endpoints.
- `apps/api/src/controllers/ocr/index.test.ts`: route, validation and authorization contract.
- `apps/admin/components/platform-ocr/platform-ocr-types.ts`: policy API types and labels.
- `apps/admin/components/platform-ocr/platform-ocr-page.test.tsx`: Admin policy UI contract.
- `apps/admin/app/(console)/platform/ocr/page.tsx`: server-side view selection and policy fetch.

## Task 1: Add Shared Policy Contracts and Migration

- [ ] Write failing domain tests for the four allowed Phase 1 rollout document types and the new platform manage permission.
- [ ] Run `bun test packages/domain/src/ocr.test.ts packages/domain/src/permission.test.ts` and confirm the new assertions fail.
- [ ] Add `OCR_TENANT_POLICY_DOCUMENT_TYPE_VALUES`, `OcrTenantPolicyDocumentType`, `OcrTenantPolicy`, and `platform.ocr.tenant_policy.manage` to the domain package.
- [ ] Create migration `20260723110000_create_ocr_tenant_policies.sql` with the table, constraints, trigger, indexes, forced RLS, overview view, permission seed and platform-admin assignment.
- [ ] Add a migration contract test that checks default-deny, allowed document types, quota bounds, RLS, overview view and permission assignment.
- [ ] Run the focused domain and migration contract tests and confirm they pass.
- [ ] Commit with `feat(ocr): add tenant rollout policy foundation`.

## Task 2: Build Repository and Policy Service with TDD

- [ ] Write repository tests for exact server pagination, keyword/status filters, bounded projections, tenant lookup, single-row lookup and upsert.
- [ ] Run the repository test and confirm imports or methods fail before implementation.
- [ ] Implement `OcrTenantPolicyRepository` with one paginated overview query and no N+1 reads.
- [ ] Write policy service tests for missing-row default deny, configured policy normalization, platform default quota fallback, explicit quota override, manage permission and best-effort audit.
- [ ] Run the service tests and confirm the new behavior fails before implementation.
- [ ] Implement `OcrTenantPolicyService` using `Errors`, the repository and `platformAuditLogService`.
- [ ] Run repository and policy service tests and confirm they pass.
- [ ] Commit with `feat(ocr): add tenant rollout policy service`.

## Task 3: Enforce the Runtime Gate

- [ ] Extend the OCR service harness with a tenant-policy dependency that defaults to an enabled four-document policy for existing positive tests.
- [ ] Add failing tests proving a missing/disabled policy hides capabilities and rejects recognition before file access, a partial policy filters capabilities, and a policy quota overrides the platform default.
- [ ] Add `OCR_TENANT_NOT_ENABLED` and inject the policy service into `OcrService`.
- [ ] Update `listCapabilities` and `recognize` so the platform master switch, tenant policy and document allowlist are enforced before storage/provider work.
- [ ] Keep `testPlatformConfig` independent of tenant policy and verify its existing test still passes.
- [ ] Run `cd apps/api && bun test src/services/ocr` and confirm all OCR service tests pass.
- [ ] Commit with `feat(ocr): enforce tenant rollout gate`.

## Task 4: Expose Platform APIs

- [ ] Add failing controller tests for `GET /platform/ocr/tenant-policies` and `PUT /platform/ocr/tenant-policies/:tenantId`, including pageSize 101, invalid UUID, empty allowlist while enabled and non-platform access.
- [ ] Add Zod schemas with `page=1`, `pageSize=20`, maximum 100, keyword maximum 80, strict update input, quota `1..10000` and remark maximum 500.
- [ ] Add controller methods that only parse HTTP input, call the policy service and wrap `ResponseHandler.success`.
- [ ] Run `cd apps/api && bun test src/controllers/ocr/index.test.ts src/services/ocr/tenant-policy.test.ts` and confirm pass.
- [ ] Commit with `feat(ocr): expose platform tenant rollout api`.

## Task 5: Add Platform Admin Management UI

- [ ] Run `cd apps/admin && pnpm dlx shadcn@latest info --json` and `pnpm dlx shadcn@latest docs dialog field switch checkbox input textarea tabs table` to confirm the installed component APIs before editing.
- [ ] Add failing Admin source-contract tests for the “调用记录/租户灰度” navigation, platform master-switch warning, server pagination and shadcn policy editor fields.
- [ ] Add policy types and document labels to `platform-ocr-types.ts`.
- [ ] Implement a compact policy table with tenant, enabled badge, document types, daily limit, enabled time, updated time and edit action.
- [ ] Implement the edit dialog with existing shadcn `Dialog`, `FieldGroup`, `Switch`, `Checkbox`, `Input`, `Textarea`, `Button`, validation and save feedback.
- [ ] Update the server page to use `view=recognitions|tenants`, fetch the selected paginated endpoint and preserve view/filter query parameters.
- [ ] Run `bun test apps/admin/components/platform-ocr` and confirm pass.
- [ ] Commit with `feat(admin): manage ocr tenant rollout`.

## Task 6: Verify, Integrate and Preserve the Release Gate

- [ ] Run `bun test packages/domain/src/ocr.test.ts packages/domain/src/permission.test.ts`.
- [ ] Run `cd apps/api && bun test src/controllers/ocr/index.test.ts src/repositories/ocr-tenant-policies.test.ts src/services/ocr`.
- [ ] Run `bun run api:check`.
- [ ] Run `pnpm --dir apps/admin check` and `pnpm --dir apps/admin build`.
- [ ] Run `bun run check:file-size` and `git diff --check`.
- [ ] Run migration static checks and, only against the explicitly configured remote project, apply the migration and verify `supabase migration list` Local/Remote alignment.
- [ ] Verify no command changed `TENCENT_OCR_ENABLED` or `TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED`; both must remain disabled until CAM control-plane readback is complete.
- [ ] Review the branch diff for secrets, unbounded lists, direct database writes outside the repository, raw form controls and unrelated files.
- [ ] Merge the verified branch into `main`, push, and remove the worktree only after confirming the main worktree's unrelated changes remain untouched.
