# 平台存储迁移腾讯云 COS 落地方案

日期：2026-05-14  
范围：后端 API、Admin、微信小程序、H5 活动页、360 全景服务  
结论：可以迁移到腾讯云 COS，但不能一次性替换所有历史 URL。建议采用“统一文件网关 + 新上传走 COS + 历史数据渐进迁移 + 读取兼容”的方式推进。

## 1. 背景与目标

当前平台已经计划让 360 全景资产使用腾讯云 COS。进一步把平台通用图片、附件、头像、营销素材等也迁移到 COS 是合理的，主要收益是：

- 统一存储供应商，便于成本、权限、生命周期、CDN、跨端访问域名统一治理。
- 降低 Supabase Storage 和业务数据库强绑定，后续可按租户、业务域、文件类型做独立策略。
- 支持大文件、瓦片、视频转文本源文件、全景图等更重的资产类型。
- 避免前端和业务表长期保存第三方存储公网 URL，降低后续换域名、换 CDN、私有化访问的成本。

第一期目标不是清空 Supabase Storage，而是先收口新文件上传和读取逻辑，让新增数据默认落 COS，历史数据可继续展示。

## 2. 当前存储现状

### 2.1 Supabase Storage 使用点

当前后端直接使用的 Supabase Storage bucket 是 `project-logs`：

- Bucket 创建：`supabase/migrations/20260418044333_create_project_logs_bucket.sql`
- 上传入口：`POST /uploads/images`
- 公网 URL 跳转入口：`GET /uploads/public-url`
- 后端代码位置：
  - `apps/api/src/controllers/uploads/index.ts`
  - `apps/api/src/controllers/project-logs/index.ts`
  - `apps/api/src/controllers/projects/index.ts`
  - `apps/api/src/controllers/customer-self-service/index.ts`
  - `apps/api/src/services/project-acceptances.ts`
  - `apps/api/src/services/customer-project-log-shares.ts`

现有逻辑特点：

- `/uploads/images` 接收 multipart 图片，上传到 `project-logs` bucket。
- 返回 `{ url, path }`，部分前端保存 `url`，部分业务保存 `path`。
- 读取时如果字段是 `http(s)` URL 就直接返回；如果是相对路径，就用 Supabase `getPublicUrl(path)` 拼公网 URL。
- `project-logs` bucket 当前是公开 bucket。

### 2.2 已发现的文件字段

| 业务 | 表/字段 | 当前含义 | 迁移优先级 |
| --- | --- | --- | --- |
| 项目日志 | `project_logs.images` | 日志图片，jsonb 数组，可能保存 URL 或 path | P0 |
| 项目日志评论 | `project_log_comments.images` | 评论图片 URL/path 数组 | P0 |
| 工序验收 | `project_acceptance_actions.images`、`rectification_images`、`referenced_images` | 验收、整改、引用图片 | P0 |
| 客户跟进评论 | `customer_follow_up_comments.images` | 评论图片 URL 数组 | P1 |
| 费用审批 | `expense_request_items.evidence_images`、`expense_request_settlements.evidence_images`、`payments.evidence_images` | 凭证图片 | P1 |
| 项目转介绍 | `project_referrals.paid_evidence_images` | 支付凭证图片 | P1 |
| 客户抖音截图 | `customers.douyin_screenshot_images` | 抖音来源截图 | P1 |
| 员工头像 | `employees.avatar` | 员工头像 URL/path | P1 |
| 用户资料头像 | `user_profiles.avatar_path` | 用户头像存储路径 | P1 |
| H5 营销页 | `marketing_pages.cover_image`、`marketing_assets.file_url` | 封面和素材 URL | P1 |
| 客户分享 | `customer_log_share_assists.helper_avatar` | 助力头像快照 | P2 |
| 客户首页性能 RPC | `cover_image_path` | 从项目日志图片派生出的封面路径 | 跟随 P0 |
| 360 全景 | `tenant_panorama_assets.storage_*` | 已按 COS 设计 | 已完成第一步 |

## 3. 目标架构

### 3.1 统一文件网关

新增后端文件网关，不再让 controller/service 直接调用 Supabase Storage 或 COS SDK。

建议模块：

- `apps/api/src/services/files/file-storage-gateway.ts`
- `apps/api/src/services/files/tencent-cos-storage-provider.ts`
- `apps/api/src/services/files/file-url-resolver.ts`
- `apps/api/src/repositories/platform-file-objects.ts`

职责划分：

- controller 只处理 HTTP、鉴权、参数校验、返回响应。
- service 编排上传场景、租户归属、业务权限、文件记录。
- gateway 封装 COS 上传、签名 URL、删除、元数据获取。
- resolver 统一把历史 URL、历史 path、COS object key 转成前端可访问 URL。

### 3.2 文件元数据表

