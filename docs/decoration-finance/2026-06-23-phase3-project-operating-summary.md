# 阶段 3：项目经营汇总和利润看板

日期：2026-06-23

## 结论

阶段 3 已按只读经营看板落地，范围聚焦项目维度的收入、应收、支出、利润和逾期风险。

本阶段没有新增表结构，也没有改 workflow 推进规则；数据来源继续使用已有项目、应收计划和财务台账。

## 后端接口

### GET `/finance/project-summary`

用途：Admin 财务总览项目经营列表。

分页：必须分页，默认 `page=1&pageSize=20`，最大 `pageSize=100`。

查询参数：

| 参数 | 说明 |
| --- | --- |
| `page` | 页码 |
| `pageSize` | 每页数量 |
| `keyword` | 项目名称模糊搜索，或项目 ID 精确搜索 |
| `status` | 项目状态筛选 |

权限：需要 `finance.view`、`finance.ledger.view`、`finance.receivable.view` 或 `finance.receivable.manage` 任一权限。

返回摘要字段：

| 字段 | 说明 |
| --- | --- |
| `contract_amount` | 合同口径金额，优先项目 `signed_amount`，否则使用 `budget` |
| `receivable_amount` | 应收计划总额，不含已取消计划 |
| `received_amount` | 财务台账收入合计 |
| `receivable_remaining_amount` | 应收剩余未收金额 |
| `overdue_amount` / `overdue_count` | 逾期未收金额和笔数 |
| `expense_paid_amount` | 财务台账支出合计 |
| `actual_profit_amount` | 已收金额 - 已付支出 |
| `projected_profit_amount` | 合同金额 - 已付支出 |
| `net_cash_flow_amount` | 当前等同实际利润 |
| `actual_gross_margin` | 实际利润 / 已收金额 |
| `projected_gross_margin` | 预测利润 / 合同金额 |
| `ledger_entry_count` | 项目关联财务流水数量 |

### GET `/projects/:id/finance-summary`

用途：Admin 项目详情总览页经营财务摘要。

权限：

- 有财务汇总权限时可读取本租户项目。
- 无财务汇总权限时，需要具备该项目的 `project.read` 访问权限。

## Admin 对接

已完成：

- `/finance` 从重定向页改为财务总览。
- 支持项目关键词和项目状态筛选。
- 顶部展示当前页合同额、已收、支出、实际利润和逾期摘要。
- 列表展示项目、状态、合同、已收、待收、支出、实际利润、实际毛利率、逾期和项目详情入口。
- 项目详情总览页新增“经营财务摘要”面板。
- 原“应收摘要”面板保留，继续作为应收计划明细入口。

## 小程序影响

本阶段不要求小程序改代码。

原因：

- 阶段 3 是 Admin 财务经营分析能力，不新增 workflow action。
- 不改变收款 complete payload。
- 不改变项目详情 workflow v2 的 `timeline_nodes/display/attributes/actions` 契约。
- 小程序如未来需要展示经营财务摘要，应由后端另行确认是否开放员工侧接口和字段权限；不能直接复用 Admin 权限口径。

## 验证记录

### API smoke

服务：`http://127.0.0.1:3000`

账号：`18800005001 / 小龙女`

结果：

```json
{
  "tenant": "固始晴天装饰工程有限公司",
  "list_total": 11,
  "list_page_size": 5,
  "keyword_total": 1,
  "first_project_id": "b95f6b51-6b9c-4970-948e-b369106545d8",
  "first_project_name": "应收小程序联调 Smoke项目 20260623125051",
  "first_contract_amount": 50000,
  "first_received_amount": 10000,
  "first_expense_paid_amount": 0,
  "detail_actual_profit_amount": 10000,
  "detail_ledger_entry_count": 1
}
```

覆盖：

- `POST /admin/auth/login` 返回员工 token。
- `GET /admin/auth/me` 返回员工和租户上下文。
- `GET /finance/project-summary?page=1&pageSize=5` 返回分页、列表和摘要。
- `GET /finance/project-summary?keyword=b95f6b51-6b9c-4970-948e-b369106545d8` 返回目标项目。
- `GET /projects/b95f6b51-6b9c-4970-948e-b369106545d8/finance-summary` 返回项目经营摘要。

### Admin smoke

服务：`http://127.0.0.1:3010`

账号：`18800000001 / 风清扬`

结果：

- `/finance` 渲染“财务总览”。
- 财务总览可见项目经营列表和“当前页实际利润”指标。
- `/finance?keyword=b95f6b51-6b9c-4970-948e-b369106545d8` 可按项目 ID 精确搜索。
- `/projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview` 渲染“经营财务摘要”和“应收摘要”。
- 未发现前端 console error。
- 未发现接口 4xx/5xx。

## 验证命令

```bash
bun test ./src/services/finance-project-summary.test.ts
bun run typecheck
pnpm --dir apps/admin check
```
