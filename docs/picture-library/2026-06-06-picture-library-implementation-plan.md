# 图片资料库完整实施方案

更新时间：2026-06-06

## 背景

平台需要在 admin 超管后台建设图片资料库，并按现有服务器目录组织首批素材：

```text
/Users/leefo/Public/work/goose-server/picture
```

当前素材目录按风格分类存放 `.webp` 图片。开发机扫描结果：

| 指标 | 数量 |
| --- | ---: |
| 分类数 | 18 |
| 图片数 | 363 |
| 单分类常见图片数 | 20 |

首批分类包括：法式、极简风、田园、简约风、欧美、轻奢、新中式、中式、美式、工业、中古、原木、ins风、欧式、简约、古典风格、北欧风、意式。

## 目标

1. admin 超管可维护图片资料库分类。
2. admin 超管可上传、编辑、排序、上下架、删除图片。
3. 支持从 `goose-server/picture` 批量导入首批素材。
4. 小程序 visitor 首页可按分类展示图片。
5. 用户可浏览图片详情，并进行收藏、点赞、评论。
6. 用户评论支持上传图片附件。
7. 小程序支持分享好友和朋友圈能力。
8. 为未来高清大图、分享海报、推荐排序和内容审核预留扩展能力。

## 非目标

第一阶段不做复杂推荐算法、不做 AI 自动打标签、不做跨租户个性化素材库、不做图片版权识别自动化。

## 关键原则

- `goose-server/picture` 只作为一次性导入源，不作为线上运行时文件目录。
- 正式图片文件必须进入 COS/CDN，并由数据库记录索引。
- 同一张图片支持多规格变体，避免后续从封面图升级高清图时返工。
- 公开 visitor 内容必须有上下架状态和审核能力。
- 评论图片属于用户生成内容，必须限制数量、大小、格式，并支持审核/隐藏。
- 小程序端不拼接 COS 地址，始终使用后端返回的可访问 URL。

## 推荐数据模型

### 图片分类

```text
picture_categories
- id
- parent_id
- name
- slug
- description
- cover_asset_id
- sort_order
- status
- created_at
- updated_at
```

说明：

- `status`: `active` / `inactive`
- `parent_id` 预留二级分类，例如风格、空间、户型。
- 首批可以只使用一级分类。

### 图片资产

```text
picture_assets
- id
- title
- description
- source
- original_filename
- dominant_color
- width
- height
- status
- sort_order
- like_count
- favorite_count
- comment_count
- share_count
- created_at
- updated_at
```

说明：

- `status`: `draft` / `published` / `hidden` / `deleted`
- `source`: `server_import` / `admin_upload`
- 计数字段可以先同步维护，后续必要时转为聚合表或物化视图。

### 图片多规格变体

```text
picture_asset_variants
- id
- asset_id
- variant
- file_object_id
- object_key
- width
- height
- file_size
- mime_type
- created_at
```

推荐 `variant`：

```text
thumb    列表缩略图
cover    卡片封面图
large    图片详情高清浏览图
original 原始图，可选
```

首批已有 `.webp` 可以作为 `cover` 或 `thumb` 导入。未来拿到高清图时，为同一个 `picture_asset` 补充 `large/original` 变体。

### 图片与分类关系

```text
picture_asset_categories
- asset_id
- category_id
- sort_order
- created_at
```

说明：

- 支持一张图属于多个分类。
- 首批导入时，一张图默认绑定文件夹对应分类。

### 点赞与收藏

```text
picture_asset_likes
- asset_id
- visitor_id
- created_at

picture_asset_favorites
- asset_id
- visitor_id
- created_at
```

约束：

- `(asset_id, visitor_id)` 唯一。
- 点赞和收藏都需要 visitor session。

### 评论与评论图片

```text
picture_asset_comments
- id
- asset_id
- visitor_id
- content
- status
- created_at
- updated_at

picture_asset_comment_images
- id
- comment_id
- file_object_id
- sort_order
- status
- created_at
```

说明：

