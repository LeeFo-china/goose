# Supplier Purchase Requisition Budget Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付项目临时采购申请、按成本分类原子预算预占、单级审批、预算释放以及批准申请生成采购单草稿的完整闭环。

**Architecture:** Supabase migration 保存申请、申请行和预算承诺，并用原子 RPC 负责计价、锁定预算、审批、释放和采购单转换；Fastify 保持 controller/service/repository 分层；Next.js Admin 新增采购申请工作区并扩展项目成本预算视图。新采购单只能从已批准申请转换生成，历史采购单保持只读兼容。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、React、shadcn/Radix、Playwright

**Approved design:** `docs/superpowers/specs/2026-07-30-supplier-purchase-requisition-budget-control-design.md`

---

### Task 1: 定义申请 HTTP 和数据库记录契约

**Files:**
- Create: `apps/api/src/schema/supplier-purchase-requisitions.ts`
- Create: `apps/api/src/schema/supplier-purchase-requisitions.test.ts`
- Create: `apps/api/src/repositories/supplier-purchase-requisition-records.ts`
- Create: `apps/api/src/repositories/supplier-purchase-requisition-records.test.ts`

- [x] **Step 1: 写 HTTP schema RED 测试**

覆盖分页、过滤、草稿、提交、审核、取消和转换：

```ts
expect(SupplierPurchaseRequisitionListQuerySchema.parse({})).toEqual({
  page: 1,
  pageSize: 20,
});

expect(SupplierPurchaseRequisitionDraftSchema.parse({
  project_id: PROJECT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  expected_version: 0,
  reason: "项目现场临时补料",
  expected_delivery_date: "2026-08-01",
  remark: null,
  items: [{
    supplier_sku_id: SKU_ID,
    cost_category_id: COST_CATEGORY_ID,
    quantity: "12.5",
  }],
})).toMatchObject({ reason: "项目现场临时补料" });

expect(() => SupplierPurchaseRequisitionReviewSchema.parse({
  expected_version: 2,
  action: "approve",
  remark: "x".repeat(501),
})).toThrow();
```

同时断言：

- `pageSize <= 100`。
- 状态、预算状态、项目和供应商过滤严格。
- 草稿 1 至 100 行，SKU 唯一。
- 数量是大于 0、最多 4 位小数且不超过 `numeric(18,4)`。
- 原因必填且最多 500 字；备注、审核意见和取消原因边界明确。
- 未知字段全部拒绝。

- [x] **Step 2: 运行 schema 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-requisitions.test.ts
```

Expected: 模块不存在。

- [x] **Step 3: 实现最小 HTTP schema**

导出：

```ts
export const SupplierPurchaseRequisitionStatusSchema = z.enum([
  "draft", "pending_approval", "approved", "rejected", "cancelled", "converted",
]);

export const SupplierPurchaseRequisitionBudgetStatusSchema = z.enum([
  "unchecked", "within_budget", "over_budget",
]);

export const SupplierPurchaseRequisitionDraftSchema = z.object({
  project_id: z.uuid(),
  tenant_supplier_id: z.uuid(),
  expected_version: z.number().int().nonnegative(),
  reason: requiredText(500),
  expected_delivery_date: z.iso.date().nullable().optional(),
  remark: optionalText(500),
  items: z.array(requisitionItemSchema).min(1).max(100),
}).strict().superRefine(requireUniqueSkuIds);
```

Mutation schema：

```ts
export const SupplierPurchaseRequisitionSubmitSchema =
  expectedVersionSchema;
export const SupplierPurchaseRequisitionReviewSchema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum(["approve", "reject"]),
  remark: optionalText(500),
}).strict();
export const SupplierPurchaseRequisitionCancelSchema = z.object({
  expected_version: z.number().int().positive(),
  reason: requiredText(500),
}).strict();
export const SupplierPurchaseRequisitionConvertSchema = z.object({
  expected_version: z.number().int().positive(),
  purchase_order_id: z.uuid(),
}).strict();
```

- [x] **Step 4: 写数据库记录 RED 测试**

严格解析：

```ts
expect(SupplierPurchaseRequisitionSchema.parse(requisition))
  .toEqual(requisition);
expect(SupplierPurchaseRequisitionItemSchema.parse(item)).toEqual(item);
expect(SupplierPurchaseRequisitionCommitmentSchema.parse(commitment))
  .toEqual(commitment);
expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.parse(envelope))
  .toEqual(envelope);
