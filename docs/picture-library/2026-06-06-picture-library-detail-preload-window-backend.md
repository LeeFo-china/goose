# 图片详情预加载窗口后端对接记录

日期：2026-06-06

对接来源：

```text
/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-detail-preload-window-backend.md
```

## 处理结论

采用方案 A：扩展现有 navigation 接口。

接口路径不变：

```http
GET /visitor/picture-library/assets/:id/navigation
```

`limit` 从原来的固定 `1` 扩展为 `1 - 5`。当小程序请求：

```http
GET /visitor/picture-library/assets/:id/navigation?category_id=:category_id&direction=both&limit=5
```

后端会返回当前图片前 5 张和后 5 张窗口。

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `category_id` | uuid | 否 | 分类上下文 |
| `direction` | `prev` / `next` / `both` | 否 | 默认 `both` |
| `limit` | number | 否 | 默认 `1`，当前支持 `1 - 5` |
| `debug_timing` | boolean | 否 | 返回后端耗时拆解 |

## 返回结构

兼容原字段：

```json
{
  "current": {},
  "prev": {},
  "next": {},
  "prev_list": [],
  "next_list": [],
  "context": {
    "category_id": "a6af08a3-ff5f-43a6-a881-ce412373944d",
    "direction": "both",
    "limit": 5,
    "sort": "category_sort_order asc, category_relation_created_at asc, asset_id asc",
    "has_prev": true,
    "has_next": true,
    "prev_cursor": "42320848-3722-4c1e-9a3d-b5d4d8ab8831",
    "next_cursor": "f0f55e2e-bef7-4c86-9ff5-048690a511a1"
  }
}
```

新增字段：

| 字段 | 说明 |
| --- | --- |
| `prev_list` | 当前图片前面的最多 `limit` 张，按离当前由近到远排列 |
| `next_list` | 当前图片后面的最多 `limit` 张，按离当前由近到远排列 |

兼容约定：

```text
prev = prev_list[0] 或 null
next = next_list[0] 或 null
```

边界约定：

- 第一张：`prev=null`，`prev_list=[]`。
- 最后一张：`next=null`，`next_list=[]`。
- 不足 `limit` 张时按实际数量返回，不补空占位。

## 排序规则

继续沿用详情导航顺序修复后的排序规则。

传入 `category_id` 时：

```text
picture_asset_categories.sort_order ASC
picture_asset_categories.created_at ASC
picture_assets.id ASC
```

未传 `category_id` 时：

```text
picture_assets.sort_order ASC
picture_assets.created_at DESC
picture_assets.id DESC
```

`prev_list` 和 `next_list` 的方向：

```text
prev_list[0] = 当前图片上一张
prev_list[1] = 当前图片上两张
next_list[0] = 当前图片下一张
next_list[1] = 当前图片下两张
```

## 后端变更

新增迁移：

```text
/Users/leefo/Public/work/gooes/supabase/migrations/20260606230000_add_picture_library_navigation_window.sql
```

迁移内容：

- 替换 `public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer)`。
- 使用 `generate_series(1, limit)` 一次性计算前后窗口。
- SQL 层限制 `limit` 最大为 `5`。
- 返回行顺序保证 `prev` / `next` 都按离当前由近到远排列。

API 侧：

- `VisitorPictureAssetNavigationQuerySchema.limit` 放开到 `1 - 5`。
- navigation 响应新增 `prev_list` / `next_list`。
- visitor 登录态会批量合并窗口内图片的 liked/favorited 状态。
- 启动预热改为预热 `limit=5` 的 navigation 窗口。

## 缓存策略

缓存版本已升级：

```text
picture-library:v3
```

navigation 缓存 key 包含：

```text
picture-library:v3
asset-navigation
asset_id
category_id 或 auto
direction
limit
```

说明：

- `direction=prev/next` 仍复用 `direction=both` 的基础缓存后裁剪。
- `limit` 已进入缓存 key，`limit=1` 和 `limit=5` 不会互相污染。
- 图片发布、隐藏、收藏、点赞、评论、分享等现有写入动作会调用 `clearPublicCache()`。
- 管理端调整分类关系、排序、图片规格地址时，需要继续确保图片资料库公开缓存失效。

## 开发库复测

复测环境：

```text
API base: http://localhost:3000
category_id: a6af08a3-ff5f-43a6-a881-ce412373944d
```

样本当前图片：

```text
e259d6a3-275b-486f-9021-bb83f217cb42 / 极简风 12
```

请求：

```http
GET /visitor/picture-library/assets/e259d6a3-275b-486f-9021-bb83f217cb42/navigation?category_id=a6af08a3-ff5f-43a6-a881-ce412373944d&direction=both&limit=5&debug_timing=true
```

列表顺序前 12 张：

```text
42320848-3722-4c1e-9a3d-b5d4d8ab8831
d2737d8c-dfad-40d2-92fc-66eb8ffd30f0
53037eb6-cd88-4f61-bf96-255e96786336
8d7b0791-2af4-46c8-8f73-e3ba9c51f93b
1dfc01a8-3671-4498-b45c-879bfa888445
e259d6a3-275b-486f-9021-bb83f217cb42
9f93b04d-7709-49b5-ac8e-510b406752c1
aca5b0e6-00f9-4eb0-bfb6-85f6919809f8
318592e3-170c-4b00-bb96-a1a44bf73063
5f6d79a5-9ce9-4ca9-b599-963895ec50c6
f0f55e2e-bef7-4c86-9ff5-048690a511a1
0c3d59b8-b0ea-44ac-b550-69c635d41896
```

窗口结果：

| 字段 | 返回 | 验收 |
| --- | --- | --- |
| `prev` | `1dfc01a8-3671-4498-b45c-879bfa888445` | 通过 |
| `next` | `9f93b04d-7709-49b5-ac8e-510b406752c1` | 通过 |
| `prev_list` | `1dfc`、`8d7b`、`5303`、`d273`、`4232` | 通过 |
| `next_list` | `9f93`、`aca5`、`3185`、`5f6d`、`f0f5` | 通过 |
| `prev=prev_list[0]` | true | 通过 |
| `next=next_list[0]` | true | 通过 |
| `context.limit` | `5` | 通过 |
| `context.sort` | `category_sort_order asc, category_relation_created_at asc, asset_id asc` | 通过 |

边界复测：

| 场景 | 结果 |
| --- | --- |
| 第一张 `limit=5` | `prev=null`，`prev_list=[]`，`next_list` 返回后 5 张 |
| 中间图 `limit=1` | `prev_list` / `next_list` 各 1 张，兼容原 `prev/next` |

性能样例：

```json
{
  "cache": "miss",
  "total_ms": 961,
  "query_ms": 960,
  "visitor_state_ms": 0,
  "serialize_ms": 1,
  "row_count": 11
}
```

热态命中公开缓存后为毫秒级。

## 验证命令

```bash
supabase db query --linked < supabase/migrations/20260606230000_add_picture_library_navigation_window.sql
bun run api:typecheck
bun run api:check-file-size
bun run api:build
```

验证结果：

- 迁移已应用到 linked 开发库。
- typecheck 通过。
- API 文件大小检查通过。
- API build 通过。
