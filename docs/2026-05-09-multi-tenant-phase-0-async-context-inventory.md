# 多租户阶段 0 异步任务租户上下文清单

日期：2026-05-09

## 目标

识别所有脱离 HTTP 请求上下文的链路，确保后续不会因为缺少 `AuthContext.tenantId` 导致误用默认租户或跨租户处理数据。

## 异步链路清单

| 链路 | 当前位置 | 租户化要求 | 阶段 |
| --- | --- | --- | --- |
| 短视频转写 worker | `apps/api/src/workers/social-video-transcription-worker.ts` | `social_video_transcriptions` 必须持久化 `tenant_id`，worker 从任务记录加载 | 阶段 3 |
| 短视频超时任务回收 | `claim_next_social_video_transcription` RPC | RPC 返回任务时必须包含 `tenant_id` | 阶段 3 |
| 腾讯云 ASR 轮询 | `apps/api/src/services/tencent-asr.ts` | 从转写任务继承租户，日志写入租户归因 | 阶段 3 |
| 工序验收短信 ticket | `project_acceptance_open_tickets` | ticket 表增加/关联租户上下文 | 阶段 3 |
| 工序验收短信发送 | `project-acceptances.ts` + `sms.ts` | 通知和短信记录必须带 `tenant_id` | 阶段 3 |
| H5 表单提交 | `marketing-pages.ts` | 通过 page slug 反查租户，不信任前端 tenant | 阶段 4 |
| H5 线索去重 | `marketing_leads` | 去重范围改为租户内 | 阶段 4 |
| 员工分享短码 | `tenant_share_links` | share token 持久化租户和分享员工 | 阶段 4 |
| 平台线索分配 | `platform_leads` | 平台线索分配到租户时写入 `assigned_tenant_id` | 阶段 4 |
| 平台指标汇总 | 后续定时任务 | 按租户分批聚合，不能使用默认租户兜底 | 阶段 6 |

## 统一规则

- 创建异步任务时必须持久化 `tenant_id`。
- worker 执行任务时从任务记录主动加载 `tenant_id`。
- 定时任务按 `tenant_id` 分批处理。
- 平台级任务必须显式标记 `scope = platform`。
- 获取不到租户上下文时，租户业务任务应失败并记录错误，不写入默认租户。

## 阶段 1 不处理的链路

阶段 1 只建立默认租户和身份上下文，不改 worker 行为。

阶段 3 起必须处理：

- 短视频转写 worker。
- 工序验收短信 ticket。
- 费用/任务中心待办聚合。

阶段 4 起必须处理：

- H5 表单线索。
- 员工拓客分享。
- 平台访客线索分配。

