# 服务端 360 全景图片拼接与拖拽预览服务落地方案

日期：2026-05-14

## 结论

建议把能力拆成两层：

1. **服务端负责**：图片上传、任务排队、全景拼接、质量检测、缩略图/切片生成、资源发布、租户隔离、权限和计费。
2. **前端负责**：360 全景拖拽、缩放、陀螺仪、热点、全屏预览。

拖拽不是服务端能力。服务端应输出标准全景资源和 viewer manifest，小程序/H5/Admin 用 WebGL 全景 viewer 渲染。

第一版按“多图上传自动拼接全景图”落地，但需要明确拍摄约束和失败兜底：

- 租户上传同一空间、同一站位拍摄的多张图片。
- 服务端创建拼接任务，使用 OpenCV worker 输出全景图。
- 服务端生成缩略图、预览图、viewer manifest。
- H5/小程序 web-view 支持拖拽预览。
- 拼接失败时返回明确原因，允许重新上传。

已拼好的 2:1 全景图作为导入兜底能力保留，但不作为第一版主流程。普通手机单排拍摄通常只能得到“水平 360、垂直视角不完整”的部分全景；如果要完整 360x180 球面全景，需要多排拍摄、360 相机或鱼眼设备。第一版 viewer manifest 必须支持 `haov`、`vaov`、`vOffset` 或等价 `panoData`，避免把部分全景强行拉伸成完整球面。

## 推荐技术路线

### 服务端拼接

推荐第一版就使用 OpenCV stitching 模块作为拼接引擎。OpenCV 官方提供 `Stitcher` 高层 API，用于把多张图片拼接为 panorama。

落地方式：

- API 仍保持 Bun + Fastify。
- 拼接 worker 单独进程运行。
- worker 可以调用 Python/OpenCV 脚本或独立容器，不建议把 OpenCV 原生依赖直接塞进主 API 进程。
- worker 输出 equirectangular / partial equirectangular JPEG/WebP，或输出失败原因。
- worker 必须和主 API 分离，避免一次拼接占满 API 进程 CPU/内存。

### 切片与大图发布

高分辨率全景图不建议一次性加载原图。服务端需要生成：

- `preview.jpg`：列表和卡片缩略图。
- `panorama.jpg`：中等尺寸全景图，适合快速预览。
- `tiles/`：大图切片，适合高清拖拽和缩放。

切片工具可选：

- `libvips dzsave`：适合生成多分辨率瓦片。
- ImageMagick：适合简单裁切，但超大图性能和内存占用要谨慎。

### 前端拖拽 viewer

推荐 H5/Admin 使用 Photo Sphere Viewer 或 Pannellum：

- Photo Sphere Viewer 支持 equirectangular、cubemap、tiles、video 等 adapter，适合做更丰富交互。
- Pannellum 支持 equirectangular、cubemap、multi-resolution，全静态资源也能部署，适合轻量预览。

小程序原生 canvas 做完整 360 全景成本较高。第一版建议小程序用 web-view 打开 H5 全景预览页；后续如体验要求高，再评估原生小程序 WebGL 方案。

### 前端拍摄引导要求

第一版多图拼接强依赖拍摄质量，前端必须提供明确拍摄引导。不要只给一个普通多图上传入口。

建议默认规则：

- 默认拍摄 `12` 张。
- 最低允许 `8` 张。
- 最高限制 `24-30` 张，第一版建议先设为 `30`。
- 水平绕原地转一圈，每张间隔约 `30°`。
- 相邻照片至少 `30%` 重叠，推荐 `40%-50%`。
- 必须按顺时针或逆时针连续拍摄，不能跳拍、乱拍。
- 用户站在同一个点，尽量只旋转身体和手机，不要边走边拍。
- 手机高度保持一致，建议胸口或眼睛高度。
- 手机尽量保持水平，避免一张仰拍、一张俯拍。
- 尽量保持曝光稳定，不要频繁对焦到强光或暗处。
- 避免大面积白墙、玻璃、镜子、纯色吊顶等特征点不足场景。

如果追求更高成功率，可以引导用户拍 `18` 张，每张约 `20°`，重叠更多，但上传和处理时间会增加。

