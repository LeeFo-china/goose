# Phase 4G Admin 对接文档：客户来源时间线

日期：2026-05-10

## 适用端

租户 admin。

## 1. 客户列表新增字段

`GET /customers` 每个客户 item 会带来源摘要：

```json
{
  "id": "customer-id",
  "name": "李先生",
  "source": "platform",
  "source_summary": {
    "total": 2,
    "latest_source": {
      "id": "source-id",
      "source": "platform_lead",
      "display_label": "平台分配线索",
      "dedupe_result": "existing_customer",
      "is_old_customer_new_lead": true,
      "is_platform_new_lead": false,
      "is_employee_share": false,
      "created_at": "2026-05-10T10:00:00.000Z"
    },
    "source_tags": ["old_customer_new_lead"],
    "has_old_customer_new_lead": true,
    "has_platform_new_lead": false,
    "has_employee_share": false
  },
  "latest_source": {},
  "source_tags": ["old_customer_new_lead"],
  "has_old_customer_new_lead": true,
  "has_platform_new_lead": false,
  "has_employee_share": false
}
```

列表打标建议：

| 字段 | 展示 |
| --- | --- |
| `has_old_customer_new_lead` | 老客户新线索 |
| `has_platform_new_lead` | 平台新线索 |
| `has_employee_share` | 员工分享 |

## 2. 客户详情新增字段

`GET /customers/:id/detail` 同样会返回来源摘要字段。

详情页可以在基础信息区展示最近一次来源：

```text
最近来源：平台分配线索
来源时间：2026-05-10 10:00
来源标记：老客户新线索
```

## 3. 完整来源时间线

```http
GET /customers/:id/sources?page=1&pageSize=20
Authorization: Bearer <employee_token>
```

返回：

```json
{
  "list": [
    {
      "id": "source-id",
      "tenant_id": "tenant-id",
      "customer_id": "customer-id",
      "source": "employee_share",
      "display_label": "员工拓客分享",
      "source_label": "员工拓客分享",
      "dedupe_result": "created_customer",
      "is_old_customer_new_lead": false,
      "is_platform_new_lead": false,
      "is_employee_share": true,
      "source_employee": {
        "id": "employee-id",
        "name": "张三",
        "phone": "13800000000"
      },
      "assigned_by": {
        "id": "employee-id",
        "name": "张三",
        "phone": "13800000000"
      },
      "platform_lead": null,
      "share_link": {
        "id": "share-link-id",
        "token": "ts_xxx",
        "source": "employee_share",
        "target_type": "miniprogram",
        "target_id": null
      },
      "metadata": {
        "dedupe_result": "created_customer"
      },
      "created_at": "2026-05-10T10:00:00.000Z"
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

## 4. 权限

沿用客户读取权限：

- 有 `customer.read` 且能访问该客户，才能读取来源时间线。
- 租户之间互不可见。

## 5. 当前未做

本阶段暂未增加列表筛选参数。

后续建议增加：

```text
source_tag=old_customer_new_lead
source_tag=platform_new_lead
source_tag=employee_share
```
