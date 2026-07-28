# Tenant Support Branding Batch B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供年度品牌权益商品、微信支付购买订单、自动开通/续期、超时关单、租户购买记录和平台审计能力。

**Architecture:** 使用独立的 `platform_addon_products`、`tenant_addon_orders` 和支付通知表承载品牌权益商业化语义。复用现有普通商户 APIv3 网关、支付配置和回调验签能力，并通过新的数据库 RPC 在一个事务内确认订单、更新权益、追加权益事件和平台审计。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration、微信支付 APIv3、小程序 JSAPI 支付。

---

### Task 1: 冻结权限、Schema 和响应契约

**Files:**
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Create: `apps/api/src/schema/branding-addon.ts`
- Create: `apps/api/src/schema/branding-addon.test.ts`
- Create: `apps/api/src/services/branding-addon-contracts.ts`
- Create: `apps/api/src/services/branding-addon-contracts.test.ts`

- [ ] **Step 1: 写权限和 Schema 失败测试**

权限测试断言以下编码存在且配置完整：

```ts
const codes = [
  'platform.branding_product.manage',
  'platform.branding_order.read',
  'brand.entitlement.purchase',
  'brand.entitlement_order.read',
] as const;

for (const code of codes) {
  expect(PERMISSION_CODE_VALUES).toContain(code);
  expect(PermissionCodeConfig[code].label.length).toBeGreaterThan(0);
}
```

Schema 测试覆盖：

```ts
expect(BrandingAddonProductPatchSchema.parse({
  name: '年度品牌技术支持',
  amount_fen: 1,
  purchase_notes: '支付成功后自动开通一年',
  enabled: true,
  version: 1,
}).amount_fen).toBe(1);

expect(() => BrandingAddonCreateOrderSchema.parse({
  product_code: 'custom_support_branding_annual',
  idempotency_key: 'not-uuid-v4',
})).toThrow();
```

同时冻结分页默认值 `page=1&pageSize=20`、最大值 100、订单状态
`pending/paid/closed/failed`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test ../../packages/domain/src/permission.test.ts \
  src/schema/branding-addon.test.ts \
  src/services/branding-addon-contracts.test.ts
```

Expected: FAIL，新增权限、Schema 和合同模块尚不存在。

- [ ] **Step 3: 实现最小合同**

定义常量：

```ts
export const BRANDING_ADDON_PRODUCT_CODE =
  'custom_support_branding_annual' as const;
export const BRANDING_ADDON_TERM_YEARS = 1;
export const BRANDING_ADDON_PAYMENT_WINDOW_MS = 5 * 60 * 1000;
export const BRANDING_ADDON_REFUND_POLICY =
  '数字权益支付成功并开通后不支持退款';
export const BRANDING_ADDON_ORDER_STATUSES = [
  'pending',
  'paid',
  'closed',
  'failed',
] as const;
```

公开创建 Schema 只接受固定商品编码和 UUID v4 幂等键，不接受
`payer_openid` 或 `tenant_id`；付款 OpenID 只允许 controller 从
已验微信 JWT 传给 service。金额使用正整数分，分页有界。平台 PATCH
不允许修改 `code`、`entitlement_code` 或 `term_years`。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/permission.ts \
  packages/domain/src/permission.test.ts \
  apps/api/src/schema/branding-addon.ts \
  apps/api/src/schema/branding-addon.test.ts \
  apps/api/src/services/branding-addon-contracts.ts \
  apps/api/src/services/branding-addon-contracts.test.ts
git commit -m "feat(branding): 定义年度权益购买契约"
```

### Task 2: 新增商品、订单、通知和原子确认 Migration

**Files:**
- Create: `supabase/migrations/20260728120000_create_branding_addon_commerce.sql`
- Create: `apps/api/src/services/branding-addon-migration-contract.test.ts`

- [ ] **Step 1: 写 migration 合同失败测试**

测试读取 SQL 并断言：

```ts
expect(sql).toContain('create table if not exists public.platform_addon_products');
expect(sql).toContain('create table if not exists public.tenant_addon_orders');
expect(sql).toContain('create table if not exists public.tenant_addon_wechat_notifications');
expect(sql).toContain('create unique index');
expect(sql).toContain("where status = 'pending'");
expect(sql).toContain('branding_confirm_addon_purchase');
expect(sql).toContain("source_type = 'purchase'");
expect(sql).not.toContain('tenant_credit_orders');
expect(sql).not.toContain('tenant_credit_ledger');
```

