# 费用审批与支出付款 Task 0 基线核查

日期：2026-06-23

对应计划：

- [2026-06-23-expense-approval-payment-phase-plan.md](./2026-06-23-expense-approval-payment-phase-plan.md)

## 核查范围

本轮只执行 Task 0：基线核查。

本轮没有创建费用申请，没有提交审批，没有 complete workflow task，没有登记付款，没有调用 COS direct-init，也没有修改数据库。

## 服务状态

- API：`http://127.0.0.1:3000`
- Admin：`http://127.0.0.1:3010`
- launchctl 服务：
  - `local.gooes.api`
  - `local.gooes.admin`

端口检查：

- `3000`：`bun` 正在监听。
- `3010`：`node` 正在监听。

## 登录和租户

核查租户：

- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`
- tenant name：`固始晴天装饰工程有限公司`

本轮使用以下账号做只读探针：

| 账号 | 员工 | 部门/岗位 | 角色 | 费用相关权限 |
| --- | --- | --- | --- | --- |
| `18800000001` | 风清扬 | 行政人事部 / 系统管理员 | `system_admin` | `expense_request.*`、`finance.expense.*`、`employee.permission_manage` |
| `18800001002` | 珠珠 | 市场部 / 销售专员 | `role_39ea3d0e8dae` | `expense_request.read/create/submit` |
| `18800003001` | 欧阳锋 | 工程部 / 工程总监 | `role_d4bd82a376b0` | `expense_request.read/create/submit/approve_manager` |
| `18800003002` | 欧阳克 | 工程部 / 工程监理 | `role_300167d4a224` | `expense_request.read/create/submit` |
| `18800005001` | 小龙女 | 财务部 / 财务经理 | `finance_base` | `expense_request.read/create/submit/approve_finance/pay`、`finance.expense.review/pay` |

结论：

- 申请人、经理审批人、财务审批/付款人测试账号齐备。
- 后续受控 E2E 可以使用：
  - 申请人：`18800001002 / 珠珠` 或 `18800003002 / 欧阳克`
  - 经理审批：`18800003001 / 欧阳锋`
  - 财务审批/付款：`18800005001 / 小龙女`

## Workflow 模板

请求：

```http
GET /workflows?page=1&pageSize=100
GET /workflows/:id/versions?page=1&pageSize=20
GET /workflows/:id/graph?version_id=:activeVersionId
```

结果：

```json
{
  "id": "5ef1c218-8a57-4507-9fb1-cd2ab6432e38",
  "workflow_key": "expense_approval",
  "name": "费用审批流程",
  "status": "active",
  "category": "approval",
  "active_version_id": "67b840e8-e98d-4221-8d68-87a3405ae01b"
}
```

active version：

```json
{
  "id": "67b840e8-e98d-4221-8d68-87a3405ae01b",
  "status": "published",
  "version_label": null,
  "is_active": true,
  "running_instance_count": 0,
  "published_at": "2026-06-16T03:31:29.4435+00:00"
}
```

active graph 节点：

| node key | 标题 | business kind | required permissions |
| --- | --- | --- | --- |
| `start` | 开始 | - | - |
| `manager_review` | 主管审批 | `expense_approval` | `expense_request.approve_manager` |
| `finance_review` | 财务审批 | `expense_approval` | `expense_request.approve_finance` |
| `payment` | 登记打款 | `expense_approval` | `expense_request.pay` |
| `rejected` | 已驳回 | - | - |
| `done` | 已完成 | - | - |

结论：

- `expense_request` 对应的费用审批 workflow 已发布且 active。
- 当前 active version 没有运行中的实例，后续完整 smoke 需要创建新的受控费用申请样本。

## 费用列表和待办

请求：

```http
GET /expense-requests?page=1&pageSize=5
GET /workflow-tasks?page=1&pageSize=10&status=pending&subject_type=expense_request
```

结果摘要：

| 账号 | 费用列表 | pending 费用 task |
| --- | --- | --- |
| 风清扬 | `200`，total=`1` | `200`，total=`0` |
| 珠珠 | `200`，total=`0` | `200`，total=`0` |
| 欧阳锋 | `200`，total=`1` | `200`，total=`0` |
| 欧阳克 | `200`，total=`1` | `200`，total=`0` |
| 小龙女 | `200`，total=`1` | `200`，total=`0` |

现有费用样本：

```json
{
  "id": "464876c4-0693-447f-95a0-670901d47149",
  "request_no": "ER202605291120265052",
  "status": "paid",
  "mode": "reimbursement",
  "total_amount": 500.7,
  "employee": {
    "id": "5d2c906f-635d-4aa0-9a64-16d7edb380c8",
    "name": "欧阳克"
  },
  "project": {
    "id": "634ff402-ff84-4541-aa7c-3cdcd4fd5460",
    "name": "刘德华·信合·湖畔春天1期 E4号楼4001"
  },
  "workflow_state": {
    "instance_id": "0de1fca9-eb0e-4b3b-afa2-a72f9c7af360",
    "instance_status": "completed",
    "current_node_key": "done",
    "current_node_title": "已完成",
    "pending_task_count": 0,
    "actions_count": 0
  },
  "settlement": {
    "id": "0e1cfe00-c17a-4e85-b969-51f84f63e24e",
    "paid_amount": 500.7,
    "method": "wechat",
    "paid_at": "2026-05-29T09:10:22.418+00:00"
  }
}
```

结论：

- `/expense-requests` 分页接口可用，并能返回 `workflow_state`。
- `/workflow-tasks` 可按 `subject_type=expense_request` 查询费用待办。
- 当前没有 pending 费用审批 task，不能直接执行完整 E2E；后续需要创建受控样本。

## 费用支出台账样本

请求：

```http
GET /finance/ledger?page=1&pageSize=20&entry_type=expense_settlement
```

结果：

```json
{
  "status": 200,
  "total": 1,
  "first": {
    "id": "4933fbc1-c5b3-455e-91a6-898d2ca863f2",
    "entry_type": "expense_settlement",
    "direction": "out",
    "amount": 500.7,
    "expense_request_id": "464876c4-0693-447f-95a0-670901d47149",
    "expense_settlement_id": "0e1cfe00-c17a-4e85-b969-51f84f63e24e",
    "project_id": "634ff402-ff84-4541-aa7c-3cdcd4fd5460",
    "occurred_at": "2026-05-29T09:10:22.418+00:00"
  }
}
```

结论：

- 当前库里已有费用付款产生的支出方向台账。
- 这只能证明已有样本数据对齐，不能替代下一步受控 E2E 的幂等验证。

## Admin 页面只读 smoke

执行：

- 登录：`18800000001 / 风清扬`
- 页面：`http://127.0.0.1:3010/expenses`

