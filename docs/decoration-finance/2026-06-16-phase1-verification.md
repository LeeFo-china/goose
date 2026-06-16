# 装修财务一期验收记录

日期：2026-06-16

分支：`feature/decoration-finance-phase1`

## 1. 验收范围

本次验收覆盖装修财务一期已提交内容：

- 财务数据模型和 `finance.*` 权限点。
- `/finance/ledger` 台账接口。
- workflow `payment_collection` 收款节点桥接：创建 confirmed payment、写入财务台账、推进 workflow。
- Admin 财务菜单和 `/finance/ledger` 页面。
- 小程序收款确认对接文档。

## 2. 自动化验证

### 2.1 Focused API Tests

命令：

```bash
cd apps/api
bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-payment-bridge.test.ts src/services/workflow-tasks.test.ts
```

结果：

```text
11 pass
0 fail
26 expect() calls
```

覆盖点：

- 收款节点 action metadata 返回 `payment_status`、`amount`、`paid_at`、`evidence_images`、`remark`。
- `workflowTaskPaymentBridge` 能创建 confirmed payment、写入 ledger、再 complete runtime node。
- 同一 workflow task 重试时复用 existing payment，避免重复入账。
- `workflowTaskService` 会把项目收款节点 completion 分发到 payment bridge。

### 2.2 API Check

命令：

```bash
bun run api:check
```

结果：

```text
tsc -p tsconfig.json --noEmit
bun build src/app.ts --outdir dist --target node
API file size check passed. threshold=500, exemptions=0
```

### 2.3 Admin Check

命令：

```bash
bun run admin:check
```

结果：

```text
admin file size check passed: 475 TS/TSX files <= 500 lines
tsc -p tsconfig.json --noEmit
```

## 3. Migration 状态

命令：

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase migration list
```

初次验收结果：

- Local 和 Remote 对齐。
- `20260616170000` 在 Local 和 Remote 均存在：

```text
20260616170000 | 20260616170000 | 2026-06-16 17:00:00
```

复验时新增并应用验收环境修复 migration：

```text
20260616193000 | 20260616193000 | 2026-06-16 19:30:00
```

该 migration 做了三件事：

- 将 `finance.*` 绑定到 `system_admin` 和 `finance_base`。
- 将项目 `payment_collection` 待办默认投影到 `finance.payment.confirm`。
- 清理 dev/e2e 无效项目 workflow runtime，并把收款 smoke 待办迁移到真实 smoke 项目。

## 4. 服务 Smoke 环境

API 和 Admin 已拉起用于 smoke：

- API：`http://127.0.0.1:3000`
- Admin：`http://localhost:3010`
- Admin 指向：`GOOES_API_BASE_URL=http://127.0.0.1:3000`

注意：

- 根目录 `.env.local` 未包含 `JWT_SECRET`。
- 为了验证受保护接口，本次 API 运行环境叠加了 `apps/api/.env` 中的 API 必需变量，并显式设置 `PORT=3000`。

基础连通性：

```text
GET / -> 200 OK
HEAD /finance/ledger -> 307 /login
```

## 5. 收款闭环 Smoke

### 5.1 待办发现

只读查询发现 1 条 pending 的项目收款待办：

```text
task_id: a5a0f473-467c-4b2c-84a8-218ceb7cf5b1
subject_id: 00000000-0000-4000-8000-460394011082
node_key: payment_stage_1
business_kind: payment_collection
```

通过 API 查询该项目待办：

```http
GET /workflow-tasks?page=1&pageSize=20&subject_type=project&subject_id=00000000-0000-4000-8000-460394011082
```

响应摘要：

```json
{
  "count": 1,
  "rows": [
    {
      "id": "a5a0f473-467c-4b2c-84a8-218ceb7cf5b1",
      "title": "收款",
      "status": "pending",
      "node_key": "payment_stage_1",
      "actions": [
        {
          "key": "complete",
          "domain": "payment_collection",
          "action": "confirm_payment",
          "fields": [
            "payment_status",
            "amount",
            "paid_at",
            "evidence_images",
            "remark"
          ]
        }
      ]
    }
  ]
}
```

