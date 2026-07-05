# Phase 8 财务报表与月度结账 PRD

日期：2026-06-30

## 背景

Phase 1-7 已完成装修项目财务主链路：

- workflow 收款确认、项目收款台账和应收计划核销。
- 费用审批、费用打款和支出台账。
- 项目经营汇总、成本预算、利润偏差和风险提示。
- 应收运营、财务对账异常、人工修正、修正审计和对账运营统计。

当前系统已经能回答“单个项目当前收了多少、花了多少、哪里不一致”。下一阶段应从单据闭环进入财务经营管理：按月份、项目、人员和成本分类形成稳定报表，并通过结账快照锁定历史口径。

## 目标

1. 给财务主管提供月度经营报表：收入、支出、毛利、应收、未收、异常和预算偏差。
2. 给老板/管理者提供项目经营排行：项目利润、毛利率、回款风险、成本超支。
3. 给财务提供月度结账快照：结账后历史报表不因后续单据修正而静默变化。
4. 支持 CSV/XLSX 导出，满足线下对账和会计归档。
5. 保持 workflow、应收、台账、费用和对账异常的 source of truth 不变，报表只做聚合和快照。

## 非目标

- 不做正式会计总账、凭证字号、科目余额表。
- 不替代企业外部财务软件。
- 不做自动纳税申报。
- 不做自动结账或自动锁单据。
- 不在小程序端计算财务指标。
- 不直接接微信支付，支付接入单独设计。

## 角色

| 角色 | 需要解决的问题 | 能力 |
| --- | --- | --- |
| 财务主管 | 月底收入支出是否对得上 | 查看月度报表、生成结账快照、导出 |
| 老板/经营管理者 | 哪些项目赚钱或亏损 | 查看项目经营排行和利润趋势 |
| 项目经理 | 自己负责项目是否有回款或成本风险 | 只读项目摘要，可选后续小程序展示 |
| 系统管理员 | 配置报表权限和查看结账记录 | 授权、审计、异常排查 |

## 核心概念

### 报表口径

报表必须基于后端聚合，不允许 Admin 或小程序本地扫描分页数据。

建议第一版口径：

- 收入：`finance_ledger_entries.direction=in` 且 `entry_type=project_payment`。
- 支出：`finance_ledger_entries.direction=out`，包含费用打款、手工支出和后续可扩展支出类型。
- 应收：`project_receivable_plans`。
- 已核销：`project_receivable_allocations`。
- 成本分类：`finance_ledger_entries.cost_category_id`。
- 对账异常：`GET /finance/reconciliation/exceptions` 计算结果和 action state。

### 结账快照

结账快照是报表结果的历史固化，不回写业务事实。

建议表：

```text
finance_closing_periods
```

字段建议：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID |
| `tenant_id` | 租户 |
| `period_month` | 结账月份，格式 `YYYY-MM` |
| `status` | `draft` / `closed` / `reopened` |
| `closed_at` | 结账时间 |
| `closed_by_employee_id` | 结账人 |
| `reopened_at` | 反结账时间 |
| `reopened_by_employee_id` | 反结账人 |
| `snapshot_json` | 结账时的报表汇总 |
| `notes` | 备注 |
| `created_at` / `updated_at` | 审计时间 |

约束：

- 同一租户同一月份只能有一个 active closing period。
- `closed` 后不阻止业务单据修正，但报表必须清晰标记“当前实时数据”和“结账快照”差异。
- 反结账必须要求权限和原因，并写审计。

## 报表能力

### 1. 月度经营总览

接口建议：

```http
GET /finance/reports/monthly-overview?month=2026-06
```

返回：

- 本月收入
- 本月支出
- 毛利
- 毛利率
- 应收总额
- 已收总额
- 未收总额
- 逾期应收金额
- 对账异常数量
- 未归集支出金额
- 成本预算偏差
- 是否已结账
- 结账快照摘要

### 2. 项目经营排行

接口建议：

```http
GET /finance/reports/project-ranking?date_from=2026-06-01&date_to=2026-06-30&page=1&pageSize=20&sort_by=gross_profit&sort_order=desc
```

支持筛选：

- 日期范围
- 项目状态
- 项目经理
- 设计师
- 客户来源
- 是否有对账异常
- 是否有逾期应收
- 是否超预算

返回字段：

- 项目 ID / 项目名
- 签约金额
- 收入
- 支出
- 毛利
- 毛利率
- 已收比例
- 逾期金额
- 对账异常数量
- 风险标签

分页要求：

- 默认 `page=1&pageSize=20`
- `pageSize <= 100`
- 排序必须由后端执行。

### 3. 成本分类报表

接口建议：

```http
GET /finance/reports/cost-category-summary?date_from=2026-06-01&date_to=2026-06-30
```

返回：

- 成本分类 ID / 名称
- 支出金额
- 占比
- 涉及项目数量
- 未归集金额