- `status`: `pending` / `visible` / `hidden` / `rejected` / `deleted`
- 评论图片通过 `file_object_id` 关联统一文件对象，避免重复存储字段。
- 第一版建议每条评论最多 3 张图，后续可配置为 6 张。

### 分享事件

```text
picture_asset_share_events
- id
- asset_id
- visitor_id
- channel
- created_at
```

说明：

- `channel`: `wechat_session` / `wechat_timeline` / `poster`
- 分享事件用于统计，不作为微信分享成功的强确认。

## 后端接口规划

### admin 超管接口

```http
GET    /admin/picture-library/categories
POST   /admin/picture-library/categories
PATCH  /admin/picture-library/categories/:id
DELETE /admin/picture-library/categories/:id

GET    /admin/picture-library/assets
POST   /admin/picture-library/assets
PATCH  /admin/picture-library/assets/:id
DELETE /admin/picture-library/assets/:id
POST   /admin/picture-library/assets/:id/publish
POST   /admin/picture-library/assets/:id/hide

POST   /admin/picture-library/import/server-picture-plan
POST   /admin/picture-library/import/server-picture-apply

GET    /admin/picture-library/comments
POST   /admin/picture-library/comments/:id/approve
POST   /admin/picture-library/comments/:id/hide
DELETE /admin/picture-library/comments/:id
```

### visitor 小程序接口

```http
GET    /visitor/picture-library/categories
GET    /visitor/picture-library/assets?category_id=&page=&pageSize=
GET    /visitor/picture-library/assets/:id

POST   /visitor/picture-library/assets/:id/like
DELETE /visitor/picture-library/assets/:id/like
POST   /visitor/picture-library/assets/:id/favorite
DELETE /visitor/picture-library/assets/:id/favorite

GET    /visitor/picture-library/assets/:id/comments
POST   /visitor/picture-library/assets/:id/comments

POST   /uploads/cos/direct-init      scene=picture_comment
POST   /uploads/cos/direct-complete  scene=picture_comment

POST   /visitor/picture-library/assets/:id/share-events
```

## 分阶段实施

## 阶段 1：数据模型与首批素材导入

### 目标

建立图片资料库基础表，支持把 `goose-server/picture` 的目录分类和图片导入数据库与 COS。

### 范围

- 新增 Supabase migration。
- 新增导入脚本。
- 扫描 `goose-server/picture/<分类>/*.webp`。
- 自动创建分类。
- 将图片上传到 COS。
- 写入图片资产、变体和分类关系。
- 使用 checksum 去重，避免重复导入。

### 测试

```text
bun run api:check
bun apps/api/src/scripts/picture-library-import.ts -- --source /Users/leefo/Public/work/goose-server/picture --dry-run
bun apps/api/src/scripts/picture-library-import.ts -- --source /Users/leefo/Public/work/goose-server/picture --apply --limit 5
```

### 验收标准

- migration 可在开发库执行成功。
- dry-run 输出分类数、图片数、重复数和预计上传列表。
- apply 小批量导入成功。
- COS 中能看到对象。
- 数据库能查询到分类、图片资产、变体和分类关系。
- 重新执行导入不会重复创建同一张图片。

### 执行记录

执行时间：2026-06-06

已完成：

- 新增 `20260606170000_create_picture_library.sql` migration。
- 新增 `picture_categories`、`picture_assets`、`picture_asset_variants`、`picture_asset_categories`。
- 预留 `picture_asset_likes`、`picture_asset_favorites`、`picture_asset_comments`、`picture_asset_comment_images`、`picture_asset_share_events`。
- 新增 `picture-library-import.ts` 导入脚本。
- 新增 `api:picture-library-import` 脚本入口。
- 平台文件上传场景新增 `picture_library`，导入链路走统一 COS 文件对象索引。

开发库验证：

```text
supabase db push --yes
bun run api:check
bun run api:picture-library-import -- --dry-run
bun run api:picture-library-import -- --apply --limit 5
bun run api:picture-library-import -- --dry-run --limit 5
```

验证结果：

