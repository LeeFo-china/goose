# 360 全景阶段 1：tenant_panorama_jobs 正式业务模型与对接方案

日期：2026-05-14

## 1. 结论

阶段 0 已经验证了核心链路：

- 服务器可运行 Python + OpenCV + libvips。
- H5 能上传多图、排序、创建临时任务、轮询状态。
- 16 张 `3024x4032` 手机图在压缩到长边 `1600px` 后可以成功拼接。
- Photo Sphere Viewer 预览在桌面和手机视口可用。

阶段 1 不继续扩展临时 Python 服务，而是落正式业务模型：

1. 新增 `tenant_panorama_assets` 和 `tenant_panorama_jobs`。
2. 新增 Supabase Storage bucket 与路径规范。
3. 新增后端 API 契约和权限点。
4. H5 上传页从临时接口迁移到正式 API。
5. Admin 和小程序先按“查看与管理”对接，worker 真正拼接可在阶段 2 接入。

阶段 1 的目标不是把所有拼接能力一次性生产化，而是先把“租户归属、项目归属、任务状态、文件路径、前端轮询、预览 manifest”这些长期稳定的地基建好。

## 2. 阶段边界

### 阶段 1 做

- 建表：
  - `tenant_panorama_assets`
  - `tenant_panorama_jobs`
- 建 Storage bucket：
  - `panorama-assets`
- 建权限点：
  - `panorama.read`
  - `panorama.create`
  - `panorama.update`
  - `panorama.delete`
  - `panorama.retry`
- 后端 API 骨架：
  - 创建草稿资产
  - 生成上传路径/签名上传信息
  - 创建拼接任务
  - 查询资产列表
  - 查询资产详情
  - 查询任务状态
  - 获取 viewer manifest
  - 停用/删除资产
  - 重试任务
- H5 / Admin / 小程序对接文档和基础契约。
- 允许第一版 worker 使用“模拟完成”或“手动回填输出”的方式验收前后端闭环。

### 阶段 1 不做

- 不把 OpenCV worker 完整生产化。
- 不做多 worker 队列调度。
- 不做热点、导览 tour、水印、分享统计。
- 不做计费真扣。
- 不强制小程序原生渲染全景，小程序第一版使用 web-view。
- 不从阶段 0 的 `/home/ubuntu/goose-360-prototype/jobs.json` 自动迁移历史数据。

## 3. 状态模型

### 资产状态

`tenant_panorama_assets.status`

| 状态 | 含义 | 前端展示 |
| --- | --- | --- |
| `draft` | 已创建草稿，源图未提交完整 | 草稿 |
| `queued` | 已提交任务，等待处理 | 待处理 |
| `processing` | worker 正在处理 | 处理中 |
| `ready` | 已生成可预览资源 | 可查看 |
| `failed` | 最近一次处理失败 | 失败 |
| `disabled` | 租户或管理员停用 | 已停用 |
| `deleted` | 软删除 | 不展示 |

### 任务状态

`tenant_panorama_jobs.status`

| 状态 | 含义 |
| --- | --- |
| `pending` | 任务已创建，等待 worker 领取 |
| `processing` | worker 已领取并执行 |
| `completed` | 任务完成 |
| `failed` | 任务失败 |
| `cancelled` | 被取消 |
| `timeout` | 超时终止 |

### 状态流转

```text
draft
  -> queued
  -> processing
  -> ready

draft
  -> queued
  -> processing
  -> failed
  -> queued    # retry

ready
  -> disabled
  -> ready

draft/failed/ready/disabled
  -> deleted
```

## 4. 数据库设计

### 4.1 `tenant_panorama_assets`

全景资产主表。它代表一个可被业务页面引用和展示的全景资源。

