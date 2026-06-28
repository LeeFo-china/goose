# 阶段 7：财务对账与运营报表方向计划

日期：2026-06-28

关联文档：

- [2026-06-23-phase3-project-operating-summary.md](./2026-06-23-phase3-project-operating-summary.md)
- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)
- [2026-06-24-phase5-finance-analysis-warning-prd.md](./2026-06-24-phase5-finance-analysis-warning-prd.md)
- [2026-06-28-phase6-receivable-operations-prd.md](./2026-06-28-phase6-receivable-operations-prd.md)

## 背景

阶段 1-6 已经形成装修公司财务系统的核心业务闭环：

- 收款 workflow 能生成应收计划，并在财务确认后写入 `payments`、`project_receivable_allocations` 和 `finance_ledger_entries`。
- 费用审批能完成申请、审批、打款和支出台账。
- 项目经营汇总可以展示合同金额、已收、应收、支出、利润和风险。
- 成本分类、项目预算和风险预警已经具备 Admin 处理入口。
- 应收运营已支持人工新增、调整、取消、跟进和事件追溯。

但当前仍缺少“对账视角”和“运营报表视角”：

- 财务人员需要知道哪些收款有 payment 但没有 ledger，或有 ledger 但没有 allocation。
- 管理者需要按月份、项目、收款类型和费用分类看收入、支出、利润和逾期趋势。
- 费用和应收的异常项需要形成明确清单，而不是散落在多个页面里人工查。
- 微信支付后续接入后，需要有统一对账入口承接支付回调、平台手续费、退款和人工修正。

阶段 7 建议先做“只读对账 + 运营报表 + 异常清单”，不直接做自动会计凭证。

## 目标

1. Admin 提供财务对账页，聚合应收、收款、allocation、ledger 和费用打款的一致性检查。
2. Admin 提供财务运营报表，按日期范围、项目、收款类型、费用分类和项目状态汇总收入、支出、利润、逾期和预算风险。
3. 后端返回异常清单，由后端统一计算异常原因和等级，前端不本地推导对账规则。
4. 所有报表和异常列表必须分页，聚合接口必须限制日期范围，避免全量扫描。
5. 为后续微信支付接入预留 `payment_channel`、`external_trade_no`、`reconciliation_status` 等展示口径，但本阶段不接支付回调。
6. 小程序本阶段无必改；如展示财务运营摘要，只消费后端只读字段。

## 非目标

- 不做微信支付接入、退款、手续费入账或自动分账。
- 不做会计凭证、科目余额表、总账、明细账。
- 不做财务软件导出或第三方 ERP 对接。
- 不做复杂 BI 自定义报表设计器。
- 不做消息推送、短信催收、企业微信提醒。
- 不改变 workflow 推进规则。
- 不允许小程序直接执行对账修正、ledger 修正或应收调整。

## 核心对账对象

| 对象 | 表/来源 | 对账关注点 |
| --- | --- | --- |
| 应收计划 | `project_receivable_plans` | 应收金额、剩余未收、是否逾期、是否取消 |
| 收款事实 | `payments` | 是否确认、金额、凭证、收款时间 |
| 应收核销 | `project_receivable_allocations` | payment 是否分配到 receivable，金额是否匹配 |
| 财务台账 | `finance_ledger_entries` | payment 是否生成入账流水，方向、金额、项目是否一致 |
| 费用申请 | `expense_requests` | 审批、打款、项目和成本分类 |
| 支出台账 | `finance_ledger_entries direction=out` | 费用打款是否生成支出流水，成本分类是否归集 |

## 异常类型

建议统一返回 `exception_code`、`level`、`title`、`description` 和 `action`。

| 异常码 | 等级 | 说明 | 建议处理 |
| --- | --- | --- | --- |
| `receivable_overdue` | `warning` | 应收到期未结清 | 进入应收计划跟进 |
| `payment_without_ledger` | `danger` | 已确认 payment 没有入账流水 | 检查收款写账链路 |
| `ledger_without_payment` | `warning` | 项目收款流水缺少 payment 关联 | 核对历史导入或人工流水 |
| `payment_unallocated` | `warning` | payment 未完全分配到应收计划 | 检查核销分配 |
| `allocation_amount_mismatch` | `danger` | allocation 合计和 payment 金额不一致 | 修正核销数据 |
| `receivable_paid_amount_mismatch` | `danger` | receivable 已收金额和 allocation 合计不一致 | 重算或修复应收 |
| `expense_paid_without_ledger` | `danger` | 已打款费用没有支出台账 | 检查费用打款写账链路 |
| `expense_ledger_without_category` | `info` | 项目支出台账未归集成本分类 | 进入台账补分类 |
| `budget_overrun` | `warning` | 项目或分类预算超支 | 进入项目预算页 |
| `negative_profit` | `danger` | 项目实际利润为负 | 进入经营财务摘要 |

## 后端接口建议

### `GET /finance/reconciliation/exceptions`

用途：财务对账异常列表。

分页：

- `page=1`
- `pageSize=20`
- `pageSize <= 100`

查询参数：

| 参数 | 说明 |
| --- | --- |
| `date_from` / `date_to` | 业务日期范围，最大跨度建议 366 天 |
| `project_id` | 项目筛选 |
| `exception_code` | 异常类型筛选 |
| `level` | `info`、`warning`、`danger` |
| `direction` | `receivable`、`payment`、`expense`、`ledger` |
| `status` | `open`、`resolved`，第一版可只返回 `open` |

返回示例：

