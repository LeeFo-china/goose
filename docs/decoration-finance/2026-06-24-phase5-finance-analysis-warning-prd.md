# 阶段 5：经营分析与预算预警闭环 PRD

日期：2026-06-24

关联文档：

- [2026-06-23-phase3-project-operating-summary.md](./2026-06-23-phase3-project-operating-summary.md)
- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)
- [2026-06-24-phase4-post-release-acceptance.md](./2026-06-24-phase4-post-release-acceptance.md)

## 背景

阶段 3 已完成项目经营汇总，阶段 4 已完成成本分类、项目预算、成本归集、利润偏差和基础风险字段。当前系统已经能回答：

- 项目合同金额、已收、待收、支出和利润是多少。
- 项目有没有配置预算。
- 当前是否存在超预算、毛利偏低或应收逾期等风险。

但现阶段还停留在“表格里能看到风险”。管理者还缺少一套稳定闭环：

- 风险项目怎么快速筛出来？
- 每个风险为什么触发，严重程度如何解释？
- 风险应该由财务、项目经理还是主管处理？
- 处理入口在哪里，是补预算、归集成本、催收还是调整项目经营预期？
- 处理后如何确认风险已消除？

阶段 5 的目标是把阶段 4 的只读风险字段推进到“经营分析与预算预警闭环”：后端统一计算风险，Admin 展示、筛选、解释和引导处理，小程序不本地计算财务指标。

## 目标

1. 财务总览支持按风险等级、风险原因、预算配置状态和项目状态筛选项目。
2. 后端返回稳定的 `risk_level`、`risk_flags[]`、`risk_reasons[]` 和处理建议，Admin 不本地推导风险。
3. Admin 可以在项目详情看到风险解释、触发数据、建议处理动作和对应入口。
4. 未归集成本、未配置预算、分类超预算、项目超预算、低毛利、应收逾期等风险能形成可处理闭环。
5. 风险筛选必须由后端执行，并返回正确分页，不允许前端只过滤当前页。
6. 小程序端继续不计算预算、利润和风险；后续如需展示，只消费后端输出的只读摘要。

## 非目标

- 不做微信支付、自动扣款、自动转账或支付回调。
- 不做完整 BI 报表系统。
- 不做会计凭证、科目余额表或财务软件对接。
- 不做消息推送、短信通知、企业微信通知。
- 不做独立“风险工单”表和风险处理审批流；第一版只做计算型风险和处理入口。
- 不改变 workflow 推进规则，不新增 workflow task。
- 不要求小程序本阶段改代码。

## 使用角色

| 角色 | 关注点 | 主要操作 |
| --- | --- | --- |
| 老板/管理者 | 哪些项目正在亏损或可能亏损 | 看风险总览、筛选高风险项目、进入详情追踪 |
| 财务经理 | 预算、支出、应收和利润是否异常 | 归集成本、维护预算、核对应收和支出 |
| 项目经理 | 自己负责项目是否超预算或应收异常 | 查看风险原因、补充预算说明、跟进项目经营动作 |
| 工程主管 | 施工成本和阶段支出是否异常 | 查看分类成本、协同处理材料/人工异常 |
| 小程序员工 | 不参与财务分析 | 后续如开放，只看后端授权后的只读摘要 |

## 风险等级

风险等级继续使用阶段 4 已有枚举：

| `risk_level` | 含义 | 展示建议 |
| --- | --- | --- |
| `normal` | 暂无风险 | 正常 |
| `info` | 信息不完整，需要补齐 | 待配置、待归集 |
| `warning` | 存在经营风险，需要关注 | 预警 |
| `danger` | 已明显超预算或亏损风险高 | 高风险 |

等级合成规则：

- 任一 `danger` 风险触发，则项目 `risk_level=danger`。
- 否则任一 `warning` 风险触发，则项目 `risk_level=warning`。
- 否则任一 `info` 风险触发，则项目 `risk_level=info`。
- 无风险时为 `normal`。

Admin 只展示后端返回的等级和原因，不在前端重新计算。

## 风险原因

阶段 5 建议统一扩展风险原因枚举：

