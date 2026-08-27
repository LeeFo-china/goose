import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const BATCH_ID = "a0000000-0000-4000-8000-000000000002";
const PROJECT_ID = "a0000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "a0000000-0000-4000-8000-000000000004";
const USER_ID = "a0000000-0000-4000-8000-000000000005";
const SKU_ID = "a0000000-0000-4000-8000-000000000006";
const CATEGORY_ID = "a0000000-0000-4000-8000-000000000007";
const REQUISITION_ID = "a0000000-0000-4000-8000-000000000008";
const RELATIONSHIP_ID = "a0000000-0000-4000-8000-000000000009";
const SUPPLIER_ID = "a0000000-0000-4000-8000-000000000010";
const AT = "2026-08-27T08:00:00.000Z";

type RpcCall = { name: string; params: Record<string, unknown> };

async function repositoryFor(results: Array<{ data: unknown; error: unknown }>) {
  const calls: RpcCall[] = [];
  const client = {
    from() {
      throw new Error("read gateway must not be used by commands");
    },
    async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return results.shift() ?? { data: null, error: null };
    },
  };
  const { SupplierPurchaseBatchesRepository } = await import(
    "./supplier-purchase-batches"
  );
  return {
    repository: new SupplierPurchaseBatchesRepository(() => client as never),
    calls,
  };
}

const context = {
  batch_id: BATCH_ID,
  tenant_id: TENANT_ID,
  expected_version: 1,
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "stable-key-1",
};

