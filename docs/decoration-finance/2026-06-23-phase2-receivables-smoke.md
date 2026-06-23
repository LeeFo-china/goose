# 第二阶段应收计划 Smoke 记录

日期：2026-06-23

分支：`feat/finance-receivables-phase2`

worktree：`/Users/leefo/Public/work/gooes/.worktrees/finance-phase2-receivables`

## 验收范围

本轮对应第二阶段 Task 6：端到端验收和验收记录。

已验证内容：

- 新增应收计划接口可访问。
- 员工登录和租户上下文正常。
- 项目应收摘要接口可访问。
- workflow pending 任务接口可访问。
- 只读探针确认当前库中没有可执行完整应收核销链路的样本。

未执行内容：

- 未执行 `POST /workflow-tasks/:taskId/complete`。
- 未创建新的 payment / ledger / receivable allocation。
- 未推进任何已有 workflow task。
- 未修改数据库业务数据。

## 服务

为避免影响主工作区已有的 3000 / 3010 服务，本轮使用第二阶段 worktree 临时启动 API：

- API：`http://127.0.0.1:3300`
- 环境：读取 `/Users/leefo/Public/work/gooes/.env.local`
- 本地 smoke 专用：`JWT_SECRET=local-smoke-secret`

`GET /health` 返回 `401 TOKEN_MISSING`，说明服务可达且鉴权插件正常拦截未登录请求。

## 登录和租户上下文

请求：

- `POST /admin/auth/login`
- 账号：`18800005001`

结果：

- 返回登录成功。
- `GET /admin/auth/me` 返回员工和租户上下文。

关键结果：

```json
{
  "employee": {
    "id": "bbab0193-43ae-4b7a-a7f3-24314e0f2e0d",
    "name": "小龙女"
  },
  "tenant": {
    "id": "3eebca47-961f-4899-b976-a3d3208d326b",
    "name": "固始晴天装饰工程有限公司"
  }
}
```

## 应收计划列表

请求：

- `GET /finance/receivables?page=1&pageSize=20`

结果：

```json
{
  "total": 0,
  "item_count": 0
}
```

结论：接口可用，当前租户还没有已生成的应收计划。

## 项目应收摘要

请求：

- `GET /projects/54f11aa5-09a8-4410-a9c5-604a7fe9e09c/receivables?page=1&pageSize=5`

结果：

```json
{
  "summary": {
    "contract_amount": 156000,
    "receivable_amount": 0,
    "paid_amount": 0,
    "remaining_amount": 0,
    "overdue_amount": 0,
    "overdue_count": 0
  },
  "total": 0,
  "item_count": 0
}
```

结论：项目摘要接口可用；该项目尚未生成第二阶段应收计划。

## Workflow 待办

请求：

- `GET /workflow-tasks?page=1&pageSize=20&status=pending`

结果：

```json
{
  "total": 3,
  "item_count": 3,
  "first": {
    "id": "2f6b4827-7562-4767-81c9-0e7ecf746368",
    "node_key": "signed",
    "actions_count": 1
  }
}
```

结论：workflow task 列表接口可用；当前返回样本不是启用应收计划的收款节点。

## 样本可用性探针

只读探针 1：pending project task。

结果：

```json
{
  "pending_project_tasks_checked": 4,
  "enabled_pending_payment_collection_tasks": []
}
```

只读探针 2：草稿收款节点。

结果：

```json
{
  "payment_collection_nodes_checked": 100,
  "receivable_enabled_nodes": []
}
```

只读探针 3：已发布 workflow version 快照。

结果：

```json
{
  "published_versions_checked": 57,
  "receivable_enabled_published_nodes": []
}
```

结论：当前数据库里没有 `receivable_plan_enabled=true` 的收款节点运行样本，也没有已发布版本样本。因此本轮不能执行完整的“收款节点 complete -> 自动生成应收计划 -> 创建/复用收款 -> 核销应收 -> 写财务台账 -> 推进 workflow”链路。

## 完整 E2E 继续条件

需要先准备一个受控测试样本：

- 项目有有效 `signed_amount`。
- 项目 workflow 当前节点为 `payment_collection`。
- 当前节点快照或已发布版本配置：
  - `receivable_plan_enabled=true`
  - `receivable_amount_mode=fixed_amount` 或 `signed_amount_percentage`
  - 固定金额或百分比配置有效。
  - `receivable_due_offset_days` 有效。
- 当前 pending task 分配给可确认收款的财务账号，或任务权限包含 `finance.payment.confirm`。
- 准备收款凭证 object key，或者使用已有测试凭证。

准备完成后，完整 smoke 应验证：

- `GET /workflow-tasks?status=pending` 返回对应 task，`actions[].output_fields[]` 包含 `receivable_context`。
- `POST /workflow-tasks/:taskId/complete` 返回 200。
- 生成或复用 `project_receivable_plans`。
- 生成或复用 `payments`。
- 写入 `project_receivable_allocations`。
- 写入 `finance_ledger`。
- 收款节点状态变为 `done`，下一节点变为 `current`。
- Admin `/finance/receivables` 和项目详情应收摘要可见。
- 小程序只读 `workflow v2` 的 `timeline_nodes[].attributes` 和 `actions[].output_fields`，不本地推导应收状态。

## 本轮结论

Task 6 已完成只读 smoke 和验收记录。

完整 E2E 推进未执行，阻塞原因是当前没有启用应收计划的收款节点样本。该阻塞不是接口错误，也不是小程序对接问题；需要先由 Admin 发布带 `receivable_plan_enabled=true` 的收款节点版本，并准备一个进入该节点的测试项目。
