# Recharge Payment Expiration Clean Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the recharge payment expiration change on a clean branch rooted at the verified remote `main`, preserving only its required recharge-refund dependency and stopping before any push or deployment.

**Architecture:** Create a second isolated worktree at the exact audited `origin/main` SHA. Cherry-pick the standalone refund-hardening dependency first, then replay the 36 recharge-expiration commits in their original order; verify changed-path boundaries, migrations, focused API behavior, and repository-wide stable checks before presenting the branch for push approval.

**Tech Stack:** Git worktrees, Bun, TypeScript, Fastify, Supabase CLI/PostgreSQL migrations, Bun tests.

---

## Release inputs and file boundaries

- Audited remote base: `309bc1868b8673c8e74846f614efd5f6ce27d138` (`origin/main` on 2026-07-18).
- Required refund dependency: `46c7aad8` (`fix(billing): 加固微信充值退款执行`).
- Recharge-expiration range: `50d8f080^..d4f30272` (36 commits).
- Source worktree: `/Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration`.
- Release worktree: `/Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration-release`.
- Release branch: `release/recharge-payment-expiration`.
- No orange files may be modified; `/Users/leefo/Public/work/orange` remains read-only.
- No push, PR, merge, remote deployment, or production operation is part of this plan.

The dependency and feature ranges overlap only in:

- `apps/api/src/services/wechat-pay-gateway.ts`
- `apps/api/src/services/wechat-pay-gateway.test.ts`

The replay must preserve both the refund methods (`requestRefund`, `queryRefundByOutRefundNo`) and the recharge-expiration methods (`createJsapiPrepay`, `queryTransactionByOutTradeNo`, `closeTransactionByOutTradeNo`).

### Task 1: Freeze the remote base and create the clean worktree

**Files:**

- Verify only: Git refs and worktree registration.
- Create outside tracked source: `/Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration-release`.

- [ ] **Step 1: Verify the remote base has not moved**

Run from `/Users/leefo/Public/work/gooes`:

```bash
remote_main=$(git ls-remote --heads origin main | awk '{print $1}')
test "$remote_main" = "309bc1868b8673c8e74846f614efd5f6ce27d138"
```

Expected: exit 0. If the SHA differs, stop without creating a branch and repeat the dependency audit against the new remote base.

- [ ] **Step 2: Refresh the local remote-tracking ref**

```bash
git fetch --prune origin main
test "$(git rev-parse origin/main)" = "309bc1868b8673c8e74846f614efd5f6ce27d138"
```

Expected: exit 0 and no local branch mutation.

- [ ] **Step 3: Verify the release branch and worktree do not already exist**

```bash
test -z "$(git branch --list release/recharge-payment-expiration)"
test ! -e /Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration-release
```

Expected: exit 0. If either exists, stop and inspect it instead of deleting or overwriting it.

- [ ] **Step 4: Create the isolated release worktree**

```bash
git worktree add \
  /Users/leefo/Public/work/gooes/.worktrees/recharge-payment-expiration-release \
  -b release/recharge-payment-expiration \
  309bc1868b8673c8e74846f614efd5f6ce27d138
```

Expected: a new named branch at the audited remote SHA.

- [ ] **Step 5: Install the locked workspace dependencies**

Run from the release worktree:

```bash
bun install --frozen-lockfile
```

Expected: exit 0 with no lockfile changes.

- [ ] **Step 6: Verify the clean baseline**

```bash
bun run test
git status --short
```

Expected: stable suites PASS and an empty status.

### Task 2: Replay the required refund-hardening dependency

**Files:**

- Replay: the ten files recorded by `git show --name-only 46c7aad8`.
- Focus: `apps/api/src/services/wechat-pay-gateway.ts` and the refund execution service/tests.

- [ ] **Step 1: Cherry-pick the standalone dependency**

Run from the release worktree:

```bash
git cherry-pick 46c7aad8
```

Expected: one commit applies without importing the other nine local-`main` commits. If Git reports a conflict, abort with `git cherry-pick --abort` and stop for a fresh dependency review.

- [ ] **Step 2: Verify only the dependency commit was added**

```bash
test "$(git rev-list --count 309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD)" = "1"
git log -1 --format='%s'
```

Expected subject: `fix(billing): 加固微信充值退款执行`.

- [ ] **Step 3: Run the refund dependency tests**

Run from `apps/api` in the release worktree:

```bash
bun test \
  src/services/wechat-pay-gateway.test.ts \
  src/services/platform-billing-recharge-refund-execution.test.ts \
  src/services/wechat-pay-callbacks-credit-refund.test.ts
```

Expected: 0 failures.

- [ ] **Step 4: Run the API static gate**

Run from the release worktree:

```bash
bun run api:check
git status --short
```

Expected: typecheck, build, and file-size checks pass; status remains empty.

