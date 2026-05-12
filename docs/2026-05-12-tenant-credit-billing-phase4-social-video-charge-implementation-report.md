# 租户积分计费 Phase 4 执行记录：短视频转文本真实扣费

日期：2026-05-12

关联文档：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`
- `docs/2026-05-12-tenant-credit-billing-phased-execution-and-acceptance.md`
- `docs/2026-05-12-tenant-credit-billing-phase3-sms-charge-implementation-report.md`

## 1. 本阶段目标

Phase 4 接入短视频转文本真实扣费：

1. 创建任务前校验租户可用积分。
2. 创建任务后按最低门槛预冻结积分。
3. 任务完成后按视频实际时长向上取整分钟扣费。
4. 任务失败时释放冻结积分，不扣费。
5. 缓存复用任务不冻结、不扣费。
6. 账单事件与流水保持幂等。

## 2. 开关

真实扣费由环境变量控制：

```text
SOCIAL_VIDEO_CHARGE_ENABLED=true
```

未开启时，短视频任务仍按原逻辑执行；影子计费仍可通过 billing worker 生成 `estimated` 事件。

## 3. 数据库变更

新增 migration：

```text
supabase/migrations/20260512203000_add_social_video_billing_charge_fields.sql
```

`social_video_transcriptions` 新增字段：

| 字段 | 说明 |
| --- | --- |
| `billing_frozen_credits` | 当前任务冻结积分，默认 `0` |
| `billing_correlation_id` | 串联 `freeze -> unfreeze -> out` 的关联 ID |
| `billing_event_id` | 关联 `tenant_billing_events.id` |
| `billing_charged` | 是否已真实扣费 |
| `billing_charged_at` | 真实扣费时间 |

## 4. 后端链路

创建非缓存任务：

1. 解析当前登录用户所属 `tenant_id`。
2. 命中缓存时直接创建 `billable=false` 的完成任务，不冻结、不扣费。
3. 未命中缓存时，如果 `SOCIAL_VIDEO_CHARGE_ENABLED=true`：
   - 根据 `tenant_pricing_rules(metric_code=social_video_transcription_minute)` 读取最低门槛。
   - 默认门槛为 `60` 积分。
   - 可用积分不足时返回 `TENANT_CREDITS_INSUFFICIENT`。
   - 创建任务后调用 `billing_freeze_credits` 冻结积分。

任务完成：

1. 读取转写结果中的 `audio_duration_seconds` 或 `billing_duration_seconds`。
2. 计算 `billing_minutes = ceil(duration_seconds / 60)`，最少 1 分钟。
3. 生成 `tenant_billing_events(metric_code=social_video_transcription_minute)`。
4. 释放任务冻结积分。
5. 调用 `billing_settle_event` 实扣积分。
6. 更新任务：
   - `billing_event_id`
   - `billing_charged`
   - `billing_charged_at`
   - `billing_frozen_credits=0`

任务失败：

1. 释放冻结积分。
2. 任务标记 `failed`。
3. 不生成实扣流水。

## 5. API 返回变化

短视频转文本任务返回的 `billing` 对象新增：

```json
{
  "billing": {
    "billable": true,
    "duration_seconds": 61,
    "minutes": 2,
    "source": "tencent_asr",
    "cached": false,
    "billed_at": "2026-05-12T12:00:00.000Z",
    "frozen_credits": 0,
    "correlation_id": "uuid",
    "event_id": "uuid",
    "charged": true,
    "charged_at": "2026-05-12T12:00:01.000Z"
  }
}
```

小程序和 admin 不需要传 `tenant_id`。后端仍按当前登录上下文归属租户。

## 6. Admin 对接

本阶段不新增 admin 页面。

现有平台计费中心和租户账务中心可直接看到：

- `tenant_billing_events.metric_code = social_video_transcription_minute`
- `source_type = social_video_transcription`
- `tenant_credit_ledger.direction = freeze / unfreeze / out`

建议展示口径：

- 账单明细显示“视频转文本”。
- 单位显示“分钟”。
- 金额显示“60 积分/分钟，按完成后时长向上取整”。
- `status=failed` 且 `failure_code=SOCIAL_VIDEO_DURATION_MISSING` 时显示“缺少视频时长，未扣费”。

## 7. 微信小程序对接

短视频转文本创建任务接口无需增加参数。

小程序需要处理：

1. 创建任务返回 `TENANT_CREDITS_INSUFFICIENT` 时，提示“当前装修公司积分不足，请联系管理员充值”。
2. 轮询任务时可读取 `billing.charged` 判断是否已扣费。
3. `billing.cached=true` 表示复用缓存结果，本次不扣费。
4. 页面提示建议弱化为“视频转文本按完成后时长计费，60 积分/分钟”。

## 8. 验收标准

必须全部通过后才能进入 Phase 5：

1. 30 秒视频按 1 分钟扣 60 积分。
2. 61 秒视频按 2 分钟扣 120 积分。
3. 创建任务后冻结积分，可用积分减少。
4. 成功完成后冻结释放，实扣积分，最终 `frozen_credits=0`。
5. 失败任务释放冻结，不扣费。
6. 缓存复用任务 `billable=false`，不冻结、不扣费。
7. 缺少时长时生成失败账单事件，不扣费。
8. 余额不足时阻止创建任务。
9. 重复结算同一任务不会重复扣费。
10. `bunx tsc --noEmit -p apps/api/tsconfig.json` 通过。
11. `bun run api:build` 通过。
12. admin build 通过。

## 9. 剩余事项

冻结超时释放的定时任务本阶段未落地。当前失败释放覆盖 worker 抛错场景；进程崩溃、机器重启导致任务长期卡住时，需要后续 Phase 7 的对账和超时回收任务处理。
