# 采购批次 Workflow EXPLAIN 基数分层门禁设计

## 背景

采购批次 Workflow 的 dev 发布验收要求在默认 PostgreSQL planner 下，对以下三条点查执行
`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE, FORMAT JSON)`：

1. 运行中采购批次实例查询；
2. 实例待办查询；
3. 采购批次 subject state 查询。

2026-08-31 的 dev 验收中，前两条查询分别命中
`workflow_instances_purchase_batch_lookup_idx` 和
`idx_workflow_tasks_instance_status`。第三条查询面对仅 45 行、2 个缓存块的
`workflow_subject_states`，默认 planner 选择 Seq Scan，执行时间为 0.061ms、共享读块为
0。目标索引 `idx_workflow_subject_states_subject` 已存在，并在一次性 schema clone 的结构
可用性检查中可被使用。

当前临时验收脚本禁止任何 Seq Scan，因此把小表上成本更低的 planner 决策误判为性能失败。
本设计修正验收判定，不修改数据库结构、业务 API、Workflow 运行时或 Orange 客户端契约。

## 设计目标

- 默认 planner 的正常小表决策不得产生假失败。
- 大表点查必须命中预期的有界索引，不得用时延暂时较低掩盖全表扫描。
- 不使用 `enable_seqscan=off`、planner hint、人工 seed 或远端手工数据库变更制造通过结果。
- 所有基数检查、索引检查和 EXPLAIN 都是只读且有界的。
- 输出可审计的基数、分层结论、节点、索引、时延和 buffer 摘要。

## 决策

### 基数分界

采用仓库既有的 `LARGE_TENANT_PROJECT_CARDINALITY = 1_000` 规则，将 `1_000` 作为本门禁的
大基数起点：

- 目标表记录数小于 1,000：小基数；
- 目标表记录数达到或超过 1,000：大基数。

这是验收分类阈值，不是数据库容量、采购批次数量或业务配额限制。

基数按整张目标 relation 计算，不按单个租户、采购批次或 Workflow subject 过滤。每张目标表
通过有界计数判定分层，只需要知道是否达到 1,000，不计算无上限精确总数。逻辑等价于：

```sql
SELECT count(*)
FROM (
  SELECT 1
  FROM public.<target_relation>
  LIMIT 1000
) AS bounded_rows;
```

`<target_relation>` 必须由代码内三张允许表的固定映射选择，不接受外部输入或直接拼接。返回
1,000 即归类为大基数，否则为小基数。

### 查询清单

门禁使用与采购审批仓储层相同的过滤、排序和 `LIMIT 2`，不得由 runner 临时改写。权威参数
来自 GitHub Actions run `33359680214` 的 artifact
`supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3`：

- `rollout-settings.json.tenant_id`：`3eebca47-961f-4899-b976-a3d3208d326b`；
- `execute.json.batchId`：`53298aa5-a3f6-45c3-8820-4cbfa15abfdb`；
- `execute.json.instanceId`：`158649b4-c356-4b04-abb4-d1d1b65f08d5`。

runner 接受的 evidence JSON 必须包含这三项 UUID，且三者均通过 UUID 校验；实例 UUID 还
必须在同一只读事务中证明属于同一 `tenant_id + supplier_purchase_batch + batch_id`。runner
内部先把 artifact 字段归一为以下唯一输入结构，不接受 snake_case 别名或其他关联实例：

```json
{
  "sourceRunId": "33359680214",
  "artifactName": "supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3",
  "tenantId": "3eebca47-961f-4899-b976-a3d3208d326b",
  "batchId": "53298aa5-a3f6-45c3-8820-4cbfa15abfdb",
  "instanceId": "158649b4-c356-4b04-abb4-d1d1b65f08d5"
}
```

`sourceRunId`、`artifactName` 和三个 UUID 必须与代码内固定 manifest 逐值完全相等，否则
返回 `INVALID_EVIDENCE_INPUT`。protected workflow 从上述 artifact 的
`rollout-settings.json.tenant_id`、`execute.json.batchId`、`execute.json.instanceId` 读取并
归一化；实现和测试可注入等值 JSON，但不能只凭格式合法绕过固定值校验。

