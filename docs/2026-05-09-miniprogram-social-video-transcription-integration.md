# 小程序抖音链接语音转文本对接文档

## 1. 目标

小程序端只负责提交抖音视频链接并展示识别结果。

实际 Apify Token、Actor ID、腾讯云 ASR 密钥和调用过程都在后端完成，小程序端不能持有任何第三方密钥。

```text
小程序提交抖音链接
  -> goose 后端创建识别任务
  -> goose 后端调用 Apify Actor 解析音视频地址
  -> goose 后端下载视频并用 ffmpeg 提取音频
  -> goose 后端调用腾讯云 ASR
  -> goose 后端落库 text / segments
  -> 小程序轮询任务状态并展示文本
```

如果后台把 `SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER` 配成 `apify`，后端会退回旧的 Apify 直接转写链路；小程序端不需要改代码。

## 2. 接口

### 2.1 创建识别任务

```http
POST /social-video/transcriptions
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{
  "platform": "douyin",
  "url": "https://v.douyin.com/ebf7oNAd6LE/"
}
```

也可以传完整抖音分享口令，后端会从文本中提取第一个抖音链接：

```json
{
  "platform": "douyin",
  "url": "0.02 复制打开抖音，看看某某的作品 https://v.douyin.com/xxxx/ abc:/"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "id": "0a36d89f-0c48-4b5c-8db0-0c7d7a0df0b1",
    "platform": "douyin",
    "source_url": "https://v.douyin.com/xxxx/",
    "normalized_url": "https://v.douyin.com/xxxx",
    "status": "pending",
    "progress": 0,
    "provider": null,
    "provider_actor_id": null,
    "title": null,
    "text": null,
    "segments": [],
    "error_code": null,
    "error_message": null,
    "cached": false,
    "created_at": "2026-05-09T10:00:00.000Z",
    "updated_at": "2026-05-09T10:00:00.000Z",
    "completed_at": null
  }
}
```

如果同一个链接在缓存时间内已识别成功，后端会直接返回完成结果：

```json
{
  "success": true,
  "data": {
    "id": "old-job-id",
    "status": "completed",
    "progress": 100,
    "title": "视频标题",
    "text": "识别出的文本",
    "segments": [],
    "cached": true
  }
}
```

### 2.2 查询识别任务

```http
GET /social-video/transcriptions/:id
Authorization: Bearer <token>
```

处理中：

```json
{
  "success": true,
  "data": {
    "id": "job-id",
    "status": "transcribing",
    "progress": 60,
    "title": null,
    "text": null,
    "segments": [],
    "error_code": null,
    "error_message": null
  }
}
```

完成：

```json
{
  "success": true,
  "data": {
    "id": "job-id",
    "status": "completed",
    "progress": 100,
    "provider": "tencent_asr",
    "provider_actor_id": "apple_yang/douyin-transcripts-scraper",
    "asr_task_id": "15303986694",
    "audio_duration_seconds": 47.300438,
    "title": "视频标题",
    "text": "今天给大家分享一下装修避坑...",
    "segments": [
      {
        "start": 0,
        "end": 4.2,
        "text": "今天给大家分享一下装修避坑"
      }
    ],
    "completed_at": "2026-05-09T10:01:00.000Z"
  }
}
```

失败：

```json
{
  "success": true,
  "data": {
    "id": "job-id",
    "status": "failed",
    "progress": 100,
    "error_code": "APIFY_TRANSCRIPT_FAILED",
    "error_message": "视频文本提取失败，请检查链接或稍后重试"
  }
}
```

## 3. 状态枚举

```text
pending       已创建，等待后端处理
resolving     后端正在调用 Apify 解析音视频地址
downloading   后端正在下载音视频
extracting_audio  后端正在用 ffmpeg 提取音频
creating_asr_task  后端正在提交腾讯云 ASR 任务
transcribing  后端正在等待第三方识别结果
completed     已完成
failed        失败
```

