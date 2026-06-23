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
- 已准备受控 smoke workflow 和新建测试项目。
- 已执行 `POST /workflow-tasks/:taskId/complete`。
- 已创建 confirmed payment。
- 已生成并核销 receivable plan。
- 已写入 receivable allocation。
- 已写入 finance ledger。
- 已推进 workflow 到 `end`。
- smoke runtime 和 workflow definition 已归档。

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

初始只读探针结论：当时数据库里没有 `receivable_plan_enabled=true` 的收款节点运行样本，也没有已发布版本样本，因此先补充了可重复 smoke 脚本，再通过 Admin/API 创建受控样本执行完整链路。

## 可重复 smoke 脚本

已补充 API 脚本：

```bash
pnpm --dir apps/api run finance:receivables-phase2-smoke
```

默认只读模式需要：

```bash
GOOES_API_BASE_URL=http://127.0.0.1:3300
FINANCE_RECEIVABLES_SMOKE_EMPLOYEE_TOKEN=<employee token>
```

可选指定项目：

```bash
FINANCE_RECEIVABLES_SMOKE_PROJECT_ID=<project id>
```

只读模式会检查：

- `GET /finance/receivables?page=1&pageSize=20`
- `GET /projects/:projectId/receivables?page=1&pageSize=20`，仅在传入项目时执行。
- `GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=project`
- pending task 的 action 是否包含 `receivable_context`。

如果当前没有启用应收计划的收款 task，脚本返回 `status=sample_missing`，不会写业务数据。

写入模式只允许在受控测试 task 上使用，需要同时传入：

```bash
FINANCE_RECEIVABLES_SMOKE_TASK_ID=<task id>
FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true
FINANCE_RECEIVABLES_SMOKE_COMPLETE_OUTPUT_JSON='{"amount":10000,"paid_at":"2026-06-23T10:00:00.000Z","evidence_images":["<object key>"],"remark":"应收计划二阶段 smoke"}'
```

写入模式会调用：

```http
POST /workflow-tasks/:taskId/complete
```

未传 `FINANCE_RECEIVABLES_SMOKE_ALLOW_WRITE=true` 时，即使传了 `FINANCE_RECEIVABLES_SMOKE_TASK_ID`，脚本也会拒绝执行 complete。

本轮已用 `http://127.0.0.1:3300` 和员工账号 `18800005001` 跑过只读模式，指定项目：

- `54f11aa5-09a8-4410-a9c5-604a7fe9e09c`

脚本返回：

```json
{
  "ok": true,
  "mode": "read_only",
  "candidate": null,
  "checks": [
    { "name": "finance receivables", "ok": true },
    { "name": "project receivables", "ok": true },
    { "name": "workflow tasks", "ok": true }
  ],
  "status": "sample_missing"
}
```

## 完整 E2E 样本条件

完整写入 smoke 需要准备一个受控测试样本：

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

## 完整 E2E 执行记录

本轮通过 Admin/API 创建了独立 smoke workflow 和新测试项目，没有改动正式施工主流程，也没有设为默认施工流程。

测试 workflow：

- definition ID：`64575a74-e932-458c-ba9f-3278d8575491`
- workflow key：`finance_receivable_smoke_20260623173439`
- version ID：`6c6abeeb-a81b-47d8-b373-331ed77cb92a`
- version label：`应收计划二阶段 smoke`
- 图结构：`start -> payment_stage_2 -> end`
- 收款节点配置：
  - `business_kind=payment_collection`
  - `payment_type=stage_2`
  - `receivable_plan_enabled=true`
  - `receivable_amount_mode=fixed_amount`
  - `receivable_fixed_amount=10000`
  - `receivable_due_offset_days=0`

测试项目：

- project ID：`407537b4-2adc-4a0f-ac83-bdaecf70e559`
- 项目名：`应收计划二阶段Smoke项目 20260623173439`
- signed_amount：`50000`

runtime：

