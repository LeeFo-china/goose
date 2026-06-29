# Phase 7.1 对账异常闭环验收记录

日期：2026-06-29

分支：`feat/finance-reconciliation-closure`

## 范围

本轮完成对账异常闭环动作能力：

- 新增 `finance_reconciliation_exception_actions` 审计动作表 migration。
- 新增 `finance.reconciliation.manage` 权限。
- 对账异常列表返回稳定 `exception_fingerprint`、`subject_type`、`subject_id`、处理状态和最近处理信息。
- 支持 `POST /finance/reconciliation/exceptions/:fingerprint/actions` 写入闭环动作。
- 支持按 `status` 和 `actor_employee_id` 筛选异常列表。
- 项目对账摘要新增 open/acknowledged/ignored/resolved 分桶和最近处理信息。
- Admin 对账异常页新增处理状态、处理人筛选、行内处理弹窗。
- Admin 项目详情对账摘要展示最近处理记录。

## 关键契约

- 闭环动作只写入 `finance_reconciliation_exception_actions`。
- 不修改 `payments`、`project_receivable_plans`、`project_receivable_allocations`、`finance_ledger_entries`。
- `exception_fingerprint` 由后端生成，格式为 `exception_code:subject_id`。
- 客户端提交 action 时必须 URL encode fingerprint。
- 处理人筛选在后端合并“每个异常最新动作”之后执行。

## 已验证

API：

```bash
bun test src/services/finance-reconciliation.test.ts
pnpm --dir apps/api check
```

结果：

- `financeReconciliationService` 9 个用例通过。
- API typecheck 通过。
- API build 通过。
- API file size check 通过。

Admin：

```bash
bun test components/finance/finance-reconciliation-utils.test.ts components/projects/project-finance-reconciliation-summary-utils.test.ts
pnpm --dir apps/admin check
```

结果：

- Admin helper 5 个用例通过。
- Admin file size check 通过。
- Admin typecheck 通过。

通用：

```bash
git diff --check
```

结果：通过。

## 未执行

本轮尚未对实际数据库执行 migration，也未在真实 Admin 页面提交闭环动作。

待发布或本地联调前需要先应用 migration：

```bash
supabase migration up
supabase migration list
```

应用后再执行真实 smoke：

1. 使用具备 `finance.reconciliation.manage` 的员工登录 Admin。
2. 打开 `/finance/reconciliation`。
3. 选择一条未处理异常，点击“处理”。
4. 提交 `acknowledge`，填写备注。
5. 刷新列表，确认该行进入“已确认”。
6. 使用 `status=acknowledged` 筛选，确认该异常可查到。
7. 打开对应项目详情，确认对账摘要显示最近处理人、处理时间和备注。
8. 核对原始收款、应收、核销、台账数据未被修改。

## 风险与后续

- 如果生产角色中没有 `finance_base`，migration 只会给存在的 `system_admin` 和 `finance_base` 授权；缺失角色需要由租户管理员在角色权限页分配 `finance.reconciliation.manage`。
- 当前处理人筛选使用员工 ID 精确筛选；后续可独立优化为员工选择器。
- `resolved` 表示人工闭环已记录，不代表后端已经修复财务原始数据。