前端交互建议：

- 拍摄页显示圆形进度盘。
- 默认顺时针拍摄，每拍一张推进一个角度刻度。
- 每张照片展示顺序编号：`001`、`002`、`003`。
- 拍完后提供缩略图顺序预览。
- 允许用户拖动调整顺序。
- 提交后端时必须按最终顺序传 `input_paths`。
- 如果前端能采集设备朝向，可额外提交 `yaw`、`pitch`、`roll` 作为辅助元数据，但第一版后端不能强依赖这些字段。

## 产品范围

### 第一版

目标：先打通“多图上传 -> 自动拼接 -> 发布 -> 可拖拽查看”的闭环。

功能：

- 租户上传 3 到 30 张图片创建拼接任务。
- 支持同一空间、同一站位、按顺序环绕拍摄的图片。
- 上传页提供拍摄规范提示：
  - 默认拍 12 张，最低 8 张，最多 30 张。
  - 每张间隔约 30°，相邻图片建议 30% 到 50% 重叠。
  - 按顺时针或逆时针连续拍摄，照片顺序不能乱。
  - 尽量固定手机高度和水平角度。
  - 同一组图片不要混入不同房间或不同光照时间。
  - 避免大面积白墙、玻璃、镜面、水面等特征点不足场景。
- 后端校验图片格式、数量、尺寸、总大小。
- worker 执行 OpenCV 拼接，输出全景图或失败原因。
- 服务端生成预览图和 viewer manifest。
- H5/Admin/小程序 web-view 可拖拽查看。
- 支持绑定项目、工地、施工日志或验收记录。
- 支持启用、停用、删除。
- 支持上传已拼好的 2:1 全景图作为兜底导入路径。

不做：

- 不做热点导览。
- 不做视频 360。
- 不做 AI 修补缺失区域。
- 不保证所有普通图片都能成功拼接；失败是正常业务状态，需要明确提示。

### 第二版

目标：提升拼接成功率和展示质量。

功能：

- 支持多排拍摄图片，提升垂直视角。
- 增加自动排序、曝光补偿、裁切建议。
- 增加质量评分和人工复核入口。
- 支持多分辨率瓦片。
- 支持失败后按“已上传图片顺序”重试。

### 第三版

目标：提升展示体验和运营能力。

功能：

- 热点标注和场景跳转。
- 多全景组成工地 tour。
- 水印、Logo、项目名、拍摄时间。
- 分享链接、访问统计。
- 计费：按拼接任务、图片数量、输出分辨率或存储容量扣费。

## 数据模型

### `tenant_panorama_assets`

全景资产主表。

```sql
create table public.tenant_panorama_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid null references public.projects(id) on delete set null,
  source_type text not null default 'multi_image',
  title text null,
  status text not null default 'draft',
  input_count integer not null default 0,
  width integer null,
  height integer null,
  output_projection text null,
  horizontal_angle_of_view numeric null,
  vertical_angle_of_view numeric null,
  vertical_offset numeric null,
  preview_path text null,
  panorama_path text null,
  manifest_path text null,
  tile_base_path text null,
  metadata jsonb not null default '{}',
  created_by_employee_id uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint tenant_panorama_assets_status_check
    check (status in ('draft', 'processing', 'ready', 'failed', 'disabled')),
  constraint tenant_panorama_assets_source_type_check
    check (source_type in ('multi_image', 'equirectangular', 'cubemap')),
  constraint tenant_panorama_assets_output_projection_check
    check (output_projection is null or output_projection in ('equirectangular', 'partial_equirectangular', 'cubemap'))
);
```

### `tenant_panorama_jobs`

拼接和资源处理任务表。

```sql
create table public.tenant_panorama_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid null references public.tenant_panorama_assets(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  input_paths jsonb not null default '[]',
  output jsonb not null default '{}',
  error_code text null,
  error_message text null,
  quality_score numeric null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_by_employee_id uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_panorama_jobs_job_type_check
    check (job_type in ('publish_equirectangular', 'stitch_images', 'generate_tiles')),
  constraint tenant_panorama_jobs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);
```

### Storage bucket

建议新增 bucket：

```text
panorama-assets
```

