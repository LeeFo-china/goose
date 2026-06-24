# 阶段 4：成本预算与利润偏差小程序对接说明

日期：2026-06-24

关联文档：

- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)
- [2026-06-24-phase4-cost-budget-profit-smoke.md](./2026-06-24-phase4-cost-budget-profit-smoke.md)

## 结论

本阶段小程序端当前不需要改代码。

原因：

- 阶段 4 主要是 Admin/API 侧项目成本预算、成本归集、项目经营利润偏差和风险预警。
- 不新增 workflow action。
- 不改变项目 workflow v2 的 `timeline_nodes`、`node.display`、`node.attributes`、`actions[]` 契约。
- 不改变收款、施工、验收、费用审批的推进方式。
- 小程序不能本地计算预算利润、利润偏差、预算风险或项目经营风险。

orange 仓库保持只读，本次没有修改 `/Users/leefo/Public/work/orange`。

## 当前小程序保持不变的范围

小程序如果当前不在费用申请时选择“成本分类”，可以保持现状：

- 创建费用申请时不传 `cost_category_id`。
- 提交、审批、打款继续按现有 workflow v2/actions 口径。
- 打款后由后端写入支出方向 `finance_ledger_entries`。
- 未归集成本由 Admin 财务台账或费用列表补归集。

后端会把未归集支出计入：

- 项目成本预算的 `unallocated_expense_amount`。
- Admin 经营分析里的预算风险提示。

小程序不需要为了阶段 4 主动读取 Admin 财务汇总接口。

## 如果后续要在小程序费用申请时选择成本分类

适用场景：

- 产品希望员工在小程序提交项目费用时就完成成本归集。
- 希望减少 Admin 后补成本分类的工作量。

小程序需要新增：

### 1. 读取成本分类

接口：

```http
GET /finance/cost-categories?page=1&pageSize=100&status=active
```

权限：

- 后端已允许有 `expense_request.create` 权限的员工读取 active 成本分类。

返回字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 提交费用申请时使用的 `cost_category_id` |
| `code` | 成本分类编码 |
| `name` | 成本分类名称 |
| `status` | 当前只展示 `active` |
| `sort_order` | 展示排序 |

小程序展示建议：

- 只展示 active 分类。
- 按后端返回顺序展示。
- 文案使用 `name`，必要时辅助显示 `code`。
- 不在小程序写死“人工、主材、辅材”等枚举。

### 2. 创建或更新费用申请时提交 `cost_category_id`

创建：

```http
POST /expense-requests
```

可选字段：

```json
{
  "project_id": "项目 ID",
  "cost_category_id": "成本分类 ID 或 null",
  "mode": "project",
  "title": "费用申请标题",
  "items": []
}
```

更新草稿或驳回单：

```http
PATCH /expense-requests/:id
```

可选字段：

```json
{
  "project_id": "项目 ID",
  "cost_category_id": "成本分类 ID 或 null"
}
```

注意：

- `cost_category_id` 是项目费用归集维度，不替代费用明细里的 `category_code/category`。
- 非项目费用可以不传或传 `null`。
- 分类是否有效由后端校验，小程序不要本地兜底。
- 已提交后的费用申请是否允许改分类，以后端当前接口权限和状态校验为准。

### 3. 支出付款后归集口径

费用付款 complete 仍走：

```http
POST /workflow-tasks/:taskId/complete
```

小程序不直接写财务台账。

后端会在付款闭环时把费用申请上的 `cost_category_id` 带入：

- `expense_request_settlements.cost_category_id`
- `finance_ledger_entries.cost_category_id`

如果费用申请没有 `cost_category_id`，支出会进入未归集金额，后续由 Admin 侧补分类。

## 小程序不要做的事

- 不调用 Admin 项目经营汇总接口来渲染小程序经营分析。
- 不本地计算项目利润、预算利润、利润偏差、预算使用率或风险等级。
- 不根据成本分类名称写死业务规则。
- 不绕过 workflow task 直接推进费用审批或付款。
- 不直接写 `finance_ledger_entries`、`project_cost_budgets` 或 settlement。
- 不根据本地枚举决定是否超预算；超预算和风险提示由后端返回。

## 如果未来要在小程序展示项目经营数据

需要单独开 handoff，先确认：

- 员工侧是否允许查看合同额、利润、预算和支出。
- 不同角色能看哪些金额字段。
- 是否需要脱敏或只展示风险状态。
- 使用 Admin 现有接口，还是新增员工侧安全接口。

在契约确认前，小程序不要直接复用 Admin 的 `/finance/project-summary` 或 `/projects/:id/finance-summary`。

## 给小程序团队的话

可以这样同步：

> 本轮 gooes 阶段 4 完成的是 Admin/API 侧项目成本预算、成本归集、利润偏差和风险预警，小程序当前不需要改代码。
>
> 现有费用申请、审批、打款、项目 workflow 继续按 workflow v2/actions 口径执行，不新增 action，也不改变 complete payload。小程序不要本地计算预算利润、利润偏差、预算使用率或风险等级，这些都由后端/Admin 口径负责。
>
> 如果后续产品希望员工在小程序提交项目费用时就选择成本分类，再接入 `GET /finance/cost-categories?page=1&pageSize=100&status=active`，并在 `POST /expense-requests` 或 `PATCH /expense-requests/:id` 里提交可选 `cost_category_id`。不传也兼容，未分类支出会进入 Admin 的未归集成本，由财务后续补归集。
>
> 小程序端不要写死成本分类枚举，不要本地判断超预算，也不要直接写财务台账或预算表。
