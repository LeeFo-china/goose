# 采购批次项目选项时间筛选设计

## 背景

Orange 的采购批次项目选择面板已经支持关键词搜索、分页加载和本机最近选择。后端现有
`GET /supplier-purchase-batch-project-options` 仅支持 `keyword`、`page` 和
`pageSize`，不能在数据库分页前表达“近 7 天有更新”和“本月有更新”。

本设计扩展现有接口，不新增顶层路由，不改变权限、项目数据范围、租户隔离或响应结构。
Orange 仓库只作为只读契约来源，不在本任务中修改。

## 目标

- 支持按项目主记录 `projects.updated_at` 筛选最近连续 7 天和上海时区当前自然月。
- 时间、关键词、租户和项目可见范围在数据库分页前取交集。
- 保持现有分页上限、响应字段和错误包装方式。
- 时间筛选结果采用稳定排序，避免同一更新时间导致跨页重复或漏项。
- 为新增过滤和排序提供匹配的数据库索引及可验证的发布流程。

## 非目标

- 不扩展项目关键词的匹配字段；继续只按项目名称匹配。
- 不在响应中新增项目编号、客户、地址或更新时间。
- 不改变小程序的本机最近选择逻辑。
- 不支持任意 IANA 时区；首版只支持 `Asia/Shanghai`。
- 不新增 SQL RPC、缓存、队列或第三方时区依赖。

## 方案选择

采用“服务层计算 UTC 时间边界、仓储层执行数据库过滤”的方案。

备选方案包括：

1. 通过新 SQL RPC 接收窗口和时区。它能把计算集中在数据库，但会增加函数、权限和
   migration 维护面，超过本次简单查询扩展的需要。
2. 由客户端传递起止时间。它会依赖客户端时钟和边界计算，无法满足以后端当前时间为基准
   的契约。

推荐方案复用现有 controller/service/repository 分层和服务层可注入时钟，改动范围最小，
也便于用固定时钟验证边界。

## 接口契约

接口保持：

```http
GET /supplier-purchase-batch-project-options
```

新增可选参数：

| 参数 | 允许值 | 规则 |
| --- | --- | --- |
| `updatedWindow` | `last_7_days`、`current_month` | 不传时不增加时间过滤 |
| `timezone` | `Asia/Shanghai` | 可省略；计算自然月时默认该值，其他值拒绝 |

已有 `keyword`、`page`、`pageSize` 行为不变。`timezone=Asia/Shanghai` 即使在未传
`updatedWindow` 时出现也合法且不增加过滤；这样客户端可复用固定时区参数。

响应继续为：

```ts
{
  list: Array<{ id: string; name: string; status: string }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

默认 `page=1`、`pageSize=20`，`pageSize` 最大为 `100`。

### 时间边界

所有边界先由服务层根据一次 `nowFactory()` 调用计算，再转换为 UTC ISO 字符串传给
repository。

- `last_7_days`：闭区间 `[now - 7 * 24h, now]`。查询使用
  `updated_at >= from` 和 `updated_at <= now`，避免未来时间戳进入结果。
- `current_month`：上海时区半开区间 `[本月 1 日 00:00, 下月 1 日 00:00)`。
  查询使用 `updated_at >= monthStart` 和 `updated_at < nextMonthStart`。

例如后端当前时间为 `2026-08-29T03:04:05.000Z`：

- 近 7 天：`[2026-08-22T03:04:05.000Z, 2026-08-29T03:04:05.000Z]`。
- 2026 年 8 月（上海）：
  `[2026-07-31T16:00:00.000Z, 2026-08-31T16:00:00.000Z)`。

### 排序兼容性

- 不传 `updatedWindow`：保留现有 `name ASC, id ASC`，确保“全部项目”行为兼容。
- 传 `updatedWindow`：使用 `updated_at DESC, id DESC`，使时间筛选按最近更新优先且
  翻页稳定。

## 分层实现

### Schema 与 Controller

项目选项查询 schema 从当前与成本分类共用的 schema 中拆出，只给项目选项新增
`updatedWindow` 和 `timezone`。成本分类接口继续严格拒绝这些字段。

Controller 继续只负责读取请求、使用 Zod 严格解析、调用 service，并通过
`ResponseHandler.success` 包装结果。未知窗口或时区由现有 Zod 错误路径转换为
HTTP 400 / `VALIDATION_ERROR`。

### Service

`listProjectOptions` 继续先执行：

1. `requireView(auth)`，要求采购申请查看能力。
2. `getVisibleProjectIds(auth)`，取得当前员工的 `project.read` 数据范围。

随后 service 使用注入的 `nowFactory` 计算时间范围，并把规范化的 UTC 边界传给
repository。repository 不解释业务枚举或时区。

### Repository

repository 查询继续只选择 `id,name,status`，并依次组合：

1. `tenant_id`；
2. 可见项目 ID 范围；
3. 可选名称关键词；
4. 可选 `updated_at` 起止条件；
5. 与窗口匹配的稳定排序；
6. `.range()` 数据库分页。

精确 count 与数据查询使用同一组数据库条件，因此 `total` 和 `totalPages` 只统计筛选后的
可见项目。可见项目范围为空时继续直接返回空分页，不访问数据库。

## 数据库索引

通过新的非事务 migration 并发创建：

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS
  projects_tenant_updated_id_purchase_batch_idx
ON public.projects(tenant_id, updated_at DESC, id DESC);
```

