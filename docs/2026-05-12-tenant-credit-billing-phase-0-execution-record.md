# 租户积分计费系统阶段 0 执行记录

日期：2026-05-12
执行分支：`feature/multi-tenant`
关联文档：

- `docs/2026-05-12-tenant-prepaid-credit-billing-implementation-plan.md`
- `docs/2026-05-12-tenant-credit-billing-phase1-backend-integration.md`
- `docs/2026-05-12-tenant-credit-billing-phased-execution-and-acceptance.md`

## 实施内容

- 已提交计费系统三份规划文档：
  - 总体落地方案
  - 阶段 1 后端对接实施文档
  - 分阶段执行步骤与验收标准
- 已确认远端 migration 状态到 `20260512183000`。
- 已确认 AI 模型路由基础能力存在：
  - `ai_providers`
  - `ai_models`
  - `ai_scene_routes`
  - `/platform/ai-config`
  - admin `/platform/ai-models`
- 已确认 `marketing_page_create_fill` 场景路由存在且为 `active`。
- 已确认 `ai_call_logs` 已具备精细计费字段：
  - `raw_usage`
  - `cached_input_tokens`
  - `reasoning_tokens`
- 已确认短信和视频转文本日志表具备阶段 1/2/3 所需的租户归属基础字段。
- 已确认测试租户可用。

## 测试命令

```bash
supabase migration list | tail -n 12
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
pnpm --dir apps/admin exec tsc --noEmit
bun run api:build
bun run admin:build
supabase db query --linked --output table "select scene_code, name, status from public.ai_scene_routes where scene_code in ('marketing_page_create_fill','decoration_qa','social_video_script') order by scene_code;"
supabase db query --linked --output table "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_call_logs' and column_name in ('raw_usage','cached_input_tokens','reasoning_tokens','tenant_id','scene_code','provider_code','model_code') order by column_name;"
supabase db query --linked --output table "select table_name, column_name from information_schema.columns where table_schema = 'public' and ((table_name = 'sms_send_logs' and column_name in ('tenant_id','status','sms_count')) or (table_name = 'social_video_transcriptions' and column_name in ('tenant_id','billable','billing_duration_seconds','billing_minutes','billed_at'))) order by table_name, column_name;"
supabase db query --linked --output table "select id, name, slug, status from public.tenants order by created_at desc limit 5;"
```

## 数据验收

### migration 状态

远端已应用到：

```text
20260512183000 | 20260512183000 | 2026-05-12 18:30:00
```

### AI 场景路由

远端查询结果：

| scene_code | name | status |
| --- | --- | --- |
| `decoration_qa` | 装修问答 | active |
| `marketing_page_create_fill` | H5 活动页创建 AI 回填 | active |
| `social_video_script` | 短视频脚本生成 | active |

### `ai_call_logs` 字段

远端已存在：

- `tenant_id`
- `scene_code`
- `provider_code`
- `model_code`
- `raw_usage`
- `cached_input_tokens`
- `reasoning_tokens`

### 短信日志字段

远端 `sms_send_logs` 已存在：

- `tenant_id`
- `status`
- `sms_count`

阶段 3 前仍需补：

- `delivery_status`
- `billed`
- `billed_at`

### 视频转文本字段

远端 `social_video_transcriptions` 已存在：

- `tenant_id`
- `billable`
- `billing_duration_seconds`
- `billing_minutes`
- `billed_at`

### 测试租户

远端可用测试租户：

| tenant_id | name | slug | status |
| --- | --- | --- | --- |
| `11111111-1111-4111-8111-111111111111` | 验收测试租户 A | tenant_verify_a | active |
| `22222222-2222-4222-8222-222222222222` | 验收测试租户 B | tenant_verify_b | active |
| `51111111-1111-4111-8111-111111111111` | 5H 验收租户 A | phase5h_verify_a | active |
| `52222222-2222-4222-8222-222222222222` | 5H 验收租户 B | phase5h_verify_b | active |

阶段 1 建议优先使用：

```text
11111111-1111-4111-8111-111111111111
22222222-2222-4222-8222-222222222222
```

## API 验收

- `pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit`：通过。
- `bun run api:build`：通过。
- `/platform/ai-config` 后端文件已存在并已纳入路由注册。

## admin / 小程序验收

### admin

- `pnpm --dir apps/admin exec tsc --noEmit`：通过。
- `bun run admin:build`：通过。
- admin build 输出中已包含：

```text
/platform/ai-models
```

### 小程序

阶段 0 只做后端基线确认，小程序未改动。

小程序阶段 1 需要对接：

- `GET /billing/account`
- `GET /billing/feature-estimates`
- 余额不足错误码展示

## 遗留问题

1. 阶段 1 尚未实现积分账户、订单、总账、billing event、价格规则和 RPC。
2. 阶段 3 前需要补齐 `sms_send_logs.delivery_status / billed / billed_at`。
3. 计费开关当前为文档口径，阶段 1 实现时需要落到环境变量或 `system_settings`：
   - `BILLING_CHARGE_ENABLED`
   - `SMS_CHARGE_ENABLED`
   - `SOCIAL_VIDEO_CHARGE_ENABLED`
   - `AI_CHARGE_ENABLED`
4. 小程序余额接口尚未实现。

## 是否允许进入下一阶段

结论：允许进入阶段 1。

原因：

- 远端 migration 已对齐。
- AI 路由和精细 usage 字段已具备。
- 短信和视频日志具备租户归属基础。
- 测试租户可用。
- API typecheck、API build、admin typecheck、admin build 均通过。

下一阶段：

- 按 `docs/2026-05-12-tenant-credit-billing-phase1-backend-integration.md` 开始阶段 1 计费底座实现。