```sql
-- running_instance；参数：tenant_id、batch_id
SELECT id
FROM public.workflow_instances
WHERE tenant_id = $1::uuid
  AND subject_type = 'supplier_purchase_batch'
  AND subject_id = $2::text
  AND status = 'running'
ORDER BY created_at DESC, id DESC
LIMIT 2;

-- pending_task；参数：tenant_id、instance_id
SELECT id
FROM public.workflow_tasks
WHERE tenant_id = $1::uuid
  AND instance_id = $2::uuid
  AND status = 'pending'
ORDER BY created_at ASC, id ASC
LIMIT 2;

-- subject_state；参数：tenant_id、batch_id
SELECT subject_id
FROM public.workflow_subject_states
WHERE tenant_id = $1::uuid
  AND subject_type = 'supplier_purchase_batch'
  AND subject_id = $2::text
LIMIT 2;
```

每条 SQL 外层固定使用
`EXPLAIN (ANALYZE, BUFFERS, SETTINGS, VERBOSE, FORMAT JSON)`。查询名、目标 relation、SQL、
参数种类和允许索引组成代码内只读 manifest；证据必须与 manifest 的三个查询恰好一一对应。

### 所有基数共同门禁

无论目标表大小，均必须满足：

- runner 使用能够绕过 RLS 的受保护 dev 数据库角色，并校验当前角色满足
  `rolsuper=true OR rolbypassrl=true`；证据只记录有效能力布尔值，不输出角色名、连接串或凭据；
- 三表计数、索引元数据、planner settings、preflight 和三个 EXPLAIN 都在同一个
  `REPEATABLE READ READ ONLY` 事务快照中执行；
- statement timeout 固定为 5 秒；这是对既有项目选择门禁的复用，不采用先前临时脚本的
  30 秒进程等待上限；
- 不执行 `SET enable_seqscan=off`。在同一事务内读取 `pg_settings` 中所有
  `category LIKE 'Query Tuning /%'` 的项目以及 `plan_cache_mode`，覆盖 planner method、
  cost constants、GEQO、统计和其他 planner 选项。来源通常只允许 `default` 或
  `configuration file`，逐值登记的受管项除外；通常 `setting` 必须等于 `boot_val`。已登记项为
  `configuration file` 的 `effective_cache_size`（展示值 `128MB`、raw `16384`、boot
  `524288`），以及 dev 角色 `search_path`（current/raw `"\$user", public, extensions`、
  boot `"$user", public`、`source=user`）。`session/client` 等临时来源和其他偏移均以
  非默认 planner 失败。EXPLAIN 根对象的 `Settings` 缺失时按空对象处理，存在时必须是对象并
  写入脱敏证据；其中任何 planner 项必须与 `current_setting(name)` 的展示值完全一致；
- 清单列出的每个预期索引都必须在 `pg_index` 中证明属于 `public` 下对应目标 relation，且
  `indisvalid=true`、`indisready=true`；
- planning time 不超过 50ms；
- execution time 不超过 250ms；
- shared read blocks 不超过 20,000；
- temp read blocks 与 temp written blocks 均为 0；
- JSON 计划结构完整；递归节点必须可提取 node type，所有带 `Relation Name` 的目标节点必须
  同时满足 `Schema=public`；
- 直接索引命中仅指目标 relation 的 `Index Scan` 或 `Index Only Scan` 节点，其 `Index Name`
  必须存在；Bitmap 命中仅指目标 relation 的 `Bitmap Heap Scan` 子树中存在
  `Bitmap Index Scan`，且后者 `Index Name` 存在。目标 relation 的 `Seq Scan`（无论
  `Parallel Aware` 值）允许没有 index name；小表出现其他目标扫描节点时记录实际类型，但不
  视为索引命中；
- buffer 只读取顶层 `Plan` 的累计值，不递归求和，避免对子节点重复计数；顶层
  `Shared Hit Blocks`、`Shared Read Blocks`、`Temp Read Blocks`、`Temp Written Blocks`
  缺失时按 PostgreSQL 零块语义归一为 0，存在时必须是非负安全整数，否则计划无效。

时延和 buffer 阈值复用现有
`apps/api/src/scripts/supplier-purchase-project-options-explain-evidence.ts` 项目选择 EXPLAIN 门禁，
避免为本次验收另造一套无依据常量。

### 小基数门禁

目标表小于 1,000 行时：

- 允许默认 planner 在目标 relation 上选择 Seq Scan；
- 仍必须满足共同门禁；
- 证据必须记录 `cardinality_class=small`、有界计数、实际目标扫描节点（Seq Scan 或 Index
  Scan）及实际时延/buffer；
- 预期索引必须存在且有效，但不要求本次计划实际选择该索引。

### 大基数门禁

目标表达到或超过 1,000 行时：

