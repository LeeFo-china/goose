# 晴天客户工作流生产修复证据

## 结论

租户 `3eebca47-961f-4899-b976-a3d3208d326b` 的缺失客户工作流运行时已完成生产回填。
固定审计范围内的 8 个潜在客户均已具备 running 的 `customer_main` 实例、
`potential` pending task、负责人分配或无负责人语义一致的任务，以及同步后的
`workflow_subject_states` 投影。

随后发现“线索转客户”链路绕过上述初始化编排，新增了 1 个缺失运行态的潜在客户。
该入口现已在共享转换服务中修复，新增缺口已通过第二个审计绑定 migration 回填；
截至 `2026-10-01T13:05:20.000Z`，目标租户缺失客户运行态的候选为 0。

本次没有修改 `orange` 仓库，也没有通过脚本 `--apply` 直接写生产数据库。
生产数据写入只通过受保护、可审计的 Supabase migration 完成。

## API 可靠性发布

- API 版本：`v2026.10.01.1`
- Git SHA：`b6bc924c5e4cc4dc75c8d2583e200de93a2eebd3`
- 候选构建 Run：`36833032054`
- 生产部署 Run：`36833699994`
- 部署结果：成功；候选证据、运行时 revision、容器健康、公开端点和部署回执门禁通过。

新建客户链路现在会：

1. 对工作流初始化失败重试一次；
2. 成功后同步 pending task 负责人和 subject projection；
3. 配置缺失或两次失败时返回稳定的 `workflow_initialization=degraded` 元数据；
4. 写入不含姓名、手机号、请求体或完整响应的结构化错误日志。

## 生产 dry-run 审计

- 首次审计 Run：`36834292601`
- `apply`：`false`
- 审计截止时间：`2026-10-01T08:06:46.000Z`
- 扫描客户数：26
- 已有实例并跳过：18
- 精确回填候选：8
- 候选结构：8/8 为 `potential`，映射节点 8/8 为 `potential`，8/8 计划创建 pending task
- 失败、缺失定义、缺失映射节点、非 potential 创建候选：0

## 生产 migration

- Migration 版本：`20261001120000`
- Migration 标签：`v2026.10.01.2`
- Git SHA：`02db840628643a27485a92576b4b530bc206b47c`
- Plan Run：`36834862148`
  - 执行前远端 migration 数：641
  - 待执行数量：1
  - 唯一待执行版本：`20261001120000`
- Apply Run：`36835005304`
  - 应用数量：1
  - 唯一应用版本：`20261001120000`
  - 执行后远端 migration 数：642
  - 执行后最新版本：`20261001120000`

Migration 在单个事务中执行，并在提交前断言：实例数、pending task 数、投影数均为 8，
截止时间内剩余缺失实例的潜在客户数为 0。候选漂移、流程定义/版本/节点/边异常、RPC
失败、任务或投影计数异常都会导致整笔回滚。

## 回填后验收

- 回填后 dry-run Run：`36835166175`
  - 扫描客户数：26
  - `dry_run_create`：0
  - running instance：13，其中回填潜在客户 8
- 详情读路径 Run：`36835575826`
  - 回填客户检查数：8
  - `instance_status=running`、`current_node_key=potential`、`pending_task_count>=1`：8/8
  - `actions` 包含 `business_action=start_following`：8/8
  - 输出只包含聚合计数，不包含客户 ID 或个人信息。

自动化回归同时验证 `start_following` 会把客户状态和工作流当前节点从 `potential`
推进到 `following`。在业务方明确指定允许变更状态的客户之前，没有自动选择或推进
任何真实客户；获批后的真实闭环结果记录如下。

## 生产真实 `start_following` 闭环

