import { expect, mock, test } from "bun:test";
import { SupplierPayableEventSchema, SupplierPaymentRequestSchema, SupplierPaymentSchema, SupplierPaymentCommandEnvelopeSchema, ProjectCostEventSchema } from "./supplier-payment-records";
import { destination, id, payment, paymentListItem, paymentRequest, payable, requestListItem, timestamp, warehouseId } from "./supplier-payment-destination.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const page = (item: unknown) => ({ items: [item], total: 1, page: 1, page_size: 20 });

test("financial facts accept exclusive warehouse destinations but project cost facts remain project-only", () => {
  expect(SupplierPaymentRequestSchema.safeParse(paymentRequest).success).toBe(true);
  expect(SupplierPaymentSchema.safeParse(payment).success).toBe(true);
  const event = { id, tenant_id: id, ...destination, tenant_supplier_id: id, supplier_id: id, cost_category_id: id,
    supplier_purchase_order_id: id, supplier_purchase_order_item_id: id, receipt_id: id, receipt_item_id: id,
    source_type: "supplier_purchase_receipt_item", source_id: id, amount: "10.00", currency: "CNY",
    occurred_at: timestamp, due_at: timestamp, created_by_employee_id: id, created_at: timestamp };
  expect(SupplierPayableEventSchema.safeParse(event).success).toBe(true);
  expect(ProjectCostEventSchema.safeParse(event).success).toBe(false);
  for (const fields of [{ project_id: id }, { warehouse_id: null }, { destination_type: "project" }]) {
    expect(SupplierPaymentRequestSchema.safeParse({ ...paymentRequest, ...fields }).success).toBe(false);
  }
  const envelope = { status: "paid", idempotent: true, version: 2,
    payment_request: { ...paymentRequest, status: "paid", version: 2 }, payment };
  expect(SupplierPaymentCommandEnvelopeSchema.safeParse(envelope).success).toBe(true);
  expect(SupplierPaymentCommandEnvelopeSchema.safeParse({ ...envelope, payment: { ...payment, warehouse_id: id } }).success).toBe(false);
});

test("payable list/batch/options forward authorized warehouse scope and preserve paginated records", async () => {
  const { SupplierPayablesRepository } = await import("./supplier-payables");
  const rpc = mock(async (name: string, _params: Record<string, unknown>) => ({
    data: name === "get_supplier_payables_by_ids" ? [payable] : name === "list_supplier_payable_filter_options"
      ? page({ id: warehouseId, label: "停用仓库" }) : page(payable), error: null,
  }));
  const repo = new SupplierPayablesRepository(() => ({ rpc }));
  const scope = { tenant_id: id, visible_project_ids: [], include_warehouse: true, destination_type: "warehouse" as const, warehouse_id: warehouseId };
  expect((await repo.list({ ...scope, page: 1, pageSize: 20 })).list[0]).toMatchObject(destination);
  expect(await repo.batch({ ...scope, ids: [id] })).toEqual([payable]);
  await repo.listFilterOptions({ ...scope, type: "warehouse", page: 1, pageSize: 20 });
  expect(rpc).toHaveBeenCalledWith("list_supplier_payables", expect.objectContaining({
    p_include_warehouse: true, p_visible_project_ids: [], p_destination_type: "warehouse", p_warehouse_id: warehouseId,
  }));
  expect(rpc).toHaveBeenCalledWith("get_supplier_payables_by_ids", expect.objectContaining({ p_include_warehouse: true }));
  expect(rpc).toHaveBeenCalledWith("list_supplier_payable_filter_options", expect.objectContaining({ p_type: "warehouse", p_include_warehouse: true }));
});

test("payment requests and records forward destination and parse warehouse command results", async () => {
  const { SupplierPaymentRequestsRepository } = await import("./supplier-payment-requests");
  const rpc = mock(async (name: string, _params: Record<string, unknown>) => ({
    data: name === "list_supplier_payment_requests" ? page(requestListItem)
      : name === "list_supplier_payment_request_payments" ? page(paymentListItem)
      : name === "get_supplier_payment_request_detail" ? { payment_request: paymentRequest, allocations: [] }
      : { status: "saved", idempotent: false, payment_request: paymentRequest, version: 1 }, error: null,
  }));
  const repo = new SupplierPaymentRequestsRepository(() => ({ rpc }));
  expect((await repo.list({ tenant_id: id, visible_project_ids: [], include_warehouse: true, ...destination,
    project_id: undefined, warehouse_id: warehouseId, page: 1, pageSize: 20 })).list[0]).toMatchObject(destination);
  expect(await repo.detail(id, id)).toMatchObject({ payment_request: destination });
  expect((await repo.listPayments({ tenant_id: id, payment_request_id: id, page: 1, pageSize: 20 })).list[0]).toMatchObject(destination);
  await repo.saveDraft({ tenant_id: id, payment_request_id: id, actor_user_id: id, actor_employee_id: id, idempotency_key: id,
    expected_version: 0, ...destination, tenant_supplier_id: id, reason: "材料款", remark: null,
    allocations: [{ payable_event_id: id, requested_amount: "10.00" }] });
  expect(rpc).toHaveBeenCalledWith("save_supplier_payment_request_draft", expect.objectContaining({
    p_project_id: null, p_destination_type: "warehouse", p_warehouse_id: warehouseId,
  }));
});
