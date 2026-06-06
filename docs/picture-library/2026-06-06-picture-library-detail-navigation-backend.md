# 图片资料库详情导航后端对接记录

日期：2026-06-06

## 接口

```http
GET /visitor/picture-library/assets/:id/navigation
```

接口公开可读。未登录 visitor 可以访问；如果请求带 visitor session token，返回的 `current`、`prev`、`next` 会补充当前 visitor 的 `liked_by_me`、`favorited_by_me`。

## 请求参数

| 参数 | 类型 | 必填 | 当前实现 |
| --- | --- | --- | --- |
| `category_id` | uuid | 否 | 限定分类上下文 |
| `direction` | `prev` / `next` / `both` | 否 | 默认 `both` |
| `limit` | number | 否 | 默认 `1`，当前仅支持 `1` |

示例：

```http
GET /visitor/picture-library/assets/dc12fd43-e16f-489d-8ab5-4fb157167dfe/navigation?category_id=a6af08a3-ff5f-43a6-a881-ce412373944d&direction=both&limit=1
```

## 排序规则

实际排序规则：

```text
sort_order asc, created_at desc, id desc
```

说明：

- visitor 图片列表接口和 navigation 接口使用同一套稳定排序。
- `id desc` 是唯一字段兜底，避免同 `sort_order`、同 `created_at` 时顺序不稳定。
- navigation 只返回 `status=published` 且 `deleted_at is null` 的 visitor 可见图片。

## 分类上下文规则

传入 `category_id` 时：

- 只在该分类下计算上一张和下一张。
- 当前图片必须属于该分类。
- 当前图片不属于传入分类时返回 HTTP 400。

未传 `category_id` 时：

1. 使用当前图片排序后的第一个分类作为上下文。
2. 如果当前图片没有分类，则在全部 visitor 可见图片中导航。
3. 返回的 `context.category_id` 是后端实际使用的分类上下文；无分类上下文时为 `null`。

当前没有显式主分类字段，排序后的第一个分类等价于主分类。

## 返回结构

```json
{
  "current": {},
  "prev": {},
  "next": {},
  "context": {
    "category_id": "a6af08a3-ff5f-43a6-a881-ce412373944d",
    "direction": "both",
    "limit": 1,
    "sort": "sort_order asc, created_at desc, id desc",
    "has_prev": true,
    "has_next": true,
    "prev_cursor": "42320848-3722-4c1e-9a3d-b5d4d8ab8831",
    "next_cursor": "d2737d8c-dfad-40d2-92fc-66eb8ffd30f0"
  }
}
```

`current`、`prev`、`next` 复用图片详情结构，包含：

- `id`
- `title`
- `description`
- `image`
- `images`
- `categories`
- `share`
- `like_count`
- `favorite_count`
- `comment_count`
- `share_count`
- `liked_by_me`
- `favorited_by_me`

没有上一张或下一张时，对应字段返回 `null`。

## 真实接口样例

### 中间图片

请求：

```http
GET /visitor/picture-library/assets/dc12fd43-e16f-489d-8ab5-4fb157167dfe/navigation?category_id=a6af08a3-ff5f-43a6-a881-ce412373944d&direction=both&limit=1
```

抽样返回：

```json
{
  "current": {
    "id": "dc12fd43-e16f-489d-8ab5-4fb157167dfe",
    "title": "法式 14",
    "share_title": "法式装修效果图"
  },
  "prev": {
    "id": "42320848-3722-4c1e-9a3d-b5d4d8ab8831",
    "title": "极简风 15",
    "share_title": "极简风装修效果图"
  },
  "next": {
    "id": "d2737d8c-dfad-40d2-92fc-66eb8ffd30f0",
    "title": "ins风 18",
    "share_title": "ins风装修效果图"
  },
  "context": {
    "category_id": "a6af08a3-ff5f-43a6-a881-ce412373944d",
    "direction": "both",
    "limit": 1,
    "sort": "sort_order asc, created_at desc, id desc",
    "has_prev": true,
    "has_next": true
  }
}
```

### 第一张边界

请求：

```http
GET /visitor/picture-library/assets/42320848-3722-4c1e-9a3d-b5d4d8ab8831/navigation?category_id=a6af08a3-ff5f-43a6-a881-ce412373944d&direction=both&limit=1
```

抽样返回：

```json
{
  "current": {
    "id": "42320848-3722-4c1e-9a3d-b5d4d8ab8831",
    "title": "极简风 15",
    "share_title": "极简风装修效果图"
  },
  "prev": null,
  "next": {
    "id": "dc12fd43-e16f-489d-8ab5-4fb157167dfe",
    "title": "法式 14",
    "share_title": "法式装修效果图"
  },
  "context": {
    "category_id": "a6af08a3-ff5f-43a6-a881-ce412373944d",
    "has_prev": false,
    "has_next": true
  }
}
```

### 分享进入不传分类

请求：

```http
GET /visitor/picture-library/assets/dc12fd43-e16f-489d-8ab5-4fb157167dfe/navigation
```

抽样返回：

```json
{
  "current": {
    "id": "dc12fd43-e16f-489d-8ab5-4fb157167dfe",
    "title": "法式 14",
    "share_title": "法式装修效果图"
  },
  "prev": null,
  "next": {
    "id": "38cfdb53-84d2-4faf-aede-259db53122fc",
    "title": "法式 4",
    "share_title": "法式装修效果图"
  },
  "context": {
    "category_id": "edb56266-a40f-4c63-8bbf-c1c628d460d0",
    "direction": "both",
    "limit": 1,
    "sort": "sort_order asc, created_at desc, id desc",
    "has_prev": false,
    "has_next": true
  }
}
```

## 错误样例

当前图片不属于传入分类：

```http
GET /visitor/picture-library/assets/dc12fd43-e16f-489d-8ab5-4fb157167dfe/navigation?category_id=b2c3afa2-1284-47c7-b79e-9325764dd1ff
```

返回：

```json
{
  "success": false,
  "message": "当前图片不属于传入分类",
  "code": "VALIDATION_ERROR"
}
```

HTTP 状态码：`400`。

## 验收结果

| 检查项 | 结果 |
| --- | --- |
| 中间图片 | `prev`、`next` 均有值 |
| 第一张边界 | `prev=null`，`has_prev=false` |
| 分享进入不传分类 | 后端按第一分类自动确定 `context.category_id` |
| 当前图片不属于分类 | HTTP 400 |
| 公开访问 | 未登录可访问，用户态字段为 `false` |
| visitor session | 支持，返回当前 visitor 点赞/收藏态 |
| API 检查 | `bun run api:check` 通过 |