```sql
create table public.tenant_panorama_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  customer_id uuid null references public.customers(id) on delete set null,
  property_id uuid null references public.properties(id) on delete set null,

  title text not null,
  description text null,
  source_type text not null default 'multi_image',
  shooting_mode text not null default 'single_row',
  capture_direction text null,
  expected_angle_step integer null,

  status text not null default 'draft',
  input_count integer not null default 0,
  input_total_bytes bigint not null default 0,

  output_projection text null,
  width integer null,
  height integer null,
  horizontal_angle_of_view numeric null,
  vertical_angle_of_view numeric null,
  vertical_offset numeric null,

  preview_path text null,
  panorama_path text null,
  manifest_path text null,
  tile_base_path text null,
  storage_bucket text not null default 'panorama-assets',

  latest_job_id uuid null,
  error_code text null,
  error_message text null,
  quality_score numeric null,
  metadata jsonb not null default '{}',

  created_by_user_id uuid null references public.users(id) on delete set null,
  created_by_employee_id uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint tenant_panorama_assets_status_check
    check (status in ('draft', 'queued', 'processing', 'ready', 'failed', 'disabled', 'deleted')),
  constraint tenant_panorama_assets_source_type_check
    check (source_type in ('multi_image', 'equirectangular', 'cubemap')),
  constraint tenant_panorama_assets_shooting_mode_check
    check (shooting_mode in ('single_row', 'multi_row', 'uploaded_ready_image')),
  constraint tenant_panorama_assets_capture_direction_check
    check (capture_direction is null or capture_direction in ('clockwise', 'counterclockwise')),
  constraint tenant_panorama_assets_output_projection_check
    check (output_projection is null or output_projection in ('equirectangular', 'partial_equirectangular', 'cubemap'))
);
```

建议索引：

```sql
create index idx_tenant_panorama_assets_tenant_status
  on public.tenant_panorama_assets(tenant_id, status, created_at desc)
  where deleted_at is null;

create index idx_tenant_panorama_assets_project
  on public.tenant_panorama_assets(tenant_id, project_id, created_at desc)
  where deleted_at is null;

create index idx_tenant_panorama_assets_customer
  on public.tenant_panorama_assets(tenant_id, customer_id, created_at desc)
  where deleted_at is null;
```

### 4.2 `tenant_panorama_jobs`

任务表。它记录一次拼接、导入、切片或重试动作。

```sql
create table public.tenant_panorama_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.tenant_panorama_assets(id) on delete cascade,

  job_type text not null,
  status text not null default 'pending',
  priority integer not null default 100,
  attempt integer not null default 1,

  input_paths jsonb not null default '[]',
  input_metadata jsonb not null default '[]',
  output jsonb not null default '{}',
  worker_options jsonb not null default '{}',

  error_code text null,
  error_message text null,
  error_detail jsonb not null default '{}',
  quality_score numeric null,

  queued_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  timeout_at timestamptz null,

  created_by_user_id uuid null references public.users(id) on delete set null,
  created_by_employee_id uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenant_panorama_jobs_job_type_check
    check (job_type in ('stitch_images', 'publish_equirectangular', 'generate_tiles', 'retry')),
  constraint tenant_panorama_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'timeout'))
);
```

建议索引：

```sql
create index idx_tenant_panorama_jobs_tenant_status
  on public.tenant_panorama_jobs(tenant_id, status, created_at desc);

create index idx_tenant_panorama_jobs_asset
  on public.tenant_panorama_jobs(asset_id, created_at desc);

create index idx_tenant_panorama_jobs_pending
  on public.tenant_panorama_jobs(priority asc, queued_at asc)
  where status = 'pending';
```

### 4.3 `latest_job_id` 外键处理

`tenant_panorama_assets.latest_job_id` 可以在 `tenant_panorama_jobs` 创建后再补外键，避免建表循环依赖：

```sql
alter table public.tenant_panorama_assets
  add constraint tenant_panorama_assets_latest_job_id_fkey
  foreign key (latest_job_id)
  references public.tenant_panorama_jobs(id)
  on delete set null;
```

## 5. Storage 设计

Bucket：

```text
panorama-assets
```

路径规范：

```text
{tenant_id}/{asset_id}/source/{index}-{file_id}.{ext}
{tenant_id}/{asset_id}/output/panorama.jpg
{tenant_id}/{asset_id}/output/preview.jpg
{tenant_id}/{asset_id}/output/manifest.json
{tenant_id}/{asset_id}/tiles/{col}_{row}.jpg
{tenant_id}/{asset_id}/debug/contact-sheet.jpg
```

第一版建议：

- 原图不公开，使用后端签名 URL 上传和读取。
- `preview.jpg`、`panorama.jpg`、`manifest.json` 可通过后端签名读取，避免 bucket 直接公开。
- H5 viewer 获取 manifest 时，由后端返回带有效期的资源 URL。
- 签名 URL 有效期第一版建议 `30` 分钟。

## 6. Viewer Manifest

后端统一对外返回 viewer manifest，不直接暴露数据库字段。

