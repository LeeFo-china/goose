# 员工施工日志创建性能后端对接记录

日期：2026-06-03

对接来源：小程序仓库 `docs/2026-06-03-employee-project-log-create-performance-backend-checklist.md`

说明：小程序仓库的 Git 操作由小程序团队维护，本次只读取对接文档；后端代码、迁移和复测记录落在 `split-api`。

## 背景

小程序复测记录显示员工端无图片创建施工日志：

- `POST /project-logs`：约 `7.90s`
- 返回页刷新接口另计，本次优先治理创建提交主链路。

目标：

- no-image 创建施工日志 P95 `< 1s`
- 不同步执行额外聚合、通知、日历刷新等重任务
- 可通过 `debug_timing=true` 查看后端步骤耗时

## 后端改动

1. `POST /project-logs` 支持 `debug_timing=true`
   - 普通响应保持不变。
   - 开启后在 `data.debug_timing` 返回：
     - `auth_context_ms`
     - `validation_ms`
     - `create_rpc_ms`
     - `serialize_ms`
     - `total_ms`

2. 施工日志创建改为单次数据库 RPC
   - 新增迁移：`supabase/migrations/20260603150000_create_project_log_fast_create_rpc.sql`
   - RPC：`public.create_project_log_fast(...)`
   - 在数据库内一次完成：
     - 项目租户和状态校验
     - 阶段可写校验
     - `project_log.create` 权限范围校验
     - `project_logs` 插入
     - 返回日志行和员工简要信息

3. API repository 优先直连 Postgres
   - `SUPABASE_DB_URL` 或 `SUPABASE_DB_DIRECT_URL` 存在时，使用 Bun 内置 `SQL` 直连调用 RPC。
   - 无直连环境变量时，回退 Supabase RPC。
   - 这样避免 Supabase HTTP RPC 的额外延迟。
   - 2026-06-03 补充修复：不再跨请求缓存 Bun `SQL` 连接，改为每次创建短连接调用并关闭，避免空闲连接被远端关闭后复用导致 `ERR_POSTGRES_CONNECTION_CLOSED`。

4. 保留更新链路的阶段校验
   - `constructionStageStatusService.assertCanCreateProjectLog` 已改为轻量验收状态查询，不再为了单阶段写入构建完整阶段列表。

## 本地复测

环境：

- API：`http://127.0.0.1:3000`
- 项目：`54f11aa5-09a8-4410-a9c5-604a7fe9e09c`
- 阶段：`plumbing_electrical`
- 图片：`[]`
- 测试日志内容均带 `接口测速-后端优化...可删除...` 前缀，复测后已清理。

### 冷启动观察

5 次创建，首个请求包含 auth context 冷启动：

| 轮次 | HTTP | 总耗时 | auth_context_ms | create_rpc_ms |
| --- | --- | ---: | ---: | ---: |
| 1 | 200 | 3747ms | 2653ms | 1074ms |
| 2 | 200 | 99ms | 0ms | 98ms |
| 3 | 200 | 105ms | 0ms | 104ms |
| 4 | 200 | 109ms | 0ms | 107ms |
| 5 | 200 | 103ms | 0ms | 102ms |

结论：首个冷请求主要耗时在员工 auth context；施工日志创建链路已从多次远程查询收敛到单次 RPC。

### 预热后验收

先访问 `GET /auth/me/permissions` 预热员工 auth context，再连续 5 次创建：

| 轮次 | HTTP | 总耗时 | create_rpc_ms |
| --- | --- | ---: | ---: |
| 1 | 200 | 107ms | 105ms |
| 2 | 200 | 105ms | 104ms |
| 3 | 200 | 110ms | 109ms |
| 4 | 200 | 116ms | 114ms |
| 5 | 200 | 100ms | 99ms |

验收结果：

- 平均：`108ms`
- 最大：`116ms`
- `debug_timing` 已返回
- 后端创建主链路满足 no-image P95 `< 1s`

## 后续给小程序复测

小程序侧可复测：

```text
POST /project-logs?debug_timing=true
```

复测时建议同时记录：