另断言新 RPC revoke 权限只授予 `service_role`，商品初始化为
`enabled=false`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/branding-addon-migration-contract.test.ts
```

Expected: FAIL，migration 不存在。

- [ ] **Step 3: 编写 Migration**

Migration 必须：

1. 创建三张表和所有状态/金额/快照一致性约束。
2. 建立租户幂等、商户单号、微信交易号、单租户 pending 部分唯一
   索引。
3. 为 `tenant_entitlement_events` 增加 purchase 来源唯一索引。
4. 初始化固定关闭商品。
5. 初始化四个权限并绑定平台 `platform_admin`、租户
   `system_admin`。
6. 创建 `branding_confirm_addon_purchase`，事务步骤骨架严格为：

```sql
select * into v_order
from public.tenant_addon_orders
where id = p_order_id
for update;

if v_order.status = 'paid'
   and v_order.transaction_id = p_transaction_id then
  return query select true, v_order.id, v_order.entitlement_event_id;
end if;

-- 校验 pending/closed 竞态、amount/mchid/appid/out_trade_no。
-- 锁定 tenant_entitlements。
-- active 未过期从原 expires_at 顺延；expired/不存在从 paid_at 起算。
-- suspended/revoked 保持风控状态，但只应用一次期限。
-- 写 purchase 事件、platform_audit_logs、订单 paid 字段。
```

7. RPC 所有失败使用稳定 token，包括
   `BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH`，供 repository 映射。

- [ ] **Step 4: 运行 migration 合同测试**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 本地 SQL 静态验证**

Run:

```bash
supabase db lint --schema public
```

Expected: 无新增 ERROR。若本机没有本地 Supabase，记录环境限制，并
在 dev apply 后使用远端 migration list 和 smoke 补足。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/20260728120000_create_branding_addon_commerce.sql \
  apps/api/src/services/branding-addon-migration-contract.test.ts
git commit -m "feat(db): 建立品牌权益商品与订单模型"
```

### Task 3: 实现增值商品和订单 Repository

**Files:**
- Create: `apps/api/src/repositories/branding-addon-products.ts`
- Create: `apps/api/src/repositories/branding-addon-orders.ts`
- Create: `apps/api/src/repositories/branding-addon-orders.test.ts`
- Create: `apps/api/src/repositories/branding-addon-expiration.ts`

- [ ] **Step 1: 写 repository 失败测试**

用可注入 Supabase client 断言：

```ts
await repository.listTenantOrders({
  tenantId: TENANT_A,
  page: 2,
  pageSize: 20,
});
expect(query.range).toHaveBeenCalledWith(20, 39);
expect(query.eq).toHaveBeenCalledWith('tenant_id', TENANT_A);
```

覆盖必要字段 select、平台列表分页、按租户查询详情、幂等键查询、
pending 查询、通知 notify ID 查询、原子确认 RPC 和关单 claim。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/repositories/branding-addon-orders.test.ts
```

Expected: FAIL，repository 不存在。

- [ ] **Step 3: 实现 Repository**

接口拆分：

```ts
export class BrandingAddonProductRepository {
  getProduct();
  updateProduct(input);
}

export class BrandingAddonOrderRepository {
  findByIdempotencyKey(input);
  findPendingByTenantProduct(input);
  createOrder(input);
  markPrepayCreated(input);
  findTenantOrderById(input);
  listTenantOrders(input);
  listPlatformOrders(input);
  findPlatformOrderById(orderId);
  findByOutTradeNo(outTradeNo);
  findNotificationByNotifyId(notifyId);
  createNotification(input);
  markNotificationProcessed(input);
  markNotificationFailed(input);
  confirmPurchase(input);
}
```

所有列表使用 `.range()`，`pageSize` 最大 100。`select` 只包含响应、
确认或审计所需字段。`findByOutTradeNo` 限制 2 行并在重复时返回稳定
业务错误。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/repositories/branding-addon-*.ts
git commit -m "feat(branding): 增加年度权益订单仓储"
```

### Task 4: 实现平台商品配置 Service

**Files:**
- Create: `apps/api/src/services/platform-branding-addon-product.ts`
- Create: `apps/api/src/services/platform-branding-addon-product.test.ts`

