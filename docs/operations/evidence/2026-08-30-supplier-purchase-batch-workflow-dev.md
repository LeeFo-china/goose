# 采购批次审批 dev 发布证据（待 Task13 完成）

## 当前结论

- 记录日期：2026-08-31（文件名沿用 Task12 计划日期）。
- 分支：`feat/supplier-purchase-batch-workflow-design`。
- Task12 开始前基线：`3841a2c698aad53a19be9529c4cd2c57c9874b29`。
- 当前仅形成隔离 clone 与本地工具证据；未获得已授权 dev 发布凭据，未发布 API/Admin、
  未开启 dev tenant flag、未生成 dev execute requestId。不得把本文件视为 dev 已验收。
- `apps/api/src/types/database.ts` 未手改；正式生成只能在 migration history 对齐环境使用
  仓库官方命令。

类型基线门禁已在未加本轮 migration 的 disposable production-schema clone 上，以真实
`supabase gen types typescript --db-url ... --schema public,graphql_public` 执行。即使 schema
参数与当前文件一致，机械结果仍有 14 行既有差异，其中 clone 的 `public.ai_models` 缺少当前
文件中的 `category_id`，`graphql_public` 生成片段也不完全一致。这是本任务之外的既有
schema/type 漂移，因此 Task12 没有继续生成本轮类型、没有覆盖文件。Task13 必须在同一
显式 dev DB 目标 migration 对齐后执行官方生成、解释全部 diff，并把生成提交的 API
typecheck/build 作为 API 发布前硬门禁。

## 已完成自动化证据

命令：

```bash
cd apps/api
bun test src/services/supplier-purchase-batch-workflow-database.test.ts \
  src/scripts/supplier-purchase-batch-workflow-smoke.test.ts
```

当前结果：聚焦 smoke 6 pass、0 fail、38 assertions；数据库矩阵 1 pass、0 fail、16
assertions。数据库测试从真实本地 production schema 只克隆 schema 到随机一次性数据库：
基线态会按需加载已在 main 的 `20260830100000` 前置和本功能 10 条 migration，HEAD 态跳过
非幂等重放并验证最终对象，混合态 fail closed。测试结束必须成功 drop 一次性数据库；没有
修改正式 local/dev 数据。
修复 smoke execute 在并发预算快照与最终审批之间引入 commitment 的 fixture 顺序问题后，
数据库矩阵连续运行 3 次均为 1 pass、0 fail、16 assertions，且没有遗留一次性数据库或
race 临时日志。

覆盖摘要：

- 既有 `supplier_purchase_batch_workflow_withdraw_production_fixture.sql`：withdraw 后 draft、
  任务/实例 canceled、预算释放；编辑重提 round+1、旧 task stale；采购驳回后编辑重提；
  cancel 边界。
- Task12 矩阵：额度内采购审批后单供应商单 submitted order；超预算采购审批后无订单、
  财务审批后建单；采购/财务驳回释放预算且无订单；缺采购/财务审批人均返回
  `SUPPLIER_PURCHASE_BATCH_NO_APPROVER` 且无 requisition/commitment/instance/submit event；
  submit replay/conflict；tenant、project scope、assignee、self-review 拦截。
- 双会话对同一最终审批 task 使用不同 key 竞争：恰好一个成功、一个
  `WORKFLOW_TASK_NOT_PENDING`，仅一张订单且仅一条最终 review event。
- DB-first compatibility 在 migration 前先用旧 12 参数签名成功写入旧 fingerprint，应用本轮
  migration 后用相同旧 key/payload 原样 replay；setting version 和 command event 数量均不
  增加。migration 后的新旧签名写入仍委托含 workflow flag 的新 fingerprint。
- smoke 在同一个一次性 clone 上真实运行 dry-run 和 `--execute`；dry-run 检查六级 rollout
  flag、active/published 精确模板解析、两个预算上下文的权威审批候选解析以及项目/目录/预算；
  传入的采购/财务审批人还必须逐节点满足权威 task projection 的固定 employee、role、
  permission 和项目范围规则。clone 中分别把采购节点固定给另一员工、把财务节点固定给另一
  role，均验证 smoke fail closed，而不是因“存在某个候选人”误通过；
  execute 使用显式采购/财务审批人完成最终审批并输出 `supplierCount=1`，且最终订单均为
  `submitted`。save、submit、两级审批分别提交，失败时不由外层事务抹去既有 requestId
  证据。clone 随测试销毁，不计作 dev 证据。

API 静态检查：`pnpm exec tsc -p tsconfig.json --noEmit` exit 0。smoke 脚本单测证明五个
UUID 参数均为必填、默认 dry-run 不调用写路径、execute 使用显式审批人真实完成审批、
所有列表 `LIMIT/pageSize <= 100`、失败输出不包含原始数据库错误或敏感值。

## EXPLAIN 证据边界

一次性 clone 使用 `SET enable_seqscan=off` 执行结构可用性检查，观察到：

- running instance：`workflow_instances_purchase_batch_lookup_idx`；
- pending task：`idx_workflow_tasks_instance_status`；
- subject state batch：`idx_workflow_subject_states_subject`。

该设置只证明索引结构可用，不能代表默认 planner 或 dev 真实基数性能，不作为“无大表
顺扫”的发布结论。Task13 的硬门禁是在授权 dev、只读事务、代表性数据基数、默认 planner
下重跑三条 `EXPLAIN (ANALYZE, BUFFERS)`；未取得该证据前不得扩大灰度。

## Migration 状态与阻塞

相对 main 的实际功能 migration 为 `20260830110000`、`111000`、`112000`、`113000`、
`113500`、`113600`、`113700`、`113800`、`114000`、`115000`，共 10 条。早期计划写
“6 个 migration”已过时，发布以 runbook 的完整文件名为准。

在当前 worktree 执行 `supabase migration list` 返回：

```text
Cannot find project ref. Have you run supabase link?
```

因此没有伪造 Local/Remote 对齐结论，也没有运行 `supabase db push`、手工 DDL/DML 或
正式 type generation。另已知正式 local 存在与本任务无关的 pending migration，Task12
没有尝试推进或修复它们。

Task12 也实际运行了正式 local 的 `supplier-rollout-settings-database.test.ts`：6 个 helper
测试通过，2 个行为测试因该 local 仍只有旧 12 参数 RPC、没有新 13 参数 RPC 和
`purchase_batch_workflow_enabled` 列而失败（只读 catalog 证据为 `t|f|f`）。这不是本次
compatibility migration 在 production-schema clone 上的回归；clone 已分别调用旧/新签名，
证明旧签名保留 workflow flag、新签名正常。禁止为让正式 local 测试变绿而单独重放 migration
或手工 DDL，待 Task13 在同一授权 dev 目标按清单迁移后复验。

## Task13 待补证据

- main 最终 commit，以及 dev database/API/Admin revision；
- dev migration 对齐后的官方 `database.ts` 生成 diff、生成 commit 和 API 检查；
- `supabase db push --dry-run` 的精确 10 条清单和发布后 `migration list` 对齐；
- flag=false 基线、模板/审批人配置审计、flag=true setting version；
- 默认 planner 的只读 dev EXPLAIN 摘要；
- smoke dry-run 输出，以及明确授权后的 execute requestId/batch/round/instance/task/
  budget/order/supplierCount；
- 已发布 dev API 上使用两个不同批次分别调用旧 `/review` 和新 workflow task complete 的
  终态/订单/稳定错误码对照证据；不得用同一批次串行调用两个入口伪造对照；
- Orange 真机验收结论和灰度范围。