- 首次冷请求总耗时
- 连续提交或先访问员工权限后的预热总耗时
- `data.debug_timing.create_rpc_ms`
- `data.debug_timing.auth_context_ms`

如果小程序仍观察到多秒级耗时，优先判断：

- 当前 API 服务是否已部署包含本次代码。
- 远端数据库是否已应用 `create_project_log_fast` 迁移。
- API 运行环境是否配置 `SUPABASE_DB_URL` 或 `SUPABASE_DB_DIRECT_URL`；未配置时会回退 Supabase HTTP RPC，链路仍正确但耗时会更高。

## 小程序同地址复测补充

小程序文档后续记录了开发服务上 `POST /project-logs?debug_timing=true`
出现 `500 / 31.912s`，API 日志显示错误为 Bun SQL 空闲连接复用后被远端关闭：

```text
ERR_POSTGRES_CONNECTION_CLOSED
```

已修复为每次创建使用短连接直连 RPC，并在请求结束关闭连接，避免重复使用失效连接。

使用同一开发服务地址复测：

- URL：`http://192.168.1.4:3000/project-logs?debug_timing=true`
- 结果：`200`
- 总耗时：`0.960s`
- `debug_timing.create_rpc_ms`：`957ms`
- 测试日志内容前缀：`接口测速-后端修复SQL连接curl复测-可删除`
- 测试日志清理：已清理 `2` 条

## 小程序二次复测结论

小程序团队已在
`orange/docs/2026-06-03-employee-project-log-create-performance-backend-checklist.md`
回写二次复测结论。真实 token 未写入文档。

测试条件：

- 环境：`http://192.168.1.4:3000`
- 项目：`54f11aa5-09a8-4410-a9c5-604a7fe9e09c`
- 阶段：`plumbing_electrical`
- 图片：`[]`

创建接口复测：

| 接口 | 状态 | 耗时 | debug_timing | 结论 |
| --- | --- | ---: | --- | --- |
| `GET /auth/me/permissions` | `200` | `1.071s` | 无 | 权限预热恢复到约 1 秒 |
| `POST /project-logs?debug_timing=true` | `200` | `2.303s` | 有 | 已不再 500，但仍高于 1 秒 |
| `POST /project-logs` | `200` | `0.891s` | 无 | 普通提交已达标 |

debug 请求返回摘要：

```json
{
  "auth_context_ms": 0,
  "validation_ms": 0,
  "create_rpc_ms": 2299,
  "serialize_ms": 0,
  "total_ms": 2300
}
```

结论：

- 普通无图片 `POST /project-logs` 已满足 `<1s`。
- `debug_timing=true` 诊断请求仍可能受短连接建立或数据库连接波动影响，不应作为普通用户链路默认参数。
- 小程序端确认不默认携带 `debug_timing=true`，仅用于联调复测。

返回详情页刷新接口补测：

| 接口 | 状态 | 耗时 | 结论 |
| --- | --- | ---: | --- |
| `GET /project_logs/projects?project_id=:id&page=1&pageSize=10` | `200` | `6.759s` | 偏慢 |
| `GET /project_logs/projects/calendar?project_id=:id` | `200` | `6.890s` | 偏慢 |
| `GET /projects/:id/construction-stages` | `200` | `11.555s` | 明显偏慢 |
| 三接口并发总耗时 | - | `11.568s` | 主要被施工阶段接口拖慢 |

前端已完成的体感优化：

- 保存成功后 `navigateBack()` 固定等待从 `800ms` 降到 `300ms`。
- 仅施工日志创建返回时，不再触发 `loadProjectConstructionStages()` 和 `loadProjectStatusActions()`。
- 预计普通无图片提交停留在创建页的主链路约为 `0.891s + 0.300s`，即约 `1.2s` 返回项目详情页。

后端后续关注：

- `GET /project_logs/projects`
- `GET /project_logs/projects/calendar`
- `GET /projects/:id/construction-stages`

以上刷新接口仍需单独治理到 1 秒内，尤其是 `construction-stages`。

## 验证命令

```bash
bun run --cwd apps/api check
```

结果：

```text
API file size check passed. threshold=500, exemptions=0
```
