# 客户跟进推进 workflow 小程序对接说明

日期：2026-06-17

## 结论

客户写跟进记录和客户业务 workflow 推进是两个动作。

小程序在 `POST /customers/:id/follow_ups` 写入跟进记录成功后，必须继续完成
当前客户 workflow task：

```http
POST /workflow-tasks/:taskId/complete
```

对于潜在客户节点，后端返回的 workflow action 通常是：

```json
{
  "key": "complete",
  "business_domain": "customer_status",
  "business_action": "start_following",
  "task_id": "..."
}
```

提交后，后端会把客户状态从 `potential` 推进到 `following`，并同步
`workflow_subject_states` 和下一节点待办。

## 当前问题

客户 `2327ae27-658a-4db3-aef5-9d69e0eab37c` 已有跟进记录：

- 跟进记录：`4cf417ce-ca64-47c0-aea7-7dda656b7b53`
- 跟进员工：`80a9c2ff-9bbb-444b-af9c-0594f5116ff7`
- 跟进内容：`今天打电话预约到店`
- 创建时间：`2026-06-17T07:44:07.992748+00:00`

但客户仍是：

- `customers.status = potential`
- customer workflow instance 当前节点：`potential`
- pending task：`c1ccd538-a2e9-4fab-bdc6-497a0fa25941`
- task assignee：`80a9c2ff-9bbb-444b-af9c-0594f5116ff7`

根因是写跟进成功只创建 `customer_follow_ups` 记录，不会自动推进 workflow。
推进必须通过 workflow task complete 完成。

## 后端契约

### 获取客户详情

```http
GET /customers/:id/detail
```

或：

```http
GET /customers/:id
```

客户详情会返回 `workflow_state`：

```json
{
  "id": "2327ae27-658a-4db3-aef5-9d69e0eab37c",
  "status": "potential",
  "workflow_state": {
    "subject_type": "customer",
    "subject_id": "2327ae27-658a-4db3-aef5-9d69e0eab37c",
    "instance_status": "running",
    "current_node_key": "potential",
    "current_node_title": "潜在客户",
    "actions": [
      {
        "task_id": "c1ccd538-a2e9-4fab-bdc6-497a0fa25941",
        "key": "complete",
        "label": "开始跟进",
        "node_key": "potential",
        "node_type": "business",
        "business_domain": "customer_status",
        "business_action": "start_following",
        "requires_reason": false,
        "output_fields": [],
        "disabled": false
      }
    ]
  }
}
```

小程序应从 `workflow_state.actions` 找：

- `business_domain = customer_status`
- `business_action = start_following`
- `disabled !== true`
- `task_id` 有值

然后用该 action 的：

- `task_id` 作为路径参数
- `key` 作为 complete body 的 `action`

### 获取 workflow state 兜底入口

如果当前页面拿不到客户详情里的 `workflow_state`，可直接调用：

```http
GET /workflow-subjects/customer/:customerId/state
```

返回结构：

```json
{
  "workflow_state": {
    "subject_type": "customer",
    "subject_id": "2327ae27-658a-4db3-aef5-9d69e0eab37c",
    "current_node_key": "potential",
    "actions": []
  }
}
```

### 获取待办兜底入口

任务中心或页面兜底也可以查询当前客户待办：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=customer&subject_id=:customerId
```

列表项里的 `actions` 与 `workflow_state.actions` 使用同一套字段。

### 完成客户 workflow task

```http
POST /workflow-tasks/:taskId/complete
Content-Type: application/json

{
  "action": "complete",
  "reason": null,
  "output": {}
}
```

潜在客户节点的 `action` 必须使用后端返回的 `actions[].key`。
当前是 `complete`，不要把 `business_action` 的 `start_following` 当成
`action` 提交，除非后端 action payload 明确返回 `key = start_following`。

成功响应里会包含更新后的 customer 和 workflow state。小程序应以响应结果或
重新拉取详情后的状态为准，不要在 complete 成功前本地强行改成 `following`。

## 小程序建议改法

当前 orange 已有相关文件：

- `src/packageCustomers/pages/followUpEdit/index.tsx`
- `src/packageCustomers/pages/customerDetail/model.ts`
- `src/services/workflow_task.ts`
- `src/services/task_center.ts`

建议流程：

1. 进入写跟进页时，读取客户详情里的 `workflow_state.actions`。
2. 保存跟进记录成功后，重新获取客户详情或
   `GET /workflow-subjects/customer/:customerId/state`，避免进入页面时动作还没加载完成。
3. 找 `business_action = start_following` 的 action。
4. 如果找到 action，调用
   `WorkflowTaskService.complete(action.task_id, { action: action.key, reason: null, output: {} })`。
5. complete 成功后刷新客户详情、客户列表缓存和任务中心。
6. 如果写跟进成功但 complete 失败，保留跟进记录，提示“跟进已保存，客户状态未推进，请刷新后重试”。

## 任务中心入口

业务员也可以从任务中心推进：

```http
GET /workflow-tasks?page=1&pageSize=20&status=pending&subject_type=customer
```

客户待办类型应识别为 `customer_followup`。点击后进入客户详情或写跟进页，
页面完成跟进后再 complete 对应 workflow task。

## 错误和幂等

- `404 流程待办不存在`：taskId 不存在或租户不匹配，刷新 workflow state。
- `403`：当前员工不是 assignee，或缺少角色/权限，刷新任务中心。
- `409 WORKFLOW_TASK_NOT_PENDING`：task 已被处理，刷新客户详情和任务中心。
- complete 失败不应回滚已创建的跟进记录；端上需提示用户状态未推进。
- 不要重复提交 complete。按钮提交期间禁用；遇到 409 按已处理刷新处理。

## 验收清单

1. 业务员打开潜在客户详情，能看到 `workflow_state.actions` 中的
   `start_following` 动作。
2. 业务员写跟进记录成功后，小程序调用
   `POST /workflow-tasks/:taskId/complete`。
3. complete 请求 body 的 `action` 等于 action payload 的 `key`。
4. complete 成功后客户状态变为 `following`。
5. 原 `potential` 待办从任务中心消失。
6. 若下一节点生成 pending task，assignee 仍是该客户负责人。
7. 写跟进成功但 complete 失败时，页面提示状态未推进并允许刷新重试。