| 检查项 | 结果 |
| --- | --- |
| dry-run 分类数 | 18 |
| dry-run 可导入图片数 | 360 |
| dry-run 已存在资产数 | 0 |
| 小批量 apply | 创建 5 张图片资产 |
| `picture_categories` | 1 |
| `picture_assets` | 5 |
| `picture_asset_variants` | 5 |
| `picture_asset_categories` | 5 |
| `platform_file_objects(scene=picture_library)` | 5 |
| 重复 dry-run | 前 5 张识别为 existing，pending_upload_count=0 |

说明：

- 初次扫描统计的是可导入图片文件，过滤非图片文件后为 360 张。
- 当前仅执行小批量导入验证，未全量导入 360 张素材。
- 全量导入建议在 admin 管理页和回滚/隐藏策略完成后执行。

## 阶段 2：admin 分类与图片管理

### 目标

超管后台可管理图片分类和图片资产。

### 范围

- 新增 admin 图片资料库入口。
- 分类列表、新建、编辑、停用、排序、设置封面。
- 图片列表、筛选分类、搜索标题、状态筛选。
- 图片上传、编辑标题/描述/分类、上下架、删除。
- 图片预览使用 `thumb/cover`，详情可查看 `large/original` 是否存在。

### 测试

```text
pnpm --dir apps/admin check
bun run api:check
```

手工测试：

- 新建分类。
- 上传一张图片。
- 将图片绑定到多个分类。
- 上架后 visitor 接口可查。
- 下架后 visitor 接口不可见。
- 删除图片后 admin 列表不再展示，COS 对象不立即硬删除。

### 验收标准

- 超管可完整维护分类。
- 超管可完整维护图片。
- 图片上下架状态影响 visitor 公开接口。
- 页面无明显布局错位，移动宽度下表单可用。
- 无未授权普通租户后台访问入口。

### 执行记录

执行日期：2026-06-06

本轮已完成：

- 后端新增平台超管接口：`/platform/picture-library/categories` 与 `/platform/picture-library/assets`。
- 分类支持列表、新建、编辑、停用、排序、设置封面。
- 图片支持列表、分类筛选、标题搜索、状态筛选、上传、编辑、发布、隐藏、软删除。
- 图片上传复用现有 COS 直传链路，新增上传场景 `picture_library`。
- admin 新增入口：`/platform/picture-library`，并加入平台运营导航。
- admin 页面包含图片 KPI、图片列表、筛选分页、分类管理区和上传/编辑弹窗。

本轮实现取舍：

- 管理端上传第一版将同一张图登记为 `original` 与 `cover` 两个变体。
- 暂未引入服务端缩略图/高清图自动生成，后续可在阶段 7 做变体治理和补图脚本。
- 删除图片为软删除图片元数据，不立即删除 COS 对象，便于误删回滚和对账。

验收结果：

| 项目 | 结果 |
| --- | --- |
| `bun run api:check` | 通过 |
| `pnpm --dir apps/admin check` | 通过 |
| API 文件行数检查 | 通过，新增后端文件均小于 500 行 |
| admin 文件行数检查 | 通过，新增前端文件均小于 500 行 |
| `GET /platform/picture-library/categories` | 平台 token 验证通过，返回 1 条 |
| `GET /platform/picture-library/assets?page=1&pageSize=5` | 平台 token 验证通过，返回 5/5 |
| `GET /platform/picture-library` | admin 登录 cookie 验证通过，HTTP 200 |

后续依赖：

- 阶段 3 visitor 公开接口落地前，图片上下架状态只在 admin 管理侧完成；visitor 可见性需要由阶段 3 接口正式消费 `status=published`。

## 阶段 3：visitor 首页分类展示与图片浏览

### 目标

小程序 visitor 首页按分类展示图片，用户可进入分类和图片详情浏览。

### 范围

- 后端提供公开分类接口。
- 后端提供按分类分页图片接口。
- 后端提供图片详情接口。
- 接口返回适合小程序的图片规格：
  - 列表：`thumb` 或 `cover`
  - 详情：`large`，没有则回退 `cover`
- 小程序端对接文档落在本仓库 `docs/`，不直接修改 orange 仓库。

### 测试

