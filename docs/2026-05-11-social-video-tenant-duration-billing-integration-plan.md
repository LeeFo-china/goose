# 抖音链接转文本视频分钟计费落地方案

日期：2026-05-11

## 背景

微信小程序端已有抖音链接转文本能力，后端会创建 `social_video_transcriptions` 任务，并在 worker 中通过 Apify 解析媒体、腾讯云 ASR 或 Apify 转写生成文本。当前任务已经具备租户归属字段 `tenant_id`，脚本生成 AI token 也会通过 `ai_call_logs` 计入租户。

但“视频分钟时长计费”还没有完整接入统一租户用量链路：

- 转写任务会落 `tenant_id` 和 `audio_duration_seconds`。
- 脚本生成 AI token 会按 `scene_code = social_video_script` 写入 `ai_call_logs`。
- `/usage/summary` 和 `/platform/usage` 当前只汇总 AI token 与短信，不汇总短视频转写分钟。
- `tenant_usage_daily` 已有 `social_video_transcription_count / social_video_duration_seconds / social_video_missing_duration_count` 字段，但没有看到后端实际汇总写入或接口返回。

## 目标

1. 小程序客户使用抖音链接转文本时，视频分钟用量必须计入客户所属租户。
2. 失败任务、未调用外部转写的缓存复用任务不应误计费。
3. 计费口径要明确到“秒”和“分钟”，分钟建议向上取整。
4. Admin 能看到租户维度的短视频转写次数、计费分钟、缺失时长异常。
5. 小程序能展示任务时长、预计/实际计费分钟和计费说明，但不由前端决定计费。

## 计费口径

### 推荐口径

- 计费对象：`social_video_transcriptions` 中真实触发外部解析/ASR 的任务。
- 计费状态：仅 `status = completed` 且 `billable = true`。
- 计费时长：优先使用 `billing_duration_seconds`，兜底使用 `audio_duration_seconds`。
- 计费分钟：`ceil(duration_seconds / 60)`，最低 1 分钟。
- 缓存复用：`cached = true` 创建的复制任务不计费，保留功能记录。
- 失败任务：不计费，但要统计失败次数用于排查。
- 时长缺失：任务完成但时长为空时不进入分钟计费，进入 `missing_duration_count`。

示例：

| 视频时长 | 计费分钟 |
| --- | --- |
| 1-60 秒 | 1 分钟 |
| 61-120 秒 | 2 分钟 |
| 121-180 秒 | 3 分钟 |

## 后端落地

### 1. 数据库迁移

新增迁移，扩展 `social_video_transcriptions` 的计费字段：

```sql
ALTER TABLE public.social_video_transcriptions
ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS billing_duration_seconds numeric(12, 2) NULL,
ADD COLUMN IF NOT EXISTS billing_minutes integer NULL,
ADD COLUMN IF NOT EXISTS billing_source text NULL,
ADD COLUMN IF NOT EXISTS billed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_tenant_billing_created
ON public.social_video_transcriptions(tenant_id, billable, status, created_at DESC);
```

字段含义：

- `billable`：是否进入租户分钟计费。
- `billing_duration_seconds`：最终计费秒数。
- `billing_minutes`：最终计费分钟，按 `ceil(seconds / 60)`。
- `billing_source`：`tencent_asr`、`apify`、`cache`、`manual_backfill` 等。
- `billed_at`：计费字段确认时间。

历史数据回填建议：

- `status = completed` 且 `audio_duration_seconds is not null` 的历史任务，按 `ceil(audio_duration_seconds / 60)` 回填。
- 无法判断是否缓存复用的历史数据，可以先 `billable = false` 或通过 `raw_payload`/创建时间人工抽样确认后回填，避免多计费。

### 2. 转写任务创建

文件：`apps/api/src/services/social-video-transcriptions.ts`

创建普通任务时：

- `tenantId` 继续由 `resolveTenantId(authContext)` 得到。
- 新任务默认 `billable = true`。

命中缓存时：

- 复制任务应设置 `billable = false`。
- `billing_source = "cache"`。
- 可返回原视频时长和文本，但不产生新的计费分钟。

