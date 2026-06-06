# 图片资料库列表性能后端治理记录

日期：2026-06-06

## 对接结论

小程序复测指出 `GET /visitor/picture-library/assets` 冷态存在 `3s - 7s` 长尾。后端本轮已完成第一轮治理：

- 带 visitor token 的列表请求不再完全绕过公开列表缓存。
- 公开列表基础数据独立缓存，visitor 个性化状态批量合并。
- 同一列表 key 增加 in-flight 去重。
- 列表查询改为数据库 RPC 聚合，减少 Supabase HTTP 往返。
- API 优先通过直连 Postgres 调用该 RPC；直连不可用时回退 Supabase RPC。
- API 启动监听成功后异步预热首个有图分类第一页，提前建立直连连接并填充公开列表缓存。
- 补充 visitor 列表相关索引。
- 支持 `debug_timing=true`。

本轮后冷态已明显下降。经执行计划定位，数据库内部执行约 `12.8ms`，原剩余 `1s+` 主因是 API 到 Supabase HTTP/RPC 网关链路。改为 API 直连 Postgres 后，连接已建立情况下冷 miss 降到 `108ms - 238ms`。

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

## 执行计划定位

函数级执行计划：

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT *
FROM public.list_visitor_picture_assets(
  'a6af08a3-ff5f-43a6-a881-ce412373944d'::uuid,
  1,
  20
);
```

结果摘要：

| 指标 | 结果 |
| --- | ---: |
| 数据库执行时间 | `12.764ms` |
| 实际返回行数 | `20` |
| Shared hit blocks | `1229` |

结论：数据库内部执行不是当前主瓶颈。API 侧 `debug_timing.query_ms` 中的 `1s+` 主要来自 Supabase HTTP/RPC 网关和网络链路。

## API 直连复测

使用 API 同一 `.env` 中的 `SUPABASE_DB_URL` / `SUPABASE_DB_DIRECT_URL` 直连 Postgres，直接调用同一个 RPC。

| 场景 | 耗时 |
| --- | ---: |
| 首次建连 `pageSize=12` | `867ms` |
| 同连接第二次 `pageSize=12` | `104ms` |
| 同连接 `pageSize=20` | `181ms` |
| 同连接再次 `pageSize=20` | `98ms` |

随后 API 接口层复测：

| 场景 | cache | total_ms | query_ms |
| --- | --- | ---: | ---: |
| 直连首次建连波动 `pageSize=13` | miss | 3993 | 3990 |
| 直连已建连 `pageSize=14` | miss | 109 | 108 |
| 直连已建连 `pageSize=15` | miss | 238 | 237 |
| 直连已建连 `pageSize=16` | miss | 111 | 110 |
| 直连已建连 `pageSize=17` | miss | 156 | 156 |

说明：直连连接首次建立仍可能有长尾，因此已加入 API 启动后异步预热，让首个真实用户请求尽量命中已建连和已预热的公开列表缓存。

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
| Supabase RPC 批量聚合后 `pageSize=11` 首轮 | miss | 1008 | 1001 | 11 |
| RPC 批量聚合后 `pageSize=11` 第二轮 | hit | 0 | 0 | 0 |
| API 直连已建连 `pageSize=14` 首轮 | miss | 109 | 108 | 14 |
| API 直连已建连 `pageSize=16` 首轮 | miss | 111 | 110 | 16 |
| 越界分页 `page=99&pageSize=20` | miss | 1198 | 1198 | 0 |

对比小程序文档里的冷态：

| 场景 | 治理前 | 本轮后 |
| --- | ---: | ---: |
| 分类页首屏列表冷态 | 约 `4.9s - 7.2s` | 已建连后约 `108ms - 238ms` |
| 热态 | `0.6ms - 3ms` | 约 `0ms - 3ms` |

## 剩余风险

- 当前缓存是 API 进程内缓存，多实例之间不共享。
- 服务重启后首次直连建连仍可能出现一次性长尾；已通过启动后异步预热缓解。
- 当前缓存是进程内缓存，多实例之间不共享。
- `debug_timing.query_ms` 后续如果再次升高，优先检查是否走了 Supabase RPC 回退，或直连连接是否频繁重建。
- 越界分页已验证仍保留 `pagination.total`，不会因为当前页为空而丢失总数。

## 后续建议

1. 上线后用 `debug_timing=true` 对比生产是否走直连路径，以及首轮建连是否仍有长尾。
2. 如果生产多实例部署，考虑 Redis 或共享缓存承载公开列表基础数据。
3. 观察启动预热日志，如果生产数据库连接策略限制较严，需要调整预热频率或连接池设置。
4. 小程序侧继续保留本地短缓存和骨架屏，降低冷态长尾体感。
