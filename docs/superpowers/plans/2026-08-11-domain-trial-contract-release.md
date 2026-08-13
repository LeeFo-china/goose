# Domain Trial Contract Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the existing platform-service-trial Domain contract under a new immutable `@gooes/domain` version and provide Orange with a verified tarball plus SHA-256.

**Architecture:** Keep the shared contract at the existing package root export. Add a release regression that prevents the trial exports from remaining under the mutable `1.14.0` identity, extend the existing isolated packed-consumer verifier to compile and execute the trial contract, then generate one ignored tarball under `.artifacts/domain` and record its exact digest in the existing handoff document.

**Tech Stack:** Bun test, TypeScript, pnpm pack, Node.js ESM, SHA-256, Markdown.

---

### Task 1: Lock the immutable package identity

**Files:**
- Modify: `packages/domain/src/platform-service-trial.test.ts`
- Modify: `packages/domain/package.json`

- [ ] **Step 1: Write the failing release contract**

Read `packages/domain/package.json` from the trial contract test and assert that its semantic version is at least `1.15.0`, documenting that `1.14.0` was already consumed before the trial exports were included.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test packages/domain/src/platform-service-trial.test.ts`

Expected: FAIL because the package version is `1.14.0`.

- [ ] **Step 3: Apply the minimal version bump**

Change only `packages/domain/package.json` from `1.14.0` to `1.15.0`. This is a compatible minor release because it adds a new exported module.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test packages/domain/src/platform-service-trial.test.ts`

Expected: all platform-service-trial contract tests pass.

### Task 2: Verify the real packed consumer boundary

**Files:**
- Modify: `packages/domain/scripts/verify-packed-consumer.mjs`

- [ ] **Step 1: Extend the isolated consumer type check**

Import `PLATFORM_SERVICE_TRIAL_STATUS_VALUES`, `PlatformServiceTrialScopeSchema`, `PlatformServiceTrialStatus`, and `PlatformServiceTrialScopeV1` from `@gooes/domain`; make TypeScript prove that status and scope values are usable from the installed tarball.

- [ ] **Step 2: Extend the isolated runtime check**

Assert that the installed tarball exports the complete stable status tuple and that `PlatformServiceTrialScopeSchema` accepts a valid v1 scope while retaining the consumer's shared Zod identity.

- [ ] **Step 3: Build and verify the package**

Run: `pnpm --dir packages/domain run build`

Run: `pnpm --dir packages/domain run verify:packed-consumer`

Expected: build verification and isolated packed-consumer verification both exit 0.

### Task 3: Generate and document the immutable artifact

**Files:**
- Generate (ignored): `/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.15.0.tgz`
- Modify: `docs/miniprogram/2026-08-10-platform-service-trial-core-handoff.md`

- [ ] **Step 1: Generate the tarball without mutating source files**

Run: `mkdir -p /Users/leefo/Public/work/gooes/.artifacts/domain && pnpm --dir packages/domain pack --pack-destination /Users/leefo/Public/work/gooes/.artifacts/domain`

Expected: `/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.15.0.tgz` exists and the package manifest inside reports version `1.15.0`.

- [ ] **Step 2: Compute and verify its digest**

Run: `shasum -a 256 /Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.15.0.tgz`

Run the same command again after all tracked edits; the two digests must match.

- [ ] **Step 3: Update the handoff**

Record version `1.15.0`, the absolute local artifact path, the observed SHA-256, the exported trial symbols, and the Orange-owned `pnpm add` command. Explicitly state that Orange changes remain Orange-owned and that `1.14.0` must not be reused.

### Task 4: Fresh verification and commit

**Files:**
- Verify all files above.

- [ ] **Step 1: Run fresh gates**

Run focused Domain tests, Domain build, packed-consumer verification, archive manifest/content inspection, SHA-256 verification, and `git diff --check`.

- [ ] **Step 2: Confirm scope and safety**

Verify `git status --short`, confirm no Orange path was written, and confirm the old `1.14.0` artifact was not overwritten or deleted.

- [ ] **Step 3: Commit the tracked release contract**

Commit only the plan, package version, tests/verifier, and handoff document with:

```text
chore(domain): 发布试用共享契约包
```