- [ ] **Step 1: 写权限、版本和审计失败测试**

覆盖：

```ts
await expect(service.update(nonPlatformAdmin, input))
  .rejects.toMatchObject({ statusCode: 403 });

expect(repository.updateProduct).toHaveBeenCalledWith({
  ...input,
  updatedByEmployeeId: PLATFORM_EMPLOYEE_ID,
});
expect(auditLogService.log).toHaveBeenCalledWith(
  expect.objectContaining({ action: 'branding_addon_product.update' }),
);
```

版本冲突必须映射为
`BRANDING_ADDON_PRODUCT_VERSION_CONFLICT`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/platform-branding-addon-product.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 Service**

Service 只编排权限、repository 和审计：

```ts
accessPolicyService.assertPlatformAdmin(authContext);
accessPolicyService.assertPermission(
  authContext,
  'platform.branding_product.manage',
);
```

返回固定 `code`、`entitlement_code`、`term_years`、价格、说明、状态
和版本。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/platform-branding-addon-product*
git commit -m "feat(branding): 支持平台配置年度权益商品"
```

### Task 5: 实现租户购买订单创建和支付参数

**Files:**
- Create: `apps/api/src/services/branding-addon-order-views.ts`
- Create: `apps/api/src/services/tenant-branding-addon-orders.ts`
- Create: `apps/api/src/services/tenant-branding-addon-orders.test.ts`

- [ ] **Step 1: 写租户、幂等和支付失败测试**

覆盖：

- tenant ID 只能取 `authContext.tenantId`。
- 必须有员工身份和 `brand.entitlement.purchase`。
- suspended/revoked 在插单前失败。
- 同幂等键返回原单。
- 新幂等键复用同租户 pending。
- 商品金额写入快照。
- 插单前后两次校验支付配置版本。
- 上游 prepay 后保存 `prepay_id`。
- 已关闭、已支付、过期、跨租户订单不能生成支付参数。

关键断言：

```ts
expect(orderRepository.createOrder).toHaveBeenCalledWith(
  expect.objectContaining({
    tenant_id: TENANT_A,
    amount_fen: 1,
    term_years: 1,
    refund_policy: BRANDING_ADDON_REFUND_POLICY,
  }),
);
expect(orderRepository.createOrder).not.toHaveBeenCalledWith(
  expect.objectContaining({ tenant_id: clientTenantId }),
);
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/tenant-branding-addon-orders.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现订单 Service**

创建顺序：

```text
permission -> entitlement restriction -> idempotency ->
existing pending -> enabled product -> payment config preflight ->
insert snapshot -> reload config/secret -> createJsapiPrepay ->
markPrepayCreated -> serialize
```

支付描述使用商品快照名称。调用网关时金额继续传现有网关要求的元
表示，但必须从整数分精确换算且网关请求 builder 最终发送整数分。

订单响应稳定提供：

```ts
{
  id,
  order_no,
  status,
  amount_fen,
  term_years,
  paid_at,
  expires_at: payment_expires_at,
  entitlement: { starts_at, expires_at, status, source, order_no } | null,
  payment_action: { enabled, disabled_reason },
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/branding-addon-order-views.ts \
  apps/api/src/services/tenant-branding-addon-orders*
git commit -m "feat(branding): 支持租户创建年度权益订单"
```

### Task 6: 实现平台商品和租户 HTTP 接口

**Files:**
- Create: `apps/api/src/controllers/branding-addon/index.ts`
- Create: `apps/api/src/controllers/branding-addon/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写路由失败测试**

冻结以下路由：

```text
GET   /platform/branding/entitlement-product
PATCH /platform/branding/entitlement-product
GET   /tenant/branding/entitlement-product
POST  /tenant/branding/entitlement-orders
POST  /tenant/branding/entitlement-orders/:id/payment-request
GET   /tenant/branding/entitlement-orders
GET   /tenant/branding/entitlement-orders/:id
```

断言 controller 只 parse request、调用 service、返回
`ResponseHandler.success`，不从 body/query 读取 `tenant_id` 或
`payer_openid`。创建订单和 payment-request 必须同时满足
`request.user.login_channel === "wechat"` 和非空
`request.user.openid`，并将该 OpenID 作为独立 service 参数传入。
`admin_web`、缺失 OpenID 和订单付款人错配都必须稳定拒绝。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/controllers/branding-addon/routes.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现控制器和注册**

租户方法统一：

```ts
const authContext = await this.getRequiredTenantContext(request);
const input = parse(Schema, request.body);
return ResponseHandler.success(await service.method(authContext, input));
```

平台方法使用 `getRequiredPlatformAdminContext`。所有错误由 service
和 `error-factory.ts` 返回。

平台订单列表和详情需要 Task 9 的专用查询、脱敏及审计 service，
明确不在本任务提前注册。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/controllers/branding-addon \
  apps/api/src/routes/index.ts
git commit -m "feat(api): 暴露年度品牌权益购买接口"
```

