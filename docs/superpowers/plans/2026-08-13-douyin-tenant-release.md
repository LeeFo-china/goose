# Douyin Tenant Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform operators confirm one deployable Douyin template and let each tenant Admin complete its own test, audit, and production release workflow with a persistent new-version reminder.

**Architecture:** Persist an immutable global template confirmation history with one current row per channel. Split provider template promotion from merchant deployment, expose the current template through the tenant workspace, and wrap the existing release operation state machine with tenant-scoped endpoints and permissions.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase/PostgreSQL migrations and RPC-backed repositories, Next.js, shadcn/ui, Tailwind, lucide-react.

---

### Task 1: Deployable template and permission foundation

**Files:**
- Create: `supabase/migrations/20260813200000_create_douyin_deployable_templates.sql`
- Create: `apps/api/src/services/douyin-miniapp/deployable-template-migration-contract.test.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`

- [ ] Write contract tests for the table, one-current-row constraint, service-role-only access, exact permission, and tenant Admin grant.
- [ ] Run the tests and verify they fail because the migration and permission are absent.
- [ ] Add the migration and shared permission definition.
- [ ] Run the focused tests and domain checks.

### Task 2: Platform template confirmation

**Files:**
- Create: `apps/api/src/repositories/douyin-deployable-templates.ts`
- Create: `apps/api/src/repositories/douyin-deployable-templates.test.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.ts`
- Modify: `apps/api/src/services/platform-douyin-template-promotion.test.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.test.ts`
- Delete: `apps/admin/components/platform-douyin-miniapps/platform-douyin-release-panel.tsx`
- Delete: `apps/admin/components/platform-douyin-miniapps/platform-douyin-release-rules.ts`
- Create: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-panel.tsx`
- Create: `apps/admin/components/platform-douyin-miniapps/platform-douyin-template-rules.ts`
- Modify: `apps/admin/app/(console)/platform/douyin-miniapps/page.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] Write failing tests for idempotent confirmation and removal of merchant selection from the platform action.
- [ ] Implement repository reads and atomic current-template confirmation.
- [ ] Split `confirmLatest` from merchant upload and expose a platform confirmation endpoint.
- [ ] Update the platform page to show latest/current template and confirm once.
- [ ] Run focused API and Admin tests.

### Task 3: Tenant availability and release operations

**Files:**
- Modify: `apps/api/src/schema/tenant-douyin-miniapp.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/workspace.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/workspace.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/releases.test.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/tenant-douyin-miniapp/index.test.ts`

- [ ] Write failing tests for `new_available`, `in_progress`, and `up_to_date` comparisons by `template_id`.
- [ ] Write failing tests proving tenant release creation ignores client identifiers and resolves the current template server-side.
- [ ] Write failing tests for owned, audit-approved publishing under `douyin_miniapp.publish`.
- [ ] Implement workspace composition and tenant-scoped create/publish endpoints using existing operation services.
- [ ] Run all tenant Douyin service and controller tests.

### Task 4: Tenant workspace interaction

**Files:**
- Modify: `apps/admin/app/(console)/douyin-miniapp/workspace/page.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-types.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-actions.tsx`
- Modify: adjacent `*.test.ts` and `*.test.tsx` files.

- [ ] Write failing tests for persistent new-version, in-progress, publish-ready, and up-to-date states.
- [ ] Add the non-dismissable version notice and permission-aware actions.
- [ ] Add a production publish confirmation dialog and stable pending/error states.
- [ ] Verify responsive behavior and text fit on desktop and mobile.

### Task 5: Verification and delivery

- [ ] Run focused API, Admin, domain, and migration contract tests.
- [ ] Run `bun run api:check`, `pnpm run admin:check`, and `bun run test`.
- [ ] Run `supabase migration list` and verify Local/Remote evidence without applying unreviewed migration automatically.
- [ ] Inspect desktop and mobile screenshots of both platform and tenant workflows.
- [ ] Run `git diff --check`, obtain independent review, commit, push, create a PR, and squash merge after checks pass.
