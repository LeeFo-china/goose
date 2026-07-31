# Supplier Payables and Payment Close Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付合格收货原子形成项目成本和供应商应付、付款申请审批、部分付款、多次付款、应付核销及现金台账的完整闭环。

**Architecture:** 两组 additive Supabase migration 分别建立收货财务事实和付款申请/付款事实，所有关键状态变化由带租户范围、乐观锁和幂等快照的原子 RPC 完成。Fastify 保持 controller/service/repository 分层，Next.js Admin 在“采购供应”下增加应付和付款申请工作区；项目经营成本与供应商付款现金分开聚合，避免重复成本。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js 15、React 19、shadcn/Radix、Playwright

**Approved design:** `docs/superpowers/specs/2026-07-31-supplier-payables-payment-close-loop-design.md`

---

## Scope and sequencing

按以下顺序执行，不并行修改同一 migration、路由文件或 Admin 工作区：

1. 先固定共享状态、HTTP payload 和数据库 DTO。
2. 建立成本/应付事实并扩展收货 RPC。
3. 建立付款申请、付款、分配和现金台账 RPC。
4. 接入 API 与项目财务聚合。
5. 建立真实数据库 smoke 和查询计划检查。
6. 接入 Admin 和确定性 E2E。
7. 最后应用 migration、生成类型并完成全量验证。

不得修改 `/Users/leefo/Public/work/orange`。所有数据库变更只能进入
`supabase/migrations/`。

### Task 1: 定义共享领域、HTTP 和数据库记录契约

**Files:**
- Create: `packages/domain/src/supplier-payment.ts`
- Create: `packages/domain/src/supplier-payment.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `apps/api/src/schema/supplier-payments.ts`
- Create: `apps/api/src/schema/supplier-payments.test.ts`
- Create: `apps/api/src/repositories/supplier-payment-records.ts`
- Create: `apps/api/src/repositories/supplier-payment-records.test.ts`

- [x] **Step 1: 写共享领域 RED 测试**

```ts
import { describe, expect, test } from "bun:test";
import {
  ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES,
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_REQUEST_STATUSES,
  canCloseSupplierPaymentRequest,
  canConfirmSupplierPayment,
} from "./supplier-payment";

describe("supplier payment domain", () => {
  test("固定状态与付款方式", () => {
    expect(SUPPLIER_PAYMENT_REQUEST_STATUSES).toEqual([
      "draft",
      "pending_approval",
      "approved",
      "partially_paid",
      "paid",
      "rejected",
      "cancelled",
      "closed",
    ]);
    expect(ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES).toEqual([
      "pending_approval",
      "approved",
      "partially_paid",
    ]);
    expect(SUPPLIER_PAYMENT_METHODS).toEqual([
      "bank_transfer",
      "wechat",
      "alipay",
      "cash",
      "other",
    ]);
  });

  test("只允许批准和部分付款状态确认付款", () => {
    expect(canConfirmSupplierPayment("approved")).toBe(true);
    expect(canConfirmSupplierPayment("partially_paid")).toBe(true);
    expect(canConfirmSupplierPayment("pending_approval")).toBe(false);
  });

  test("只有部分付款申请可关闭剩余金额", () => {
    expect(canCloseSupplierPaymentRequest("partially_paid")).toBe(true);
    expect(canCloseSupplierPaymentRequest("approved")).toBe(false);
  });
});
```

- [x] **Step 2: 运行领域测试确认 RED**

Run:

```bash
cd packages/domain
bun test src/supplier-payment.test.ts
```

Expected: FAIL，`supplier-payment` 模块不存在。

- [x] **Step 3: 实现共享领域并导出**

```ts
export const SUPPLIER_PAYMENT_REQUEST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "partially_paid",
  "paid",
  "rejected",
  "cancelled",
  "closed",
] as const;

export type SupplierPaymentRequestStatus =
  typeof SUPPLIER_PAYMENT_REQUEST_STATUSES[number];

export const ACTIVE_SUPPLIER_PAYMENT_REQUEST_STATUSES = [
  "pending_approval",
  "approved",
  "partially_paid",
] as const;

export const SUPPLIER_PAYMENT_METHODS = [
  "bank_transfer",
  "wechat",
  "alipay",
  "cash",
  "other",
] as const;

export type SupplierPaymentMethod = typeof SUPPLIER_PAYMENT_METHODS[number];

export function canConfirmSupplierPayment(
  status: SupplierPaymentRequestStatus,
) {
  return status === "approved" || status === "partially_paid";
}

export function canCloseSupplierPaymentRequest(
  status: SupplierPaymentRequestStatus,
) {
  return status === "partially_paid";
}
```

在 `packages/domain/src/index.ts` 追加：

```ts
export * from "./supplier-payment";
```

- [x] **Step 4: 写 HTTP schema RED 测试**

覆盖分页、筛选、草稿、审核、取消、关闭和付款：

```ts
expect(SupplierPayableListQuerySchema.parse({})).toEqual({
  page: 1,
  pageSize: 20,
});

expect(SupplierPaymentRequestDraftSchema.parse({
  id: REQUEST_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  expected_version: 0,
  reason: "结算 7 月项目材料款",
  remark: null,
  allocations: [{
    payable_event_id: PAYABLE_ID,
    requested_amount: "90.00",
  }],
})).toMatchObject({ expected_version: 0 });

expect(() => SupplierPaymentConfirmSchema.parse({
  id: PAYMENT_ID,
  expected_version: 3,
  payment_method: "other",
  payment_reference: "TX-001",
  paid_at: "2026-07-31T10:00:00.000Z",
  evidence_images: ["supplier-payments/proof.png"],
  remark: null,
  allocations: [{
    payment_request_allocation_id: REQUEST_ALLOCATION_ID,
    payable_event_id: PAYABLE_ID,
    amount: "50.00",
  }],
})).toThrow();
```

继续断言：

- `pageSize` 默认 20、最大 100。
- 状态、项目、供应商、采购单、到期区间和创建区间严格校验。
- 草稿 1 至 100 行，应付 ID 唯一。
- 金额大于 0、两位小数且不超过 `numeric(18,2)`。
- 创建使用 `expected_version = 0`，已有申请命令必须为正整数版本。
- `other` 必须有非空备注。
- 付款凭证 1 至 9 张，分配 1 至 100 行。
- 所有对象 `.strict()`，拒绝客户端 tenant、actor 和服务端金额字段。

- [x] **Step 5: 运行 schema 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/schema/supplier-payments.test.ts
```

Expected: FAIL，schema 模块不存在。

- [x] **Step 6: 实现 schema**

导出：

