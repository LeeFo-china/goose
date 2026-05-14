# 客户首页最近进度现场跟进人员后端对接

日期：2026-05-14

## 对接范围

客户小程序首页项目卡片接口：

```http
GET /customer/projects?include=home_summary
```

本次只调整首页 `recent_logs` 摘要，不改项目详情日志列表和评论评分接口。

## 后端变更

更新 RPC：

```sql
public.get_customer_project_recent_log_summaries(uuid, uuid[], integer)
```

新增返回字段：

```json
{
  "employee_id": "employee-id",
  "employee_name": "张三",
  "employee_avatar": "https://...",
  "employee": {
    "id": "employee-id",
    "name": "张三",
    "avatar": "https://..."
  }
}
```

数据来源：

- `project_logs.employee_id`
- `employees.name`
- `employees.avatar`

租户隔离：

- 日志必须满足 `project_logs.tenant_id = projects.tenant_id`。
- 员工关联同时校验 `employees.tenant_id = projects.tenant_id`。

## 小程序展示规则

小程序端优先读取：

1. `recent_logs[].employee.name`
2. `recent_logs[].employee_name`
3. 都为空时显示“现场跟进：待同步”

## 验收标准

- 客户首页项目卡片“最新进度”展示真实现场跟进人员。
- 历史日志员工缺失时不报错，前端显示“待同步”。
- `recent_logs` 原有字段 `stage_code`、`stage_label`、`node_name`、`created_at`、图片摘要和评论评分摘要保持兼容。
