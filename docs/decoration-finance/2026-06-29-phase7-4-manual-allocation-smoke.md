# Phase 7.4 人工收款核销实施与 Smoke 记录

日期：2026-06-29

分支：`feat/finance-manual-allocation`

## 范围

本轮实现 Phase 7.4 Task 2：在 Admin 提供应收计划的人工收款核销入口，用于处理：

- `payment_unallocated`
- `allocation_amount_mismatch`
- `receivable_paid_amount_mismatch`

边界：

- 后端对账仍保持只读计算，不自动修账。
- 人工核销写入 `project_receivable_allocations` 和 `project_receivable_events`。
- 已撤销核销通过 `reversed_at` 标记并从后续 active allocation 汇总中排除。
- 小程序无必改，不开放修账入口。

## 提交记录

- `44d38b86 feat(finance): 支持应收核销撤销审计`
- `92f890d8 feat(finance): 增加人工收款核销接口`
- `06d72046 feat(admin): 增加应收收款核销入口`

## 数据库变更

新增 migration：

- `supabase/migrations/20260629193000_receivable_manual_allocation_reversal.sql`

变更内容：

- `project_receivable_allocations` 增加：
  - `reversed_at`
  - `reversed_by`
  - `reverse_reason`
- 增加 active allocation 索引：
  - `project_receivable_allocations_active_plan_idx`
  - `project_receivable_allocations_active_payment_idx`
  - `project_receivable_allocations_project_active_idx`
- `project_receivable_events_event_type_check` 增加：
  - `allocate_payment`
  - `adjust_allocation`
  - `reverse_allocation`

说明：

- 当前 `get_project_receivable_summary` RPC 读取的是 `project_receivable_plans.paid_amount`，不直接聚合 allocation，因此本轮 migration 没有重写该 RPC。
- 反冲后的金额一致性由 service 重算 `paid_amount` 保证。
- 对账异常候选的 allocation 汇总已增加 `reversed_at IS NULL`。

## 后端能力

新增接口：

- `GET /finance/receivables/:id/allocation-context`
- `POST /finance/receivables/:id/allocations`
- `PATCH /finance/receivables/:id/allocations/:allocationId`
- `POST /finance/receivables/:id/allocations/:allocationId/reverse`

后端校验：

- 需要 `finance.receivable.manage`。
- 收款必须是 `confirmed`。
- 收款项目必须和应收计划项目一致。
- 创建核销不能用于已取消或已收应收。
- 调整和撤销只能操作 active manual allocation。
- 核销后收款 active allocation 不能超过收款金额。
- 核销后应收 active allocation 不能超过应收金额。
- 每次 create/adjust/reverse 后重算应收 `paid_amount` 和状态。

## Admin 能力

入口：

- `/finance/receivables`
- 应收行操作新增“核销”。

Dialog 行为：

- 顶部展示应收、已收、未收。
- 只列出仍有可核销余额的 confirmed project payment。
- 支持新增人工核销。
- 支持调整 manual allocation 金额。
- 支持撤销 manual allocation。
- workflow 自动核销记录只读展示，不允许在此调整。

## 静态验证

已通过：

```bash
cd apps/api
bun test src/services/project-receivable-allocations.test.ts src/services/project-receivables.test.ts src/services/project-receivables-operations.test.ts src/services/finance-reconciliation.test.ts src/services/finance-reconciliation-action-targets.test.ts
# 29 pass, 0 fail

bun run typecheck
# tsc 通过

bun run build
# Bundled 897 modules

bun run check:file-size
# API file size check passed

cd ../..
bun test apps/admin/components/finance/finance-receivable-allocation-utils.test.ts
# 2 pass, 0 fail

pnpm --dir apps/admin run check
# admin file size check passed
# admin typecheck 通过

git diff --check
# 通过
```

## Migration 和 E2E Smoke 状态

本轮未执行真实写入 smoke，原因是数据库 migration 状态无法通过当前环境验证：

- `supabase db diff --local --schema public` 失败：
  - Docker daemon 未运行。
- `supabase migration list` 失败：
  - `SUPABASE_DB_PASSWORD` 认证失败。
- `supabase migration list --db-url $SUPABASE_DB_DIRECT_URL` 失败：
  - 连接 host `api-dev.goodcms.cn` 时 TLS 被拒绝。
- `supabase migration list --db-url $SUPABASE_DB_URL` 失败：
  - 同样为 TLS 被拒绝。

因此未执行：

- 远端 migration apply。
- 临时 API/Admin 写入 smoke。
- 人工核销 create/adjust/reverse 的真实数据库验证。

继续 E2E 的前置条件：

1. 提供可用的 Supabase Postgres 连接凭据，或修复 `.env.local` 中的 DB URL/TLS 配置。
2. 用 migration 正式应用 `20260629193000_receivable_manual_allocation_reversal.sql`。
3. 执行 `supabase migration list`，确认 Local/Remote 对齐。
4. 在 worktree 临时端口拉起：
   - API：`3320`
   - Admin：`3330`
5. 使用测试项目执行：
   - 查询 `payment_unallocated` 异常。
   - 打开应收核销 dialog。
   - 新增 manual allocation。
   - 复查应收 `paid_amount`。
   - 复查对账异常数量。
   - 调整 allocation。
   - 撤销 allocation。

## 回滚口径

如 migration 已应用后需要回滚：

1. 先停止使用 Admin 人工核销入口。
2. 保留 `project_receivable_allocations` 历史数据，不直接删除业务记录。
3. 若必须回滚 schema：
   - 先确认没有 `reversed_at IS NOT NULL` 的业务记录需要保留。
   - 再通过新 migration 移除新增索引和反冲字段。
   - 恢复 `project_receivable_events_event_type_check` 到原事件集合。
4. 应用后重新执行 `supabase migration list` 验证对齐。

## 小程序影响

小程序无必改。

本能力属于 Admin 财务修正入口，小程序继续：

- 只消费 workflow v2 的 timeline/actions/attributes。
- 不提供人工修账入口。
- 不直接调用 `/finance/receivables/:id/allocations` 系列接口。