```ts
export const SupplierPayableListQuerySchema;
export const SupplierPaymentRequestListQuerySchema;
export const SupplierPaymentRequestParamSchema;
export const SupplierPaymentRequestDraftSchema;
export const SupplierPaymentRequestSubmitSchema;
export const SupplierPaymentRequestReviewSchema;
export const SupplierPaymentRequestCancelSchema;
export const SupplierPaymentRequestCloseSchema;
export const SupplierPaymentConfirmSchema;
```

金额使用字符串输入，并以以下 refinement 固定两位精度：

```ts
const money = z.string().regex(
  /^(?:0|[1-9]\d{0,15})\.\d{2}$/,
  "金额必须是大于 0 且保留两位小数的字符串",
).refine((value) => Number(value) > 0, "金额必须大于 0");
```

- [x] **Step 7: 写数据库记录 RED 测试**

严格解析：

```ts
expect(ProjectCostEventSchema.parse(projectCostEvent))
  .toEqual(projectCostEvent);
expect(SupplierPayableEventSchema.parse(payableEvent))
  .toEqual(payableEvent);
expect(SupplierPaymentRequestSchema.parse(paymentRequest))
  .toEqual(paymentRequest);
expect(SupplierPaymentRequestAllocationSchema.parse(requestAllocation))
  .toEqual(requestAllocation);
expect(SupplierPaymentSchema.parse(payment)).toEqual(payment);
expect(SupplierPaymentAllocationSchema.parse(paymentAllocation))
  .toEqual(paymentAllocation);
expect(SupplierPaymentCommandEnvelopeSchema.parse(envelope))
  .toEqual(envelope);
```

numeric 金额使用字符串；时间、nullable 审计字段、状态和命令 envelope 均严格。

- [x] **Step 8: 实现数据库记录 schema 并运行 GREEN**

Run:

```bash
cd apps/api
bun test src/schema/supplier-payments.test.ts \
  src/repositories/supplier-payment-records.test.ts
cd ../../packages/domain
bun test src/supplier-payment.test.ts
```

Expected: PASS。

- [x] **Step 9: 提交契约**

```bash
git add packages/domain/src/supplier-payment.ts \
  packages/domain/src/supplier-payment.test.ts \
  packages/domain/src/index.ts \
  apps/api/src/schema/supplier-payments.ts \
  apps/api/src/schema/supplier-payments.test.ts \
  apps/api/src/repositories/supplier-payment-records.ts \
  apps/api/src/repositories/supplier-payment-records.test.ts
git commit -m "feat(supplier): 定义应付付款领域契约"
```

### Task 2: 用 migration 建立项目成本和应付事实

**Files:**
- Create: `apps/api/src/services/supplier-cost-payable-migration-contract.test.ts`
- Create: `supabase/migrations/20260731100000_create_supplier_cost_payable_facts.sql`

- [ ] **Step 1: 写 migration 契约 RED 测试**

测试读取指定 migration 并断言：

```ts
expect(sql).toContain("CREATE TABLE public.project_cost_events");
expect(sql).toContain("CREATE TABLE public.supplier_payable_events");
expect(sql).toContain(
  "ADD COLUMN settlement_term_days_snapshot integer",
);
expect(sql).toContain(
  "ADD COLUMN invoice_required_before_payment_snapshot boolean",
);
expect(sql).toContain("ADD COLUMN cost_category_id uuid");
expect(sql).toContain("ADD COLUMN recognized_amount numeric(18, 2)");
expect(sql).toContain("'consumed'");
```

继续检查：

- 项目、租户供应商、采购单、采购行、收货和成本分类复合外键。
- 来源唯一键、金额/币种/到期时间 check。
- 两张事件表只追加保护。
- RLS、FORCE RLS、service role 最小授权。
- 活动承诺按 `greatest(amount - recognized_amount, 0)` 聚合。
- 历史采购行只按申请 ID + SKU 唯一回填。
- 不能映射的历史采购行保留空值。
- 两张事件表的列表和项目汇总索引。
- rollback 注释明确保留经营事实。

- [ ] **Step 2: 运行 migration 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-cost-payable-migration-contract.test.ts
```

Expected: FAIL，migration 不存在。

- [ ] **Step 3: 建立订单快照和不可变事实表**

核心约束使用：

```sql
CONSTRAINT project_cost_events_source_key
  UNIQUE (tenant_id, source_type, source_id),
CONSTRAINT supplier_payable_events_source_key
  UNIQUE (tenant_id, source_type, source_id),
CONSTRAINT project_cost_events_source_type_check
  CHECK (source_type = 'supplier_purchase_receipt_item'),
CONSTRAINT supplier_payable_events_source_type_check
  CHECK (source_type = 'supplier_purchase_receipt_item'),
CONSTRAINT supplier_payable_events_due_check
  CHECK (due_at >= occurred_at)
```

为 `project_cost_events` 和 `supplier_payable_events` 安装
`BEFORE UPDATE OR DELETE` 保护函数。函数只允许 migration owner 在显式
`set_config('app.supplier_accounting_write', 'on', true)` 的受控命令上下文写入，
service role 不能直接改事件。

- [ ] **Step 4: 扩展预算承诺**

加入：

```sql
recognized_amount numeric(18, 2) NOT NULL DEFAULT 0,
consumed_at timestamptz NULL,
CONSTRAINT project_cost_commitments_recognized_check
  CHECK (
    recognized_amount >= 0
    AND recognized_amount <= amount
  )
```

重建状态与审计 check，保证：

- `consumed` 必须 `recognized_amount = amount` 且 `consumed_at IS NOT NULL`。
- `reserved` / `converted` 必须 `consumed_at IS NULL`。
- `released` 保留原释放操作人、时间和原因。
- 活动预算承诺查询只计算未确认余额。

- [ ] **Step 5: 实现订单快照与历史回填**

扩展采购申请转订单 RPC，使采购行插入包含：

```sql
cost_category_id
```

订单头插入包含：

```sql
settlement_term_days_snapshot,
invoice_required_before_payment_snapshot
```

有效合同优先；没有有效合同时使用 `tenant_suppliers` 默认值。历史回填只使用明确
关系，并提供只读函数：

```sql
public.list_supplier_accounting_legacy_gaps(
  p_tenant_id uuid,
  p_page integer,
  p_page_size integer
)
```

函数分页且最大 100，返回未映射采购行和未财务化收货行。

- [ ] **Step 6: 扩展收货 RPC**

在现有 `create_supplier_purchase_order_receipt` 的收货行循环内：

```sql
v_event_amount := CASE
  WHEN v_previous_accepted_quantity + v_item.accepted_quantity
    = v_order_item.quantity
  THEN v_order_item.total_amount - v_previous_recognized_amount
  ELSE round(
    v_order_item.total_amount * v_item.accepted_quantity /
      v_order_item.quantity,
    2
  )