```text
bun run api:check
curl GET /visitor/picture-library/categories
curl GET /visitor/picture-library/assets?category_id=xxx&page=1&pageSize=20
curl GET /visitor/picture-library/assets/:id
```

### 验收标准

- visitor 首页能拿到 active 分类。
- 每个分类能分页返回 published 图片。
- 下架/删除图片不会出现在 visitor 侧。
- 图片 URL 可访问。
- 首屏接口响应不返回全量 363 张图。
- 小程序能展示分类 tab、图片列表和详情页。

### 执行记录

执行日期：2026-06-06

本轮已完成：

- 新增 visitor 公开接口：`GET /visitor/picture-library/categories`。
- 新增 visitor 图片分页接口：`GET /visitor/picture-library/assets`。
- 新增 visitor 图片详情接口：`GET /visitor/picture-library/assets/:id`。
- 接口只返回 active 分类、published 且未删除图片。
- 列表图片按 `thumb -> cover -> original -> large` 回退。
- 详情图片按 `large -> cover -> original -> thumb` 回退。
- 图片对象返回可直接展示的 `url`，小程序无需自行拼接对象存储路径。
- 小程序对接文档已落在 `docs/picture-library/2026-06-06-picture-library-miniprogram-stage3-integration.md`。

本轮实现取舍：

- 阶段 3 浏览接口不要求 visitor token，便于首页冷启动展示。
- 点赞、收藏、评论、分享仍在后续阶段实现，届时写操作会要求 visitor session。

小程序回写对接：

- 小程序已完成阶段 3 浏览能力对接，回写文档位于 `/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-miniprogram-stage3-integration.md`。
- 小程序侧 smoke 显示公开接口冷态偏慢：分类约 5-6s，列表约 2.3-2.5s，详情约 2.1-2.3s。
- 后端已为不带 visitor token 的公开分类、列表、详情接口增加 5 分钟内存缓存。
- 点赞/收藏写操作会清空公开缓存，避免公开计数长期不一致。
- 后端复测缓存命中后耗时约 2-4ms；首个冷态请求仍可能受远程数据库和运行时冷缓存影响。

## 阶段 4：点赞与收藏

### 目标

用户可对图片点赞和收藏，详情页和列表能展示当前用户状态与计数。

### 范围

- 新增点赞/取消点赞接口。
- 新增收藏/取消收藏接口。
- 图片列表和详情返回：
  - `like_count`
  - `favorite_count`
  - `liked_by_me`
  - `favorited_by_me`
- 使用 visitor session 识别用户。
- 防重复点赞/收藏。

### 测试

```text
POST /visitor/picture-library/assets/:id/like
DELETE /visitor/picture-library/assets/:id/like
POST /visitor/picture-library/assets/:id/favorite
DELETE /visitor/picture-library/assets/:id/favorite
```

### 验收标准

- 同一 visitor 重复点赞不会重复计数。
- 取消点赞后计数正确减少。
- 收藏列表可后续扩展。
- 未带 visitor token 的写操作返回鉴权错误。
- 热点图片重复点击不会造成计数负数。

### 执行记录

执行日期：2026-06-06

本轮已完成：

- 新增点赞接口：`POST /visitor/picture-library/assets/:id/like`。
- 新增取消点赞接口：`DELETE /visitor/picture-library/assets/:id/like`。
- 新增收藏接口：`POST /visitor/picture-library/assets/:id/favorite`。
- 新增取消收藏接口：`DELETE /visitor/picture-library/assets/:id/favorite`。
- 图片列表和详情支持返回 `liked_by_me`、`favorited_by_me`。
- 写操作必须携带 visitor session token，未登录返回 401。
- 新增数据库 RPC 原子维护点赞/收藏计数，重复操作幂等，取消时使用 `greatest(count - 1, 0)` 防止负数。
- 小程序对接文档已落在 `docs/picture-library/2026-06-06-picture-library-miniprogram-stage4-interactions.md`。

验收结果：

| 项目 | 结果 |
| --- | --- |
| `bun run api:check` | 通过 |
| `supabase db push --yes` | 已应用阶段 4 RPC migration |
| 未登录点赞 | 401 |
| 重复点赞 | `like_count` 保持 1 |
| 重复取消点赞 | `like_count` 保持 0 |
| 重复收藏 | `favorite_count` 保持 1 |
| 重复取消收藏 | `favorite_count` 保持 0 |

