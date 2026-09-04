# 采购单供应商分享与导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为采购单补齐供应商分享链接、供应商只读查看、确认收到、打印预览、真实 PDF/XLSX 导出和批次 XLSX 导出。

**Architecture:** Supabase migration 建立采购单分享链接表和索引；Fastify 继续保持 controller/service/repository 分层；导出层使用同一份采购单快照数据生成 JSON 预览、PDF 和 XLSX，避免各端重复拼金额。公开 token 路由只通过高熵分享 token 读取单个采购单，不接受客户端传租户或供应商范围。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、exceljs、pdfkit、Node Buffer/stream

**Approved design:** `docs/superpowers/specs/2026-09-04-supplier-purchase-order-share-export-design.md`

---

## File Structure

- Create: `supabase/migrations/20260904150000_create_supplier_purchase_order_share_links.sql`
  - 分享链接表、索引、RLS、状态约束、updated_at trigger。
- Modify: `apps/api/package.json`
  - 增加 `exceljs`、`pdfkit`。
- Create: `apps/api/src/schema/supplier-purchase-order-sharing.ts`
  - share-link、public token、confirm-view、print/export DTO schema。
- Create: `apps/api/src/schema/supplier-purchase-order-sharing.test.ts`
  - schema 边界测试。
- Create: `apps/api/src/repositories/supplier-purchase-order-sharing.ts`
  - 分享链接 CRUD、share token 查询、view/confirm 记录、导出快照查询。
- Create: `apps/api/src/repositories/supplier-purchase-order-sharing.test.ts`
  - repository query/RPC/parse 单测。
- Create: `apps/api/src/services/supplier-purchase-order-sharing.ts`
  - 权限、token 生成、幂等、公开状态判断、快照组装。
- Create: `apps/api/src/services/supplier-purchase-order-sharing.test.ts`
  - service 权限、状态、幂等、过期/禁用测试。
- Create: `apps/api/src/services/supplier-purchase-order-exporters.ts`
  - PDF/XLSX Buffer 生成。
- Create: `apps/api/src/services/supplier-purchase-order-exporters.test.ts`
  - 验证生成文件 magic bytes、核心文本/工作表字段。
- Modify: `apps/api/src/controllers/supplier-purchase-orders/index.ts`
  - 增加员工分享、print-preview、order PDF/XLSX、public token 详情/确认/导出路由。
- Modify: `apps/api/src/controllers/supplier-purchase-orders/routes.test.ts`
  - 路由注册、header、content-type、service 调用测试。
- Modify: `apps/api/src/controllers/supplier-purchase-batches/index.ts`
  - 增加批次 XLSX 导出。
- Modify: `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
  - 批次导出路由测试。
- Modify: `apps/api/src/plugins/auth/legacy/routes.ts`
  - 放行 `/public/supplier-purchase-orders/:token*` 公开 GET/POST。
- Modify: `apps/api/src/plugins/auth/legacy/routes.test.ts`
  - public bypass 测试。
- Modify: `apps/api/src/services/tenant-service-capability-map.ts`
  - 将新增员工鉴权采购导出/分享路由归类为 excluded/not_trial_capability。
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`
  - 全量路由分类和新增路由断言。
- Modify: `docs/miniprogram/2026-09-04-supplier-purchase-order-fulfillment-handoff.md`
  - 增补第二阶段 Orange 对接契约。

---

### Task 1: 增加依赖并确认真实 API

- [ ] **Step 1: 安装依赖**

Run:

```bash
cd apps/api
bun add exceljs pdfkit
```

Expected:

- `apps/api/package.json` 增加 `exceljs`、`pdfkit`。
- lockfile 更新。

- [ ] **Step 2: 核对导出 API**

Run:

```bash
cd apps/api
bun -e 'import ExcelJS from "exceljs"; import PDFDocument from "pdfkit"; console.log(typeof ExcelJS.Workbook, typeof PDFDocument)'
```

Expected:

```text
function function
```

如果导入形式不同，按实际包导出修改，不猜 API。

---

### Task 2: 写 schema RED 测试并实现 schema

- [ ] **Step 1: 创建 failing test**

