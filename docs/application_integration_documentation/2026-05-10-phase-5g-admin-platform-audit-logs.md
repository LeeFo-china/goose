# 阶段 5G Admin 对接文档：平台审计日志

日期：2026-05-10

## 1. 页面入口

新增 admin 页面：

```text
/platform/audit-logs
```

侧边栏新增：

```text
平台审计
```

仅 `platform_admin` 角色可见。

## 2. 数据库变更

新增表：

```text
platform_audit_logs
```

需要执行：

```bash
supabase db push
```

## 3. 查询接口

页面使用：

```http
GET /platform/audit-logs?page=1&pageSize=20&action=tenant_create&keyword=关键词
```

支持参数：

| 参数 | 说明 |
| --- | --- |
| `page` | 页码 |
| `pageSize` | 每页数量，admin 固定使用 20 |
| `action` | 操作类型 |
| `status` | `success` / `failure` |
| `target_tenant_id` | 目标租户 ID |
| `resource_type` | 资源类型 |
| `keyword` | 搜索操作摘要、资源名称或资源类型 |

## 4. 操作类型

当前支持：

| action | 文案 |
| --- | --- |
| `tenant_create` | 创建租户 |
| `tenant_update` | 更新租户 |
| `tenant_suspend` | 停用租户 |
| `tenant_activate` | 启用租户 |
| `tenant_admin_create` | 创建管理员 |
| `platform_lead_assign` | 分配平台线索 |

## 5. 返回结构

```json
{
  "list": [
    {
      "id": "audit-id",
      "action": "tenant_create",
      "actor_employee_id": "employee-id",
      "actor_user_id": "auth-user-id",
      "target_tenant_id": "tenant-id",
      "resource_type": "tenant",
      "resource_id": "tenant-id",
      "resource_label": "某装修公司",
      "status": "success",
      "summary": "创建租户「某装修公司」",
      "metadata": {
        "slug": "demo"
      },
      "created_at": "2026-05-10T10:00:00.000Z",
      "target_tenant": {
        "id": "tenant-id",
        "name": "某装修公司",
        "slug": "demo",
        "status": "active"
      },
      "actor_employee": {
        "id": "employee-id",
        "name": "平台运营",
        "phone": "18600000000"
      }
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

## 6. 页面展示

列表展示：

- 操作类型
- 操作摘要
- 资源类型 / 资源 ID
- 目标租户
- 操作人
- 结果
- 时间

## 7. 写入点

后端已接入：

- `POST /platform/tenants`
- `PATCH /platform/tenants/:id`
- `POST /platform/tenants/:id/suspend`
- `POST /platform/tenants/:id/activate`
- `POST /platform/leads/:id/assign`

## 8. 注意事项

审计写入是 best-effort，不阻断主业务操作。后续如果平台审计需要强一致，需要把关键操作改造成数据库 RPC，在一个事务里同时写业务表和审计表。

平台线索分配仍保留 `platform_lead_assign_logs` 作为业务明细日志；`platform_audit_logs` 只做平台统一审计入口。