### Task 7: 接入微信支付回调和原子确认

**Files:**
- Modify: `apps/api/src/services/wechat-pay-callback-context-matcher.ts`
- Modify: `apps/api/src/services/wechat-pay-callbacks.ts`
- Create: `apps/api/src/services/branding-addon-payment-confirmation.ts`
- Create: `apps/api/src/services/wechat-pay-callbacks-branding-addon.test.ts`

- [ ] **Step 1: 写回调失败测试**

覆盖：

- `out_trade_no` 匹配品牌权益订单。
- 使用订单绑定的支付配置验签解密。
- `notify_id` 重放直接成功。
- 仅 `TRANSACTION.SUCCESS` 进入确认。
- 金额、mchid、appid、out_trade_no 不一致均失败。
- 相同通知失败后可重试。
- 相同交易和订单重复回调只返回幂等成功。
- 不能调用积分确认或项目收款 bridge。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-callbacks-branding-addon.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 扩展回调上下文**

新增：

```ts
type BrandingAddonCallbackContext = {
  kind: 'branding_addon';
  order: TenantAddonOrderRecord;
  transaction: WechatPayValidatedSuccessTransaction;
};
```

匹配顺序必须使用唯一商户订单号，不凭前缀猜业务类型。验签、解密、
商户号和 appid 校验继续走现有 matcher。

- [ ] **Step 4: 实现确认 Service**

```ts
await orderRepository.confirmPurchase({
  orderId: order.id,
  transactionId: transaction.transactionId,
  paidAmountFen: transaction.amountFen,
  paidAt: transaction.successTime,
  mchid: transaction.mchid,
  appid: transaction.appid,
  outTradeNo: transaction.outTradeNo,
  notificationId,
  metadata: { confirmation_source: source },
});
```

callback 先创建通知记录，确认成功后标 processed，失败时写入有界错误
摘要并重新抛出包装错误。

- [ ] **Step 5: 运行回调测试**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 6: 回归已有回调**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-callbacks.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts \
  src/services/wechat-pay-callbacks-credit-refund.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add apps/api/src/services/wechat-pay-callback-context-matcher.ts \
  apps/api/src/services/wechat-pay-callbacks.ts \
  apps/api/src/services/branding-addon-payment-confirmation.ts \
  apps/api/src/services/wechat-pay-callbacks-branding-addon.test.ts
git commit -m "feat(branding): 接入年度权益支付回调"
```

### Task 8: 实现主动查单和超时关单

**Files:**
- Create: `apps/api/src/services/branding-addon-expiration.ts`
- Create: `apps/api/src/services/branding-addon-expiration.test.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.ts`
- Modify: `apps/api/src/workers/billing-reconcile-worker.test.ts`

- [ ] **Step 1: 写到期状态矩阵失败测试**

复用积分关单测试的可靠性矩阵，但使用独立仓储：

```text
SUCCESS -> 原子确认
CLOSED -> 本地 closed
NOTPAY -> 微信关单 -> 再查单 -> 条件关闭
ORDER_NOT_EXIST + 无 prepay -> 条件关闭
ORDER_NOT_EXIST + 有 prepay -> 保持可重试
未知状态/网络错误 -> 释放 claim，记录有界错误
```

另断言一个订单失败不会阻止批次中后续订单，claim 最大 100。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/branding-addon-expiration.test.ts \
  src/workers/billing-reconcile-worker.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现到期服务**

服务只复用：

- `WechatPayGateway.queryTransaction`
- `WechatPayGateway.closeTransaction`
- 平台支付配置和密钥加载
- Task 7 的 `BrandingAddonPaymentConfirmation`

不调用任何积分 repository 或 service。

- [ ] **Step 4: 接入单一 billing worker 调度**

worker 增加一个独立 child result：

```ts
brandingAddonExpiration: ChildResult<
  ReturnType<typeof summarizeBrandingAddonExpirationResult>