## 4. 小程序推荐交互

### 4.1 输入页

组件：

```text
textarea：粘贴抖音链接或分享口令
button：开始提取
```

提交前校验：

- 不能为空。
- 最好包含 `douyin.com`。
- 不要在小程序端校验得过严，最终以后端为准。

### 4.2 提交后

调用创建接口后：

```text
status = pending / resolving / downloading / extracting_audio / creating_asr_task / transcribing
```

页面显示：

```text
正在提取视频文本...
```

建议每 2 秒轮询一次：

```text
GET /social-video/transcriptions/:id
```

最长轮询 90 秒。超过后提示：

```text
识别仍在处理中，请稍后刷新查看
```

### 4.3 完成后

展示：

```text
视频标题
识别文本 textarea
复制文本按钮
重新提取按钮
```

`segments` 第一版可以不展示，只使用 `text`。

### 4.4 失败后

展示后端 `error_message`。

推荐兜底文案：

```text
当前视频暂时无法通过链接自动提取，请稍后重试。
```

后续如果做上传原视频兜底，再增加：

```text
[上传原视频继续识别]
```

## 5. 错误码

常见错误码：

```text
SOCIAL_VIDEO_DISABLED              后台未启用短视频识别
SOCIAL_VIDEO_DAILY_LIMIT_EXCEEDED  今日识别次数达到上限
APIFY_TOKEN_MISSING                后台缺少 Apify Token
APIFY_TIMEOUT                      Apify 调用超时
APIFY_RUN_FAILED                   Apify Actor 运行失败
APIFY_TRANSCRIPT_FAILED            Apify 未能提取文本
APIFY_TRANSCRIPT_EMPTY             Apify 返回为空
APIFY_MEDIA_URL_MISSING            Apify 未返回可用音视频地址
SOCIAL_VIDEO_MEDIA_DOWNLOAD_FAILED 下载抖音媒体失败
SOCIAL_VIDEO_FFMPEG_FAILED         ffmpeg 提取音频失败
TENCENT_ASR_CONFIG_MISSING         后台缺少腾讯云 ASR 配置
TENCENT_ASR_API_ERROR              腾讯云 ASR 接口调用失败
TENCENT_ASR_TASK_FAILED            腾讯云 ASR 任务失败
TENCENT_ASR_TIMEOUT                腾讯云 ASR 轮询超时
```

## 6. 安全要求

- 小程序端不要保存 Apify Token。
- 小程序端不要直接调用 Apify。
- 小程序端不要直接调用腾讯云 ASR。
- 所有识别请求必须走 goose 后端。
- 识别结果只能通过任务创建者自己的登录态读取。

## 7. 联调检查

1. admin 后台已配置：
   - `SOCIAL_VIDEO_TRANSCRIPTION_ENABLED=true`
   - `SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER=tencent_asr`
   - `APIFY_API_TOKEN`
   - `APIFY_TRANSCRIPT_ACTOR_ID=apple_yang/douyin-transcripts-scraper`
   - `TENCENTCLOUD_SECRET_ID`
   - `TENCENTCLOUD_SECRET_KEY`
   - `TENCENT_ASR_REGION=ap-shanghai`
   - `TENCENT_ASR_ENGINE_MODEL_TYPE=16k_zh`
2. API 服务器已安装 `ffmpeg`。
3. admin 后台“短视频识别”配置页测试成功。
4. 小程序登录态正常，接口带 `Authorization`。
5. 小程序创建任务成功。
6. 小程序轮询能拿到 completed 或 failed。
7. completed 时 `text` 可复制。

## 8. 推荐结论

小程序第一版只需要两个接口：

```text
POST /social-video/transcriptions
GET /social-video/transcriptions/:id
```

不要接 Apify，不要上传密钥，不要处理 Actor 细节。后端会统一完成转写、缓存、限流和错误兜底。
