# Workflow 迁移小程序对接说明

## 目的

状态机迁移期间，小程序不能再把按钮和页面状态强绑定到旧字段：

- `status`
- `status_label`
- `status_actions`
- `current_step`

后端会先保留旧字段作为兼容 fallback，但新版本小程序应该优先读取 `workflow_state` 和 workflow task/action。

## 发布顺序

1. 后端新增 workflow subject/task API，但不删除旧接口。
2. 后端在旧接口响应中补充 `workflow_state`。
3. 小程序发布新版本，优先使用 `workflow_state.actions` 渲染按钮。
4. 后端切换读路径，旧字段只作为展示 fallback。
5. 确认线上最低小程序版本都不依赖旧状态机后，后端执行删表删列 migration。

## 通用字段

后端会在客户、项目、费用审批相关响应中逐步补充：

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
        "business_domain": "project_status",
        "business_action": "sign_contract",
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
| `business_domain` | 兼容业务域：`customer_status`、`project_status`、`expense_request`，通用流程为 `null` |
| `business_action` | 对应旧业务动作，例如 `sign_contract`、`approve`、`pay`，通用流程为 `null` |
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
| `settlement_method` | 结算方式选择 |

## 新接口

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
          "business_domain": "project_status",
          "business_action": "schedule_construction",
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

## 旧字段兼容策略

迁移期后端仍返回旧字段，但小程序新版本必须按下面顺序读取：

1. 有 `workflow_state.actions`：按 workflow action 渲染按钮。
2. 无 `workflow_state` 但有旧 `status_actions`：临时 fallback。
3. 两者都没有：只展示状态，不展示推进按钮。

旧字段用途：

| 旧字段 | 迁移期用途 | 最终状态 |
| --- | --- | --- |
| `status` | 展示 fallback | 删除或改为 workflow 投影 |
| `status_label` | 展示 fallback | 删除或改为 workflow 投影 |
| `status_actions` | 旧版本按钮 fallback | 删除 |
| `current_step` | 费用审批 fallback | 删除 |

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
4. 费用申请提交、经理审批、财务审批、驳回、取消、付款。
5. 首页待办分页加载。
6. 老版本 fallback：没有 `workflow_state` 时仍能用旧字段只读展示。

## 需要后端同步的变更

后端每完成一个阶段，需要在这里补充：

| 日期 | 阶段 | 后端变更 | 小程序动作 |
| --- | --- | --- | --- |
| 2026-06-12 | Phase 0/Plan | 输出执行计划和初始对接契约 | 评估页面改造范围 |
| 2026-06-12 | Phase 2/API | 新增 `/workflow-subjects/:subjectType/:subjectId/state`、`/workflow-subjects/:subjectType/:subjectId/timeline`、`/workflow-tasks`、`/workflow-tasks/:id/complete` 后端实现；待办列表已分页并按当前员工/角色过滤 | 按本文契约接入 `workflow_state.actions` 和 workflow task complete |
| 2026-06-12 | Phase 3/Compatibility projection | 旧客户、项目、费用详情/动作响应开始补充 `workflow_state`；客户 runtime 同步成功后会刷新 `workflow_subject_states`；项目/费用仍保留旧写路径 | 可以优先读取旧接口中的 `workflow_state`，但推进按钮仍需保留旧字段 fallback |
| 2026-06-12 | Phase 3/Project runtime sync | 后端新增 `construction_main` 模板，并在旧项目状态变更后同步 workflow runtime 与 subject projection；旧项目写路径仍保留兼容 | 项目详情可继续优先读取 `workflow_state`，但发布前仍需保留旧状态按钮 fallback |
| 2026-06-12 | Phase 2/Task visibility | `workflow_tasks` 新增权限投影字段，后端按员工、角色或权限过滤 `/workflow-tasks` 和 `workflow_state.actions` | 小程序可以把 `/workflow-tasks` 作为待办来源，但仍需等待目标环境执行 migration |
| 2026-06-12 | Phase 3/Expense runtime sync | 后端新增 `expense_approval` 模板、取消 workflow 实例 RPC，并在旧费用审批写路径后同步 workflow runtime | 费用详情可读取 `workflow_state`，待办入口继续保留旧审批列表 fallback 直到 staging smoke |
| 2026-06-12 | Phase 5/Read path partial | 后端任务中心的费用审批/打款待办已改为读取 `workflow_tasks`，客户小程序项目列表和详情已补充 `workflow_state` 投影 | 小程序项目页可以优先展示 `workflow_state.current_node_title`；费用待办可逐步切换到 workflow task |
| 2026-06-12 | Phase 5/Expense task complete bridge | `/workflow-tasks/:id/complete` 对 `expense_request` 的 `manager_review`、`finance_review`、`payment` 节点会调用费用业务服务，保持 `expense_requests.status/current_step` 和 workflow runtime 同步 | 费用审批/驳回/打款可以优先走 workflow task complete；打款仍需传 `payee_name`、`method`、`paid_amount`、`evidence_images` 等支付字段 |
| 2026-06-12 | Phase 5/Project task complete bridge | `/workflow-tasks/:id/complete` 对 `project` 的施工主流程节点会调用项目状态服务，保持项目业务字段和 workflow runtime 同步 | 项目签约仍需传 `signed_amount`，排期开工仍需传 `start_date` 和 `construction_manager_employee_id` |
| 2026-06-12 | Phase 5/Customer task complete bridge | `/workflow-tasks/:id/complete` 对 `customer` 的跟进、到店、作废节点会调用客户状态服务，保持客户业务状态和 workflow runtime 同步 | 客户签约仍通过项目签约联动，不直接开放客户 `mark_signed` |
| 2026-06-12 | Phase 5/Action metadata | `workflow_state.actions` 和 `/workflow-tasks` 列表开始返回 `business_domain`、`business_action`、`node_key`、`node_type`、`output_fields`；审批节点会同时返回通过/驳回两个动作 | 端上可以按 `output_fields` 渲染表单，并把 `key` 作为 task complete 的 `action` |