建议新增 `platform_file_objects`，作为所有新文件的统一索引。

核心字段建议：

```sql
create table public.platform_file_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  owner_type text not null,
  owner_id uuid null,
  scene text not null,
  provider text not null default 'tencent_cos',
  bucket text not null,
  region text null,
  object_key text not null,
  original_name text null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  width integer null,
  height integer null,
  checksum text null,
  visibility text not null default 'private',
  public_url text null,
  legacy_url text null,
  legacy_path text null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by_auth_user_id uuid null,
  created_by_employee_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (provider, bucket, object_key)
);
```

说明：

- `public_url` 只保存 CDN 稳定地址，不保存短期 signed URL。
- 私有文件读取时由后端生成临时 URL。
- 历史迁移时保存 `legacy_url` 或 `legacy_path`，便于回溯和回滚。
- 业务表第一阶段可以继续保存字符串数组，后端通过 resolver 兼容；第二阶段再逐步改为 file id 或结构化 JSON。

### 3.3 Object Key 规则

建议统一格式：

```text
tenants/{tenant_id}/{scene}/{yyyy}/{mm}/{dd}/{uuid}.{ext}
public/{scene}/{yyyy}/{mm}/{dd}/{uuid}.{ext}
system/{scene}/{yyyy}/{mm}/{dd}/{uuid}.{ext}
```

示例：

```text
tenants/51111111-1111-4111-8111-111111111111/project-log/2026/05/14/8f3c....jpg
tenants/51111111-1111-4111-8111-111111111111/panorama/jobs/job-id/source/001.jpg
public/h5-marketing-page/2026/05/14/cover.webp
```

规则：

- 租户业务文件必须带 `tenant_id`。
- 公共素材、平台配置素材走 `public/`。
- 系统生成文件走 `system/`。
- 不把用户上传文件名直接作为 object key，避免中文、空格、重复名、路径注入问题。

## 4. API 兼容设计

### 4.1 保持旧上传接口兼容

现有 `/uploads/images` 不建议立即废弃。第一阶段改为包装 COS 上传，响应保持兼容：

```json
{
  "list": [
    {
      "url": "https://cdn.example.com/tenants/.../image.jpg",
      "path": "https://assets.goodcms.cn/tenants/.../image.jpg",
      "file_id": "uuid",
      "provider": "tencent_cos",
      "bucket": "gooes-platform-assets",
      "object_key": "tenants/.../image.jpg"
    }
  ]
}
```

兼容原则：

- 旧前端继续读取 `url` 和 `path` 不受影响；第一阶段 COS 上传时 `path` 暂时返回兼容 URL，真实 object key 放在 `object_key`。
- 新前端优先保存 `file_id` 或 `object_key`。
- 后端保存时允许 URL、旧 path、新 object key 混用，但输出时统一解析为可访问 URL。

### 4.2 新增文件接口

建议新增：

| API | 用途 |
| --- | --- |
| `POST /files/images` | 新图片上传入口，替代 `/uploads/images` |
| `POST /files/upload-token` | 大文件/直传 COS 获取临时上传凭证 |
| `GET /files/:id/url` | 获取文件访问 URL |
| `POST /files/resolve` | 批量把 file id/path/url 解析为可访问 URL |
| `DELETE /files/:id` | 软删除文件并按策略删除 COS 对象 |

第一期可以先只实现 `/uploads/images` 兼容改造和 `platform_file_objects` 记录，直传能力放第二期。

## 5. 环境变量与 COS 配置

建议统一配置：

```env
PLATFORM_STORAGE_PROVIDER=tencent_cos
TENCENT_COS_SECRET_ID=***
TENCENT_COS_SECRET_KEY=***
PLATFORM_COS_BUCKET=gooes-platform-assets
PLATFORM_COS_REGION=ap-guangzhou
PLATFORM_COS_PUBLIC_BASE_URL=https://assets.goodcms.cn
PLATFORM_COS_SIGNED_URL_TTL_SECONDS=900
PLATFORM_COS_UPLOAD_MAX_IMAGE_SIZE_MB=10
```

说明：COS 使用 `TENCENT_COS_SECRET_ID` / `TENCENT_COS_SECRET_KEY` 独立密钥，不复用物联网视频、ASR 等腾讯云配置，避免不同业务权限耦合。

360 全景可继续使用独立 bucket：

```env
PANORAMA_COS_BUCKET=gooes-panorama-assets
PANORAMA_COS_REGION=ap-guangzhou
PANORAMA_COS_PUBLIC_BASE_URL=https://panorama.goodcms.cn
```

建议 bucket 策略：

- 普通图片：私有 bucket + CDN 回源鉴权或后端签名 URL。
- H5 封面、公开营销图：允许生成长期 CDN URL。
- 全景瓦片：建议单独 bucket 或独立 prefix，方便 CDN 缓存和生命周期管理。
- 临时上传源文件：设置生命周期自动清理。

