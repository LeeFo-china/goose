import {
  ids as originalIds,
  initialCatalog,
  relationship,
  session as baseSession,
} from "./supplier-purchase-order-mock-fixture.mjs";

export const at = "2026-09-07T08:00:00.000Z";
export const ids = {
  ...originalIds,
  batch: "88000000-0000-4000-8000-000000000001",
  category: "88000000-0000-4000-8000-000000000002",
  brand: "88000000-0000-4000-8000-000000000003",
};
export const uuid = (number) =>
  `88000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export const projects = Array.from(
  { length: 23 },
  (_, index) => ({
    id: uuid(100 + index),
    name: `采购项目${String(index + 1).padStart(2, "0")}`,
    status: "constructing",
  }),
);
export const warehouses = Array.from({ length: 23 }, (_, index) => ({
  id: uuid(200 + index),
  tenant_id: ids.tenant,
  warehouse_code: `WH-${index + 1}`,
  name: `补货仓${String(index + 1).padStart(2, "0")}`,
  address: null,
  contact_name: null,
  contact_phone: null,
  manager_employee_id: null,
  is_default: index === 21,
  status: index === 22 ? "inactive" : "active",
  version: 1,
  created_at: at,
  updated_at: at,
}));
export const categories = Array.from(
  { length: 23 },
  (_, index) => ({
    id: index === 0 ? ids.category : uuid(300 + index),
    code: `COST-${index + 1}`,
    name: `材料类目${String(index + 1).padStart(2, "0")}`,
    status: "active",
    sort_order: index,
  }),
);
export const settings = {
  tenant_id: ids.tenant,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: true,
  procurement_snapshot_v1_enabled: true,
  purchase_batch_workflow_enabled: true,
  warehouse_procurement_enabled: true,
  enabled_by_employee_id: ids.employee,
  enabled_at: at,
  version: 1,
  created_at: at,
  updated_at: at,
};
export function batchSession(role = "manager") {
  const codes = [
    "supplier.purchase-requisition.view",
    "supplier.purchase-order.view",
    "project.read",
    "project.update",
  ];
  if (role !== "reader" && role !== "reviewer") {
    codes.push("supplier.purchase-requisition.manage");
  }
  if (role !== "no-settings") codes.push("supplier.view");
  if (role !== "project-only") codes.push("inventory.warehouse.view");
  if (role !== "reader" && role !== "project-only") {
    codes.push("inventory.warehouse.manage");
  }
  if (role === "reviewer") codes.push("supplier.purchase-requisition.approve");
  return {
    ...baseSession,
    user_id: role === "reviewer" ? uuid(401) : ids.user,
    employee: {
      ...baseSession.employee,
      id: role === "reviewer" ? uuid(402) : ids.employee,
      name: role === "reviewer" ? "采购审批人" : "采购申请人",
    },
    permissions: codes.map((code) => ({ code, scope: "all" })),
    token: `batch-${role}-token`,
  };
}
export function catalog() {
  return Array.from({ length: 23 }, (_, index) => ({
    ...initialCatalog()[0],
    supplier_sku_id: uuid(500 + index),
    supplier_product_id: uuid(600 + index),
    product_name: `采购商品${String(index + 1).padStart(2, "0")}`,
    product_code: `PRODUCT-${index + 1}`,
    sku_name: "标准规格",
    sku_code: `SKU-${index + 1}`,
    unit_price: "10.00",
    tax_rate: "0.000000",
    base_unit_conversion: "1.00000000",
    category_id: ids.category,
    category_name: "瓷砖",
    brand_id: ids.brand,
    brand_name: "本地建材",
    tenant_supplier_id: index % 2 ? uuid(700) : ids.relationship,
    supplier_id: index % 2 ? uuid(701) : ids.supplier,
    supplier_name: index % 2 ? "第二建材商" : "第一建材商",
    currency: "CNY",
    purchasable_status: "purchasable",
    default_cost_category_id: index === 0 ? null : ids.category,
    default_cost_category_name: index === 0 ? null : "材料类目01",
    cost_category_source: index === 0 ? null : "product",
  }));
}
export function batchRecord(overrides = {}) {
  return {
    id: ids.batch,
    tenant_id: ids.tenant,
    destination_type: "project",
    project_id: projects[0].id,
    warehouse_id: null,
    batch_no: "PB-20260907-00000001",
    status: "draft",
    reason: "工程材料采购",
    expected_delivery_date: null,
    remark: null,
    priced_at: at,
    currency: "CNY",
    subtotal_amount: "20.00",
    tax_amount: "0.00",
    total_amount: "20.00",
    budget_checked_at: null,
    budget_status: "unchecked",
    budget_snapshot: {},
    split_generation: 0,
    supplier_count: 2,
    item_count: 2,
    approval_round: 0,
    version: 1,
    created_by_employee_id: ids.employee,
    updated_by_employee_id: ids.employee,
    submitted_by_employee_id: null,
    submitted_at: null,
    reviewed_by_employee_id: null,
    reviewed_at: null,
    review_remark: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}
export function batchDetail(record = batchRecord(), role = "manager") {
  const warehouse = warehouses.find((item) => item.id === record.warehouse_id);
  const manage = batchSession(role).permissions.some(({ code }) =>
    code === "supplier.purchase-requisition.manage"
  );
  const canReview = role === "reviewer" && record.status === "pending_approval";
  const person = {
    employee_id: ids.employee,
    name: "采购申请人",
    phone_masked: "186****5353",
    role_name: "采购经理",
  };
  return {
    ...record,
    project: record.destination_type === "project"
      ? projects.find((item) => item.id === record.project_id) ?? null
      : null,
    warehouse: warehouse
      ? { id: warehouse.id, name: warehouse.name, status: warehouse.status }
      : null,
    creator: person,
    applicant: record.submitted_at ? person : null,
    approval_summary: {
      status: record.status === "pending_approval"
        ? "pending"
        : "not_submitted",
      current_approvers: canReview
        ? [{ ...person, employee_id: uuid(402), name: "采购审批人" }]
        : [],
      last_reviewer: null,
      reviewed_at: null,
      rejected_at: null,
      review_remark: record.review_remark,
    },
    actions: {
      can_edit: manage && ["draft", "rejected"].includes(record.status),
      can_submit: manage && record.status === "draft",
      can_review: canReview,
      can_withdraw: manage && record.status === "pending_approval",
      can_cancel: manage && ["draft", "rejected"].includes(record.status),
      can_create_supplier: false,
      can_create_catalog: false,
      can_create_purchasable_product: false,
    },
    workflow_state: record.status === "pending_approval"
      ? {
        instance_id: uuid(800),
        instance_status: "running",
        current_node_key: "review",
        current_node_title: "采购审批",
        current_group_key: null,
        current_group_label: null,
        current_group_order: null,
        current_business_kind: "purchase_review",
        subject_type: "supplier_purchase_batch",
        subject_id: record.id,
        pending_task_count: 1,
        timeline_nodes: [],
        actions: canReview
          ? ["approve", "reject"].map((action) => ({
            key: action,
            label: action === "approve" ? "批准" : "驳回",
            business_domain: "supplier_purchase_batch",
            business_action: action,
            requires_reason: action === "reject",
            output_fields: [],
            task_id: uuid(801),
            node_key: "review",
            node_type: "approval",
            disabled: false,
          }))
          : [],
      }
      : null,
  };
}
export function batchItem(
  item = catalog()[0],
  index = 0,
  batchId = ids.batch,
  quantity = "1.0000",
  costCategoryId = ids.category,
) {
  return {
    id: uuid(900 + index),
    tenant_id: ids.tenant,
    purchase_batch_id: batchId,
    line_no: index + 1,
    supplier_sku_id: item.supplier_sku_id,
    quantity,
    cost_category_id: costCategoryId,
    supplier_id: item.supplier_id,
    tenant_supplier_id: item.tenant_supplier_id,
    supplier_product_id: item.supplier_product_id,
    supplier_price_list_id: item.supplier_price_list_id,
    supplier_price_list_item_id: item.supplier_price_list_item_id,
    catalog_category_id: item.category_id,
    category_name_snapshot: item.category_name,
    brand_id: item.brand_id,
    brand_name_snapshot: item.brand_name,
    product_code_snapshot: item.product_code,
    product_name_snapshot: item.product_name,
    sku_code_snapshot: item.sku_code,
    sku_name_snapshot: item.sku_name,
    specification_snapshot: item.specification,
    model_snapshot: item.model,
    purchase_unit_id: item.purchase_unit_id,
    purchase_unit_code_snapshot: item.purchase_unit_code,
    purchase_unit_name_snapshot: item.purchase_unit_name,
    purchase_unit_symbol_snapshot: item.purchase_unit_symbol,
    base_unit_id: item.base_unit_id,
    base_unit_code_snapshot: item.base_unit_code,
    base_unit_name_snapshot: item.base_unit_name,
    base_unit_symbol_snapshot: item.base_unit_symbol,
    base_unit_conversion: item.base_unit_conversion,
    supplier_name_snapshot: item.supplier_name,
    price_list_code_snapshot: item.price_list_code,
    price_list_version_snapshot: item.price_list_version,
    price_effective_from_snapshot: item.effective_from,
    price_effective_until_snapshot: item.effective_until,
    priced_at: at,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    tax_inclusive: item.tax_inclusive,
    line_subtotal_amount: (Number(quantity) * Number(item.unit_price)).toFixed(
      2,
    ),
    line_tax_amount: "0.00",
    line_total_amount: (Number(quantity) * Number(item.unit_price)).toFixed(2),
    created_at: at,
    updated_at: at,
  };
}
export function childRequisition(record, index = 0) {
  return {
    id: uuid(1000 + index),
    tenant_id: ids.tenant,
    project_id: record.project_id,
    warehouse_id: record.warehouse_id,
    destination_type: record.destination_type,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    request_no: `PR-20260907-${String(index + 1).padStart(8, "0")}`,
    status: record.status === "ordered" ? "converted" : "pending_approval",
    budget_status: record.budget_status,
    currency: "CNY",
    reason: record.reason,
    expected_delivery_date: null,
    remark: null,
    priced_at: at,
    subtotal_amount: "10.00",
    tax_amount: "0.00",
    total_amount: "10.00",
    purchase_order_id: record.status === "ordered" ? uuid(1100 + index) : null,
    purchase_batch_id: record.id,
    split_generation: Math.floor(index / 2) + 1,
    version: 1,
    created_by_employee_id: ids.employee,
    updated_by_employee_id: ids.employee,
    submitted_by_employee_id: ids.employee,
    submitted_at: at,
    reviewed_by_employee_id: null,
    reviewed_at: null,
    review_remark: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: at,
    updated_at: at,
    project: batchDetail(record).project,
    warehouse: batchDetail(record).warehouse,
  };
}
export function childOrder(record, index = 0) {
  const request = childRequisition(record, index);
  return {
    id: uuid(1100 + index),
    tenant_id: ids.tenant,
    project_id: record.project_id,
    warehouse_id: record.warehouse_id,
    destination_type: record.destination_type,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    order_no: `PO-20260907-${String(index + 1).padStart(8, "0")}`,
    status: "submitted",
    currency: "CNY",
    expected_delivery_date: null,
    remark: null,
    priced_at: at,
    subtotal_amount: "10.00",
    tax_amount: "0.00",
    total_amount: "10.00",
    purchase_requisition_id: request.id,
    purchase_batch_id: record.id,
    version: 1,
    created_by_employee_id: ids.employee,
    updated_by_employee_id: ids.employee,
    submitted_by_employee_id: ids.employee,
    submitted_at: at,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: at,
    updated_at: at,
    project: request.project,
    warehouse: request.warehouse,
    supplier: {
      id: relationship.supplier.id,
      code: relationship.supplier.code,
      name: relationship.supplier.name,
      legal_name: relationship.supplier.legal_name,
      onboarding_status: "approved",
      operational_status: "active",
    },
    purchase_requisition: {
      id: request.id,
      request_no: request.request_no,
      status: "converted",
      budget_status: request.budget_status,
    },
  };
}