```

numeric 数量和金额必须是字符串；状态、时间和 nullable 审计字段必须严格。

- [x] **Step 5: 运行记录测试确认 RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-requisition-records.test.ts
```

Expected: 模块不存在。

- [x] **Step 6: 实现记录 schema 并运行 GREEN**

定义申请头、申请行、预算承诺、预算分类快照、详情和命令 envelope。所有数据库
记录使用 `.strict()`，命令 envelope 只允许设计中的稳定状态。

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-requisitions.test.ts \
  src/repositories/supplier-purchase-requisition-records.test.ts
```

Expected: PASS。

- [x] **Step 7: 提交契约**

```bash
git add apps/api/src/schema/supplier-purchase-requisitions.ts \
  apps/api/src/schema/supplier-purchase-requisitions.test.ts \
  apps/api/src/repositories/supplier-purchase-requisition-records.ts \
  apps/api/src/repositories/supplier-purchase-requisition-records.test.ts
git commit -m "feat(supplier): 定义采购申请预算契约"
```

### Task 2: 用 migration 建立申请、承诺和权限

**Files:**
- Create: `apps/api/src/services/supplier-purchase-requisition-migration-contract.test.ts`
- Create: `supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql`

- [x] **Step 1: 写 migration 契约 RED 测试**

固定读取 migration 并断言：

```ts
expect(sql).toContain(
  "CREATE TABLE public.supplier_purchase_requisitions",
);
expect(sql).toContain(
  "CREATE TABLE public.supplier_purchase_requisition_items",
);
expect(sql).toContain(
  "CREATE TABLE public.project_cost_commitments",
);
expect(sql).toContain(
  "ADD COLUMN purchase_requisition_id uuid",
);
```

继续检查：

- 三表字段、状态和金额 check。
- 项目、合作供应商、成本分类、申请与采购单的复合外键。
- 申请编号序列和非空 `purchase_requisition_id` 唯一索引。
- 列表、明细和有效承诺索引。
- RLS、FORCE RLS 和 service role 最小授权。
- 三个权限 seed 到租户系统管理员角色。
- `supplier_command_events.resource_type` 接受
  `supplier_purchase_requisition`。
- migration 末尾包含只撤销执行权限、保留审计事实的前向回滚说明。

- [x] **Step 2: 运行 migration 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisition-migration-contract.test.ts
```

Expected: migration 不存在。

- [x] **Step 3: 建立表、外键和约束**

申请状态约束：

```sql
CHECK (status IN (
  'draft', 'pending_approval', 'approved',
  'rejected', 'cancelled', 'converted'
))
```

有效承诺约束：

```sql
CHECK (status IN ('reserved', 'converted', 'released')),
UNIQUE (tenant_id, source_type, source_id, cost_category_id)
```

采购单来源：

```sql
ALTER TABLE public.supplier_purchase_orders
ADD COLUMN purchase_requisition_id uuid NULL;

CREATE UNIQUE INDEX supplier_purchase_orders_requisition_unique
ON public.supplier_purchase_orders(purchase_requisition_id)
WHERE purchase_requisition_id IS NOT NULL;
```

- [x] **Step 4: 建立索引、RLS 和权限**

为申请状态/项目/供应商列表、明细分页和有效承诺汇总建立设计中的索引。三表
`ENABLE ROW LEVEL SECURITY`、`FORCE ROW LEVEL SECURITY`，撤销 PUBLIC/anon/
authenticated 权限，仅授予 service role。通过 migration seed：

```text
supplier.purchase-requisition.view
supplier.purchase-requisition.manage
supplier.purchase-requisition.approve
```

- [x] **Step 5: 运行 migration 契约 GREEN**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisition-migration-contract.test.ts
```

Expected: 表、安全和权限契约 PASS。

- [x] **Step 6: 提交数据基础**

```bash
git add supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql \
  apps/api/src/services/supplier-purchase-requisition-migration-contract.test.ts
