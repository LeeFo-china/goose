# 阶段 5E Admin 对接文档：平台线索页面

日期：2026-05-10

## 1. 页面入口

新增 admin 页面：

```text
/platform/leads
```

侧边栏新增：

```text
平台线索
```

入口仅 `platform_admin` 角色可见。

## 2. 列表接口

页面使用：

```http
GET /platform/leads?page=1&pageSize=20&status=new&keyword=张三
```

支持参数：

| 参数 | 说明 |
| --- | --- |
| `page` | 页码 |
| `pageSize` | 每页数量，admin 固定使用 20 |
| `status` | `new` / `assigned` / `invalid` |
| `keyword` | 搜索姓名、手机号、城市、小区 |

页面展示：

- 客户姓名
- 手机号
- 城市
- 小区
- 面积
- 预算
- 来源
- 状态
- 分配租户
- 关联客户
- 提交时间

## 3. 详情接口

详情弹窗使用：

```http
GET /platform/leads/:id
```

详情需要返回：

```json
{
  "id": "lead-id",
  "phone": "18600000000",
  "name": "张三",
  "city": "郑州",
  "community": "某小区",
  "area": 120,
  "budget": "20万",
  "description": "装修需求",
  "status": "new",
  "assigned_tenant": null,
  "assigned_customer": null,
  "assigned_by": null,
  "assign_logs": []
}
```

已分配线索需要返回：

```json
{
  "status": "assigned",
  "assigned_tenant": {
    "id": "tenant-id",
    "name": "某装修公司",
    "slug": "demo",
    "status": "active"
  },
  "assigned_customer": {
    "id": "customer-id",
    "name": "张三",
    "phone": "18600000000"
  },
  "assigned_by": {
    "id": "employee-id",
    "name": "平台运营"
  },
  "assign_logs": [
    {
      "action": "assign",
      "dedupe_result": "existing_customer",
      "target_tenant": {
        "name": "某装修公司"
      },
      "assigned_customer": {
        "name": "张三",
        "phone": "18600000000"
      },
      "operator": {
        "name": "平台运营"
      },
      "note": "客户有近期装修需求",
      "created_at": "2026-05-10T10:00:00.000Z"
    }
  ]
}
```

`dedupe_result` 展示规则：

| 值 | 前端文案 |
| --- | --- |
| `existing_customer` | 老客户新线索 |
| `created_customer` | 新客户 |
| `already_assigned` | 已分配 |

## 4. 租户搜索

分配弹窗内搜索正常租户：

```http
GET /platform/tenants?page=1&pageSize=20&status=active&keyword=关键词
```

只允许选择 `active` 租户。

## 5. 分配接口

待分配线索调用：

```http
POST /platform/leads/:id/assign
Content-Type: application/json

{
  "tenant_id": "tenant-id",
  "assigned_note": "客户有近期装修需求"
}
```

成功后 admin 会刷新页面，并重新拉取详情。

后端必须保证：

- 同一线索重复分配时返回业务错误。
- 目标租户不可用时返回业务错误。
- 分配逻辑在后端原子化执行。
- 目标租户内按手机号去重。
- 命中老客户时追加客户来源时间线，不重复创建客户。
- 写入 `platform_lead_assign_logs`。

## 6. 错误处理

admin 会直接展示后端 `message`。

建议后端错误文案保持可读：

| code | 建议 message |
| --- | --- |
| `TENANT_NOT_AVAILABLE` | 目标租户不可用 |
| `PLATFORM_LEAD_ALREADY_ASSIGNED` | 该线索已分配 |
| `PLATFORM_LEAD_NOT_ASSIGNABLE` | 当前线索状态不能分配 |

## 7. 验收

- 平台超管可打开 `/platform/leads`。
- 能筛选、搜索、分页查看线索。
- 能打开线索详情。
- 待分配线索能搜索租户并提交分配。
- 分配后详情能展示分配租户、关联客户和分配日志。
- 老客户新线索能通过日志里的 `dedupe_result=existing_customer` 展示。