小程序回写对接：

- 小程序已完成阶段 4 点赞/收藏能力对接，回写文档位于 `/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-miniprogram-stage4-interactions.md`。
- 小程序无登录态 smoke 已验证公开列表仍可访问，未登录写操作返回 401。
- 后端补充使用模拟 visitor token 复测，列表和详情均可返回 `liked_by_me=true`、`favorited_by_me=true`。
- 剩余待小程序在模拟器或真机内用真实 visitor session token 复测完整点击链路。

## 阶段 5：评论与评论图片上传

### 目标

用户可对图片发表评论，并可上传少量图片附件；admin 可审核和隐藏评论。

### 范围

- 评论列表接口。
- 评论提交接口。
- 评论图片 COS 直传 init/complete。
- 每条评论限制图片数量，建议第一版最多 3 张。
- 限制图片格式：`jpg/jpeg/png/webp`。
- 限制单图大小：建议 5MB。
- admin 评论审核列表。
- admin 可通过、隐藏、删除评论。

### 测试

```text
POST /uploads/cos/direct-init        scene=picture_comment
POST /uploads/cos/direct-complete    scene=picture_comment
POST /visitor/picture-library/assets/:id/comments
GET  /visitor/picture-library/assets/:id/comments
GET  /admin/picture-library/comments
POST /admin/picture-library/comments/:id/hide
```

### 验收标准

- 评论可只发文字。
- 评论可携带 1-3 张图片。
- 超过数量限制返回明确错误。
- 非图片文件无法完成上传。
- 隐藏评论后 visitor 侧不可见。
- 评论图片 URL 可访问且不会由小程序拼接。
- 删除评论后业务侧不可见，COS 对象进入后续清理范围。

### 后端执行记录

执行日期：2026-06-06

已完成范围：

- `GET /visitor/picture-library/assets/:id/comments` 评论列表。
- `POST /visitor/picture-library/assets/:id/comments` 评论提交。
- 平台统一上传接口支持 visitor 使用 `scene=picture_comment`。
- visitor 上传权限限制为 `picture_comment`，不能上传 `picture_library` 等 admin 场景。
- 评论提交支持纯文字和最多 3 张评论图片。

暂未纳入本阶段：

- admin 评论审核、隐藏、删除页面。
- 评论内容敏感词和频率限制。
- 分享事件统计。

后端验收结果：

| 检查项 | 结果 |
| --- | --- |
| 评论列表公开访问 | 200 |
| 未登录提交评论 | 401 |
| visitor token 提交纯文字评论 | 返回 `status=visible` |
| 提交后评论列表可见 | 最新评论出现在列表顶部 |
| visitor 初始化 `picture_comment` 直传 | 返回 `object_key` |
| visitor 初始化 `picture_library` 直传 | 403 |

小程序对接文档：

```text
docs/picture-library/2026-06-06-picture-library-miniprogram-stage5-comments.md
```

## 阶段 6：分享好友、朋友圈与分享统计

### 目标

图片详情支持微信分享好友和朋友圈，并记录分享事件。

### 范围

- 图片详情页提供分享标题、分享图、分享路径参数。
- 小程序实现 `onShareAppMessage` 和 `onShareTimeline`。
- 后端记录分享事件。
- 可选：生成分享海报，用户保存后发朋友圈。

### 重要限制

微信小程序不能由业务按钮直接强制发朋友圈。朋友圈分享通常依赖页面 `onShareTimeline` 能力和微信右上角分享入口；如果要强化传播，可做分享海报。

### 测试

```text
POST /visitor/picture-library/assets/:id/share-events
GET  /visitor/picture-library/assets/:id
```

小程序测试：

- 分享好友卡片标题和图片正确。
- 朋友圈入口可用。
- 从分享入口进入图片详情可正常加载。
- 分享事件计数增加。

### 验收标准

