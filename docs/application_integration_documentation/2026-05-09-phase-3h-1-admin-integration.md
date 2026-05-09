# 阶段 3H-1 Admin 对接说明：任务中心与用量统计

日期：2026-05-09

## 1. 任务中心

接口不变：

```http
GET /task-center/todos
GET /task-center/todos/summary
```

新增待办类型：

```text
project_acceptance
```

新增 item 字段表现：

```json
{
  "type": "project_acceptance",
  "target_type": "project_acceptance",
  "action_label": "去复核",
  "target_url": "/packageProjects/pages/acceptanceDetail/index?id=xxx&projectId=xxx&mode=view"
}
```

admin 如果只展示总数，不需要改。若有待办类型筛选，需要把 `project_acceptance` 加到枚举。

## 2. 费用统计

新增接口：

```http
GET /expense-requests/stats/summary
```

可传和列表类似的过滤参数：

- `status`
- `mode`
- `current_step`
- `employee_id`
- `assignee_id`
- `project_id`
- `keyword`
- `created_from`
- `created_to`

返回示例：

```json
{
  "total_count": 12,
  "total_amount": 38000,
  "status_counts": {
    "draft": 1,
    "pending": 3,
    "approved": 2,
    "rejected": 1,
    "paid": 5,
    "cancelled": 0
  },
  "status_amounts": {
    "pending": 12000,
    "paid": 26000
  },
  "mode_counts": {
    "reimbursement": 8,
    "advance": 4
  }
}
```

统计结果会按当前登录租户和当前用户费用可见范围过滤。

## 3. 短视频与 AI 用量统计

新增接口：

```http
GET /admin/social-video/usage-summary
```

可传：

- `created_from`
- `created_to`

返回结构：

```json
{
  "transcriptions": {
    "total_count": 10,
    "success_count": 8,
    "failed_count": 1,
    "in_progress_count": 1,
    "total_duration_seconds": 320,
    "average_duration_seconds": 40,
    "missing_duration_count": 2
  },
  "scripts": {
    "total_count": 6,
    "success_count": 6,
    "provider_counts": {
      "deepseek": 6
    }
  },
  "ai_calls": {
    "total_count": 6,
    "success_count": 6,
    "prompt_tokens": 12000,
    "completion_tokens": 5000,
    "total_tokens": 17000,
    "missing_token_count": 0
  }
}
```

## 4. Admin 页面建议

MVP 可以先不新建页面，只在自媒体脚本管理页顶部加 3 个摘要块：

- 识别任务：总数 / 成功 / 失败 / 总时长
- 脚本生成：总数 / 成功 / 失败
- AI 用量：调用次数 / token / 缺失 token 数

切换时间过滤时直接重新请求，不需要刷新页面。
