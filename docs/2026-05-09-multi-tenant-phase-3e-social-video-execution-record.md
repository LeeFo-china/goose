# 多租户阶段 3E 执行记录：自媒体短视频识别与脚本

日期：2026-05-09

## 范围

本阶段处理短视频识别和自媒体脚本生成模块的租户隔离，覆盖抖音链接转写任务、异步 worker、Apify 解析、腾讯云 ASR、脚本生成、脚本缓存和 admin 脚本列表。

## 已完成

### 数据库

- 新增 migration：`20260509173000_tenant_scope_social_video.sql`。
- 给 `social_video_transcriptions` 增加并回填 `tenant_id`。
- 给 `social_video_scripts` 增加并回填 `tenant_id`。
- 历史转写任务回填到默认租户。
- 历史脚本优先从所属转写任务继承租户，缺失时回退默认租户。
- 重建 `claim_next_social_video_transcription` RPC，确保 worker 领取任务时返回完整任务行，包括 `tenant_id`。
- 增加租户复合索引：
  - `idx_social_video_transcriptions_tenant_hash_completed`
  - `idx_social_video_transcriptions_tenant_created_by`
  - `idx_social_video_transcriptions_tenant_status_created`
  - `idx_social_video_scripts_tenant_transcription`
  - `idx_social_video_scripts_tenant_user_created`
  - `idx_social_video_scripts_tenant_cache`

### 后端

- 创建短视频识别任务时解析租户上下文：
  - 员工端使用 `AuthContext.tenantId`。
  - 客户/小程序端从 `customers.user_id` 解析唯一客户租户。
  - 如果同一账号绑定多个客户租户，MVP 返回 `SOCIAL_VIDEO_TENANT_AMBIGUOUS`，避免任务落错租户。
- 转写任务写入 `tenant_id`。
- 同链接缓存按 `tenant_id + input_hash` 复用，避免跨租户复用历史结果。
- 单用户每日识别上限按 `tenant_id + auth_user_id` 统计。
- 查询转写任务时按当前租户过滤。
- worker 领取任务后日志带 `tenant_id`。
- worker 处理 Apify、下载、ffmpeg、腾讯云 ASR 链路时保留任务租户字段。
- 脚本生成从转写任务继承 `tenant_id`。
- 脚本缓存按 `tenant_id + transcription_id + target_platform + style + duration + goal` 复用。
- 脚本每日生成上限按 `tenant_id + user_id` 统计。
- 转写任务脚本历史列表按转写任务租户过滤。
- admin 脚本列表按当前租户过滤。

## 音视频时长

- `audio_duration_seconds` 保留在 `social_video_transcriptions`。
- Apify 解析结果如果返回 `duration`，会写入 `audio_duration_seconds`。
- 腾讯云 ASR 返回 `audioDurationSeconds` 时优先使用 ASR 时长，否则回退 Apify 解析时长。
- 时长允许为空；无法获取时长不阻塞转写任务完成。

## 暂未处理

- 租户级短视频用量统计接口未在本阶段新增。
- `tenant_social_video_usage_daily` 汇总表未创建，后续用量报表阶段处理。
- AI token 统计和多 provider 场景路由仍放在后续 3G 阶段处理。

## 验证

- `bun run api:build` 通过。
- `bun run api:typecheck` 通过。