- 目标 relation 不得出现 `Seq Scan`，包括 `Parallel Aware=true` 的 Seq Scan；
- 计划必须命中该查询允许的预期索引之一；
- 同时满足共同门禁；
- 未命中索引、出现 Seq Scan、超时或越过时延/buffer 阈值均立即停止灰度。

三条查询的允许索引如下。元数据门禁要求表内列出的每个索引均有效；大基数时，实际计划命中
其中至少一个才通过：

| 查询 | 目标表 | 允许的预期索引 |
| --- | --- | --- |
| running instance | `workflow_instances` | `workflow_instances_running_purchase_batch_uidx` 或 `workflow_instances_purchase_batch_lookup_idx` |
| pending task | `workflow_tasks` | `idx_workflow_tasks_instance_status` |
| subject state | `workflow_subject_states` | `idx_workflow_subject_states_subject` |

## 组件与数据流

### 计划解析与判定模块

在 API scripts 目录新增一个纯函数模块，职责限定为：

1. 解析 EXPLAIN JSON；
2. 校验可选 `Settings` 对象，提取 planning/execution time、递归 node type、目标
   relation/index，以及顶层 Plan 的累计 buffer；
3. 接收目标表有界计数、planner setting 和索引元数据结果；
4. 校验三个查询名无缺失、重复或未知项；
5. 按小/大基数规则返回通过，或抛出稳定的门禁错误码。

该模块不连接数据库、不写业务数据，便于 TDD 覆盖边界。

### 受保护 dev 验收

受保护 runner 负责：

1. 校验 dev 数据库目标身份，不在此步骤校验数据库角色；
2. 校验 migration history；
3. 下载指定 artifact，归一化 evidence JSON，并与固定 manifest 精确比较；
4. 以受保护数据库角色开启一个
   `REPEATABLE READ READ ONLY` 事务并设置 5 秒 statement timeout；
5. 在该快照内依次验证事务 guard、role RLS bypass 能力、planner settings 和 evidence
   instance 归属；
6. 在该快照内取得三张整表 relation 的有界计数；
7. 在该快照内读取清单全部预期索引的 relation/valid/ready 状态；
8. 在该快照内按固定清单各运行一次默认 planner EXPLAIN；
9. 调用判定模块生成脱敏 summary，提交只读事务；
10. 上传 artifact 并写入发布证据。

重新验收复用已经成功生成的证据批次 `53298aa5-a3f6-45c3-8820-4cbfa15abfdb` 和实例
`158649b4-c356-4b04-abb4-d1d1b65f08d5`，只重跑只读性能门禁，不再次执行 smoke execute，
避免重复生成采购单。

## 错误处理

门禁错误必须使用稳定分类，至少覆盖：

- `INVALID_PLAN`：EXPLAIN JSON 缺字段或类型错误；
- `INVALID_CARDINALITY`：有界计数不是 0 到 1,000 的安全整数；
- `INVALID_EVIDENCE_INPUT`：UUID 非法，或 instance 不属于指定 tenant/batch；
- `INVALID_DEV_TARGET`：数据库不是获授权 dev 目标或角色不能有效绕过 RLS；
- `MIGRATION_HISTORY_MISMATCH`：local/remote migration history 不一致；
- `TRANSACTION_GUARD_INVALID`：事务不是只读可重复读，或检查未共享同一事务；
- `NON_DEFAULT_PLANNER`：planner 来源不受信、出现未登记 boot 偏移，或 EXPLAIN Settings
  不等于当前受管基线；
- `INDEX_METADATA_INVALID`：预期索引缺失、未 ready 或无效；
- `INDEX_RELATION_MISMATCH`：索引不属于清单指定的 `public` relation；
- `MISSING_PLAN`：清单查询缺少计划；
- `DUPLICATE_PLAN`：同一清单查询出现多份计划；
- `UNKNOWN_PLAN`：出现清单外查询名；
- `STATEMENT_TIMEOUT`：任一只读查询返回 PostgreSQL `57014` 且由 statement timeout 取消；
- `PLANNING_THRESHOLD`：规划耗时超限；
- `EXECUTION_THRESHOLD`：执行耗时超限；
- `SHARED_READ_THRESHOLD`：共享读块超限；
- `TEMP_BLOCKS`：使用临时块；
- `LARGE_TABLE_SEQ_SCAN`：大基数目标表出现 Seq Scan；
- `LARGE_TABLE_INDEX_REQUIRED`：大基数查询未命中允许索引。

### 稳定首错顺序

runner 按以下固定顺序执行和判定，PostgreSQL `57014` 在发生步骤立即统一映射为
`STATEMENT_TIMEOUT`：

