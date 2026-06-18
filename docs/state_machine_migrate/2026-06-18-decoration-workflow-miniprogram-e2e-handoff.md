# 装修 workflow 小程序端对接执行单

日期：2026-06-18

## 目的

本文给 orange 小程序团队执行装修 workflow 联调使用。gooes 后端/Admin 已按
`docs/state_machine_migrate/2026-06-17-decoration-workflow-business-spec.md`
完成三条业务轨道、财务门禁、工序日志门禁和 task-center workflow 兼容；小程序
端需要按 workflow-only 口径完成剩余端到端验收并回填证据。

本文只写入 gooes 仓库。`/Users/leefo/Public/work/orange` 只读参考，gooes 不修改
orange 代码。

## 当前状态

已通过：

- 财务收款 workflow smoke 已由 orange 完成并回填。
- `/workflow-tasks?status=pending` 可作为 workflow 待办主入口。
- `/task-center/todos` 已兼容 `customer_followup`、`project_payment`、
  `project_workflow` 三类 workflow 待办。
- `workflow_task:*` 待办会带 `action_label`、`metadata.workflow_actions[]`、
  `workflow_task_id`、`workflow_instance_id` 和当前节点业务语义。

仍需 orange 联调验收：

- 客户设计 workflow。
- 项目签约 workflow。
- 施工工序日志 workflow。
- 阶段验收联动。
- Admin 财务台账与 workflow 可见性。

门禁状态以
`docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`
为准。

## 小程序仓库只读核查结果

本次只读核查确认 orange 已有以下基础能力：

| 模块 | 当前能力 | 还需确认 |
| --- | --- | --- |
| `src/services/workflow_task.ts` | 已封装 `/workflow-tasks`、subject state、timeline、complete | `list()` 调用必须继续透传 `status`、`subject_type`、`subject_id` |
| `src/services/task_center.ts` | 已将 workflow tasks 映射成 `customer_followup`、`project_payment`、`project_workflow` | 项目 tab 必须能看到收款和项目流程待办，不只看 `project_log` |
| `src/packageTasks/pages/index/index.tsx` | 已能按待办类型跳转客户/项目页面 | 确认 `project_payment`、`project_workflow` 点击后进入可处理页 |
| `src/packageCustomers/pages/followUpEdit/index.tsx` | 写跟进后已接入 workflow complete 路径 | 验收写跟进后客户状态推进和待办消失 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | 已从 `workflow_state.actions` 刷新动作 | 无 actions 时不得 fallback 到旧状态动作 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts` | 已通过 workflow task complete 提交项目动作/收款动作 | 验收签约金额、开工日期、工程负责人必填错误处理 |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | 创建施工日志后 complete workflow task | complete 失败时不得重复创建日志 |
| `src/services/project_payment.ts` | direct upload 已带 `scene=project_payment` 和 `project_id` | 继续保持凭证上传携带 `projectId` |

## 总体对接口径

小程序所有可执行按钮只来自：

```http
GET /customers/:id
GET /customers/:id/detail
GET /projects/:projectId/employee-detail-bootstrap
GET /workflow-subjects/:subjectType/:subjectId/state
GET /workflow-tasks?page=1&pageSize=20&status=pending
```

任务中心可继续使用兼容入口：

```http
GET /task-center/todos?page=1&pageSize=20&type=customer_followup&status=pending
GET /task-center/todos?page=1&pageSize=20&type=project_payment&status=pending
GET /task-center/todos?page=1&pageSize=20&type=project_workflow&status=pending
```

完成任务统一调用：

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

`action` 必须使用后端返回的 `actions[].key` 或
`metadata.workflow_actions[].key`，不能使用本地旧状态动作或 `business_action`
替代。

## 本地 smoke 鉴权和租户上下文

`/workflow-tasks`、`/workflow-subjects`、项目详情、客户详情等业务接口的租户
上下文来自服务端员工身份绑定，不来自 `X-Tenant-Id` 请求头。

后端实际链路：

```text
Authorization Bearer token -> JWT sub -> employees.user_id -> employee.tenant_id
```

因此，小程序本地 smoke 必须使用已绑定员工身份的 token。即使 token claim 中带有
`tenant_id`，业务接口仍会按 `sub` 反查员工和租户；从 claim 取 `tenant_id` 后追加
`X-Tenant-Id` 不能修复 `TENANT_CONTEXT_REQUIRED`。

### 推荐本地 curl 登录

本地 gooes `.env.local` 已开启：

```bash
AUTH_PHONE_LOGIN_WITHOUT_CODE=true
```

可用员工手机号直接换取本地 smoke token。示例：

```bash
BASE_URL=http://192.168.1.4:3000