>
```

保持其他账务任务部分失败隔离和健康状态语义。

- [ ] **Step 5: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/services/branding-addon-expiration* \
  apps/api/src/workers/billing-reconcile-worker*
git commit -m "feat(branding): 自动核对并关闭超时权益订单"
```

### Task 9: 完成平台订单查询和权益来源审计

**Files:**
- Create: `apps/api/src/services/platform-branding-addon-orders.ts`
- Create: `apps/api/src/services/platform-branding-addon-orders.test.ts`
- Modify: `apps/api/src/controllers/branding-addon/index.ts`
- Modify: `apps/api/src/controllers/branding-addon/routes.test.ts`

- [ ] **Step 1: 写分页、脱敏和关联失败测试**

覆盖：

- 平台管理员身份和 `platform.branding_order.read`。
- 默认分页及最大 100。
- 租户、状态、关键词和时间筛选。
- 详情包含 entitlement/event/audit 摘要。
- 不返回 `payer_openid`、原始通知密文、密钥引用。
- 关联查询由 repository 单次 RPC/视图查询完成，禁止列表 N+1。
- 在本任务新增并注册：

```text
GET /platform/branding/entitlement-orders
GET /platform/branding/entitlement-orders/:id
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/platform-branding-addon-orders.test.ts \
  src/controllers/branding-addon/routes.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现平台查询 Service**

返回：

```ts
{
  order,
  entitlement: entitlement
    ? { starts_at, expires_at, status, source, order_no }
    : null,
  entitlement_event: eventSummary,
  audit: auditSummary,
}
```

列表只返回轻量摘要；详情才加载事件与审计。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/platform-branding-addon-orders* \
  apps/api/src/controllers/branding-addon
git commit -m "feat(branding): 提供平台权益订单审计查询"
```

### Task 10: 加固暂停、撤销和在途订单关系

**Files:**
- Modify: `supabase/migrations/20260728120000_create_branding_addon_commerce.sql`
- Modify: `apps/api/src/services/tenant-entitlements.ts`
- Modify: `apps/api/src/services/tenant-entitlements.test.ts`
- Modify: `apps/api/src/services/branding-addon-migration-contract.test.ts`

- [ ] **Step 1: 写状态关系失败测试**

覆盖：

- suspend/revoke 关闭该租户品牌商品 pending 订单。
- resume 不延长权益。
- 付款确认晚于 suspend/revoke 时只应用一次期限且保留风控状态。
- revoked 无法新购。
- 重新 grant 后可以新购。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/services/tenant-entitlements.test.ts \
  src/services/branding-addon-migration-contract.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现原子关系**

在现有权益动作 RPC 所在 migration 的本次扩展中，使 suspend/revoke
同事务关闭 `tenant_addon_orders.status='pending'`，记录关闭原因
`ENTITLEMENT_SUSPENDED` / `ENTITLEMENT_REVOKED`。不修改批次 A
resume 的日期规则。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add supabase/migrations/20260728120000_create_branding_addon_commerce.sql \
  apps/api/src/services/tenant-entitlements.ts \
  apps/api/src/services/tenant-entitlements.test.ts \
  apps/api/src/services/branding-addon-migration-contract.test.ts
git commit -m "fix(branding): 保持权益风控状态优先"
```

### Task 11: 增加远端隔离 Smoke 和交接文档

**Files:**
- Create: `apps/api/src/scripts/branding-addon-batch-b-smoke.ts`
- Create: `apps/api/src/scripts/branding-addon-batch-b-smoke.test.ts`
- Modify: `apps/api/package.json`
- Create: `docs/miniprogram/2026-07-28-tenant-support-branding-batch-b-handoff.md`

- [ ] **Step 1: 写 smoke 合同失败测试**

测试脚本必须：

- 要求显式 API Base URL 和两个测试 token。
- 不在日志打印 token/OpenID/密钥。
- 验证商品、幂等创建、pending 复用、跨租户 404、支付参数、订单
  分页和批次 A effective 回归。
- `--real-pay` 未指定时不自动拉起或伪造微信付款。
- 输出订单号、HTTP 状态、错误码、request_id 和脱敏响应。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd apps/api
bun test src/scripts/branding-addon-batch-b-smoke.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现脚本和 package 命令**

新增：

```json
"branding:addon:batch-b-smoke":
  "bun --env-file=.env src/scripts/branding-addon-batch-b-smoke.ts"
