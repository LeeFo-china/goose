# 抖音视频链接音频转文本后端落地方案

## 1. 目标

客户只提供一个抖音短视频链接时，后端自动完成：

```text
抖音视频链接 -> 解析视频直链 -> 下载视频 -> 提取音频 -> ASR 语音识别 -> 输出视频里的说话文本
```

第一版目标不是保证所有抖音链接 100% 成功，而是先打通稳定的任务链路，并在解析失败时提供“上传原视频文件”的兜底路径。

## 2. 关键判断

抖音开放平台没有稳定的官方接口，允许后端通过任意公开视频链接直接获取视频文件并做语音识别。

当前已验证 `apple_yang/douyin-transcripts-scraper` 这个 Apify Actor 可以直接通过抖音链接返回 `text` 和 `segments`，所以第一版落地路径调整为：

```text
抖音链接
  -> Apify Transcript Actor
  -> 后端读取 text / segments
  -> 落库 completed
```

`下载视频 -> ffmpeg -> ASR` 暂时作为后续兜底路径，而不是第一版主链路。

因此后端需要按三条路径设计：

1. Apify 直接转写路径
   - 使用 Apify Transcript Actor 直接获取视频语音文本。
   - 成功后后端落库 `title`、`text`、`segments`。
   - 这是当前 MVP 主链路。

2. 链接解析 + 自建 ASR 兜底路径
   - 使用第三方短视频解析服务获取视频直链。
   - 成功后后端下载视频、提取音频和 ASR。
   - 优点：用户只需要贴链接。
   - 风险：第三方解析服务和下载链路都可能失效。

3. 上传原视频兜底路径
   - 链接解析失败时，前端提示用户上传原视频文件。
   - 后端直接从上传文件提取音频并识别。
   - 优点：稳定、可控、成功率高。
   - 缺点：用户多一步操作。

MVP 推荐：`Apify Transcript Actor + 任务状态表 + 缓存复用 + 上传原视频兜底预留`。

## 3. 业务边界

本功能只做“视频内语音转文本”，不做以下能力：

- 不抓取评论。
- 不抓取作者主页。
- 不下载或二次分发视频成品。
- 不绕过私密视频、删除视频或权限受限视频。
- 不承诺所有抖音链接都能识别。
- 不将第三方解析服务结果作为长期可访问的视频源。

建议产品文案明确：

```text
当前功能用于提取公开视频中的语音内容。若链接解析失败，请上传原视频继续识别。
```

## 4. 推荐技术架构

```text
API Controller
  -> SocialVideoTranscriptionService
    -> VideoResolveGateway
    -> VideoDownloadGateway
    -> AudioExtractGateway
    -> AsrGateway
    -> Repository
```

职责划分：

- controller
  - 只处理 HTTP、参数校验、权限、响应包装。
- service
  - 编排任务状态流转。
  - 控制解析、下载、提取、识别流程。
  - 做去重、超时、失败兜底。
- gateway
  - 对接第三方视频解析 API。
  - 下载视频。
  - 调用 ffmpeg。
  - 调用 ASR 服务。
- repository
  - 读写 Supabase 表。

## 5. MVP 流程

### 5.1 创建识别任务

```text
POST /social-video/transcriptions
```

请求：

```json
{
  "platform": "douyin",
  "url": "https://v.douyin.com/xxxx/"
}
```

响应：

```json
{
  "id": "job-id",
  "status": "pending"
}
```

后端创建任务后异步执行，避免 HTTP 请求长时间阻塞。

### 5.2 后端任务状态流转

```text
pending
  -> resolving
  -> downloading
  -> extracting_audio
  -> transcribing
  -> completed
```

失败统一进入：

```text
failed
```

常见失败码：

```text
INVALID_URL
UNSUPPORTED_PLATFORM
VIDEO_PARSE_FAILED
VIDEO_DOWNLOAD_FAILED
VIDEO_TOO_LARGE
VIDEO_TOO_LONG
AUDIO_EXTRACT_FAILED
ASR_FAILED
TIMEOUT
```

### 5.3 查询任务

```text
GET /social-video/transcriptions/:id
```

处理中：

```json
{
  "id": "job-id",
  "status": "transcribing",
  "progress": 80
}
```

