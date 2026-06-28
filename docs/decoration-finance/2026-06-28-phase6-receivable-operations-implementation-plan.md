# 阶段 6：应收运营闭环实施计划

日期：2026-06-28

目标分支：

- `feat/finance-phase6-receivable-operations`
- worktree：`.worktrees/finance-phase6-receivable-operations`

## 当前基线

- 主分支干净，基准提交：`151141ec Merge branch 'feat/finance-risk-samples-permissions'`
- 已有应收基础能力：
  - `project_receivable_plans`
  - `project_receivable_allocations`
  - `GET /finance/receivables`
  - `GET /projects/:id/receivables`
  - workflow 收款节点生成应收、核销 allocation、写 ledger
- Admin 已有只读 `/finance/receivables` 页面和项目详情应收摘要。

## 任务拆分

### Task 1：数据模型和权限边界

文件：

- `supabase/migrations/20260628110000_finance_receivable_operations.sql`
- `packages/domain/src/permission.ts`
- `packages/domain/src/permission.test.ts`

动作：

1. 扩展 `project_receivable_plans`：
   - `owner_employee_id`
   - `canceled_at`
   - `canceled_by`
   - `canceled_reason`
2. 新增 `project_receivable_events`。
3. 增加必要索引：
   - plan tenant/status/due/owner
   - event tenant/plan/project/event_type 时间索引
4. 继续复用 `finance.receivable.manage` 作为写权限，权限文案补充“跟进和取消”语义。

验收：

- migration 可静态审查。
- 不做远端手工 DDL/DML。

### Task 2：后端 schema/repository/service/API

文件：

- `apps/api/src/schema/finance-receivables.ts`
- `apps/api/src/repositories/project-receivable-plans.ts`
- `apps/api/src/repositories/project-receivable-events.ts`
- `apps/api/src/services/project-receivables.ts`
- `apps/api/src/controllers/finance/index.ts`
- `apps/api/src/services/project-receivables.test.ts`

动作：

1. Schema 增加：
   - create manual receivable
   - update receivable
   - cancel receivable
   - create follow-up
   - event list query
   - 新列表筛选：`owner_employee_id`、`source_type`、`follow_up_due_only`
2. Repository 增加：
   - `findById`
   - `createManualPlan`
   - `updatePlan`
   - `cancelPlan`
   - list select 扩展 owner/cancel/event summary
3. 新增 event repository：
   - `create`
   - `listByReceivable`
4. Service 增加：
   - `createManualReceivable`
   - `updateReceivable`
   - `cancelReceivable`
   - `createFollowUp`
   - `listReceivableEvents`
5. Controller 增加路由：
   - `POST /finance/receivables`
   - `PATCH /finance/receivables/:id`
   - `POST /finance/receivables/:id/cancel`
   - `POST /finance/receivables/:id/follow-ups`
   - `GET /finance/receivables/:id/events`

验收：

- 写接口均要求 `finance.receivable.manage`。
- 读事件接口允许 `finance.receivable.view`、`finance.receivable.manage` 或 `finance.view`。
- 已收/已取消状态拦截覆盖测试。
- 金额不能调低到小于 `paid_amount` 覆盖测试。
- 列表继续分页，`pageSize <= 100`。

### Task 3：Admin 应收运营界面

文件：

- `apps/admin/components/finance/finance-requests.ts`
- `apps/admin/components/finance/finance-receivables-table.tsx`
- `apps/admin/components/finance/finance-receivable-actions.tsx`
- `apps/admin/app/(console)/finance/receivables/page.tsx`

动作：

1. 扩展类型和请求封装。
2. 应收列表新增字段展示：
   - 负责人
   - 最近跟进
   - 下次跟进
   - 来源
3. 增加“新增应收”入口。
4. 行动作增加：
   - 调整
   - 取消
   - 登记跟进
5. 筛选增加：
   - source_type
   - follow_up_due_only
   - owner_employee_id 精确筛选

验收：

- 操作成功后刷新当前页。
- 无 actions 本地推导 workflow，不影响小程序。
- 表格在窄屏可横向滚动，文本不溢出。

### Task 4：文档和小程序交接口径

文件：

- `docs/decoration-finance/2026-06-28-phase6-receivable-operations-prd.md`
- `docs/decoration-finance/2026-06-28-phase6-receivable-operations-implementation-plan.md`
- `docs/decoration-finance/2026-06-28-phase6-receivable-operations-miniprogram-handoff.md`

动作：

1. 记录小程序无必改。
2. 明确只读字段和禁止行为：
   - 不直接写 `/finance/receivables`
   - 不本地推导逾期/催收/负责人
   - 收款仍走 workflow task complete

### Task 5：验证和提交

验证命令：

```bash
bun test packages/domain/src/permission.test.ts
cd apps/api && bun test ./src/services/project-receivables.test.ts
cd apps/api && bun run typecheck
pnpm --dir apps/admin check
bun scripts/check-file-size.ts
git diff --check
```

如需要真实联调，再单独准备测试项目执行：

1. Admin 新建人工计划应收。
2. 调整金额和日期。
3. 登记跟进。
4. 取消未结清计划。
5. 验证项目详情摘要和 `/finance/receivables` 一致。

## 实施顺序

1. 先做 migration 和后端服务测试。
2. 再补 API controller。
3. 再做 Admin UI。
4. 最后补小程序 handoff 文档和验证记录。

## 风险控制

- 不修改 workflow 推进逻辑。
- 不修改 `payments` 和 `finance_ledger_entries` 事实写入。
- 不引入新依赖。
- 不改 orange 仓库。
- 不执行远端手工数据库变更；migration 是否应用需单独确认。
