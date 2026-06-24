# 阶段 4：项目成本预算与利润偏差 PRD

日期：2026-06-24

## 背景

阶段 1-3 已完成项目收款、应收计划、费用支出、财务台账和项目经营汇总。当前利润看板主要基于已发生的收入和支出计算，能回答“已经发生了什么”，但还不能回答：

- 项目原计划花多少钱？
- 当前支出是否超预算？
- 哪类成本正在吞掉利润？
- 管理者是否能在项目亏损前提前预警？

阶段 4 的目标是把财务系统从“流水汇总”推进到“项目经营控制”：项目有预算，支出有分类，利润有偏差，风险能预警。

## 目标

1. 项目可以按成本分类维护预算金额。
2. 费用申请、费用打款和财务台账可以归集到项目成本分类。
3. 财务总览和项目详情可以展示预算成本、已发生支出、预算剩余、实际利润、预测利润和偏差率。
4. Admin 可以发现超预算、毛利低于阈值、逾期未收等经营风险。
5. 小程序如果涉及费用申请，只负责提交后端定义的成本分类，不在本地计算利润。

## 非目标

- 不做完整合同管理。
- 不做采购、库存、供应商结算。
- 不做工资核算或工人计件结算。
- 不做跨项目成本分摊。
- 不做自动会计凭证或财务软件对接。
- 不要求微信支付能力在本阶段接入。

## 角色和权限

| 角色 | 能力 |
| --- | --- |
| 系统管理员 | 配置成本分类、查看所有项目成本和利润 |
| 财务经理 | 配置项目预算、审核费用归集、查看利润偏差 |
| 项目经理 | 查看自己项目预算和支出，发起或补充费用 |
| 工程主管 | 查看施工相关成本分类和项目预算执行情况 |
| 普通施工人员 | 默认不查看利润数据，只在费用申请时选择允许的成本分类 |

建议新增权限码：

| 权限码 | 说明 |
| --- | --- |
| `finance.budget.view` | 查看项目预算和利润偏差 |
| `finance.budget.manage` | 维护项目预算 |
| `finance.cost-category.view` | 查看成本分类 |
| `finance.cost-category.manage` | 管理成本分类 |
| `finance.cost-allocation.manage` | 调整费用和台账的成本分类归集 |

## 成本分类

成本分类是租户级字典，默认初始化一组装修行业常用分类，租户可启用、停用、排序和改名。

建议默认分类：

| code | 名称 | 说明 |
| --- | --- | --- |
| `labor` | 人工 | 工人工费、班组人工 |
| `main_material` | 主材 | 地板、瓷砖、洁具、橱柜等主材 |
| `auxiliary_material` | 辅材 | 水泥、砂石、管线、五金等辅材 |
| `outsourcing` | 外包 | 外包施工或专项服务 |
| `design` | 设计 | 设计相关成本 |
| `management` | 管理费 | 项目管理、现场管理相关费用 |
| `after_sales` | 售后 | 返修、售后服务成本 |
| `other` | 其他 | 无法归入其他分类的成本 |

分类规则：

- `code` 是系统稳定标识，不建议发布后随意修改。
- `name` 是租户展示名，可以修改。
- 停用分类不能再用于新费用申请，但历史数据继续可读。
- 一个项目预算项必须绑定一个成本分类。
- 一笔项目支出原则上必须绑定一个成本分类；确实无法判断时允许进入“待归集”状态，由财务后补。

## 项目预算

项目预算按项目和成本分类维护。

字段建议：

| 字段 | 说明 |
| --- | --- |
| `project_id` | 项目 |
| `cost_category_id` | 成本分类 |
| `budget_amount` | 预算金额 |
| `warning_threshold_percent` | 分类预警阈值，默认 100 |
| `remark` | 备注 |
| `created_by` / `updated_by` | 操作人 |

业务规则：