describe("SupplierPurchaseBatchesRepository commands", () => {
  test("calls the exact save RPC with client-owned intent only", async () => {
    const split_preview = [{ tenant_supplier_id: RELATIONSHIP_ID,
      supplier_id: SUPPLIER_ID, supplier_name: "测试供应商", item_count: 1,
      subtotal_amount: "100.00", tax_amount: "13.00",
      total_amount: "113.00" }];
    const { repository, calls } = await repositoryFor([{
      data: { status: "saved", idempotent: false, batch, version: 1,
        split_preview },
      error: null,
    }]);
    const result = await repository.saveDraft({
      ...context,
      expected_version: 0,
      project_id: PROJECT_ID,
      reason: "项目主材采购",
      expected_delivery_date: "2026-09-10",
      remark: null,
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: CATEGORY_ID,
        quantity: "2.5000",
      }],
    });
    expect(result).toEqual({
      status: "saved", idempotent: false, batch, version: 1, split_preview,
    });
    expect(calls).toEqual([{
      name: "save_supplier_purchase_batch_draft",
      params: {
        p_batch_id: BATCH_ID,
        p_tenant_id: TENANT_ID,
        p_project_id: PROJECT_ID,
        p_expected_version: 0,
        p_reason: "项目主材采购",
        p_expected_delivery_date: "2026-09-10",
        p_remark: null,
        p_items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: CATEGORY_ID,
          quantity: "2.5000",
        }],
        p_actor_user_id: USER_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "stable-key-1",
      },
    }]);
  });

  test("calls submit and cancel with exact signatures", async () => {
    const submittedBatch = { ...batch, status: "pending_approval", version: 2,
      budget_checked_at: AT, budget_status: "within_budget",
      budget_snapshot: { [CATEGORY_ID]: { requested_amount: "100.00",
        budget_amount: "500.00", expense_amount: "10.00",
        other_commitment_amount: "20.00", available_amount: "470.00" } },
      split_generation: 1, submitted_by_employee_id: EMPLOYEE_ID,
      submitted_at: AT };
    const cancelledBatch = { ...submittedBatch, status: "cancelled", version: 3,
      cancelled_by_employee_id: EMPLOYEE_ID, cancelled_at: AT,
      cancel_reason: "采购计划取消" };
    const { repository, calls } = await repositoryFor([
      { data: { status: "submitted", idempotent: false,
        batch: submittedBatch, version: 2,
        requisition_ids: [REQUISITION_ID] }, error: null },
      { data: { status: "cancelled", idempotent: false,
        batch: cancelledBatch, version: 3 },
        error: null },
    ]);
    expect(await repository.submit(context)).toMatchObject({
      status: "submitted", version: 2,
      requisition_ids: [REQUISITION_ID], idempotent: false,
    });
    expect(await repository.cancel({
      ...context, expected_version: 2, reason: "采购计划取消",
    })).toMatchObject({ status: "cancelled", version: 3, idempotent: false });
    expect(calls).toEqual([
      { name: "submit_supplier_purchase_batch", params: {
        p_batch_id: BATCH_ID, p_tenant_id: TENANT_ID, p_expected_version: 1,
        p_actor_user_id: USER_ID, p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "stable-key-1",
      } },
      { name: "cancel_supplier_purchase_batch", params: {
        p_batch_id: BATCH_ID, p_tenant_id: TENANT_ID, p_expected_version: 2,
        p_reason: "采购计划取消", p_actor_user_id: USER_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "stable-key-1",
      } },
    ]);
  });

  test("rejects malformed or cross-identity success envelopes", async () => {
    const { repository } = await repositoryFor([
      { data: { status: "saved", batch: { ...batch, total_amount: 100 },
        version: 1 }, error: null },
      { data: { status: "submitted", batch: { ...batch, id: PROJECT_ID },
        version: 1, requisition_ids: [] }, error: null },
    ]);
    await expect(repository.saveDraft({
      ...context, expected_version: 0, project_id: PROJECT_ID, reason: "采购",
      items: [{ supplier_sku_id: SKU_ID, cost_category_id: CATEGORY_ID,
        quantity: "1.0000" }],
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    await expect(repository.submit(context)).rejects.toMatchObject({
      statusCode: 500, code: "DB_ERROR",
    });
  });

  test("uses database and envelope error boundaries", async () => {
    const db = await repositoryFor([{ data: null,
      error: { message: "database unavailable" } }]);
    await expect(db.repository.submit(context)).rejects.toMatchObject({
      statusCode: 500, code: "DB_ERROR",
    });
    const envelope = await repositoryFor([{ data: {
      status: "version_conflict",
      idempotent: true,
      error_code: "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT", version: 2,
    }, error: null }]);
    await expect(envelope.repository.submit(context)).rejects.toMatchObject({
      statusCode: 409, code: "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT",
    });
  });

  test("rejects duplicate requisition ids as a database contract breach", async () => {
    const submittedBatch = { ...batch, status: "pending_approval", version: 2,
      supplier_count: 2 };
    const { repository } = await repositoryFor([{ data: {
      status: "submitted", idempotent: false, batch: submittedBatch,
      version: 2, requisition_ids: [REQUISITION_ID, REQUISITION_ID],
    }, error: null }]);
    await expect(repository.submit(context)).rejects.toMatchObject({
      statusCode: 500, code: "DB_ERROR",
    });
  });

  test("keeps replayed price changes as business errors with strict details", async () => {
    const details = [{ supplier_sku_id: SKU_ID, product_name: "测试商品",
      sku_name: "测试规格", frozen_unit_price: "100.00",
      current_unit_price: "101.00", frozen_price_version: 1,
      current_price_version: 2 }];
    const { repository } = await repositoryFor([{ data: {
      status: "price_changed", idempotent: true,
      error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", version: 1,
      details,
    }, error: null }]);
    await expect(repository.submit(context)).rejects.toMatchObject({
      statusCode: 409, code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
      details,
    });
  });
});

const batch = {
  id: BATCH_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
  batch_no: "PB-20260827-00000001", status: "draft",
  reason: "项目主材采购", expected_delivery_date: "2026-09-10", remark: null,
  priced_at: AT, currency: "CNY", subtotal_amount: "100.00",
  tax_amount: "13.00", total_amount: "113.00", budget_checked_at: null,
  budget_status: "unchecked", budget_snapshot: {}, split_generation: 0,
  supplier_count: 1, item_count: 1, version: 1,
  created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null, submitted_at: null,
  reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
  cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  created_at: AT, updated_at: AT,
} as const;
