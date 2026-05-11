# 小程序短视频脚本 AI 来源与计费对接说明

日期：2026-05-11

## 背景

微信小程序端短视频工具有两段用量：

1. 抖音链接转文本：按视频实际时长向上取整，计入短视频转写分钟。
2. 基于转写文本生成/改写拍摄脚本：调用 AI 模型，按 token 计入租户 AI 用量。

后端已经把脚本生成 AI 调用纳入 `ai_call_logs`，本次补充 `source = customer_miniprogram`，便于 Admin 明细区分这类 token 来自客户小程序。

## 后端实现口径

接口：

- `POST /social-video/transcriptions/:id/script`

AI 调用日志写入：

```json
{
  "scene_code": "social_video_script",
  "tenant_id": "转写任务所属 tenant_id",
  "source": "customer_miniprogram",
  "billable": true
}
```

日志 metadata 会带：

- `auth_user_id`
- `transcription_id`
- `target_platform`
- `style`
- `duration_seconds`
- `goal`
- `repair_attempt`，仅 AI 返回结构不合规后的修复重试有该字段

### 计费规则

- 正常生成脚本：新增 AI 调用日志，计入租户 token。
- AI 返回结构不合规后重试修复：修复调用同样写入 `source=customer_miniprogram`，计入租户 token。
- 命中脚本缓存且 `regenerate=false`：不调用 AI，不新增 token 计费。
- `regenerate=true`：强制重新生成，新增 AI token 计费。

## 微信小程序对接

小程序不需要传 `tenant_id`，继续携带登录 token。

生成脚本请求保持：

```json
{
  "target_platform": "douyin",
  "style": "practical",
  "duration_seconds": 60,
  "goal": "lead_generation",
  "regenerate": false
}
```

小程序需要处理：

- 正常返回：展示脚本内容。
- 返回 `cached=true`：可显示“已复用历史脚本”，不需要提示额外 AI 计费。
- 用户点击重新生成时传 `regenerate=true`：前端可弱提示“重新生成会消耗 AI 用量”。

小程序不要自行计算 token，也不要传计费字段；token 统计以后端 `ai_call_logs` 为准。

## Admin 对接

Admin 已有 AI 明细展示 `source / billable`。

核对位置：

- 租户后台：`/usage?tab=ai`
- 平台后台：`/platform/usage?tab=ai`

预期展示：

- 场景：`social_video_script`
- 来源：`客户小程序`
- 计费：`计费`
- Token：prompt / completion / total
- 租户：通过 `tenant_id` 归属到对应装修公司

Admin 用量概览中的 AI Token、AI 调用次数会自动包含这部分脚本生成 token。

## 验收用例

### 用例 1：首次生成脚本

1. 小程序创建抖音转写任务并等待完成。
2. 调用 `POST /social-video/transcriptions/:id/script`。
3. 打开 Admin `/usage?tab=ai`。

预期：

- 新增一条 `scene_code=social_video_script` 日志。
- `source=customer_miniprogram`，Admin 显示“客户小程序”。
- `billable=true`，Admin 显示“计费”。
- token 汇总增加。

### 用例 2：缓存复用

1. 对同一转写任务使用相同脚本参数再次生成。
2. `regenerate=false`。

预期：

- 接口返回缓存脚本。
- 不新增 AI 调用日志。
- token 汇总不增加。

### 用例 3：重新生成

1. 对同一转写任务传 `regenerate=true`。

预期：

- 新增 `social_video_script` AI 日志。
- `source=customer_miniprogram`。
- token 汇总增加。

## 风险点

- 如果后续 Admin 也复用同一个生成接口，需要再根据调用端显式区分 `source=admin`；当前按小程序业务口径标记为 `customer_miniprogram`。
- 如果 AI 模型不返回 usage，日志仍会写入，但 `total_tokens` 可能为空，Admin 会计入 AI token 缺失。