完成：

```json
{
  "id": "job-id",
  "status": "completed",
  "platform": "douyin",
  "source_url": "https://v.douyin.com/xxxx/",
  "duration_seconds": 68,
  "text": "今天给大家分享一下装修避坑...",
  "segments": [
    {
      "start": 0.2,
      "end": 5.6,
      "text": "今天给大家分享一下装修避坑"
    }
  ]
}
```

失败：

```json
{
  "id": "job-id",
  "status": "failed",
  "error_code": "VIDEO_PARSE_FAILED",
  "message": "视频链接解析失败，请上传原视频文件继续识别"
}
```

## 6. 数据库设计

建议新增表：

```sql
create table social_video_transcriptions (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  source_url text not null,
  normalized_url text,
  input_hash text not null,
  resolved_url text,
  video_object_path text,
  audio_object_path text,
  status text not null default 'pending',
  progress int not null default 0,
  duration_seconds int,
  file_size_bytes bigint,
  text text,
  segments jsonb not null default '[]',
  error_code text,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index social_video_transcriptions_input_hash_idx
on social_video_transcriptions(input_hash);

create index social_video_transcriptions_status_idx
on social_video_transcriptions(status);
```

`input_hash` 规则：

```text
sha256(platform + ":" + normalized_url)
```

用途：

- 同一个链接 24 小时内重复提交，直接复用已有 completed 结果。
- 避免重复下载和重复 ASR 消耗。

## 7. 配置项

建议放到系统配置或环境变量：

```text
SOCIAL_VIDEO_RESOLVER_PROVIDER
SOCIAL_VIDEO_RESOLVER_API_URL
SOCIAL_VIDEO_RESOLVER_API_KEY
SOCIAL_VIDEO_MAX_DURATION_SECONDS=600
SOCIAL_VIDEO_MAX_FILE_SIZE_MB=300
SOCIAL_VIDEO_DOWNLOAD_TIMEOUT_MS=60000
SOCIAL_VIDEO_JOB_TIMEOUT_MS=600000
SOCIAL_VIDEO_TEMP_DIR=/tmp/gooes-social-video
ASR_PROVIDER=tencent|aliyun|openai|local
ASR_API_KEY=xxx
```

如果后续接腾讯云或阿里云 ASR，应继续沿用系统配置里的密钥管理方式，不要把密钥写死到代码。

## 8. 视频链接校验

只允许白名单域名：

```text
v.douyin.com
www.douyin.com
www.iesdouyin.com
iesdouyin.com
```

校验规则：

- 必须是 `https://`。
- 不允许内网 IP、localhost、file 协议。
- 不允许任意跳转到非白名单域名后继续下载。
- 最终下载地址也要做协议和大小校验。

这样可以降低 SSRF 风险。

## 9. 视频解析 Gateway

接口定义建议：

```ts
export interface VideoResolveResult {
  resolvedUrl: string;
  title?: string | null;
  coverUrl?: string | null;
  durationSeconds?: number | null;
}

export interface VideoResolveGateway {
  resolve(input: {
    platform: "douyin";
    url: string;
  }): Promise<VideoResolveResult>;
}
```

第三方解析服务返回字段不稳定，gateway 内部负责归一化，service 不直接依赖第三方原始结构。

失败时抛业务错误：

```text
VIDEO_PARSE_FAILED
```

## 10. 下载与音频提取

### 10.1 下载视频

下载要求：

- 使用流式下载，不一次性读入内存。
- 检查 `content-length`，超过限制直接失败。
- 没有 `content-length` 时边下载边计数，超过限制中断。
- 下载完成后记录 `file_size_bytes`。
- 临时文件命名使用任务 ID。

### 10.2 ffmpeg 提取音频

命令示例：

```bash
ffmpeg -y -i input.mp4 -vn -ac 1 -ar 16000 output.wav
```

说明：

- `-vn`：不要视频流。
- `-ac 1`：单声道。
- `-ar 16000`：16k 采样率，适合大多数 ASR。
- 输出 wav 便于 ASR 兼容。

生产环境需要确保服务器安装：

```bash
ffmpeg -version
```

如果没有，部署脚本需要补安装。

## 11. ASR Gateway

接口定义建议：

