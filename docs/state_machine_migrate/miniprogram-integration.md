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
        "label": "完成",
        "task_id": "uuid",
        "requires_reason": false,
        "disabled": false
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
          "requires_reason": false,
          "disabled": false
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