```

交接文档列出接口、响应、错误码、前端状态映射、测试账号、测试商品、
smoke 证据、提交号和 API 地址。提交号和远端证据在部署后回填。

- [ ] **Step 4: 运行测试确认通过**

Run: Step 2 命令。

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/scripts/branding-addon-batch-b-smoke* \
  apps/api/package.json \
  docs/miniprogram/2026-07-28-tenant-support-branding-batch-b-handoff.md
git commit -m "docs(branding): 增加批次B联调契约"
```

### Task 12: 全量验证、Dev Migration、部署和联调

**Files:**
- Modify: `docs/miniprogram/2026-07-28-tenant-support-branding-batch-b-handoff.md`

- [ ] **Step 1: 运行静态和单元验证**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
cd apps/api
bun test src/schema/branding-addon.test.ts \
  src/services/branding-addon-contracts.test.ts \
  src/services/branding-addon-migration-contract.test.ts \
  src/repositories/branding-addon-orders.test.ts \
  src/services/platform-branding-addon-product.test.ts \
  src/services/tenant-branding-addon-orders.test.ts \
  src/controllers/branding-addon/routes.test.ts \
  src/services/wechat-pay-callbacks-branding-addon.test.ts \
  src/services/branding-addon-expiration.test.ts \
  src/services/platform-branding-addon-orders.test.ts \
  src/scripts/branding-addon-batch-b-smoke.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 2: 运行回归**

Run:

```bash
cd apps/api
bun test src/services/tenant-entitlements.test.ts \
  src/services/effective-branding.test.ts \
  src/services/brand-profiles.test.ts \
  src/services/billing-recharge.test.ts \
  src/services/billing-recharge-expiration.test.ts \
  src/services/wechat-pay-callbacks-credit-recharge.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 3: 应用 Dev Migration**

先读取待应用 migration 并确认仅包含 Task 2/10 设计范围，然后：

```bash
supabase migration list
supabase db push --include-all
supabase migration list
```

Expected: `20260728120000` 的 Local/Remote 对齐。禁止手工远端 DDL/DML。

- [ ] **Step 4: 部署 API**

推送 feature 分支并触发既有 dev workflow。等待 workflow 成功，记录
部署 commit 和 `https://api-dev.goodcms.cn`。

- [ ] **Step 5: 配置 Dev 商品**

使用平台超管接口把固定商品更新为：

```json
{
  "name": "年度品牌技术支持（1分测试）",
  "amount_fen": 1,
  "purchase_notes": "支付成功后自动开通一年，数字权益不支持退款",
  "enabled": true,
  "version": 1
}
```

只通过 API 修改业务配置，不执行远端 SQL。

- [ ] **Step 6: 执行 Dev Smoke**

Run:

```bash
cd apps/api
API_BASE_URL=https://api-dev.goodcms.cn \
bun run branding:addon:batch-b-smoke
```

Expected:

- 有权益/无权益账号均只能读取自己的订单。
- 幂等重放和 pending 复用通过。
- 超时关单最终收敛 closed。
- 批次 A effective、草稿、发布语义不变。
- 若执行真实 1 分支付，订单最终 paid，权益只顺延一次。

- [ ] **Step 7: 回填交接证据并提交**

回填：

- API Base URL
- 最终 commit
- migration list
- 测试账号/获取 token 方法
- 1 分商品配置
- 自动测试数量
- 远端 smoke 订单号和结果
- 未执行项目（如真实支付需要用户扫码）

```bash
git add docs/miniprogram/2026-07-28-tenant-support-branding-batch-b-handoff.md
git commit -m "docs(branding): 回填批次B联调证据"
git push -u origin feature/tenant-support-branding-batch-b
```

- [ ] **Step 8: 最终工作区核查**

Run:

```bash
git status --short --branch
git log -1 --oneline
git rev-parse HEAD
```

Expected: 工作区干净，feature 分支与远端同步。