### 3. Worker 完成任务时确认计费字段

文件：`apps/api/src/services/social-video-transcriptions.ts`

腾讯云 ASR 路径完成时：

```ts
const durationSeconds = asrResult.audioDurationSeconds ?? media.durationSeconds ?? null;
const billingMinutes = durationSeconds
  ? Math.max(1, Math.ceil(durationSeconds / 60))
  : null;
```

更新任务：

- `audioDurationSeconds = durationSeconds`
- `billingDurationSeconds = durationSeconds`
- `billingMinutes = billingMinutes`
- `billingSource = asrResult.provider`
- `billedAt = new Date().toISOString()`，仅当 `durationSeconds` 有值

Apify 直接转写路径当前没有写入 `audioDurationSeconds`，需要从 Apify item 的 `duration` 里读取并保存。如果 Apify 转写结果没有 duration：

- `billing_minutes = null`
- `billable = true`
- 用量统计中 `missing_duration_count + 1`
- Admin 显示“时长缺失”，方便人工排查供应商返回。

### 4. Repository 补充字段

文件：`apps/api/src/repositories/social-video-transcriptions.ts`

需要补充：

- `SocialVideoTranscriptionRecord` 增加 `billable / billing_duration_seconds / billing_minutes / billing_source / billed_at`。
- `create()` 支持传入 `billable`。
- `update()` 支持更新计费字段。
- `listUsageStatsRows()` 查询这些字段。

### 5. 统一用量接口接入短视频分钟

文件：

- `apps/api/src/services/usage.ts`
- `apps/api/src/schema/usage.ts`
- `apps/api/src/controllers/usage/index.ts`

新增 summary 类型：

```ts
type UsageSocialVideoSummary = {
  transcription_count: number;
  billable_transcription_count: number;
  success_count: number;
  failure_count: number;
  duration_seconds: number;
  billable_minutes: number;
  missing_duration_count: number;
  provider_counts: Record<string, number>;
};
```

`getTenantSummary()` 返回：

```json
{
  "social_video": {
    "transcription_count": 12,
    "billable_transcription_count": 8,
    "success_count": 10,
    "failure_count": 2,
    "duration_seconds": 1532,
    "billable_minutes": 28,
    "missing_duration_count": 1,
    "provider_counts": {
      "tencent_asr": 7,
      "apify": 3
    }
  }
}
```

`listPlatformTenantUsage()` 每个租户也返回 `social_video`，平台后台可直接在租户用量列表展示。

### 6. 明细接口

建议新增租户和平台短视频用量明细：

- `GET /usage/social-video-logs`
- `GET /platform/usage/social-video-logs`

查询参数：

- `page`
- `pageSize`
- `tenant_id`，仅平台接口支持
- `status`
- `provider`
- `billable`
- `date_from`
- `date_to`

返回字段：

- `id`
- `tenant_id`
- `platform`
- `source_url`，Admin 可脱敏或只展示域名
- `status`
- `provider`
- `audio_duration_seconds`
- `billing_minutes`
- `billable`
- `billing_source`
- `error_code`
- `error_message`
- `created_at`
- `completed_at`

## Admin 对接

### 1. 租户用量页 `/usage`

文件参考：

- `apps/admin/components/usage/usage-types.ts`
- `apps/admin/components/usage/usage-summary-cards.tsx`
- `apps/admin/components/usage/usage-logs-tables.tsx`
- `apps/admin/app/(console)/usage/page.tsx`

需要新增：

- Summary 类型增加 `social_video`。
- 顶部卡片增加“短视频转写分钟”。
- 可增加次级指标：转写次数、失败次数、时长缺失。
- 明细区增加“短视频转写”Tab 或独立表格。

推荐卡片：

- 标题：短视频转写
- 主数值：`billable_minutes` 分钟
- 副文案：`transcription_count` 次，缺失时长 `missing_duration_count` 条

### 2. 平台用量页 `/platform/usage`

文件参考：

- `apps/admin/components/usage/platform-usage-table.tsx`
- `apps/admin/app/(console)/platform/usage/page.tsx`

