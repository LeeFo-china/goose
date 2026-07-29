# Supplier Purchase Fulfillment MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有已提交供应商采购单上交付供应商确认、多批次发货、分批收货验收、差异记录和接受金额事实闭环。

**Architecture:** Supabase migration 建立独立履约聚合、不可变发货/收货事件和原子命令；Fastify 保持 controller/service/repository 分层；Next.js Admin 在采购单详情中增加履约摘要、时间线和三个操作对话框。采购单冻结价格仍是金额唯一来源，履约事实不直接生成库存或应付。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Playwright

**Approved design:** `docs/superpowers/specs/2026-07-30-supplier-purchase-fulfillment-mvp-design.md`

---

### Task 1: 定义 HTTP 和数据库响应契约

**Files:**
- Modify: `apps/api/src/schema/supplier-purchase-orders.ts`
- Modify: `apps/api/src/schema/supplier-purchase-orders.test.ts`
- Create: `apps/api/src/repositories/supplier-purchase-fulfillment-records.ts`
- Create: `apps/api/src/repositories/supplier-purchase-fulfillment-records.test.ts`

- [ ] **Step 1: 写 schema RED 测试**

在 schema 测试中导入并覆盖：

```ts
SupplierPurchaseOrderFulfillmentConfirmSchema.parse({
  expected_version: 3,
  confirmed_at: "2026-07-30T02:00:00.000Z",
  remark: "供应商电话确认",
});

SupplierPurchaseOrderShipmentCreateSchema.parse({
  id: SHIPMENT_ID,
  expected_fulfillment_version: 1,
  shipment_no: "SHIP-001",
  carrier_name: "顺丰",
  tracking_no: "SF001",
  shipped_at: "2026-07-30T03:00:00.000Z",
  items: [{ purchase_order_item_id: ITEM_ID, quantity: 2.5 }],
});

expect(() =>
  SupplierPurchaseOrderReceiptCreateSchema.parse({
    id: RECEIPT_ID,
    expected_fulfillment_version: 2,
    receipt_no: "RCV-001",
    received_at: "2026-07-30T04:00:00.000Z",
    items: [{
      purchase_order_item_id: ITEM_ID,
      accepted_quantity: 1,
      rejected_quantity: 1,
      variance_reason: null,
    }],
  })
).toThrow();
```

同时断言：

- `items` 为 1 至 100 行且采购行 ID 唯一。
- 数量大于等于 0、接受与拒收之和大于 0、最多 4 位小数。
- 无拒收时差异原因为空，有拒收时去空格后 1 至 500 字。
- 编号、承运方、运单号、备注和未知字段边界。
- 发货、收货列表分页默认 `1/20` 且最大 `100`。

- [ ] **Step 2: 运行 schema 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-orders.test.ts
```

Expected: 新 schema 导出不存在。

- [ ] **Step 3: 实现最小 schema**

新增导出：

```ts
export const SupplierPurchaseOrderFulfillmentConfirmSchema = z.object({
  expected_version: z.number().int().positive(),
  confirmed_at: z.iso.datetime({ offset: true }),
  remark: optionalTrimmedText(500),
}).strict();

export const SupplierPurchaseOrderFulfillmentEventListQuerySchema =
  paginationSchema;

export const SupplierPurchaseOrderShipmentCreateSchema = z.object({
  id: z.uuid("无效的发货 ID"),
  expected_fulfillment_version: z.number().int().positive(),
  shipment_no: requiredTrimmedText(80),
  carrier_name: optionalTrimmedText(100),
  tracking_no: optionalTrimmedText(120),
  shipped_at: z.iso.datetime({ offset: true }),
  remark: optionalTrimmedText(500),
  items: z.array(shipmentLineSchema).min(1).max(100),
}).strict().superRefine(uniquePurchaseOrderItemIds);

export const SupplierPurchaseOrderReceiptCreateSchema = z.object({
  id: z.uuid("无效的收货 ID"),
  expected_fulfillment_version: z.number().int().positive(),
  receipt_no: requiredTrimmedText(80),
  received_at: z.iso.datetime({ offset: true }),
  remark: optionalTrimmedText(500),
  items: z.array(receiptLineSchema).min(1).max(100),
}).strict().superRefine(validateReceiptLines);
```

- [ ] **Step 4: 写数据库记录 RED 测试**

断言严格解析：

```ts
expect(SupplierPurchaseOrderFulfillmentSchema.parse(fulfillment))
  .toEqual(fulfillment);
