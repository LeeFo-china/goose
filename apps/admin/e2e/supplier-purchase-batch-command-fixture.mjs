import { catalog, uuid } from "./supplier-purchase-batch-fixture.mjs";

export function splitPreview(items) {
  const groups = new Map();
  for (const item of items) {
    const group = groups.get(item.tenant_supplier_id) || {
      tenant_supplier_id: item.tenant_supplier_id,
      supplier_id: item.supplier_id,
      supplier_name: item.supplier_name_snapshot,
      item_count: 0,
      subtotal_amount: "0.00",
      tax_amount: "0.00",
      total_amount: "0.00",
    };
    group.item_count += 1;
    group.subtotal_amount =
      (Number(group.subtotal_amount) + Number(item.line_subtotal_amount))
        .toFixed(2);
    group.total_amount = group.subtotal_amount;
    groups.set(item.tenant_supplier_id, group);
  }
  return [...groups.values()];
}
export function priceRevision(record) {
  return {
    batch: record,
    version: record.version,
    error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
    details: [{
      kind: "price",
      supplier_sku_id: catalog()[0].supplier_sku_id,
      product_name: "采购商品01",
      sku_name: "标准规格",
      frozen_unit_price: "10.00",
      current_unit_price: "11.00",
      frozen_price_version: 1,
      current_price_version: 2,
    }],
  };
}
export function commandResult(kind, record, items) {
  const status = kind === "submit"
    ? "submitted"
    : kind === "withdraw"
    ? "withdrawn"
    : record.status;
  const result = {
    status,
    idempotent: false,
    batch: record,
    version: record.version,
  };
  if (status === "submitted" || status === "ordered") {
    result.requisition_ids = Array.from(
      { length: record.supplier_count },
      (_, index) => uuid(1000 + index),
    );
  }
  if (status === "ordered") {
    result.orders = splitPreview(items).map((supplier, index) => ({
      id: uuid(1100 + index),
      order_no: `PO-20260907-${String(index + 1).padStart(8, "0")}`,
      tenant_supplier_id: supplier.tenant_supplier_id,
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      status: "submitted",
    }));
  }
  if (["submitted", "pending_approval", "withdrawn"].includes(status)) {
    const canceled = status === "withdrawn";
    result.workflow_state = {
      definition_id: uuid(801),
      instance_id: uuid(800),
      instance_status: canceled ? "canceled" : "running",
      current_node_key: canceled ? null : "approval",
      current_node_title: canceled ? null : "采购审批",
      current_business_kind: null,
      pending_task_count: canceled ? 0 : 1,
    };
  }
  return result;
}
