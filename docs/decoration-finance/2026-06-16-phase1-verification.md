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

结果：

- Local 和 Remote 对齐。
- `20260616170000` 在 Local 和 Remote 均存在：

```text
20260616170000 | 20260616170000 | 2026-06-16 17:00:00
```

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

## 6. 验收结论

已通过：

- Focused API tests。
- API typecheck/build/file-size。
- Admin file-size/typecheck。
- Supabase migration Local/Remote 对齐。
- 收款 action metadata 契约可通过 API 返回。
- 收款失败场景没有留下 payment 或 ledger 脏数据。

未通过完整人工闭环：

- 现有唯一 pending 收款任务引用不存在的项目，导致 payment 外键失败。
- 远端角色未绑定 `finance.*` 权限，真实财务员工无法访问 `/finance/ledger`，也无法按权限配置处理 `finance.payment.confirm`。

## 7. 后续处理建议

建议下一步单独执行“财务验收环境修复”：

1. 通过 migration 或明确的初始化脚本，将 `finance.*` 权限绑定到租户 `finance_base` 或约定的财务角色。
2. 清理或重建引用不存在项目的 workflow task 测试数据。
3. 使用真实存在的项目重新生成 pending `payment_collection` task。
4. 重新执行完整 smoke：
   - 提交金额和凭证。
   - 确认 created payment 为 `confirmed`。
   - 确认 ledger 有 `project_payment / in`。
   - 确认 workflow task completed 并推进到下一节点。
   - 重复提交同一 taskId，确认 payment 和 ledger 不重复。

本次未修改 `/Users/leefo/Public/work/orange`。
