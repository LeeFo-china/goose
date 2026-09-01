# 采购批次审批 dev 发布证据

## 当前结论

- 记录日期：2026-09-01（文件名沿用 Task12 计划日期）。
- 当前已部署 API revision：`812cd9766e79e7b318ce2a81b1081054d3a1d083`；本轮 Admin、
  Web、H5 未命中构建/发布，本证据不更新其部署 revision。API revision 的受保护 dev
  EXPLAIN 基数门禁已通过。
- 功能分支：`feat/supplier-purchase-batch-workflow-design`。
- Task12 开始前基线：`3841a2c698aad53a19be9529c4cd2c57c9874b29`。
- 10 条 migration 已通过受保护 dev workflow 应用，发布后 history 为 550 条、最新
  `20260830115000`、pending 0；API/Admin 已发布并通过健康检查。
- `apps/api/src/types/database.ts` 已在 migration history 对齐的 dev 数据库上，使用官方
  `postgres-meta:v0.96.4` 机械生成并审查，未手改生成结果。
- 单个内部 dev 租户灰度验收已完成：目标租户当前 setting version 为 10，
  `procurement_snapshot_v1_enabled=true`、`purchase_batch_workflow_enabled=true`。
- flag=false 旧 `/review` 基线、受保护 dry-run/execute、两个独立批次的新旧审批入口对照，
  以及 version/round/self-review/completed-task/idempotency 稳定错误码均已通过。
- 本轮没有扩大租户灰度；后端已具备 Orange 真机验收条件，剩余项仅为小程序端真机结论与
  最终灰度范围。

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

## EXPLAIN 证据

一次性 clone 使用 `SET enable_seqscan=off` 执行结构可用性检查，观察到：

- running instance：`workflow_instances_purchase_batch_lookup_idx`；
- pending task：`idx_workflow_tasks_instance_status`；
- subject state batch：`idx_workflow_subject_states_subject`。

该设置只证明索引结构可用，不能代表默认 planner 或 dev 真实基数性能，不作为“无大表
顺扫”的发布结论。正式证据已由授权 dev runner 在只读事务、真实 dev 基数与受控 planner
设置下取得：