```json
{
  "id": "asset-id",
  "title": "客厅全景",
  "status": "ready",
  "type": "partial_equirectangular",
  "width": 7285,
  "height": 1594,
  "haov": 360,
  "vaov": 85,
  "vOffset": 0,
  "preview_url": "https://signed-url/preview.jpg",
  "panorama_url": "https://signed-url/panorama.jpg",
  "tiles": {
    "cols": 8,
    "rows": 2,
    "tile_url_template": "https://signed-url/tiles/{col}_{row}.jpg"
  },
  "default_view": {
    "yaw": 0,
    "pitch": 0,
    "fov": 75
  },
  "expires_at": "2026-05-14T14:30:00Z"
}
```

说明：

- 单排手机图默认按 `partial_equirectangular` 处理。
- 第一版 `haov` 可先固定为 `360`，`vaov` 根据输出高宽估算，后续由 worker 质量模型优化。
- 前端不能自行拼 storage path，必须以 manifest 返回 URL 为准。

## 7. API 契约

统一前缀建议：

```text
/panoramas
```

### 7.1 创建草稿资产

```http
POST /panoramas/draft
```

权限：

```text
panorama.create
```

请求：

```json
{
  "project_id": "uuid",
  "customer_id": "uuid",
  "property_id": "uuid",
  "title": "客厅全景",
  "description": "水电验收前拍摄",
  "source_type": "multi_image",
  "shooting_mode": "single_row",
  "expected_input_count": 12
}
```

响应：

```json
{
  "id": "asset-id",
  "tenant_id": "tenant-id",
  "status": "draft",
  "storage_bucket": "panorama-assets",
  "source_prefix": "tenant-id/asset-id/source/"
}
```

校验：

- `project_id`、`customer_id`、`property_id` 必须属于当前租户。
- `title` 必填，最长建议 `80` 字。
- `source_type=multi_image` 时，`expected_input_count` 建议 3-30。

### 7.2 获取上传凭证

```http
POST /panoramas/:assetId/upload-token
```

权限：

```text
panorama.create
```

请求：

```json
{
  "file_name": "IMG_0001.jpg",
  "content_type": "image/jpeg",
  "file_size": 2848123,
  "file_index": 1,
  "purpose": "source"
}
```

响应：

```json
{
  "path": "tenant-id/asset-id/source/001-uuid.jpg",
  "upload_url": "https://signed-upload-url",
  "expires_in": 1800
}
```

校验：

- 单张文件建议不超过 `30MB`。
- 支持 `image/jpeg`、`image/png`、`image/webp`。
- `file_index` 从 `1` 开始，最终提交任务时以后端收到的排序为准。

### 7.3 提交拼接任务

```http
POST /panoramas/:assetId/jobs
```

权限：

```text
panorama.create
```

请求：

```json
{
  "job_type": "stitch_images",
  "capture_direction": "clockwise",
  "expected_angle_step": 30,
  "input_paths": [
    "tenant-id/asset-id/source/001-uuid.jpg",
    "tenant-id/asset-id/source/002-uuid.jpg",
    "tenant-id/asset-id/source/003-uuid.jpg"
  ],
  "input_metadata": [
    { "path": "tenant-id/asset-id/source/001-uuid.jpg", "index": 1, "yaw": 0, "pitch": 0, "roll": 0 },
    { "path": "tenant-id/asset-id/source/002-uuid.jpg", "index": 2, "yaw": 30, "pitch": 0, "roll": 0 }
  ]
}
```

响应：

```json
{
  "asset_id": "asset-id",
  "job_id": "job-id",
  "asset_status": "queued",
  "job_status": "pending"
}
```

校验：

- `input_paths.length` 第一版限制 `3-30`。
- 所有 path 必须以 `{tenant_id}/{asset_id}/source/` 开头。
- 不接受跨租户 path。
- `input_metadata` 可选，仅记录，不作为阶段 1 必填。
- 成功创建 job 后，资产状态更新为 `queued`，`latest_job_id` 指向新任务。

### 7.4 查询资产列表

```http
GET /panoramas?project_id=&customer_id=&status=&page=&page_size=
```

权限：

```text
panorama.read
```

响应：

```json
{
  "items": [
    {
      "id": "asset-id",
      "title": "客厅全景",
      "project_id": "project-id",
      "customer_id": "customer-id",
      "status": "ready",
      "source_type": "multi_image",
      "input_count": 16,
      "width": 7285,
      "height": 1594,
      "preview_url": "https://signed-url/preview.jpg",
      "created_at": "2026-05-14T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1
  }
}
```