1. dev 数据库目标身份：`INVALID_DEV_TARGET`；
2. migration history：`MIGRATION_HISTORY_MISMATCH`；
3. artifact 下载、字段归一化、固定 manifest 精确匹配和 UUID：`INVALID_EVIDENCE_INPUT`；
4. 事务 read-only/isolation/同一 backend pid guard：`TRANSACTION_GUARD_INVALID`；
5. 当前数据库角色有效 RLS bypass 能力：`INVALID_DEV_TARGET`；
6. 当前 `pg_settings`：`NON_DEFAULT_PLANNER`；
7. evidence instance 归属：`INVALID_EVIDENCE_INPUT`；
8. 按 manifest 查询顺序校验基数：`INVALID_CARDINALITY`；
9. 按 manifest、再按允许索引声明顺序校验元数据：先 `INDEX_RELATION_MISMATCH`，再
   `INDEX_METADATA_INVALID`；
10. 计划集合：依次检查 `UNKNOWN_PLAN`、`DUPLICATE_PLAN`、`MISSING_PLAN`；
11. 按 `running_instance`、`pending_task`、`subject_state` 顺序解析计划；单个计划先校验
    JSON 结构和 `Settings` 类型，非法时返回 `INVALID_PLAN`；结构合法但 `Settings` 含非默认
    Query Tuning 或 `plan_cache_mode` 时返回 `NON_DEFAULT_PLANNER`；其后依次判定
    `PLANNING_THRESHOLD`、`EXECUTION_THRESHOLD`、
    `SHARED_READ_THRESHOLD`、`TEMP_BLOCKS`、`LARGE_TABLE_SEQ_SCAN`、
    `LARGE_TABLE_INDEX_REQUIRED`。

只有三个清单查询恰好各一份且全部通过，整体门禁才通过。首个错误作为稳定退出码，artifact
同时保留此前已完成的脱敏检查结果。任何错误都不自动重跑随机 key、不删除 Workflow 历史或
采购单。

## 测试与验收

实现遵循 TDD，至少覆盖：

1. 小于 1,000 行、Seq Scan、阈值内时通过；
2. 小于 1,000 行但索引元数据无效时失败；
3. 小于 1,000 行但时延、shared read 或 temp blocks 超限时失败；
4. 等于 1,000 行时进入大基数分支；
5. 大基数 Seq Scan 失败；
6. 大基数未命中允许索引失败；
7. 大基数命中允许索引且阈值内时通过；
8. EXPLAIN 结构不完整时 fail closed；
9. 合法小表 Index Scan 的 index name 被记录且通过，合法 Seq Scan 的 index name 可为空；
10. buffer 仅取顶层 Plan 累计值，不重复汇总子节点；缺失块字段归零，非法块字段失败；
11. 非默认 planner、非法 evidence、非法基数、事务 guard、超时和错误索引 relation 分别
    返回稳定错误码；
12. 三条查询的索引映射不可缺失或串用；缺失、重复或未知计划均失败；
13. 直接 Index Scan/Index Only Scan 与 Bitmap Heap + Bitmap Index 两种命中方式均按定义
    判定，大表其他扫描方式不冒充索引命中；
14. 多个条件同时失败时，稳定首错顺序与规范一致；
15. 事务顺序测试证明 role/settings/count/index/EXPLAIN 使用同一只读可重复读事务。

最小验证包括聚焦单测、API TypeScript 检查、API 构建和文件大小检查。受保护 dev 复测必须
证明：当前 45 行的 `workflow_subject_states` 被分类为 small，0.061ms/2 个命中块/0 个读取块
的 Seq Scan 在索引有效的前提下通过；另外两条查询继续命中既有索引。

## 发布与后续流程

- 本次不新增 migration，不修改数据库数据或索引。
- 更新采购批次 Workflow release runbook，明确 1,000 行分层规则和共同阈值。
- 更新 dev 发布证据，记录 main commit、受保护 run、三表基数、计划摘要与门禁结论。
- 性能门禁通过后，继续旧 `/review` 与新 task complete 的负向矩阵，再交由 Orange 真机验收。
- Orange 仓库保持只读；小程序接口契约无需调整。

## 非目标

- 不把 1,000 设为业务数据上限。
- 不强制小表使用索引。
- 不通过增加无业务意义 fixture、修改 planner 参数或手工运行 DDL 获得通过结果。
- 不在本次顺手重构通用 Workflow、采购服务或现有 EXPLAIN 工具。
