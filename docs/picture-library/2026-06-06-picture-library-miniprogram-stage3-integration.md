# 图片资料库阶段 3 小程序对接文档

日期：2026-06-06

## 背景

后端已完成图片资料库 visitor 公开浏览接口。小程序 visitor 首页可以按分类展示装修封面图，并进入图片详情页浏览。

本阶段只做浏览，不包含点赞、收藏、评论、分享统计。这些互动能力会在后续阶段单独对接。

## 接口约定

### 1. 分类列表

```http
GET /visitor/picture-library/categories
```

鉴权：

- 不要求登录态。
- 可以在 visitor 首页冷启动时直接请求。

返回：

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "简约",
      "slug": "style-xxxx",
      "description": null,
      "sort_order": 100,
      "asset_count": 12,
      "cover_image": {
        "url": "https://...",
        "variant": "cover",
        "width": 1200,
        "height": 900,
        "file_size": 123456,
        "mime_type": "image/webp"
      }
    }
  ]
}
```

规则：

- 只返回 `status=active` 的分类。
- `asset_count` 只统计已发布且未删除的图片。
- `cover_image` 可能为 `null`，小程序需要兜底占位图。

### 2. 图片分页列表

```http
GET /visitor/picture-library/assets?page=1&pageSize=20
GET /visitor/picture-library/assets?category_id=<category_id>&page=1&pageSize=20
```

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 默认 `1` |
| `pageSize` | 否 | 默认 `20`，最大 `100` |
| `category_id` | 否 | 分类 ID，传入后只返回该分类图片 |

返回：

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "title": "简约客厅",
        "description": null,
        "width": 1200,
        "height": 900,
        "like_count": 0,
        "favorite_count": 0,
        "comment_count": 0,
        "share_count": 0,
        "image": {
          "url": "https://...",
          "variant": "cover",
          "width": 1200,
          "height": 900,
          "file_size": 123456,
          "mime_type": "image/webp"
        },
        "categories": [
          {
            "id": "uuid",
            "name": "简约",
            "slug": "style-xxxx"
          }
        ],
        "created_at": "2026-06-06T00:00:00.000Z",
        "updated_at": "2026-06-06T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

规则：

- 只返回 `status=published` 且 `deleted_at IS NULL` 的图片。
- 不返回草稿、隐藏、删除图片。
- 列表图优先级：`thumb` -> `cover` -> `original` -> `large`。
- `image` 可能为 `null`，小程序需要兜底占位图。
- 必须按分页加载，不要一次性请求全部图片。

### 3. 图片详情

```http
GET /visitor/picture-library/assets/:id
```

返回：

```json
{
  "data": {
    "id": "uuid",
    "title": "简约客厅",
    "description": null,
    "width": 1200,
    "height": 900,
    "like_count": 0,
    "favorite_count": 0,
    "comment_count": 0,
    "share_count": 0,
    "image": {
      "url": "https://...",
      "variant": "original",
      "width": 1200,
      "height": 900,
      "file_size": 123456,
      "mime_type": "image/webp"
    },
    "images": {
      "thumb": null,
      "cover": {
        "url": "https://...",
        "variant": "cover",
        "width": 1200,
        "height": 900,
        "file_size": 123456,
        "mime_type": "image/webp"
      },
      "large": null,
      "original": {
        "url": "https://...",
        "variant": "original",
        "width": 1200,
        "height": 900,
        "file_size": 123456,
        "mime_type": "image/webp"
      }
    },
    "categories": [
      {
        "id": "uuid",
        "name": "简约",
        "slug": "style-xxxx"
      }
    ],
    "created_at": "2026-06-06T00:00:00.000Z",
    "updated_at": "2026-06-06T00:00:00.000Z"
  }
}
```

规则：

- 详情图优先级：`large` -> `cover` -> `original` -> `thumb`。
- 图片未发布、已隐藏或已删除时返回 404。
- `images` 中缺失的规格返回 `null`。

## 小程序建议

- 首页先请求分类列表，再请求第一个有图片的分类列表。
- 分类 tab 使用 `category.id` 作为请求参数。
- 列表使用分页或触底加载，不要在首页请求全部图片。
- 图片 URL 可以直接用于 `image` 组件。
- 对 `cover_image=null`、`image=null` 做占位图。
- 可对分类列表做短缓存，例如 5-10 分钟。
- 图片列表按 `category_id + page + pageSize` 缓存，切换分类时复用缓存。

## 验收标准

- 首页可展示 active 分类。
- 点击分类后可分页展示 published 图片。
- 图片详情页可展示标题、说明、分类和详情图。
- admin 将图片隐藏或删除后，小程序刷新不再展示该图片。
- 首屏不拉取全量图片。
- 图片为空或 URL 为空时页面不崩溃。

## 后端验收记录

执行日期：2026-06-06

已完成接口：

- `GET /visitor/picture-library/categories`
- `GET /visitor/picture-library/assets`
- `GET /visitor/picture-library/assets/:id`

验证命令：

```bash
bun run api:check
curl http://localhost:3000/visitor/picture-library/categories
curl "http://localhost:3000/visitor/picture-library/assets?page=1&pageSize=20"
curl "http://localhost:3000/visitor/picture-library/assets/:id"
```