- 同一项目同一成本分类只能有一个 active 预算项。
- `budget_amount >= 0`。
- 项目预算总额可以小于、等于或大于合同金额，但 Admin 应明确展示预算利润。
- 未维护预算的项目仍可以发生费用，但在利润看板中标记“未配置预算”。
- 修改预算只影响后续展示，不回写历史台账金额。

## 支出归集

阶段 4 不改变“费用申请 -> 审批 -> 打款 -> 财务台账”的主链路，只在链路上增加成本分类归集字段。

归集规则：

1. 创建费用申请时，如果选择了项目，建议选择成本分类。
2. 财务审批或打款前，如果项目费用没有成本分类，应提示“待归集”。
3. 完成打款写入 `finance_ledger_entries` 时，把 `cost_category_id` 写入台账。
4. 已完成台账允许有权限的财务人员调整成本分类，但调整必须记录审计字段。
5. 项目利润汇总以台账的 `direction=out` 且 `project_id` 不为空作为已发生项目支出事实。

## 利润和偏差口径

阶段 4 延续阶段 3 口径，并新增预算维度。

| 指标 | 计算方式 |
| --- | --- |
| 合同金额 | 优先 `projects.signed_amount`，否则 `projects.budget` |
| 已收金额 | `finance_ledger_entries.direction = in` |
| 应收金额 | `project_receivable_plans.amount`，排除 canceled |
| 未收金额 | 应收金额 - 已核销金额 |
| 已发生支出 | `finance_ledger_entries.direction = out` |
| 预算成本 | 项目 active 预算项合计 |
| 预算剩余 | 预算成本 - 已发生支出 |
| 实际利润 | 已收金额 - 已发生支出 |
| 预测利润 | 合同金额 - 预算成本 |
| 当前利润偏差 | 实际利润 - 预测利润 |
| 预算使用率 | 已发生支出 / 预算成本 |
| 预测毛利率 | 预测利润 / 合同金额 |
| 实际毛利率 | 实际利润 / 已收金额 |

展示规则：

- 分母为 0 时，百分比返回 `null`，前端展示 `-`。
- 金额保留两位小数。
- 比率保留 4 位小数，由前端格式化为百分比。
- 未配置预算时，预算相关字段返回 0，并返回 `budget_configured=false`。

## 风险预警

第一版只做只读预警，不做消息推送。

| 预警 | 触发条件 | 严重级别 |
| --- | --- | --- |
| 未配置预算 | 项目无 active 预算项 | info |
| 分类超预算 | 分类支出 > 分类预算 * 阈值 | warning |
| 项目超预算 | 项目支出 > 项目预算 | danger |
| 预测毛利低 | 预测毛利率低于租户阈值，默认 20% | warning |
| 逾期未收 | 存在 overdue 应收计划 | warning |

Admin 展示时不阻断业务操作，只提示风险。

## 后端接口契约

### `GET /finance/cost-categories`

租户成本分类列表。

Query：

- `page=1`
- `pageSize=100`
- `status=active|inactive`

返回字段：

- `id`
- `tenant_id`
- `code`
- `name`
- `status`
- `sort_order`
- `is_system`

### `POST /finance/cost-categories`

创建租户自定义成本分类。

Body：

```json
{
  "code": "custom_cleaning",
  "name": "保洁",
  "sort_order": 90
}
```

### `PATCH /finance/cost-categories/:id`

更新分类名称、状态或排序。

Body：

```json
{
  "name": "现场保洁",
  "status": "active",
  "sort_order": 90
}
```

### `GET /projects/:projectId/cost-budgets`

项目预算列表和按分类支出汇总。

返回：

```json
{
  "list": [
    {
      "id": "budget-id",
      "project_id": "project-id",
      "cost_category_id": "category-id",
      "category_code": "labor",
      "category_name": "人工",
      "budget_amount": 30000,
      "expense_amount": 12000,
      "remaining_amount": 18000,
      "usage_ratio": 0.4,
      "warning_threshold_percent": 100,
      "risk_level": "normal"
    }
  ],
  "summary": {
    "budget_configured": true,
    "budget_amount": 80000,
    "expense_amount": 36000,
    "remaining_amount": 44000,
    "usage_ratio": 0.45
  }
}
```

