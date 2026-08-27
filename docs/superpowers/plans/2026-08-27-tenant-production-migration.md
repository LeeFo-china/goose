# Tenant Production Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely migrate tenant `3eebca47-961f-4899-b976-a3d3208d326b` from development to production with immutable source evidence, explicit data cleaning, rollback evidence, and post-import verification.

**Architecture:** First make the production migration workflow independent of unreliable production-side Git clones by packaging migration source on a GitHub-hosted runner and verifying it on the production runner. Then align schemas, build a tenant-scoped export manifest, reject identity and primary-key conflicts, and import in a single audited maintenance window with a complete logical backup and worker pause.

**Tech Stack:** GitHub Actions, Bun contract tests, PostgreSQL 17, Supabase Auth, Tencent COS, Docker Compose.

---

### Task 1: Harden production migration source delivery

**Files:**
- Modify: `.github/workflows/migrate-production-database.yml`
- Modify: `scripts/release-orchestration-contract.test.ts`

- [ ] Add a failing contract test requiring a GitHub-hosted packaging job, immutable source checksum, bounded artifact-download retries, and no production-side `git clone`.
- [ ] Run `bun test scripts/release-orchestration-contract.test.ts` and verify the new contract fails.
- [ ] Package `supabase/migrations` with `git archive`, upload it as `production-migration-source`, and verify its commit SHA and SHA-256 before extraction on production.
- [ ] Run the contract suite and verify all tests pass.
- [ ] Commit, push, open a PR, and squash merge to `main`.

### Task 2: Align production schema

**Files:**
- No repository changes.

- [ ] Dispatch `Migrate Production Database` in `plan` mode from `main`.
- [ ] Verify the plan reports exactly the expected pending migrations.
- [ ] Dispatch `apply` with confirmation text `确认迁移生产数据库`.
- [ ] Verify the workflow backup exists and development/production migration histories align.

### Task 3: Build and verify tenant transfer evidence

**Files:**
- Create: `scripts/ops/tenant-transfer/README.md`
- Create: `scripts/ops/tenant-transfer/audit.sql`
- Create: `scripts/ops/tenant-transfer/export.sql`
- Create: `scripts/ops/tenant-transfer/import.sql`
- Test: `scripts/ops/tenant-transfer/tenant-transfer-contract.test.ts`

- [ ] Write failing contract tests for tenant ID pinning, read-only audit mode, active-identity filtering, environment-specific exclusions, primary-key conflict rejection, transaction rollback, and post-import count checks.
- [ ] Implement the audit and export manifest using tenant foreign keys plus an explicit reviewed indirect-table allowlist.
- [ ] Exclude unbound identities, sessions, OTP/MFA data, development placeholders, pending smoke payments, and environment-specific credentials.
- [ ] Generate checksummed export artifacts and a rollback primary-key manifest.
- [ ] Run the transfer contract test and a development-only dry-run.

### Task 4: Execute production import

**Files:**
- No additional repository changes.

- [ ] Create a full logical backup covering `public`, `auth`, `storage`, and migration history.
- [ ] Pause write-capable Gooes workers and record their prior running state.
- [ ] Re-run production conflict checks immediately before import.
- [ ] Import the disabled tenant in one transaction and reject any row-count, unique-key, or foreign-key mismatch.
- [ ] Verify login identities, projects, workflows, finance, supplier data, and COS object accessibility.
- [ ] Enable the tenant only after verification passes, then restore workers to their prior state.

### Task 5: Close out and audit

**Files:**
- Create: `docs/operations/2026-08-27-tenant-production-migration-result.md`

- [ ] Record migration workflow runs, backup path and checksum, export checksum, imported row counts, exclusions, smoke results, and rollback instructions without credentials or personal data.
- [ ] Verify production services and public endpoints remain healthy.
- [ ] Commit the sanitized audit document and report the final production state.
