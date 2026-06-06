# 图片资料库阶段 4 小程序对接文档

日期：2026-06-06

## 背景

阶段 4 已为 visitor 图片资料库增加点赞和收藏能力。小程序可在图片列表、图片详情中展示当前 visitor 的点赞/收藏状态，并允许用户切换状态。

本阶段不包含评论、评论图片和分享统计。

## 鉴权

写操作必须携带 visitor session token：

```http
Authorization: Bearer <visitor_session_token>
```

未携带 token 或 token 不是 visitor session 时，接口返回 401。

浏览接口仍支持不带 token 访问；但如果小程序希望拿到 `liked_by_me`、`favorited_by_me`，需要在浏览接口请求时也带上 visitor session token。

## 浏览接口新增字段

以下接口会在每张图片上新增两个字段：

```http
GET /visitor/picture-library/assets?page=1&pageSize=20
GET /visitor/picture-library/assets/:id
```

新增字段：

```json
{
  "liked_by_me": false,
  "favorited_by_me": false
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `liked_by_me` | boolean | 当前 visitor 是否已点赞 |
| `favorited_by_me` | boolean | 当前 visitor 是否已收藏 |
| `like_count` | number | 点赞总数 |
| `favorite_count` | number | 收藏总数 |

不带 visitor token 时：

- `liked_by_me=false`
- `favorited_by_me=false`

## 点赞接口

### 点赞

```http
POST /visitor/picture-library/assets/:id/like
Authorization: Bearer <visitor_session_token>
```

返回：

```json
{
  "data": {
    "asset_id": "uuid",
    "liked": true,
    "like_count": 1
  }
}
```

### 取消点赞

```http
DELETE /visitor/picture-library/assets/:id/like
Authorization: Bearer <visitor_session_token>
```

返回：

```json
{
  "data": {
    "asset_id": "uuid",
    "liked": false,
    "like_count": 0
  }
}
```

规则：

- 重复点赞不会重复增加计数。
- 重复取消点赞不会让计数小于 0。
- 图片未发布、隐藏或删除时返回 404。

## 收藏接口

### 收藏

```http
POST /visitor/picture-library/assets/:id/favorite
Authorization: Bearer <visitor_session_token>
```

返回：

```json
{
  "data": {
    "asset_id": "uuid",
    "favorited": true,
    "favorite_count": 1
  }
}
```

### 取消收藏

```http
DELETE /visitor/picture-library/assets/:id/favorite
Authorization: Bearer <visitor_session_token>
```

返回：

```json
{
  "data": {
    "asset_id": "uuid",
    "favorited": false,
    "favorite_count": 0
  }
}
```

规则：

- 重复收藏不会重复增加计数。
- 重复取消收藏不会让计数小于 0。
- 图片未发布、隐藏或删除时返回 404。

## 小程序交互建议

- 列表和详情请求都带 visitor token，这样能直接拿到当前用户状态。
- 点击点赞/收藏按钮时先禁用按钮，接口返回后再更新本地状态和计数。
- 如果接口失败，恢复按钮状态并提示用户稍后重试。
- 不建议完全依赖前端本地自增计数；应以接口返回的 `like_count`、`favorite_count` 为准。
- 页面从后台恢复或下拉刷新时，重新拉列表/详情同步状态。

## 验收标准

- 未登录 visitor 调点赞/收藏写接口返回 401。
- 同一 visitor 重复点赞，`like_count` 不重复增加。
- 同一 visitor 重复收藏，`favorite_count` 不重复增加。
- 重复取消点赞/收藏，计数不会小于 0。
- 列表接口带 visitor token 后返回 `liked_by_me`、`favorited_by_me`。
- 详情接口带 visitor token 后返回 `liked_by_me`、`favorited_by_me`。

## 后端验收记录

执行日期：2026-06-06

已完成接口：

- `POST /visitor/picture-library/assets/:id/like`
- `DELETE /visitor/picture-library/assets/:id/like`
- `POST /visitor/picture-library/assets/:id/favorite`
- `DELETE /visitor/picture-library/assets/:id/favorite`

验证结果：

| 检查项 | 结果 |
| --- | --- |
| 未登录点赞 | 401 |
| 重复点赞 | `like_count` 保持 1 |
| 取消点赞 | `like_count` 回到 0 |
| 重复取消点赞 | `like_count` 保持 0 |
| 重复收藏 | `favorite_count` 保持 1 |
| 取消收藏 | `favorite_count` 回到 0 |
| 重复取消收藏 | `favorite_count` 保持 0 |