## 6. 分阶段执行计划

### 阶段 0：存储盘点与冻结直接调用

目标：确认所有读写点，避免新增代码继续直连 Supabase Storage。

执行项：

- 建立当前文档中的字段清单。
- 用 `rg "storage.from|getPublicUrl|upload\\(" apps/api/src` 定期检查新增直连。
- 约定后续新增上传能力必须走文件网关。

验收标准：

- 后端已列出所有 Supabase Storage 直接调用点。
- 新增功能设计中不再直接依赖 `project-logs` bucket。
- 360 全景已按 COS 设计，不再回退 Supabase Storage。

### 阶段 1：新增 COS 文件网关和元数据表

目标：具备后端上传 COS、记录文件元数据、生成访问 URL 的能力。

执行项：

- 新增 `platform_file_objects` migration。
- 实现 Tencent COS provider。
- 实现 `file-url-resolver`，支持：
  - `http(s)` 旧 URL 原样返回。
  - `project-logs` 旧 path 转 Supabase public URL。
  - COS object key 转 CDN URL 或 signed URL。
- `/uploads/images` 内部改走文件网关，但响应兼容旧结构。

验收标准：

- Admin 上传员工头像、费用凭证、验收图片仍可正常提交和预览。
- 微信小程序上传项目日志图片仍可正常展示。
- 新上传文件在 COS bucket 可查到对象。
- `platform_file_objects` 有对应记录。
- 旧 Supabase path 图片仍能展示。

### 阶段 2：高频业务读路径接入 resolver

目标：所有项目日志和验收相关读取都通过 resolver 输出 URL。

执行项：

- 改造项目日志、项目详情、客户自助端、客户分享服务。
- 改造工序验收图片、整改图片、引用图片输出。
- 改造客户首页最近动态 RPC 后的后端 URL 解析。

验收标准：

- 同一个项目日志同时包含旧 Supabase path、旧 public URL、新 COS object key 时，Admin 和小程序均能显示。
- 工序验收“客户引用图片”“提交整改图片”均能显示。
- 小程序客户首页最近动态封面不受影响。

### 阶段 3：其余业务上传入口切换 COS

目标：所有新图片上传默认进入 COS。

执行项：

- 员工头像、客户头像、抖音截图。
- 客户跟进评论图片。
- 费用审批凭证、转介绍支付凭证。
- H5 营销页封面和素材。
- 保持前端请求路径不变，后台统一切换。

验收标准：

- 各业务新上传数据均写入 COS。
- 业务表保存的字符串仍能被后端解析。
- 删除或编辑业务数据时，不出现历史图片丢失。

### 阶段 4：历史数据迁移

目标：把 Supabase `project-logs` bucket 的历史对象迁移到 COS，并保留回滚依据。

执行项：

- 编写迁移 worker：
  - 扫描业务表中的旧 Supabase path 和 public URL。
  - 下载旧对象。
  - 上传到 COS 新 object key。
  - 写入 `platform_file_objects`。
  - 建立旧值到新文件的映射。
- 先 dry-run 输出迁移报告。
- 小批量按租户迁移，优先迁移近期活跃租户。

验收标准：

- 单租户抽样迁移通过，图片数量、大小、mime type 对账一致。
- 迁移后前端图片 URL 正常。
- 失败对象有明确失败原因，可重试。
- 迁移过程不修改业务表时，读取仍可通过映射表找到新对象。

### 阶段 5：业务表结构化改造

目标：减少业务表直接保存公网 URL，逐步改为 `file_id` 或结构化对象。

建议新格式：

```json
[
  {
    "file_id": "uuid",
    "object_key": "tenants/.../image.jpg",
    "url": "legacy optional",
    "sort_order": 1
  }
]
```

执行项：

- 项目日志、验收、费用凭证等高频表优先改造。
- 后端入参继续兼容字符串数组。
- 出参增加 `image_items`，保留 `images` 兼容旧端。

验收标准：

- 新端可基于 `image_items` 展示。
- 旧端只读 `images` 不受影响。
- 数据库可追踪文件归属、创建人、租户。

### 阶段 6：Supabase Storage 下线

目标：确认无读取依赖后，再停止写入和删除旧 bucket。

执行项：

- 监控 2-4 周，没有旧 path 解析请求或错误。
- 导出 Supabase Storage 对象清单作为归档。
- 下线 `project-logs` bucket 写入权限。
- 最后再删除 bucket 或保留只读归档。

验收标准：

- `rg "storage.from"` 后端无业务调用，只剩迁移脚本或兼容工具。
- 所有线上图片请求来自 COS/CDN。
- 回滚预案验证完成。

## 7. Admin、微信小程序、H5 对接要求

### 7.1 Admin

