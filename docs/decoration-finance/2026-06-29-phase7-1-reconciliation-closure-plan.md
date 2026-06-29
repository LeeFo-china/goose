# Phase 7.1 财务对账异常闭环计划

日期：2026-06-29

关联文档：

- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)
- [2026-06-29-phase7-post-release-smoke-handoff.md](./2026-06-29-phase7-post-release-smoke-handoff.md)

## 背景

Phase 7 已完成只读对账异常列表、运营报表和项目对账摘要。当前异常是实时计算结果，不保存处理状态，也不允许前端本地标记“已处理”。

Phase 7.1 建议聚焦“异常处理闭环”，让财务人员可以对只读异常做确认、备注、忽略和追溯，但仍不自动修账。

## 目标

1. 对账异常支持 `open`、`acknowledged`、`ignored`、`resolved` 四类处理状态。
2. 所有处理动作必须后端落审计记录，Admin 只提交动作，不本地改状态。
3. 异常处理不改变 `payments`、`project_receivable_plans`、`project_receivable_allocations` 或 `finance_ledger_entries` 的业务数据。
4. 支持按项目、异常类型、等级、处理状态和处理人筛选。
5. 小程序仍无必改，不参与异常处理。

## 非目标

- 不做自动修账。
- 不做会计凭证。
- 不做微信支付自动对账。
- 不做复杂 BI 报表设计器。
- 不允许小程序处理异常。

## 数据模型建议

新增 migration 管理异常处理记录表：

```sql
create table finance_reconciliation_exception_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  exception_fingerprint text not null,
  exception_code text not null,
  subject_type text not null,
  subject_id uuid null,
  project_id uuid null,
  action text not null,
  remark text null,
  actor_employee_id uuid null,
  created_at timestamptz not null default now()
);

create index idx_finance_reconciliation_exception_actions_tenant_fingerprint
  on finance_reconciliation_exception_actions (tenant_id, exception_fingerprint, created_at desc);

create index idx_finance_reconciliation_exception_actions_tenant_project
  on finance_reconciliation_exception_actions (tenant_id, project_id, created_at desc);
```

`exception_fingerprint` 由后端按异常类型和业务对象生成稳定值，例如：

- `payment_without_ledger:{payment_id}`
- `ledger_without_payment:{ledger_id}`
- `receivable_overdue:{receivable_id}`
- `allocation_amount_mismatch:{payment_id}`

## API 建议

### `GET /finance/reconciliation/exceptions`

扩展返回字段：

```json
{
  "id": "payment-id",
  "exception_fingerprint": "payment_without_ledger:payment-id",
  "status": "open",
  "last_action": null,
  "last_action_at": null,
  "last_action_remark": null,
  "last_actor_employee_name": null
}
```

新增查询参数：

- `status=open|acknowledged|ignored|resolved`
- `actor_employee_id`

### `POST /finance/reconciliation/exceptions/:fingerprint/actions`

请求：

```json
{
  "action": "acknowledge",
  "remark": "已联系财务复核，等待人工流水补关联"
}
```

动作：

- `acknowledge`：确认已知晓，异常仍可追踪。
- `ignore`：标记忽略，适合历史人工流水。
- `resolve`：标记处理完成，只表示人工确认闭环，不自动修账。
- `reopen`：重新打开异常。

权限：

- 查看：`finance.view` 或 `finance.ledger.view`
- 处理：建议新增或复用 `finance.reconciliation.manage`

## Admin 对接

1. 对账异常页增加状态筛选。
2. 表格增加处理状态、最后处理人、最后处理时间。
3. 行操作增加“确认”“忽略”“标记已处理”“重新打开”。
4. 操作弹窗必须要求填写备注，至少 2 个字符。
5. 项目详情对账摘要可展示未处理异常数和最近处理记录。

Admin 原则：

- 不本地推导处理状态。
- 不直接修改财务业务表。
- 所有动作只调用后端 action API。
- 操作成功后刷新当前页数据。

## 小程序对接

Phase 7.1 小程序仍无必改。

如后续需要项目经理只读提示，后端可在员工项目详情返回：

```json
{
  "finance_reconciliation_summary": {
    "open_exception_count": 1,
    "highest_level": "warning",
    "latest_exception_title": "存在未归集支出"
  }
}
```

小程序只展示字段，不计算风险、不处理异常。

## 实施顺序建议

1. Task 1：migration 新增异常处理记录表和索引。
2. Task 2：后端生成稳定 `exception_fingerprint`，并把最新处理状态 merge 到异常列表。
3. Task 3：新增异常处理 action API 和 service 单测。
4. Task 4：Admin 对账异常页增加状态筛选和处理弹窗。
5. Task 5：项目详情对账摘要补未处理异常状态。
6. Task 6：发布后只读和处理动作 smoke，记录审计证据。

## 验收标准

- 异常列表分页仍有效，`pageSize <= 100`。
- 同一异常在刷新后保持稳定 fingerprint。
- 处理动作写入审计记录，不修改 payment、receivable、allocation、ledger。
- Admin 能筛选 open/ignored/resolved。
- 权限不足用户不能处理异常。
- 小程序无必改文档已同步。
