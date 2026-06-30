# Finance Reconciliation Operating Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only finance reconciliation operating stats for API and Admin without changing source finance data or miniprogram contracts.

**Architecture:** Reuse the existing reconciliation candidate repository, computed exception builder, and latest action history to aggregate current exception statistics. The Admin page fetches this read model server-side and renders compact KPI, distribution, and recent-action panels. No migration, write path, cache, queue, or new dependency is required.

**Tech Stack:** Bun + TypeScript + Fastify + Supabase for API, Next.js + shadcn/Radix + Tailwind + lucide-react for Admin, `bun:test` and existing package checks for verification.

---

## Working Directory

Use the isolated worktree:

```bash
cd /Users/leefo/Public/work/gooes/.worktrees/finance-reconciliation-operating-stats
git status --short --branch
```

Expected: `## feat/finance-reconciliation-operating-stats` with no unrelated files before starting implementation.

## File Structure

Create:

- `apps/admin/components/finance/finance-reconciliation-operating-stats-panel.tsx`
  - Renders Admin operating stats cards, distribution lists, and recent actions.

Modify:

- `apps/api/src/schema/finance-reconciliation.ts`
  - Add the operating stats query schema and exported query type.
- `apps/api/src/services/finance-reconciliation.ts`
  - Add `getOperatingStats()` and pure aggregation helpers.
- `apps/api/src/services/finance-reconciliation.test.ts`
  - Add failing tests for summary, status/action merge, stale open counts, and permission boundaries.
- `apps/api/src/controllers/finance/index.ts`
  - Add `GET /finance/reconciliation/operating-stats`.
- `apps/admin/components/finance/finance-reconciliation-utils.ts`
  - Add stats query param builder and compact count helpers if needed.
- `apps/admin/components/finance/finance-reconciliation-utils.test.ts`
  - Cover the stats query param builder.
- `apps/admin/components/finance/finance-reconciliation-requests.ts`
  - Add typed fetcher and empty fallback for operating stats.
- `apps/admin/app/(console)/finance/reconciliation/page.tsx`
  - Fetch and render the new operating stats panel.
- `docs/decoration-finance/README.md`
  - Add Phase 7.6 index entry.

Do not create migrations, new writes, miniprogram changes, or new dependencies.

---

### Task 1: API Tests First

- [ ] Add a test named `returns operating stats for the current exception scope` in `apps/api/src/services/finance-reconciliation.test.ts`.
- [ ] The test calls `service.getOperatingStats()` with `date_from=2026-06-01` and `date_to=2026-06-30`.
- [ ] Assert:
  - `summary.total = 6`
  - `summary.danger = 3`
  - `summary.warning = 3`
  - `summary.open = 6`
  - `summary.stale_open_over_7_days = 4`
  - `by_exception_code` contains each current exception type.
  - `recent_actions = []`
- [ ] Run:

```bash
cd apps/api
bun test src/services/finance-reconciliation.test.ts
```

Expected: fails because `getOperatingStats` does not exist.

### Task 2: API Implementation

- [ ] Add `FinanceReconciliationOperatingStatsQuerySchema` and `FinanceReconciliationOperatingStatsQuery`.
- [ ] Add `getOperatingStats(authContext, query)` to `FinanceReconciliationService`.
- [ ] Reuse:
  - `resolveDateRange(query)`
  - `listCandidateRows`
  - `buildFinanceReconciliationExceptions`
  - `withActionState`
  - `filterExceptions`
- [ ] Add pure helpers:
  - `buildOperatingStats(exceptions, range)`
  - `countByStatus(exceptions)`
  - `countByLevel(exceptions)`
  - `countByExceptionCode(exceptions)`
  - `buildRecentActions(exceptions)`
- [ ] Run:

```bash
cd apps/api
bun test src/services/finance-reconciliation.test.ts
```

Expected: service tests pass.

### Task 3: API Route

- [ ] Import `FinanceReconciliationOperatingStatsQuerySchema` in `apps/api/src/controllers/finance/index.ts`.
- [ ] Add:

```text
GET /finance/reconciliation/operating-stats
```

- [ ] Validate query with the new schema.
- [ ] Call `financeReconciliationService.getOperatingStats()`.
- [ ] Run:

```bash
cd apps/api
bun test src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts src/services/finance-correction-audits.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: tests and type check pass.

### Task 4: Admin Fetcher And Utils

- [ ] Add operating stats response types and empty fallback in `finance-reconciliation-requests.ts`.
- [ ] Add `fetchFinanceReconciliationOperatingStats(query)`.
- [ ] Add `buildFinanceReconciliationStatsSearchParams(query)` in `finance-reconciliation-utils.ts` without `page` or `pageSize`.
- [ ] Add a unit test proving stats params include filters but not pagination.
- [ ] Run:

```bash
cd apps/admin
bun test components/finance/finance-reconciliation-utils.test.ts
```

Expected: test passes.

### Task 5: Admin UI

- [ ] Create `finance-reconciliation-operating-stats-panel.tsx`.
- [ ] Render three cards:
  - 状态分布
  - 异常类型
  - 最近处理
- [ ] Keep layout compact with `grid gap-3 xl:grid-cols-3`.
- [ ] Do not nest this panel inside the existing table card.
- [ ] Update `finance/reconciliation/page.tsx` to fetch stats in `Promise.all` and render the panel above the table.
- [ ] Run:

```bash
cd apps/admin
bun test components/finance/finance-reconciliation-utils.test.ts components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts
pnpm run check
```

Expected: tests and Admin check pass.

### Task 6: Final Verification

- [ ] Run:

```bash
git diff --check
```

- [ ] Start worktree API on a temporary port and smoke:

```bash
cd apps/api
PORT=3102 NODE_ENV=production bun --env-file=/Users/leefo/Public/work/gooes/apps/api/.env src/app.ts
```

- [ ] In a second shell, login and call:

```bash
curl -sS 'http://127.0.0.1:3102/finance/reconciliation/operating-stats?date_from=2026-06-01&date_to=2026-06-30' \
  -H "Authorization: Bearer <token>"
```

Expected: HTTP 200 and response contains `summary`, `by_exception_code`, `by_status`, `by_level`, `recent_actions`.

### Task 7: Commit And Integration

- [ ] Commit the feature branch:

```bash
git add apps docs
git commit -m "feat(finance): 增加对账运营统计"
```

- [ ] Merge back to `main`.
- [ ] Clean the worktree.
- [ ] Report Admin and miniprogram handoff wording.
