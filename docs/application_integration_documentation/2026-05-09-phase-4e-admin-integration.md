# Phase 4E Admin 对接文档：平台公海线索

日期：2026-05-09

## 适用端

平台超管后台。

租户 admin 暂不直接使用这些接口。租户侧客户详情后续可读取 `customer_sources` 展示“线索来源时间线”。

## 权限

以下接口只允许 `platform_admin` 使用：

- `GET /platform/leads`
- `GET /platform/leads/:id`
- `POST /platform/leads/:id/assign`

## 1. 平台线索列表

```http
GET /platform/leads?page=1&pageSize=20&status=new&keyword=张三
Authorization: Bearer <platform_admin_token>
```

Query：

| 参数 | 说明 |
| --- | --- |
| `page` | 页码，默认 1 |
| `pageSize` | 每页数量 |
| `status` | `new` / `assigned` / `invalid` |
| `keyword` | 搜索姓名、手机号、城市、小区 |
| `phone` | 手机号模糊搜索 |
| `assigned_tenant_id` | 按已分配租户过滤 |

返回：

```json
{
  "list": [
    {
      "id": "lead-id",
      "phone": "18638374738",
      "name": "李先生",
      "city": "郑州",
      "community": "某小区",
      "area": 120,
      "budget": "20-30万",
      "description": "想做全屋装修",
      "source": "platform_visitor",
      "status": "new",
      "assigned_tenant": null,
      "assigned_customer": null,
      "assigned_by": null,
      "created_at": "2026-05-09T12:00:00.000Z"
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

## 2. 平台线索详情

```http
GET /platform/leads/:id
Authorization: Bearer <platform_admin_token>
```

详情比列表多：

- `assign_logs`：分配审计日志。
- `customer_sources`：本线索对应写入的客户来源记录。

## 3. 手动分配线索

```http
POST /platform/leads/:id/assign
Authorization: Bearer <platform_admin_token>
Content-Type: application/json
```

Body：

```json
{
  "tenant_id": "target-tenant-id",
  "assigned_note": "客户在郑州，建议安排金牌顾问跟进"
}
```

成功返回：

```json
{
  "result": {
    "platform_lead_id": "lead-id",
    "assigned_tenant_id": "target-tenant-id",
    "assigned_customer_id": "customer-id",
    "dedupe_result": "existing_customer",
    "status": "assigned"
  },
  "detail": {
    "id": "lead-id",
    "status": "assigned",
    "assigned_tenant_id": "target-tenant-id",
    "assigned_customer_id": "customer-id",
    "assigned_tenant": {
      "id": "target-tenant-id",
      "name": "某装修公司",
      "slug": "demo",
      "status": "active"
    },
    "assigned_customer": {
      "id": "customer-id",
      "name": "李先生",
      "phone": "18638374738",
      "status": "potential",
      "source": "platform"
    },
    "assign_logs": []
  }
}
```

`dedupe_result`：

| 值 | 含义 | Admin 展示建议 |
| --- | --- | --- |
| `existing_customer` | 目标租户已有同手机号客户 | 老客户新线索 |
| `created_customer` | 目标租户下创建了新客户 | 平台新线索 |
| `already_assigned` | 重复提交，同租户幂等命中 | 已分配 |

错误：

| code | 场景 |
| --- | --- |
| `PLATFORM_LEAD_NOT_FOUND` | 线索不存在 |
| `TENANT_NOT_AVAILABLE` | 目标租户不存在或不可用 |
| `PLATFORM_LEAD_ALREADY_ASSIGNED` | 线索已分配给其他租户 |
| `PLATFORM_LEAD_NOT_ASSIGNABLE` | 当前线索状态不可分配 |
| `PLATFORM_LEAD_CUSTOMER_UPSERT_FAILED` | 分配时客户创建或关联失败 |

## 页面建议

平台后台建议新增“平台线索”页面：

- 顶部筛选：状态、手机号、关键词。
- 列表字段：客户、手机号、城市/小区、面积、预算、状态、创建时间。
- `new` 状态显示“分配”按钮。
- 分配弹窗里选择目标租户，填写分配备注。
- 分配成功后在列表 item 上展示：
  - `existing_customer`：老客户新线索。
  - `created_customer`：平台新线索。

## 待后续对接

通知暂未落地。平台线索分配成功后，当前只写入审计日志和客户来源时间线，后续再接站内信/短信通知。