git commit -m "feat(db): 建立采购申请预算事实"
```

### Task 3: 实现草稿计价、预算预占和审批命令

**Files:**
- Modify: `apps/api/src/services/supplier-purchase-requisition-migration-contract.test.ts`
- Modify: `supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql`

- [x] **Step 1: 写命令契约 RED 测试**

检查五个命令：

```text
save_supplier_purchase_requisition_draft
submit_supplier_purchase_requisition
review_supplier_purchase_requisition
cancel_supplier_purchase_requisition
convert_supplier_purchase_requisition
```

契约必须断言：

- 参数验证发生在锁之前。
- 锁序符合设计。
- 草稿使用一条集合查询解析全部 SKU、价格和成本分类。
- 提交按成本分类集合汇总，锁定预算行后计算支出和其他有效承诺。
- `within_budget | over_budget` 快照与承诺同事务写入。
- 审批人不能等于申请人。
- 驳回、取消和未履约采购单取消释放承诺。
- 转换调用现有采购单草稿命令且只生成一张订单。
- 新建采购单缺少已批准的 `purchase_requisition_id` 时数据库拒绝，API 不能绕过。
- 价格变化、版本、状态、自审和幂等错误码稳定。

- [x] **Step 2: 运行契约确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisition-migration-contract.test.ts
```

Expected: 命令函数不存在。

- [x] **Step 3: 实现草稿保存命令**

使用与采购单相同的价格筛选和金额公式。请求指纹只包含客户端可提交字段与
actor employee。成功 envelope：

```json
{
  "status": "saved",
  "idempotent": false,
  "requisition": {},
  "version": 1
}
```

更新草稿整单替换明细，不能更换租户、项目或合作供应商。

- [x] **Step 4: 实现预算预占命令**

提交函数按分类建立临时汇总：

```sql
SELECT
  item.cost_category_id,
  sum(item.line_total_amount)::numeric(18,2) AS requested_amount
FROM public.supplier_purchase_requisition_items AS item
WHERE item.purchase_requisition_id = p_requisition_id
GROUP BY item.cost_category_id
ORDER BY item.cost_category_id;
```

在锁定预算后，用集合查询获得已支出和其他 `reserved | converted` 承诺。写入
预算快照、完整申请金额和 `budget_status`，禁止逐分类循环查询。

- [x] **Step 5: 实现审核、取消和转换**

审核命令只处理状态和承诺，权限由 Service 负责。

替换 `save_supplier_purchase_order_draft`，新增默认可空参数
`p_purchase_requisition_id uuid DEFAULT NULL`。`expected_version = 0` 时必须提供已批准
且未转换的申请；更新既有草稿时从订单读取并保持原申请，不允许更换来源。

转换命令：

1. 锁定批准申请。
2. 重新解析价格并比较申请快照。
3. 用派生幂等键调用 `save_supplier_purchase_order_draft`。
4. 写入订单来源。
5. 把承诺改为 `converted`。
6. 把申请改为 `converted`。

扩展 `cancel_supplier_purchase_order`：关联订单尚未开始履约时取消，原子释放
`converted` 承诺。

- [x] **Step 6: 用 EXPLAIN 验证查询计划契约**

在 migration 注释中记录以下查询的索引预期，并在数据库 smoke 中执行：

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT amount
FROM public.project_cost_commitments
WHERE tenant_id = $1
  AND project_id = $2
  AND cost_category_id = $3
  AND status IN ('reserved', 'converted');
```

Expected: 使用有效承诺索引，不出现无界全表扫描。

- [x] **Step 7: 运行契约 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisition-migration-contract.test.ts \
  src/services/supplier-purchase-order-migration-contract.test.ts \
  src/services/supplier-purchase-fulfillment-migration-contract.test.ts
```

Expected: PASS。

```bash
git add supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql \
  apps/api/src/services/supplier-purchase-requisition-migration-contract.test.ts
git commit -m "feat(db): 实现采购申请预算命令"
```

### Task 4: 实现 Repository 和错误映射

**Files:**
- Create: `apps/api/src/repositories/supplier-purchase-requisitions.ts`
- Create: `apps/api/src/repositories/supplier-purchase-requisitions.test.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.ts`
- Modify: `apps/api/src/repositories/supplier-command-errors.test.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-order-records.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.ts`
- Modify: `apps/api/src/repositories/supplier-purchase-orders.test.ts`

- [x] **Step 1: 写 Repository RED 测试**

覆盖：

```ts
await repository.list({
  tenant_id: TENANT_ID,
  visible_project_ids: [PROJECT_ID],
  page: 2,
  pageSize: 20,
  status: "pending_approval",
});
```

断言 `.eq("tenant_id")`、`.in("project_id")`、必要字段、稳定排序和
`.range(20, 39)`。详情按租户和 ID 查询，明细使用独立 `.range()`。

五个命令断言完整 `p_` 参数、字符串 numeric、幂等键和严格 envelope；错误码
必须经 `mapSupplierCommandDatabaseError` 或 `Errors.dbError`。