结果：

```json
{
  "url": "http://127.0.0.1:3010/expenses",
  "heading": "费用审批",
  "action_button_count": 1,
  "detail_menu_visible": true,
  "http_errors": [],
  "console_errors": [],
  "screenshot": "/tmp/gooes-expenses-task0-smoke.png"
}
```

结论：

- Admin `/expenses` 可以打开。
- 费用审批表头和操作入口可见。
- 操作菜单中的“详情”可见。
- 未捕获接口 4xx/5xx。
- 未捕获前端 console error。

## COS direct upload 证据

本轮没有调用 `POST /uploads/cos/direct-init`，避免产生文件对象记录。

代码和文档证据：

- `apps/api/src/controllers/uploads/index.ts` 的 `DIRECT_UPLOAD_SCENES` 包含 `expense_request`。
- `apps/api/src/services/files/platform-file-storage/legacy/shared.ts` 的 `PlatformUploadScene` 包含 `expense_request`。
- `apps/api/src/services/files/platform-file-storage/legacy/paths.ts` 将 `expense_request` 映射到 `expense-request` 对象路径前缀。
- `apps/admin/components/expenses/expense-mutation-shared.ts` 的 `uploadEvidenceImageDirect()` 使用 `scene: "expense_request"`。
- `docs/application_integration_documentation/2026-05-15-admin-expense-request-cos-direct-upload.md` 已记录 Admin 费用审批凭证直传链路。

结论：

- `expense_request` 上传场景在 API、存储服务、Admin 费用凭证上传和历史对接文档中均存在。
- 真实上传和预览应放到后续付款 E2E 中验证。

## 后续受控样本准备

费用分类候选：

| code | name |
| --- | --- |
| `material` | 材料费 |
| `labor` | 人工费 |
| `transport` | 交通费 |
| `accommodation` | 住宿费 |
| `meal` | 餐饮费 |

项目候选：

| project ID | 项目 | 状态 |
| --- | --- | --- |
| `b95f6b51-6b9c-4970-948e-b369106545d8` | 应收小程序联调 Smoke项目 20260623125051 | `constructing` |
| `407537b4-2adc-4a0f-ac83-bdaecf70e559` | 应收计划二阶段Smoke项目 20260623173439 | `signed` |
| `fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` | 郭富城 - 日出东方卓悦3期 1栋305设计项目 | `constructing` |
| `f42bdb7f-5fb6-4213-af3c-7b8fde22b36b` | 古天乐 - 安居保障房小区 7栋502设计项目 | `constructing` |
| `c20e4693-e3a8-47b8-840f-4fb3639d6420` | WF Service Smoke 修复验证可删除 2026-06-17T04:32:24.545Z - workflow E2E 测试小区 1栋1单元101设计项目 | `designing` |

审批模板：

| step | step name | required permission |
| --- | --- | --- |
| `manager_review` | 经理审批 | `expense_request.approve_manager` |
| `finance_review` | 财务审批 | `expense_request.approve_finance` |

建议后续受控 E2E 样本：

- 申请人：`18800001002 / 珠珠`
- 经理审批：`18800003001 / 欧阳锋`
- 财务审批/付款：`18800005001 / 小龙女`
- 费用分类：`material / 材料费`
- 金额：`1000.00`
- 付款方式：`cash` 或 `bank_transfer`
- 凭证上传：`scene=expense_request`
- 项目：优先新建或选定专用 smoke 项目，避免复用已归档应收 smoke 项目。

## Task 0 结论

Task 0 基线核查通过：

- `expense_approval` workflow 已发布且 active。
- 费用列表和费用 workflow task 查询接口可用。
- 当前没有 pending 费用审批 task。
- 费用相关测试账号和权限齐备。
- Admin `/expenses` 只读 smoke 通过。
- `expense_request` COS direct upload 场景存在。
- 已有历史费用样本能和支出台账对齐。

下一步进入 Task 1：

1. 核查费用 workflow task complete 到 `approve/reject/pay` 的桥接契约。
2. 核查付款节点 `output_fields` 是否足够支撑 Admin 和后续小程序。
3. 准备受控费用 E2E 样本，避免直接复用历史已付款样本。
