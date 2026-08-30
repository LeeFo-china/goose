# 采购批次审批发布操作手册

## 范围与停止条件

本手册仅用于 `supplier_purchase_batch_approval` 通用审批、采购批次专用提交/审批/撤回
RPC、API/Admin 和租户灰度发布。Orange 仓库只读，不在本流程修改。

出现以下任一情况立即停止：发布 commit 未冻结、dry-run 清单含未审查 migration、目标
Local/Remote history 不一致、默认模板或审批人不完整、API/Admin revision 不可追溯、
默认 planner EXPLAIN 有大表顺序扫描，或 flag=false 基线失败。禁止手工远端 DDL/DML，
禁止手改 `apps/api/src/types/database.ts`，禁止删除 workflow 历史或已生成采购单。

## 1. 冻结版本和迁移清单

```bash
git switch main
git pull --ff-only
git status --short
git rev-parse HEAD
git log -1 --oneline
```

记录 main commit。工作区必须为空。本功能相对 main 的实际清单为以下 10 条，而不是早期
计划草案中的 6 条；顺序不可调整：

1. `20260830110000_add_supplier_purchase_batch_workflow_foundation.sql`
2. `20260830111000_extend_supplier_workflow_rollout_command.sql`
3. `20260830112000_seed_supplier_purchase_batch_workflow.sql`
4. `20260830113000_create_supplier_purchase_batch_workflow_submit.sql`
5. `20260830113500_list_supplier_purchase_batch_workflow_projection.sql`
6. `20260830113600_list_accessible_supplier_purchase_batch_workflow_tasks.sql`
7. `20260830113700_fix_supplier_purchase_batch_workflow_task_pagination.sql`
8. `20260830113800_fix_supplier_purchase_batch_budget_preflight.sql`
9. `20260830114000_create_supplier_purchase_batch_workflow_review.sql`
10. `20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql`

一次性 production-schema clone 还会加载已在 main 的前置
`20260830100000_standardize_new_tenant_organization_template.sql`，它不属于本次待发布清单。

## 2. 只读预检与 migration dry-run

在已授权、已 link 的 dev 环境运行；不要打印数据库 URL：

```bash
supabase --version
supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list
```

dry-run 必须只列出上面的 10 条。若同时出现非事务 migration，按
`docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md` 使用既定发布
workflow，不得用 CLI 绕过并发索引规则或手工登记 history。正式应用前保存脱敏清单。

## 3. 发布数据库、API 和 Admin

1. 通过既定 dev database migration workflow 应用审查后的清单。
2. 再运行 `supabase migration list`，确认 Local/Remote 精确对齐并保存输出摘要。
3. 在这个已对齐环境运行仓库官方 `gen` 命令，机械生成 `database.ts`；审查 diff 仅来自
   已发布 migration，运行 API typecheck/build 后提交生成文件。任何既有 schema 漂移都必须
   先解释，禁止手工修类型或夹带无关大范围 diff。这是 API 发布前硬门禁。
4. 记录包含官方生成类型的最终 main commit，发布该 commit 的 API 与 Admin；记录两个
   revision、构建时间和健康检查结果。
5. 不开启任何租户的 `purchase_batch_workflow_enabled`，先完成 flag=false 基线。

flag=false 时提交必须继续走旧 RPC；flag=true 时只能走专用 workflow RPC，失败不得回退。

## 4. flag=false 与配置门禁

先用 API/现有 Admin 操作验证旧采购提交、批次列表、权限和 route capability 均正常。
随后只为内部 dev tenant 通过现有 Admin/API：

- 确认 active published `supplier_purchase_batch_approval` 模板及租户绑定；
- 确认采购审批人具备 `supplier.purchase-requisition.approve`、view、project.read 和项目范围；
- 确认财务审批人具备 `finance.budget.manage`、view、project.read 和项目范围；
- 确认申请人、采购审批人、财务审批人均为 active，且申请人与审批人不同；
- 确认项目、SKU、供货价、成本科目和项目预算可用。

配置不完整时保持 flag=false，不得用 SQL 临时补数据。配置完成后通过租户灰度命令开启
`purchase_batch_workflow_enabled`，保存审计事件和 setting version。

## 5. 默认 dry-run 与显式 execute

先运行不写数据库的 dry-run：

```bash
cd apps/api
bun run supplier:purchase-batch-workflow:smoke -- \
  --tenant-id "$DEV_TENANT_ID" \
  --project-id "$DEV_PROJECT_ID" \
  --applicant-employee-id "$DEV_APPLICANT_ID" \
  --purchase-approver-id "$DEV_PURCHASE_APPROVER_ID" \
  --finance-approver-id "$DEV_FINANCE_APPROVER_ID"
```

输出必须为 `mode=dry-run`、`budgetState=preflight_ready`、空 batch/order/task，且明确无须
清理。只有 dry-run 和权限门禁通过后才追加 `--execute`。execute 会创建固定前缀
`SPBW-SMOKE` 的证据批次，真实完成采购审批，超预算时继续完成财务审批，并验证最终
`ordered`、一供应商一单。记录脱敏的 requestId、batchId、approvalRound、instanceId、
taskIds、budgetState、orderIds、supplierCount 和清理建议。脚本不自动删除证据。

## 6. 数据库矩阵与性能硬门禁

```bash
cd apps/api
bun --env-file=.env test \
  src/services/supplier-purchase-batch-workflow-database.test.ts \
  src/scripts/supplier-purchase-batch-workflow-smoke.test.ts
```

测试在一次性 production-schema clone 上加载真实迁移/RPC。既有 production fixture 明确
覆盖 withdraw、编辑重提、旧 task stale、采购驳回和 cancel；Task12 矩阵补充额度内、
超预算双审批、采购/财务驳回、缺审批人零残留、幂等冲突、tenant/project/assignee/self
越权和双会话审批。

clone 中的 `enable_seqscan=off` EXPLAIN 只证明索引结构可用，不是性能结论。Task13 必须
在已迁移的授权 dev 库、代表性数据基数和默认 planner 下，使用只读事务重新运行三条
`EXPLAIN (ANALYZE, BUFFERS)`：running instance lookup、pending task lookup、subject state
batch lookup。不得设置 `enable_seqscan=off`，不得 seed/写入。保存脱敏的 node type、index
name、planning/execution time 和 buffer 摘要；出现大表 Seq Scan、超时或未命中预期有界
索引即停止发布。

## 7. 验收与扩大灰度

依次验证额度内、超预算、采购/财务驳回、撤回、编辑重提、缺审批人、同 key replay、
并发双审批和越权矩阵。确认预算占用/释放、workflow history、subject state、任务与采购单
一致后，再通知 Orange 做真机验收。Orange 未完成前不得扩大租户灰度，也不得删除旧
`/review` 兼容桥。

## 紧急止血与前向回滚

1. 第一动作是通过现有 Admin/API 将受影响租户
   `purchase_batch_workflow_enabled=false`，记录审计和 setting version。
2. 停止扩大灰度；保留 API requestId、batch/round/instance/task/order 和日志证据。
3. 不回滚或删除 workflow 历史、预算记录、请购单、采购单、command event 和 migration
   history。
4. 根因修复必须用新的前向 migration/代码提交，经同一 dry-run、矩阵和 dev 门禁后发布。
5. 只有代码和数据库兼容性得到确认后才回退 API/Admin revision；禁止手工远端修库。
