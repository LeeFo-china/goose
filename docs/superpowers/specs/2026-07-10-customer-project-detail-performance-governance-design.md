# 客户项目详情性能治理设计

日期：2026-07-10

## 目标

治理 `GET /customer/projects/:id/detail-bootstrap` 的冷态和抖动耗时，确保客户项目详情在小程序 12 秒超时边界内稳定返回，并把 dev 服务器环境的接口性能收敛到：

- `detail-bootstrap` P95 小于 1500ms，单次最大值小于 3000ms。
- `workflow_progress_ms` P95 小于 1000ms。
- 客户日志、分享活动摘要、预约奖励活动独立接口 P95 小于 2000ms。
- 可选模块超时后不继续无限占用数据库连接或请求资源。

## 已确认事实

项目 `fa32f6dd-b2d0-4efc-a810-347dfe90ec4c` 的事故请求总耗时为 20216ms，其中：

- `project_detail_ms = 11776`
- `workflow_progress_ms = 8434`
- `acceptances_ms = 4595`
- `serialize_ms = 434`

当前 controller 先串行加载 `project_detail`，再并发加载 workflow、日志、验收、客服和营销模块，因此关键路径约等于：

```text
project_detail_ms + max(workflow_progress_ms, 其他未降级模块耗时)
```

数据库只读检查已经确认：

- project detail SQL 执行约 0.125ms。
- logs RPC 执行约 2.667ms。
- acceptances RPC 执行约 1.534ms。
- `pg_stat_statements` 中 workflow 相关 SELECT 最大执行时间约 13.445ms。

本机 API 访问远端 dev Supabase 时，同一核心服务调用约 10.3 秒，其中 workflow progress 约 7.9 秒；dev 服务器同机容器中相同服务路径约 0.1 秒。因此当前主要问题发生在 PostgreSQL 执行器之外，集中在网络往返、连接获取、连接排队和重复调用。

## 范围

### 本阶段包含

1. 为客户 workflow progress 增加子步骤 timing。
2. 为同项目 workflow progress 增加短缓存和 in-flight 去重。
3. 为客户项目必需详情查询增加 in-flight 去重和已有短缓存复用。
4. 收紧可选模块的执行期限，确保 controller 超时后底层任务不会无限存活。
5. 增加覆盖 timing、缓存、并发去重和超时清理的自动化测试。
6. 使用同一项目执行本机与 dev 容器性能复测。

### 本阶段不包含

- 不修改 `/Users/leefo/Public/work/orange`。
- 不提高小程序 12 秒主请求 timeout。
- 不改变 `detail-bootstrap` 请求参数、响应字段或 `partial_errors` 结构。
- 不恢复 workflow progress 的 1200ms 降级超时。
- 不新增 Redis、队列或第三方依赖。
- 不在缺少新 timing 证据时增加索引或数据库 RPC。
- 不处理独立发现的 `platform_partner_member_rebind_requests` RLS 问题；该问题属于单独安全任务。

## 方案比较

### 方案 A：分阶段治理（采用）

先增加细分 timing、短缓存、in-flight 去重和任务期限，再根据复测结果决定是否引入 RPC。

优点：保持接口契约，改动可分阶段验证，不会在缺少执行计划证据时引入数据库结构。

缺点：如果跨网络多轮往返仍是绝对瓶颈，最终仍可能需要 RPC。

### 方案 B：恢复 workflow 超时降级

给 workflow progress 恢复固定超时，超时返回 `source = unavailable`。

不采用原因：客户项目详情已约定必须返回完整 workflow timeline，正常慢查询不能伪装成业务不可用。

### 方案 C：直接建设单次聚合 RPC

把项目、workflow、日志和验收一次性聚合到数据库函数。

暂不采用原因：当前 SQL 执行时间均为毫秒级，尚未证明需要一次性扩大数据库契约和回归范围。

## 架构设计

### 1. Workflow progress timing

`ProjectWorkflowProgressService.getProjectProgress` 接受可选 timing collector。collector 只记录耗时，不改变业务返回值。

步骤包含：

- `subject_state_runtime_ms`
- `graph_ms`
- `pending_tasks_ms`
- `runtime_nodes_ms`
- `procedure_assignments_ms`
- `task_actions_ms`
- `finance_reviewers_ms`
- `completed_node_actors_ms`
- `projection_ms`

controller 的 `workflow_progress_ms` 保持为总耗时，并在 slow timing 日志的 `extra.workflow_steps` 中输出子步骤。

### 2. 短缓存与 in-flight 去重

workflow progress 缓存位于 service 层，键为：

```text
tenantId:projectId
```

设计约束：

- 成功结果缓存 5 秒。
- 同一键存在执行中的 Promise 时复用该 Promise。
- Promise 成功或失败后都必须清理 in-flight Map。
- 错误和 `source = unavailable` 不进入成功缓存。
- workflow mutation 成功后调用显式失效方法。
- 缓存只作为短时并发收敛，不取代 workflow runtime 数据源。