TOKEN=$(
  curl -sS -X POST "$BASE_URL/admin/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"phone":"18800005001","code":""}' \
  | jq -r '.data.token'
)
```

请求业务接口只需要传：

```http
Authorization: Bearer <employee-token>
Content-Type: application/json
```

不要依赖 `X-Tenant-Id`。后端当前不会用该 header 为 workflow 业务接口构造租户
上下文。

### token 自检

先验证当前 token 是否是员工租户 token：

```bash
curl -sS "$BASE_URL/admin/auth/me" \
  -H "Authorization: Bearer $TOKEN" \
| jq '.data | {user_id, tenant, employee, roles, permissions}'
```

通过条件：

- `.data.tenant.id` 有值。
- `.data.employee.id` 有值。
- 员工状态可用。

再验证 workflow 待办：

```bash
curl -sS "$BASE_URL/workflow-tasks?page=1&pageSize=5&status=pending" \
  -H "Authorization: Bearer $TOKEN" \
| jq '.data | {pagination, list}'
```

### 小程序真机 token 要求

小程序侧继续走自身员工登录链路，关键是最后用于 workflow 请求的 token 必须是
`/auth/verify-role` 返回的员工 token：

```http
POST /auth/verify-role
Authorization: Bearer <current-auth-or-visitor-token>
Content-Type: application/json

{
  "phone": "18800005001",
  "target_role": "employee",
  "code": ""
}
```

取响应中的 `data.token` 调 `/workflow-tasks`、`/workflow-subjects`、项目详情和
complete 接口。

### 403 排查口径

| 现象 | 含义 | 小程序处理 |
| --- | --- | --- |
| `403 TENANT_CONTEXT_REQUIRED` | 当前 token 的 `sub` 没有反查到员工租户上下文 | 重新走员工登录或改用 `/admin/auth/login` 本地 smoke token，不追加 `X-Tenant-Id` 兜底 |
| `403 FORBIDDEN` 或普通无权限 | 已有租户上下文，但账号无权限或 task 不可见 | 换对应负责人/财务/经理账号，或让后端检查待办分配 |
| `200` 且 `list=[]` | 鉴权正常，但当前账号没有 pending 待办 | 继续准备测试数据或让后端回传当前待办负责人 |
| `401 TOKEN_INVALID` / `TOKEN_EXPIRED` | token 无效或过期 | 重新登录获取 token |

本轮 orange 报告中的 `GET /workflow-tasks?...` 返回
`TENANT_CONTEXT_REQUIRED`，按上述链路判断为临时 token 未绑定员工租户上下文，不是
`status=pending`、分页参数或 `X-Tenant-Id` 参数问题。

### 2026-06-18 鉴权 smoke 回传

orange 已按上述口径重新 smoke：

- `POST /admin/auth/login`，`phone = 18800005001`，返回 `200` 并拿到员工登录
  token。
- `GET /admin/auth/me` 返回 `200`，确认
  `tenant.id = 3eebca47-961f-4899-b976-a3d3208d326b`、
  `employee.id = bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`、
  `employee.name = 小龙女`。
- `GET /workflow-tasks?page=1&pageSize=5&status=pending` 返回 `200`，
  `pagination.total = 8`，本页 `5` 条 pending task，且任务包含
  `actions[].key`。

结论：员工登录 token 下 workflow 接口租户上下文正常，前端可以继续按
`actions[].key` 执行后续 5 个场景联调。

注意：本次只完成鉴权和待办列表 smoke，仍未执行
`POST /workflow-tasks/:taskId/complete`，没有推进真实业务数据，不能计入 5 个
业务场景验收通过证据。

### 2026-06-18 真实 complete 回传

orange 已继续按 `actions[].key` 执行真实 complete，并回填外部文档：

```text
/Users/leefo/Public/work/orange/docs/state_machine_migrate/2026-06-18-decoration-workflow-miniprogram-e2e-execution.md
```

已通过：

- `customer_design_workflow`
- customer ID：`016eccf5-a22c-4c18-a4c1-974647b4d6d3`
- workflow instance ID：`c6a97a55-94fb-40e7-91c5-f9b7b9edab55`
- 执行账号：`18800001002` / 珠珠
- 后端只读核验：workflow instance 已 `completed`，当前 `end`，pending task 为
  `0`。

`GET /customers/:id/detail` 的 `customer.status` 仍为 `designing` 是预期结果：
新版客户设计 workflow 的业务终点是设计完成，客户签约不再由 `customer_main`
推进；项目签约必须进入独立 `project_signing` workflow。

当前阻塞：

| 场景 | 现象 | 后端结论 |
| --- | --- | --- |
| `project_signing_workflow` | 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` complete 返回 `409 WORKFLOW_INSTANCE_REBUILD_REQUIRED` | 该项目仍在旧 `construction_main/designing` running 实例；dry-run 已确认可重建到 `project_signing/designing`，正式 apply 前必须先完成业务确认门禁 |
| `construction_procedure_log` | 项目 `d382cd45-9141-476e-a7a5-5bf88d0a3255` 当前 `procedure_tiling`，但 `/project-logs` 返回旧阶段门禁 `请先完成水电后再进入瓦工` | 后端已定位为旧 `create_project_log_fast` RPC 与 workflow source-of-truth 冲突；已改为 workflow guard 放行后 direct insert |
| `construction_procedure_log` | 项目 `54f11aa5-09a8-4410-a9c5-604a7fe9e09c` 当前 `procedure_plumbing_electrical`，但 `/project-logs` 返回旧阶段门禁 `当前水电阶段待验收` | 同上，修复后需小程序重新 smoke |
| `stage_acceptance_transition` | 因施工日志创建被阻塞，未进入 complete 后刷新 `acceptance_action` 阶段 | 依赖施工日志场景重新 smoke |

