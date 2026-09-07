import { ids, initialInvoiceRequest, initialPayables, now } from "./supplier-payment-mock-fixture.mjs";

export const financialWarehouseId = (index) => `36000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const financialWarehouses = Array.from({ length: 25 }, (_, index) => ({
  id: financialWarehouseId(index + 1), tenant_id: ids.tenant, warehouse_code: `WH-${index + 1}`,
  name: index === 20 ? "北区历史仓库" : index === 21 ? "南区仓库" : `结算仓库 ${String(index + 1).padStart(2, "0")}`,
  address: null, contact_name: null, contact_phone: null, manager_employee_id: null,
  is_default: index === 20, status: index === 20 ? "inactive" : "active", version: 1,
  created_at: now, updated_at: now,
}));

export function warehouseFinancialPayables() {
  const base = initialPayables();
  return [0, 1, 2].map((index) => ({
    ...base[index === 1 ? 1 : 0], id: financialWarehouseId(100 + index),
    supplier_purchase_order_id: financialWarehouseId(200 + index), receipt_id: financialWarehouseId(300 + index), receipt_item_id: financialWarehouseId(400 + index),
    destination_type: "warehouse", project_id: null, project_name: null,
    warehouse_id: financialWarehouseId(index === 2 ? 22 : 21),
    warehouse_name: index === 2 ? "南区仓库" : "北区历史仓库",
    receipt_no: `REC-WH-000${index + 1}`, purchase_order_no: `PO-WH-000${index + 1}`,
  }));
}

export function financialDestination(record) {
  return { destination_type: record.destination_type ?? "project", project_id: record.project_id,
    warehouse_id: record.warehouse_id ?? null };
}
export function sameFinancialDestination(left, right) {
  const a = financialDestination(left), b = financialDestination(right);
  return a.destination_type === b.destination_type && a.project_id === b.project_id && a.warehouse_id === b.warehouse_id;
}
export function warehouseFinancialName(id) {
  return financialWarehouses.find((warehouse) => warehouse.id === id)?.name ?? null;
}

export function seedWarehousePaymentHistory(state) {
  const source = initialInvoiceRequest();
  const payable = state.payables.find((record) => record.id === financialWarehouseId(100));
  const request = { ...source.payment_request, id: financialWarehouseId(500), ...financialDestination(payable),
    request_no: "PAYREQ-WH-HISTORY", status: "partially_paid", paid_amount: "25.00", version: 28 };
  const allocation = { ...source.allocations[0], id: financialWarehouseId(501), payable_event_id: payable.id,
    invoice_required_before_payment: false, payable_amount: payable.amount, paid_amount: "25.00",
    supplier_purchase_order_id: payable.supplier_purchase_order_id, receipt_id: payable.receipt_id, receipt_item_id: payable.receipt_item_id };
  Object.assign(payable, { paid_amount: "25.00", reserved_amount: "5.00", open_amount: "55.00", status: "partially_paid" });
  state.requests.push(request);
  state.allocations.set(request.id, [allocation]);
  state.payments.set(request.id, Array.from({ length: 25 }, (_, index) => ({
    id: financialWarehouseId(600 + index), tenant_id: ids.tenant, ...financialDestination(request),
    tenant_supplier_id: ids.relationship, supplier_id: ids.supplier, payment_request_id: request.id,
    payment_no: `PAY-WH-${String(index + 1).padStart(3, "0")}`, currency: "CNY", amount: "1.00",
    payment_method: "bank_transfer", payment_reference: `BANK-HISTORY-${index + 1}`, paid_at: now,
    evidence_images: ["proof.png"], remark: null, confirmed_by_employee_id: ids.finance,
    idempotency_key: financialWarehouseId(700 + index), created_at: now,
  })));
  const invoicePayable = state.payables.find((record) => record.id === financialWarehouseId(102));
  Object.assign(invoicePayable, { invoice_required_before_payment: true, reserved_amount: "30.00", status: "reserved" });
  const invoice = { ...source.payment_request, id: financialWarehouseId(800), ...financialDestination(invoicePayable), request_no: "PAYREQ-WH-INVOICE" };
  state.requests.push(invoice);
  state.allocations.set(invoice.id, [{ ...source.allocations[0], id: financialWarehouseId(801), payable_event_id: invoicePayable.id,
    payable_amount: invoicePayable.amount, supplier_purchase_order_id: invoicePayable.supplier_purchase_order_id,
    receipt_id: invoicePayable.receipt_id, receipt_item_id: invoicePayable.receipt_item_id }]);
  state.payments.set(invoice.id, []);
}