客户项目详情查询复用相同模式：

- `getOwnedProject` 增加 5 秒结果缓存和 in-flight 去重。
- 缓存键包含 tenant、customer、project，防止跨客户复用。
- 未找到项目的结果不缓存，保持权限和存在性检查语义。

### 3. 可选模块执行期限

现有 `Promise.race` 只停止 controller 等待，不能停止底层数据库或 HTTP 请求。本阶段采用双层期限：

1. controller 继续使用现有 module timeout 生成 `partial_errors`。
2. repository/gateway 在支持取消的调用上接收 `AbortSignal`；直连数据库调用使用数据库侧 statement timeout 或驱动支持的取消能力。

如果某个现有第三方 API 不支持可靠取消，本阶段必须：

- 在调用前设置明确的数据库执行期限。
- 不让已经超时的请求继续无限排队。
- 在日志中标明 `cancel_supported = false`，为后续驱动治理保留证据。

不通过扩大 Bun SQL pool 上限解决问题；当前 `max = 2` 是数据库保护边界。

### 4. RPC 决策门槛

完成 timing、缓存、去重和期限治理后，只有同时满足以下条件才进入 RPC 设计：

- dev 服务器 `workflow_progress_ms` P95 仍超过 1000ms。
- timing 显示主要耗时来自两个以上顺序网络阶段，而不是单个异常模块。
- 单条 SQL 执行计划仍在可接受范围内。

届时新 RPC 只聚合客户安全的 workflow projection，不同时合并日志和营销模块。所有函数、索引、权限和回滚语句必须进入 `supabase/migrations/`。

## 数据流

```text
customer detail request
  -> project ownership lookup
       -> cache hit / in-flight reuse / repository query
  -> parallel optional modules
  -> workflow progress
       -> cache hit / in-flight reuse
       -> subject state + runtime
       -> graph/tasks/nodes/assignments in parallel
       -> actions/reviewers/actors in parallel
       -> projection
  -> response + timing log
```

缓存未命中时仍按当前 repository/service 分层读取 Supabase；controller 不直接访问数据库。

## 错误处理

- 参数、身份和项目归属错误继续通过 `Errors` 与 `error-factory.ts` 包装。
- project detail 失败仍使主接口失败，不伪装成 partial error。
- workflow 真实异常仍返回 `source = unavailable` 并写入 `partial_errors`。
- 可选模块超时继续返回对应空态并写入 `partial_errors`。
- 不吞掉取消异常；日志记录 module、timeout、requestId、projectId 和取消结果。
- 不直接 `throw new Error()` 新建业务错误。

## 测试设计

### Workflow timing

- 所有依赖成功时，每个被执行步骤都记录非负耗时。
- 无 runtime 时只记录 subject state/runtime 和 projection，不伪造其他步骤。
- 任一依赖异常时，总 timing 和已开始步骤仍被记录。

### Workflow 缓存与去重

- 两个并发相同请求只调用底层依赖一次。
- 5 秒内的后续请求命中缓存。
- 不同 tenant/project 不共享缓存。
- 失败 Promise 清理 in-flight，下一次可以重新查询。
- 显式失效后下一次重新查询。

### Project detail 缓存与去重

- 相同 tenant/customer/project 并发只查询 repository 一次。
- 不同 customer 不共享结果。
- not found 和错误不进入缓存。

### Optional timeout

- module 在期限内完成时返回真实结果。
- module 超时时返回 partial error。
- timeout timer 在正常完成和异常完成后均清理。
- 支持 AbortSignal 的 gateway 收到 abort。
- 超时后的底层 Promise 不产生未处理 rejection。

## 验证与发布

1. 运行目标单元测试。
2. 运行 API TypeScript check 和 build。
3. 使用 fa32 项目执行服务层冷/热、串行/并发复测。
4. 部署 dev API 后执行 10 轮 `detail-bootstrap` smoke，记录 P50、P95、最大值和所有 workflow 子步骤。
5. 模拟客户端 12 秒超时和连续三次重试，确认连接池等待不会持续增长。
6. 检查 `pg_stat_activity`，确认超时模块没有长期残留查询。
7. 指标达标后再决定是否启动 workflow projection RPC。

## 回滚

- timing 字段仅写日志，可独立回滚。
- 缓存和 in-flight 去重均为进程内状态，回滚代码即可恢复原路径。
- 取消与执行期限可以按 gateway 独立关闭，不改变数据库数据。
- 本阶段没有 migration，不涉及数据库回滚。

## 完成定义

- 自动化测试覆盖 timing、缓存、去重和 timeout 清理。
- API check、build 和目标测试通过。
- 接口契约未改变。
- dev 环境性能达到目标，或新 timing 明确证明必须进入 RPC 阶段。
- orange 仓库保持未修改。