- 用户另行明确指定了一个允许改变业务状态的生产客户。
- 受保护验收 Run：`36853594414`
- 执行入口：生产已部署 API 的 `POST /workflow-tasks/:id/complete`
- 执行前：客户 `status=potential`，实例 `running`，当前节点 `potential`，pending task 数为 1。
- Mutation：HTTP 200。
- 执行后：客户 `status=following`，实例仍为 `running`，当前节点 `following`，原
  `potential` task 为 `completed`，详情不再返回 `start_following`。
- 目标客户 ID 仅通过临时 production environment secret 注入；Run 完成后 secret 已删除，
  仓库、工作流输入、步骤摘要和私有证据均未记录客户 ID 或个人信息。

## 线索转客户链路补充修复

### 根因与代码发布

- 根因：直接新建客户会调用 `customerWorkflowInitializationService`，但普通线索与抖音
  线索共享的 `TenantDouyinLeadsService.convert` 在 RPC 创建或关联客户后直接返回，
  没有初始化 `customer_main`。小程序保存跟进后拿不到 `start_following`，因此客户仍
  停留在 `potential`。
- 修复提交：`403bc5182fa8a8f3d4cfbcb0f6e2e23fe349eff3`
- 生产标签：`v2026.10.01.4`
- 候选构建 Run：`36863934359`
- 生产部署 Run：`36864638041`
- 行为：转换成功后读取精确的租户内客户；仅 `potential` 客户进入幂等初始化；已推进
  客户不重置节点；缺失、跨租户或无状态响应失败关闭；初始化重试后仍降级则返回稳定
  `503` 和 `CUSTOMER_WORKFLOW_INITIALIZATION_FAILED` 或
  `CUSTOMER_WORKFLOW_CONFIGURATION_MISSING`，不再静默成功。
- 普通线索和抖音线索共用同一修复；对外成功响应结构未增加字段，兼容现有严格客户端
  schema。

### 冻结审计与 migration

- 部署后 dry-run Run：`36865046600`
- 审计截止时间：`2026-10-01T12:55:44.000Z`
- 扫描客户数：27
- running instance：13
- 精确候选：1，且为 `potential`，计划创建 `potential` pending task
- 历史 8 个回填客户：状态/节点一致 8/8；其中仍为 `potential` 的 6 个客户均返回
  `start_following`。审计不再把已经正常推进到后续节点的客户误判为失败。
- Migration：`20261001130000_backfill_lead_converted_customer_workflow.sql`
- Migration 提交：`8a5eea0768f5702e78fde22ccbdd2b1585514aba`
- Plan Run：`36865521815`，远端版本数 642，唯一待执行版本
  `20261001130000`。
- Apply Run：`36865831419`，仅应用 `20261001130000`；远端版本数由 642 变为
  643，最新版本为 `20261001130000`。
- 应用后 migration list 等价校验 Run：`36866276410`，远端版本数 643，
  `pending_count=0`，Local/Remote 已对齐。

Migration 固化 tenant、审计截止时间和候选数量 1；校验唯一启用并发布的
`customer_main`、`start -> potential -> following` 图结构、RPC 返回、任务负责人、
主体投影及最终计数。候选漂移或任一断言失败会使整个事务回滚。

### 回填后验收

- 回填后 dry-run Run：`36866161675`
- 扫描客户数：27
- running instance：14
- `customer.dry_run_create`：0
- 各状态缺失定义、缺失映射、创建失败：0
- 历史 8 个客户详情校验：`ready=8`；其中 `potential=6`、
  `startFollowing=6`。

## 小程序对接结论

小程序不需要通过重新发布来修复历史数据，也不应自行合成 `start_following`。客户详情页
继续以后端 `workflow_state.actions` 为唯一动作来源：当后端返回 `start_following` 时展示
“开始跟进”；动作完成后重新拉取详情，并确认客户状态与工作流节点均为 `following`。
线索转客户成功后可以直接进入上述详情流程；若转换接口返回工作流初始化相关 `503`，
使用同一 `idempotency_key` 重试转换，不要在小程序本地直接修改客户状态。