### `PUT /projects/:projectId/cost-budgets`

批量保存项目预算。

Body：

```json
{
  "items": [
    {
      "cost_category_id": "category-id",
      "budget_amount": 30000,
      "warning_threshold_percent": 100,
      "remark": "人工预算"
    }
  ]
}
```

规则：

- 以项目和成本分类为唯一键 upsert。
- 未出现在 body 中的 active 预算项不自动删除；如需停用，使用单独状态字段或后续接口。
- 所有金额校验在后端完成。

### 扩展 `GET /finance/project-summary`

在阶段 3 返回基础上新增：

- `budget_configured`
- `budget_cost_amount`
- `budget_remaining_amount`
- `budget_usage_ratio`
- `projected_budget_profit_amount`
- `profit_variance_amount`
- `projected_budget_gross_margin`
- `risk_level`
- `risk_flags[]`

### 扩展 `GET /projects/:id/finance-summary`

新增同样预算字段，并返回 `cost_category_breakdown[]`。

## Admin 对接

### 财务总览 `/finance`

新增列：

- 预算成本
- 预算剩余
- 预算使用率
- 预测利润
- 利润偏差
- 风险

新增筛选：

- `risk_level`
- `budget_configured=true|false`

### 项目详情总览

“经营财务摘要”面板新增预算指标和风险提示。

新增“成本预算”面板：

- 按分类展示预算、已支出、剩余、使用率、风险。
- 有 `finance.budget.manage` 权限时可编辑预算。
- 没有预算时展示空状态和“配置预算”入口。

### 费用审批/打款

如果费用绑定项目：

- 表单展示成本分类选择。
- 详情页展示成本分类。
- 打款前若未选择分类，提示“待归集”；第一版不强制阻断。

### 财务台账

新增成本分类列和筛选。

已入账流水允许有权限人员调整成本分类，调整必须审计。

## 小程序对接

阶段 4 对小程序分两种情况：

1. 如果当前小程序费用入口继续使用现有字段，本阶段可以不改代码，但无法做到费用创建时归集成本分类。
2. 如果要让小程序费用申请同步归集成本分类，需要补：
   - 获取成本分类列表。
   - 创建费用申请时提交 `cost_category_id`。
   - 费用详情展示分类名称。

小程序原则：

- 不计算利润。
- 不推导风险。
- 不本地维护成本分类枚举。
- 分类列表和权限以后端返回为准。

## 数据迁移原则

- 所有表、索引、约束、权限初始化必须通过 `supabase/migrations/`。
- 默认成本分类通过 migration 初始化，必须按租户补齐。
- 历史费用和历史台账不强制自动归类，可先显示“待归集”。
- 若后续需要批量归集历史数据，必须单独出受控脚本和验收记录，不能在业务 migration 中隐式改历史事实。

## 验收标准

1. 新建项目后可配置成本预算。
2. 项目费用申请可选择成本分类。
3. 费用打款后，台账能看到成本分类。
4. 财务总览展示预算成本、已支出、预算剩余、预测利润和风险。
5. 项目详情展示分类预算执行情况。
6. 超预算项目出现风险提示。
7. 未配置预算项目显示“未配置预算”，不影响收付款和 workflow 推进。
8. 小程序如未改代码，现有费用流程不被破坏。

## 待确认事项

1. 项目预算由谁首次录入：财务经理、项目经理，还是签约后自动生成初始预算。
2. 费用申请是否必须选择成本分类，还是允许财务后补。
3. 租户是否需要自定义预测毛利率预警阈值。
4. 历史费用是否需要批量归类，还是只从阶段 4 上线后开始归集。
5. 是否需要把成本预算能力下发到小程序项目详情，还是只在 Admin 展示。
