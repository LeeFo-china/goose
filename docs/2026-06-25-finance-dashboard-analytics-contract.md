# 财务驾驶舱 analytics 口径

日期：2026-06-25

## 背景

admin 财务总览已从“纯列表汇总”升级为“卡片 + 图表 + 诊断”工作区。为了避免前端用当前分页列表伪造排行，后端在 `GET /finance/project-summary` 返回 `analytics` 字段，专门承载图表趋势、重点项目排行和口径说明。

## 接口

`GET /finance/project-summary`

原分页字段保持不变：

- `list`：当前分页项目明细。
- `pagination`：当前分页信息。
- `summary`：当前筛选范围的汇总指标。

新增：

- `analytics.scope.project_count`：参与 analytics 分析的项目总数。
- `analytics.scope.project_limit`：本次 analytics 最多分析的项目数，当前为 `100`。
- `analytics.scope.truncated`：项目总数超过 `project_limit` 时为 `true`。
- `analytics.scope.trend_days`：趋势窗口天数，当前为 `30`。
- `analytics.trends[]`：近 30 天财务流水趋势。
- `analytics.rankings`：重点项目 topN。

## analytics.trends

字段：

- `date`
- `income_amount`
- `expense_amount`
- `net_cash_flow_amount`

口径：

- 基于 analytics 项目范围内的 `finance_ledger_entries`。
- 只统计 `occurred_at >= 最近 30 天起始日期` 的流水。
- `direction = in` 计入收入。
- `direction = out` 计入支出。
- `net_cash_flow_amount = income_amount - expense_amount`。

## analytics.rankings

当前返回 4 组排行，每组最多 5 条：

- `high_risk`：高风险项目。
- `unallocated_expense`：未归集成本项目。
- `overdue_receivable`：逾期应收项目。
- `low_margin`：预算毛利偏低项目。

每条字段：

- `project_id`
- `project_name`
- `project_status`
- `value`
- `helper`
- `risk_level`
- `target`

`target` 是 admin 可直接跳转的处理入口。

## 性能边界

analytics 不返回全量项目列表，当前最多分析 100 个项目。若 `scope.truncated = true`，前端必须提示“当前排行基于前 100 个匹配项目”，不能宣称为全量排行。

列表接口仍必须分页，不能为了图表或排行取消分页。

## 前端使用建议

- 总览页图表使用 `summary` + `analytics.trends`。
- 诊断页重点项目使用 `analytics.rankings`。
- 当前页表格只展示 `list`，不要从 `analytics.rankings` 反向拼表格。
- 空数据时展示“暂无图表数据 / 当前视图暂无重点项目”，不要渲染空白图表。