### 4. 应收回款报表

接口建议：

```http
GET /finance/reports/receivable-aging?as_of=2026-06-30
```

返回：

- 未到期
- 逾期 1-7 天
- 逾期 8-30 天
- 逾期 31-60 天
- 逾期 60 天以上
- 项目明细入口

### 5. 导出

接口建议：

```http
POST /finance/reports/exports
```

请求：

```json
{
  "report_type": "monthly_overview",
  "format": "xlsx",
  "filters": {
    "month": "2026-06"
  }
}
```

第一版可以同步生成并返回下载链接；如果数据量变大，再引入异步导出任务。

导出必须：

- 校验权限。
- 限定租户。
- 记录导出审计。
- 禁止导出超出权限范围的数据。

## Admin 对接

建议新增菜单：

```text
财务管理 / 财务报表
```

页面建议：

1. 顶部月份/日期范围筛选。
2. 总览指标区：收入、支出、毛利、应收、逾期、异常。
3. Tab：
   - 月度总览
   - 项目排行
   - 成本分类
   - 应收账龄
   - 结账记录
4. 结账操作：
   - 生成草稿快照
   - 确认结账
   - 反结账
   - 查看实时数据与结账快照差异
5. 导出按钮：
   - 按当前筛选导出
   - 导出前确认数据范围

UI 原则：

- 报表页面以表格和指标为主，避免营销式大卡片。
- 所有列表后端分页。
- 筛选项由后端返回或使用稳定字典。
- 金额、比例、异常数量必须有明确口径说明。

## API 与权限

新增权限建议：

| 权限 | 用途 |
| --- | --- |
| `finance.reports.read` | 查看财务报表 |
| `finance.reports.export` | 导出财务报表 |
| `finance.closing.manage` | 生成结账、确认结账、反结账 |
| `finance.closing.read` | 查看结账记录 |

所有接口必须：

- 使用租户上下文。
- 分页接口必须分页。
- 日期范围默认限制在 366 天内。
- 大范围聚合必须有索引或 RPC，并按必要字段查询。
- 错误通过 `error-factory.ts` 包装。

## 小程序边界

第一版小程序无必改。

如果后续项目经理需要看自己项目的经营摘要，建议只返回员工授权范围内的只读字段：

```json
{
  "finance_operating_summary": {
    "income_amount": 100000,
    "expense_amount": 72000,
    "gross_profit_amount": 28000,
    "gross_profit_rate": 0.28,
    "overdue_receivable_amount": 0,
    "exception_count": 1,
    "risk_level": "warning"
  }
}
```

小程序不得：

- 本地计算利润。
- 本地扫描台账。
- 展示未授权项目的财务数据。
- 执行结账、反结账或导出。

## 实施阶段建议

### Task 0：基线核查

- 盘点现有财务报表接口和 Admin 页面。
- 确认 `finance_ledger_entries`、`project_receivable_plans`、`project_receivable_allocations`、`project_cost_budgets` 的索引是否支撑按日期/项目聚合。
- 确认角色权限中是否已有可复用的财务报表权限。

### Task 1：月度经营总览 API

- 新增月度总览 service/repository。
- 增加单测覆盖收入、支出、毛利、应收、异常计数。
- 保持只读。

### Task 2：项目经营排行 API + Admin 列表

- 后端分页排序。
- Admin 表格展示项目排行和风险标签。

### Task 3：成本分类报表和应收账龄

- 成本分类聚合。
- 应收账龄分桶。

### Task 4：结账快照

- migration 新增结账表。
- API 支持生成草稿、确认结账、反结账。
- 写审计记录。

### Task 5：导出

- CSV/XLSX 导出。
- 导出审计。
- Admin 下载入口。

### Task 6：发布后 smoke 和交接

- API 聚合口径 smoke。
- Admin 页面只读 smoke。
- 结账写操作受控 smoke。
- 小程序无必改回执。

## 验收标准

1. 月度总览能按月份返回收入、支出、毛利、应收、逾期、异常数量。
2. 项目排行分页、筛选、排序由后端完成。
3. 成本分类报表金额能与支出台账按分类汇总一致。
4. 应收账龄分桶能与应收计划状态一致。
5. 结账快照能保存当时汇总，后续实时数据变化不覆盖快照。
6. 反结账必须有原因和审计。
7. 导出只包含当前权限范围内的数据。
8. Admin 无 console error，API 无 4xx/5xx。
9. 小程序无必改文档已落地。

## 风险

- 历史数据缺失成本分类会影响成本报表，需要沿用 Phase 7 对账异常提醒，不应隐式补分类。
- 结账后业务仍可修正，必须清楚区分“实时报表”和“结账快照”。
- 报表查询容易变成大表聚合，必须先做索引/RPC 评估。
- 导出可能带来权限和数据泄漏风险，第一版要限制范围和记录审计。