路径规范：

```text
{tenant_id}/{asset_id}/source/{uuid}.jpg
{tenant_id}/{asset_id}/output/panorama.jpg
{tenant_id}/{asset_id}/output/preview.jpg
{tenant_id}/{asset_id}/output/manifest.json
{tenant_id}/{asset_id}/tiles/{level}/{x}_{y}.jpg
```

## API 设计

### 创建草稿资产

```http
POST /panoramas/draft
```

用途：先生成 `asset_id`，让多张源图可以上传到同一个目录。

请求：

```json
{
  "project_id": "project-id",
  "title": "客厅全景",
  "source_type": "multi_image",
  "expected_input_count": 12
}
```

返回：

```json
{
  "id": "asset-id",
  "status": "draft"
}
```

### 创建上传凭证

```http
POST /panoramas/upload-token
```

请求：

```json
{
  "project_id": "project-id",
  "asset_id": "asset-id",
  "file_name": "room-01.jpg",
  "content_type": "image/jpeg",
  "purpose": "source",
  "file_index": 1
}
```

返回：

```json
{
  "path": "tenant-id/asset-id/source/001-file-id.jpg",
  "upload_url": "signed-upload-url"
}
```

### 创建全景资产

```http
POST /panoramas
```

第一版请求：

```json
{
  "project_id": "project-id",
  "title": "客厅全景",
  "source_type": "multi_image",
  "shooting_mode": "single_row",
  "capture_direction": "clockwise",
  "expected_angle_step": 30,
  "input_paths": [
    "tenant-id/asset-id/source/001-file-id.jpg",
    "tenant-id/asset-id/source/002-file-id.jpg",
    "tenant-id/asset-id/source/003-file-id.jpg",
    "tenant-id/asset-id/source/004-file-id.jpg"
  ],
  "capture_metadata": [
    { "path": "tenant-id/asset-id/source/001-file-id.jpg", "index": 1, "yaw": 0, "pitch": 0, "roll": 0 },
    { "path": "tenant-id/asset-id/source/002-file-id.jpg", "index": 2, "yaw": 30, "pitch": 0, "roll": 0 }
  ]
}
```

约束：

- `input_paths.length` 第一版限制为 3 到 30。
- 默认按上传顺序拼接。
- 如果前端允许拖动排序，需要把排序后的 `input_paths` 提交给后端。
- `capture_metadata` 为可选辅助信息，后端第一版只做记录和排障，不作为必填。
- `source_type=equirectangular` 作为已成片导入兜底，仅允许 1 张输入图。

返回：

```json
{
  "id": "asset-id",
  "status": "processing",
  "job_id": "job-id"
}
```

### 查询处理任务

```http
GET /panoramas/jobs/:id
```

返回：

```json
{
  "id": "job-id",
  "status": "completed",
  "quality_score": 0.92,
  "error_code": null,
  "error_message": null
}
```

### 获取 viewer manifest

```http
GET /panoramas/:id/viewer-manifest
```

返回：

```json
{
  "id": "asset-id",
  "title": "客厅全景",
  "type": "partial_equirectangular",
  "width": 8192,
  "height": 2400,
  "haov": 360,
  "vaov": 105,
  "vOffset": 0,
  "preview_url": "https://...",
  "panorama_url": "https://...",
  "tiles": null,
  "default_view": {
    "yaw": 0,
    "pitch": 0,
    "fov": 75
  }
}
```

第三版瓦片返回：

```json
{
  "type": "equirectangular_tiles",
  "width": 12000,
  "height": 6000,
  "base_url": "https://.../preview.jpg",
  "tile_url_template": "https://.../tiles/{level}/{x}_{y}.jpg",
  "levels": [
    { "level": 0, "cols": 4, "rows": 2 },
    { "level": 1, "cols": 8, "rows": 4 },
    { "level": 2, "cols": 16, "rows": 8 }
  ]
}
```

## Worker 处理流程

### 第一版：多图拼接

1. 领取 `stitch_images` job。
2. 下载全部源图。
3. 基础校验：
   - 图片数量 3 到 30。
   - 单张图片大小不超过平台限制。
   - 所有图片分辨率接近。
   - 总像素、总文件大小不超过 worker 配置。
