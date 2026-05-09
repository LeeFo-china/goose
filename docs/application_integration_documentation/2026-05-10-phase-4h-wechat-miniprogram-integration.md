# Phase 4H 微信小程序对接文档：员工站内通知

日期：2026-05-10

## 背景

后端已提供员工站内通知接口。小程序端如果存在员工工作台或员工消息页，可以复用同一套接口。

客户端暂不接通知。

## 接口

### 通知列表

```http
GET /notifications?page=1&pageSize=20&status=unread
Authorization: Bearer <employee_token>
```

### 未读摘要

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

### 标记已读

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

空对象 `{}` 表示标记当前员工全部未读通知。

## 当前通知场景

| scene | 说明 |
| --- | --- |
| `platform_lead_assigned` | 平台分配线索给租户管理员 |
| `employee_share_customer_bound` | 员工分享绑定客户成功 |

## 前端建议

- 员工工作台顶部展示未读数。
- 通知 item 点击后按 `target_type` 和 `target_id` 跳转。
- 如果小程序暂时没有员工消息页，可以先不对接，仅 admin 后台消费。

## 不涉及

- 客户端消息通知。
- 微信订阅消息。
- 短信通知。
