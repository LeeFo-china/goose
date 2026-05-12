# 租户积分计费 Phase 2 影子计费实施与验收记录

日期：2026-05-12

## 实施范围

Phase 2 已接入影子计费能力：

- 扫描 `ai_call_logs`、`sms_send_logs`、`social_video_transcriptions`。
- 只生成 `tenant_billing_events(status=estimated)` 或异常事件 `status=failed`。
- 不调用 `billing_settle_event`。
- 不写 `tenant_credit_ledger`。
- 不扣减租户积分余额。

## 后端接口

新增平台接口：

- `POST /platform/billing/shadow-run`
- `GET /platform/billing/events`

`POST /platform/billing/shadow-run` 请求体：

```json
{
  "limit": 100,
  "sources": ["ai", "sms", "social_video"],
  "start_date": "2026-05-01T00:00:00.000Z",
  "end_date": "2026-05-12T23:59:59.999Z"
}
```

说明：

- `limit` 单次最多 500。
- `sources` 不传时默认扫描三类来源。
- 影子计费只允许平台超管执行。

## 计费口径

AI：

- `ai_input_text_token`：`prompt_tokens / 1000 * unit_credits`
- `ai_output_text_token`：`completion_tokens / 1000 * unit_credits`
- `ai_cached_input_token`：`cached_input_tokens / 1000 * unit_credits`
- AI 成功日志缺少 token 时写入异常事件：
  - `metric_code = ai_usage_missing_tokens`
  - `status = failed`
  - `failure_code = AI_USAGE_MISSING_TOKENS`

短信：

- 只扫描 `sms_send_logs.status = success`。
- `sms_domestic_success`：`sms_count * unit_credits`

短视频：

- 只扫描 `social_video_transcriptions.status = completed AND billable = true`。
- 优先使用 `billing_minutes`。
- 其次使用 `ceil((billing_duration_seconds || audio_duration_seconds) / 60)`。
- 缺少时长时写入异常事件：
  - `metric_code = social_video_transcription_minute`
  - `status = failed`
  - `failure_code = SOCIAL_VIDEO_DURATION_MISSING`

## 幂等策略

`tenant_billing_events` 使用唯一键防重：

```text
metric_code + source_type + source_id + coalesce(source_sub_id, '')
```

来源映射：

- AI：`source_type = ai_call_log`
- 短信：`source_type = sms_send_log`
- 短视频：`source_type = social_video_transcription`

同一 worker 重跑时：

- 已存在的事件会跳过。
- 不会重复生成 estimated event。
- 不会扣积分。

## Admin 对接

平台计费中心 `/platform/billing` 已新增：

- 影子计费执行按钮。
- 影子计费事件列表。
- 展示字段：
  - 时间
  - 租户
  - 计费项
  - 场景
  - 来源
  - 用量
  - 预计积分
  - 状态/异常说明

租户端和微信小程序：

- Phase 2 不需要改动。
- Phase 2 不影响租户余额展示。
- 后续 Phase 3/4/6 真扣费时，再补余额不足提示和业务拦截。

## 验收结果

已通过：

```bash
bunx tsc --noEmit -p apps/api/tsconfig.json
bun run api:build
bun run build   # apps/admin
supabase db query --linked   # 事务级 SQL 验收，最后 ROLLBACK
```

远端 SQL 验收覆盖：

- 创建 5 条影子计费事件。
- AI input/output、短信、短视频正常试算。
- AI 缺 token 写入 failed 异常事件。
- estimated 事件合计预计 320 积分。
- 重复事件被唯一索引拦截。
- 不生成 `tenant_credit_ledger`。
- 事务最后 `ROLLBACK`，不保留测试数据。

限制说明：

- 本地通过 Bun 直接运行 Supabase JS 验收脚本时，HTTP 请求在当前环境出现长时间无返回；因此本阶段使用 `supabase db query --linked` 做远端事务级验收，并以 API typecheck/build 覆盖服务代码。

## 下一阶段准入

Phase 2 通过后，可以进入 Phase 3 短信真实扣费。进入前需要确认：

- 平台计费中心可手动运行影子计费。
- estimated / failed 事件能正常展示。
- 影子计费重跑不会重复生成事件。
- 短信真实扣费开关 `SMS_CHARGE_ENABLED` 默认关闭，待验收时再开启。