4. 预处理：
   - 统一方向，读取并应用 EXIF orientation。
   - 按最长边压缩到 worker 目标尺寸，避免原图过大导致内存失控。
   - 可选：按上传顺序生成 contact sheet，便于失败排查。
5. 调用 OpenCV Stitcher。
6. 根据结果分支：
   - 成功：输出 `panorama.jpg`，继续生成 preview 和 manifest。
   - 失败：记录 `STITCH_FEATURE_NOT_ENOUGH`、`STITCH_CAMERA_PARAMS_FAILED`、`STITCH_BLEND_FAILED`、`STITCH_TIMEOUT` 等错误。
7. 判断输出类型：
   - 宽高接近 2:1 且覆盖完整垂直视角：`output_projection=equirectangular`。
   - 单排手机图通常输出为 `partial_equirectangular`，manifest 写入 `haov=360`、估算 `vaov` 和 `vOffset`。
8. 记录质量信息：
   - 输出尺寸。
   - 裁切比例。
   - 匹配点数量。
   - 处理耗时。
   - 失败原因。
9. 上传 `preview.jpg`、`panorama.jpg`、`manifest.json`。
10. 更新任务和资产状态。

### 第一版兜底：已成片导入

1. 领取 `publish_equirectangular` job。
2. 下载 1 张源图。
3. 校验格式：JPEG/PNG/WebP。
4. 校验尺寸：
   - 建议最小宽度 2048。
   - 推荐 2:1。
   - 非 2:1 标记为 `partial_equirectangular`，要求前端按 manifest 渲染。
5. 生成 `preview.jpg`。
6. 生成 `panorama.jpg`。
7. 写 `manifest.json`。
8. 更新资产为 `ready`。

## 权限与租户隔离

建议新增权限点：

```text
panorama.read
panorama.create
panorama.update
panorama.delete
```

规则：

- 租户管理员只能访问自己租户的全景资产。
- 项目绑定必须校验 `projects.tenant_id = authContext.tenantId`。
- 普通员工是否能创建，由权限点和项目数据范围共同决定。
- 小程序客户只能查看自己项目下已发布且未禁用的全景。

## Admin / 小程序 / H5 对接

### Admin

新增“全景资产”页面：

- 列表：标题、项目、状态、来源、创建人、创建时间。
- 创建：上传全景图或多图拼接。
- 详情：处理状态、失败原因、预览、重新处理、停用、删除。
- 预览：嵌入 H5 viewer。

### 小程序

建议第一版不直接做原生全景 viewer。

小程序展示方式：

- 项目详情增加“360 全景”入口。
- 点击后打开 web-view。
- web-view 加载 H5 viewer 页面。

### H5 Viewer

建议新增：

```text
/panorama-viewer/:assetId
```

能力：

- 读取 `/panoramas/:id/viewer-manifest`。
- 加载 Photo Sphere Viewer 或 Pannellum。
- 支持拖拽、缩放、全屏、热点预留。
- 支持加载失败占位。

## 计费建议

第一版可先不收费，只统计用量。

建议记录：

- 上传原图数量。
- 原图总大小。
- 输出全景大小。
- 切片数量。
- worker 处理耗时。
- 失败次数。
- 拼接成功率。
- 平均处理耗时。

正式收费建议：

- 多图拼接：按图片数量 + 输出分辨率 + worker 时长扣费。
- 已成片导入：按输出图一次性低价扣费。
- 存储：按资产占用空间进入月度用量统计。

## 风险与处理

### 普通图片拼接失败率

风险：客户上传的图片没有足够重叠、角度不连续、曝光差异大。

处理：

- 第一版就开放多图拼接，但必须在上传页明确拍摄要求。
- 拼接失败返回可理解文案。
- 失败不扣拼接成功费，只记录资源消耗；如接入积分，建议失败只扣少量基础处理费或第一版先不扣费。
- 保留已成片导入兜底，方便客户用 360 相机或第三方工具生成全景后上传。

### 服务端资源消耗

风险：OpenCV 拼接和大图切片占 CPU、内存和磁盘。

处理：

