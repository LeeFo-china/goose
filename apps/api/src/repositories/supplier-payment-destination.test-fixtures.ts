export const id = "84000000-0000-4000-8000-000000000001";
export const warehouseId = "84000000-0000-4000-8000-000000000002";
export const timestamp = "2026-09-07T00:00:00Z";
export const destination = { destination_type: "warehouse" as const, project_id: null, warehouse_id: warehouseId };
export const paymentRequest = {
  id, tenant_id: id, ...destination, tenant_supplier_id: id, supplier_id: id, request_no: "SPR-1",
  status: "draft", currency: "CNY", requested_amount: "10.00", paid_amount: "0.00", reason: "材料款",
  remark: null, version: 1, submitted_by_employee_id: null, submitted_at: null, reviewed_by_employee_id: null,
  reviewed_at: null, review_remark: null, cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  closed_by_employee_id: null, closed_at: null, close_reason: null, created_by_employee_id: id,
  updated_by_employee_id: id, created_at: timestamp, updated_at: timestamp,
};
export const payment = {
  id, tenant_id: id, ...destination, tenant_supplier_id: id, supplier_id: id, payment_request_id: id,
  payment_no: "SP-1", currency: "CNY", amount: "10.00", payment_method: "bank_transfer", payment_reference: "ref",
  paid_at: timestamp, evidence_images: ["proof"], remark: null, confirmed_by_employee_id: id,
  idempotency_key: id, created_at: timestamp,
};
export const payable = {
  id, ...destination, tenant_supplier_id: id, supplier_id: id, supplier_purchase_order_id: id,
  receipt_id: id, receipt_item_id: id, project_name: null, warehouse_name: "停用仓库", supplier_name: "供应商",
  purchase_order_no: "PO-1", receipt_no: "R-1", invoice_required_before_payment: false, amount: "10.00",
  paid_amount: "0.00", reserved_amount: "0.00", open_amount: "10.00", currency: "CNY" as const,
  occurred_at: timestamp, due_at: timestamp, status: "open" as const,
};
export const requestListItem = {
  id, ...destination, warehouse_name: "停用仓库", tenant_supplier_id: id, supplier_id: id, supplier_name: "供应商",
  request_no: "SPR-1", status: "draft", currency: "CNY", requested_amount: "10.00", paid_amount: "0.00",
  reason: "材料款", version: 1, created_at: timestamp, updated_at: timestamp,
};
export const paymentListItem = {
  id, ...destination, warehouse_name: "停用仓库", payment_no: "SP-1", amount: "10.00", currency: "CNY",
  payment_method: "bank_transfer", payment_reference: "ref", paid_at: timestamp, evidence_images: ["proof"],
  remark: null, confirmed_by_employee_id: id, created_at: timestamp,
};