expect(SupplierPurchaseOrderFulfillmentDetailSchema.parse(detail))
  .toEqual(detail);
expect(SupplierPurchaseOrderShipmentSchema.parse(shipment))
  .toEqual(shipment);
expect(SupplierPurchaseOrderReceiptSchema.parse(receipt))
  .toEqual(receipt);
expect(() => SupplierPurchaseOrderFulfillmentSchema.parse({
  ...fulfillment,
  status: "unknown",
})).toThrow();
```

记录中的 numeric 金额和数量必须是字符串，日期是字符串，嵌套行数组最多 100。

- [ ] **Step 5: 运行记录测试确认 RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-fulfillment-records.test.ts
```

Expected: 模块不存在。

- [ ] **Step 6: 实现记录 schema 并运行 GREEN**

创建状态枚举：

```ts
export const SupplierPurchaseOrderFulfillmentStatusSchema = z.enum([
  "confirmed",
  "partially_shipped",
  "shipped",
  "partially_received",
  "received",
  "received_with_variance",
  "cancelled",
]);
```

分别导出头、累计行、发货头/行、收货头/行、详情和命令 envelope schema，
所有对象使用 `.strict()`。

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-orders.test.ts \
  src/repositories/supplier-purchase-fulfillment-records.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交契约**

```bash
git add apps/api/src/schema/supplier-purchase-orders.ts \
  apps/api/src/schema/supplier-purchase-orders.test.ts \
  apps/api/src/repositories/supplier-purchase-fulfillment-records.ts \
  apps/api/src/repositories/supplier-purchase-fulfillment-records.test.ts
git commit -m "feat(supplier): 定义采购履约接口契约"
```

### Task 2: 用 migration 建立履约事实和原子命令

**Files:**
- Create: `apps/api/src/services/supplier-purchase-fulfillment-migration-contract.test.ts`
- Create: `supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql`

- [ ] **Step 1: 写 migration 契约 RED 测试**

固定读取 migration 并断言：

```ts
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_fulfillments",
);
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_item_fulfillments",
);
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_shipments",
);
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_shipment_items",
);
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_receipts",
);
expect(migration).toContain(
  "CREATE TABLE public.supplier_purchase_order_receipt_items",
);
```

并检查：

- numeric/check/唯一/复合外键约束。
- 三组 bounded list 索引。
- 六表 RLS、FORCE RLS 和 service role 最小授权。
- `confirm_supplier_purchase_order_fulfillment`。
- `create_supplier_purchase_order_shipment`。
- `create_supplier_purchase_order_receipt`。
- command → order-id → row 的锁序。
- 请求指纹和 `SUPPLIER_IDEMPOTENCY_CONFLICT`。
- 超发、超收、版本、状态和租户错误码。
- 累计接受金额按冻结价格重算。
- 已发货后取消返回 `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED`。
- rollback 保留履约审计事实。