- [x] **Step 2: 运行 Repository 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-requisitions.test.ts
```

Expected: Repository 模块不存在。

- [x] **Step 3: 实现分页读取和命令调用**

Repository 输入明确包含服务端派生的 `tenant_id` 和项目范围：

```ts
export type SupplierPurchaseRequisitionListInput = {
  tenant_id: string;
  visible_project_ids: string[] | null;
  page: number;
  pageSize: number;
  keyword?: string;
  status?: SupplierPurchaseRequisitionStatus;
  budget_status?: SupplierPurchaseRequisitionBudgetStatus;
  project_id?: string;
  tenant_supplier_id?: string;
};
```

空项目范围直接返回空页。所有列表最多 100，所有响应经 Zod 严格解析。

- [x] **Step 4: 扩展采购单来源投影**

采购单选择字段增加申请 ID 和申请编号关系：

```ts
purchase_requisition:supplier_purchase_requisitions!supplier_purchase_orders_purchase_requisition_id_fkey(
  id,request_no,status,budget_status
)
```

若 PostgREST schema cache 不能稳定解析该关系，改用一次批量 ID hydration，
不得按行查询。

- [x] **Step 5: 扩展稳定错误映射**

映射设计中的九个申请错误码，未知数据库错误继续由 DB_ERROR 包装，不吞异常。

- [x] **Step 6: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-requisitions.test.ts \
  src/repositories/supplier-purchase-orders.test.ts \
  src/repositories/supplier-command-errors.test.ts
```

Expected: PASS。

```bash
git add apps/api/src/repositories/supplier-purchase-requisitions.ts \
  apps/api/src/repositories/supplier-purchase-requisitions.test.ts \
  apps/api/src/repositories/supplier-command-errors.ts \
  apps/api/src/repositories/supplier-command-errors.test.ts \
  apps/api/src/repositories/supplier-purchase-order-records.ts \
  apps/api/src/repositories/supplier-purchase-orders.ts \
  apps/api/src/repositories/supplier-purchase-orders.test.ts
git commit -m "feat(api): 实现采购申请数据访问"
```

### Task 5: 实现 Service、Controller 和路由

**Files:**
- Create: `apps/api/src/services/supplier-purchase-requisitions.ts`
- Create: `apps/api/src/services/supplier-purchase-requisitions.test.ts`
- Create: `apps/api/src/controllers/supplier-purchase-requisitions/index.ts`
- Create: `apps/api/src/controllers/supplier-purchase-requisitions/routes.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [x] **Step 1: 写 Service RED 测试**

依赖注入 fake access/repository，覆盖：

- 无租户、员工或权限时 repository 不被调用。
- 列表项目范围与 `project.read` 求交集。
- mutation 要求 `project.update`。
- 提交前调用供应商准入检查。
- 自审返回 `SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW`。
- 超预算批准同时要求 `supplier.purchase-requisition.approve` 和
  `finance.budget.manage`。
- 预算内批准不要求预算管理权限。
- 所有错误经过 `Errors`。

- [x] **Step 2: 运行 Service 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisitions.test.ts
```

Expected: Service 模块不存在。

- [x] **Step 3: 实现 Service 边界**

使用现有 `supplierPurchaseOrderAccessService` 的项目范围语义和
`TenantSuppliersService.assertCanCreatePurchaseOrder()`。审批逻辑：

```ts
if (input.action === "approve" && requisition.budget_status === "over_budget") {
  access.requirePermission(auth, "finance.budget.manage");
}
if (requisition.created_by_employee_id === scope.employeeId) {
  throw Errors.business(
    409,
    "申请人不能审批自己提交的采购申请",
    "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
  );
}
```

- [x] **Step 4: 写 Controller RED 测试**

断言八条路由、query/params/body 解析、`Idempotency-Key` 必填、Service 参数和
`ResponseHandler.success`：

```text
GET  /supplier-purchase-requisitions
GET  /supplier-purchase-requisitions/:id
GET  /supplier-purchase-requisitions/:id/items
POST /supplier-purchase-requisitions/:id/save-draft
POST /supplier-purchase-requisitions/:id/submit
POST /supplier-purchase-requisitions/:id/review
POST /supplier-purchase-requisitions/:id/cancel
POST /supplier-purchase-requisitions/:id/convert
```

- [x] **Step 5: 实现 Controller 并注册**

Controller 只处理 HTTP；复用采购单 Controller 已确认的幂等键提取模式，不复制
业务逻辑。

- [x] **Step 6: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-requisitions.test.ts \
  src/controllers/supplier-purchase-requisitions/routes.test.ts
