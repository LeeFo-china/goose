# Phase 7 Task 1 财务对账异常列表 Handoff

日期：2026-06-29

关联计划：

- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)

## 本次范围

本次先落后端只读接口：

```http
GET /finance/reconciliation/exceptions
```

目标是给 Admin 财务对账页提供异常清单和统计。接口不修改业务数据，不推进 workflow，不做自动修复。

第一版覆盖：

- 应收逾期：`receivable_overdue`
- 已确认收款未入账：`payment_without_ledger`
- 收款流水缺少 payment 关联：`ledger_without_payment`
- 收款未完全核销：`payment_unallocated`
- 核销金额超过收款金额：`allocation_amount_mismatch`
- 应收已收金额与核销金额不一致：`receivable_paid_amount_mismatch`

费用打款、成本分类、预算超支和利润类异常后续 Task 再接入。

## 查询参数

| 参数 | 说明 |
| --- | --- |
| `page` | 默认 `1` |
| `pageSize` | 默认 `20`，最大 `100` |
| `date_from` | 业务日期起始，格式 `YYYY-MM-DD` |
| `date_to` | 业务日期结束，格式 `YYYY-MM-DD` |
| `project_id` | 项目筛选 |
| `exception_code` | 异常码筛选 |
| `level` | `info`、`warning`、`danger` |
| `direction` | `receivable`、`payment`、`expense`、`ledger` |
| `status` | 第一版只返回 `open`；传 `resolved` 返回空列表 |

日期范围默认近 30 天，最大跨度 366 天。

## 返回结构

```json
{
  "list": [
    {
      "id": "payment-id-or-plan-id",
      "project_id": "project-id",
      "project_name": "项目名称",
      "exception_code": "payment_without_ledger",
      "level": "danger",
      "direction": "payment",
      "status": "open",
      "title": "确认收款未入账",
      "description": "收款 ¥10,000.00 已确认，但未找到对应项目收款入账流水。",
      "amount": 10000,
      "occurred_at": "2026-06-20T10:00:00.000Z",
      "action": {
        "key": "open_payment",
        "label": "查看应收",
        "target": "/finance/receivables?project_id=project-id"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  },
  "summary": {
    "total": 1,
    "danger": 1,
    "warning": 0,
    "info": 0
  }
}
```

## 权限

允许以下任一权限访问：

- `finance.view`
- `finance.ledger.view`
- `finance.receivable.view`
- `finance.receivable.manage`

接口必须带员工登录态和租户上下文。

## 数据边界

- `project_receivable_plans`、`project_receivable_allocations` 和 `finance_ledger_entries` 按 `tenant_id` 查询。
- `payments` 通过 `projects!inner` 关系按 `project.tenant_id` 限定候选范围，避免跨租户读取。
- 候选数据有源查询上限，返回列表仍按分页输出。

## Admin 对接

Admin 可新增 `/finance/reconciliation` 页面或先在财务总览加入口：

- 顶部展示 `summary.total / danger / warning / info`。
- 表格展示项目、异常、等级、金额、发生时间、处理入口。
- 筛选使用接口参数，不在前端本地过滤分页结果。
- `action.target` 当前指向已有应收或台账页面，第一版不做自动修复按钮。

## 小程序对接

本 Task 小程序无必改。

如后续小程序需要只读展示项目财务异常摘要，必须由后端另行提供项目维度摘要字段或接口；小程序不应根据应收、收款、核销或台账明细在本地推导对账异常。

## 验证

- `bun test ./src/services/finance-reconciliation.test.ts`
- `bun test ./src/services/finance-reconciliation.test.ts ./src/services/project-receivables.test.ts ./src/services/project-receivables-operations.test.ts ./src/services/finance-project-summary.test.ts ./src/services/finance-ledger.test.ts`
- `bun run api:typecheck`
