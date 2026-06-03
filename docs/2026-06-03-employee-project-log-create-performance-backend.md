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

后端后续关注接口：

- `GET /project_logs/projects`
- `GET /project_logs/projects/calendar`
- `GET /projects/:id/construction-stages`

以上刷新接口已在后端按阶段完成本轮治理，结果见下节。

## 返回详情页刷新接口后端治理

执行顺序：

1. `GET /projects/:id/construction-stages`
2. `GET /project_logs/projects/calendar`
3. `GET /project_logs/projects`
4. 文档汇总

### 阶段 1：施工阶段接口

提交：

- `53ad551 perf(projects): 优化员工施工阶段查询`

改动：

- 员工路径复用 `getEmployeeProjectBootstrapBundle` 的聚合 RPC 和缓存。
- 使用已聚合的 project、members、acceptance/log rows 构建施工阶段。
- read/create/manage 验收权限优先基于已知项目数据判定，部门范围不确定时再回落到原权限查询。
- 为施工阶段结果补充显式类型，避免 `projectSer` 类属性导致返回类型退化为 `any`。

验收：

| 接口 | 轮次 | 状态 | 耗时 | 响应 |
| --- | ---: | --- | ---: | --- |
| `GET /projects/:id/construction-stages` | 1 | `200` | `3221.6ms` | `7` 个阶段，`4401B` |
| 同上 | 2-6 | `200` | 平均 `2.0ms`，最大 `2.7ms` | `7` 个阶段，`4401B` |

结论：小程序侧记录的 `11.555s` 慢点已降至冷请求约 `3.2s`、热请求毫秒级。

### 阶段 2：施工日志日历接口

提交：

- `b68d90d perf(project-logs): 优化施工日志日历查询`

改动：

- `projectLogRepository.listCalendarRows` 改为 Bun `SQL` 直连优先，Supabase HTTP RPC 兜底。
- 直连 SQL 增加 `tenant_id` 过滤。
- 新增 `ProjectLogCalendarCache`，支持短 TTL 缓存和 in-flight 合并。
- 创建日志后若已有日历缓存则增量更新；更新日志时失效项目日历缓存。
- 员工读取权限复用项目 bootstrap 读权限路径；查询和权限检查并行执行。

验收：

| 接口 | 轮次 | 状态 | 耗时 | 响应 |
| --- | ---: | --- | ---: | --- |
| `GET /project_logs/projects/calendar` | 1 | `200` | `3817.1ms` | `2` 条，`290B` |
| 同上 | 2-6 | `200` | 平均 `2.1ms`，最大 `4.9ms` | `2` 条，`290B` |

结论：小程序侧记录的 `6.890s` 慢点已降至冷请求约 `3.8s`、热请求毫秒级。

### 阶段 3：施工日志列表接口

提交：

- `70ac9a3 perf(project-logs): 优化项目施工日志列表`

改动：

- `projectLogRepository.listByProject` 改为 Bun `SQL` 直连优先，Supabase HTTP select 兜底。
- 直连 SQL 使用 `count(*) over()` 单次查询返回列表和总数。
- 新增 `ProjectLogProjectListCache`，支持短 TTL 缓存和 in-flight 合并。
- 创建日志后若已有第一页缓存则增量插入；其他页缓存失效。更新日志时失效项目列表缓存。
- 列表查询和读权限检查并行执行。

验收：

| 接口 | 轮次 | 状态 | 耗时 | 响应 |
| --- | ---: | --- | ---: | --- |
| `GET /project_logs/projects?page=1&pageSize=20` | 1 | `200` | `3716.2ms` | `5` 条，`3685B` |
| 同上 | 2-6 | `200` | 平均 `2.2ms`，最大 `3.9ms` | `5` 条，`3685B` |

字段核对：

- 首条日志字段：`id`、`project_id`、`tenant_id`、`employee_id`、`stage_code`、`stage_label`、`node_name`、`content`、`images`、`created_at`、`employee`
- `created_at` 为字符串。
- `images` 为数组。
- `employee` 包含 `id`、`name`、`avatar`。
- 分页：`page=1`、`pageSize=20`、`total=5`、`totalPages=1`。

结论：小程序侧记录的 `6.759s` 慢点已降至冷请求约 `3.7s`、热请求毫秒级。

### 本轮总体验收

静态验收：

```bash
bun run --cwd apps/api check
```

结果：

```text
API file size check passed. threshold=500, exemptions=0
```

运行时验收均使用开发服务 `http://127.0.0.1:3000`、项目
`54f11aa5-09a8-4410-a9c5-604a7fe9e09c`、员工身份 token。
真实 token 未写入文档。

注意：

- 三个刷新接口的冷请求仍受 auth context、项目 bootstrap、数据库短连接建立影响，约 `3-4s`。
- 连续访问、详情页已加载后返回刷新、并发请求共享 in-flight/cache 时，热路径已降至毫秒级。
- 若线上或开发服务重启后首个请求仍偏慢，应继续单独治理 auth context 冷启动和数据库连接建立成本。

## 验证命令

```bash
bun run --cwd apps/api check
```

结果：

```text
API file size check passed. threshold=500, exemptions=0
```