- worker 与 API 分离。
- 限制并发。
- 单任务设置超时。
- 临时文件处理完成后清理。

### 小程序 WebGL 兼容

风险：小程序原生 WebGL 和第三方 viewer 兼容成本高。

处理：

- 第一版用 web-view 承载 H5 viewer。
- 小程序只负责入口和权限。

### 大图加载慢

风险：8K/12K 全景图在移动端加载慢。

处理：

- 第一版输出中等尺寸图。
- 第三版接入瓦片。
- viewer 先加载 preview，再加载高清。

## 分阶段执行计划

### Phase 0：技术验证

先不要建 `tenant_panorama_jobs` 和正式 worker。先使用本目录的阶段 0 原型验证核心链路：

```text
docs/360video/prototype/
├── README.md
├── stitch_panorama.py
└── viewer.html
```

执行顺序：

1. 开发机安装 Python、OpenCV。
2. 准备一组按顺序命名的房间环绕照片。
3. 执行 `stitch_panorama.py`，调用 `cv2.Stitcher.create()` 拼接。
4. 成功后输出 `panorama.jpg`、`preview.jpg`、`manifest.json`。
5. 使用脚本生成 PSV 网格瓦片。
6. 可选调用 `vips dzsave` 生成 Deep Zoom 瓦片，验证大图切片链路。
7. 用 `viewer.html` 加载 manifest，验证拖拽预览。

注意：`vips dzsave` 的 Deep Zoom 瓦片不能直接等同于 Photo Sphere Viewer 的经纬网格瓦片。阶段 0 脚本会同时生成 PSV 可直接加载的简单网格瓦片，`dzsave` 只用于验证后续大图切片能力。

验收标准：

- 用 8 到 12 张同一房间环绕照片完成一次 OpenCV 拼接。
- 输出 `panorama.jpg`、`preview.jpg`、`manifest.json`。
- H5 viewer 可拖拽预览。
- 小程序 web-view 可打开 H5 viewer。
- 资源走 Supabase Storage 或对象存储公开/签名 URL。
- 至少验证 1 组失败样本能返回明确错误码。

### Phase 1：多图拼接 MVP

验收标准：

- Admin 可上传 3 到 30 张图片并提交拼接。
- 后端创建 `stitch_images` job。
- worker 可领取任务并输出全景图。
- 后端生成 preview、panorama、manifest。
- 资产状态从 `processing` 变为 `ready`。
- 拼接失败时资产状态为 `failed`，返回明确错误码和文案。
- 项目详情能看到全景入口。
- 小程序 web-view 能拖拽查看。

### Phase 2：质量增强和已成片导入

验收标准：

- 支持已成片 2:1 全景图直接导入。
- 支持上传前图片排序调整。
- 支持拼接质量评分。
- 支持失败后复用源图重新提交。
- worker 并发、超时、临时文件清理可控。

### Phase 3：瓦片与 tour

验收标准：

- 超大图可生成瓦片。
- H5 viewer 按瓦片加载。
- 支持多个全景场景切换。
- 支持热点标注。

## 需要拍板的问题

1. 第一版多图上传数量上限是否定为 30 张？
2. 第一版是否只支持单排环绕拍摄，暂不支持多排补天补地？
3. 全景资产是绑定项目、施工日志、验收单，还是都支持？
4. 小程序是否接受 web-view 方案？
5. 是否需要客户可见，还是只给员工/Admin 使用？
6. 拼接失败第一版是否不扣费，只做用量记录？
7. 是否纳入积分计费？如果纳入，按图片数量、worker 时长还是输出分辨率扣费？

## 参考资料

- OpenCV stitching module：`https://docs.opencv.org/3.4/d0/d33/tutorial_table_of_content_stitching.html`
- libvips `dzsave`：`https://www.libvips.org/API/current/method.Image.dzsave.html`
- Photo Sphere Viewer equirectangular adapter：`https://photo-sphere-viewer.js.org/guide/adapters/equirectangular.html`
- Photo Sphere Viewer tiles adapter：`https://photo-sphere-viewer.js.org/guide/adapters/equirectangular-tiles.html`
- Pannellum overview：`https://pannellum.org/documentation/overview/`
