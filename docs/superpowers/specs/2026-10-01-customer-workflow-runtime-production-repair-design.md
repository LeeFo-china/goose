# 客户工作流运行态生产修复设计

## 背景与目标

生产环境已经修复客户与项目串联问题，但河南晴天装饰工程有限公司租户
（`3eebca47-961f-4899-b976-a3d3208d326b`）仍有潜在客户没有
`customer_main` 运行实例。客户详情因此返回空运行态，客户端无法取得
`start_following`。

本次目标分为两个部分：

1. 审核并修复该租户已有客户缺失的工作流实例、当前节点待办和主体投影。
2. 修复新建客户链路，避免工作流初始化失败后无告警地返回成功。

不在客户详情读取路径自动创建或修复工作流数据；读取继续保持无副作用。

## 已确认根因

`CustomerController.create` 在客户创建后调用
`customerWorkflowRuntimeService.syncCustomerCreated`。该方法把异常及
`start_workflow_instance` 失败转换为 `failed` 或 `skipped` 元数据，调用方仅在
返回实例 ID 时同步主体投影，对其他结果不报错、不重试、不记录稳定告警，也不向
调用方返回降级状态。因此客户主记录可以创建成功，而工作流运行态永久缺失。

此外，`start_workflow_instance` 创建的待办默认没有客户负责人；现有新建链路没有
像负责人变更链路一样补充待办分配。

本地 `.env.local` 指向已退役的开发环境，不能用于生产审核。生产数据库审核必须在
受保护的生产 Runner `gooes-prod-vm-0-3` 上执行。

## 方案选择

采用“现有脚本审核、migration 正式修复”的方案：

- 生产 dry-run 使用现有
  `backfill-workflow-runtime-from-state-machine.ts`，限制租户和
  `--subject-type customer`。
- 不在生产运行该脚本的 `--apply`。它按实例、节点、待办、日志、主体投影顺序发起
  多次写入，不能保证整个候选集合或单个主体整体回滚，并且不符合仓库禁止手工远端
  DML 修库的规则。
- 正式数据修复使用租户定向、幂等、可审计的 migration，复用数据库已有的原子
  `start_workflow_instance` 函数。
- 应用代码增加有限重试、待办负责人同步、主体投影同步和明确告警。

不引入队列、Redis、新 Worker 或新依赖。

## 生产审核工作流

新增手动触发的生产审核工作流，只允许 `dry-run`：

- 固定运行于 `[self-hosted, Linux, X64, gooes-prod-deploy]` 和
  `production` environment。
- 校验 Runner 名称必须为 `gooes-prod-vm-0-3`。
- 输入必须精确匹配目标 tenant ID，并要求确认文本
  `确认审核客户工作流回填`。
- 校验 `gooes-api` 容器健康、运行镜像 revision 为预期提交。
- 在当前 API 容器内运行现有回填脚本，参数固定为
  `--subject-type customer --dry-run`。
- 报告写入临时目录并上传为短期 GitHub Actions artifact，不提交生产客户 ID 到
  Git 仓库，也不在 Job Summary 输出完整客户明细。
- 同时执行只读 SQL 预检，确认目标租户唯一且启用、`customer_main` 唯一启用版本
  存在、首个业务节点为 `potential`、存在 `potential -> following` 边。

审核报告至少统计：

- 扫描客户总数；
- 各客户状态下计划创建数量；
- 已有 running instance 数量；
- 已有非 running instance 而被跳过的数量；
- 缺少定义、缺少映射节点及其他失败数量；
- 计划创建 pending task 的数量。

任何配置缺失、候选失败或生产版本不匹配均阻断后续 migration。

## 生产数据修复 migration

审核通过后增加一个仅针对目标租户潜在客户的数据 migration。现有
`start_workflow_instance` 总是从流程起点进入 `potential`，不能用它直接重建
`following` 等中间状态。因此本次 migration 只处理 `status=potential`；若 dry-run
发现其他状态也缺少实例，必须阻断本次数据 apply，并另行设计相应状态的重建方案，
不能错误地把它们全部放回 `potential`。

migration 必须：

1. 若目标租户不存在则安全 no-op，便于其他环境执行。
2. 若目标租户存在，则要求恰好一个启用的 `customer_main` 定义和有效的 active
   version；配置不满足时抛错并整体回滚。
3. 校验 active snapshot 包含 `potential` 节点，且 start 节点指向
   `potential`、`potential` 指向 `following`。
4. 只选择 `status=potential`、创建时间不晚于 dry-run 审核截止时间、并且没有任何
   `customer_main` 实例的客户；不得覆盖、取消或删除已有运行或历史实例。