### 7.5 查询资产详情

```http
GET /panoramas/:assetId
```

权限：

```text
panorama.read
```

响应包含资产、最近任务、失败原因和可预览 URL。

### 7.6 查询任务状态

```http
GET /panoramas/jobs/:jobId
```

权限：

```text
panorama.read
```

响应：

```json
{
  "id": "job-id",
  "asset_id": "asset-id",
  "status": "processing",
  "job_type": "stitch_images",
  "attempt": 1,
  "quality_score": null,
  "error_code": null,
  "error_message": null,
  "started_at": "2026-05-14T12:00:10Z",
  "completed_at": null
}
```

### 7.7 获取预览 manifest

```http
GET /panoramas/:assetId/viewer-manifest
```

权限：

```text
panorama.read
```

规则：

- 只有 `ready` 状态返回可渲染 manifest。
- `failed` 返回错误码和可读文案。
- `disabled` 和 `deleted` 返回无权限或资源不可用。
- 小程序 web-view 使用同一个接口。

### 7.8 重试任务

```http
POST /panoramas/:assetId/retry
```

权限：

```text
panorama.retry
```

请求：

```json
{
  "reason": "调整顺序后重试",
  "input_paths": ["..."]
}
```

响应：

```json
{
  "asset_id": "asset-id",
  "job_id": "new-job-id",
  "asset_status": "queued",
  "job_status": "pending"
}
```

### 7.9 停用、启用、删除

```http
PATCH  /panoramas/:assetId/status
DELETE /panoramas/:assetId
```

权限：

```text
panorama.update
panorama.delete
```

删除第一版做软删除：

- `status='deleted'`
- `deleted_at=now()`
- storage 文件保留，后续通过清理任务删除。

## 8. 后端实现建议

按项目现有分层：

```text
controller
  只处理 HTTP、参数、ResponseHandler.success

service
  租户隔离、权限校验、业务状态流转、签名 URL、任务创建

repository / gateway
  Supabase 表查询、Storage signed URL、RPC
```

建议文件：

```text
apps/api/src/controllers/panoramas/index.ts
apps/api/src/services/panoramas/index.ts
apps/api/src/repositories/panoramas/index.ts
apps/api/src/schema/panoramas.ts
apps/api/src/routes/index.ts
```

错误码：

```text
PANORAMA_NOT_FOUND
PANORAMA_FORBIDDEN
PANORAMA_INVALID_STATUS
PANORAMA_INVALID_INPUT_COUNT
PANORAMA_INVALID_STORAGE_PATH
PANORAMA_UPLOAD_TOKEN_FAILED
PANORAMA_JOB_CREATE_FAILED
PANORAMA_MANIFEST_NOT_READY
```

错误响应必须经过项目现有 `error-factory.ts` 包装。

## 9. Worker 阶段 2 预留

阶段 1 创建 job 后可以先不执行真实 worker，但字段必须支持阶段 2：

```json
{
  "worker_options": {
    "max_input_side": 1600,
    "timeout_seconds": 420,
    "make_tiles": true,
    "run_dzsave": false
  },
  "output": {
    "preview_path": "tenant-id/asset-id/output/preview.jpg",
    "panorama_path": "tenant-id/asset-id/output/panorama.jpg",
    "manifest_path": "tenant-id/asset-id/output/manifest.json",
    "tile_base_path": "tenant-id/asset-id/tiles/",
    "width": 7285,
    "height": 1594,
    "projection": "partial_equirectangular"
  }
}
```

阶段 2 worker 领取任务时必须：

- 按 `pending -> processing -> completed/failed/timeout` 更新任务。
- 同步更新 `tenant_panorama_assets.status`。
- 失败写入 `error_code`、`error_message`、`error_detail`。
- 成功写入 output 路径、尺寸、projection、quality_score。

## 10. Admin 对接

阶段 1 admin 需要新增或预留：

- 项目详情页增加“360 全景”入口。
- 全景列表：
  - 标题
  - 项目
  - 客户
  - 状态
  - 图片数量
  - 创建人
  - 创建时间
  - 操作
- 操作：
  - 查看
  - 重试
  - 停用/启用
  - 删除
- 详情页：
  - 最近任务状态
  - 失败原因
  - 上传图片顺序
  - viewer 预览