bun run typecheck
```

Expected: PASS。

```bash
git add apps/api/src/services/supplier-purchase-requisitions.ts \
  apps/api/src/services/supplier-purchase-requisitions.test.ts \
  apps/api/src/controllers/supplier-purchase-requisitions/index.ts \
  apps/api/src/controllers/supplier-purchase-requisitions/routes.test.ts \
  apps/api/src/routes/index.ts
git commit -m "feat(api): 暴露采购申请预算接口"
```

### Task 6: 把预算承诺加入项目成本预算视图

**Files:**
- Modify: `apps/api/src/repositories/project-cost-budgets.ts`
- Create: `apps/api/src/repositories/project-cost-budgets.test.ts`
- Modify: `apps/api/src/services/project-cost-budgets.ts`
- Create: `apps/api/src/services/project-cost-budgets.test.ts`
- Modify: `apps/admin/components/projects/project-cost-budget-panel-utils.ts`
- Create: `apps/admin/components/projects/project-cost-budget-panel-utils.test.ts`
- Modify: `apps/admin/components/projects/project-cost-budget-panel.tsx`

- [x] **Step 1: 写 API RED 测试**

Repository 必须用一条集合查询读取项目有效承诺，限定必要字段和 `.limit(10_000)`，
超出边界返回 `PROJECT_COST_COMMITMENTS_TOO_MANY_ROWS`。

Service 结果增加：

```ts
{
  budget_amount: 10000,
  expense_amount: 3000,
  commitment_amount: 2500,
  available_amount: 4500,
  remaining_amount: 7000
}
```

分类行也返回 `commitment_amount` 和 `available_amount`。

- [x] **Step 2: 运行 API 测试确认 RED**

Run:

```bash
cd apps/api
bun test src/repositories/project-cost-budgets.test.ts \
  src/services/project-cost-budgets.test.ts
```

Expected: 承诺字段不存在。

- [x] **Step 3: 实现集合查询和汇总**

并行加载预算、支出和承诺：

```ts
const [budgets, expenseTotals, commitmentTotals] = await Promise.all([
  repository.listActiveBudgets(scope),
  repository.listExpenseTotals(scope),
  repository.listCommitmentTotals(scope),
]);
```

`remaining_amount` 保持“预算 - 已支出”的历史语义，
`available_amount = budget - expense - commitment`。

- [x] **Step 4: 写 Admin 工具 RED 测试**

断言金额展示、风险文案和负可用预算：

```ts
expect(formatBudgetAvailability({
  budget_amount: 100,
  expense_amount: 70,
  commitment_amount: 50,
  available_amount: -20,
})).toContain("已承诺");
```

- [x] **Step 5: 扩展预算面板**

总览卡和分类行增加“已承诺”“可用预算”，保持现有中后台密度和响应式布局。

- [x] **Step 6: 运行 GREEN 并提交**

Run:

```bash
cd apps/api
bun test src/repositories/project-cost-budgets.test.ts \
  src/services/project-cost-budgets.test.ts
cd ../admin
bun test components/projects/project-cost-budget-panel-utils.test.ts
```

Expected: PASS。

```bash
git add apps/api/src/repositories/project-cost-budgets.ts \
  apps/api/src/repositories/project-cost-budgets.test.ts \
  apps/api/src/services/project-cost-budgets.ts \
  apps/api/src/services/project-cost-budgets.test.ts \
  apps/admin/components/projects/project-cost-budget-panel-utils.ts \
  apps/admin/components/projects/project-cost-budget-panel-utils.test.ts \
  apps/admin/components/projects/project-cost-budget-panel.tsx
git commit -m "feat(finance): 展示项目采购预算承诺"
```

### Task 7: 建立 Admin 申请契约和状态规则

**Files:**
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-types.ts`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-api.ts`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-rules.ts`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-rules.test.ts`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-rules.ts`
- Modify: `apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts`

- [x] **Step 1: 写规则 RED 测试**

覆盖状态动作：

```ts
expect(actionsFor({ status: "draft", canManage: true }))
  .toEqual(["edit", "submit", "cancel"]);
expect(actionsFor({
  status: "pending_approval",
  canApprove: true,
  isRequester: false,
})).toEqual(["approve", "reject"]);
expect(actionsFor({ status: "approved", canManage: true }))
  .toEqual(["convert", "cancel"]);
```

自审不显示审批动作；超预算缺少预算管理权限不显示批准但保留驳回；只读用户不显示
mutation。

