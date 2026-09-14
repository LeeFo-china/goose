# Customer Rendering Ark Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove COS CI moderation from customer rendering input and output while preserving private storage, Ark safety handling, quota settlement, and bounded retries.

**Architecture:** A normalized private input is `ready` for the Ark request. Ark's accepted image response plus a complete stored private result is the success basis; explicit provider rejection fails without exposing a result, and ambiguous submissions remain `review_required`. A forward migration changes SQL constraints and RPCs before the API and worker rollout.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase/PostgreSQL migrations, Douyin mini-program.

---

### Task 1: Database state and RPC compatibility

**Files:** Create `supabase/migrations/20260914191000_customer_rendering_ark_safety.sql`; inspect `supabase/migrations/20260913035110_create_customer_rendering_private_inputs.sql`, `20260914014930_customer_rendering_input_review_and_job_admission.sql`, and `20260914022533_customer_rendering_job_processing.sql`.

- [ ] Add a migration contract test next to existing `apps/api/src/services/customer-rendering/*migration-contract.test.ts` or a Bun test under `apps/api/src/repositories`, asserting the migration contains the `ready` status, complete-normalized input promotion, and no CI requirement in admission/finalization. Run that one test and see red.
- [ ] In the migration, replace the input status check to include `ready`; replace the review-state check so `ready` accepts complete normalized metadata without requiring `review_decision='approved'`. Preserve old review fields. Promote only complete normalized `pending_review`/`approved` rows to `ready`, clear `review_due_at`, and leave rejected/incomplete rows untouched. Drop the review-due index.
- [ ] Replace `create_customer_rendering_job` with the same function signature and security/grant settings, changing only room/floor input predicates from `status='approved' AND review_decision='approved'` to `status='ready'` plus complete normalized metadata. Keep all ownership, style, budget, and idempotency predicates.
- [ ] Replace the success constraint and `finalize_customer_rendering_job` checks so `approved` requires `provider_state='response_received'` and complete stored result facts, without an output CI decision. Preserve `failed` and `provider_rejected` settlement rules. Replace `reconcile_customer_rendering_job` approval check with response-received plus complete private result, operator and evidence references. Preserve existing EXECUTE grants and revocations.
- [ ] Run the migration contract test, SQL formatter/static validation if available, `supabase migration list` before any remote application, and inspect SQL diff. Commit the migration after green checks.

### Task 2: Input API returns readiness directly

**Files:** Modify `packages/domain/src/customer-rendering.ts`, `apps/api/src/schema/customer-renderings.ts`, `apps/api/src/repositories/customer-rendering-inputs.ts`, `apps/api/src/services/customer-rendering/inputs.ts`, `apps/api/src/services/customer-rendering/jobs.ts`; update their focused tests.

- [ ] Change focused tests to expect `status: 'ready'` after normalization and status lookup, and to retain legacy `pending_review` parsing for rollout. Run focused tests and see red.
- [ ] Extend the complete/status response status union with `ready`. Change `markNormalized` to write `status: 'ready'`, `review_due_at: null`, `review_decision: null`; return `ready` from `complete`. Recognize `ready` as a completed upload for safe repeated complete calls. Keep the normalized-object and ownership checks.
- [ ] Change `RENDERING_INPUT_UNAVAILABLE` wording to “图片尚未就绪或不属于当前账号”. Run focused tests and TypeScript check. Commit.

### Task 3: Worker and output read path

**Files:** Modify `apps/api/src/workers/customer-rendering-job-worker.ts`, `apps/api/src/repositories/customer-rendering-job-worker.ts`, `apps/api/src/repositories/customer-rendering-job-status.ts`, `apps/api/src/services/customer-rendering/job-status.ts`; update focused tests.

- [ ] Replace reviewer-dependent worker tests with success after `recordResult` and `finalize('approved')`, explicit provider rejection, unknown submission, post-response storage failure, and settlement uncertainty tests. Run and see red.
- [ ] Remove `CustomerRenderingResultReviewer` from worker dependencies and the COS CI call/recording branch. After durable result recording, call `finalize(..., 'approved', null)`. Preserve single Ark call and `review_required` for ambiguity. Keep provider HTTP diagnostics factual; a 4xx may be a provider rejection but must not be labeled a content violation without an explicit provider code.
- [ ] Remove the output CI verdict as a prerequisite for parsing and signing a `succeeded` job, while still requiring complete result location, checksum, size, and attempt ID. Keep old CI fields readable for legacy jobs.
- [ ] Run worker/status focused tests, API typecheck/build. Commit.

### Task 4: Douyin experience and cleanup of COS moderation service

**Files:** Modify `apps/douyin-mini/src/pages/rendering-style-detail/page.ts`, `index.ttml`, API client/status schemas and focused tests; delete customer-only COS CI gateways and input-review worker once imports are gone; remove their Docker/release service definitions and corresponding contract tests.

- [ ] Update page tests so upload completion makes `ready` eligible immediately; a recovered old image becomes `ready` after status refresh; rejected/failed images remain ineligible; unknown API status preserves recovery ID. Run focused tests and see red.
- [ ] Use `ready` in UI state and `canGenerate`. Replace “待审核/检查审核状态” with “图片已就绪/检查图片状态”; explain model content validation occurs when generating. Keep platform mini-program audit banner unchanged.
- [ ] Remove the customer input review worker and result reviewer from runtime/build/deploy selections. Keep unrelated COS functions and storage intact. Run Douyin typecheck/build plus focused release contract tests. Commit.

### Task 5: Release and production evidence

**Files:** Add `docs/operations/evidence/2026-09-14-customer-rendering-ark-safety-release.md` with actual checks and links.

- [ ] Verify clean diff, focused Bun tests, `bun run api:build`, Douyin build, SQL migration status. Confirm Ark standard guardrail in the configured model endpoint; if this cannot be verified, leave admission and paid worker closed.
- [ ] Disable input-review worker and task admission, apply the versioned migration using the authorized release workflow, and verify `supabase migration list` Local/Remote alignment. Never perform ad hoc production DDL/DML.
- [ ] Deploy API and job worker, run a bounded tenant smoke for new/recovered input, Ark acceptance and rejection, status URL, and quota ledger. Upload Douyin template, verify on device, then enable admission. Record links and results in evidence file.
- [ ] Only after production evidence is complete, integrate the branch via normal PR/merge and remove this worktree.
