# Restore Douyin Lead Phone Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Douyin official phone authorization on the free-measurement page while retaining SMS fallback and legacy `0.1.10` compatibility.

**Architecture:** The runtime bootstrap exposes the installation feature flag to modern clients while the legacy contract remains SMS-only. The mini program selects official-phone or SMS verification per submission, the tenant Admin controls the flag, and an additive migration restores the configuration RPC and enables active merchant installations.

**Tech Stack:** Bun, TypeScript, Douyin Mini App TTML, React/Next.js, Fastify service layer, Supabase PostgreSQL migrations.

---

### Task 1: Restore the runtime bootstrap contract

**Files:**
- Modify: `apps/api/src/services/douyin-miniapp/bootstrap-feature-contract.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/bootstrap-feature-contract.ts`

- [ ] Change the runtime-contract assertion to expect the original feature object while retaining the legacy downgrade assertion.
- [ ] Run the focused test and confirm it fails because runtime currently forces SMS mode.
- [ ] Return runtime features unchanged and only downgrade `legacy_0_1_10`.
- [ ] Re-run the focused test and confirm both compatibility cases pass.

### Task 2: Restore tenant configuration controls

**Files:**
- Modify: `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.test.ts`
- Modify: `apps/api/src/services/tenant-douyin-miniapp/lead-capture-config.ts`
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.test.tsx`
- Modify: `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx`

- [ ] Change the service test to expect `enabled=true` to reach the repository for the current active installation.
- [ ] Run the service test and confirm the current unavailable error causes the expected failure.
- [ ] Remove the temporary service-level rejection while preserving permission, tenant, AppID, status and optimistic-lock checks.
- [ ] Restore Admin tests for the toggle request, response parsing, mutable controls and stale-write refresh.
- [ ] Run the Admin test and confirm the informational-only component fails those expectations.
- [ ] Restore the existing shadcn-based toggle UI and request path without adding dependencies.
- [ ] Re-run focused API and Admin tests.

### Task 3: Restore the free-measurement authorization flow

**Files:**
- Modify: `apps/douyin-mini/src/pages/lead/form-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/form-model.ts`
- Modify: `apps/douyin-mini/src/pages/lead/lead-page.test.ts`
- Modify: `apps/douyin-mini/src/pages/lead/lead-page.ts`
- Modify: `apps/douyin-mini/src/pages/lead/index.ttml`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ts`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttml`
- Modify: `apps/douyin-mini/src/components/lead-form/index.ttss`

- [ ] Add validation tests proving an authorized official-phone submission does not require phone or SMS code while SMS fallback still does.
- [ ] Run the form-model test and confirm the official-phone case fails.
- [ ] Add verification-mode-aware validation and idempotency draft data.
- [ ] Add page tests for runtime feature exposure, successful authorization, refusal fallback and official-phone submission.
- [ ] Run the page tests and confirm the missing handler and SMS-only submission fail.
- [ ] Restore the `getPhoneNumber` event handler, transient code handling, feature-driven rendering and submission selection.
- [ ] Restore the button and component properties while keeping the SMS input available as fallback.
- [ ] Re-run focused mini-program tests and typecheck.

### Task 4: Restore the database configuration RPC

**Files:**
- Create: `supabase/migrations/20260920100000_restore_douyin_lead_phone_capture.sql`
- Create: `apps/api/src/services/tenant-douyin-miniapp/restore-lead-phone-migration-contract.test.ts`

- [ ] Write a migration contract test requiring bounded locks, preservation of unrelated JSON keys, active merchant filtering, the five-argument RPC, both enabled states and restricted grants.
- [ ] Run the contract test and confirm it fails because the migration does not exist.
- [ ] Add the transaction-scoped migration, restore the RPC body from the last supported implementation, and enable active merchant installations.
- [ ] Re-run the contract test and the previous disable-migration contract test.

### Task 5: Verify the integrated change

**Files:**
- Modify: `docs/superpowers/plans/2026-09-20-restore-douyin-lead-phone.md`

- [ ] Run focused API, Admin and Douyin mini-program tests.
- [ ] Run `bun run api:check`.
- [ ] Run `bun run admin:check`.
- [ ] Run `bun run douyin-mini:check`.
- [ ] Run the repository file-size and migration contract checks relevant to the modified files.
- [ ] Inspect `git diff --check`, the final diff and worktree status.
- [ ] Mark completed plan checkboxes and commit with a focused Conventional Commit message.