Create `apps/api/src/schema/supplier-purchase-order-sharing.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

const UUID = "62000000-0000-4000-8000-000000000001";

describe("supplier purchase order sharing schema", () => {
  test("parses share link creation and clamps supported expiry range", async () => {
    const { SupplierPurchaseOrderShareLinkCreateSchema } = await import(
      "./supplier-purchase-order-sharing"
    );

    expect(SupplierPurchaseOrderShareLinkCreateSchema.parse({})).toEqual({
      expires_in_days: 30,
    });
    expect(SupplierPurchaseOrderShareLinkCreateSchema.parse({
      expires_in_days: 7,
    })).toEqual({ expires_in_days: 7 });
    expect(() => SupplierPurchaseOrderShareLinkCreateSchema.parse({
      expires_in_days: 0,
    })).toThrow();
    expect(() => SupplierPurchaseOrderShareLinkCreateSchema.parse({
      expires_in_days: 91,
    })).toThrow();
  });

  test("parses public token and confirm view body", async () => {
    const {
      SupplierPurchaseOrderShareTokenParamSchema,
      SupplierPurchaseOrderShareConfirmSchema,
    } = await import("./supplier-purchase-order-sharing");

    expect(SupplierPurchaseOrderShareTokenParamSchema.parse({
      token: "po_share_abcdefghijklmnopqrstuvwxyz1234567890",
    }).token).toContain("po_share_");
    expect(SupplierPurchaseOrderShareConfirmSchema.parse({
      confirmed_at: "2026-09-04T15:00:00+08:00",
      remark: "已收到",
    })).toEqual({
      confirmed_at: "2026-09-04T15:00:00+08:00",
      remark: "已收到",
    });
    expect(SupplierPurchaseOrderShareConfirmSchema.parse({
      confirmed_at: "2026-09-04T15:00:00+08:00",
    })).toEqual({
      confirmed_at: "2026-09-04T15:00:00+08:00",
    });
  });

  test("rejects invalid tokens, dates, remarks and unknown fields", async () => {
    const {
      SupplierPurchaseOrderShareTokenParamSchema,
      SupplierPurchaseOrderShareConfirmSchema,
    } = await import("./supplier-purchase-order-sharing");

    expect(() => SupplierPurchaseOrderShareTokenParamSchema.parse({
      token: "short",
    })).toThrow();
    expect(() => SupplierPurchaseOrderShareTokenParamSchema.parse({
      token: "contains spaces",
    })).toThrow();
    expect(() => SupplierPurchaseOrderShareConfirmSchema.parse({
      confirmed_at: "2026-09-04",
    })).toThrow();
    expect(() => SupplierPurchaseOrderShareConfirmSchema.parse({
      confirmed_at: "2026-09-04T15:00:00+08:00",
      remark: "x".repeat(501),
    })).toThrow();
    expect(() => SupplierPurchaseOrderShareConfirmSchema.parse({
      confirmed_at: "2026-09-04T15:00:00+08:00",
      extra: UUID,
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-order-sharing.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement schema**

Create `apps/api/src/schema/supplier-purchase-order-sharing.ts`:

```ts
import { z } from "zod";

const optionalTrimmedText = (max: number, label: string) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 个字符`)
    .nullable().optional();

export const SupplierPurchaseOrderShareLinkCreateSchema = z.object({
  expires_in_days: z.number().int().min(1).max(90).optional().default(30),
}).strict();

export const SupplierPurchaseOrderShareTokenParamSchema = z.object({
  token: z.string().trim()
    .min(24, "分享 token 过短")
    .max(120, "分享 token 过长")
    .regex(/^[A-Za-z0-9_-]+$/, "分享 token 格式不正确"),
}).strict();

export const SupplierPurchaseOrderShareConfirmSchema = z.object({
  confirmed_at: z.iso.datetime({ offset: true }),
  remark: optionalTrimmedText(500, "确认备注"),
}).strict();

export type SupplierPurchaseOrderShareLinkCreateInput =
  z.infer<typeof SupplierPurchaseOrderShareLinkCreateSchema>;
export type SupplierPurchaseOrderShareConfirmInput =
  z.infer<typeof SupplierPurchaseOrderShareConfirmSchema>;
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-order-sharing.test.ts
```

Expected: all tests pass.

---

### Task 3: 增加分享链接 migration

- [ ] **Step 1: 创建 migration**

