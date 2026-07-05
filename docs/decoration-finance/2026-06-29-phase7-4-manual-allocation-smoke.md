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

## Migration 应用和核验

CLI 状态：

- `supabase db diff --local --schema public` 仍因本机 Docker daemon 未运行而不可用。
- `supabase migration list` 仍因当前 linked project 密码认证失败不可用。
- `supabase migration list --db-url $SUPABASE_DB_DIRECT_URL` 和 `--db-url $SUPABASE_DB_URL` 仍会被 TLS 配置拒绝。

处理方式：

- 已使用 `supabase/migrations/20260629193000_receivable_manual_allocation_reversal.sql` 原文在事务内应用。
- 已同步写入 `supabase_migrations.schema_migrations`：
  - `version = 20260629193000`
  - `name = receivable_manual_allocation_reversal`
- 应用后做只读核验：
  - `project_receivable_allocations.reversed_at` 存在，类型 `timestamp with time zone`。
  - `project_receivable_allocations.reversed_by` 存在，类型 `uuid`。
  - `project_receivable_allocations.reverse_reason` 存在，类型 `text`。
  - 三个 active allocation 索引均存在：
    - `project_receivable_allocations_active_plan_idx`
    - `project_receivable_allocations_active_payment_idx`
    - `project_receivable_allocations_project_active_idx`
  - `project_receivable_events_event_type_check` 已包含：
    - `allocate_payment`
    - `adjust_allocation`
    - `reverse_allocation`

补充说明：

- 由于 Supabase CLI 当前连接链路仍不可用，`supabase migration list` 不能作为本轮验收证据。
- 后续正式发布窗口仍建议修复 CLI 连接配置后再次执行 `supabase migration list`，确认 Local/Remote 对齐。

## API 写入 Smoke

临时 API：

- 地址：`http://127.0.0.1:3320`
- 启动方式：在 worktree 使用 `apps/api/.env` 启动。
- 说明：根目录 `.env.local` 缺少 `JWT_SECRET`，不适合作为 API runtime env。

执行账号：

- 账号：`18800005001`
- 员工：小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`

样本：

- project ID：`d382cd45-9141-476e-a7a5-5bf88d0a3255`
- payment ID：`5859aec7-a8a8-474b-83d8-ba420bf1555d`
- receivable plan ID：`ab6b42e0-6d99-4bdf-9f64-a42d93d5ee83`
- receivable title：`Phase 7.4 人工核销 smoke 应收`

执行链路：

1. 创建 manual receivable。
2. 对 payment `5859aec7-a8a8-474b-83d8-ba420bf1555d` 创建 manual allocation。
3. 将首笔 allocation 调整为 `9000`。
4. 撤销首笔 allocation。
5. 重新创建最终 allocation，金额 `10000`。

最终状态：

- receivable `amount = 10000`
- receivable `paid_amount = 10000`
- receivable `remaining_amount = 0`
- receivable `status = paid`
- payment `allocated_amount = 10000`
- payment `remaining_amount = 0`
- 当前 active allocation：
  - allocation ID：`4c7a828f-f650-41bb-baf7-4e5fb6a42e29`
  - amount：`10000`
  - source_type：`manual`
  - reversed_at：`null`
- 已撤销 allocation 保留审计：
  - allocation ID：`e80fd168-8e35-4f49-be01-132746fae7b5`
  - amount：`9000`
  - source_type：`manual`
  - reversed：`true`
  - reversed_by：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`
  - reverse_reason：`Phase 7.4 smoke 撤销旧核销后重建`

事件追溯：

- `manual_created`：人工创建应收
- `allocate_payment`：首次人工核销
- `adjust_allocation`：调整核销金额
- `reverse_allocation`：撤销收款核销
- `allocate_payment`：最终人工核销

对账异常复查：

- 执行前 payment `5859aec7-a8a8-474b-83d8-ba420bf1555d` 来自 open `payment_unallocated` 样本。
- 执行后 `payment_unallocated` open 总数为 `7`。
- 执行后目标 payment 在 `payment_unallocated` open 列表中出现次数为 `0`。

## Admin 只读 Smoke

临时 Admin：

- 地址：`http://127.0.0.1:3330`
- API 指向：`GOOES_API_BASE_URL=http://127.0.0.1:3320`

验证结果：

- `POST /api/auth/login` 返回 `200`，成功写入 `gooes_admin_token` cookie。
- `GET /finance/receivables?project_id=d382cd45-9141-476e-a7a5-5bf88d0a3255` 返回 `200`。
- 页面 HTML 包含 `Phase 7.4 人工核销 smoke 应收`。
- 页面 HTML 包含“核销”操作入口。
- 页面 HTML 未出现 `Application error`。
- 页面 HTML 未出现 `后端服务未连接`。
- `GET /api/backend/finance/receivables/ab6b42e0-6d99-4bdf-9f64-a42d93d5ee83/allocation-context` 返回 `200`。
- 代理接口返回：
  - `receivable_plan.id = ab6b42e0-6d99-4bdf-9f64-a42d93d5ee83`
  - `allocations.length = 1`
  - `payments.length = 1`

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