- [x] **Step 2: 运行规则测试确认 RED**

Run:

```bash
cd apps/admin
bun test components/supplier-purchase-requisitions/requisition-rules.test.ts
```

Expected: 模块不存在。

- [x] **Step 3: 实现严格类型、API 和规则**

API mutation 统一生成冻结幂等意图：

```ts
requestBackendJson(`/supplier-purchase-requisitions/${id}/review`, {
  method: "POST",
  headers: { "Idempotency-Key": intent.key },
  body: JSON.stringify(payload),
});
```

响应类型只包含后端字段；任何价格、税率和金额不能进入草稿请求类型。

- [x] **Step 4: 禁止直接新建采购单**

采购订单列表“新建采购单”替换为跳转采购申请的“发起采购申请”。采购单编辑器仍可
编辑转换产生的草稿。

- [x] **Step 5: 运行 GREEN 并提交**

Run:

```bash
cd apps/admin
bun test components/supplier-purchase-requisitions/requisition-rules.test.ts \
  components/supplier-purchase-orders/purchase-order-page.test.ts
```

Expected: PASS。

```bash
git add apps/admin/components/supplier-purchase-requisitions \
  apps/admin/components/supplier-purchase-orders/purchase-order-rules.ts \
  apps/admin/components/supplier-purchase-orders/purchase-order-page.test.ts
git commit -m "feat(admin): 建立采购申请交互契约"
```

### Task 8: 实现 Admin 采购申请工作区

**Files:**
- Create: `apps/admin/app/(console)/supplier-purchase-requisitions/page.tsx`
- Create: `apps/admin/app/(console)/supplier-purchase-requisitions/loading.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-workspace.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-list.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-editor.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-detail.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-review-dialog.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-budget-summary.tsx`
- Create: `apps/admin/components/supplier-purchase-requisitions/requisition-page.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [x] **Step 1: 写页面 RED 测试**

静态和规则测试必须覆盖：

- 页面标题“采购申请”和主按钮。
- 列表服务端分页和五类过滤。
- 编辑器项目、供应商、分页 SKU、成本分类、数量和原因。
- payload 明确不含 `unit_price/tax_rate/amount`。
- 预算卡五个金额事实。
- 版本、价格、预算冲突提示刷新。
- 无权限、加载、空和错误状态。
- 500px 文件上限；超限前先按职责拆分。

- [x] **Step 2: 运行页面测试确认 RED**

Run:

```bash
cd apps/admin
bun test components/supplier-purchase-requisitions/requisition-page.test.ts
```

Expected: 组件不存在。

- [x] **Step 3: 实现列表和工作区**

页面初始查询和用户交互都通过 `requestBackendJson`；URL 保存过滤和分页状态。
列表每行只有一个主要动作，其余放操作菜单。

- [x] **Step 4: 实现编辑器和预算详情**

复用采购单的项目、供应商和分页商品目录选择模式，但每行增加成本分类。客户端金额
只展示最近一次后端保存结果，不自行形成事实。

- [x] **Step 5: 实现审批、取消和转换**

所有 mutation：

- 冻结幂等 key，失败可用原 key 重试。
- pending 时禁用按钮并显示 Spinner。
- 成功后刷新详情、列表和版本。
- 409 冲突不自动重放，展示明确恢复操作。

- [x] **Step 6: 注册导航并运行 GREEN**

Run:

```bash
cd apps/admin
bun test components/supplier-purchase-requisitions/requisition-page.test.ts \
  components/supplier-purchase-requisitions/requisition-rules.test.ts
bun run check
```

Expected: PASS。

- [x] **Step 7: 提交 Admin**

```bash
git add 'apps/admin/app/(console)/supplier-purchase-requisitions' \
  apps/admin/components/supplier-purchase-requisitions \
  apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): 实现采购申请预算工作区"
