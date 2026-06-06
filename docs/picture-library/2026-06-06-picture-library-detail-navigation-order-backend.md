# 图片详情滑动顺序与列表顺序一致性后端对接记录

日期：2026-06-06

对接来源：

```text
/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-detail-navigation-order-backend.md
```

## 处理结论

已修复 visitor 图片资料库列表接口与详情 navigation 接口排序不一致的问题。

本次修复后，同一个 `category_id` 下：

```http
GET /visitor/picture-library/assets?category_id=:category_id&page=1&pageSize=20
GET /visitor/picture-library/assets/:id/navigation?category_id=:category_id&direction=both&limit=1
```

使用同一套排序结果。小程序保持：

```text
左划 -> next
右划 -> prev
```

即可得到符合列表心智的滑动顺序。

## 错序原因

本次问题由两点叠加导致：

1. `list_visitor_picture_assets` 虽然在 `paged_assets` CTE 内做了排序，但最终输出经过外层 `UNION ALL` 和关联聚合后没有显式 `ORDER BY`，Postgres 不保证最终返回顺序。
2. 上一轮 navigation 性能优化新增的 `get_visitor_picture_asset_navigation` 使用资产自身排序计算 `row_number()`，没有在传入 `category_id` 时使用分类关联表排序。

因此列表页和详情页 navigation 虽然都声明了稳定排序，但实际使用的顺序来源不一致。

## 最终排序规则

### 传入 category_id

按分类关联表排序：

```text
picture_asset_categories.sort_order ASC
picture_asset_categories.created_at ASC
picture_assets.id ASC
```

说明：

- 这是分类页展示和详情滑动的统一顺序。
- 同一图片属于多个分类时，只使用当前传入 `category_id` 对应的关联行参与排序。
- `picture_assets.id ASC` 是稳定兜底，避免同一分类排序值和关联创建时间相同时顺序漂移。

navigation 返回：

```json
{
  "context": {
    "sort": "category_sort_order asc, category_relation_created_at asc, asset_id asc"
  }
}
```

### 未传 category_id

按资产全局排序：

```text
picture_assets.sort_order ASC
picture_assets.created_at DESC
picture_assets.id DESC
```

navigation 返回：

```json
{
  "context": {
    "sort": "asset_sort_order asc, asset_created_at desc, asset_id desc"
  }
}
```

## 后端变更

新增迁移：

```text
/Users/leefo/Public/work/gooes/supabase/migrations/20260606224500_align_picture_library_navigation_order.sql
```

迁移内容：

- 新增索引 `idx_picture_asset_categories_category_sort_created_asset`。
- 替换 `public.list_visitor_picture_assets(uuid, integer, integer)`。
- 替换 `public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer)`。
- list RPC 增加 `list_position`，最终输出显式 `ORDER BY list_position ASC`。
- navigation RPC 在分类上下文下使用分类关联排序计算 `row_number()`。

API 侧：

- `apps/api/src/services/visitor-picture-library.ts`
  - 公开缓存 key 增加 `picture-library:v2` 前缀。
  - navigation 不再用 service 常量覆盖 `context.sort`，直接透传数据库函数返回的真实排序说明。

## 缓存处理

已处理缓存版本：

```text
picture-library:v2
```

影响：

- 列表公开缓存重新生成。
- navigation 公开基础缓存重新生成。
- `direction=prev/next` 仍复用 `direction=both` 的基础缓存。

后续如果管理端调整图片分类排序，仍建议在发布/隐藏/编辑分类关系时清理图片资料库公开缓存。

## 开发库复测

复测环境：

```text
API base: http://localhost:3000
category_id: a6af08a3-ff5f-43a6-a881-ce412373944d
```

列表前 6 张：

| 位置 | asset_id | title |
| --- | --- | --- |
| 1 | `42320848-3722-4c1e-9a3d-b5d4d8ab8831` | `极简风 15` |
| 2 | `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | `ins风 18` |
| 3 | `53037eb6-cd88-4f61-bf96-255e96786336` | `极简风 5` |
| 4 | `8d7b0791-2af4-46c8-8f73-e3ba9c51f93b` | `ins风 15` |
| 5 | `1dfc01a8-3671-4498-b45c-879bfa888445` | `2` |
| 6 | `e259d6a3-275b-486f-9021-bb83f217cb42` | `极简风 12` |

navigation 对照：

| 位置 | current | prev | next | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `42320848-3722-4c1e-9a3d-b5d4d8ab8831` | `null` | `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | 通过 |
| 2 | `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | `42320848-3722-4c1e-9a3d-b5d4d8ab8831` | `53037eb6-cd88-4f61-bf96-255e96786336` | 通过 |
| 3 | `53037eb6-cd88-4f61-bf96-255e96786336` | `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | `8d7b0791-2af4-46c8-8f73-e3ba9c51f93b` | 通过 |
| 4 | `8d7b0791-2af4-46c8-8f73-e3ba9c51f93b` | `53037eb6-cd88-4f61-bf96-255e96786336` | `1dfc01a8-3671-4498-b45c-879bfa888445` | 通过 |
| 5 | `1dfc01a8-3671-4498-b45c-879bfa888445` | `8d7b0791-2af4-46c8-8f73-e3ba9c51f93b` | `e259d6a3-275b-486f-9021-bb83f217cb42` | 通过 |
| 6 | `e259d6a3-275b-486f-9021-bb83f217cb42` | `1dfc01a8-3671-4498-b45c-879bfa888445` | `9f93b04d-7709-49b5-ac8e-510b406752c1` | 通过 |

说明：

- 第 6 张的 `next` 是分类全量顺序里的第 7 张，不应按 `pageSize=6` 截断为 `null`。
- `context.sort` 均返回 `category_sort_order asc, category_relation_created_at asc, asset_id asc`。

## 性能复核

`EXPLAIN ANALYZE` 抽样：

```text
Function Scan on get_visitor_picture_asset_navigation
actual time=111.992..111.994 rows=3
Execution Time: 116.624 ms
```

API 侧首次未命中缓存时仍可能出现直连数据库冷启动长尾；命中公开基础缓存后为毫秒级。

## 验证命令

```bash
supabase db query --linked < supabase/migrations/20260606224500_align_picture_library_navigation_order.sql
bun run api:typecheck
bun run api:check-file-size
bun run api:build
```

验证结果：

- 迁移已应用到 linked 开发库。
- typecheck 通过。
- API 文件大小检查通过。
- API build 通过。