END;
```

同事务插入：

```sql
INSERT INTO public.project_cost_events (...);
INSERT INTO public.supplier_payable_events (...);
```

随后按 `cost_category_id` 锁定并增加承诺 `recognized_amount`；等于 `amount` 时设置
`status = 'consumed'` 和 `consumed_at`。拒收行不插入事件。成本分类缺失时返回：

```json
{
  "status": "state_conflict",
  "error_code": "SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED"
}
```

- [ ] **Step 7: 加固幂等和租户边界**

命令重放必须返回原结果且不重复事件；同幂等键不同请求继续抛
`SUPPLIER_IDEMPOTENCY_CONFLICT`。所有来源复合外键带 `tenant_id`，所有 SECURITY
DEFINER 函数固定：

```sql
SET search_path = pg_catalog, public
```

- [ ] **Step 8: 运行 migration 契约 GREEN**

Run:

```bash
cd apps/api
bun test src/services/supplier-cost-payable-migration-contract.test.ts \
  src/services/supplier-purchase-fulfillment-migration-contract.test.ts \
  src/services/supplier-purchase-requisition-command-migration-contract.test.ts
```

Expected: PASS。

- [ ] **Step 9: 提交成本和应付 migration**

```bash
git add apps/api/src/services/supplier-cost-payable-migration-contract.test.ts \
  supabase/migrations/20260731100000_create_supplier_cost_payable_facts.sql
git commit -m "feat(db): 建立供应商成本应付事实"
```

### Task 3: 用 migration 建立付款申请和付款原子命令

**Files:**
- Create: `apps/api/src/services/supplier-payment-migration-contract.test.ts`
- Create: `apps/api/src/services/supplier-payment-command-migration-contract.test.ts`
- Create: `supabase/migrations/20260731110000_create_supplier_payment_requests.sql`

- [ ] **Step 1: 写付款表 migration RED 测试**

```ts
for (const table of [
  "supplier_payment_requests",
  "supplier_payment_request_allocations",
  "supplier_payments",
  "supplier_payment_allocations",
]) {
  expect(sql).toContain(`CREATE TABLE public.${table}`);
}

for (const permission of [
  "supplier.payable.view",
  "supplier.payment-request.view",
  "supplier.payment-request.manage",
  "supplier.payment-request.approve",
  "supplier.payment-request.pay",
]) {
  expect(sql).toContain(`'${permission}'`);
}
```

继续断言：

- 四表复合外键、金额 check、范围一致性触发器。
- 申请状态和状态审计 check。
- 申请内应付唯一、付款内申请分配唯一。
- `finance_ledger_entries.entry_type` 接受 `supplier_payment`。
- 付款来源唯一现金台账。
- RLS、FORCE RLS、service role 最小授权。
- 五个权限 seed 到租户系统管理员角色。
- `supplier_command_events.resource_type` 接受
  `supplier_payment_request` 和 `supplier_payment`。

- [ ] **Step 2: 写命令 RED 测试**

固定以下 RPC：

```ts
const functions = [
  "save_supplier_payment_request_draft",
  "submit_supplier_payment_request",
  "review_supplier_payment_request",
  "cancel_supplier_payment_request",
  "close_supplier_payment_request",
  "confirm_supplier_payment",
];
for (const name of functions) {
  expect(sql).toContain(`FUNCTION public.${name}`);
}
```

每个命令必须检查：

- 请求快照写入 `supplier_command_events.from_state -> '_request'`。
- 重放比较请求快照，不同 payload 返回幂等冲突。
- `expected_version` 和稳定版本冲突 envelope。
- tenant、project、supplier 和 currency 范围。
- actor user/employee 归属租户。
- 提交人不能批准或驳回自己的付款申请。
- 固定锁顺序。
- 余额在锁内复算。
- 发票门禁先于任何付款插入。
- 付款、分配、申请 paid amount、状态和现金台账同事务。

- [ ] **Step 3: 运行付款 migration 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-payment-migration-contract.test.ts \
  src/services/supplier-payment-command-migration-contract.test.ts
```

Expected: FAIL，migration 不存在。

- [ ] **Step 4: 建立表和不可变付款**

状态 check 固定：

```sql
CHECK (status IN (
  'draft',
  'pending_approval',
  'approved',
  'partially_paid',
  'paid',
  'rejected',
  'cancelled',
  'closed'
))
```

付款方式 check 固定：

```sql
CHECK (payment_method IN (
  'bank_transfer',
  'wechat',
  'alipay',
  'cash',
  'other'
))
```

为 `supplier_payments`、`supplier_payment_allocations` 安装
`BEFORE UPDATE OR DELETE` 不可变保护。申请与申请分配只允许受控 RPC 变更。

- [ ] **Step 5: 实现草稿、提交和审核**

`save_supplier_payment_request_draft`：

- 新建要求 `expected_version = 0`。
- 更新只允许 `draft`。
- 申请和全部应付必须同项目、供应商、币种。
- 草稿不预占余额。

`submit_supplier_payment_request`：

- 锁申请头。
- 按应付 ID 锁应付。
- 按 `payment_request_id, payable_event_id` 锁活动分配。
- 计算其他活动申请未付占用。
- 超额返回 `SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE`。
- 冻结 `requested_amount` 并转 `pending_approval`。

`review_supplier_payment_request`：

- `approve` 转 `approved`。
- `reject` 要求非空原因并转 `rejected`。
- 审批员工与提交员工相同则返回
  `SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN`。
- 不创建 workflow 业务事实。

- [ ] **Step 6: 实现取消、关闭和付款**

`cancel_supplier_payment_request` 允许：

```text
draft | pending_approval | approved
```

且必须 `paid_amount = 0`。

`close_supplier_payment_request` 只允许 `partially_paid`，释放剩余申请占用并保留付款。

`confirm_supplier_payment` 按设计步骤完成。发票门禁返回：

```json
{
  "status": "invoice_required",
  "error_code": "SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED"
}
```

付款成功 envelope：

```json
{
  "status": "paid",
  "idempotent": false,
  "payment": {},
  "payment_request": {},
  "version": 4
}
```

部分付款使用 `"status": "partially_paid"`。

- [ ] **Step 7: 建立查询和索引**

创建受控分页函数：

```sql
list_supplier_payables(...)
list_supplier_payment_requests(...)
get_supplier_payment_request_detail(...)
list_supplier_payment_request_payments(...)
get_supplier_purchase_order_financial_summary(...)
```

