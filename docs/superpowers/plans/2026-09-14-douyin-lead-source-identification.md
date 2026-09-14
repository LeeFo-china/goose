# Douyin Lead Source Identification Implementation Plan

**Goal:** Show a new Douyin measurement lead's captured account and video or live-room identifier in tenant Admin detail.

**Architecture:** Capture official analysis information per external entry in the mini-app and merge it into the existing bounded launch attribution. Carry that snapshot through the existing lead command and immutable appointment source JSONB. Extend the public projection and Admin detail with only whitelisted fields.

**Tech Stack:** Douyin native mini-app TypeScript, Bun/Fastify/Zod, Supabase JSONB, Next.js Admin.

---

### Task 1: Entry capture and fallback

**Files:** `apps/douyin-mini/src/platform/launch-context.ts`, `apps/douyin-mini/src/platform/analysis-info.ts` (new), `apps/douyin-mini/src/app.ts`, `apps/douyin-mini/src/models/index.ts`, focused adjacent tests.

- [x] Add a failing test for video `itemId`/`uniqueId`, live `roomId`/`uniqueId`, unsupported entry, and a second external entry that clears the first result.
- [x] Run `bun test src/platform/launch-context.test.ts src/platform/analysis-info.test.ts` in `apps/douyin-mini`; confirm failure is due to missing capture behavior.
- [x] Add the smallest adapter around installed `@douyin-microapp/typings` `tt.getAnalysisInfo`, with bounded fields and no persisted stale result.
- [x] Run the focused tests and `bun run typecheck`.

### Task 2: Submission and server snapshot

**Files:** `apps/douyin-mini/src/pages/lead/lead-page.ts`, `apps/api/src/schema/douyin-miniapp.ts`, `apps/api/src/repositories/douyin-miniapp-marketing.ts`, `supabase/migrations/20260914202700_accept_douyin_official_lead_attribution.sql`, focused adjacent tests.

- [x] Add failing tests that a rapid lead submit uses the current entry's completed capture or a safe fallback and that invalid extra fields are rejected.
- [x] Run focused Bun tests to confirm the new expectations fail.
- [x] Carry the bounded attribution through existing submit input; extend strict server schema, repository copy and the RPC's JSONB validator through a versioned migration while preserving idempotent behavior.
- [x] Verify focused mini-app and API tests plus typechecks.

### Task 3: Tenant Admin detail

**Files:** `apps/api/src/services/tenant-douyin-leads-public.ts`, `apps/admin/components/customer-leads/leads-workbench-contract.ts`, `apps/admin/components/customer-leads/leads-workbench-panels.tsx`, focused adjacent tests.

- [x] Add failing serializer and Admin contract tests for official, tagged, absent, and invalid JSONB snapshots.
- [x] Run focused tests to confirm the missing fields cause failure.
- [x] Whitelist the new fields in API projection and Admin schema; show clear labels and a non-misleading unknown state.
- [x] Verify focused tests, API/mini typechecks, and `pnpm --dir apps/admin check`.

### Task 4: Real-entry acceptance

**Files:** `docs/operations/douyin-lead-source-identification-runbook.md` (new).

- [ ] Check each target mini-app's brand/employee account binding in the Douyin console.
- [ ] Use the installed Douyin developer tool's attribution simulation for contract smoke, then use iOS and Android devices to enter from a real bound video, live room, profile, direct launch, and unsupported account.
- [ ] Submit a test lead through each path; read the tenant Admin detail and compare account/video IDs to `tt.getAnalysisInfo` on-device output. Do not log phone numbers or tokens.
- [ ] Record completed and unverified scenarios separately. No claim of true-device success without device evidence.
