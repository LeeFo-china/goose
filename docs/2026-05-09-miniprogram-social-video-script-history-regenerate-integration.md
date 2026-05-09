# 小程序自媒体脚本历史与重新生成对接文档

日期：2026-05-09

## 1. 背景

后端已在短视频脚本 v2.1 基础上补充两个能力：

1. 查询同一个转写任务下的历史脚本。
2. 生成脚本时支持 `regenerate=true` 绕过缓存重新生成。

小程序端可以据此优化体验：

```text
识别文本完成
-> 先拉取历史脚本
-> 有历史结果时直接展示最近一次
-> 用户点击重新生成时传 regenerate=true
```

## 2. 查询历史脚本

### 2.1 接口

```http
GET /social-video/transcriptions/:id/scripts
Authorization: Bearer <token>
```

路径参数：

| 参数 | 说明 |
| --- | --- |
| `id` | 转写任务 ID |

查询参数：

| 参数 | 类型 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `page` | `number` | 否 | `1` | 页码 |
| `pageSize` | `number` | 否 | `20` | 每页数量，最大 50 |
| `target_platform` | `string` | 否 | - | `douyin/xiaohongshu/shipinhao/kuaishou` |
| `style` | `string` | 否 | - | `practical/seeding/professional/down_to_earth` |
| `status` | `string` | 否 | - | `completed/failed` |

推荐小程序第一版请求：

```http
GET /social-video/transcriptions/:id/scripts?page=1&pageSize=20
```

如果页面按平台筛选：

```http
GET /social-video/transcriptions/:id/scripts?page=1&pageSize=20&target_platform=douyin
```

### 2.2 成功响应

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "script-id",
        "transcription_id": "transcription-id",
        "status": "completed",
        "target_platform": "douyin",
        "style": "practical",
        "duration_seconds": 60,
        "goal": "lead_generation",
        "title": "装修避坑短视频脚本",
        "hook": "装修前不注意这3点，后期很容易返工。",
        "rewritten_copy": "完整口播文案...",
        "shooting_script": [
          {
            "scene": 1,
            "duration": "0-5s",
            "shot": "镜头对准施工现场",
            "voiceover": "装修前这3个坑一定要避开。",
            "caption": "装修前必看"
          }
        ],
        "cover_text_options": ["装修前必避的3个坑"],
        "caption_options": ["准备装修的朋友，先把这几个点记下来。"],
        "tips": ["开头3秒直接讲痛点。"],
        "source_text_length": 512,
        "cached": false,
        "created_at": "2026-05-09T10:30:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

说明：

- `items` 按 `created_at` 倒序返回。
- 历史列表里的 `cached` 固定没有业务意义，小程序不需要展示。
- 小程序可以直接复用脚本结果展示组件。

## 3. 重新生成脚本

### 3.1 接口

仍使用当前生成接口：

```http
POST /social-video/transcriptions/:id/script
Authorization: Bearer <token>
Content-Type: application/json
```

普通生成：

```json
{
  "target_platform": "douyin",
  "style": "practical",
  "duration_seconds": 60,
  "goal": "lead_generation"
}
```

强制重新生成：

```json
{
  "target_platform": "douyin",
  "style": "practical",
  "duration_seconds": 60,
  "goal": "lead_generation",
  "regenerate": true
}
```

### 3.2 规则

- `regenerate` 不传或为 `false`：优先命中缓存。
- `regenerate=true`：跳过缓存，直接请求 AI 重新生成。
- `regenerate=true` 仍会计入每日生成次数。
- 重新生成成功后会新增一条脚本记录，历史列表能看到。

## 4. Admin 后台脚本列表

后台用于运营查看和排查，不建议小程序端直接调用。

```http
GET /admin/social-video/scripts?page=1&pageSize=12
Authorization: Bearer <admin-token>
```

可选过滤：

```http
GET /admin/social-video/scripts?target_platform=douyin&style=practical&status=completed
```

权限要求：

```text
social_video_transcription.manage
```

返回结构与小程序脚本历史一致：

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 12
  }
}
```

admin 页面路径：

```text
/social-video
```

页面能力：

- 查看全部小程序端生成的脚本记录。
- 按目标平台、风格、状态筛选。
- 复制完整脚本文案，用于运营复盘或二次编辑。

## 5. 推荐小程序交互

### 5.1 进入页面

当转写任务 `completed` 且 `text` 非空：

1. 调用历史脚本列表接口。
2. 如果 `items.length > 0`：
   - 默认展示最新一条脚本。
   - 展示“历史脚本”入口或折叠列表。
3. 如果没有历史脚本：
   - 继续展示“AI改写脚本”按钮。

### 5.2 生成按钮

建议按钮分两个场景：

```text
没有历史脚本：AI改写脚本
已有历史脚本：重新生成
```

重新生成时传：

```json
{
  "regenerate": true
}
```

同时保留当前平台参数。

### 5.3 历史脚本展示

历史 item 建议展示：

- 平台：抖音 / 小红书
- 风格：实用口播 / 种草分享
- 标题
- 生成时间
- 操作：查看 / 复制

如果第一版不想做单独历史列表，也可以只取最新一条自动回显。

## 6. 错误处理

继续复用脚本生成错误码：

| 错误码 | 小程序文案 |
| --- | --- |
| `SOCIAL_VIDEO_TRANSCRIPTION_NOT_FOUND` | 识别任务不存在，请重新提取 |
| `SOCIAL_VIDEO_TRANSCRIPTION_FORBIDDEN` | 你没有权限查看这个视频脚本 |
| `SOCIAL_VIDEO_TRANSCRIPTION_NOT_COMPLETED` | 视频还在识别中，请稍后再试 |
| `SOCIAL_VIDEO_TRANSCRIPTION_TEXT_EMPTY` | 识别文本为空，无法生成脚本 |
| `SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_EXCEEDED` | 今日生成次数已用完 |
| `SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT` | 生成超时，请稍后重试 |
| `SOCIAL_VIDEO_SCRIPT_AI_FAILED` | 生成失败，请重试 |
| `SOCIAL_VIDEO_SCRIPT_PARSE_FAILED` | 生成结果格式异常，请重试 |

历史列表接口如果返回 403：

```text
你没有权限查看这个视频脚本
```

## 7. 联调清单

1. 转写任务完成后能拉取历史脚本列表。
2. 历史列表按最新生成时间倒序展示。
3. 无历史脚本时正常展示生成按钮。
4. 普通生成不传 `regenerate` 时仍可命中缓存。
5. 点击“重新生成”时请求体包含 `regenerate=true`。
6. `regenerate=true` 后生成新脚本，历史列表数量增加。
7. 不同 `target_platform` 的历史脚本可以独立筛选。
8. 无权限访问他人转写任务时，历史列表和重新生成都返回 403。