```ts
export interface AsrSegment {
  start: number;
  end: number;
  text: string;
}

export interface AsrResult {
  text: string;
  segments: AsrSegment[];
  durationSeconds?: number;
}

export interface AsrGateway {
  transcribe(input: {
    audioPath: string;
    language?: "zh";
  }): Promise<AsrResult>;
}
```

### 11.1 ASR 选型建议

MVP 推荐顺序：

1. 腾讯云 ASR 或阿里云 ASR
   - 国内网络稳定。
   - 账号和配置体系与当前项目已有云服务接入方式一致。

2. OpenAI / Whisper 类服务
   - 识别效果好。
   - 需要确认网络、成本和数据合规。

3. 自部署 faster-whisper
   - 适合量大或隐私要求高。
   - 需要 GPU 或较高 CPU 成本，运维复杂度更高。

第一版建议先封装接口，不把业务代码绑定到某一家 ASR。

## 12. 异步任务执行方式

当前已升级为数据库队列 + 独立 worker：

```text
API 创建任务 -> social_video_transcriptions.status=pending
goose-social-video-worker -> RPC 领取 pending 任务
  -> Apify 解析
  -> 下载媒体
  -> ffmpeg 提取音频
  -> 腾讯云 ASR
  -> completed / failed
```

领取任务使用 Postgres RPC：

```text
claim_next_social_video_transcription()
```

该 RPC 内部按 `created_at ASC` 领取 `pending` 任务，并使用 `FOR UPDATE SKIP LOCKED` 避免多个 worker 抢到同一条任务。

并发控制：

```text
SOCIAL_VIDEO_CONCURRENCY_LIMIT=1
SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS=3000
```

默认单 worker 进程同一时间只处理 1 条任务，后续任务保持 `pending` 等待领取。

### 12.1 历史方案说明

MVP 可以先在 API 进程内启动后台 promise：

```text
创建任务 -> 返回 job_id -> setImmediate/run async worker
```

但需要注意：

- API 进程重启会中断任务。
- 适合低频 MVP。

更稳的第二阶段：

- 增加 `social_video_transcription_jobs` 队列表，或复用当前任务表。
- 定时 worker 扫描 `pending/failed retryable`。
- 每次只处理有限并发，比如 1-2 个。

这套进程内异步已被 worker 队列替代，不再作为当前主方案。

## 13. API Schema 建议

### 13.1 创建任务

```ts
const CreateSocialVideoTranscriptionSchema = z.object({
  platform: z.enum(["douyin"]),
  url: z.string().trim().url().max(2048),
});
```

### 13.2 上传视频兜底

第二阶段可以补：

```text
POST /social-video/transcriptions/upload
```

使用 `multipart/form-data`：

```text
file: video/mp4
platform: douyin
source_url?: string
```

返回同样的任务结构。

## 14. 权限建议

后台 admin 使用：

```text
social_video_transcription.create
social_video_transcription.read
social_video_transcription.manage
```

如果只在 H5/营销后台内部使用，也可以先复用：

```text
marketing_page.update
```

但长期建议独立权限，方便控制成本。

## 15. 成本与限流

必须加限制：

- 单账号每天最大任务数。
- 单视频最大 10 分钟。
- 单文件最大 300MB。
- 单任务最多重试 2 次。
- 同链接 24 小时内复用结果。
- ASR 调用失败不无限重试。

建议错误提示：

```text
该视频过长，当前最多支持 10 分钟内的视频。
```

```text
该视频文件过大，当前最多支持 300MB。
```

```text
链接解析失败，请上传原视频继续识别。
```

## 16. 风险与增强约束

### 16.1 第三方解析服务稳定性

这是整个链路里最高风险的环节。第三方解析服务可能随时失效、限流、返回错误结构，或者解析出的地址短时间后过期。

MVP 必须做到：

- `VideoResolveGateway` 不能把业务代码绑定到某一家服务商。
- 第三方返回结构必须在 gateway 内部归一化。
- 解析失败必须落明确错误码 `VIDEO_PARSE_FAILED`。
- 解析失败时前端必须提供上传原视频兜底。

P2 阶段建议升级为多服务商热备：

