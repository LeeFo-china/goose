# 图片资料库详情页性能后端对接记录

日期：2026-06-06

对接来源：

```text
/Users/leefo/Public/work/orange/docs/2026-06-06-picture-library-detail-performance-backend.md
```

## 处理结论

本轮治理的首要瓶颈是详情页首屏接口：

```http
GET /visitor/picture-library/assets/:id/navigation?category_id=:category_id&direction=both&limit=1
```

小程序复测前冷态约 `5.7s - 8.9s`。后端已改为数据库侧一次性聚合 `current/prev/next + variants + categories`，并让 `direction=prev/next` 复用 `direction=both` 的公开基础缓存。

评论接口已补 direct SQL 查询和评论图片批量 join，空评论不再查询评论图片。

## 后端变更

### 1. navigation 查询聚合

新增迁移：

```text
supabase/migrations/20260606223000_add_picture_library_detail_performance.sql
```

新增函数：

```sql
public.get_visitor_picture_asset_navigation(
  p_asset_id uuid,
  p_category_id uuid,
  p_direction text,
  p_limit integer
)
```

函数返回：

- `current`
- `prev`
- `next`
- detail/large/cover/thumb/original 图片规格
- active categories
- navigation context

API 侧新增仓储：

```text
apps/api/src/repositories/visitor-picture-navigation.ts
```

执行策略：

- 优先 direct Postgres。
- direct 失败时回退 Supabase RPC。
- 公开基础缓存 key 固定使用 `direction=both`。
- `direction=prev/next` 在缓存结果上裁剪，避免产生新的冷 key。
- visitor 登录态先读取公开基础缓存，再批量合并 liked/favorited 状态。

### 2. comments 查询优化

新增索引：

```sql
CREATE INDEX IF NOT EXISTS idx_picture_asset_comments_visible_asset_created_id
ON public.picture_asset_comments(asset_id, created_at DESC, id DESC)
WHERE status = 'visible' AND deleted_at IS NULL;
```

评论列表优先走 direct SQL：

- 使用 `count(*) over()` 同步返回分页总数。
- 空评论直接跳过评论图片查询。
- 有评论时 direct join `picture_asset_comment_images + platform_file_objects`。

### 3. debug_timing

已支持：

```http
GET /visitor/picture-library/assets/:id/navigation?...&debug_timing=true
GET /visitor/picture-library/assets/:id/comments?page=1&pageSize=20&debug_timing=true
```

navigation 返回位置：

```json
{
  "data": {
    "debug_timing": {
      "cache": "miss",
      "total_ms": 156,
      "query_ms": 156,
      "visitor_state_ms": 0,
      "serialize_ms": 0,
      "row_count": 3
    }
  }
}
```

comments 返回位置：

```json
{
  "data": {
    "debug_timing": {
      "total_ms": 305,
      "query_ms": 155,
      "images_ms": 150,
      "serialize_ms": 0,
      "row_count": 1
    }
  }
}
```

## 开发库复测

复测环境：

```text
API base: http://localhost:3000
category_id: a6af08a3-ff5f-43a6-a881-ce412373944d
```

样本：

```text
42320848-3722-4c1e-9a3d-b5d4d8ab8831
d2737d8c-dfad-40d2-92fc-66eb8ffd30f0
dc12fd43-e16f-489d-8ab5-4fb157167dfe
```

### navigation 冷态

| asset_id | cache | total_ms | query_ms | row_count |
| --- | --- | ---: | ---: | ---: |
| `42320848-3722-4c1e-9a3d-b5d4d8ab8831` | miss | 328 | 327 | 2 |
| `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | miss | 156 | 156 | 3 |
| `dc12fd43-e16f-489d-8ab5-4fb157167dfe` | miss | 163 | 162 | 3 |

结果：低于 `< 800ms` 目标。

### navigation 热态和方向复用

| direction | 结果 |
| --- | --- |
| `both` | 三个样本均为 cache hit，约 `1.8ms - 3.4ms` |
| `prev` | 复用 both 基础缓存，约 `1.8ms - 2.5ms` |
| `next` | 复用 both 基础缓存，约 `1.8ms - 2.2ms` |

结果：不再因为 `direction=prev/next` 产生新的 6-8 秒冷 key。

### comments

| asset_id | 评论数 | total_ms | query_ms | images_ms |
| --- | ---: | ---: | ---: | ---: |
| `d2737d8c-dfad-40d2-92fc-66eb8ffd30f0` | 0 | 150 | 150 | 0 |
| `42320848-3722-4c1e-9a3d-b5d4d8ab8831` | 1 | 305 | 155 | 150 |
| `dc12fd43-e16f-489d-8ab5-4fb157167dfe` | 12 | 304 | 154 | 150 |

说明：有一次 `42320848` 出现 direct query 冷长尾约 `1.1s`，后续复测稳定在约 `305ms`。这类长尾主要来自 direct 数据库连接/存储元数据冷启动，不再是原先 Supabase JS 多段查询的 2-4 秒级慢路径。

## 图片资源长尾

本轮没有改 COS/CDN 配置。小程序文档中 detail 图多数下载在 `88ms - 280ms`，仅一次出现 `3351ms` 冷长尾。

建议运维后续单独确认：

- 公开图片是否走 CDN 加速域名。
- 签名 URL 是否影响边缘缓存命中。
- 热门 detail 图是否需要 CDN 预热。

## 验证命令

```bash
bun run api:typecheck
bun run api:check-file-size
bun run api:build
supabase db query --linked < supabase/migrations/20260606223000_add_picture_library_detail_performance.sql
```

验证结果：

- typecheck 通过。
- API 文件大小检查通过。
- API build 通过。
- 迁移已应用到 linked 开发库。