## 字段映射

| 后端字段 | 小程序用途 |
| --- | --- |
| `workflow_state.actions[]` | 详情页可执行按钮来源 |
| `/workflow-tasks[].actions[]` | 任务中心和兜底动作来源 |
| `/task-center/todos[].metadata.workflow_actions[]` | 旧任务中心兼容动作来源 |
| `actions[].task_id` | complete 路径参数 |
| `actions[].key` | complete body 的 `action` |
| `actions[].label` | 按钮/待办文案 |
| `business_domain = customer_status` | 客户设计 workflow 动作 |
| `business_domain = workflow_project` | 项目签约/施工主线动作 |
| `business_domain = payment_collection` | 收款门禁动作 |
| `output_fields[].type = number` | 数字输入，例如 `signed_amount` |
| `output_fields[].type = date` | 日期输入，例如 `start_date` |
| `output_fields[].type = employee` | 员工选择，例如工程负责人 |
| `output_fields[].type = payment_collection` | 收款确认表单 |
| `output_fields[].type = project_log` | 施工日志创建/选择 |

## 业务场景对接

### 1. 客户设计 workflow

主线：

```text
客户线索 -> 跟进 -> 到店 -> 设计 -> 结束
```

对接要求：

1. 客户详情或跟进页读取 `workflow_state.actions`。
2. 写跟进记录成功后，重新拉取客户详情或
   `GET /workflow-subjects/customer/:customerId/state`。
3. 找到 `business_domain = customer_status`、`business_action = start_following`
   的 action。
4. 调用 `POST /workflow-tasks/:taskId/complete`。
5. complete 成功后刷新客户详情、客户列表缓存和任务中心。

不得把写跟进记录等同于 workflow 已推进。写跟进成功但 complete 失败时，保留跟进
记录并提示“跟进已保存，客户状态未推进，请刷新后重试”。

### 2. 项目签约 workflow

主线：

```text
设计中 -> 方案确认 -> 项目签约 -> 设计定稿 -> 排期开工 -> 结束
```

对接要求：

| 当前节点 | action 语义 | output |
| --- | --- | --- |
| `designing` | 确认方案 | `{}` |
| `proposal_confirmed` | 项目签约 | `{ "signed_amount": number }` |
| `signed` | 设计定稿 | `{}` |
| `design_finalized` | 排期开工 | `{ "start_date": "YYYY-MM-DD", "construction_manager_employee_id": uuid }` |
| `pending_start` | 确认开工 | `{}` |

后端会兜底校验：

- 缺 `signed_amount` 时拒绝项目签约。
- 缺 `start_date` 或 `construction_manager_employee_id` 时拒绝排期开工。
- 如果模板插入 `payment_collection`，未确认收款不得越过收款节点。

### 3. 财务收款 workflow

识别条件：

- `business_domain = payment_collection`
- 或 `business_action = confirm_payment`
- 或 `output_fields[].type = payment_collection`