```ts
type VideoResolverProvider = "provider_a" | "provider_b" | "provider_c";

interface VideoResolveGateway {
  resolve(input: {
    platform: "douyin";
    url: string;
  }): Promise<VideoResolveResult>;
}
```

多服务商策略：

```text
provider_a 解析失败
  -> provider_b
  -> provider_c
  -> 全部失败后返回 VIDEO_PARSE_FAILED
```

注意：

- 不同服务商的错误要统一成内部错误码。
- 每个服务商独立配置超时。
- 记录每次 provider 调用结果，方便统计成功率。
- 不建议在用户请求线程里串行等待过久，整体解析阶段建议最多 30-60 秒。

### 16.2 解析成功率监控与告警

建议记录以下指标：

```text
social_video_resolve_attempt_total
social_video_resolve_success_total
social_video_resolve_failed_total
social_video_resolve_duration_ms
social_video_transcription_completed_total
social_video_transcription_failed_total
```

如果暂时没有 metrics 系统，MVP 可以先落数据库日志表或结构化日志。

告警建议：

```text
最近 30 分钟解析成功率 < 80%
最近 30 分钟 VIDEO_PARSE_FAILED 数量 > 20
单个解析服务连续失败 > 10 次
ASR 失败率 > 20%
```

告警后人工处理：

- 切换解析服务商。
- 降低自动解析入口曝光。
- 引导用户上传原视频。

### 16.3 视频直链短期缓存

对已经成功解析的链接，可以短期缓存解析结果。

建议：

```text
resolved_url_cache_ttl = 1 天到 7 天
```

但要注意：

- 很多视频直链本身有时效，不能长期信任。
- 缓存优先用于复用识别结果，而不是长期复用直链。
- 如果已有 completed 文本结果，应直接返回文本结果，不再重新下载视频。

推荐优先级：

1. 优先复用 `completed` 的转写结果。
2. 没有 completed，且 resolved_url 未过期，再尝试复用直链。
3. 直链下载失败，则重新走解析服务。

### 16.4 下载安全与 SSRF

方案中不仅要校验用户传入的抖音 URL，也要校验解析服务返回的 `resolvedUrl`。

必须做两次校验：

1. 用户输入 URL 校验。
2. 实际下载前的 resolvedUrl 校验。

resolvedUrl 下载前必须检查：

- 协议只允许 `https:`。
- 禁止 `file:`、`ftp:`、`data:` 等协议。
- 禁止 localhost。
- 禁止内网 IP。
- 禁止 link-local 地址。
- 禁止跳转到内网 IP。
- DNS 解析结果不能是内网地址。

即使解析服务返回的是新域名，也不能默认信任。

如果后续发现视频 CDN 域名变化频繁，不建议使用完全固定域名白名单，而应使用“公网地址校验 + content-type + 文件大小 + 下载超时 + 字节截断”组合。

### 16.5 边下载边截断

`content-length` 可能缺失或不可信，所以不能只依赖响应头。

下载模块必须：

- 响应头 `content-length` 超限时立即拒绝。
- 没有 `content-length` 时允许开始下载。
- 下载过程中累计字节数。
- 一旦超过 `SOCIAL_VIDEO_MAX_FILE_SIZE_MB`，立即中断请求并删除临时文件。
- 下载完成后再次校验实际文件大小。

伪代码：

```ts
let downloadedBytes = 0;

for await (const chunk of response.body) {
  downloadedBytes += chunk.length;
  if (downloadedBytes > maxBytes) {
    abort();
    removeTempFile();
    throw Errors.badRequest("视频文件过大");
  }
  write(chunk);
}
```

### 16.6 URL 去重规范化

`input_hash` 不应直接使用原始 URL。抖音分享链接可能带不同的追踪参数，同一个视频会产生不同 URL。

MVP 规范化：

- trim。
- 去除尾部标点。
- 去除 `utm_*`、`source`、`share_token` 等明显追踪参数。
- host 小写。
- path 去掉多余 `/`。

更优方案：

- 如果解析服务返回稳定的视频 ID 或 item_id，则用：

```text
sha256(platform + ":" + item_id)
```

否则退回：

```text
sha256(platform + ":" + normalized_url)
```

### 16.7 ffmpeg 超时与兼容性

ffmpeg 处理不同编码的视频时可能失败或卡住。

