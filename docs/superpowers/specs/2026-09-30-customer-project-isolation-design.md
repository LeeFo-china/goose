# 客户项目隔离修复设计

## 背景与目标

员工查看无项目客户时，旧版小程序曾请求
`GET /projects/status?customer_id=<客户 ID>`。后端的
`ProjectListQuerySchema` 未声明 `customer_id`，Zod 因而将该参数剔除，
后续查询、分页统计和缓存都退化为普通项目列表。客户端再回退到列表第一项后，
会把同租户其他客户的项目误认为当前客户项目。

本次修复必须建立两条可信契约：

1. `/projects/status` 正式支持按 `customer_id` 过滤，列表、统计和缓存使用相同条件。
2. `/customers/:id/detail` 直接返回当前客户的 `latest_project`，无项目时明确返回
   `null`，不得从其他列表或缓存兜底。

同时用回归测试固化客户工作流边界：潜在客户的正常推进动作为
`start_following`；`start_design` 仅允许从 `arrived` 执行，且没有当前客户主房产时
稳定失败。

## 已确认根因

- `apps/api/src/schema/projects.ts` 的 `ProjectListQuerySchema` 不包含
  `customer_id`，解析后的查询对象不再携带客户端传值。
- `apps/api/src/services/projects/legacy/lists.ts` 生成 repository filters 时没有客户
  条件，项目列表缓存键也没有客户维度。
- `apps/api/src/repositories/projects/legacy-repository.ts` 只应用租户、权限项目 ID、
  状态、关键词和项目 ID 集合过滤；行查询和 count 因而可能覆盖整个可见项目集。
- `apps/api/src/controllers/customer/shared.ts` 聚合详情时没有加载项目摘要。
- 现有工作流状态配置和 `customer-status` 服务已正确限制 `start_following`、
  `start_design` 及主房产前置条件；这部分以回归测试为主，不引入新动作语义。

## 方案选择

采用专用客户项目查询与现有项目列表过滤链路扩展相结合的方案。

- 客户详情通过 customer repository 的专用方法查询一条最新项目。该查询只选择
  `id, customer_id, name, status, created_at`，同时限制 `tenant_id` 和
  `customer_id`，并按 `created_at DESC, id DESC` 稳定排序。
- 项目列表在既有 `ProjectListQuerySchema -> service filters -> repository` 链路中增加
  `customerId`，不复用客户详情查询，也不改变现有权限范围计算。

不选择以下方案：

- 不让客户详情调用完整项目列表服务。该服务包含项目可见范围、列表缓存、负责人、
  施工阶段和工作流摘要等增强逻辑，详情只需要可信摘要，复用会引入不必要耦合。
- 不依赖 Supabase 嵌套关系在客户详情查询中截取项目。专用查询更容易明确租户和客户
  双重约束，也能显式保证稳定排序。

## 组件与数据流

### `/projects/status`

1. Controller 继续使用 `ProjectListQuerySchema` 校验请求；新增
   `customer_id: optionalQueryValue(z.uuid("无效的客户 ID"))`。
2. Service 从查询中读取 `customer_id`，转换成内部 filter 字段 `customerId`。
3. 权限服务仍先计算当前员工可见的项目 ID；客户过滤只缩小结果，不能扩大权限。
4. Repository 的公共过滤函数追加
   `projects.customer_id = filters.customerId`。行查询与 count 已共用该函数，因此
   `list`、`total` 和 `totalPages` 保持一致。
5. 项目列表缓存键追加规范化后的 `customer_id`。不同客户即使其余参数完全相同，
   也不能命中同一缓存项或 in-flight 请求。
6. 没有匹配项目时返回既有成功结构，其中 `list: []`、`total: 0`。

### `/customers/:id/detail`

1. 详情接口先沿用现有 `customer.read`、租户上下文及客户可见范围校验。
2. `buildCustomerDetailResponse` 与房产、跟进、来源和工作流状态并行加载
   `latest_project`。
3. Repository 查询同时匹配当前 `tenant_id` 和当前 `customer.id`，只取必要字段，
   按 `created_at DESC, id DESC` 排序后限制一条。
4. 无结果返回 `latest_project: null`；有结果时返回项目摘要。
5. Service/response 聚合层额外校验非空摘要的 `customer_id === customer.id`。
   若 repository 违反该不变量，不将错误项目降级为可用数据；应通过统一错误工厂暴露
   服务端数据一致性错误，防止串客静默发生。

## 工作流边界

本次不改变工作流状态机：

- `potential` 的正常推进仍为 `start_following -> following`。
- `start_design` 仅接受 `arrived`。
- `start_design` 会按 `tenant_id + customer_id` 查询当前客户主房产；没有主房产时继续
  返回现有 400 错误“客户进入设计前必须先维护房产信息”。
- 设计项目复用继续按 `tenant_id + customer_id + property_id` 查询非 invalid 项目，
  不得复用其他客户项目。

## 错误处理与兼容性

- 非法 `customer_id` 由 Zod 校验失败并经 `Errors.fromZod()` 返回 400。
- 合法但无匹配项目的请求返回 200 和空列表，不泄露其他客户项目。
- 权限行为保持不变：客户筛选和详情摘要都不能绕过现有租户及可见范围校验。
- 所有新增数据库错误使用 `Errors.dbError()`；不直接抛出原生 `Error`。
- 新增响应字段向后兼容；旧客户端可以忽略 `latest_project`。

## 性能与数据库

- 项目列表仍使用 `.range()` 分页，默认 `page=1&pageSize=20`、最大 100。
- 客户详情项目摘要使用必要字段和 `.limit(1)`，不存在无边界读取。
- 项目列表行查询与 count 使用同一过滤函数，避免分页统计漂移。
- 现有 migration 已提供 `projects(tenant_id, customer_id)` 索引。本次不修改数据库，
  因此不新增 migration；若后续执行计划证明稳定排序成本显著，再另行通过 migration
  增加覆盖排序的复合索引。

## 测试与验收

采用 Bun 测试，先写失败测试再实现：

1. Schema 接受合法 UUID `customer_id`，拒绝非法 UUID。
2. 项目 service 将 `customer_id` 传入 repository filters；行查询和 count 收到同一
   `customerId`。
3. 项目 repository 同时应用 `tenant_id`、`visibleProjectIds` 和 `customer_id`，证明
   客户筛选只收窄权限范围。
4. 缓存键中包含 `customer_id`；先请求客户 B 再请求客户 A 时，两者缓存键不同。
5. 客户详情无项目时返回 `latest_project: null`。
6. 客户详情有项目时只返回 `customer_id` 等于当前客户 ID 的摘要；稳定排序使用
   `created_at DESC, id DESC`。
7. 交叉客户场景：客户 A 无项目、客户 B 有项目，请求 A 的项目列表和详情都不能返回
   B 的项目。
8. 潜在客户动作包含 `start_following` 且不包含 `start_design`；无主房产的 arrived
   客户提交 `start_design` 返回现有 400；重复设计动作继续复用同一客户同一房产项目。
9. 运行相关测试、API TypeScript 类型检查、API build 和文件大小检查。

## 仓库边界

- 只修改 `/Users/leefo/Public/work/gooes`。
- `/Users/leefo/Public/work/orange` 仅作为交接文档和现有客户端调用的只读证据，
  不修改、格式化、生成、提交或推送其中任何内容。