### Task 3: Replay the recharge-expiration commit range

**Files:**

- Replay: all paths changed by `46c7aad8..d4f30272`.
- Migrations: `supabase/migrations/20260718110000_*` through `20260718123000_*`.
- Handoff: `docs/miniprogram/2026-07-18-recharge-payment-expiration-handoff.md`.

- [ ] **Step 1: Cherry-pick the 36 feature commits in order**

Run from the release worktree:

```bash
git cherry-pick '50d8f080^..d4f30272'
```

Expected: all 36 commits apply in order. If any commit conflicts, abort the active cherry-pick with `git cherry-pick --abort` and stop; do not resolve the gateway overlap with wholesale `ours` or `theirs` selection.

- [ ] **Step 2: Verify commit count and absence of merge commits**

```bash
test "$(git rev-list --count 309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD)" = "37"
test -z "$(git log --format='%H' --merges 309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD)"
```

Expected: exit 0; the branch contains one dependency commit plus 36 feature commits and no merges.

- [ ] **Step 3: Verify the public gateway surface contains both capabilities**

```bash
rg -n \
  'async (createJsapiPrepay|closeTransactionByOutTradeNo|queryTransactionByOutTradeNo|requestRefund|queryRefundByOutRefundNo)' \
  apps/api/src/services/wechat-pay-gateway.ts
```

Expected: all five method names are present.

### Task 4: Prove the clean branch contains only the intended path union

**Files:**

- Verify only: Git tree/path sets.

- [ ] **Step 1: Compare expected and actual changed paths**

Run from the release worktree:

```bash
comm -3 \
  <(
    {
      git diff --name-only '46c7aad8^..46c7aad8'
      git diff --name-only '46c7aad8..d4f30272'
    } | sort -u
  ) \
  <(
    git diff --name-only \
      309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD | sort
  )
```

Expected: no output. Any path printed means the release branch is missing an intended file or contains an unrelated file.

- [ ] **Step 2: Prove the other nine local-main commits are absent**

```bash
for commit in \
  c0518858 4d68e975 da9adef5 188b94ba 40a59161 \
  beac2d9b fb063ceb de5ac347 3d7c7f51; do
  test -z "$(git branch --contains "$commit" --format='%(refname:short)' | rg '^release/recharge-payment-expiration$' || true)"
done
```

Expected: exit 0; none of the unrelated commits is an ancestor of the release branch.

- [ ] **Step 3: Review the final branch summary**

```bash
git diff --stat \
  309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD
git log --reverse --oneline \
  309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD
```

Expected: only the refund dependency and recharge-expiration series appear.

### Task 5: Verify database history and application behavior

**Files:**

- Verify: `supabase/migrations/`.
- Test: every changed `apps/api/**/*.test.ts` file.

- [ ] **Step 1: Confirm the five release migrations exist exactly once**

```bash
for version in \
  20260718110000 \
  20260718121000 \
  20260718122000 \
  20260718122500 \
  20260718123000; do
  test "$(find supabase/migrations -maxdepth 1 -name "${version}_*.sql" | wc -l | tr -d ' ')" = "1"
done
```

Expected: exit 0.

- [ ] **Step 2: Verify remote dev migration alignment read-only**

```bash
set -a
source /Users/leefo/Public/work/gooes/.env
set +a
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: the five versions appear in both Local and Remote columns. This command is read-only; do not run `db push`, `migration repair`, SQL DDL, or SQL DML.

- [ ] **Step 3: Run every changed API test file**

Run from `apps/api` in the release worktree:

```bash
git -C ../.. diff --name-only \
  309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD \
  | rg '^apps/api/.+\.test\.ts$' \
  | sed 's#^apps/api/##' \
  | xargs bun test
```

Expected: 0 failures.

- [ ] **Step 4: Run repository and API gates**

Run from the release worktree:

```bash
bun run test
bun run api:check
git diff --check \
  309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD
```

Expected: stable suites PASS; API typecheck/build/file-size checks pass; diff check exits 0.

### Task 6: Stop at the push-approval checkpoint

**Files:**

- Verify only: Git status and remote refs.

- [ ] **Step 1: Verify the release worktree is clean**

```bash
git status --short
git log -1 --oneline --decorate
```

Expected: empty status and HEAD on `release/recharge-payment-expiration`.

- [ ] **Step 2: Verify no remote release branch exists**

```bash
test -z "$(git ls-remote --heads origin release/recharge-payment-expiration)"
```

Expected: exit 0.

- [ ] **Step 3: Present evidence and stop**

Report the base SHA, 37-commit range, migration alignment, test counts, API gate results, changed-path comparison, and clean worktree status. Preserve both worktrees and do not run `git push`, create a PR, merge into `main`, or deploy any service until the user gives a new explicit instruction.