所有列表要求 `p_page >= 1`、`1 <= p_page_size <= 100`，返回总数和稳定分页。
索引逐项覆盖设计第 12 节。

- [ ] **Step 8: 运行付款 migration GREEN**

Run:

```bash
cd apps/api
bun test src/services/supplier-payment-migration-contract.test.ts \
  src/services/supplier-payment-command-migration-contract.test.ts
```

Expected: PASS。

- [ ] **Step 9: 提交付款 migration**

```bash
git add apps/api/src/services/supplier-payment-migration-contract.test.ts \
  apps/api/src/services/supplier-payment-command-migration-contract.test.ts \
  supabase/migrations/20260731110000_create_supplier_payment_requests.sql
git commit -m "feat(db): 建立供应商付款原子命令"
```

### Task 4: 实现应付和付款 API 分层

**Files:**
- Create: `apps/api/src/repositories/supplier-payables.ts`
- Create: `apps/api/src/repositories/supplier-payables.test.ts`
- Create: `apps/api/src/repositories/supplier-payment-requests.ts`
- Create: `apps/api/src/repositories/supplier-payment-requests.test.ts`
- Create: `apps/api/src/services/supplier-payment-access.ts`
- Create: `apps/api/src/services/supplier-payment-access.test.ts`
- Create: `apps/api/src/services/supplier-payables.ts`
- Create: `apps/api/src/services/supplier-payables.test.ts`
- Create: `apps/api/src/services/supplier-payment-requests.ts`
- Create: `apps/api/src/services/supplier-payment-requests.test.ts`
- Create: `apps/api/src/controllers/supplier-payables/index.ts`
- Create: `apps/api/src/controllers/supplier-payables/routes.test.ts`
- Create: `apps/api/src/controllers/supplier-payment-requests/index.ts`
- Create: `apps/api/src/controllers/supplier-payment-requests/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: 写 repository RED 测试**

用 typed fake Supabase client 断言：

```ts
await payables.list({
  tenant_id: TENANT_ID,
  page: 2,
  pageSize: 20,
  project_id: PROJECT_ID,
});
expect(rpc).toHaveBeenCalledWith("list_supplier_payables", {
  p_tenant_id: TENANT_ID,
  p_page: 2,
  p_page_size: 20,
  p_project_id: PROJECT_ID,
  p_tenant_supplier_id: null,
  p_purchase_order_id: null,
  p_status: null,
  p_due_from: null,
  p_due_to: null,
});
```

付款 repository 覆盖 list/detail/payments 和六个命令的精确 RPC 参数。所有返回先经
Task 1 的 Zod record schema 解析；数据库 error 经 `Errors.dbError()`。

- [ ] **Step 2: 运行 repository RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-payables.test.ts \
  src/repositories/supplier-payment-requests.test.ts
```

Expected: FAIL，repository 不存在。

- [ ] **Step 3: 实现 repository**

导出端口：

```ts
export class SupplierPayablesRepository {
  list(input: SupplierPayableListInput): Promise<SupplierPayablePage>;
  getPurchaseOrderSummary(
    tenantId: string,
    orderId: string,
  ): Promise<SupplierPurchaseOrderFinancialSummary>;
}

export class SupplierPaymentRequestsRepository {
  list(input: SupplierPaymentRequestListInput): Promise<...>;
  findDetail(tenantId: string, requestId: string): Promise<...>;
  listPayments(input: ...): Promise<...>;
  saveDraft(input: ...): Promise<...>;
  submit(input: ...): Promise<...>;
  review(input: ...): Promise<...>;
  cancel(input: ...): Promise<...>;
  close(input: ...): Promise<...>;
  confirmPayment(input: ...): Promise<...>;
}
```

- [ ] **Step 4: 写 access 与 service RED 测试**

覆盖：

```ts
await access.requirePayableRead(auth);
expect(requirePermission).toHaveBeenCalledWith(
  auth,
  "supplier.payable.view",
);

await access.requirePayment(auth);
expect(requirePermission).toHaveBeenCalledWith(
  auth,
  "supplier.payment-request.pay",
);
```

service 测试继续覆盖：

- 供应商模块关闭。
- 项目读/写边界。
- 管理、审批、付款权限相互独立。
- platform admin 不自动获得租户范围。
- not found、state/version/scope/amount/invoice/evidence/idempotency 错误映射。
- 提交人自审映射为 `SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN`。
- actor 和 tenant 只从 auth scope 注入。

- [ ] **Step 5: 运行 service RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-payment-access.test.ts \
  src/services/supplier-payables.test.ts \
  src/services/supplier-payment-requests.test.ts
```

Expected: FAIL，service 不存在。

- [ ] **Step 6: 实现 access 和 service**

保持小接口：

```ts
type SupplierPaymentAccessPort = {
  requirePayableRead(auth: AuthContext): Promise<SupplierTenantScope>;
  requireRequestRead(auth: AuthContext): Promise<SupplierTenantScope>;
  requireRequestManage(auth: AuthContext): Promise<SupplierTenantScope>;
  requireRequestApprove(auth: AuthContext): Promise<SupplierTenantScope>;
  requirePayment(auth: AuthContext): Promise<SupplierTenantScope>;
  assertProjectRead(auth: AuthContext, projectId: string): Promise<void>;
  assertProjectUpdate(auth: AuthContext, projectId: string): Promise<void>;
};
```

付款错误 envelope 映射到：

```ts
Errors.business(409, message, errorCode)
```

数据库异常继续由 repository 包装，不在 service 吞错。

- [ ] **Step 7: 写 controller route RED 测试**

断言以下路由只注册一次：

```text
GET  /supplier-payables
GET  /supplier-payment-requests
GET  /supplier-payment-requests/:id
GET  /supplier-payment-requests/:id/payments
POST /supplier-payment-requests
PUT  /supplier-payment-requests/:id
POST /supplier-payment-requests/:id/submit
POST /supplier-payment-requests/:id/approve
POST /supplier-payment-requests/:id/reject
POST /supplier-payment-requests/:id/cancel
POST /supplier-payment-requests/:id/close
POST /supplier-payment-requests/:id/payments
```

命令必须调用 `requireSupplierIdempotencyKey(request)`；controller 不访问 Supabase。

- [ ] **Step 8: 实现 controller 并注册**

controller 统一使用：

```ts
const auth = await this.getRequiredTenantContext(request);
const input = this.parse(CommandSchema, request.body);
const key = requireSupplierIdempotencyKey(request);
return ResponseHandler.success(
  await supplierPaymentRequestsService.command(auth, id, input, key),
);
```

在 `apps/api/src/routes/index.ts` 导入并注册两个 controller。

- [ ] **Step 9: 运行 API 层 GREEN**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-payables.test.ts \
  src/repositories/supplier-payment-requests.test.ts \
  src/services/supplier-payment-access.test.ts \
  src/services/supplier-payables.test.ts \
  src/services/supplier-payment-requests.test.ts \
  src/controllers/supplier-payables/routes.test.ts \
  src/controllers/supplier-payment-requests/routes.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 10: 提交 API**

```bash
git add apps/api/src/repositories/supplier-payables* \
  apps/api/src/repositories/supplier-payment-requests* \
  apps/api/src/services/supplier-payment-access* \
  apps/api/src/services/supplier-payables* \
  apps/api/src/services/supplier-payment-requests* \
  apps/api/src/controllers/supplier-payables \
  apps/api/src/controllers/supplier-payment-requests \
  apps/api/src/routes/index.ts