```

提交前用 `git diff --cached --name-only` 确认没有无关 Admin 文件。

### Task 9: 建立确定性 E2E 和数据库 smoke

**Files:**
- Create: `apps/admin/e2e/supplier-purchase-requisition-mock-fixture.mjs`
- Create: `apps/admin/e2e/supplier-purchase-requisition-mock-backend.mjs`
- Create: `apps/admin/e2e/supplier-purchase-requisition-workflow.spec.ts`
- Create: `apps/admin/playwright.supplier-purchase-requisition.config.ts`
- Create: `apps/api/src/scripts/supplier-purchase-requisition-smoke.ts`
- Create: `apps/api/src/scripts/supplier-purchase-requisition-smoke.test.ts`
- Modify: `apps/api/package.json`

- [x] **Step 1: 写 Playwright RED 工作流**

一个确定性场景完成：

1. 创建并编辑预算内申请。
2. 提交并看到预算承诺。
3. 非申请人批准。
4. 生成采购单草稿。
5. 创建超预算申请。
6. 普通审批人看不到批准动作。
7. 预算管理员批准。
8. 取消另一待审批申请并看到承诺释放。
9. mutation journal 证明客户端没有提交价格和金额。

- [x] **Step 2: 实现独立 Mock Backend**

使用端口 `3994`，仅实现该 E2E 需要的路由、分页和 mutation journal。状态机和预算
金额固定可预测，不访问真实数据库。

- [x] **Step 3: 运行 Playwright GREEN**

Run:

```bash
cd apps/admin
bunx playwright test \
  --config=playwright.supplier-purchase-requisition.config.ts
```

Expected: PASS。

- [x] **Step 4: 写数据库 smoke helper RED 测试**

验证 fixture 使用稳定 UUID、所有操作包在事务中且最终强制回滚；结果严格包含：

```ts
{
  save_replay: true,
  idempotency_conflict: true,
  version_conflict: true,
  self_review_rejected: true,
  concurrent_budget_serialized: true,
  rejection_released: true,
  cancellation_released: true,
  conversion_unique: true,
  cross_tenant_hidden: true,
  explain_uses_index: true,
}
```

- [x] **Step 5: 实现 smoke 并运行本地 helper GREEN**

Run:

```bash
cd apps/api
bun test src/scripts/supplier-purchase-requisition-smoke.test.ts
```

Expected: PASS。

- [x] **Step 6: 提交 E2E 和 smoke**

```bash
git add apps/admin/e2e/supplier-purchase-requisition-* \
  apps/admin/playwright.supplier-purchase-requisition.config.ts \
  apps/api/src/scripts/supplier-purchase-requisition-smoke.ts \
  apps/api/src/scripts/supplier-purchase-requisition-smoke.test.ts \
  apps/api/package.json
git commit -m "test(supplier): 覆盖采购申请预算闭环"
```

### Task 10: 数据库类型、全量验证和发布收口

**Files:**
- Modify: `apps/api/src/types/database.ts`
- Modify: `docs/superpowers/plans/2026-07-30-supplier-purchase-requisition-budget-control.md`

- [x] **Step 1: migration 应用前检查**

Run:

```bash
supabase migration list
```

Expected: 仅 `20260730150000` 为 Local pending，其他 Local/Remote 对齐。

先在事务回滚环境执行 migration 和 smoke。不得手工执行远端 DDL/DML。

- [x] **Step 2: 正式应用 migration**

使用仓库 `Migrate Dev Database` 工作流：

1. `mode=plan`，确认仅一个 pending version。
2. `mode=apply`，确认 applied version 为 `20260730150000`。
3. 再运行 `supabase migration list`，确认 Local/Remote 对齐。

- [x] **Step 3: 生成数据库类型**

使用项目约定的 Supabase project ref 生成：

```bash
supabase gen types typescript --project-id "$DEV_PROJECT_REF" \
  > apps/api/src/types/database.ts
```

只接受新表、函数、权限相关的预期类型差异。

- [x] **Step 4: 运行真实数据库 smoke**

Run:

```bash
cd apps/api
bun run supplier:purchase-requisition:smoke
```

Expected: 十个布尔检查全部为 `true`，事务回滚。

- [x] **Step 5: 运行全量验证**

Run:

```bash
bun run api:typecheck
bun run admin:check
cd apps/api
bun test $(rg --files src -g '*supplier*.test.ts' | sort)
cd ../admin
bun test components/supplier-purchase-requisitions \
  components/supplier-purchase-orders \
  components/projects/project-cost-budget-panel-utils.test.ts
bunx playwright test \
  --config=playwright.supplier-purchase-requisition.config.ts