- 最终实现 revision：`812cd9766e79e7b318ce2a81b1081054d3a1d083`；
- 最终构建：[run 33423091122](https://github.com/LeeFo-china/goose/actions/runs/33423091122)，
  成功；
- dev 自动发布：[run 33423332354](https://github.com/LeeFo-china/goose/actions/runs/33423332354)，
  成功发布上述 immutable revision 的 API 与命中的 workers；Admin、Web、H5 未命中；
- 受保护 EXPLAIN 门禁：
  [run 33423552325](https://github.com/LeeFo-china/goose/actions/runs/33423552325)，成功；
  migration history aligned、目标 migration present，三条查询均满足 execution、planning、
  shared read、temp block 与 statement timeout 阈值；
- 脱敏 artifact：
  `supplier-purchase-workflow-explain-812cd9766e79e7b318ce2a81b1081054d3a1d083`
  （artifact ID `9769843242`），仅包含 `migration-evidence.json` 和
  `workflow-explain-summary.json`，不含数据库 URL、业务 UUID、原始执行计划或密钥。

最终摘要：

| 查询 | 基数分档 | Planning | Execution | shared hit/read | 计划节点 / 索引 |
| --- | --- | ---: | ---: | ---: | --- |
| pending task | 211 / small | 0.763 ms | 0.071 ms | 11 / 0 | Limit、Incremental Sort、Index Scan；`idx_workflow_tasks_instance_status` |
| running instance | 59 / small | 2.121 ms | 0.036 ms | 1 / 0 | Limit、Index Only Scan；`workflow_instances_purchase_batch_lookup_idx` |
| subject state | 45 / small | 0.076 ms | 0.025 ms | 2 / 0 | Limit、Seq Scan |

门禁阈值为 execution 250 ms、planning 50 ms、shared read 20,000、temp read/write 0、
statement timeout 5,000 ms。`subject state` 只有 45 行，属于门禁明确允许的小基数范围；其
Seq Scan 未触发“大基数顺扫”拒绝条件，且耗时与 buffer 均在阈值内。

门禁修复链路保留如下，所有诊断均为受保护、只读执行：

- [run 33398905613](https://github.com/LeeFo-china/goose/actions/runs/33398905613)
  因查询不存在的 `pg_roles.rolbypassrl` 返回 `DATABASE_FAILURE`；revision
  `2b276b5a` 改为读取真实角色字段并消除该根因；
- [run 33401640537](https://github.com/LeeFo-china/goose/actions/runs/33401640537)
  因 dev 管理的 `effective_cache_size` 与 PostgreSQL boot 值不同而返回
  `NON_DEFAULT_PLANNER`；[诊断 run 33418391961](https://github.com/LeeFo-china/goose/actions/runs/33418391961)
  确认 current `128MB`、raw `16384`、boot `524288`、source `configuration file`，
  revision `6f548398` 将这个精确元组登记为受控基线，并继续拒绝其他漂移；
- [run 33421542006](https://github.com/LeeFo-china/goose/actions/runs/33421542006)
  因 EXPLAIN `Settings` 还包含平台管理的 `search_path` 而返回
  `NON_DEFAULT_PLANNER`；[诊断 run 33421831850](https://github.com/LeeFo-china/goose/actions/runs/33421831850)
  与 [run 33422018634](https://github.com/LeeFo-china/goose/actions/runs/33422018634)
  确认 current/raw 为 `\"\\$user\", public, extensions`、boot 为
  `\"$user\", public`、source 为 `user`，revision `812cd976` 只登记该精确元组。

最终实现仍会拒绝错误路径、错误 source、附加 schema，以及任何未登记的 planner 设置；
`source=user` 没有被泛化放行。此次门禁修复未增加 migration、未改变 API 契约，也未改动
Orange 仓库。

## dev 租户灰度前置排查（历史）

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

第三轮强制只读核查
[run 33350486669](https://github.com/LeeFo-china/goose/actions/runs/33350486669) 进一步确认租户
共有 9 名 active、已绑定用户的员工，因此不需要为 smoke 新建员工。最小权限变更候选为
`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`：该员工在两个有预算项目上已经具备
`project.read` 和 `finance.budget.manage`，当前只缺
`supplier.purchase-requisition.view` 与 `supplier.purchase-requisition.approve`。为上述
两个权限配置项目范围后，该员工可同时作为采购与财务审批人，并与申请人
`d8ecc522-e6a1-49d6-b7b7-aaa0f3084826` 保持职责分离。

随后使用现有 Admin/API 完成最小、可回退的租户侧配置，未直接修改数据库：

- 在项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 新增员工
  `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` 为非主责 `material_manager`，成员记录为
  `d8eb50d6-09cc-4aa5-808b-320ed5fbac7c`；
- 员工原有共享角色 `finance_base` 未修改；只新增
  `supplier.purchase-requisition.view`（permission
  `68dd5fc7-edf1-4f5a-9bf3-fb629643a57d`）和
  `supplier.purchase-requisition.approve`（permission
  `385c284a-5522-4aa5-a1f5-0490571dc1c8`）两条员工级 `allow + assigned` override；
- API 回读确认两条 override 和项目成员记录均存在。受保护、强制只读复测
  [run 33351018785](https://github.com/LeeFo-china/goose/actions/runs/33351018785) 得到专用候选
  组合 1，选中申请人 `d8ecc522-e6a1-49d6-b7b7-aaa0f3084826`、采购/财务审批人
  `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`；purchase、finance、all candidates 三项
  preflight 均为 true，`prerequisites_ready_without_rollout=true`。

租户侧职责分离阻塞已消除。以下平台 rollout 阻塞是当时的历史状态：setting version 为 6，
snapshot 与 workflow 均为 false；租户管理员访问平台设置接口返回 HTTP 403
`PLATFORM_STAFF_REQUIRED`。后续平台管理员通过现有 API 完成开关与审计，未直接修改
`tenant_supplier_settings`，实际验收见下一节。

## 2026-09-01 单租户 dev API 验收

### Rollout 与受保护 smoke

- 平台 rollout 审计 `9582dc80-654d-4bbb-affb-2c5b704561e2` 将 setting version 从 6 更新为
  7，开启 `procurement_snapshot_v1_enabled`；审计
  `0f87c7dd-9b75-42e4-8a12-9ab72b898c5d` 将 version 从 7 更新为 8，开启
  `purchase_batch_workflow_enabled`。两次变更均通过现有平台 API 完成。
- 受保护 [run 33359680214](https://github.com/LeeFo-china/goose/actions/runs/33359680214)
  artifact `supplier-purchase-workflow-acceptance-9d02854a88d5ca83a2f883b923de1ffcd7d49bd3`
  （artifact ID `9746296599`）保留了 rollout、dry-run、execute 和 EXPLAIN 脱敏证据。
- dry-run requestId 为 `ca23bf7c-b19a-4531-93c5-90b0e522ceea`，mode 为 `dry-run`，预算为
  `preflight_ready`，未生成批次、订单或任务。
- execute requestId 为 `51c180a5-24fb-4392-b5ea-11b3633c187a`，生成批次
  `53298aa5-a3f6-45c3-8820-4cbfa15abfdb`、round 1、实例
  `158649b4-c356-4b04-abb4-d1d1b65f08d5`、任务
  `32e4f511-7fa2-4f34-a3ec-36c5991ee38d` 和 submitted 订单
  `34285e7f-8efd-4883-b6e1-ff4f052a990b`；预算 `within_budget`、supplierCount 为 1，最终
  workflow completed、pending task 为 0。
- 该 run 的业务 dry-run/execute 成功，但旧门禁把仅 1 行命中的
  `workflow_subject_states` `Seq Scan` 直接判失败，所以 workflow 总结为 failure。后续受保护
  [run 33423552325](https://github.com/LeeFo-china/goose/actions/runs/33423552325) 已按小基数、耗时
  和 buffer 边界完成最终 EXPLAIN 验收；不是业务写入或审批失败。

### flag=false 兼容基线

- 为补齐旧入口基线，通过平台 API 暂时将 version 8 更新为 9、workflow true 更新为 false，
  审计 ID `40ce0be3-f122-4cf1-a194-86ca09e65ca5`；旧 `/review` 验收完成后立即将 version 9
  更新为 10、workflow false 恢复为 true，审计 ID
  `22581653-2404-4900-ab71-96608ee7ae56`。snapshot 始终为 true。
- flag=false 批次 `bc479d34-733a-46f2-a201-6c6d92d0a5d0` 通过旧 `/review` 完成超预算授权，
  终态 `ordered`、approvalRound 0、无 workflow instance，生成唯一 submitted 订单
  `46da71eb-bd0c-4fe2-9ea7-0fd9b3459b4b`；在 flag=false 回读时响应省略
  `workflow_state`，符合兼容契约。
- save/submit/review/restore 均使用包含批次 ID 的固定 idempotency key。成功响应契约没有
  requestId 字段或响应头，因此该路径以 idempotency key、批次、订单和 rollout 审计作为
  可复核标识。

### 新旧审批入口对照

为保证对照有效，两个入口使用同一项目、SKU、预算科目、数量和供应商，但使用两个独立批次
及独立 idempotency key。项目 `b95f6b51-6b9c-4970-948e-b369106545d8` 通过现有 API 增加审批
员工为非主责 `material_manager`，成员记录
`8f05fa8a-0e85-4fa4-bdf4-9fca373ff2cd`；这是为 Orange 真机 smoke 保留的可回退 dev 配置。

| 入口 | 批次 | task | 订单 | 终态 |
| --- | --- | --- | --- | --- |
| 旧 `/supplier-purchase-batches/:id/review` | `3beceea6-e677-4544-8aeb-e308b0e3a5e6` | `9682de11-4b79-4d80-84a1-a4416c30c792` | `83503392-4237-49b9-a66e-a0bcd4c8344d` | ordered / within_budget / round 1 / workflow completed / pending 0 / submitted |
| 新 `/workflow/tasks/:id/complete` | `a5ab42f4-44db-4720-964c-2e482c9a1781` | `5409e3b1-24ff-47e1-9f80-ebce72b2e8b2` | `ded92eb4-9472-41f3-b2d6-faa8f4140736` | ordered / within_budget / round 1 / workflow completed / pending 0 / submitted |

两个入口分别使用完全相同 key/payload 重放，均返回原订单且没有新增订单，证明兼容桥与统一
task complete 具备一致的幂等终态。

### 稳定错误码与清理结果

| 场景 | HTTP / code | requestId |
| --- | --- | --- |
| 旧入口 stale version | 409 / `SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT` | `req-133` |
| 新入口 stale round | 409 / `SUPPLIER_PURCHASE_BATCH_APPROVAL_ROUND_STALE` | `req-13j` |
| 旧入口 self-review | 409 / `SUPPLIER_PURCHASE_BATCH_SELF_REVIEW` | `req-13s` |
| 新入口 self-review | 409 / `SUPPLIER_PURCHASE_BATCH_SELF_REVIEW` | `req-142` |
| 旧入口重复完成 task | 409 / `WORKFLOW_TASK_NOT_PENDING` | `req-146` |
| 新入口重复完成 task | 409 / `WORKFLOW_TASK_NOT_PENDING` | `req-147` |
| 新入口同 key 不同 payload | 409 / `SUPPLIER_IDEMPOTENCY_CONFLICT` | `req-148` |

负向校验使用的四个批次在取得错误证据后均由正确审批人完成。最终回读确认本轮新增的 7 个
证据批次全部为 `ordered`，每个批次恰好一张 submitted 订单；申请人与审批人的 pending
workflow task 均为 0。setting 最终为 version 10、snapshot/workflow 均为 true。

dev 中另有一个 2026-08-30 已存在的旧批次
`5eb8312b-27a4-4fd0-ba1b-27a4b94515ec` 仍为 `pending_approval`，approvalRound 0、没有
workflow instance/task/order。它早于本轮验收且不属于本轮证据，未擅自取消或删除。

本轮 API 验收没有新增 migration、没有调整接口契约、没有修改 Orange 仓库，也没有扩大到
其他租户。

## 扩大灰度前待补证据

- Orange 真机验收结论和最终灰度范围。