### 5.2 完成收款尝试

完成前数据计数：

```text
payments.workflow_task_id = task_id -> 0
finance_ledger_entries.workflow_task_id = task_id -> 0
```

请求：

```http
POST /workflow-tasks/a5a0f473-467c-4b2c-84a8-218ceb7cf5b1/complete
```

请求体摘要：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 1234.56,
    "paid_at": "2026-06-16T12:00:00.000Z",
    "evidence_images": ["smoke://decoration-finance/payment-evidence.jpg"],
    "remark": "Task 6 smoke verification"
  }
}
```

响应：

```json
{
  "success": false,
  "message": "创建收款记录失败",
  "code": "DB_ERROR"
}
```

API 日志根因：

```text
insert or update on table "payments" violates foreign key constraint "payments_project_id_fkey"
Key (project_id)=(00000000-0000-4000-8000-460394011082) is not present in table "projects".
```

失败后数据计数：

```text
payments.workflow_task_id = task_id -> 0
finance_ledger_entries.workflow_task_id = task_id -> 0
```

结论：

- 后端没有产生 partial payment 或 partial ledger。
- 本次无法完成“成功入账、workflow 推进、重复提交幂等”的完整人工 smoke。
- 阻塞原因是现有待办引用了不存在的项目，属于测试数据不满足外键约束。

### 5.3 财务台账权限验证

使用同租户普通 active 员工访问：

```http
GET /finance/ledger?page=1&pageSize=20
```

响应：

```json
{
  "success": false,
  "message": "无权限",
  "code": "FORBIDDEN"
}
```

只读查询确认：

```text
finance.dashboard.view -> role_count 0
finance.expense.pay -> role_count 0
finance.expense.review -> role_count 0
finance.ledger.view -> role_count 0
finance.payment.confirm -> role_count 0
finance.payment.create -> role_count 0
finance.view -> role_count 0
```

结论：

- `finance.*` 权限点已存在且为 active。
- 当前远端数据没有任何角色绑定 `finance.*` 权限。
- Admin 财务菜单和接口权限已经收口，但需要给租户财务角色分配权限后才能真实使用。

### 5.4 验收环境修复和复验

新增 migration：

```text
supabase/migrations/20260616193000_fix_decoration_finance_acceptance_runtime.sql
```

应用前 dry-run：

```text
Would push these migrations:
 • 20260616193000_fix_decoration_finance_acceptance_runtime.sql