| `risk_flag` | 默认等级 | 触发口径 | 处理方向 |
| --- | --- | --- | --- |
| `budget_missing` | `info` | 项目没有 active 预算项 | 配置项目成本预算 |
| `unallocated_expense` | `info` | 项目存在未绑定成本分类的支出台账 | 在财务台账补成本分类 |
| `category_over_budget` | `warning` | 任一分类支出超过分类预算乘预警阈值 | 检查分类支出或调整预算 |
| `project_over_budget` | `danger` | 项目总支出超过项目总预算 | 复核成本、补预算或管理止损 |
| `low_projected_margin` | `warning` | 预测预算毛利率低于租户阈值，默认 20% | 复核合同金额和预算成本 |
| `receivable_overdue` | `warning` | 存在逾期未核销应收计划 | 催收或核对应收计划 |
| `negative_actual_profit` | `danger` | 已收金额减已付支出小于 0 | 核对收入和支出，优先回款 |
| `negative_projected_profit` | `danger` | 合同金额减预算成本小于 0 | 复核预算或项目报价 |

### `risk_reasons[]`

`risk_flags[]` 只适合机器消费。阶段 5 需要新增面向 UI 的 `risk_reasons[]`，由后端生成。

建议结构：

```json
{
  "code": "project_over_budget",
  "level": "danger",
  "title": "项目已超预算",
  "description": "项目支出 ¥90,000.00 已超过预算 ¥80,000.00。",
  "current_value": 90000,
  "threshold_value": 80000,
  "unit": "money",
  "action": {
    "key": "open_cost_budget",
    "label": "查看成本预算",
    "target": "/projects/:projectId?tab=overview"
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `code` | 稳定风险枚举 |
| `level` | 该风险自身等级 |
| `title` | 简短展示标题 |
| `description` | 后端生成的人类可读说明 |
| `current_value` | 当前值，可为空 |
| `threshold_value` | 触发阈值，可为空 |
| `unit` | `money`、`ratio`、`count`、`boolean` |
| `action` | 建议处理入口，可为空 |

Admin 可以根据 `action.key` 映射到本端页面入口，但不能根据 `title` 或 `description` 反推业务规则。

## 指标口径

阶段 5 延续阶段 3/4 口径，不重新定义财务基础指标。

| 指标 | 来源 |
| --- | --- |
| 合同金额 | 优先 `projects.signed_amount`，否则 `projects.budget` |
| 已收金额 | `finance_ledger_entries.direction = in` |
| 应收金额 | `project_receivable_plans.amount`，排除 canceled |
| 逾期金额/笔数 | 已到期且未核销的应收计划 |
| 已发生支出 | `finance_ledger_entries.direction = out` |
| 预算成本 | 项目 active 预算项合计 |
| 预算剩余 | 预算成本 - 已发生支出 |
| 预算使用率 | 已发生支出 / 预算成本 |
| 预算利润 | 合同金额 - 预算成本 |
| 利润偏差 | 实际利润 - 预算利润 |
| 预测预算毛利率 | 预算利润 / 合同金额 |
| 实际毛利率 | 实际利润 / 已收金额 |
| 未归集成本 | 项目支出台账中 `cost_category_id` 为空的金额 |

分母为 0 时，比率返回 `null`，前端展示 `-`。

## 后端接口契约

### 扩展 `GET /finance/project-summary`

用途：Admin 财务总览和风险项目列表。

必须分页：

- 默认 `page=1&pageSize=20`
- `pageSize` 最大 `100`

新增查询参数：

| 参数 | 说明 |
| --- | --- |
| `risk_level` | `normal`、`info`、`warning`、`danger` |
| `risk_flag` | 指定风险原因，例如 `project_over_budget` |
| `budget_configured` | `true` / `false` |
| `has_unallocated_expense` | `true` / `false` |
| `overdue` | `true` / `false` |
| `min_budget_usage_ratio` | 最小预算使用率，例如 `0.8` |
| `max_projected_budget_gross_margin` | 最大预测预算毛利率，例如 `0.2` |

返回在阶段 4 基础上新增：

```json
{
  "list": [
    {
      "project_id": "project-id",
      "risk_level": "warning",
      "risk_flags": ["low_projected_margin", "receivable_overdue"],
      "risk_reasons": [
        {
          "code": "low_projected_margin",
          "level": "warning",
          "title": "预算毛利偏低",
          "description": "预测预算毛利率 12.00%，低于阈值 20.00%。",
          "current_value": 0.12,
          "threshold_value": 0.2,
          "unit": "ratio",
          "action": {
            "key": "open_cost_budget",
            "label": "查看成本预算",
            "target": "/projects/project-id?tab=overview"
          }
        }
      ],
      "unallocated_expense_amount": 1000
    }
  ],
  "summary": {
    "project_count": 20,
    "risk_count": 6,
    "risk_level": "danger",
    "risk_counts": {
      "normal": 14,
      "info": 1,
      "warning": 3,
      "danger": 2
    },
    "risk_flag_counts": {
      "budget_missing": 1,
      "project_over_budget": 2,
      "receivable_overdue": 3
    },
    "unallocated_expense_amount": 1000
  },
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 20,
    "totalPages": 1
  }
}
```

后端要求：

- 风险筛选必须在后端执行，不能由 Admin 对当前页本地过滤。
- `pagination.total` 必须反映筛选后的总数。
- 查询必须避免 N+1，继续复用批量聚合查询。
- 列表查询必须限定字段和分页范围。

### 扩展 `GET /projects/:id/finance-summary`

用途：Admin 项目详情经营风险解释。

新增：

- `risk_reasons[]`
- `unallocated_expense_amount`
- `cost_category_breakdown[]`，如果阶段 4 尚未返回完整分类明细，则阶段 5 补齐。

`cost_category_breakdown[]` 建议字段：

| 字段 | 说明 |
| --- | --- |
| `cost_category_id` | 成本分类 ID，可为空表示未归集 |
| `category_code` | 成本分类 code |
| `category_name` | 成本分类名称 |
| `budget_amount` | 分类预算 |
| `expense_amount` | 分类支出 |
| `remaining_amount` | 分类剩余 |
| `usage_ratio` | 分类使用率 |
| `warning_threshold_percent` | 分类预警阈值 |
| `risk_level` | 分类风险等级 |
| `risk_reasons[]` | 分类级风险说明 |

### 可选新增 `GET /finance/risk-options`

用途：Admin 获取风险筛选项。

如果不想在前端硬编码风险枚举和文案，可提供只读接口：

```json
{
  "levels": [
    { "key": "normal", "label": "正常", "order": 10 },
    { "key": "info", "label": "待配置", "order": 20 },
    { "key": "warning", "label": "预警", "order": 30 },
    { "key": "danger", "label": "高风险", "order": 40 }
  ],
  "flags": [
    {
      "key": "project_over_budget",
      "label": "项目超预算",
      "level": "danger",
      "order": 40
    }
  ]
}
```

第一版也可以先由 Admin 维护本地展示文案，但风险计算和返回仍以后端为准。

## Admin 对接

### 财务总览 `/finance`

新增筛选：

- 风险等级
- 风险原因
- 预算状态：全部、已配置、未配置
- 是否有未归集成本
- 是否有逾期应收

新增汇总卡片：

- 高风险项目数
- 预警项目数
- 未配置预算项目数
- 未归集成本金额
- 逾期应收金额

列表展示：

- 风险等级 badge。
- 风险原因摘要，最多展示 2 条，更多用“+N”。
- 预算使用率。
- 预算剩余。
- 未归集成本金额。
- 处理入口：查看项目、查看预算、查看台账、查看应收。

### 项目详情总览

“经营财务摘要”面板新增风险解释区：

- 顶部展示项目整体风险等级。
- 展示 `risk_reasons[]`，每条包含标题、说明、当前值、阈值和建议入口。
- 未归集成本要能直接跳转到财务台账，并带项目筛选。
- 未配置预算要能跳转到成本预算面板。
- 逾期应收要能跳转到应收摘要或应收计划明细。

“成本预算”面板增强：

- 分类预算行展示分类风险原因。
- 未归集成本作为独立提示，不混入任一成本分类。
- 预算使用率高于阈值时使用后端返回的 `risk_level` 展示。

### 财务台账

已有成本分类调整能力的基础上，阶段 5 需要强化：

- 支持筛选 `cost_category_id=null` 的未归集支出。
- 从项目详情风险入口跳转时，自动带上项目和未归集筛选。
- 调整成本分类后，返回项目详情应看到风险刷新。

### 应收管理

阶段 5 不重做应收计划，但需要保证：

- 逾期风险可以跳转到项目应收摘要或应收明细。
- 应收被核销后，项目经营摘要的 `receivable_overdue` 风险消失。

## 小程序对接

本阶段小程序端暂无必改。

小程序约束继续保持：

- 不计算预算。
- 不计算利润。
- 不计算风险等级。
- 不维护风险枚举和成本分类枚举。
- 不根据项目状态、workflow 节点名或本地规则推导财务风险。

后续如产品希望小程序展示项目经营风险，应另行确认员工侧权限和字段范围。建议只读消费后端新契约：

- `risk_level`
- `risk_reasons[]`
- `budget_usage_ratio`
- `unallocated_expense_amount`

员工侧默认不展示利润金额和毛利率，除非权限明确允许。

## 权限

阶段 5 建议沿用阶段 4 权限，并补充展示边界：

| 权限 | 能力 |
| --- | --- |
| `finance.view` | 查看财务总览和风险汇总 |
| `finance.budget.view` | 查看预算和预算风险 |
| `finance.budget.manage` | 编辑项目预算 |
| `finance.ledger.view` | 查看台账和未归集支出 |
| `finance.cost-allocation.manage` | 调整台账成本分类 |
| `finance.receivable.view` | 查看应收和逾期风险 |

无财务权限但有项目访问权限的员工，最多读取自己项目的有限经营摘要；是否展示金额类风险由后续员工侧产品决策确认。

## 数据和配置

第一版不新增风险任务表。

建议新增或复用租户配置：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `finance.projected_margin_warning_ratio` | `0.2` | 预测预算毛利率低于该值触发预警 |
| `finance.budget_usage_warning_ratio` | `1` | 项目预算使用率超过该值触发项目超预算 |
| `finance.category_budget_warning_ratio` | 读取分类预算项阈值 | 分类超预算优先使用预算项自身阈值 |

如果当前系统设置模块已支持租户配置，阶段 5 使用配置项；否则第一版可先在 service 中使用默认常量，并在后续实施计划中评估是否补 migration。

## 验收标准

### API

- `GET /finance/project-summary?page=1&pageSize=20&risk_level=warning` 返回分页数据，`pagination.total` 正确。
- `GET /finance/project-summary?risk_flag=project_over_budget` 只返回触发该风险的项目。
- `GET /finance/project-summary?budget_configured=false` 能筛出未配置预算项目。
- `GET /finance/project-summary?has_unallocated_expense=true` 能筛出存在未归集支出的项目。
- `GET /projects/:id/finance-summary` 返回 `risk_reasons[]` 和 `unallocated_expense_amount`。
- 风险原因由后端返回，Admin 不本地推导。
- 列表接口分页，`pageSize` 最大 `100`。

### Admin

- 财务总览可按风险等级、风险原因、预算状态、未归集成本和逾期状态筛选。
- 风险汇总卡片与列表筛选结果一致。
- 项目详情能展示风险解释和建议处理入口。
- 从未归集成本风险能跳转财务台账并定位项目未归集支出。
- 成本分类归集或预算配置更新后，项目风险能刷新。
- 页面无前端 console error，无接口 4xx/5xx。

### 小程序

- 本阶段小程序不需要改代码。
- 如小程序执行只读 smoke，只需确认现有 workflow、费用申请、收款流程不受影响。

## Smoke 样本建议

至少准备 4 类样本：

| 样本 | 目的 |
| --- | --- |
| 未配置预算项目 | 验证 `budget_missing` 和预算配置入口 |
| 有未归集支出的项目 | 验证 `unallocated_expense` 和台账归集入口 |
| 分类或项目超预算项目 | 验证 `category_over_budget` / `project_over_budget` |
| 有逾期应收项目 | 验证 `receivable_overdue` 和应收入口 |

如果现有数据不满足样本条件，必须通过受控业务接口或 migration seed 准备测试数据，禁止手工在远端数据库直接修数据。

## 实施拆分建议

1. 后端：扩展风险枚举、`risk_reasons[]` 生成和项目详情分类 breakdown。
2. 后端：扩展 `/finance/project-summary` 查询参数和后端分页筛选。
3. Admin：财务总览风险筛选、风险汇总卡片和列表风险说明。
4. Admin：项目详情风险解释区、未归集成本和应收/预算处理入口。
5. Smoke：准备样本，完成 API/Admin 发布前验收，补小程序只读影响说明。

## 风险和边界

- 如果风险筛选在前端本地做，会导致分页总数错误，必须避免。
- 如果 Admin 根据风险标题或节点名称推导动作，后续文案变化会破坏交互；必须使用后端 `action.key`。
- 未归集成本会影响预算风险判断，项目详情必须单独展示，不应悄悄归入“其他”。
- 利润和毛利率属于敏感财务信息，员工侧开放前必须先确认权限边界。
- 第一版不做风险工单，避免把财务分析阶段扩大成消息和流程系统。
