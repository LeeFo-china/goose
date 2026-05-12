# 租户积分计费 Phase 5 执行记录：AI 试算

日期：2026-05-12

关联文档：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`
- `docs/2026-05-12-tenant-credit-billing-phased-execution-and-acceptance.md`
- `docs/2026-05-12-tenant-credit-billing-phase4-social-video-charge-implementation-report.md`

## 1. 本阶段目标

Phase 5 只做 AI 试算，不真实扣租户积分：

1. AI 调用写入 `ai_call_logs`。
2. billing worker 从 `ai_call_logs` 生成 `tenant_billing_events(status=estimated)`。
3. 按 `scene_code + provider_code + model_code` 命中价格规则。
4. 拆分生成：
   - `ai_input_text_token`
   - `ai_output_text_token`
   - `ai_cached_input_token`
5. `AI_CHARGE_ENABLED=false`。
6. 观察 1-2 周 token 分布后再进入 AI 真扣费。

## 2. 本次修复

### 2.1 H5 AI 租户归属

发现问题：

- 租户端 H5 `ai-fill-block` 和 `ai-fill-settings` 已走 `aiGateway`，但没有传 `tenantId`。
- 这些日志会写入 `ai_call_logs`，但 `tenant_id` 为空。
- Phase 5 worker 只扫描 `tenant_id is not null` 的成功日志，因此这些调用无法生成租户试算账单。

修复：

- 租户端：
  - `/marketing-pages/ai-fill-create`
  - `/marketing-pages/:id/ai-fill-block`
  - `/marketing-pages/:id/ai-fill-settings`
- 以上接口统一传入：
  - `tenantId = authContext.tenantId`
  - `source = admin`
  - `billable = Boolean(authContext.tenantId)`
  - `authUserId`

平台超管侧：

- `/platform/marketing-pages/*/ai-fill-*`
- 统一传入：
  - `tenantId = null`
  - `source = platform_admin`
  - `billable = false`

这样平台运营使用 AI 不会计入某个租户账户。

### 2.2 价格规则字段映射

发现问题：

- 真实表 `tenant_pricing_rules` 字段是：
  - `unit_name`
  - `unit_price_credits`
  - `provider_code`
  - `model_code`
- 后端 repository 类型使用的是：
  - `unit`
  - `unit_credits`
  - `provider`
  - `model`

导致 AI shadow-run 创建账单事件时 `unit_name = null`，触发数据库非空约束。

修复：

- `billingRepository.listPricingRules()` 统一把数据库字段映射为 service 使用的领域字段。
- `createPricingRule()` 和 `updatePricingRule()` 写入真实数据库字段。
- `scope` 不落库，读取时根据 `tenant_id` 推导：
  - `tenant_id is null` => `platform_default`
  - `tenant_id is not null` => `tenant_override`

## 3. 远端验收

### 3.1 AI shadow-run

执行：

```text
billingService.runShadowBilling({ limit: 500, sources: ["ai"] })
```

首次执行结果：

```json
{
  "ai": {
    "scanned": 4,
    "created": 8,
    "skipped": 0,
    "failed": 0,
    "estimated_credits": 20
  }
}
```

重复执行结果：

```json
{
  "ai": {
    "scanned": 4,
    "created": 0,
    "skipped": 8,
    "failed": 0,
    "estimated_credits": 0
  }
}
```

结论：

- AI estimated event 可生成。
- 同一 `ai_call_logs` 重跑不会重复生成 event。
- 当前已有可试算日志集中在 `social_video_script`。

### 3.2 缺 token 异常

插入临时 AI 成功日志，但不写 token：

- `prompt_tokens = null`
- `completion_tokens = null`
- `cached_input_tokens = null`

worker 结果：

```text
metric_code = ai_usage_missing_tokens
status = failed
failure_code = AI_USAGE_MISSING_TOKENS
credits = 0
```

临时日志和临时账单事件已清理。

### 3.3 当前账单事件汇总

远端当前 AI estimated event：

| metric_code | scene_code | status | events | credits |
| --- | --- | --- | ---: | ---: |
| `ai_input_text_token` | `social_video_script` | `estimated` | 4 | 6 |
| `ai_output_text_token` | `social_video_script` | `estimated` | 4 | 14 |

## 4. 当前 P95 统计

远端当前样本：

| scene_code | provider | model | sample_count | p50_tokens | p90_tokens | p95_tokens | p99_tokens |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `social_video_script` | `deepseek` | `deepseek-chat` | 4 | 150 | 280 | 280 | 280 |

当前样本量不足，不能作为 Phase 6 的正式门槛依据。

建议观察期：

- 至少 1-2 周。
- 每个核心场景至少 100 条成功样本。
- 重点场景：
  - `decoration_qa`
  - `marketing_page_create_fill`
  - `marketing_page_block_fill`
  - `marketing_page_settings_fill`
  - `social_video_script`

## 5. Admin 对接

本阶段新增平台观察接口：

```text
GET /platform/billing/ai-usage-stats
```

对接文档：

- `docs/application_integration_documentation/2026-05-12-admin-ai-shadow-usage-stats-integration.md`

现有平台计费中心应能查看：

- `source_type = ai_call_log`
- `metric_code in (ai_input_text_token, ai_output_text_token, ai_cached_input_token, ai_usage_missing_tokens)`
- `status = estimated / failed`
- `scene_code / provider / model`

如果 admin 页面后续要增强，建议增加：

1. AI 场景筛选。
2. AI 模型筛选。
3. P50/P90/P95/P99 统计区。
4. “建议最低门槛积分”展示。

## 6. 微信小程序对接

本阶段小程序不需要新增参数。

需要注意：

1. 客户小程序 AI 调用必须继续由后端解析租户，不允许前端传 `tenant_id`。
2. 小程序端短视频脚本生成已经写入：
   - `scene_code = social_video_script`
   - `source = customer_miniprogram`
   - `tenant_id = 当前客户所属租户`
3. Phase 5 只生成 estimated event，不拦截、不扣费。

## 7. 阶段结论

Phase 5 后端试算能力已可用，但不建议立即进入 Phase 6。

原因：

1. 当前有效样本只有 `social_video_script` 4 条，样本量不足。
2. 历史 H5 AI 日志缺少 `tenant_id`，修复后需要重新积累数据。
3. `decoration_qa` 当前远端样本没有可试算的租户成功 token 数据。

进入 Phase 6 前必须满足：

1. `decoration_qa / H5 AI / social_video_script` 都有稳定租户日志。
2. 每个主要场景形成 P95 报告。
3. 平台确认每个场景的 `min_charge_credits`。
4. 再打开 `AI_CHARGE_ENABLED=true` 做真实扣费。