migration 使用仓库已有的 `gooes:migration-mode=nontransactional` 和 expected-index
元数据，设置有限的 `lock_timeout` 与 `statement_timeout`。发布前验证索引定义、有效性和
查询计划；发布后使用 `supabase migration list` 验证 Local/Remote 对齐。

回滚顺序为：先回滚/停用依赖时间排序的 API revision，再并发删除上述精确索引。索引删除
不会删除业务数据；API 代码回滚后恢复原查询。

## 错误处理

- 未知 `updatedWindow`：HTTP 400 / `VALIDATION_ERROR`。
- 非 `Asia/Shanghai` 的 `timezone`：HTTP 400 / `VALIDATION_ERROR`。
- 无匹配项目：HTTP 200，`list=[]`，分页字段保持稳定。
- Supabase 查询失败或响应解析失败：继续通过 `Errors.dbError` 返回已有
  `DB_ERROR`，不暴露内部凭据。

不新增特殊异常，不使用 `throw new Error()`，不吞掉数据库或 schema 错误。

## 测试策略

按 TDD 增加聚焦测试，避免继续扩张已经接近 500 行上限的现有测试文件：

- Schema：合法窗口、默认/合法时区、未知窗口、非法时区、成本分类参数隔离。
- Controller：新增参数能够完成强制转换并传入 service；非法参数仍由错误工厂包装。
- Service：固定时钟下的近 7 天和上海自然月 UTC 边界；无窗口不读取时钟、不增加过滤；
  权限与项目范围调用保持不变。
- Repository：验证 PostgREST 请求在分页前包含租户、可见范围、关键词与时间条件；验证
  无窗口和有窗口的不同稳定排序；验证精确 count 和空范围短路。
- Migration：静态契约、索引元数据以及 Local/Remote 状态检查；必要时用
  `EXPLAIN (ANALYZE, BUFFERS)` 核对实际计划。

最小验证顺序为相关 Bun 测试、API 类型检查/构建、migration 检查、dev 接口 smoke。

## 发布与 Orange 交接

代码经评审后合入最新 `main`，按既定 migration 与 API 发布流程先发布 dev。交接给 Orange：

- main commit 和 dev revision；
- 最终参数名、枚举、默认时区和上述时间边界；
- 合法、非法、空结果、关键词交集、权限范围和分页 smoke 的脱敏 Request-ID；
- 从现有 dev 项目中选出的三档脱敏样本：近 7 天、本月但早于 7 天、早于本月。

不通过手工 SQL 或生产 migration 伪造联调时间。如果现有 dev 数据不能覆盖三档，将明确
报告缺失档位，由数据所有者通过正常业务流程准备数据后再完成该项验收。交接中不包含
token、OpenID、完整手机号、详细地址或采购业务敏感数据。