git commit -m "feat(api): 接入供应商应付付款接口"
```

### Task 5: 接入采购单和项目财务汇总

**Files:**
- Modify: `apps/api/src/schema/supplier-purchase-orders.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.test.ts`
- Modify: `apps/api/src/services/supplier-purchase-orders.ts`
- Modify: `apps/api/src/services/supplier-purchase-orders.test.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-orders/index.ts`
- Modify: `apps/api/src/controllers/supplier-purchase-orders/routes.test.ts`
- Modify: `apps/api/src/repositories/project-cost-budgets.ts`
- Modify: `apps/api/src/repositories/project-cost-budgets.test.ts`
- Modify: `apps/api/src/services/project-cost-budgets.ts`
- Modify: `apps/api/src/services/project-cost-budgets.test.ts`
- Modify: `apps/api/src/repositories/finance-project-summary.ts`
- Modify: `apps/api/src/services/finance-project-summary.ts`
- Modify: `apps/api/src/services/finance-project-summary.test.ts`

- [ ] **Step 1: 写采购单财务摘要 RED 测试**

期望 DTO：

```ts
{
  purchase_order_id: ORDER_ID,
  accepted_amount: "90.00",
  payable_amount: "90.00",
  reserved_request_amount: "40.00",
  paid_amount: "20.00",
  open_amount: "70.00",
  available_to_request_amount: "30.00",
}
```

route：

```text
GET /supplier-purchase-orders/:id/financial-summary
```

必须复用采购单读取权限和项目读取权限。

- [ ] **Step 2: 实现采购单摘要**

repository 调 `get_supplier_purchase_order_financial_summary`，service 复用
`supplierPurchaseOrderAccessService.requireRead()` 与 `assertProjectRead()`，
controller 只校验 `id`。

- [ ] **Step 3: 写预算承诺/实际成本 RED 测试**

构造：

```ts
const summary = await repository.getProjectBudgetSummary(
  TENANT_ID,
  PROJECT_ID,
);
expect(summary).toMatchObject({
  commitment_amount: 60,
  actual_supplier_cost_amount: 40,
});
```

输入数据包含：

- 承诺 `amount=100, recognized_amount=40, status=converted`。
- 项目成本事件 `amount=40`。
- `entry_type=supplier_payment, amount=20` 的现金流水。

断言活动承诺为 60、实际供应商成本为 40，供应商付款现金不会使实际成本变成 60。

- [ ] **Step 4: 实现项目预算聚合**

`project-cost-budgets` repository：

- 活动承诺累加 `greatest(amount - recognized_amount, 0)`。
- 实际支出保留既有费用事实。
- 供应商采购实际成本从 `project_cost_events` 按分类汇总。
- `supplier_payment` 现金流水从成本合计排除。

返回分类明细包含：

```ts
supplier_cost_amount: number;
active_commitment_amount: number;
```

- [ ] **Step 5: 写项目财务摘要 RED 测试**

项目摘要新增：

```ts
supplier_cost_amount: number;
supplier_payable_open_amount: number;
supplier_cash_paid_amount: number;
```

断言利润计算使用 `supplier_cost_amount`，但不再次使用
`supplier_cash_paid_amount`。

- [ ] **Step 6: 实现项目财务摘要**

repository 使用三个受边界查询或一个受控汇总 RPC，不逐项目 N+1。service 序列化
新增字段并保持旧字段兼容。

- [ ] **Step 7: 运行财务回归**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-orders.test.ts \
  src/services/supplier-purchase-orders.test.ts \
  src/controllers/supplier-purchase-orders/routes.test.ts \
  src/repositories/project-cost-budgets.test.ts \
  src/services/project-cost-budgets.test.ts \
  src/services/finance-project-summary.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交财务聚合**

```bash
git add apps/api/src/schema/supplier-purchase-orders.ts \
  apps/api/src/repositories/supplier-purchase-orders* \
  apps/api/src/services/supplier-purchase-orders* \
  apps/api/src/controllers/supplier-purchase-orders \
  apps/api/src/repositories/project-cost-budgets* \
  apps/api/src/services/project-cost-budgets* \
  apps/api/src/repositories/finance-project-summary.ts \
  apps/api/src/services/finance-project-summary*
git commit -m "feat(finance): 接入供应商采购成本摘要"
```

### Task 6: 建立真实数据库 smoke 和性能计划

**Files:**
- Create: `apps/api/src/scripts/supplier-payment-smoke-fixture.ts`
- Create: `apps/api/src/scripts/supplier-payment-smoke-commands.ts`
- Create: `apps/api/src/scripts/supplier-payment-smoke.ts`
- Create: `apps/api/src/scripts/supplier-payment-smoke.test.ts`
- Create: `apps/api/src/scripts/supplier-payment-explain.ts`
- Create: `apps/api/src/scripts/supplier-payment-explain.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: 写 smoke summary RED 测试**

固定严格结果：

```ts
{
  receipt_cost_atomic: true,
  receipt_payable_atomic: true,
  receipt_replay_idempotent: true,
  split_receipt_rounding_exact: true,
  rejected_quantity_excluded: true,
  commitment_partially_consumed: true,
  concurrent_request_serialized: true,
  rejected_request_released: true,
  partial_payment_recorded: true,
  repeated_payment_idempotent: true,
  final_payment_closed_balance: true,
  invoice_gate_atomic: true,
  supplier_cash_single_ledger: true,
  supplier_cash_not_double_costed: true,
  tenant_isolation: true,
  transaction_rolled_back: true,
}
```

helper 必须拒绝缺键、多键或任一非 `true`。

- [ ] **Step 2: 实现事务回滚 fixture**

