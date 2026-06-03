# 员工验收详情性能后端对接记录

日期：2026-06-03

对接小程序文档：
`/Users/leefo/Public/work/orange/docs/2026-06-03-employee-acceptance-detail-performance-backend-checklist.md`

## 范围

- `GET /project-acceptances/:id`
- `GET /project-acceptances?project_id=:id&page=1&pageSize=20`
- `debug_timing=true` 后端分段耗时输出

测试项目：

- `project_id=54f11aa5-09a8-4410-a9c5-604a7fe9e09c`
- `acceptance_id=2e3779f7-8b51-4b05-9b7b-e1f3e18f1992`

## 后端改动

1. 员工验收详情改为 graph detail 查询，并增加 10 秒短 TTL 详情缓存。
2. 员工验收列表在 `project_id` 场景改为 direct Postgres graph 聚合查询。
3. `project_id` 权限判断改为 direct 单项目 scope 判断，避免拉全量可见项目 ID。
4. direct 列表 SQL 聚合 action operator 信息，避免二次 Supabase HTTP 查询。
5. 列表和详情均支持 `debug_timing=true`。
6. mutation/通知路径沿用现有 `invalidateAcceptanceRelatedCaches` 清理详情缓存。

## 验收结果

前置：先请求 `GET /auth/me/permissions`，模拟小程序页面已有权限请求预热 auth context。

列表 5 轮：

- 第 1 轮：0.975s，`total_ms=971`
- 第 2-5 轮：0.186s、0.207s、0.202s 等，均 < 500ms
- 返回：2 条验收单；目标验收单 4 个验收项、1 条操作记录

详情 debug 5 轮：

- 0.088s - 0.096s
- `cache_hit=1`
- 返回：4 个验收项、1 条操作记录

详情非 debug 5 轮：

- 0.089s - 0.096s
- 返回：4 个验收项、1 条操作记录

## 验收命令

```bash
bun run --cwd apps/api check
```

结果：

- typecheck 通过
- build 通过
- file-size 通过，`exemptions=0`

## 说明

进程首次冷启动时，`auth_context_ms` 可能超过 2s；小程序页面并行/前置请求
`/auth/me/permissions` 后，验收列表与详情接口均进入目标耗时范围。

## 小程序回写对接补充

小程序仓库回写文档：
`/Users/leefo/Public/work/orange/docs/2026-06-03-employee-acceptance-detail-performance-backend-checklist.md`

前端复测结论：

- 热态处理验收详情：达标。
- 验收列表：达标。
- `debug_timing`：达标。
- 剩余风险：详情 cache miss 测到 `1.216s`，其中
  `acceptance_detail_graph_query_ms=1095ms`，建议继续压到 `< 1s`。

后端补充处理：

1. 员工详情 cache miss 改为优先 direct Postgres graph 查询。
2. direct detail graph 同步聚合 action operator，避免 cache miss 后二次 HTTP 查询。
3. direct 查询不可用时保留原 Supabase graph 查询回退。

补充验收：

- 进程首次详情 debug：端到端 `3.331s`，其中
  `auth_context_ms=2340ms`，`acceptance_detail_graph_query_ms=799ms`。
- 权限预热且详情缓存过期后：端到端 `0.187s`，
  `acceptance_detail_graph_query_ms=94ms`，`permission_ms=91ms`。
- 响应结构保持：4 个验收项、1 条操作记录。

结论：小程序回写的详情 cache miss 风险已处理；在 auth 预热后，
详情 cache miss 已进入 `< 1s` 目标范围。