Create `supabase/migrations/20260904150000_create_supplier_purchase_order_share_links.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.supplier_purchase_order_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  share_token text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  last_viewed_at timestamptz NULL,
  viewed_count integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz NULL,
  confirm_remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_share_links_order_tenant_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_order_supplier_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id, supplier_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_relationship_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_share_links_token_check
    CHECK (share_token ~ '^pos_[A-Za-z0-9_-]{32,}$'),
  CONSTRAINT supplier_purchase_order_share_links_idempotency_key_check
    CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 120),
  CONSTRAINT supplier_purchase_order_share_links_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT supplier_purchase_order_share_links_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT supplier_purchase_order_share_links_viewed_count_check
    CHECK (viewed_count >= 0),
  CONSTRAINT supplier_purchase_order_share_links_confirm_remark_check
    CHECK (confirm_remark IS NULL OR char_length(btrim(confirm_remark)) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_purchase_order_share_links_token_key
ON public.supplier_purchase_order_share_links(share_token);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_purchase_order_share_links_idempotency_key
ON public.supplier_purchase_order_share_links(
  tenant_id,
  supplier_purchase_order_id,
  created_by_employee_id,
  idempotency_key
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_order_status_idx
ON public.supplier_purchase_order_share_links(
  tenant_id,
  supplier_purchase_order_id,
  status,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_employee_created_idx
ON public.supplier_purchase_order_share_links(
  tenant_id,
  created_by_employee_id,
  created_at DESC
);

CREATE INDEX IF NOT EXISTS supplier_purchase_order_share_links_active_expiry_idx
ON public.supplier_purchase_order_share_links(expires_at)
WHERE status = 'active';

DROP TRIGGER IF EXISTS supplier_purchase_order_share_links_updated_at
ON public.supplier_purchase_order_share_links;

CREATE TRIGGER supplier_purchase_order_share_links_updated_at
BEFORE UPDATE ON public.supplier_purchase_order_share_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supplier_purchase_order_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_share_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_purchase_order_share_links FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_purchase_order_share_links TO service_role;
```

- [ ] **Step 2: migration 静态核查**

Run:

```bash
rg -n "supplier_purchase_order_share_links|share_token|idempotency_key|ENABLE ROW LEVEL SECURITY|GRANT SELECT, INSERT, UPDATE" supabase/migrations/20260904150000_create_supplier_purchase_order_share_links.sql
```

Expected: all key definitions appear.

---

### Task 4: Repository 和 Service

- [ ] **Step 1: 写 repository/service RED tests**

Create focused tests:

- `apps/api/src/repositories/supplier-purchase-order-sharing.test.ts`
- `apps/api/src/services/supplier-purchase-order-sharing.test.ts`

Required assertions:

- create inserts high-entropy `share_token`; repeated same employee/order/idempotency key returns same link.
- active unexpired link can be found by share token.
- public lookup joins order, project, supplier and items with limited fields.
- service refuses to share non-submitted order.
- service maps missing/disabled/expired token to stable business errors.
- service returns `share_path` and `public_url`.
- confirm-view with same idempotency key and same request is idempotent.

- [ ] **Step 2: Run RED**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-order-sharing.test.ts \
  src/services/supplier-purchase-order-sharing.test.ts
```

Expected: fail because modules do not exist.

- [ ] **Step 3: Implement repository**

Repository must expose:

```ts
findReusableActiveLink(input)
createLink(input)
findLinkByTokenHash(input)
recordViewed(input)
confirmViewed(input)
getOrderSnapshot(input)
getBatchOrderSnapshots(input)
```

Query rules:

- Use `select` with explicit columns.
- Use `limit(100)` for order items.
- Use `.range()` for batch order list if batch export uses pagination internally.
- No `select("*")`.

- [ ] **Step 4: Implement service**

Service must expose:

```ts
createShareLink(auth, orderId, input, idempotencyKey)
getPublicOrder(token)
confirmPublicView(token, input, idempotencyKey)
getEmployeePrintPreview(auth, orderId)
getPublicPrintPreview(token)
exportEmployeeOrderPdf(auth, orderId)
exportEmployeeOrderXlsx(auth, orderId)
exportPublicOrderPdf(token)
exportPublicOrderXlsx(token)
exportBatchXlsx(auth, batchId)
```

Token:

```ts
const token = `po_${randomBytes(32).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token).digest("hex");
```

Errors:

- `SUPPLIER_PURCHASE_ORDER_SHARE_LINK_NOT_FOUND`
- `SUPPLIER_PURCHASE_ORDER_SHARE_LINK_DISABLED`
- `SUPPLIER_PURCHASE_ORDER_SHARE_LINK_EXPIRED`
- `SUPPLIER_PURCHASE_ORDER_SHARE_NOT_ALLOWED`

- [ ] **Step 5: Run GREEN**

Run:

```bash
cd apps/api
bun test src/repositories/supplier-purchase-order-sharing.test.ts \
  src/services/supplier-purchase-order-sharing.test.ts
```

Expected: all tests pass.

---

### Task 5: PDF/XLSX exporter

- [ ] **Step 1: 写 exporter RED test**

Create `apps/api/src/services/supplier-purchase-order-exporters.test.ts`:

Assertions:

- PDF result starts with `%PDF`.
- XLSX result starts with ZIP magic bytes `PK`.
- XLSX workbook has sheet named by sanitized supplier/order value.
- XLSX contains order no, supplier name, product snapshot and totals.
- Missing font path falls back without throwing in test environment.

- [ ] **Step 2: Run RED**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-order-exporters.test.ts
```

Expected: fail because exporter module does not exist.

- [ ] **Step 3: Implement exporter**

Use:

```ts
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
```

Export:

```ts
buildPurchaseOrderPdf(snapshot): Promise<Buffer>
buildPurchaseOrderXlsx(snapshot): Promise<Buffer>
buildPurchaseBatchXlsx(batchSnapshot): Promise<Buffer>
```

Content rules:

- Use snapshot fields only.
- Format numeric strings for display, do not recalculate totals.
- Sanitize sheet names to 31 characters.
- Set response filenames in controller, not exporter.

- [ ] **Step 4: Run GREEN**

Run:

```bash
cd apps/api
bun test src/services/supplier-purchase-order-exporters.test.ts
```

Expected: all tests pass.

---

### Task 6: Controllers, auth bypass, route capability

- [ ] **Step 1: 写 controller and route RED tests**

Modify:

- `apps/api/src/controllers/supplier-purchase-orders/routes.test.ts`
- `apps/api/src/controllers/supplier-purchase-batches/routes.test.ts`
- `apps/api/src/plugins/auth/legacy/routes.test.ts`
- `apps/api/src/services/tenant-service-capability-map.test.ts`

Expected route inventory includes:

```text
POST /supplier-purchase-orders/:id/share-link
GET /supplier-purchase-orders/:id/print-preview
GET /supplier-purchase-orders/:id/export.pdf
GET /supplier-purchase-orders/:id/export.xlsx
GET /supplier-purchase-batches/:id/export.xlsx
GET /public/supplier-purchase-orders/:token
POST /public/supplier-purchase-orders/:token/confirm-view
GET /public/supplier-purchase-orders/:token/print-preview
GET /public/supplier-purchase-orders/:token/export.pdf
GET /public/supplier-purchase-orders/:token/export.xlsx
```

- [ ] **Step 2: Run RED**

Run:

```bash
cd apps/api
bun test src/controllers/supplier-purchase-orders/routes.test.ts \
  src/controllers/supplier-purchase-batches/routes.test.ts \
  src/plugins/auth/legacy/routes.test.ts \
  src/services/tenant-service-capability-map.test.ts
```

Expected: route assertions fail.

- [ ] **Step 3: Implement controllers**

Controller rules:

- Parse params/body/query only.
- Require idempotency key for `share-link` and `confirm-view`.
- Use `reply.header("Content-Type", ...)`.
- Use `reply.header("Content-Disposition", ...)`.
- Return `reply.send(buffer)` for downloads.
- No business query logic in controller.

- [ ] **Step 4: Implement auth bypass and capability map**

Public routes:

```ts
if (
  url.startsWith("/public/supplier-purchase-orders/")
  && (method === "GET" || method === "HEAD" || method === "POST")
) return true;
```

Capability map:

- Existing top-level `supplier-purchase-orders` already excluded.
- Add tests for route families so future route additions remain classified.

- [ ] **Step 5: Run GREEN**

Run:

```bash
cd apps/api
bun test src/controllers/supplier-purchase-orders/routes.test.ts \
  src/controllers/supplier-purchase-batches/routes.test.ts \
  src/plugins/auth/legacy/routes.test.ts \
  src/services/tenant-service-capability-map.test.ts