- [ ] **Step 2: 运行 migration 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-fulfillment-migration-contract.test.ts
```

Expected: migration 不存在。

- [ ] **Step 3: 建表、约束、索引和安全**

按设计建立六表。数量使用 `numeric(18,4)`、金额使用 `numeric(18,2)`。
复合外键必须包含租户和父 ID。发货/收货事实无 UPDATE/DELETE grant。

- [ ] **Step 4: 实现统一内部重算函数**

创建 private 函数：

```sql
public.recalculate_supplier_purchase_order_fulfillment(
  p_fulfillment_id uuid
) RETURNS public.supplier_purchase_order_fulfillments
```

使用一条集合 UPDATE：

- 汇总逐行 ordered/shipped/received/accepted/rejected。
- 根据冻结 `unit_price/tax_rate/tax_inclusive` 重算累计接受金额。
- 根据总量设置状态。
- 不接受客户端状态和金额。

函数撤销 PUBLIC/anon/authenticated/service_role 执行权，只供 SECURITY DEFINER
命令内部调用。

- [ ] **Step 5: 实现确认命令**

按统一锁序：

```sql
PERFORM pg_advisory_xact_lock(
  hashtextextended(
    'supplier-command:' || p_actor_user_id::text || ':' ||
      p_idempotency_key,
    0
  )
);
PERFORM pg_advisory_xact_lock(
  hashtextextended(
    'supplier-purchase-order-id:' || p_order_id::text,
    6720240730100000
  )
);
```

锁订单行，校验 submitted 和 expected version，创建履约头及全部累计行，
写 command event，返回严格 envelope。

- [ ] **Step 6: 实现发货命令**

规范化并验证 1 至 100 行；按采购行 ID 排序锁累计行；集合校验行归属和剩余量；
原子插入发货头/行并更新累计发货量、履约版本和状态。

- [ ] **Step 7: 实现收货命令**

按同一锁序锁履约及累计行；集合校验累计收货不超过已发；插入收货事实；
更新累计 accepted/rejected/received 和接受金额、履约版本与状态。

- [ ] **Step 8: 加固取消命令**

替换 `cancel_supplier_purchase_order`：

```sql
IF fulfillment.status IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.supplier_purchase_order_shipments
    WHERE supplier_purchase_order_id = p_order_id
  )
THEN
  RETURN jsonb_build_object(
    'status', 'state_conflict',
    'error_code', 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED'
  );
END IF;
```

确认但未发货时同时把履约状态设置为 `cancelled`；保留原幂等和版本语义。

- [ ] **Step 9: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-fulfillment-migration-contract.test.ts \
  src/services/supplier-purchase-order-migration-contract.test.ts \
  src/services/supplier-purchase-order-transition-fix-migration-contract.test.ts \
  src/services/supplier-purchase-order-lock-order-migration-contract.test.ts
cd ../..
git diff --check
```

Expected: PASS。

Commit:

```bash
git add apps/api/src/services/supplier-purchase-fulfillment-migration-contract.test.ts \
  supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql
git commit -m "feat(db): 建立采购履约原子命令"
```

### Task 3: 实现履约 repository

**Files:**
- Create: `apps/api/src/repositories/supplier-purchase-fulfillments.ts`
- Create: `apps/api/src/repositories/supplier-purchase-fulfillments.test.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.test.ts`

- [ ] **Step 1: 写 repository RED 测试**

使用注入 client 覆盖：

```ts
await repository.getDetail({ tenant_id: TENANT_ID, order_id: ORDER_ID });
expect(client.from).toHaveBeenCalledWith(
  "supplier_purchase_order_fulfillments",
);

await repository.listShipments({
  tenant_id: TENANT_ID,
  order_id: ORDER_ID,
  page: 2,
  pageSize: 20,
});
expect(query.range).toHaveBeenCalledWith(20, 39);

await repository.confirm(confirmInput);
expect(client.rpc).toHaveBeenCalledWith(
  "confirm_supplier_purchase_order_fulfillment",
  expect.objectContaining({
    p_order_id: ORDER_ID,
    p_expected_version: 2,
  }),
);
```

同样覆盖发货、收货 RPC 的全部 `p_` 参数、Zod 响应拒绝和业务错误映射。

- [ ] **Step 2: 运行确认 RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-fulfillments.test.ts \
  src/repositories/supplier-command-errors.test.ts
```

Expected: repository 模块和新错误映射缺失。

- [ ] **Step 3: 实现必要字段查询和分页**

`getDetail` 并行执行履约头与累计行两个限定字段查询；发货和收货列表使用
`count: "exact"`、父订单过滤、时间和 ID 稳定倒序、`.range()`。

- [ ] **Step 4: 实现三个 RPC command**

共享私有 `command()`，但每个公开方法明确 success status：

```ts
confirm(input): Promise<FulfillmentCommandResult>;
createShipment(input): Promise<FulfillmentCommandResult>;
createReceipt(input): Promise<FulfillmentCommandResult>;
```

响应先通过 Zod，再映射稳定业务错误。

- [ ] **Step 5: 增加错误 token 映射**

至少映射：

- `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED`
- `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT`
- `SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED`
- `SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED`
- `SUPPLIER_PURCHASE_ORDER_VARIANCE_REASON_REQUIRED`
- `SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED`

- [ ] **Step 6: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-fulfillments.test.ts \
  src/repositories/supplier-command-errors.test.ts
```

