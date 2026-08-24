# 小程序自媒体识别历史接口对接说明

日期：2026-08-24

## 接口

```http
GET /social-video/transcriptions?page=1&pageSize=5
Authorization: Bearer <employee_token>
```

用途：返回当前登录员工在当前租户下最近创建的视频识别任务摘要。列表不返回完整 `text` 和 `segments`；点击历史项后，小程序继续调用现有详情接口恢复完整内容：

```http
GET /social-video/transcriptions/:id
GET /social-video/transcriptions/:id/scripts?page=1&pageSize=20
```

## 权限与隔离

- 使用现有员工登录态。
- 沿用租户服务访问控制，服务不可用时 fail closed。
- 员工账号需要 `social_video_transcription.create` 权限。
- 只返回当前租户、当前登录用户 `created_by_auth_user_id` 创建的任务。
- 不会返回其他租户或其他员工的识别任务。

## 查询参数

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | number | `1` | 页码，从 1 开始 |
| `pageSize` | number | `5` | 每页数量，最大 `20` |
| `platform` | string | `douyin` | 当前只支持 `douyin` |
| `status` | string | - | 可选：`pending`、`resolving`、`downloading`、`extracting_audio`、`creating_asr_task`、`transcribing`、`completed`、`failed` |

排序：`created_at desc`。

## 成功响应

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "transcription-id",
        "platform": "douyin",
        "source_url": "https://v.douyin.com/xxx/",
        "normalized_url": "https://www.douyin.com/video/xxx",
        "status": "completed",
        "progress": 100,
        "title": "视频标题",
        "text_preview": "识别文本前 80 个字",
        "text_length": 512,
        "audio_duration_seconds": 63,
        "cached": false,
        "billing": {
          "billable": true,
          "duration_seconds": 63,
          "minutes": 2,
          "source": "asr",
          "cached": false,
          "billed_at": "2026-08-24T08:00:00.000Z",
          "frozen_credits": 0,
          "correlation_id": null,
          "event_id": "event-id",
          "charged": true,
          "charged_at": "2026-08-24T08:00:00.000Z"
        },
        "script_count": 2,
        "latest_script": {
          "id": "script-id",
          "title": "最近脚本标题",
          "target_platform": "douyin",
          "style": "practical",
          "status": "completed",
          "created_at": "2026-08-24T08:10:00.000Z"
        },
        "created_at": "2026-08-24T07:58:00.000Z",
        "updated_at": "2026-08-24T08:00:00.000Z",
        "completed_at": "2026-08-24T08:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 5
  }
}
```

字段说明：

- `text_preview`：后端截取识别文本前 80 个字符。
- `text_length`：完整识别文本字符数，用于判断是否有可恢复文本。
- `script_count`：当前识别任务下脚本数量。
- `latest_script`：最近一次脚本摘要；没有脚本时为 `null`。
- `cached`：识别任务是否来自缓存复用。

## 小程序建议接入流程

1. 进入自媒体页后调用：

   ```http
   GET /social-video/transcriptions?page=1&pageSize=5
   ```

2. 如果返回最近 `completed` 且 `text_length > 0` 的任务：
   - 用 `GET /social-video/transcriptions/:id` 获取完整 `text/segments`。
   - 用 `GET /social-video/transcriptions/:id/scripts?page=1&pageSize=20` 获取脚本历史。

3. 用户点击任意历史项时，按同样方式调用详情和脚本历史接口恢复页面状态。

4. “重新提取”只清空当前页面展示，不删除后端历史。

## 错误处理

| 场景 | 后端行为 | 小程序建议 |
| --- | --- | --- |
| 无登录态 | `401` | 引导重新登录 |
| 无自媒体识别权限 | `403` | 显示“当前账号暂无视频转文本权限” |
| 租户服务不可用 | 复用现有租户服务访问错误 | 展示服务状态提示 |
| 历史为空 | `200 items=[]` | 展示空态，不阻断粘贴链接 |
| 加载失败 | `4xx/5xx` | 保留当前输入/结果，提示“历史暂不可用” |

## 验收清单

- 首次进入无历史时显示原空态。
- 完成一次识别后，切换 tab 再回来能恢复最近结果。
- 杀掉小程序重新进入后，仍能通过历史恢复最近结果。
- 点击任意历史项能恢复对应完整文本。
- 已生成脚本的历史项能继续恢复脚本历史。
- 进行中任务返回时，小程序可继续轮询详情或展示识别中。
- 其他租户员工看不到当前租户历史。
- 无权限员工看不到历史，也不能通过详情接口读取。
