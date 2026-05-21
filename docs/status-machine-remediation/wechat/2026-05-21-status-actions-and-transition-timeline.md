# 小程序状态动作和时间线对接文档

日期：2026-05-21

## 背景

小程序员工端不要在本地硬编码所有状态按钮，也不要直接通过 `PATCH` 提交 `status`。详情页应读取后端返回的可执行动作列表，再调用动作接口完成状态变更。

## 项目可执行动作

```http
GET /projects/:id/status-actions
Authorization: Bearer <employee_token>
```

响应示例：

```json
{
  "current_status": "constructing",
  "paused_from_status": null,
  "actions": [
    {
      "action": "pause_project",
      "label": "暂停项目",
      "from_status": "constructing",
      "to_status": "on_hold",
      "requires_reason": true
    }
  ]
}
```

## 客户可执行动作

```http
GET /customers/:id/status-actions
Authorization: Bearer <employee_token>
```

响应示例：

```json
{
  "current_status": "following",
  "actions": [
    {
      "action": "mark_arrived",
      "label": "标记到店",
      "from_status": "following",
      "to_status": "arrived",
      "requires_reason": false
    }
  ]
}
```

## 状态流转时间线

项目：

```http
GET /projects/:id/status-transitions?page=1&pageSize=20
Authorization: Bearer <employee_token>
```

客户：

```http
GET /customers/:id/status-transitions?page=1&pageSize=20
Authorization: Bearer <employee_token>
```

响应结构：

```json
{
  "rows": [
    {
      "id": "uuid",
      "from_status": "following",
      "to_status": "contracted",
      "action": "sign_contract",
      "operator_employee_id": "uuid",
      "operator_auth_user_id": "uuid",
      "reason": "项目签约后同步客户签约状态",
      "metadata": {},
      "created_at": "2026-05-21T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

## 对接要求

- 详情页进入时并行拉详情和 `status-actions`。
- 按 `actions` 渲染状态按钮，`requires_reason=true` 时必须要求填写原因。
- 状态动作提交成功后，重新拉详情、列表、`status-actions` 和第一页 `status-transitions`。
- 时间线默认展示最近 20 条，向下加载下一页。
- 服务端返回 400 / 403 时，直接展示后端中文错误信息。
- 新小程序代码不要再通过 `PATCH /projects/:id` 或 `PATCH /customers/:id` 直接提交 `status`。