提交要求：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 10000,
    "paid_at": "2026-06-18T10:00:00.000Z",
    "evidence_images": ["object-key"],
    "remark": "收款备注"
  }
}
```

凭证上传 direct-init 必须带：

- `scene = project_payment`
- `project_id = <projectId>`

已通过 smoke 的项目：

- project ID：`d382cd45-9141-476e-a7a5-5bf88d0a3255`
- task ID：`03f6bce9-8d48-4753-8c15-dd36e8aa65a9`
- payment ID：`5859aec7-a8a8-474b-83d8-ba420bf1555d`
- ledger ID：`aeaa8344-b5aa-4494-868d-1268520ae58f`

### 4. 施工工序日志 workflow

识别条件：

- `node_type = procedure`
- 或 `output_fields[].type = project_log`

调用顺序：

1. 从 action 读取 `stage_code`、`min_image_count` 和字段名。
2. 上传施工图片，数量至少满足 `min_image_count`。
3. 调用 `POST /project-logs` 创建施工日志。
4. 取返回的 `project_log_id`。
5. 调用 `POST /workflow-tasks/:taskId/complete`。

complete 示例：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "project_log_id": "created-project-log-id",
    "image_count": 2,
    "images": ["project-log/object-key-a", "project-log/object-key-b"]
  }
}
```

如果后端返回 `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED`，小程序保留已填内容，提示
补齐施工日志或图片，不本地推进节点。

### 5. 阶段验收联动

工序 complete 成功后，小程序不能直接本地创建验收单。正确顺序：

1. complete 工序 workflow task。
2. 刷新 `GET /projects/:projectId/employee-detail-bootstrap` 或
   `GET /projects/:projectId/construction-stages`。
3. 从 `construction_stages.stages[].acceptance_action` 读取入口。
4. 只有 `acceptance_action.enabled = true` 且 `type = create/edit/view` 时展示
   对应按钮。
5. 如果已有 `acceptance_id`，进入已有验收单，不重复创建。

## 禁止事项

- 不从 `status_actions`、`status-transitions`、`ProjectStatusActionItem` 生成按钮。
- 不通过 `PATCH /projects/:id { status }` 推进项目。
- 不在 complete 成功前本地修改客户或项目状态。
- 不从 `action_label` 反推动作 key。
- 不跳过 `payment_collection` 门禁。
- 不把 `pause_project`、`resume_project`、`mark_invalid` 当主线节点。
- 不手工改远端数据库状态。

## 错误处理

| 错误 | 小程序处理 |
| --- | --- |
| `WORKFLOW_TASK_NOT_PENDING` / 409 | 刷新详情和任务中心，按已处理或节点变化提示 |
| `WORKFLOW_NODE_NOT_CURRENT` | 刷新 workflow state，不重复提交旧 task |
| `WORKFLOW_PAYMENT_COLLECTION_BLOCKED` | 展示后端 message，引导财务确认收款 |
| `WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED` | 保留日志/图片表单，提示补齐资料 |
| action 缺 `task_id` | 不 fallback 到旧接口，记录响应给后端排查 |
| complete 网络失败 | 保留表单内容，允许刷新后重试 |

## 本轮 orange 需要交付的证据

请小程序团队按下面格式回填到 orange 文档，并同步给 gooes：

| 场景 | 必填证据 |
| --- | --- |
| `customer_design_workflow` | customer ID、instance ID、task ID、complete 请求日志、完成后状态、待办消失截图或日志 |
| `project_signing_workflow` | project ID、`project_signing` instance ID、签约金额失败/成功日志、排期开工失败/成功日志、施工 workflow instance ID |
| `construction_procedure_log` | project ID、procedure node_key、task ID、project_log ID、图片数量、complete 成功日志 |
| `stage_acceptance_transition` | project_acceptance ID、stage_code、刷新后的 `acceptance_action`、创建/提交/复核/客户确认日志 |
| `admin_finance_and_workflow_visibility` | Admin 项目详情、workflow 状态、财务台账或 ledger 可见证据 |

gooes 侧门禁文件：

```text
docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

每个通过场景必须在 `orange_e2e_acceptance_gate.required_scenarios[]` 中标记：

```json
{
  "key": "customer_design_workflow",
  "status": "passed",
  "evidence": "docs/state_machine_migrate/...",
  "external_evidence": "/Users/leefo/Public/work/orange/docs/..."
}
```

## 验收命令

gooes 收到证据并回填门禁后运行：

```bash
cd apps/api
bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

在业务确认旧实例 apply、人工恢复决策和全部 orange E2E 证据完成前，该命令失败是
预期行为。

## 关联文档

- `docs/state_machine_migrate/orange-workflow-handoff.md`
- `docs/state_machine_migrate/2026-06-17-customer-follow-up-workflow-miniprogram-handoff.md`
- `docs/state_machine_migrate/miniprogram-payment-collection-node-integration.md`
- `docs/state_machine_migrate/miniprogram-procedure-construction-log-integration.md`
- `docs/state_machine_migrate/miniprogram-procedure-stage-acceptance-integration.md`
- `docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md`
- `docs/decoration-finance/2026-06-18-payment-workflow-smoke-backend-handoff.md`