复用 `supplier-purchase-fulfillment-smoke` 的：

```ts
runRollbackOnly();
closeDatabasePreservingPrimaryFailure();
```

fixture 使用稳定 UUID，建立两个租户、项目、成本分类、供应商、合作关系、合同、
SKU、价格、采购申请、预算承诺和订单。全部 smoke 写入一个强制回滚事务。

- [ ] **Step 3: 实现 smoke 命令与断言**

场景顺序：

1. 分两次收货，第二次消除舍入差。
2. 断言每个收货行恰好一个成本和应付事件。
3. 幂等重放第二次收货。
4. 创建两个竞争同一应付的付款申请；只有一个提交成功。
5. 驳回另一个申请并验证占用释放。
6. 批准申请并分两次付款。
7. 重放第一次付款。
8. 对要求发票的订单确认付款并验证零写入。
9. 校验现金台账一笔付款一条。
10. 校验项目成本不包含供应商付款现金。
11. 校验其他租户不可见。
12. 事务回滚后查询 fixture 残留为 0。

- [ ] **Step 4: 写 EXPLAIN RED 测试**

脚本必须对以下查询运行 `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`：

- 应付列表按租户、项目、供应商和到期日。
- 付款申请按租户、状态和更新时间。
- 项目成本/承诺/应付/现金汇总。

断言 populated fixture 下出现设计索引名；若数据量不足以使 planner 选索引，先在
回滚事务中批量生成至少 5000 条无业务外溢的 fixture。

- [ ] **Step 5: 本地 helper GREEN**

Run:

```bash
cd apps/api
bun test src/scripts/supplier-payment-smoke.test.ts \
  src/scripts/supplier-payment-explain.test.ts
```

Expected: PASS。

- [ ] **Step 6: 注册脚本并提交**

`apps/api/package.json` 增加：

```json
"supplier:payment:smoke": "bun src/scripts/supplier-payment-smoke.ts",
"supplier:payment:explain": "bun src/scripts/supplier-payment-explain.ts"
```

```bash
git add apps/api/src/scripts/supplier-payment-* apps/api/package.json
git commit -m "test(supplier): 建立应付付款数据库烟测"
```

### Task 7: 建立 Admin 类型、API 和动作规则

**Files:**
- Create: `apps/admin/components/supplier-payables/payable-types.ts`
- Create: `apps/admin/components/supplier-payables/payable-api.ts`
- Create: `apps/admin/components/supplier-payables/payable-api.test.ts`
- Create: `apps/admin/components/supplier-payables/payable-rules.ts`
- Create: `apps/admin/components/supplier-payables/payable-rules.test.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-types.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-api.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-api.test.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-rules.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-rules.test.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-command-refresh.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-command-refresh.test.ts`

- [ ] **Step 1: 写 API RED 测试**

断言：

```ts
await listSupplierPayables({ page: 1, pageSize: 20 });
expect(fetcher).toHaveBeenCalledWith(
  expect.stringContaining("/supplier-payables?page=1&pageSize=20"),
  expect.anything(),
);

await submitSupplierPaymentRequest(REQUEST_ID, {
  expected_version: 2,
}, "request-submit-key");
expect(headers.get("Idempotency-Key")).toBe("request-submit-key");
```

付款 payload 不包含 tenant、actor、应付余额、项目成本或服务端合计金额。

- [ ] **Step 2: 写规则 RED 测试**

```ts
expect(paymentRequestActions(draft, permissions))
  .toEqual(["edit", "submit", "cancel"]);
expect(paymentRequestActions(approved, permissions))
  .toContain("pay");
expect(paymentRequestActions(partiallyPaid, permissions))
  .toEqual(expect.arrayContaining(["pay", "close"]));
expect(paymentRequestActions(invoiceBlocked, permissions))
  .not.toContain("pay");
```

应付规则继续覆盖：

- 只有 `available_to_request_amount > 0` 才可选择。
- 只能合并同一项目、供应商和币种。
- 逾期由 `due_at < now && open_amount > 0` 派生。

- [ ] **Step 3: 实现类型、API 和规则**

类型与 Task 1 DTO 一致，numeric 保持字符串。API client 复用现有
`apiRequest`/认证封装，不直接使用裸 `fetch`。

command refresh 返回：

```ts
{
  refreshPayables: true,
  refreshRequests: true,
  refreshRequestDetail: true,
  refreshPurchaseOrderSummary: true,
  refreshProjectFinance: true,
}
```

- [ ] **Step 4: 运行 Admin 契约 GREEN**

Run:

```bash
cd apps/admin
bun test components/supplier-payables \
  components/supplier-payment-requests
pnpm run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交 Admin 契约**

```bash
git add apps/admin/components/supplier-payables \
  apps/admin/components/supplier-payment-requests
git commit -m "feat(admin): 定义应付付款页面契约"
```

### Task 8: 实现供应商应付工作区

**Files:**
- Create: `apps/admin/app/(console)/supplier-payables/page.tsx`
- Create: `apps/admin/app/(console)/supplier-payables/loading.tsx`
- Create: `apps/admin/components/supplier-payables/payable-workspace.tsx`
- Create: `apps/admin/components/supplier-payables/payable-list.tsx`
- Create: `apps/admin/components/supplier-payables/payable-filters.tsx`
- Create: `apps/admin/components/supplier-payables/payable-summary.tsx`
- Create: `apps/admin/components/supplier-payables/use-payable-list.ts`
- Create: `apps/admin/components/supplier-payables/payable-page.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写页面 RED 测试**

检查源码和纯规则：

```ts
expect(pageSource).toContain(
  'permissions.has("supplier.payable.view")',
);
expect(workspaceSource).toContain("pageSize: 20");
expect(workspaceSource).toContain("available_to_request_amount");
expect(menuSource).toContain('href: "/supplier-payables"');
```

继续断言：

- 无查看权限显示稳定提示且不发请求。
- 模块关闭不加载应付。
- 筛选改变回到第 1 页。
- “加载更多”使用下一页并保留稳定排序。
- 跨范围多选自动清除或禁用，不提交非法组合。
- 列表没有无限全量请求。

- [ ] **Step 2: 实现页面骨架和筛选**

使用现有 Admin 组件：

```tsx
<PageContainer>
  <PageHeader
    title="供应商应付"
    description="按项目、供应商和到期日跟踪采购应付。"
  />
  <PayableSummary />
  <PayableFilters />
  <PayableList />
</PageContainer>
```

列表列固定：

```text
项目 | 供应商 | 采购/收货单 | 发生/到期 | 应付 | 已申请未付 |
已付 | 可申请 | 状态 | 操作
```