需要新增列：

- 短视频分钟：`row.original.social_video.billable_minutes`
- 转写次数：`row.original.social_video.transcription_count`
- 异常：`row.original.social_video.missing_duration_count`

筛选不一定第一期增加；第一期先跟随日期范围和租户筛选即可。

### 3. Admin 文案

建议统一文案：

- “短视频转写分钟”：用于租户计费。
- “时长缺失”：供应商未返回有效视频/音频时长，未计入分钟，需要排查。
- “缓存复用”：用户复用历史转写结果，不重复计费。

## 微信小程序对接

### 1. 创建转写任务

接口不需要改路径：

- `POST /social-video/transcriptions`

请求保持：

```json
{
  "platform": "douyin",
  "url": "https://v.douyin.com/..."
}
```

后端返回建议增加字段：

```json
{
  "id": "uuid",
  "status": "pending",
  "audio_duration_seconds": null,
  "billing": {
    "billable": true,
    "duration_seconds": null,
    "minutes": null,
    "source": null,
    "cached": false
  }
}
```

小程序展示：

- 创建成功后显示“正在识别”。
- 不在提交前承诺具体费用，因为真实时长以后端解析为准。
- 可以弱提示：“转写按视频实际时长向上取整计费，缓存复用不重复计费。”

### 2. 查询转写任务

接口不需要改路径：

- `GET /social-video/transcriptions/:id`

完成后返回：

```json
{
  "status": "completed",
  "audio_duration_seconds": 83.2,
  "billing": {
    "billable": true,
    "duration_seconds": 83.2,
    "minutes": 2,
    "source": "tencent_asr",
    "cached": false
  }
}
```

小程序展示：

- 状态完成后展示“视频时长 1分23秒，计费 2 分钟”。
- 如果 `billing.billable = false`，展示“已复用历史识别结果，本次不重复计费”。
- 如果 `billing.minutes = null`，不展示计费分钟，展示“时长待确认”或隐藏计费区。

### 3. 生成脚本

接口：

- `POST /social-video/transcriptions/:id/script`

这条链路继续按 AI token 计费，已走 `ai_call_logs`。小程序无需承担计费判断，只需要正常展示脚本生成结果。

## 验收清单

### 后端

- 客户账号创建抖音转写任务，`social_video_transcriptions.tenant_id` 为客户租户。
- worker 完成后写入 `audio_duration_seconds / billing_duration_seconds / billing_minutes / billed_at`。
- 命中缓存复制任务时 `billable = false`，不累计分钟。
- 失败任务不累计分钟。
- `/usage/summary` 返回 `social_video` 汇总。
- `/platform/usage` 返回每个租户的 `social_video` 汇总。
- 明细接口能按租户、日期、状态、是否计费筛选。

### Admin

- 租户用量页展示短视频计费分钟。
- 平台租户用量列表展示每个租户短视频计费分钟。
- 明细表能看到任务状态、供应商、时长、计费分钟、是否计费、错误信息。
- 时长缺失记录有明显提示。

### 微信小程序

- 创建任务后能正常轮询。
- 完成后展示视频时长和计费分钟。
- 缓存复用任务展示“不重复计费”。
- 失败任务不展示计费分钟。

## 实施顺序

1. 后端 migration：增加计费字段和索引。
2. 后端 repository/service：写入 `billable / billing_minutes`。
3. 后端 usage：统一用量 summary 和明细接口接入 `social_video`。
4. Admin：更新类型、summary card、平台列表列、明细表。
5. 微信小程序：更新任务结果展示和计费提示。
6. 回归验证：真实租户账号跑一条新抖音链接、一条缓存复用、一条失败任务。

## 风险点

- Apify 直接转写路径可能不返回 duration，需要保留缺失统计。
- 历史缓存复制任务如果没有显式字段，不能直接按 completed 全量回填计费。
- 前端不要自己根据链接或本地视频推算费用，必须使用后端返回的 `billing.minutes`。
- 如果后续接入套餐扣费，扣费应基于 `billing_minutes` 幂等处理，不能按接口轮询重复扣。