Expected: PASS。

Commit:

```bash
git add apps/api/src/repositories/supplier-purchase-fulfillments.ts \
  apps/api/src/repositories/supplier-purchase-fulfillments.test.ts \
  apps/api/src/repositories/supplier-command-errors.ts \
  apps/api/src/repositories/supplier-command-errors.test.ts
git commit -m "feat(api): 实现采购履约数据访问"
```

### Task 4: 实现 service 与 controller

**Files:**
- Create: `apps/api/src/services/supplier-purchase-fulfillments.ts`
- Create: `apps/api/src/services/supplier-purchase-fulfillments.test.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-orders/index.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-orders/routes.test.ts`

- [ ] **Step 1: 写 service RED 测试**

覆盖：

```ts
await service.getDetail(auth, ORDER_ID);
expect(access.requireRead).toHaveBeenCalledWith(auth);
expect(access.assertProjectRead).toHaveBeenCalledWith(auth, PROJECT_ID);

await service.createShipment(auth, ORDER_ID, input, IDEMPOTENCY_KEY);
expect(access.requireManage).toHaveBeenCalledWith(auth);
expect(access.assertProjectUpdate).toHaveBeenCalledWith(auth, PROJECT_ID);
expect(repository.createShipment).toHaveBeenCalledWith(
  expect.objectContaining({
    tenant_id: TENANT_ID,
    order_id: ORDER_ID,
    actor_user_id: USER_ID,
    actor_employee_id: EMPLOYEE_ID,
    idempotency_key: IDEMPOTENCY_KEY,
  }),
);
```

确认三个读取/写入路径都先查 tenant order，再检查项目对象权限；不存在返回稳定 404。

- [ ] **Step 2: 运行 service 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-fulfillments.test.ts
```

Expected: service 模块不存在。

- [ ] **Step 3: 实现 service**

依赖端口只 Pick：

```ts
type AccessPort = Pick<
  typeof supplierPurchaseOrderAccessService,
  "requireRead" | "requireManage" | "assertProjectRead" |
    "assertProjectUpdate"
>;
type OrderPort = Pick<
  typeof supplierPurchaseOrdersRepository,
  "findOrder"
>;
type FulfillmentPort = Pick<
  typeof supplierPurchaseFulfillmentsRepository,
  "getDetail" | "listShipments" | "listReceipts" | "confirm" |
    "createShipment" | "createReceipt"
>;
```

不得在 controller 或 repository 重复权限编排。

- [ ] **Step 4: 写 controller RED 测试**

断言注册 15 条采购单路由，并逐条校验：

```ts
GET  /supplier-purchase-orders/:id/fulfillment
GET  /supplier-purchase-orders/:id/shipments
GET  /supplier-purchase-orders/:id/receipts
POST /supplier-purchase-orders/:id/confirm-fulfillment
POST /supplier-purchase-orders/:id/shipments
POST /supplier-purchase-orders/:id/receipts
```

mutation 无合法 `Idempotency-Key` 必须在调用 service 前失败。

- [ ] **Step 5: 运行 controller 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/controllers/supplier-purchase-orders/routes.test.ts
```

Expected: 新路由未注册。

- [ ] **Step 6: 实现 controller 方法并运行 GREEN**

每个方法只执行：

```ts
const auth = await this.getAuthContext(request);
const params = SupplierPurchaseOrderIdParamsSchema.parse(request.params);
const body = SupplierPurchaseOrderShipmentCreateSchema.parse(request.body);
const key = requireSupplierIdempotencyKey(request);
return ResponseHandler.success(
  await supplierPurchaseOrderFulfillmentsService.createShipment(
    auth,
    params.id,
    body,
    key,
  ),
);
```

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-fulfillments.test.ts \
  src/controllers/supplier-purchase-orders/routes.test.ts
```

Expected: PASS。

- [ ] **Step 7: 提交 service/controller**

```bash
git add apps/api/src/services/supplier-purchase-fulfillments.ts \
  apps/api/src/services/supplier-purchase-fulfillments.test.ts \
  apps/api/src/controllers/supplier-purchase-orders/index.ts \
  apps/api/src/controllers/supplier-purchase-orders/routes.test.ts