5. migration 内固化 dry-run 审核得到的候选数量，并在写入前再次断言；数量变化时
   抛错，要求重新审核，而不是扩大修复范围。
6. 对每个候选调用 `start_workflow_instance`。返回失败时抛错，使 migration 整体
   回滚。
7. 对 running instance 的 pending task 设置
   `assignee_employee_id = customers.owner_id`；客户无负责人时保留为空。
8. 从实际 instance 和 pending task 计数幂等 upsert
   `workflow_subject_states`。
9. 在 migration 内核对创建实例数、待办数、主体投影数与审核候选数一致；不一致时
   抛错回滚。

migration 不删除任何客户、实例、任务或历史日志。回滚采用前向修复：先停止后续客户
写入或回退 API，再通过新 migration 处理错误运行态；禁止手工删除已创建的业务事实。

## 新建客户链路修复

新增聚焦的客户工作流初始化编排服务：

1. 第一次调用 `syncCustomerCreated`。
2. 对异常或可重试的启动失败执行一次幂等重试；配置缺失不做无意义重试。
3. 启动成功或发现已有 running instance 后，将当前节点 pending task 分配给客户
   负责人，并同步 `workflow_subject_states`。
4. 最终失败时返回稳定告警结果：
   - `CUSTOMER_WORKFLOW_CONFIGURATION_MISSING`
   - `CUSTOMER_WORKFLOW_INITIALIZATION_FAILED`
5. Controller 使用 request logger 写 `error` 级结构化日志，包含 request ID、tenant
   ID、customer ID、初始化原因和尝试次数，不记录手机号、客户姓名或完整响应。
6. 客户创建响应增加向后兼容的 `workflow_initialization` 字段。成功时为
   `ready`，失败时为 `degraded` 并带稳定错误码。已有客户端忽略新增字段不受影响。

客户主记录已经提交后不返回通用 5xx，避免客户端重试造成重复客户；通过明确响应告警、
服务端 error 日志和后续受控修复消除“静默成功”。

## 测试与验证

代码测试采用 TDD，至少覆盖：

- 首次初始化成功；
- 首次临时失败、第二次成功；
- 配置缺失不重试并返回稳定告警码；
- 两次均失败时返回稳定告警码；
- 成功后 pending task 分配给客户负责人；
- 成功后主体投影为 `running / potential / pending_task_count >= 1`；
- Controller 在降级结果下输出结构化 error 日志并返回
  `workflow_initialization=degraded`；
- `potential` 待办动作包含 `start_following`；
- 完成 `start_following` 后客户业务状态和 workflow 当前节点均为 `following`。

生产验收分两层：

1. 数据修复后只读抽查目标客户详情：
   `instance_status=running`、`current_node_key=potential`、
   `pending_task_count>=1`，动作包含 `start_following`。
2. 真实 `start_following` 写入只对用户另行指定、允许改变业务状态的客户执行；未指定
   前不擅自推进真实客户。

执行顺序为：

1. 先发布初始化重试、告警、负责人分配、增强 dry-run 报告及受保护审核工作流，阻止
   新的静默缺口继续产生。
2. 在已发布的新 API 容器上执行生产 dry-run，记录审核截止时间与候选数量。
3. 根据审核结果创建并审查定向 migration；运行 production migration plan 后 apply。
4. 应用后运行 `supabase migration list`，确认 Local/Remote 对齐，再执行详情只读抽查和
   第二次 dry-run；第二次候选数量必须为 0。

发布前运行相关单测、API typecheck、build、文件大小检查。API 发布与 migration apply
分别使用现有不可变生产候选和生产数据库工作流，并复核公网健康状态。

## 前后端责任边界

gooes 负责生产数据审核、migration 回填、新建客户初始化可靠性和接口运行态契约。
orange 不需要通过重新发布解决存量数据，也不得自行合成 `start_following`；继续只消费
后端 `workflow_state.actions` 并在运行态缺失时失败关闭。orange 仓库在本任务中保持
只读。

## 资料与限制

本设计依据当前代码、以下本地文档和只读 orange 交接文档：

- `docs/state_machine_migrate/audit/2026-06-17-customer-workflow-initialization-verification.md`
- `docs/superpowers/plans/2026-06-17-customer-workflow-initialization.md`
- `orange/docs/2026-09-30-customer-workflow-cross-project-backend-handoff.md`

GoodCMS LightRAG 查询连续两次登录超时，未将 RAG 结果作为设计依据；若后续恢复，应以
当前仓库实现为准并仅作为历史资料补充。
