# Phase 4H Admin 对接文档：站内通知

日期：2026-05-10

## 适用端

admin 后台员工端。

## 1. 通知列表

```http
GET /notifications?page=1&pageSize=20&status=unread
Authorization: Bearer <employee_token>
```

Query：

| 参数 | 说明 |
| --- | --- |
| `page` | 默认 1 |
| `pageSize` | 默认 20 |
| `status` | `unread` / `read`，不传表示全部 |

返回：

```json
{
  "list": [
    {
      "id": "notification-id",
      "tenant_id": "tenant-id",
      "recipient_employee_id": "employee-id",
      "scene": "platform_lead_assigned",
      "title": "平台分配新线索",
      "content": "平台为你分配了一条来自郑州的平台新线索：李先生，请及时跟进。",
      "target_type": "customer",
      "target_id": "customer-id",
      "target_url": "/customers/customer-id",
      "payload": {
        "platform_lead_id": "lead-id",
        "customer_id": "customer-id",
        "dedupe_result": "created_customer"
      },
      "status": "unread",
      "read_at": null,
      "created_at": "2026-05-10T09:00:00.000Z"
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

## 2. 未读摘要

```http
GET /notifications/summary
Authorization: Bearer <employee_token>
```

返回：

```json
{
  "unread_count": 3
}
```

建议 admin 顶部消息入口每隔一段时间或页面切换时刷新这个接口。

## 3. 标记已读

标记指定通知：

```http
POST /notifications/read
Authorization: Bearer <employee_token>
Content-Type: application/json
```

Body：

```json
{
  "ids": ["notification-id"]
}
```

标记全部未读为已读：

```json
{}
```

返回：

```json
{
  "updated_count": 1,
  "list": []
}
```

## 4. 当前支持场景

| scene | 含义 | target |
| --- | --- | --- |
| `platform_lead_assigned` | 平台线索分配成功 | customer / platform_lead |
| `employee_share_customer_bound` | 员工分享绑定客户成功 | customer |

## 5. 权限

- 通知接口只返回当前登录员工自己的通知。
- 非员工登录态不能访问通知接口。
- 租户管理员通知由后端根据 `system_admin` 角色写入。

## 6. 当前不做

- 短信通知。
- 微信订阅消息。
- 通知删除。
- 租户管理员自定义通知规则。