git commit -m "feat(api): 暴露采购履约接口"
```

### Task 5: 建立 Admin 履约规则、类型和 API

**Files:**
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-types.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-rules.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-rules.test.ts`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-api.ts`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts`

- [ ] **Step 1: 写规则 RED 测试**

覆盖动作与 payload：

```ts
expect(fulfillmentActions(null, true, "submitted"))
  .toEqual(["confirm"]);
expect(fulfillmentActions(confirmed, true, "submitted"))
  .toContain("ship");
expect(fulfillmentActions(shipped, true, "submitted"))
  .toContain("receive");
expect(fulfillmentActions(received, true, "submitted"))
  .toEqual([]);
expect(fulfillmentActions(confirmed, false, "submitted"))
  .toEqual([]);
```

并断言：

- `shipmentRemaining = ordered - shipped`。
- `receiptRemaining = shipped - received`。
- 发货 payload 只含采购行 ID 和数量，不含金额。
- 收货 payload 只含采购行 ID、接受/拒收数量和差异原因，不含金额。
- 拒收原因和超量前端校验。

- [ ] **Step 2: 运行确认 RED**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-rules.test.ts
```

Expected: 模块不存在。

- [ ] **Step 3: 实现类型与纯规则**

类型与 API 字段严格对应后端 Zod；纯规则不导入 React。金额继续使用 string。

- [ ] **Step 4: 写页面源契约 RED**

断言新 API 文件包含六个 endpoint、三个 mutation 均携带
`Idempotency-Key`，详情引用履约面板，且 payload 文件不出现
`unit_price`、`tax_rate` 或接受金额字段。

- [ ] **Step 5: 实现 API client**

公开函数：

```ts
loadPurchaseOrderFulfillment(orderId);
loadPurchaseOrderShipments(orderId, page);
loadPurchaseOrderReceipts(orderId, page);
confirmPurchaseOrderFulfillment(orderId, payload, idempotencyKey);
createPurchaseOrderShipment(orderId, payload, idempotencyKey);
createPurchaseOrderReceipt(orderId, payload, idempotencyKey);
```

- [ ] **Step 6: 运行 GREEN 并提交**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-rules.test.ts \
  apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts
```

Expected: PASS。

Commit:

```bash
git add apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-*
git add apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts
git commit -m "feat(admin): 建立采购履约前端契约"
```

### Task 6: 实现 Admin 履约面板和对话框

**Files:**
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-panel.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-summary.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-shipment-dialog.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-receipt-dialog.tsx`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-detail.tsx`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts`

- [ ] **Step 1: 写组件边界 RED 测试**

源契约断言：

- detail 渲染 `PurchaseOrderFulfillmentPanel`。
- panel 有 loading/error/empty/read-only 状态。
- 确认、发货、收货分别使用独立对话框/确认框。
- 发货和收货对话框显示每行剩余量。
- mutation 使用 `resolveSupplierCommandAttempt`，同一不确定重试复用 key。
- 只读模式隐藏 mutation 按钮。

- [ ] **Step 2: 运行确认 RED**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts
```

Expected: 履约组件不存在。

- [ ] **Step 3: 实现摘要和时间线**

摘要使用一个紧凑 section：

- Badge 状态。
- 5 个数量事实和接受含税金额。
- 发货/收货事件按时间倒序。
- 不使用嵌套 Card；复用 `Badge`、`Table`、`StatusAlert`、`Skeleton`。

- [ ] **Step 4: 实现确认动作**

使用确认 AlertDialog，提交：

```ts
{
  expected_version: order.version,
  confirmed_at: new Date().toISOString(),
  remark: confirmationRemark.trim() || null,
}
```

成功后重新加载履约详情和订单详情。

- [ ] **Step 5: 实现发货对话框**

默认只列出 `ordered - shipped > 0` 的采购行。每行数量输入最大为剩余量；
发货编号和时间必填，承运方/运单号/备注可空。

- [ ] **Step 6: 实现收货对话框**

默认只列出 `shipped - received > 0` 的采购行。同行输入接受和拒收数量；
拒收大于 0 时显示差异原因字段错误。