```json
{
  "list": [
    {
      "id": "payment-id-or-ledger-id",
      "project_id": "project-id",
      "project_name": "张三项目",
      "exception_code": "payment_without_ledger",
      "level": "danger",
      "title": "确认收款未入账",
      "description": "收款 ¥10,000.00 已确认，但未找到对应项目收款入账流水。",
      "amount": 10000,
      "occurred_at": "2026-06-28T10:00:00.000Z",
      "action": {
        "key": "open_payment",
        "label": "查看收款",
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

### `GET /finance/reports/operating`

用途：财务运营报表。

查询参数：

| 参数 | 说明 |
| --- | --- |
| `date_from` / `date_to` | 日期范围，必填或默认近 30 天 |
| `group_by` | `day`、`month`、`project`、`payment_type`、`cost_category` |
| `project_status` | 项目状态筛选 |
| `project_id` | 项目筛选 |

返回建议：

```json
{
  "summary": {
    "received_amount": 100000,
    "expense_amount": 60000,
    "actual_profit_amount": 40000,
    "receivable_remaining_amount": 30000,
    "overdue_amount": 10000,
    "unallocated_expense_amount": 2000
  },
  "groups": [
    {
      "key": "2026-06",
      "label": "2026-06",
      "received_amount": 100000,
      "expense_amount": 60000,
      "actual_profit_amount": 40000,
      "overdue_amount": 10000
    }
  ]
}
```

### `GET /finance/reconciliation/project/:projectId`

用途：项目详情里的单项目对账摘要。

返回建议：

```json
{
  "project_id": "project-id",
  "receivable_amount": 50000,
  "received_amount": 30000,
  "allocated_amount": 30000,
  "ledger_income_amount": 30000,
  "expense_paid_amount": 10000,
  "ledger_expense_amount": 10000,
  "exception_count": 0,
  "danger_count": 0,
  "warning_count": 0,
  "latest_exception_at": null
}
```

## Admin 对接

建议新增或扩展：

1. 财务总览增加“对账异常”区块：
   - 高风险异常数。
   - 未核销收款金额。
   - 未入账收款数。
   - 未归集支出金额。
2. 新增 `/finance/reconciliation` 页面：
   - 顶部异常统计。
   - 筛选：日期、异常类型、等级、项目。
   - 表格：项目、异常、金额、发生时间、处理入口。
3. 新增 `/finance/reports` 或扩展 `/finance`：
   - 日期范围。
   - group_by 切换。
   - 收入、支出、利润、逾期趋势。
4. 项目详情财务区增加“对账摘要”：
   - 收款、核销、入账是否一致。
   - 支出、台账、成本分类是否一致。

Admin 原则：

- 不在前端计算异常规则。
- 不在前端扫描全量数据。
- 不做本地分页过滤。
- 所有处理入口只跳转到已有页面或后端返回的 `action.target`。

## 小程序对接

本阶段小程序无必改。

小程序继续保持：

- workflow 推进只消费 `workflow_state.actions`、`timeline_nodes[].actions` 和 `/workflow-tasks.actions`。
- 收款确认只调用 `POST /workflow-tasks/:taskId/complete`。
- 不直接调用 `/finance/reconciliation/*` 写接口。
- 不本地计算利润、预算、逾期、对账异常或风险等级。

如后续要给项目经理展示只读摘要，可以由后端另行提供员工侧授权字段，例如：

```json
{
  "finance_reconciliation_summary": {
    "exception_count": 1,
    "highest_level": "warning",
    "latest_exception_title": "存在未归集支出"
  }
}
```

## 实施顺序建议

### Task 1：对账异常服务

- 后端只读计算 `GET /finance/reconciliation/exceptions`。
- 先覆盖 payment、allocation、ledger、receivable 四类收款异常。
- 增加 service 单测，覆盖金额不一致、缺失 ledger、未完全核销、逾期应收。

### Task 2：Admin 对账异常页

- 新增 `/finance/reconciliation`。
- 增加筛选、统计和异常表格。
- 所有筛选走后端分页。

### Task 3：项目对账摘要

- 新增 `GET /finance/reconciliation/project/:projectId`。
- 项目详情财务区展示单项目对账状态。

### Task 4：运营报表接口

- 新增 `GET /finance/reports/operating`。
- 支持日期范围和 `group_by`。
- 查询必须限定日期范围，必要时增加索引 migration。

### Task 5：发布后只读 smoke 和小程序交接

- Admin 验证对账页和报表页。
- API 验证分页、日期范围、异常统计。
- 小程序确认无必改，继续只读 workflow v2。

## 风险与待确认

1. 是否需要“已处理/忽略异常”的状态表。
   - 第一版建议不做，只读计算 open 异常。
   - 如果管理者需要闭环确认，再新增 `finance_reconciliation_exception_actions`。
2. 微信支付接入后，是否需要平台统一商户还是租户独立商户。
   - 该问题会影响后续 `payment_channel` 和 `external_trade_no` 对账口径。
3. 历史人工 ledger 是否都有足够关联字段。
   - 如果历史流水缺少 payment/expense 关联，第一版应归类为 `ledger_without_payment` 或 `manual_ledger`，不要强行修历史数据。
4. 报表是否需要导出。
   - 第一版先不做导出，避免扩大范围。

## 验收标准

- `GET /finance/reconciliation/exceptions` 分页有效，`pageSize <= 100`。
- 异常规则由后端返回，Admin 不本地推导。
- Admin 对账页能按日期、项目、异常类型和等级筛选。
- 项目详情可看到单项目对账摘要。
- `GET /finance/reports/operating` 支持日期范围和至少一种 `group_by`。
- 小程序无必改文档已落地。
