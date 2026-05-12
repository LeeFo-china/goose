# Admin 对接文档：AI 试算观察统计

日期：2026-05-12

## 1. 背景

AI 计费当前处于 Phase 5：只生成试算账单，不真实扣租户积分。

进入 Phase 6 真扣费前，需要观察各 AI 场景的 token 分布，并形成 P95 门槛。后端新增平台接口用于 admin 展示观察数据。

## 2. 接口

```http
GET /platform/billing/ai-usage-stats
```

权限：

- 仅平台超管可访问。
- 租户管理员不可访问。

## 3. 查询参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `tenant_id` | uuid | 可选，筛选租户 |
| `scene_code` | string | 可选，筛选 AI 场景 |
| `provider_code` | string | 可选，筛选供应商 |
| `model_code` | string | 可选，筛选模型 |
| `start_date` | string | 可选，开始时间 |
| `end_date` | string | 可选，结束时间 |
| `limit` | number | 默认 `5000`，最大 `10000` |
| `min_sample_count` | number | 默认 `100`，Phase 6 样本门槛 |
| `safety_factor` | number | 默认 `1.5`，P95 积分安全系数 |

## 4. 返回示例

```json
{
  "range": {
    "start_date": null,
    "end_date": null
  },
  "controls": {
    "limit": 5000,
    "min_sample_count": 100,
    "safety_factor": 1.5
  },
  "totals": {
    "groups": 1,
    "logs": 4,
    "billable_samples": 4,
    "missing_usage": 0,
    "ready_groups": 0
  },
  "list": [
    {
      "scene_code": "social_video_script",
      "provider_code": "deepseek",
      "model_code": "deepseek-chat",
      "model_name": "deepseek-chat",
      "total_logs": 4,
      "billable_sample_count": 4,
      "missing_usage_count": 0,
      "cached_input_token_call_count": 0,
      "reasoning_token_call_count": 0,
      "token_percentiles": {
        "p50": 150,
        "p90": 280,
        "p95": 280,
        "p99": 280
      },
      "credit_percentiles": {
        "p50": 4,
        "p90": 6,
        "p95": 6,
        "p99": 6
      },
      "suggested_min_charge_credits": 9,
      "ready_for_phase6": false
    }
  ]
}
```

## 5. 页面建议

建议放在平台计费中心的“AI 试算观察”区域。

列表列建议：

- AI 场景
- 供应商
- 模型
- 有效样本数
- 缺 token 数
- Token P50/P90/P95/P99
- 积分 P50/P90/P95/P99
- 建议最低门槛积分
- 是否满足 Phase 6 样本门槛

`ready_for_phase6=false` 时，不建议允许一键开启真扣费。

## 6. 小程序影响

本接口只服务平台 admin，小程序不需要对接。

小程序端仍保持：

- 不传 `tenant_id`。
- 客户 AI 调用由后端解析租户。
- Phase 5 不拦截、不真扣费。