- 近期不需要大面积改页面，继续调用 `/api/backend/uploads/images` 即可。
- 上传成功后优先保存 `file_id` 或 `object_key`；如果页面还只支持字符串数组，暂时保存 `path`。
- 图片展示使用后端返回的 URL，不在前端拼 Supabase 或 COS 域名。
- H5 营销页编辑器上传封面和素材后，需要适配返回的 `file_id/provider/object_key`。

### 7.2 微信小程序

- 继续调用现有上传接口，不直接调用 COS。
- 小程序合法域名需要加入 COS CDN 域名，例如 `assets.goodcms.cn`、`panorama.goodcms.cn`。
- 如果后续使用签名 URL，需注意 URL 过期后重新拉取详情，不要长期缓存签名 URL。
- 上传后提交业务表单时，优先提交后端返回的 `path` 或 `file_id`，不要自行保存临时本地路径。

### 7.3 H5 活动页

- H5 营销页封面、素材 URL 统一由后端返回。
- 公开 H5 页面建议使用 CDN 长期 URL，避免访客页面依赖登录态签名。
- 如果素材被删除，后端应返回空值或占位，不让 H5 页面直接 404 堆叠。

### 7.4 360 全景服务

- 全景源图、拼接图、瓦片目录走独立 COS bucket 或独立 prefix。
- 上传源图建议使用临时目录，拼接成功后把输出图和瓦片标记为正式资产。
- 失败任务的源图按生命周期自动清理。

## 8. 风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 历史字段混用 URL/path/object key | 图片展示不稳定 | resolver 统一兼容，迁移前不强制改业务表 |
| 签名 URL 过期 | 小程序/H5 图片失效 | 前端不持久化 signed URL，重新请求详情刷新 |
| COS CORS 未配置 | 前端上传或预览失败 | 第一阶段走后端中转上传，直传阶段单独配置 CORS |
| 微信小程序域名未备案/未加入白名单 | 图片无法加载 | 上线前把 CDN 域名加入小程序 request/downloadFile 合法域名 |
| CDN 缓存旧图 | 替换图片不生效 | object key 不复用；需要替换时生成新 key |
| 删除文件误删仍被引用图片 | 历史页面缺图 | 第一版只软删除文件记录，COS 对象延迟删除 |
| 迁移过程对象丢失 | 历史图片缺失 | dry-run、迁移映射、失败重试、Supabase 只读保留观察期 |
| 成本失控 | 存储和 CDN 费用上升 | 按 bucket/prefix 做生命周期和访问日志，后台增加用量统计 |

## 9. 第一版推荐落地顺序

建议从低风险到高风险：

1. 建 `platform_file_objects` 表和 COS 网关。
2. `/uploads/images` 改为 COS 上传，但保持响应兼容。
3. 项目日志、工序验收、客户自助端图片读取接 resolver。
4. Admin 和小程序验证核心图片链路。
5. H5 营销页、费用审批、转介绍、客户跟进等业务接入。
6. 开始历史迁移 dry-run。
7. 分租户迁移历史数据。
8. 稳定后再考虑业务表结构化改造和 Supabase bucket 下线。

## 10. 第一阶段验收清单

必须全部通过后再推进历史迁移：

- Admin 项目日志上传 1 张新图片，COS 有对象，页面能预览。
- 微信小程序项目日志上传 1 张新图片，小程序和 Admin 都能查看。
- 工序验收上传整改图片，保存后刷新仍可查看。
- 旧 Supabase `project-logs` path 图片仍可查看。
- 旧 Supabase public URL 图片仍可查看。
- H5 营销页封面上传后，公开 H5 页面能加载。
- `platform_file_objects` 能按租户查询新增文件。
- 关闭 Supabase Storage 上传权限后，新上传不受影响。
- 发生 COS 上传失败时，接口返回明确错误，业务表不落脏数据。

## 11. 回滚方案

阶段 1-3 的回滚方式：

- 环境变量切回 `PLATFORM_STORAGE_PROVIDER=supabase_storage` 或关闭 COS 写入开关。
- `/uploads/images` 恢复上传 `project-logs` bucket。
- resolver 保留 COS 读取能力，避免已上传 COS 的图片无法显示。

阶段 4 后的回滚方式：

- 不删除旧 Supabase 对象。
- 业务表未改前，通过迁移映射可重新指回旧 URL/path。
- 如果业务表已经结构化，保留 `legacy_url/legacy_path` 字段用于恢复。

## 12. 结论

平台存储迁移 COS 是合理方向，但第一版不要追求一次性替换所有历史数据。最稳的做法是先实现统一文件网关，把新上传切到 COS，同时让后端读取层兼容 Supabase 历史 URL/path。等 Admin、微信小程序、H5 的核心链路验收通过，再按租户批量迁移历史数据。