- [ ] **Step 7: 运行组件 GREEN 和 Admin check**

Run:

```bash
bun test apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts \
  apps/admin/components/supplier-purchase-orders/purchase-order-fulfillment-rules.test.ts
pnpm --dir apps/admin check
```

Expected: PASS，所有 TS/TSX 文件不超过 500 行。

- [ ] **Step 8: 提交 UI**

```bash
git add apps/admin/components/supplier-purchase-orders
git commit -m "feat(admin): 实现采购履约操作面板"
```

### Task 7: 扩展确定性 E2E

**Files:**
- Modify: `apps/admin/e2e/supplier-purchase-order-mock-fixture.mjs`
- Modify: `apps/admin/e2e/supplier-purchase-order-mock-backend.mjs`
- Modify: `apps/admin/e2e/supplier-purchase-order-workflow.spec.ts`

- [ ] **Step 1: 写 E2E RED 流程**

在现有提交后增加：

1. 记录供应商确认。
2. 第一批发货：两行各部分数量。
3. 第一批部分收货：全部接受。
4. 第二批发货：补齐订购数量。
5. 最终收货：一行接受、一行部分拒收并填写差异原因。
6. 断言最终状态 `有差异已收货`、接受金额和拒收数量。
7. 断言履约 journal 顺序和所有 mutation 都有幂等键。
8. 断言 payload 不含价格和金额。

- [ ] **Step 2: 运行 E2E 确认 RED**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-purchase-order -- --project=chromium
```

Expected: 找不到履约按钮或 endpoint。

- [ ] **Step 3: 扩展 mock backend**

使用内存状态保存履约头、累计行、发货和收货。每个 endpoint：

- 严格校验租户 fixture 和版本。
- 校验超发、超收和拒收原因。
- 按真实状态派生逻辑更新状态与接受金额。
- 记录 idempotency key、payload 和 outcome。

- [ ] **Step 4: 运行 GREEN 并提交**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-purchase-order -- --project=chromium
```

Expected: 1 passed。

Commit:

```bash
git add apps/admin/e2e/supplier-purchase-order-*
git commit -m "test(admin): 覆盖采购履约完整流程"
```

### Task 8: 实现真实数据库 smoke

**Files:**
- Create: `apps/api/src/scripts/supplier-purchase-fulfillment-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchase-fulfillment-smoke-fixture.ts`
- Create: `apps/api/src/scripts/supplier-purchase-fulfillment-smoke-commands.ts`
- Create: `apps/api/src/scripts/supplier-purchase-fulfillment-smoke.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 写 smoke helper RED 测试**

断言：

- fixture UUID 稳定。
- 强制 rollback 后才输出结果。
- 原始失败在 rollback 后继续抛出。
- 状态、数量和金额字段必须是期望字符串。
- 结果包含以下布尔项：

```ts
{
  confirmed,
  confirmation_idempotent,
  shipment_created,
  shipment_idempotency_conflict,
  over_shipment_blocked,
  premature_receipt_blocked,
  partial_receipt_created,
  over_receipt_blocked,
  variance_reason_required,
  final_receipt_created,
  accepted_amount_correct,
  cancellation_after_shipment_blocked,
  tenant_isolation,
  transaction_rolled_back,
}
```

- [ ] **Step 2: 运行确认 RED**

Run:

```bash
cd apps/api
bun test src/scripts/supplier-purchase-fulfillment-smoke.test.ts
```

Expected: smoke 模块不存在。

- [ ] **Step 3: 实现 rollback-only smoke**

在一个 Bun SQL transaction 中创建两租户真实 fixture，调用三个真实 RPC，
覆盖 14 个结果。末尾抛内部 rollback sentinel，捕获后只输出已验证结果。

- [ ] **Step 4: 运行 helper GREEN**

Run:

```bash
cd apps/api
bun test src/scripts/supplier-purchase-fulfillment-smoke.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交 smoke**

```bash
git add apps/api/src/scripts/supplier-purchase-fulfillment-smoke* \
  apps/api/package.json
git commit -m "test(api): 建立采购履约数据库验证"
```

### Task 9: Migration 应用与全量验证

