# Phase 9 微信支付 Task 1 Migration 与权限 Smoke

日期：2026-07-01
工作区：`.worktrees/phase9-wechat-pay-baseline`
分支：`feature/phase9-wechat-pay-baseline`

## 范围

本轮执行 Phase 9 Task 1：微信支付数据模型和第一批权限。

本轮只做：

- 复用并扩展 `tenant_payment_configs`。
- 新增 `wechat_payment_orders`。
- 新增 `wechat_payment_notifications`。
- 新增第一批微信支付权限。
- 更新 `@gooes/domain` 权限常量和测试。
- 应用 migration 并做远端只读核查。

本轮不做：

- 不接微信支付 SDK。
- 不生成真实 prepay order。
- 不处理真实微信支付回调。
- 不做退款表和退款权限。
- 不改 Admin 页面。
- 不改 orange 小程序仓库。

## 代码变更

### Migration

新增：

```text
supabase/migrations/20260701093000_wechat_pay_models.sql
```

主要内容：

1. `tenant_payment_configs` 增加：

```text
merchant_name
serial_no
notify_url
validation_status
last_validated_at
created_by_employee_id
updated_by_employee_id
```

2. 新增微信支付订单表：

```text
wechat_payment_orders
```

关键约束和索引：

```text
wechat_payment_orders_tenant_out_trade_unique_idx
wechat_payment_orders_transaction_unique_idx
wechat_payment_orders_pending_task_unique_idx
wechat_payment_orders_tenant_status_created_idx
```

3. 新增微信支付回调表：

```text
wechat_payment_notifications
```

关键约束和索引：

```text
wechat_payment_notifications_notify_unique_idx
wechat_payment_notifications_tenant_created_idx
wechat_payment_notifications_processed_idx
```

4. 新增权限：

```text
wechat_pay.config.read
wechat_pay.config.manage
wechat_pay.order.read
wechat_pay.notify.read
```

授权策略：

- `system_admin`：获得 4 个权限。
- `finance_base`：获得订单和回调只读权限。
- 退款权限暂不加入。

### Domain

更新：

```text
packages/domain/src/permission.ts
packages/domain/src/permission.test.ts
```

新增 `wechat_pay.*` 权限常量和展示文案。

### Migration Contract Test

新增：

```text
apps/api/src/services/wechat-pay-migration-contract.test.ts
```

测试覆盖：

- 必须扩展 `tenant_payment_configs`。
- 不允许出现重复配置表 `tenant_wechat_pay_configs`。
- 必须创建订单和通知表。
- 必须存在关键幂等索引。
- 只注册第一批权限，不注册退款权限。

## TDD 记录

先写失败测试：

```bash
bun test packages/domain/src/permission.test.ts
cd apps/api && bun test src/services/wechat-pay-migration-contract.test.ts
```

失败原因符合预期：

- `PERMISSION_CODE_VALUES` 尚未包含 `wechat_pay.config.read`。
- `20260701093000_wechat_pay_models.sql` 尚不存在。

实现后重跑：

```text
packages/domain/src/permission.test.ts
4 pass
0 fail

apps/api/src/services/wechat-pay-migration-contract.test.ts
3 pass
0 fail
```

## Migration 应用

应用前：

```bash
PGSSLMODE=disable supabase migration list --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

结果：

```text
20260701093000 |                | 2026-07-01 09:30:00
```

说明 `20260701093000` 仅 Local 存在。

Dry-run：

```bash
PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable" --dry-run
```

结果：

```text
Would push these migrations:
 • 20260701093000_wechat_pay_models.sql
Finished supabase db push.
```

正式应用：

```bash
PGSSLMODE=disable supabase db push --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable" --yes
```

结果：

```text
Applying migration 20260701093000_wechat_pay_models.sql...
Finished supabase db push.
```

首次创建时出现以下 notice，属于预期：

```text
constraint "tenant_payment_configs_validation_status_check" does not exist, skipping
trigger "tr_wechat_payment_orders_updated_at" does not exist, skipping
```

应用后：

```bash
PGSSLMODE=disable supabase migration list --db-url "${SUPABASE_DB_DIRECT_URL}?sslmode=disable"
```

结果：

```text
20260701093000 | 20260701093000 | 2026-07-01 09:30:00
```

Local/Remote 已对齐。

## 远端只读核查

当前环境没有 `psql` 和 `curl`，因此使用 Node `fetch` 调 Supabase REST 做只读存在性核查，不输出密钥。

核查结果：

```text
tenant_payment_config_columns=200; rows=0
wechat_payment_orders=200; rows=0
wechat_payment_notifications=200; rows=0
wechat_permissions=200; rows=4
```

解释：

- `tenant_payment_configs` 新字段可被 REST select。
- `wechat_payment_orders` 表可读。
- `wechat_payment_notifications` 表可读。
- 4 个 `wechat_pay.*` 权限已写入。

## 数据库类型生成说明

尝试执行：

```bash
bun run gen
```

该命令使用 `supabase gen types --project-id ...`，生成结果没有包含本次新增的 `wechat_payment_orders` / `wechat_payment_notifications`，反而带来无关 schema 漂移，因此未纳入提交。

随后尝试使用 direct DB URL：

```bash
supabase gen types typescript --db-url "$SUPABASE_DB_DIRECT_URL" --schema public
```

该路径需要 Docker daemon，当前环境返回：

```text
failed to inspect docker image: Cannot connect to the Docker daemon
```

Task 1 提交时因此没有更新 `apps/api/src/types/database.ts`。Task 1.1 为支持后续微信支付 repository/service 类型约束，按以下方式补齐：

1. 再次使用 `supabase gen types --project-id ... --schema public` 临时生成，结果仍未包含本次新增字段和表。
2. 当前环境没有 Docker，`supabase gen types --db-url ...` 仍不可用。
3. 使用远端 REST OpenAPI 只读 schema 确认以下对象已存在：
   - `tenant_payment_configs` 新增 `merchant_name`、`serial_no`、`notify_url`、`validation_status`、`last_validated_at`、`created_by_employee_id`、`updated_by_employee_id`。
   - `wechat_payment_orders`。
   - `wechat_payment_notifications`。
4. 以已应用 migration 为 nullable/default/relationship 来源，窄范围补齐 `apps/api/src/types/database.ts`，没有做全量 typegen 覆盖，避免引入无关 schema 漂移。
5. 新增 `apps/api/src/types/database-wechat-pay-contract.test.ts`，通过 API `tsc` 检查关键字段和表名类型可用。

Task 1.1 后续仍建议在 Docker/typegen 路径恢复后做一次全量生成对照，但当前提交已经能让 Task 2 使用受控的数据库类型。

## 小程序边界

本轮小程序无必改。

后续 Task 2/3 开放支付动作时，小程序只消费后端返回的：

```text
workflow_state.actions
/workflow-tasks.actions
```

新增动作预计为：

```text
create_wechat_payment
```

小程序不直接创建 `payments`、不写 allocation、不开台账、不本地推进 workflow。

## 下一步

建议继续执行 Phase 9 Task 2：后端微信支付配置 API 和订单创建骨架。

Task 2 建议范围：

1. `tenant_payment_configs` repository/service/controller。
2. 微信支付订单 repository/service/controller。
3. `create_wechat_payment` action 仍由后端决定是否返回。
4. 第一版可使用 dry-run/mock 支付参数，不接真实微信 SDK。
5. Admin 和小程序 handoff 等 Task 2 API 契约稳定后再落。