```

Expected: all tests pass.

---

### Task 7: 更新小程序交接文档

- [ ] **Step 1: 更新 handoff**

Modify `docs/miniprogram/2026-09-04-supplier-purchase-order-fulfillment-handoff.md`:

- 增加第二阶段接口最终契约。
- 标明 PDF/XLSX 为真实二进制文件。
- 标明 public token 页面不要求供应商登录。
- 标明供应商确认收到不等同于履约确认。
- 给 Orange 提供按钮、分享卡片、下载、错误处理和 smoke 清单。

- [ ] **Step 2: 校验 Markdown**

Run:

```bash
git diff --check -- docs/miniprogram/2026-09-04-supplier-purchase-order-fulfillment-handoff.md
```

Expected: no output, exit 0.

---

### Task 8: 全量验证、migration、dev 发布

- [ ] **Step 1: API 单测**

Run:

```bash
cd apps/api
bun test src/schema/supplier-purchase-order-sharing.test.ts \
  src/repositories/supplier-purchase-order-sharing.test.ts \
  src/services/supplier-purchase-order-sharing.test.ts \
  src/services/supplier-purchase-order-exporters.test.ts \
  src/controllers/supplier-purchase-orders/routes.test.ts \
  src/controllers/supplier-purchase-batches/routes.test.ts \
  src/plugins/auth/legacy/routes.test.ts \
  src/services/tenant-service-capability-map.test.ts
```

Expected: all pass.

- [ ] **Step 2: Typecheck/build/file-size**

Run:

```bash
bun run api:check
```

Expected: typecheck, build and API file-size pass.

- [ ] **Step 3: Apply dev migration**

Run existing project migration workflow for dev. Before applying, list pending migration; after applying, run migration list again and confirm Local/Remote align.

- [ ] **Step 4: Commit implementation**

Use one focused commit:

```bash
git add apps/api/package.json bun.lock supabase/migrations/20260904150000_create_supplier_purchase_order_share_links.sql apps/api/src/schema/supplier-purchase-order-sharing.ts apps/api/src/schema/supplier-purchase-order-sharing.test.ts apps/api/src/repositories/supplier-purchase-order-sharing.ts apps/api/src/repositories/supplier-purchase-order-sharing.test.ts apps/api/src/services/supplier-purchase-order-sharing.ts apps/api/src/services/supplier-purchase-order-sharing.test.ts apps/api/src/services/supplier-purchase-order-exporters.ts apps/api/src/services/supplier-purchase-order-exporters.test.ts apps/api/src/controllers/supplier-purchase-orders/index.ts apps/api/src/controllers/supplier-purchase-orders/routes.test.ts apps/api/src/controllers/supplier-purchase-batches/index.ts apps/api/src/controllers/supplier-purchase-batches/routes.test.ts apps/api/src/plugins/auth/legacy/routes.ts apps/api/src/plugins/auth/legacy/routes.test.ts apps/api/src/services/tenant-service-capability-map.ts apps/api/src/services/tenant-service-capability-map.test.ts docs/miniprogram/2026-09-04-supplier-purchase-order-fulfillment-handoff.md docs/superpowers/specs/2026-09-04-supplier-purchase-order-share-export-design.md docs/superpowers/plans/2026-09-04-supplier-purchase-order-share-export.md
git commit -m "feat(api): 增加采购单分享和导出"
```

- [ ] **Step 5: Push main and deploy dev**

Run established deployment flow for Gooes dev. Record:

- commit SHA
- dev API revision
- migration status
- smoke order ID
- generated share path
- PDF response content-type
- XLSX response content-type

- [ ] **Step 6: Dev smoke**

Using `18800003002`:

1. `POST /supplier-purchase-orders/:id/share-link`
2. `GET /public/supplier-purchase-orders/:token`
3. `POST /public/supplier-purchase-orders/:token/confirm-view`
4. `GET /supplier-purchase-orders/:id/export.pdf`
5. `GET /supplier-purchase-orders/:id/export.xlsx`
6. `GET /supplier-purchase-batches/:id/export.xlsx`

Expected:

- Share link created.
- Public detail returns only one PO.
- Confirm-view idempotency works.
- PDF starts with `%PDF`.
- XLSX starts with `PK`.
- Batch XLSX downloads successfully.