- [ ] **Step 3: 实现选择和创建申请入口**

多选时第一条锁定 `project_id + tenant_supplier_id + currency`，不匹配行禁用。创建
按钮深链到：

```text
/supplier-payment-requests?create=1&payableIds=<comma-separated ids>
```

URL 最多承载 100 个 UUID，不使用 localStorage 保存金额。

- [ ] **Step 4: 注册菜单和权限**

在“采购供应”组加入：

```ts
{
  title: "供应商应付",
  href: "/supplier-payables",
  permission: "supplier.payable.view",
}
```

- [ ] **Step 5: 运行页面 GREEN**

Run:

```bash
cd apps/admin
bun test components/supplier-payables
pnpm run check
```

Expected: PASS。

- [ ] **Step 6: 提交应付页面**

```bash
git add 'apps/admin/app/(console)/supplier-payables' \
  apps/admin/components/supplier-payables \
  apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 实现供应商应付工作区"
```

### Task 9: 实现供应商付款申请工作区

**Files:**
- Create: `apps/admin/app/(console)/supplier-payment-requests/page.tsx`
- Create: `apps/admin/app/(console)/supplier-payment-requests/loading.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-workspace.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-list.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-filters.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-editor.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-detail.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-review-dialog.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-dialog.tsx`
- Create: `apps/admin/components/supplier-payment-requests/payment-request-page.test.ts`
- Create: `apps/admin/components/supplier-payment-requests/payment-dialog.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: 写付款申请页面 RED 测试**

断言权限：

```ts
expect(pageSource).toContain(
  'permissions.has("supplier.payment-request.view")',
);
expect(pageSource).toContain(
  'permissions.has("supplier.payment-request.manage")',
);
expect(pageSource).toContain(
  'permissions.has("supplier.payment-request.approve")',
);
expect(pageSource).toContain(
  'permissions.has("supplier.payment-request.pay")',
);
```

继续断言列表分页、深链 `payableIds` 校验、状态动作、命令后刷新和并发冲突刷新。

- [ ] **Step 2: 实现列表和草稿编辑器**

编辑器字段：

```text
项目（只读）
供应商（只读）
申请原因
备注
应付分配表：收货来源、到期日、可申请、本次申请
申请总额（服务端保存结果）
```

从深链读取应付 ID 后重新请求服务端事实；客户端不信任 URL 金额。保存草稿使用
稳定 client UUID 和 `expected_version`。

- [ ] **Step 3: 实现提交、审批、取消和关闭**

所有对话框显示申请号、项目、供应商、金额和状态版本。驳回、取消、关闭要求原因。
命令 pending 时禁用同一资源全部动作。

- [ ] **Step 4: 写付款对话框 RED 测试**

覆盖：

```ts
expect(buildPaymentPayload({
  request,
  allocations,
  paymentMethod: "bank_transfer",
  paymentReference: "BANK-001",
  paidAt: "2026-07-31T10:00:00.000Z",
  evidenceImages: ["supplier-payments/proof.png"],
  remark: null,
})).toEqual({
  id: expect.any(String),
  expected_version: request.version,
  payment_method: "bank_transfer",
  payment_reference: "BANK-001",
  paid_at: "2026-07-31T10:00:00.000Z",
  evidence_images: ["supplier-payments/proof.png"],
  remark: null,
  allocations,
});
```

还要覆盖：

- 分配合计必须等于本次付款金额。
- 每行不得超过申请剩余。
- 至少一张凭证。
- `other` 要求备注。
- 发票阻断显示且不提供绕过参数。

- [ ] **Step 5: 实现付款与凭证**

复用 `apps/admin/components/expenses/expense-mutation-shared.ts` 的上传限制和既有
上传 client，不复制存储实现。付款命令成功后显示付款号并刷新全部相关资源。

- [ ] **Step 6: 注册菜单**

```ts
{
  title: "供应商付款申请",
  href: "/supplier-payment-requests",
  permission: "supplier.payment-request.view",
}
```

- [ ] **Step 7: 运行付款申请 GREEN**

Run:

```bash
cd apps/admin
bun test components/supplier-payment-requests \
  components/supplier-payables
pnpm run check
```

Expected: PASS。

- [ ] **Step 8: 提交付款申请页面**

```bash
git add 'apps/admin/app/(console)/supplier-payment-requests' \
  apps/admin/components/supplier-payment-requests \
  apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 实现供应商付款申请工作区"
```

### Task 10: 展示采购单和项目财务摘要

**Files:**
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-types.ts`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-api.ts`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-detail.tsx`
- Create: `apps/admin/components/supplier-purchase-orders/purchase-order-financial-summary.tsx`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts`
- Modify: `apps/admin/components/finance/finance-project-summary-types.ts`
- Modify: `apps/admin/components/finance/finance-project-summary-table.tsx`
- Modify: `apps/admin/components/projects/project-finance-operating-summary-widgets.tsx`
- Create: `apps/admin/components/finance/finance-supplier-cost-summary.test.ts`

- [ ] **Step 1: 写采购单摘要 RED 测试**

断言采购单详情加载：

```text
GET /supplier-purchase-orders/:id/financial-summary
```

并展示：

```text
合格收货 | 已形成应付 | 已申请未付 | 已付 | 未付应付
```

金额权限不足时不请求财务摘要、不渲染金额占位。

- [ ] **Step 2: 实现采购单摘要**

组件 props：

```ts
type PurchaseOrderFinancialSummaryProps = {
  summary: SupplierPurchaseOrderFinancialSummary | null;
  isLoading: boolean;
  error: string | null;
};
```

使用现有 Card、Skeleton、Alert 和金额格式工具。

- [ ] **Step 3: 写项目摘要 RED 测试**

```ts
expect(renderedText).toContain("已发生供应商成本");
expect(renderedText).toContain("未付供应商应付");
expect(renderedText).toContain("已付供应商现金");
expect(calculateDisplayedProjectCost(summary)).toBe(
  summary.expense_cost_amount + summary.supplier_cost_amount,
);
```

断言 `supplier_cash_paid_amount` 不加入项目成本。

- [ ] **Step 4: 实现项目财务摘要**

更新类型、表格和项目 widget，保持原费用、预算、利润字段不变。新增字段为空时按 0
展示，但 API schema 仍要求服务端返回完整字段，避免静默兼容错误。

- [ ] **Step 5: 运行摘要 GREEN**

Run:

```bash
cd apps/admin
bun test components/supplier-purchase-orders \
  components/finance/finance-supplier-cost-summary.test.ts