```

应用后检查：

```text
20260616193000 | 20260616193000 | 2026-06-16 19:30:00
```

权限绑定复验：

```text
finance.dashboard.view -> finance_base, system_admin
finance.expense.pay -> finance_base, system_admin
finance.expense.review -> finance_base, system_admin
finance.ledger.view -> finance_base, system_admin
finance.payment.confirm -> finance_base, system_admin
finance.payment.create -> finance_base, system_admin
finance.view -> finance_base, system_admin
```

无效项目 workflow runtime 复验：

```text
invalid_project_workflow_count -> 0
```

复验待办：

```text
task_id: a5a0f473-467c-4b2c-84a8-218ceb7cf5b1
subject_id: 00000000-0000-4000-8000-202606160006
project_exists: true
assignee_permission_code: finance.payment.confirm
business_kind: payment_collection
```

使用财务角色员工登录后台：

```text
employee: 小龙女 / 18800005001
role: finance_base
permissions include:
- finance.payment.confirm
- finance.ledger.view
```

完成收款请求：

```http
POST /workflow-tasks/a5a0f473-467c-4b2c-84a8-218ceb7cf5b1/complete
```

请求体摘要：

```json
{
  "action": "complete",
  "reason": null,
  "output": {
    "payment_status": "success",
    "amount": 1234.56,
    "paid_at": "2026-06-16T12:30:00.000Z",
    "evidence_images": ["smoke://decoration-finance/payment-evidence.jpg"],
    "remark": "Task 6 smoke verification after finance permission fix"
  }
}
```

响应摘要：

```json
{
  "message": "success",
  "payment": {
    "id": "7232ab97-cb8f-432d-b077-2303c07eb67c",
    "project_id": "00000000-0000-4000-8000-202606160006",
    "amount": 1234.56,
    "type": "stage_1",
    "status": "confirmed",
    "workflow_task_id": "a5a0f473-467c-4b2c-84a8-218ceb7cf5b1",
    "payment_channel": "manual"
  },
  "result": {
    "ok": true,
    "bridged": true,
    "operation": "confirm_payment"
  },
  "workflow_state": {
    "current_node_key": "tile_work",
    "current_business_kind": "procedure_template",
    "pending_task_count": 1
  }
}
```

完成前后计数：

```text
before: payments 0, ledger_entries 0
after:  payments 1, ledger_entries 1
```

台账接口复验：

```http
GET /finance/ledger?page=1&pageSize=20&project_id=00000000-0000-4000-8000-202606160006
```

响应摘要：

```json
{
  "total": 1,
  "rows": [
    {
      "direction": "in",
      "entry_type": "project_payment",
      "amount": 1234.56,
      "source_type": "workflow_task",
      "source_id": "a5a0f473-467c-4b2c-84a8-218ceb7cf5b1",
      "workflow_task_id": "a5a0f473-467c-4b2c-84a8-218ceb7cf5b1",
      "payment_id": "7232ab97-cb8f-432d-b077-2303c07eb67c"
    }
  ]
}
```

重复提交同一 task：

```json
{
  "success": false,
  "message": "流程待办已处理",
  "code": "WORKFLOW_TASK_NOT_PENDING"
}
```

重复提交后计数仍为：

```text
payments 1, ledger_entries 1
```

结论：

- 财务员工可以看到并完成 `payment_collection` 待办。
- 完成动作会先创建 `confirmed` payment，再写入 `finance_ledger_entries`，再推进 workflow。
- workflow 已从 `payment_stage_1` 推进到 `tile_work`。
- 重复提交不会重复创建 payment 或 ledger；当前 API 语义是“已处理任务返回业务错误”，不是再次返回同一成功结果。

## 6. 验收结论

最终已通过：

- Focused API tests。
- `finance-ledger.test.ts` 单独运行。
- API typecheck/build/file-size。
- Admin file-size/typecheck。
- Supabase migration Local/Remote 对齐。
- 收款 action metadata 契约可通过 API 返回。
- 收款失败场景没有留下 payment 或 ledger 脏数据。
- `finance_base` 财务员工可以访问财务待办和财务台账。
- 收款闭环 smoke 通过：创建 confirmed payment、写 ledger、workflow 推进到下一节点。
- 重复提交同一已完成 task 不重复入账。

注意事项：

- 本次 smoke 使用 dev/e2e 验收数据修复 migration 创建的隐藏项目：
  `00000000-0000-4000-8000-202606160006`。
- 重复提交当前返回 `WORKFLOW_TASK_NOT_PENDING`。数据层幂等成立；如果产品希望接口层重复提交也返回原 payment，需要后续单独调整 complete API 语义。
- 初次把 `finance-ledger.test.ts` 与 `workflow-task-payment-bridge.test.ts` 放在同一 Bun 进程执行时，因前者模块被后者 mock 污染导致失败；分进程运行均通过。

## 7. 复验命令

```bash
cd apps/api
bun test src/services/workflow-task-action-metadata.test.ts src/services/workflow-task-payment-bridge.test.ts src/services/workflow-tasks.test.ts
bun test src/services/finance-ledger.test.ts
```

```bash
bun run api:check
```

```bash
set -a
source /Users/leefo/Public/work/gooes/.env.local
set +a
supabase migration list
```

本次未修改 `/Users/leefo/Public/work/orange`。
