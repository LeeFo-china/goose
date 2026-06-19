# Workflow 迁移小程序对接说明

## 目的

状态机迁移后，小程序不能再把项目按钮和页面推进状态强绑定到旧字段：

- `status`
- `status_label`
- `status_actions`
- `current_step`

项目详情的旧 `status_actions` 兼容出口已经移除。新版本小程序必须读取
`workflow_state` 和 workflow task/action；项目推进、收款闸门、工序施工日志都
必须通过 `/workflow-tasks/:taskId/complete` 完成。

## 发布顺序

1. 小程序先完成项目详情、工地详情、任务中心的 workflow action 接入。
2. 小程序发布新版本，项目推进按钮只来自 `workflow_state.actions` 或
   `/workflow-tasks`。
3. 联调确认水电工序后的中期收款节点不会被跳过。
4. Orange/小程序侧提供发布版本、联调记录和验收人，写入
   `docs/state_machine_migrate/audit/manual-gates.json`。
5. 后端再执行旧状态机数据库对象的破坏性清理 migration。

## 通用字段

后端在客户、项目、费用审批相关响应中使用：

```json
{
  "workflow_state": {
    "subject_type": "project",
    "subject_id": "uuid",
    "instance_id": "uuid",
    "instance_status": "running",
    "current_node_key": "construction_start",
    "current_node_title": "排期开工",
    "current_business_kind": "construction_start",
    "pending_task_count": 1,
    "actions": [
      {
        "key": "complete",
        "label": "项目签约",
        "task_id": "uuid",
        "node_key": "proposal_confirmed",
        "node_type": "task",
        "business_domain": "workflow_project",
        "business_action": "proposal_confirmed",
        "requires_reason": false,
        "disabled": false,
        "output_fields": [
          {
            "name": "signed_amount",
            "label": "签约金额",
            "type": "number",
            "required": true
          }
        ]
      }
    ]
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `subject_type` | `customer`、`project`、`expense_request`、`procedure` |
| `subject_id` | 业务对象 ID |
| `instance_id` | workflow 运行实例 ID |
| `instance_status` | `running`、`completed`、`canceled`、`failed` |
| `current_node_key` | 当前节点编码 |
| `current_node_title` | 当前节点展示名 |
| `current_business_kind` | 当前节点业务类型 |
| `pending_task_count` | 当前对象待处理任务数量 |
| `actions` | 当前用户可执行动作 |

`actions` 字段说明：

| 字段 | 说明 |
| --- | --- |
| `key` | 提交给 `POST /workflow-tasks/:taskId/complete` 的 `action` 值 |
| `label` | 按钮文案 |
| `task_id` | 待办 ID |
| `node_key` | 当前 workflow 节点编码 |
| `node_type` | 当前 workflow 节点类型 |
| `business_domain` | 业务域：`customer_status`、`workflow_project`、`payment_collection`、`expense_request`，通用流程为 `null` |
| `business_action` | 当前动作语义。项目 workflow 节点使用 `node_key`，收款节点使用 `confirm_payment`，费用节点使用 `approve`、`reject`、`pay` |
| `requires_reason` | 是否必须填写顶层 `reason` |
| `output_fields` | 需要放入 `output` 的字段描述 |
| `disabled` | 是否禁用 |

`output_fields.type` 当前可能值：

| 类型 | 端上控件建议 |
| --- | --- |
| `string` | 单行/多行文本 |
| `number` | 数字输入 |
| `date` | 日期选择 |
| `datetime` | 日期时间选择 |
| `employee` | 员工选择 |
| `image_list` | 图片上传数组 |
| `payment_collection` | 收款节点确认，端上提交 `output.payment_status = "success"` |
| `project_log` | 旧工序日志字段，已被 workflow node contract v2 替代；当前按节点 `attributes` 展示日志入口 |
| `settlement_method` | 结算方式选择 |

工序节点施工日志的专门对接要求见
[小程序工序节点施工日志对接说明](./miniprogram-procedure-construction-log-integration.md)。

收款节点的专门对接要求见
[小程序收款节点对接说明](./miniprogram-payment-collection-node-integration.md)。

基于 orange 仓库只读核查后的最新落点和剩余事项见
[Orange Workflow 对接文档](./orange-workflow-handoff.md)。

orange 针对施工阶段 `current_stage` 的专项核查和对接规则见
[Orange 施工阶段 current_stage 对接文档](./orange-construction-current-stage-handoff.md)。

## 新接口

### 项目详情 workflow-only 数据源

项目详情仍调用：

```http
GET /projects/:id/employee-detail-bootstrap
Authorization: Bearer <token>
```

但响应里不再提供 `status_actions`。项目页、工地页和任务中心必须从：

```ts
payload.workflow_state?.actions ?? []
```

读取当前员工可执行动作。

项目详情关键响应字段：

```json
{
  "project": {},
  "permissions": {},
  "members": [],
  "workflow_state": {
    "subject_type": "project",
    "subject_id": "project-id",
    "instance_id": "workflow-instance-id",
    "instance_status": "running",
    "current_node_key": "middle_payment",
    "current_node_title": "中期进度款",
    "current_business_kind": "payment_collection",
    "pending_task_count": 1,
    "actions": [
      {
        "key": "complete",
        "label": "中期进度款",
        "task_id": "workflow-task-id",
        "node_key": "middle_payment",
        "node_type": "confirmation",
        "business_domain": "payment_collection",
        "business_action": "confirm_payment",
        "requires_reason": false,
        "disabled": false,
        "output_fields": [
          {
            "name": "payment_status",
            "label": "中期进度款",
            "type": "payment_collection",
            "required": true,
            "payment_type": "stage_2",
            "payment_label": "中期进度款",
            "requirement_mode": "any_confirmed"
          }
        ]
      }
    ]
  },
  "construction_stages": {},
  "log_entry": {},
  "next_action": null,
  "logs": {}
}
```

小程序端禁止再调用或依赖：

| 旧内容 | 新内容 |
| --- | --- |
| `payload.status_actions` | `payload.workflow_state.actions` |
| `GET /projects/:id/status-transitions` | `GET /workflow-subjects/project/:id/timeline?page=1&pageSize=20` |
| `PATCH /projects/:id` 传 `status` | `POST /workflow-tasks/:taskId/complete` |
| `ProjectStatusActionItem` 白名单按钮 | 后端返回的 workflow action |
| workflow action 转旧项目状态 action | 直接渲染 workflow action |

如果端上仍调用旧项目状态动作，后端不会再保证兼容；项目 `PATCH` 带 `status`
会返回业务错误：`项目状态必须通过 workflow 节点推进`。

### 查询对象流程状态

```http
GET /workflow-subjects/:subjectType/:subjectId/state
Authorization: Bearer <token>
```

示例响应：

```json
{
  "success": true,
  "data": {
    "workflow_state": {
      "subject_type": "project",
      "subject_id": "uuid",
      "instance_id": "uuid",
      "instance_status": "running",
      "current_node_key": "construction_start",
      "current_node_title": "排期开工",
      "current_business_kind": "construction_start",
      "pending_task_count": 1,
      "actions": [
        {
          "key": "complete",
          "label": "完成排期",
          "task_id": "uuid",
          "node_key": "design_finalized",
          "node_type": "task",
          "business_domain": "workflow_project",
          "business_action": "design_finalized",
          "requires_reason": false,
          "disabled": false,
          "output_fields": [
            {
              "name": "start_date",
              "label": "开工日期",
              "type": "date",
              "required": true
            },
            {
              "name": "construction_manager_employee_id",
              "label": "工程负责人",
              "type": "employee",
              "required": true
            }
          ]
        }
      ]
    }
  }
}
```

### 查询对象流程时间线

```http
GET /workflow-subjects/:subjectType/:subjectId/timeline?page=1&pageSize=20
Authorization: Bearer <token>
```

列表接口必须分页。小程序不要请求无上限全量时间线。

### 查询我的待办

```http
GET /workflow-tasks?page=1&pageSize=20
Authorization: Bearer <token>
```

### 完成待办

```http
POST /workflow-tasks/:taskId/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "action": "complete",
  "reason": null,
  "output": {
    "decision": "approved"
  }
}
```

费用审批通过示例：

```json
{
  "action": "approve",
  "reason": null,
  "output": {
    "decision": "approved",
    "comment": "同意"
  }
}
```

项目签约示例：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "signed_amount": 300000
  }
}
```

