# 小程序租户充值记录与退款申请 dev 确认

## 结论

截至 2026-07-17，dev 环境的租户充值记录列表和退款申请后端能力可继续联调。

小程序侧可以继续按现有接入方式调用：

```http
GET /billing/recharge-orders?page=1&pageSize=20&status=paid&keyword=TC...
```

后端仍按当前员工登录态识别租户，小程序不要传 `tenant_id`。

## 最新验证

### 部署与迁移

- GitHub Actions `main` 最新 Build Docker Images：success。
- GitHub Actions `main` 最新 Auto Deploy Dev：success。
- dev 数据库连接目标：
  - `SUPABASE_DB_URL` host：`api-dev.goodcms.cn`
  - pooler port：`6543`
  - direct port：`5432`
- `supabase migration list --db-url "$SUPABASE_DB_URL"` 已确认 Local/Remote 对齐到 `20260716093000`。

说明：`.env.local` 当前没有显式 `SUPABASE_PROJECT_REF`，因此仓库的 dev 目标校验脚本无法解析 project ref；本次使用 DB host/port 与 migration list 结果做辅助确认。

### 自动化验证

已执行：

```bash
bun test src/controllers/billing-recharge/routes.test.ts src/controllers/platform-billing-recharge-refunds/routes.test.ts src/services/billing-recharge.test.ts src/services/billing-recharge-refunds.test.ts src/services/billing-recharge-views.test.ts src/services/platform-billing-recharge-refunds.test.ts src/services/platform-billing-recharge-refund-execution.test.ts src/services/wechat-pay-gateway.test.ts src/services/wechat-pay-callbacks.test.ts src/services/wechat-pay-callbacks-credit-recharge.test.ts src/services/wechat-pay-callbacks-credit-refund.test.ts src/services/wechat-pay-migration-contract.test.ts
```

结果：

- 12 个测试文件通过。
- 68 条用例通过。
- 0 失败。

已执行：

```bash
pnpm --filter api typecheck
pnpm --filter api build
```

结果：

- API typecheck 通过。
- API build 通过。

### HTTP smoke

使用具备充值权限的租户员工和平台退款审核权限员工验证。

未输出完整手机号、token 或密钥。

| 场景 | 结果 |
| --- | --- |
| `GET /billing/recharge-orders?page=1&pageSize=5` | `200`，返回 5 条，总数 19 |
| `GET /billing/recharge-orders?page=1&pageSize=5&status=paid` | `200`，返回 5 条，总数 8 |
| `POST /billing/recharge-orders/:missing_id/refund-requests` | `404 BILLING_RECHARGE_ORDER_NOT_FOUND` |
| `GET /platform/billing/recharge-refund-requests?page=1&pageSize=5` | `200`，当前总数 0 |
| `GET /platform/billing/recharge-refund-requests/:missing_id` | `404 BILLING_RECHARGE_REFUND_REQUEST_NOT_FOUND` |

退款申请 smoke 使用不存在订单 ID，只验证认证、权限、路由和错误码边界，没有创建退款申请，没有改动账务数据。

## 小程序对接结论

小程序当前可以保持：

- 不传 `tenant_id`。
- 使用 `page` / `pageSize` 分页。
- 使用 `status` 筛选：`pending`、`paid`、`closed`、`refunded`。
- 使用 `keyword` 搜索 `order_no`、`out_trade_no`、`transaction_id`。
- 只消费后端返回的 `refund_action`，不要本地推导退款资格。
- 不可用原因只读取 `refund_action.disabled_reason`；当前契约没有
  `refund_action.code`，小程序不应读取该字段。

若小程序本期暂不开放退款入口：

- 当 `refund_action.enabled = false` 时展示后端给出的不可用状态。
- 不调用 `POST /billing/recharge-orders/:id/refund-requests`。

若小程序准备开放退款申请：

- 只调用 `POST /billing/recharge-orders/:id/refund-requests` 创建申请。
- 不调用任何平台退款审核或真实微信退款执行接口。
- 提交前要求二次确认和退款原因。
- 提交成功后刷新充值记录列表。

## 后端责任边界

真实微信退款仍只允许平台 Admin 或后端运营流程触发。

小程序只负责展示充值记录、展示退款状态、提交退款申请。
