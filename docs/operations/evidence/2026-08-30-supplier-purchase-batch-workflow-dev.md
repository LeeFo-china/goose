# 采购批次审批 dev 发布证据

## 当前结论

- 记录日期：2026-08-31（文件名沿用 Task12 计划日期）。
- 功能与已部署 API/Admin revision：
  `8594acba06d9909419954039c42dd8da7460f613`。
- 功能分支：`feat/supplier-purchase-batch-workflow-design`。
- Task12 开始前基线：`3841a2c698aad53a19be9529c4cd2c57c9874b29`。
- 10 条 migration 已通过受保护 dev workflow 应用，发布后 history 为 550 条、最新
  `20260830115000`、pending 0；API/Admin 已发布并通过健康检查。
- `apps/api/src/types/database.ts` 已在 migration history 对齐的 dev 数据库上，使用官方
  `postgres-meta:v0.96.4` 机械生成并审查，未手改生成结果。
- dev 发布已完成，但租户灰度验收尚未完成：只读检查确认 14 个租户中
  `purchase_batch_workflow_enabled=true` 为 0，且
  `procurement_snapshot_v1_enabled=true AND purchase_batch_workflow_enabled=false` 也为 0。
  因此没有符合 runbook 的内部验收租户，未运行 dev execute、未生成业务批次，也未扩大
  灰度。必须由平台管理员通过现有 Admin/API 完成租户配置；禁止用 SQL 临时开关或造数据。

以下为 Task12 的历史类型基线：当时在未加本轮 migration 的 disposable
production-schema clone 上，以真实
`supabase gen types typescript --db-url ... --schema public,graphql_public` 执行。即使 schema
参数与当前文件一致，机械结果仍有 14 行既有差异，其中 clone 的 `public.ai_models` 缺少当前
文件中的 `category_id`，`graphql_public` 生成片段也不完全一致。这是本任务之外的既有
schema/type 漂移，因此 Task12 没有覆盖文件。Task13 已在同一显式 dev DB 目标 migration
对齐后完成正式生成：最终文件 29,936 行，diff 为 327 additions、20 deletions；新增采购
审批字段/RPC 及此前已发布但旧类型未包含的 supplier command 类型，删除 dev schema 中
从未存在的 `ai_models.category_id` 旧类型。生成后 API typecheck/build 均通过。

## Task13 发布与迁移证据

- migration 预检：[run 33346621490](https://github.com/LeeFo-china/goose/actions/runs/33346621490)，
  精确识别本功能 10 条 pending migration。
- migration apply：[run 33346665362](https://github.com/LeeFo-china/goose/actions/runs/33346665362)，
  history 从 540 增至 550，最新版本为 `20260830115000`。
- migration 发布后复核：
  [run 33346703992](https://github.com/LeeFo-china/goose/actions/runs/33346703992)，pending 0。
- 官方数据库类型生成：
  [run 33347720027](https://github.com/LeeFo-china/goose/actions/runs/33347720027)。生成前再次
  复核 history 550/最新 `20260830115000`/pending 0；生成提交即最终 revision
  `8594acba06d9909419954039c42dd8da7460f613`。
- 最终构建：[run 33348005045](https://github.com/LeeFo-china/goose/actions/runs/33348005045)，
  API、Admin、H5、Web、social-video-worker 全部成功。
- dev 自动发布：[run 33348468012](https://github.com/LeeFo-china/goose/actions/runs/33348468012)，
  API、Admin、H5、Web 及三个 worker 均部署同一 immutable revision
  `8594acba06d9909419954039c42dd8da7460f613`；API/Admin 健康检查均为 HTTP 200。
- API image digest：
  `sha256:0af91ec556824856abb1b5ce87e511b9b5aa716c351ad3e18acc419056b9e082`。
- Admin image digest：
  `sha256:9ebe8bb5c652b496ee38049b29b45a740325709a91a74c8ddfcc3c5d830c2deb`。

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

## dev 租户灰度阻塞

受保护 runner 在临时 ops commit `86127e0f6e3aa0aa55bace04a98874d358d86b22`
运行了只读候选筛选：[run 33349436557](https://github.com/LeeFo-china/goose/actions/runs/33349436557)。
该 run 先再次证明 migration history 为 550、最新 `20260830115000`、pending 0，然后得到：

- dev tenant 总数：14；
- `purchase_batch_workflow_enabled=true`：0；
- `procurement_snapshot_v1_enabled=true AND purchase_batch_workflow_enabled=false`：0；
- 六个采购 rollout flag 全部为 true：0；
- 可进入官方 smoke dry-run 的候选：0。

检查在候选为空时 fail closed；没有调用 save/submit/review RPC，没有生成 `SPBW-SMOKE`
批次、workflow instance、task 或采购单。当前已登录的内部测试租户 setting version 为 6，
其中 module/ownership/private supplier/private catalog 为 true，procurement snapshot/workflow
为 false；租户管理员不能调用平台 rollout 写接口。

随后针对内部测试租户 `3eebca47-961f-4899-b976-a3d3208d326b`，受保护 runner 又执行两轮
强制 `default_transaction_read_only=on` 的分层核查：
[run 33350117862](https://github.com/LeeFo-china/goose/actions/runs/33350117862) 与
[run 33350225028](https://github.com/LeeFo-china/goose/actions/runs/33350225028)。结果证明：

- active definition `bbb1cb91-5976-42d9-8a09-81faa9f9f5d5` 唯一命中，active published
  version 为 `937ef5cf-4fa2-4d24-a06d-391a0f8e302f`，模板本身不是阻塞；
- 共检查 17 个项目，每个项目目录分页均返回 1 个可采购 SKU，三类权限表面计数均为 1；
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 有 1 个有效预算科目，项目
  `b95f6b51-6b9c-4970-948e-b369106545d8` 有 2 个，目录和预算不是当前主阻塞；
- 两个有预算的项目中，申请、采购审批和财务审批的唯一员工都为
  `d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`，两项目
  `separation_of_duties_ready=false`；
- 专用候选组合为 0，权威 workflow preflight 三项均为 false。根因是申请人与审批人没有
  职责分离，不是模板、目录、预算或 migration 缺失。按 self-review 门禁，不能通过开启
  rollout flag 绕过。

解除阻塞必须先为至少一个上述有预算项目配置另一名 active、已绑定用户且不同于申请人的
审批员工。采购审批员工需具备 `supplier.purchase-requisition.approve`、view、project.read
及该项目范围；财务审批员工需具备 `finance.budget.manage`、view、project.read 及该项目
范围。采购与财务可以由同一名第二员工承担，但二者都不能是申请人。职责分离经同一只读
preflight 复核后，再由平台管理员使用现有 Admin/API 按父子顺序开启
`procurement_snapshot_v1_enabled` 与 `purchase_batch_workflow_enabled`，保存审计事件和
setting version。不得直接修改 `tenant_supplier_settings`，不得手工 seed 业务数据。

## 灰度前待补证据

- 职责分离修复后的审批人 preflight、flag=false 基线及 flag=true setting version；
- 默认 planner 的只读 dev EXPLAIN 摘要；
- smoke dry-run 输出，以及明确授权后的 execute requestId/batch/round/instance/task/
  budget/order/supplierCount；
- 已发布 dev API 上使用两个不同批次分别调用旧 `/review` 和新 workflow task complete 的
  终态/订单/稳定错误码对照证据；不得用同一批次串行调用两个入口伪造对照；
- Orange 真机验收结论和灰度范围。