```

Expected: 0 failure。

- [x] **Step 6: 做完成审计**

逐条对照设计：

- 新采购单不能绕过申请。
- 预算提交原子预占。
- 超预算批准双权限。
- 驳回、申请取消和未履约订单取消释放。
- 转换只有一张订单。
- 列表全部分页且查询有边界。
- migration Local/Remote 对齐。
- Orange 仓库没有任何改动。

**发布证据（2026-07-31）：**

- Task 1–9 的提交链已逐项覆盖契约、数据基础、原子命令、Repository、Service /
  Controller、预算汇总、采购单来源约束、Admin 工作区与 E2E / smoke：
  `ba64d805`、`84a680b0`、`4d2fa67a`、`d1ef8ce8`、`17b853e2`、
  `922cbd08`、`4820f9d8`、`fd8407ca`、`b093082a`，其后的修复提交收紧了
  权限、并发、幂等、精度、深链和 smoke 边界。
- 正式 migration 采用只前进策略。`20260730150000` 建立采购申请预算控制；
  `20260730160000` 修复草稿 RPC 的 `WITH ORDINALITY` 运行时语法；
  `20260730170000` 移除草稿保存对成本分类的显式共享行锁；
  `20260730180000` 将提交阶段分类锁调整为 `FOR NO KEY UPDATE`，在保留分类状态
  保护的同时允许并发草稿外键校验。四版均先完成事务回滚预检，没有手工修改远端数据库。
- Dev 工作流全部成功，且每版均先 plan 后 apply：
  `150000` 为
  [plan 30574184255](https://github.com/LeeFo-china/goose/actions/runs/30574184255) /
  [apply 30574250158](https://github.com/LeeFo-china/goose/actions/runs/30574250158)；
  `160000` 为
  [plan 30575104522](https://github.com/LeeFo-china/goose/actions/runs/30575104522) /
  [apply 30575160634](https://github.com/LeeFo-china/goose/actions/runs/30575160634)；
  `170000` 为
  [plan 30577353384](https://github.com/LeeFo-china/goose/actions/runs/30577353384) /
  [apply 30577407283](https://github.com/LeeFo-china/goose/actions/runs/30577407283)；
  `180000` 为
  [plan 30577865544](https://github.com/LeeFo-china/goose/actions/runs/30577865544) /
  [apply 30577896300](https://github.com/LeeFo-china/goose/actions/runs/30577896300)。
  最终 `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"` 显示
  Local / Remote 全量对齐，远端历史最新版本为 `20260730180000`。
- `supabase gen types --project-id` 返回了缺失既有 supplier 表 / RPC 且未包含新对象的
  异常不完整 schema，因此没有接受该破坏性输出；`--db-url` 路径依赖本机 Docker，
  但当前环境没有 Docker 命令或运行时。最终以现有 `database.ts` 为基线，直接查询 Dev
  PostgreSQL catalog 核对列、空值、默认值、外键、唯一约束、函数签名与授权后，只追加
  3 张表、7 个 service-role 可见 RPC，并补充采购单来源字段 / 参数；diff 为纯新增
  `+569/-0`，契约测试同时引用既有 supplier 表和 RPC，防止类型回退。
- 真实数据库 smoke 返回十项全部为 `true`：
  `save_replay`、`idempotency_conflict`、`version_conflict`、
  `self_review_rejected`、`rejection_released`、`cancellation_released`、
  `conversion_unique`、`cross_tenant_hidden`、`explain_uses_index`、
  `concurrent_budget_serialized`。预算分类与预算随事务回滚；smoke 后采购申请、
  承诺、采购单及并发 supplier fixture 的显式残留计数全部为 `0`。
- 全量验证结果：API supplier 测试 `500 pass / 0 fail`（62 files）；
  Admin 指定组件测试 `108 pass / 0 fail`（10 files）；
  采购申请 Playwright `1 passed`；既有采购单 Playwright `2 passed`；
  `bun run api:typecheck`、`bun run api:build`、`bun run admin:check`、
  Admin production build、API / Admin 文件大小检查和 `git diff --check` 全部通过。
- 完成审计确认：直接新建采购单由来源约束阻断；提交在预算锁内原子预占且并发序列化；
  超预算审批要求双权限；驳回、申请取消和未履约订单取消均释放承诺；转换由唯一约束保证
  一张订单；列表接口均分页且查询受 `.range()` / `.limit()` 或等价边界限制。
  Orange 仓库只读状态与启动基线完全一致，本任务对其零写入。

- [x] **Step 7: 提交类型和计划勾选**

```bash
git add apps/api/src/types/database.ts \
  docs/superpowers/plans/2026-07-30-supplier-purchase-requisition-budget-control.md
git commit -m "chore(api): 更新采购申请数据库类型"
```

- [ ] **Step 8: 请求代码审查并收口分支**

使用 `requesting-code-review` 技能审查需求覆盖、安全、并发、性能、API/Admin 和
测试证据。修复所有阻断问题后，再使用 `finishing-a-development-branch` 技能决定
合并和 worktree 清理方式。