项目排期开工示例：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "start_date": "2026-06-30",
    "construction_manager_employee_id": "uuid"
  }
}
```

费用驳回示例：

```json
{
  "action": "reject",
  "reason": "票据不完整",
  "output": {
    "decision": "rejected",
    "comment": "请补充发票"
  }
}
```

## 费用申请 API 调整

费用申请创建、更新、提交请求不再传旧审批链字段：

- `POST /expense-requests`
- `PATCH /expense-requests/:id`
- `POST /expense-requests/:id/submit`

小程序不要再提交 `approval_chain`。审批、驳回、打款按钮应来自
`workflow_state.actions` 或 `/workflow-tasks`，并通过
`POST /workflow-tasks/:taskId/complete` 完成。迁移窗口内后端仍可能返回
旧 `approval_chain` 作为历史详情兼容字段，但新版本端上不能依赖它生成
可操作按钮。

提交费用申请时，请只传提交人和备注：

```json
{
  "operator_id": "uuid",
  "comment": "提交说明"
}
```

## 旧字段兼容策略

项目推进没有旧字段兼容策略。小程序新版本必须按下面顺序读取：

1. 有 `workflow_state.actions`：按 workflow action 渲染按钮。
2. 没有 `workflow_state` 或 `workflow_state.actions` 为空：只展示状态，不展示项目推进按钮。
3. 端上不得 fallback 到 `status_actions`、`ProjectStatusActionItem`、
   `/projects/:id/status-transitions` 或 `PATCH /projects/:id { status }`。

旧字段用途：

| 旧字段 | 迁移期用途 | 最终状态 |
| --- | --- | --- |
| `status` | 只读展示兜底，不控制项目推进按钮 | 后续改为 workflow 投影或删除 |
| `status_label` | 只读展示兜底，不控制项目推进按钮 | 后续改为 workflow 投影或删除 |
| `status_actions` | 项目详情不再返回 | 删除 |
| `current_step` | 费用审批旧字段，不用于项目推进 | 删除 |

## Orange 项目页只读复核

只读核查 `/Users/leefo/Public/work/orange` 后，orange 当前项目详情已经具备
workflow action 接入雏形。gooes 侧不能修改 orange 源码，以下由小程序团队
继续确认或处理：

| 文件 | 当前状态 | 后续要求 |
| --- | --- | --- |
| `src/services/workflow_task.ts` | 已封装 workflow task/state/timeline/complete | 保持所有推进动作走 `WorkflowTaskService.complete` |
| `src/services/projects/methods/employee.ts` | 已从 bootstrap 响应透传 `workflow_state` | 不再恢复 `status_actions` 作为按钮数据源 |
| `src/packageProjects/pages/detail/hooks/useProjectDetailBootstrap.ts` | 已读取 `payload.workflow_state.actions` | 保持无 actions 时只读展示，不 fallback 到旧状态动作 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActions.ts` | 已通过 subject state 刷新 workflow actions | 异常时只清空动作并提示，不调用旧接口 |
| `src/packageProjects/pages/detail/hooks/useProjectWorkflowActionSubmit.ts` | 已提交普通项目动作和收款动作到 workflow task complete | 收款阻塞 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED` 要展示后端 message |
| `src/packageProjects/pages/logEdit/hooks/useProjectLogEditController.ts` | 已在创建施工日志后 complete workflow task | complete 失败时避免重复创建日志，提示用户重试当前 task |
| `src/services/task_center.ts` | 已用 `/workflow-tasks` 分页映射待办 | 确认项目收款、项目流程、施工日志都能从待办进入可处理页面 |
| `src/packageTasks/pages/index/index.tsx` | “项目”tab 当前值为 `project_log` | 建议覆盖 `project_log`、`project_payment`、`project_workflow`，或拆成更清晰的项目类 tab |
| `src/services/customer.ts` | 仍存在 `/customers/:id/status-transitions` 读取路径 | 若只是历史 timeline fallback，确认不生成按钮；最终切到 workflow timeline |
| `src/packageProjects/pages/detail/README.md` | 仍引用已不存在的旧 hook 名 | 更新为当前 `useProjectWorkflowActions` / `useProjectWorkflowActionSubmit` |

## 项目 workflow action 渲染规则

小程序不要再按旧项目状态动作白名单决定是否显示按钮。推荐规则：

1. 读取 `workflow_state.actions`。
2. 过滤 `disabled !== true` 且存在 `task_id` 的 action。
3. 按 `output_fields` 决定弹窗/表单：
   - `payment_collection`：显示收款确认入口。
   - `project_log`：显示施工日志表单，先创建日志。
   - `number`：数字输入，例如 `signed_amount`。
   - `date`：日期选择，例如 `start_date`。
   - `employee`：员工选择，例如 `construction_manager_employee_id`。
   - 空 `output_fields`：可直接确认完成。
4. 提交时使用 `action.key` 作为 body 的 `action`，不要使用旧
   `ProjectStatusTransitionAction`。

通用提交：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

提交成功后必须刷新项目详情或 workflow state，以服务端返回为准，不要本地推断
下一个节点。

## 工序节点施工日志

当前工序节点施工日志入口来自 `timeline_nodes[].attributes`：

```json
{
  "stage_code": "masonry",
  "require_log": true,
  "min_image_count": 1
}
```

小程序必须：

1. 按 `attributes.stage_code` 展示施工日志表单。
2. 满足 `min_image_count` 后调用 `POST /project-logs` 创建日志。
3. 需要推进节点时，从 `actions[]` 获取 `task_id/key`。
4. 调用 `POST /workflow-tasks/:taskId/complete`，不提交日志 ID 或图片数量：

```json
{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

施工日志创建失败时，不允许调用 workflow complete。
workflow complete 时后端会按当前项目、当前工序查询真实施工日志和图片证据。

## 收款节点

当 action 满足：

```json
{
  "business_domain": "payment_collection",
  "business_action": "confirm_payment"
}
```

小程序必须展示收款节点操作，不得跳过。提交：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success"
  }
}
```

后端会检查项目下对应 `payment_type` 是否已有 confirmed 收款。未满足时返回
`409` 和错误码 `WORKFLOW_PAYMENT_COLLECTION_BLOCKED`，端上保持节点未完成并展示
后端 message。

## 页面改造清单

小程序团队需要检查以下页面或模块：

| 页面/模块 | 改造要求 |
| --- | --- |
| 客户详情 | 使用 `workflow_state.current_node_title` 展示流程状态，按钮来自 `workflow_state.actions` |
| 项目详情 | 使用 `workflow_state` 替代项目 `status_actions` |
| 工地/施工详情 | 施工节点和验收入口使用 workflow action |
| 费用审批列表 | 待办来源切换到 `/workflow-tasks` |
| 费用审批详情 | `approve/reject/pay` 使用 task complete 或后端兼容接口 |
| 首页待办 | workflow task 分页加载，不请求全量 |

## 验收用例

小程序联调至少覆盖：

1. 客户从新线索进入跟进。
2. 客户到店、进入设计、签约。
3. 项目签约、排期开工、暂停、恢复、发起验收。
4. 工序节点要求施工日志时，先创建施工日志，再完成 workflow task。
5. 水电工序完成后进入中期收款节点；未确认收款时不能推进，确认后进入下一工序。
6. 费用申请提交、经理审批、财务审批、驳回、取消、付款。
7. 首页待办分页加载。
8. 没有 `workflow_state.actions` 时不展示项目推进按钮，也不 fallback 到旧状态动作。

Phase 6 破坏性清理前，Orange/小程序侧必须把下面的 API 契约验收证据
填入 `docs/state_machine_migrate/audit/manual-gates.json` 的
`api_contract` 段：

| 字段 | 验收要求 |
| --- | --- |
| `workflow_state_actions_confirmed` | 页面按钮优先来自 `workflow_state.actions`，并按 `output_fields` 渲染表单 |
| `workflow_task_complete_confirmed` | 客户、项目、费用审批的推进动作可通过 `POST /workflow-tasks/:taskId/complete` 完成 |
| `legacy_fields_not_required_confirmed` | 线上最低可用版本不再依赖 `status_actions`、`current_step`、`approval_chain` 或旧状态流转接口生成可操作按钮 |
| `evidence` | 联调记录、发布说明、测试报告或任务链接；必须填写 `http(s)` URL 或 `docs/state_machine_migrate/` 下已存在文件路径 |

同时必须填写 `mini_program.confirmed_by`、可解析的
`mini_program.confirmed_at` 和 `mini_program.minimum_version`，用于追溯破坏性清理前的小程序发布
确认人、确认时间和最低可用版本。`confirmed_at` 必须记录已经完成的确认时间，不能填写未来计划时间；
`minimum_version` 必须填写数字版本号，例如 `2.8.0`，不能填写自由文本说明。

## 需要后端同步的变更

后端每完成一个阶段，需要在这里补充：

说明：下表保留迁移过程中的历史兼容阶段。项目侧当前以 2026-06-13
`Project status action compatibility removed` 之后的 workflow-only 合约为准。

| 日期 | 阶段 | 后端变更 | 小程序动作 |
| --- | --- | --- | --- |
| 2026-06-12 | Phase 0/Plan | 输出执行计划和初始对接契约 | 评估页面改造范围 |
| 2026-06-12 | Phase 2/API | 新增 `/workflow-subjects/:subjectType/:subjectId/state`、`/workflow-subjects/:subjectType/:subjectId/timeline`、`/workflow-tasks`、`/workflow-tasks/:id/complete` 后端实现；待办列表已分页并按当前员工/角色过滤 | 按本文契约接入 `workflow_state.actions` 和 workflow task complete |
| 2026-06-12 | Phase 3/Compatibility projection | 旧客户、项目、费用详情/动作响应开始补充 `workflow_state`；客户 runtime 同步成功后会刷新 `workflow_subject_states`；项目/费用仍保留旧写路径 | 可以优先读取旧接口中的 `workflow_state`，但推进按钮仍需保留旧字段 fallback |
| 2026-06-12 | Phase 3/Project runtime sync | 后端新增 `construction_main` 模板，并在旧项目状态变更后同步 workflow runtime 与 subject projection；旧项目写路径仍保留兼容 | 项目详情可继续优先读取 `workflow_state`，但发布前仍需保留旧状态按钮 fallback |
| 2026-06-12 | Phase 2/Task visibility | `workflow_tasks` 新增权限投影字段，后端按员工、角色或权限过滤 `/workflow-tasks` 和 `workflow_state.actions` | 小程序可以把 `/workflow-tasks` 作为待办来源，但仍需等待目标环境执行 migration |
| 2026-06-12 | Phase 3/Expense runtime sync | 后端新增 `expense_approval` 模板、取消 workflow 实例 RPC，并在旧费用审批写路径后同步 workflow runtime | 费用详情可读取 `workflow_state`，待办入口继续保留旧审批列表 fallback 直到 staging smoke |
| 2026-06-12 | Phase 5/Read path partial | 后端任务中心的费用审批/打款待办已改为读取 `workflow_tasks`，客户小程序项目列表和详情已补充 `workflow_state` 投影 | 小程序项目页可以优先展示 `workflow_state.current_node_title`；费用待办可逐步切换到 workflow task |
| 2026-06-12 | Phase 5/Expense task complete bridge | `/workflow-tasks/:id/complete` 对 `expense_request` 的 `manager_review`、`finance_review`、`payment` 节点会调用费用业务服务；业务状态继续写 `expense_requests.status`，可操作节点以 workflow task/subject state 为准，不再写旧 `current_step` | 费用审批/驳回/打款可以优先走 workflow task complete；打款仍需传 `payee_name`、`method`、`paid_amount`、`evidence_images` 等支付字段 |
| 2026-06-12 | Phase 5/Project task complete bridge | `/workflow-tasks/:id/complete` 对 `project` 的施工主流程节点会调用项目状态服务，保持项目业务字段和 workflow runtime 同步 | 项目签约仍需传 `signed_amount`，排期开工仍需传 `start_date` 和 `construction_manager_employee_id` |
| 2026-06-12 | Phase 5/Customer task complete bridge | `/workflow-tasks/:id/complete` 对 `customer` 的跟进、到店、作废节点会调用客户状态服务，保持客户业务状态和 workflow runtime 同步 | 客户签约仍通过项目签约联动，不直接开放客户 `mark_signed` |
| 2026-06-12 | Phase 5/Action metadata | `workflow_state.actions` 和 `/workflow-tasks` 列表开始返回 `business_domain`、`business_action`、`node_key`、`node_type`、`output_fields`；审批节点会同时返回通过/驳回两个动作 | 端上可以按 `output_fields` 渲染表单，并把 `key` 作为 task complete 的 `action` |
| 2026-06-12 | Phase 5/Expense API input cleanup | 费用申请创建、更新、提交 schema 不再接收 `approval_chain`，后端不再从 mutation 入参写旧审批链表 | 新版本小程序停止提交 `approval_chain`；审批/驳回/打款统一从 workflow task action 发起 |
| 2026-06-12 | Phase 6/Cleanup migration ready | 后端已准备 `20260612143000_drop_legacy_state_machine_objects.sql`，会删除旧状态流转日志表、费用旧审批链表、排期开工旧 RPC、费用旧节点列 `current_step/current_step_role` | 目标环境应用该 migration 前，小程序线上最低版本必须不再读取 `current_step`、`approval_chain`、旧状态按钮或旧状态流转接口 |
| 2026-06-13 | Procedure construction log contract | 工序节点 action metadata 支持 `type = project_log`，并通过 `stage_code`、`min_image_count` 指示小程序先创建施工日志再完成 workflow task；施工日志 HTTP 路径统一使用 `/project-logs` | 项目详情、工地详情、首页待办、任务中心按 `project_log` 字段渲染施工日志表单；所有施工日志接口切到 `/project-logs` |
| 2026-06-13 | Project workflow native actions | 项目 workflow action 不再下发 `business_domain = project_status` 的旧项目状态动作；项目业务节点使用 `workflow_project`，收款节点使用 `payment_collection` | 小程序项目按钮不能再按旧 `ProjectStatusAction` 白名单过滤，需要识别 `workflow_project` 和 `payment_collection` |
| 2026-06-13 | Project status action compatibility removed | 项目详情 bootstrap 不再返回 `status_actions`；项目 PATCH 带 `status` 会被拒绝；项目推进只能通过 `/workflow-tasks/:taskId/complete` | 删除 orange 项目详情里的 `status_actions`、`ProjectStatusActionItem`、`/projects/:id/status-transitions` 依赖 |
| 2026-06-19 | Procedure log/runtime contract v2 | 施工日志改为独立过程记录；工序 action 不再返回 `project_log` output field；complete 时后端查当前工序真实日志证据 | 小程序按 `timeline_nodes[].attributes` 展示日志入口，按 `actions[]` 显式完成工序，不再提交 `project_log_id/image_count` |