**Files:**
- No source changes expected unless verification finds a real defect.

- [ ] **Step 1: 事务回滚验证 migration**

使用 `Bun.SQL` 在目标 direct URL 上：

```ts
await client.begin(async (transaction) => {
  await transaction.unsafe(migrationSql);
  throw new Error("__EXPECTED_ROLLBACK__");
});
```

Expected: SQL 全部执行后由 sentinel 回滚。

- [ ] **Step 2: dry-run 并应用唯一 migration**

Run:

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: dry-run 只列出 `20260730100000`；应用后 Local/Remote 对齐。

- [ ] **Step 3: 重新生成正式数据库类型**

Run:

```bash
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba \
  > apps/api/src/types/database.ts
```

Expected: 新六表和三个 RPC 存在。

- [ ] **Step 4: 提交生成类型**

```bash
git add apps/api/src/types/database.ts
git commit -m "chore(api): 更新采购履约数据库类型"
```

- [ ] **Step 5: 运行 API 与 Admin 测试**

Run:

```bash
cd apps/api
bun test src/controllers/supplier-purchase-orders \
  src/repositories/supplier-purchase-orders.test.ts \
  src/repositories/supplier-purchase-fulfillment-records.test.ts \
  src/repositories/supplier-purchase-fulfillments.test.ts \
  src/schema/supplier-purchase-orders.test.ts \
  src/services/supplier-purchase-order-access.test.ts \
  src/services/supplier-purchase-order*.test.ts \
  src/scripts/supplier-purchase-*.test.ts
cd ../..
bun test apps/admin/components/supplier-purchase-orders \
  apps/admin/components/supplier-products/supplier-command-attempt.test.ts \
  packages/domain/src/permission.test.ts
```

Expected: 0 failures。

- [ ] **Step 6: 运行静态与边界检查**

Run:

```bash
bun run api:check
pnpm --dir apps/admin check
bun run check:permission-boundaries
bun run audit:supabase-writes
git diff --check
```

Expected: API/Admin 类型与构建通过，文件长度通过，权限扫描通过，写入审计无新增
直接写候选。

- [ ] **Step 7: 运行 E2E 和真实数据库 smoke**

Run:

```bash
pnpm --dir apps/admin test:e2e:supplier-purchase-order -- --project=chromium
cd apps/api
bun --env-file=/Users/leefo/Public/work/gooes/.env \
  run supplier:purchase-fulfillment-smoke
```

Expected: Chromium 1 passed，真实 smoke 14 项均为 true。

### Task 10: 复审、修复与集成

**Files:**
- Modify only files required by verified review findings.

- [ ] **Step 1: 确认 feature 分支状态干净**

```bash
git status --short
git diff --check
```

Expected: 没有未提交文件；若验证发现缺陷，先按 Step 3 的 RED/GREEN 流程修复并
提交，再重新执行本步骤。

- [ ] **Step 2: 请求阻断性代码复审**

提供设计、计划、BASE SHA、HEAD SHA 和验证证据，要求只报告可证实的
Critical/Important/Minor 以及 `Ready to merge: Yes/No`。

- [ ] **Step 3: 对每个 Critical/Important 做 RED/GREEN 修复**

每个确认问题先写失败测试、观察预期 RED，再实现、观察 GREEN；重新运行受影响
全量验证。无 Critical/Important 才进入合并。

- [ ] **Step 4: 本地合并 main**

```bash
git -C /Users/leefo/Public/work/gooes merge --no-ff \
  feature/supplier-purchase-fulfillment \
  -m "merge: 集成供应商采购履约 MVP"
```

- [ ] **Step 5: 在 main 上重跑关键 gate**

重新运行 API 履约测试、Admin 履约测试、API/Admin check、Chromium E2E、
真实数据库 smoke 和 migration list。

- [ ] **Step 6: 清理自建 worktree**

仅在 main 合并与合并后验证成功后：

```bash
git -C /Users/leefo/Public/work/gooes worktree remove \
  /Users/leefo/Public/work/gooes/.worktrees/supplier-purchase-fulfillment
git -C /Users/leefo/Public/work/gooes worktree prune
git -C /Users/leefo/Public/work/gooes branch -d \
  feature/supplier-purchase-fulfillment
```