阶段 1 admin 可以先只做查看和状态管理；多图上传可以先继续用 H5 上传页。

## 11. H5 对接

阶段 0 临时地址：

```text
https://h5.goodcms.cn/__360-upload/
```

阶段 1 正式 H5 建议：

```text
/panorama-upload?project_id=xxx&customer_id=xxx
/panorama-viewer/:assetId
```

上传流程：

1. 调用 `POST /panoramas/draft` 创建资产。
2. 每张图调用 `POST /panoramas/:assetId/upload-token`。
3. 前端直传 Storage。
4. 用户调整缩略图顺序。
5. 调用 `POST /panoramas/:assetId/jobs` 提交排序后的 `input_paths`。
6. 轮询 `GET /panoramas/jobs/:jobId`。
7. ready 后打开 `/panorama-viewer/:assetId`。

H5 必须保留拍摄提示：

- 默认 12 张，最低 8 张，最多 30 张。
- 每张间隔约 30°。
- 相邻重叠 30%-50%。
- 必须顺时针或逆时针连续拍摄。
- 同一站位，只旋转身体和手机。

## 12. 微信小程序对接

阶段 1 小程序建议只做查看，不做多图上传：

- 项目详情增加“360 全景”入口。
- 调用 `GET /panoramas?project_id=xxx&status=ready`。
- 点击后打开 web-view：

```text
https://h5.goodcms.cn/panorama-viewer/<assetId>?token=...
```

说明：

- 小程序不直接拼接、不直接渲染 WebGL。
- 如果后续要小程序上传多图，需要单独设计上传体验、压缩策略、断点续传和弱网处理。

## 13. 权限与租户隔离

后端必须强校验：

- 所有接口从 auth context 取 `tenant_id`。
- 不接受前端传入的 `tenant_id` 覆盖当前租户。
- `project_id`、`customer_id`、`property_id` 必须属于当前租户。
- Storage path 必须以当前租户和当前 asset 开头。
- 小程序客户只能查看自己项目下 `ready` 且未停用的资产。

权限点：

```text
panorama.read
panorama.create
panorama.update
panorama.delete
panorama.retry
```

## 14. 计费预留

阶段 1 不真扣费，但必须记录可计费维度：

- `input_count`
- `input_total_bytes`
- `width`
- `height`
- `job.duration_ms`
- `job.status`
- `job.error_code`
- `output.tile_count` 后续补充

阶段 2/3 可接入积分计费：

- 成功拼接按任务或图片数量扣费。
- 失败任务第一版建议只记录试算，不扣费。
- 存储费用按月统计。

## 15. 验收标准

阶段 1 完成后必须满足：

- migration 可重复执行，表、索引、约束创建成功。
- Supabase Storage bucket `panorama-assets` 创建成功。
- 权限点可由超管创建并分配给租户角色。
- `POST /panoramas/draft` 能创建租户隔离资产。
- `POST /panoramas/:assetId/upload-token` 返回当前租户路径。
- `POST /panoramas/:assetId/jobs` 创建 `pending` 任务并更新资产为 `queued`。
- `GET /panoramas` 只返回当前租户数据。
- `GET /panoramas/jobs/:jobId` 只允许当前租户访问。
- `GET /panoramas/:assetId/viewer-manifest` 对 `ready` 资产返回可渲染 manifest。
- admin 能看到资产和任务状态。
- H5 能创建资产、上传、提交任务、轮询状态。
- 小程序能通过 web-view 打开 ready 资产。
- 无权限访问返回明确错误码。

## 16. 执行顺序

建议按以下顺序推进：

1. 写 migration：表、索引、约束、bucket seed、权限点 seed。
2. 写 domain 类型和值域常量。
3. 写后端 schema、repository、service、controller、routes。
4. 写最小 API 验证脚本或 curl 验收命令。
5. 写 admin 对接文档。
6. 写 H5 对接文档。
7. 写微信小程序对接文档。
8. 执行 migration。
9. 后端本地验证。
10. 推进阶段 2 worker 生产化。

## 17. 阶段 2 入口条件

只有阶段 1 验收通过后，才能进入阶段 2：

- 任务表中能稳定生成 `pending` job。
- 前端能稳定轮询 job。
- Storage 路径和签名 URL 验证通过。
- 租户隔离没有越权。
- ready manifest 能被 viewer 渲染。

阶段 2 再把阶段 0 的 OpenCV 脚本改造成正式 worker。