- 分享好友可打开对应图片详情。
- 朋友圈分享展示标题和分享图。
- 分享事件写入成功。
- 分享入口不依赖用户已选择装修公司。

### 后端执行记录

执行日期：2026-06-06

已完成范围：

- 图片详情接口返回 `share.title`、`share.image`、`share.path`。
- `POST /visitor/picture-library/assets/:id/share-events` 分享事件写入。
- 支持 `wechat_session`、`wechat_timeline`、`poster` 三种分享渠道。
- 写入分享事件后更新图片 `share_count`，并清理公开详情缓存。

后端验收结果：

| 检查项 | 结果 |
| --- | --- |
| 详情接口返回分享标题 | `share.title` 有值 |
| 详情接口返回分享图 | `share.image.url` 有值 |
| 详情接口返回分享路径 | `share.path` 有值 |
| 未登录写分享事件 | 401 |
| visitor token 写分享事件 | 返回事件 ID 和 `share_count` |
| 非法分享渠道 | 400 |
| 写入事件后重新查详情 | `share_count` 已增加 |

小程序对接文档：

```text
docs/picture-library/2026-06-06-picture-library-miniprogram-stage6-share.md
```

## 阶段 7：运营治理与质量优化

### 目标

提升图片库长期运营质量，避免内容混乱和接口变慢。

### 范围

- 热门排序：按浏览、点赞、收藏、分享综合排序。
- 精选配置：首页优先展示精选分类和精选图。
- 评论风控：敏感词、频率限制、人工审核。
- 图片治理：缺失变体检测、COS 对账、无引用对象清理。
- 数据看板：分类数、图片数、互动数、评论待审核数。

### 测试

```text
bun run api:check
pnpm --dir apps/admin check
picture-library-health-check script
```

### 验收标准

- 首页接口在 363 张规模下稳定快速。
- 待审核评论能被运营发现和处理。
- 图片变体缺失能被脚本发现。
- 已删除图片不会被 visitor 接口返回。
- admin 有基本运营数据入口。

## 权限与安全

- admin 管理接口仅平台超管可访问。
- visitor 浏览接口可允许 visitor session 访问。
- 点赞、收藏、评论、分享事件必须绑定 visitor。
- 评论图片上传必须走后端签名流程。
- 后端必须校验 MIME、大小、扩展名和上传完成状态。
- 评论内容和图片需要审核或可隐藏。
- 不向小程序暴露 COS Secret、Bucket 内部配置或可写权限。

## 性能建议

- 分类接口缓存短 TTL。
- 图片列表分页，默认 `pageSize=20`。
- 列表只返回必要字段和缩略图。
- 详情页再返回大图、评论摘要和互动状态。
- 计数可以第一版同步更新，后续热点高时改为异步聚合。
- 图片 URL 建议使用 CDN 或后端签名 URL resolver。

## 小程序对接文档要求

每个需要 orange 对接的阶段，都在本仓库 `docs/` 下写对接文档，不直接修改小程序仓库代码。

建议文档：

```text
docs/picture-library/2026-06-06-picture-library-miniprogram-stage3-integration.md
docs/picture-library/2026-06-06-picture-library-miniprogram-stage4-interactions.md
docs/picture-library/2026-06-06-picture-library-miniprogram-stage5-comments.md
docs/picture-library/2026-06-06-picture-library-miniprogram-stage6-share.md
```

## 推荐执行顺序

1. 阶段 1：数据模型与首批素材导入。
2. 阶段 2：admin 分类与图片管理。
3. 阶段 3：visitor 分类展示与图片浏览。
4. 阶段 4：点赞与收藏。
5. 阶段 5：评论与评论图片上传。
6. 阶段 6：分享好友、朋友圈与分享统计。
7. 阶段 7：运营治理与质量优化。

## 第一轮最小可上线范围

建议首个上线版本只包含：

- 分类表、图片表、变体表、分类关系表。
- 服务器目录导入 COS。
- admin 分类和图片基础管理。
- visitor 分类和图片分页浏览。

点赞、收藏、评论、分享放到后续阶段。这样能先验证图片资料库对 visitor 首页的真实价值，再继续增加互动复杂度。