必须加：

- 子进程超时，建议 120 秒。
- stderr 截断记录，避免日志过大。
- 失败后清理临时文件。
- 输出音频文件存在且大小大于 0 才进入 ASR。

推荐命令：

```bash
ffmpeg -y -i input.mp4 -vn -ac 1 -ar 16000 output.wav
```

不要过度指定输入格式，让 ffmpeg 自动识别容器和编码，提高兼容性。

### 16.8 实施优先级

| 优先级 | 任务 | 说明 |
| :--- | :--- | :--- |
| P0 | 异步任务状态机 | 创建、查询、状态流转、失败落库必须先完成 |
| P0 | 安全下载模块 | 协议校验、SSRF 防护、大小限制、边下载边截断 |
| P0 | ASR Gateway 核心调用 | 完成音频到文本的核心闭环 |
| P1 | 上传原视频兜底 | 解析失败时保证用户仍可完成识别 |
| P1 | 同链接 24 小时去重 | 降低重复下载和 ASR 成本 |
| P1 | 解析服务监控与告警 | 及时发现第三方解析失效 |
| P2 | 多解析服务商热备 | 提高链接解析成功率 |
| P2 | 智能去重 | 基于 item_id 或更强 URL 规范化去重 |
| P2 | 断点续传 | 大文件和弱网场景下再考虑 |

## 17. 前端交互建议

后台或 H5 配置处可以提供：

```text
粘贴抖音视频链接
[开始提取]
```

提交后显示：

```text
正在解析视频...
正在提取音频...
正在识别文本...
```

完成后：

```text
识别结果 textarea
[复制文本] [用于 AI 生成活动文案] [重新识别]
```

失败时：

```text
链接解析失败，建议上传原视频继续识别
[上传视频]
```

## 18. 实施步骤

### 阶段 1：后端任务骨架

1. 新增数据库表 `social_video_transcriptions`。
2. 新增 schema：
   - `CreateSocialVideoTranscriptionSchema`
   - `SocialVideoTranscriptionIdParamsSchema`
3. 新增 repository。
4. 新增 controller：
   - `POST /social-video/transcriptions`
   - `GET /social-video/transcriptions/:id`
5. 先用 mock gateway 跑通状态流转。

验收：

- 可以创建任务。
- 可以查询任务。
- 任务能从 pending 变 completed 或 failed。

### 阶段 2：接入视频解析和下载

1. 实现 `VideoResolveGateway`。
2. 接第三方解析服务。
3. 实现 resolvedUrl 二次安全校验。
4. 实现安全下载。
   - 协议校验。
   - SSRF 防护。
   - content-length 预检。
   - 边下载边截断。
   - 下载超时。
4. 保存临时视频路径或对象存储路径。

验收：

- 抖音短链能解析出视频直链。
- 视频可以下载到临时目录。
- 文件大小限制有效。
- resolvedUrl 跳转到内网地址时必须拒绝。

### 阶段 3：接入 ffmpeg 和 ASR

1. 实现 `AudioExtractGateway`。
2. 部署环境确认 ffmpeg。
3. 给 ffmpeg 子进程增加超时和临时文件清理。
4. 实现 `AsrGateway`。
5. 保存 `text` 和 `segments`。

验收：

- 输入抖音链接，最终能得到视频内语音文本。
- 识别失败能返回明确错误。

### 阶段 4：上传兜底

1. 新增视频上传接口。
2. 上传文件复用同一套音频提取和 ASR。
3. 前端在链接解析失败时展示上传入口。

验收：

- 链接失败时，上传原视频可以继续识别。

## 19. 推荐结论

这件事可以落地，但不要把核心承诺定义成“任意抖音链接都能解析成功”。

推荐第一版产品承诺：

```text
支持通过抖音公开视频链接提取视频语音文本；如链接解析失败，可上传原视频继续识别。
```

推荐第一版技术方案：

```text
第三方短视频解析服务
  + 安全下载
  + ffmpeg 音频提取
  + 可替换 ASR Gateway
  + 任务状态表
  + 上传原视频兜底
```

这样能最快形成可用闭环，同时保留后续替换解析服务、替换 ASR 服务、迁移到队列 worker 的空间。