- workflow instance ID：`93f16262-038f-4890-bbfc-afe7d1badb05`
- task ID：`a0e5d055-4a6d-4f7e-87aa-f46e35d46561`
- 初始 current node：`payment_stage_2`
- complete 后 current node：`end`
- complete 后 instance status：`completed`

只读脚本在 complete 前已找到候选 task：

```json
{
  "taskId": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561",
  "projectId": "407537b4-2adc-4a0f-ac83-bdaecf70e559",
  "actionKey": "complete",
  "nodeKey": "payment_stage_2",
  "receivablePlanId": "6f46c08d-cb31-4a52-a970-82751b29723b",
  "receivableAmount": 10000,
  "receivableRemainingAmount": 10000,
  "receivableStatus": "pending"
}
```

complete 请求：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "amount": 10000,
    "paid_at": "2026-06-23T09:45:00.000Z",
    "evidence_images": [
      "project_payment/407537b4-2adc-4a0f-ac83-bdaecf70e559/finance-receivables-phase2-smoke.jpg"
    ],
    "remark": "应收计划二阶段 smoke 收款确认"
  }
}
```

complete 返回：

```json
{
  "result": {
    "ok": true,
    "bridged": true,
    "operation": "confirm_payment"
  },
  "payment": {
    "id": "ccded302-396b-4b8e-801c-080098293725",
    "project_id": "407537b4-2adc-4a0f-ac83-bdaecf70e559",
    "amount": 10000,
    "type": "stage_2",
    "status": "confirmed",
    "workflow_task_id": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561",
    "source_type": "workflow_task",
    "source_id": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561",
    "payment_channel": "manual"
  },
  "workflow_state": {
    "instance_id": "93f16262-038f-4890-bbfc-afe7d1badb05",
    "instance_status": "completed",
    "current_node_key": "end",
    "pending_task_count": 0
  }
}
```

应收计划结果：

```json
{
  "id": "6f46c08d-cb31-4a52-a970-82751b29723b",
  "status": "paid",
  "amount": 10000,
  "paid_amount": 10000,
  "project_id": "407537b4-2adc-4a0f-ac83-bdaecf70e559",
  "workflow_instance_id": "93f16262-038f-4890-bbfc-afe7d1badb05",
  "workflow_node_key": "payment_stage_2"
}
```

核销记录：

```json
{
  "id": "6d9adc7a-3276-4157-99ec-6bcd1ed22961",
  "amount": 10000,
  "receivable_plan_id": "6f46c08d-cb31-4a52-a970-82751b29723b",
  "payment_id": "ccded302-396b-4b8e-801c-080098293725",
  "source_type": "workflow_task",
  "source_id": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561"
}
```

财务台账：

```json
{
  "id": "1d03b717-a42f-425c-a116-9d5fc429eeaa",
  "entry_type": "project_payment",
  "direction": "in",
  "amount": 10000,
  "source_type": "workflow_task",
  "source_id": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561",
  "payment_id": "ccded302-396b-4b8e-801c-080098293725",
  "workflow_task_id": "a0e5d055-4a6d-4f7e-87aa-f46e35d46561"
}
```

接口可见性：

- `GET /projects/:projectId/receivables?page=1&pageSize=20`
  - `contract_amount=50000`
  - `receivable_amount=10000`
  - `paid_amount=10000`
  - `remaining_amount=0`
  - plan `status=paid`
- `GET /finance/receivables?page=1&pageSize=20&project_id=:projectId`
  - `pagination.total=1`
  - plan `status=paid`
- `GET /finance/ledger?page=1&pageSize=20&project_id=:projectId`
  - `pagination.total=1`
  - ledger `entry_type=project_payment`

清理：

- runtime 已归档：`archived_at=2026-06-23T09:39:00.991+00:00`
- workflow definition 已归档：`status=archived`
- 未删除 payment、receivable plan、allocation、ledger，保留验收证据。

## 本轮结论

Task 6 完整 E2E 已通过。

本轮验证证明：开启应收计划的 `payment_collection` 节点可以在 task/action 读取时生成应收上下文，财务 complete 后可以创建 confirmed payment、核销 receivable plan、写入 finance ledger，并推进 workflow 到结束节点。

## 小程序端 complete smoke 回填

时间：`2026-06-23`

执行端：`/Users/leefo/Public/work/orange-finance-receivables-phase2`

小程序侧记录：

- `/Users/leefo/Public/work/orange-finance-receivables-phase2/docs/decoration-finance/2026-06-23-phase2-receivables-miniprogram-smoke.md`

执行环境：

- API：`http://192.168.1.15:3000`
- 执行账号：`18800005001` / 小龙女
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`

本次使用后端重新准备的 pending 应收收款样本：

- project ID：`b95f6b51-6b9c-4970-948e-b369106545d8`
- workflow instance ID：`887d9829-0026-4e76-93ad-41f2b474823a`
- task ID：`aa326b7e-89f4-4e11-b7a0-f11ec806f91e`
- receivable plan ID：`48c191ff-022e-4fd7-812b-30632f8d3c7a`
- payment ID：`cc671175-5526-4340-9d1e-0c6bd1998ab0`
- ledger ID：`35efd903-8965-4ecc-bccc-f362d5b48754`
- complete 后 workflow current node：`end`
- receivable plan 状态：`paid`

小程序 complete 请求只提交：

- `amount`
- `paid_at`
- `evidence_images`
- `remark`

小程序未回传 readonly `receivable_context`，符合契约。

complete 响应摘要：

- `result.ok=true`
- `bridged=true`
- `operation=confirm_payment`
- `payment.status=confirmed`

小程序读取确认：

- `/workflow-tasks` action `output_fields` 中可读取 readonly `receivable_context`。
- `/projects/:projectId/employee-detail-bootstrap` current node `attributes` 中可读取应收信息。
- 小程序侧可正常展示应收摘要。

后端只读复核：

- `GET /projects/:projectId/receivables?page=1&pageSize=20`
  - `contract_amount=50000`
  - `receivable_amount=10000`
  - `paid_amount=10000`
  - `remaining_amount=0`
  - plan `status=paid`
- `GET /finance/ledger?page=1&pageSize=20&project_id=:projectId`
  - `pagination.total=1`
  - ledger `entry_type=project_payment`
  - ledger `payment_id=cc671175-5526-4340-9d1e-0c6bd1998ab0`
  - ledger `workflow_task_id=aa326b7e-89f4-4e11-b7a0-f11ec806f91e`
- `GET /workflow-subjects/project/:projectId/state`
  - `instance_status=completed`
  - `current_node_key=end`
  - `actions=[]`

归档：

- workflow definition 已归档：
  - definition ID：`b13e7f1b-0f85-41e6-835c-fb20d6f61510`
  - workflow key：`finance_receivable_miniprogram_smoke_20260623125051`
  - status：`archived`
- runtime 已归档：
  - instance ID：`887d9829-0026-4e76-93ad-41f2b474823a`
  - archived_at：`2026-06-23T13:15:20.921+00:00`
  - archived_by：`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`
  - archive_reason：`小程序应收计划二阶段 complete smoke 已通过，归档临时测试实例`
- 未删除项目、payment、receivable plan、ledger，保留验收证据。

关于 allocation ID：

小程序侧当前可读 API 未返回 allocation ID。`POST /workflow-tasks/:taskId/complete`、`GET /finance/receivables`、`GET /projects/:projectId/receivables`、`GET /finance/ledger` 均不暴露 allocation，allocation 相关只读 GET 路由当前也不存在。

因此本轮小程序 smoke 不强制要求回填 allocation ID。若后续验收必须由小程序回填 allocation ID，需要后端在 complete 响应中返回，或提供受权限保护的只读查询接口。
