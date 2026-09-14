# Customer Rendering Generation Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an admitted customer rendering job recoverable through generation, private result review, quota settlement, and customer-owned status reads before any production enablement.

**Architecture:** Keep HTTP controllers thin. A migration extends the existing job ledger with fenced attempts and result facts; one Bun Worker claims bounded batches, snapshots an attempt before external calls, and never blindly retries a model request whose submission result is unknown. Existing Ark and COS adapters are reused. A separate input-status API lets clients wait for approval. The task API remains disabled by default until the full path passes smoke checks.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase Postgres/RPC migrations, Tencent COS CI, existing Ark gateway.

---

### Task 1: Verify migration baseline and admission behavior

**Files:** `supabase/migrations/20260914014930_customer_rendering_input_review_and_job_admission.sql`; create an isolated test database only, without changing the shared local/production DB.

- [ ] Confirm pending migration versions with `supabase migration list --local`; never apply only the newest file onto an old schema.
- [ ] Bring up a disposable Supabase project with a distinct project ID/ports and the same migration directory; apply the full chain.
- [ ] Exercise two independent DB connections against the last available user quota and tenant task/budget slot; assert one `created`, one blocked, and exactly one reservation/job. Repeat the same key and assert `existing` and no new row. Assert foreign tenant/owner, pending input and hidden style are denied.
- [ ] Capture Local/Remote migration-list alignment on that disposable project, then stop and remove only its containers.

### Task 2: Durable Worker ledger and claim

**Files:** create a new `supabase/migrations/*_customer_rendering_job_processing.sql`; create `apps/api/src/repositories/customer-rendering-job-worker.ts` and its tests.

- [ ] Write failing repository tests for bounded queued scan, one-winner claim, lease fencing and restart recovery.
- [ ] Add attempt ID, status/lease, snapshot/model version, provider request state, result location, review and settlement facts through the migration. Use indexed bounded claims and a stable attempt token. Preserve admitted request and style snapshot.
- [ ] Implement SQL RPCs for claim, mark submitted/unknown, save private result, record output review, consume/release quota and actual cost with all local state changes atomic. Unknown submission must move to reconciliation or manual handling, never automatic paid resubmission.
- [ ] Run repository tests, API typecheck and migration validation before adding provider calls.

### Task 3: Generation, private storage and output review

**Files:** `apps/api/src/workers/customer-rendering-job-worker.ts`, existing `apps/api/src/gateways/ark-rendering/*`, a narrow private-result COS gateway, and focused tests.

- [ ] Write failing worker tests for success, explicit provider failure, uncertain timeout, storage failure, output review rejection, process restart and lost lease.
- [ ] Read approved room input from its persisted private location and use the admitted style snapshot as the second image. Never send the optional floor-plan file to Ark. Validate actual installed Ark gateway and COS SDK contracts before implementation.
- [ ] Persist attempt before external submission. Validate/download the Ark response through the existing trusted downloader, normalize and write the output to a private immutable object, verify HEAD/checksum, then run COS CI review on that private object. Only clear output may be delivered.
- [ ] Record actual provider cost, settle one quota unit only after approved private output, release on explicit failure or rejection. Leave unknown submission and unconfirmed storage writes for reconciliation.

### Task 4: Customer status, result contract and client handoff

**Files:** both rendering controllers, customer rendering service/repository, shared domain DTOs, `apps/douyin-mini/src/api/rendering-styles.ts`, related page files, `docs/integration/*`. Never modify `orange`.

- [ ] Add owner-scoped `GET /uploads/:id` to read input review status, and `GET /jobs/:id` to read job status, advice state and a short-lived private result URL only after approval. Add paginated private history only when needed by the result page (`page=1&pageSize=20`, max 100).
- [ ] Implement Douyin upload/job/result flow with persisted idempotency key, background recovery and clear AI reference labeling. Give the WeChat team exact DTO/error/status mapping and smoke steps, with no `orange` edits.
- [ ] Verify unauthenticated, cross-tenant and cross-subject reads return 401/404, and image URLs expire.

### Task 5: Release gate

**Files:** `docs/operations/evidence/` release record; no schema changes outside migrations.

- [ ] Run typecheck, build, focused tests and full scenario smoke before production deployment.
- [ ] Confirm COS CI entitlement/CAM, provider/model pricing ceiling, output review and privacy; use non-customer test images for paid smoke.
- [ ] Apply migrations in order, verify `supabase migration list` Local/Remote alignment, deploy API and Worker with both admission switches disabled, then exercise authorized end-to-end smoke.
- [ ] Enable one pilot tenant only after Worker and settlement evidence; keep rollback as switch-off plus ledger reconciliation, and never delete historical jobs/reservations.