pnpm run check
```

Expected: PASS。

- [ ] **Step 6: 提交摘要**

```bash
git add apps/admin/components/supplier-purchase-orders \
  apps/admin/components/finance/finance-project-summary-types.ts \
  apps/admin/components/finance/finance-project-summary-table.tsx \
  apps/admin/components/finance/finance-supplier-cost-summary.test.ts \
  apps/admin/components/projects/project-finance-operating-summary-widgets.tsx
git commit -m "feat(admin): 展示采购财务闭环摘要"
```

### Task 11: 确定性 E2E、数据库发布和完成审计

**Files:**
- Create: `apps/admin/e2e/supplier-payment-mock-fixture.mjs`
- Create: `apps/admin/e2e/supplier-payment-mock-state.mjs`
- Create: `apps/admin/e2e/supplier-payment-mock-backend.mjs`
- Create: `apps/admin/e2e/supplier-payment-workflow.spec.ts`
- Create: `apps/admin/playwright.supplier-payment.config.ts`
- Modify: `apps/admin/package.json`
- Modify: `apps/api/src/types/database.ts`
- Modify: `docs/superpowers/plans/2026-07-31-supplier-payables-payment-close-loop.md`

- [ ] **Step 1: 写 Playwright RED 工作流**

一个确定性场景完成：

1. 打开应付页并筛选项目。
2. 选择同项目/供应商两条应付并创建付款申请。
3. 保存、提交并看到应付占用。
4. 非提交人的审批人批准。
5. 财务上传凭证并部分付款。
6. 再次付款直至 `paid`。
7. 查看采购单已收/应付/已付摘要。
8. 打开要求发票的申请并看到不可绕过阻断。
9. mutation journal 证明客户端没有提交 tenant、actor、成本或可用余额。

- [ ] **Step 2: 实现独立 Mock Backend**

使用端口 `3995`，只实现新 E2E 和页面 session 所需路由。所有列表严格分页；状态机、
余额和 mutation journal 固定可预测。不要依赖真实数据库或修改现有采购 E2E fixture。

- [ ] **Step 3: 注册 Playwright 和 package script**

`apps/admin/package.json` 增加：

```json
"test:e2e:supplier-payment": "env -u NO_COLOR playwright test --config=playwright.supplier-payment.config.ts"
```

- [ ] **Step 4: 运行 E2E GREEN**

Run:

```bash
cd apps/admin
bunx playwright test --config=playwright.supplier-payment.config.ts
```

Expected: PASS。

- [ ] **Step 5: 提交 E2E**

```bash
git add apps/admin/e2e/supplier-payment-* \
  apps/admin/playwright.supplier-payment.config.ts \
  apps/admin/package.json
git commit -m "test(admin): 覆盖供应商付款闭环"
```

- [ ] **Step 6: migration 应用前检查**

从仓库根目录加载用户指定 env，但禁止输出其内容：

```bash
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: 仅 `20260731100000`、`20260731110000` 为 Local pending；其他
Local/Remote 对齐。

先在事务回滚或 shadow 环境执行两版 migration 和 Task 6 smoke。任何失败先修
migration，禁止手工远端 DDL/DML。

- [ ] **Step 7: 正式应用 migration**

使用仓库 `Migrate Dev Database` 工作流：

1. `mode=plan`，确认仅两版 pending 且顺序正确。
2. `mode=apply`，确认 applied versions 为
   `20260731100000`、`20260731110000`。
3. 再运行 `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"`。

Expected: Local/Remote 全量对齐。

- [ ] **Step 8: 生成并核对数据库类型**

优先运行：

```bash
supabase gen types typescript --project-id "$DEV_PROJECT_REF" \
  > /tmp/gooes-database.generated.ts
```

先核对生成文件包含既有 supplier 表/RPC 和本阶段对象，再用格式化命令替换
`apps/api/src/types/database.ts`。如果 project-id 输出缺既有对象，不接受破坏性输出；
改用 Dev catalog 精确追加，并用契约测试证明没有删除现有类型。

运行：

```bash
cd apps/api
bun test src/types/database-supplier-purchase-requisition-contract.test.ts
bun run typecheck
```

Expected: PASS，类型差异只包含本阶段新增列、表和 RPC。

- [ ] **Step 9: 运行真实数据库 smoke 与执行计划**

Run:

```bash
cd apps/api
bun run supplier:payment:smoke
bun run supplier:payment:explain
```

Expected:

- 16 个 smoke 布尔检查全部为 `true`。
- smoke 后 fixture 残留为 0。
- 三类关键查询使用设计索引。

- [ ] **Step 10: 运行全量供应商回归**

Run:

```bash
bun run api:typecheck
bun run api:build
bun run admin:check
bun run admin:build
cd apps/api
bun test $(rg --files src -g '*supplier*.test.ts' | sort)
cd ../admin
bun test components/supplier-payables \
  components/supplier-payment-requests \
  components/supplier-purchase-orders \
  components/finance/finance-supplier-cost-summary.test.ts
bunx playwright test --config=playwright.supplier-payment.config.ts
bunx playwright test --config=playwright.supplier-purchase-requisition.config.ts
bunx playwright test --config=playwright.supplier-purchase-order.config.ts
```

Expected: 0 failure。

- [ ] **Step 11: 完成需求逐条审计**

逐条提供当前事实证据：

- 合格收货、成本、应付和承诺消费同事务。
- 分批收货最终金额等于冻结订单金额。
- 拒收不形成成本/应付。
- 并发申请不超额占用。
- 驳回、取消、关闭释放正确。
- 部分付款、多次付款和重放幂等。
- 发票门禁零部分写入。
- 一笔付款一条现金台账。
- 供应商现金不重复计入项目成本。
- 所有新增列表接口均分页，关键计划使用索引。
- 旧采购申请、采购单、履约和费用链路回归通过。
- migration Local/Remote 对齐。
- Orange 与任务启动基线一致，Agent 零写入。

- [ ] **Step 12: 更新计划证据并提交**

把每个 Task 勾选为 `[x]`，在本文末尾记录：

- 提交哈希。
- migration plan/apply 证据。
- `migration list` 结果摘要。
- 真实 smoke 和 EXPLAIN 摘要。
- 测试、类型检查和构建计数。
- Orange 只读基线核查。

```bash
git add apps/api/src/types/database.ts \
  docs/superpowers/plans/2026-07-31-supplier-payables-payment-close-loop.md
git commit -m "docs(supplier): 完成应付付款阶段收口"
```

提交前运行：

```bash
git diff --cached --check
git diff --cached --name-only
```

Expected: 只包含数据库类型和本计划，不包含
`packages/domain/gooes-domain-1.13.0.tgz` 或 Orange 文件。
