# 图片资料库列表性能后端治理记录

日期：2026-06-06

## 对接结论

小程序复测指出 `GET /visitor/picture-library/assets` 冷态存在 `3s - 7s` 长尾。后端本轮已完成第一轮治理：

- 带 visitor token 的列表请求不再完全绕过公开列表缓存。
- 公开列表基础数据独立缓存，visitor 个性化状态批量合并。
- 同一列表 key 增加 in-flight 去重。
- 列表查询改为数据库 RPC 聚合，减少 Supabase HTTP 往返。
- 补充 visitor 列表相关索引。
- 支持 `debug_timing=true`。

本轮后冷态已明显下降，但开发环境复测仍有约 `1.0s - 1.7s` 长尾，未完全达到 `<800ms` 目标。热态命中进程缓存后为毫秒级。

## 接口

```http
GET /visitor/picture-library/assets
```

请求参数保持兼容：

| 参数 | 说明 |
| --- | --- |
| `category_id` | 可选，限定分类 |
| `page` | 页码 |
| `pageSize` | 每页数量 |
| `debug_timing` | 可选，`true` 时返回后端调试耗时 |

## 缓存策略

公开列表基础缓存 key：

```text
assets:{category_id|all}:{page}:{pageSize}
```

缓存内容：

- `id`
- `title`
- `description`
- `image`
- `categories`
- `like_count`
- `favorite_count`
- `comment_count`
- `share_count`
- `pagination`

带 visitor session token 时：

```text
公开列表缓存 -> 批量查询 liked/favorited -> 合并返回
```

因此登录态请求也能复用基础列表缓存，只额外执行当前页 asset ids 的点赞/收藏状态查询。

## 查询治理

新增 RPC：

```sql
public.list_visitor_picture_assets(p_category_id uuid, p_page integer, p_page_size integer)
```

RPC 一次返回：

- 当前页图片元数据
- 当前页图片的列表展示变体
- 当前页图片分类
- 总数 `total_count`

列表排序规则：

```text
sort_order asc, created_at desc, id desc
```

新增索引：

```sql
idx_picture_assets_published_sort_id
idx_picture_asset_categories_asset_sort
idx_picture_asset_categories_category_sort_asset
```

迁移文件：

```text
supabase/migrations/20260606212000_add_picture_library_visitor_list_indexes.sql
```

该迁移已在开发库通过 `supabase db query --linked` 执行。

## debug_timing 样例

冷态 miss：

```json
{
  "cache": "miss",
  "total_ms": 1193,
  "query_ms": 1191,
  "visitor_state_ms": 0,
  "serialize_ms": 2,
  "row_count": 9
}
```

热态 hit：

```json
{
  "cache": "hit",
  "total_ms": 0,
  "query_ms": 0,
  "visitor_state_ms": 0,
  "serialize_ms": 0,
  "row_count": 0
}
```

说明：`debug_timing` 当前在 `data.debug_timing` 内返回，避免改变全局响应包装结构。

## 开发环境复测

复测分类：

```text
category_id=a6af08a3-ff5f-43a6-a881-ce412373944d
```

| 场景 | cache | total_ms | query_ms | row_count |
| --- | --- | ---: | ---: | ---: |
| `pageSize=6` 首轮 | miss | 1555 | 1548 | 6 |
| `pageSize=6` 第二轮 | hit | 0 | 0 | 0 |
| `pageSize=20` 首轮 | miss | 1687 | 1681 | 20 |
| `pageSize=20` 第二轮 | hit | 0 | 0 | 0 |
| RPC 批量聚合后 `pageSize=9` 首轮 | miss | 1193 | 1191 | 9 |
| RPC 批量聚合后 `pageSize=11` 首轮 | miss | 1008 | 1001 | 11 |
| RPC 批量聚合后 `pageSize=11` 第二轮 | hit | 0 | 0 | 0 |
| 越界分页 `page=99&pageSize=20` | miss | 1198 | 1198 | 0 |

对比小程序文档里的冷态：

| 场景 | 治理前 | 本轮后 |
| --- | ---: | ---: |
| 分类页首屏列表冷态 | 约 `4.9s - 7.2s` | 约 `1.0s - 1.7s` |
| 热态 | `0.6ms - 3ms` | 约 `0ms - 3ms` |

## 剩余风险

- 当前缓存是 API 进程内缓存，多实例之间不共享。
- 服务重启、缓存过期、或打到未命中的实例时仍会出现冷态查询。
- 开发环境冷态已显著改善，但仍未稳定进入 `<800ms`。
- `debug_timing.query_ms` 仍是主耗时，后续收益最大的方向是继续压缩数据库/RPC 查询与 Supabase 网关耗时，或引入跨实例缓存。
- 越界分页已验证仍保留 `pagination.total`，不会因为当前页为空而丢失总数。

## 后续建议

1. 继续优化 `list_visitor_picture_assets` 执行计划，确认 Supabase RPC 网关耗时和数据库执行耗时占比。
2. 对热门分类第一页做后台预热，但不要牺牲分类接口 `<300ms` 目标。
3. 如果生产多实例部署，考虑 Redis 或共享缓存承载公开列表基础数据。
4. 小程序侧继续保留本地短缓存和骨架屏，降低冷态长尾体感。
