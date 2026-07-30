export const now = "2026-07-30T10:00:00.000Z";

export const ids = {
  tenant: "34000000-0000-4000-8000-000000000001",
  requester: "34000000-0000-4000-8000-000000000002",
  requesterUser: "34000000-0000-4000-8000-000000000003",
  approver: "34000000-0000-4000-8000-000000000004",
  approverUser: "34000000-0000-4000-8000-000000000005",
  budgetManager: "34000000-0000-4000-8000-000000000006",
  budgetManagerUser: "34000000-0000-4000-8000-000000000007",
  project: "34000000-0000-4000-8000-000000000008",
  relationship: "34000000-0000-4000-8000-000000000009",
  supplier: "34000000-0000-4000-8000-000000000010",
  category: "34000000-0000-4000-8000-000000000011",
  unit: "34000000-0000-4000-8000-000000000012",
  product: "34000000-0000-4000-8000-000000000013",
  sku: "34000000-0000-4000-8000-000000000014",
  priceList: "34000000-0000-4000-8000-000000000015",
  priceItem: "34000000-0000-4000-8000-000000000016",
  cancellable: "34000000-0000-4000-8000-000000000017",
  cancellableItem: "34000000-0000-4000-8000-000000000018",
  cancellableCommitment: "34000000-0000-4000-8000-000000000019",
};

const roleFacts = {
  requester: {
    employeeId: ids.requester,
    userId: ids.requesterUser,
    name: "采购申请人",
    permissions: [
      "supplier.purchase-requisition.view",
      "supplier.purchase-requisition.manage",
      "supplier.purchase-order.view",
    ],
  },
  approver: {
    employeeId: ids.approver,
    userId: ids.approverUser,
    name: "普通审批人",
    permissions: [
      "supplier.purchase-requisition.view",
      "supplier.purchase-requisition.manage",
      "supplier.purchase-requisition.approve",
      "supplier.purchase-order.view",
      "supplier.purchase-order.manage",
    ],
  },
  "budget-manager": {
    employeeId: ids.budgetManager,
    userId: ids.budgetManagerUser,
    name: "预算管理员",
    permissions: [
      "supplier.purchase-requisition.view",
      "supplier.purchase-requisition.manage",
      "supplier.purchase-requisition.approve",
      "finance.budget.manage",
      "supplier.purchase-order.view",
      "supplier.purchase-order.manage",
    ],
  },
};

export function sessionFor(role) {
  const facts = roleFacts[role];
  if (!facts) throw new TypeError(`Unknown requisition test role: ${role}`);
  return {
    user_id: facts.userId,
    login_channel: "admin_web",
    employee: {
      id: facts.employeeId,
      name: facts.name,
      phone: "18637605353",
      status: "active",
      tenant_department_id: null,
      department_name: "采购部",
      post_id: null,
      post_name: facts.name,
      avatar: null,
    },
    tenant: {
      id: ids.tenant,
      name: "E2E 装修公司",
      slug: "supplier-purchase-requisition-e2e",
      status: "active",
    },
    roles: ["tenant_admin"],
    permissions: facts.permissions.map((code) => ({ code, scope: "all" })),
    token: `supplier-purchase-requisition-${role}-token`,
    expires_at: "2099-12-31T23:59:59+08:00",
  };
}

export const project = {
  id: ids.project,
  name: "E2E 海棠湾项目",
  status: "constructing",
};

export const relationship = {
  tenant_supplier_id: ids.relationship,
  supplier_id: ids.supplier,
  relationship_status: "active",
  default_currency: "CNY",
  supplier: {
    id: ids.supplier,
    code: "E2E-SUPPLIER",
    name: "E2E 建材供应商",
    legal_name: "E2E 建材供应商有限公司",
  },
};

export const category = {
  id: ids.category,
  tenant_id: ids.tenant,
  code: "MATERIAL",
  name: "主材",
  status: "active",
  sort_order: 1,
  is_system: true,
  created_at: now,
  updated_at: now,
};

export const catalogItem = {
  supplier_product_id: ids.product,
  product_code: "E2E-TILE",
  product_name: "E2E 临采瓷砖",
  supplier_sku_id: ids.sku,
  sku_code: "E2E-TILE-800",
  sku_name: "E2E 临采瓷砖 800x800",
  specification: "800x800",
  model: null,
  supplier_price_list_id: ids.priceList,
  price_list_code: "E2E-BASE",
  price_list_version: 1,
  effective_from: "2026-01-01T00:00:00.000Z",
  effective_until: null,
  supplier_price_list_item_id: ids.priceItem,
  purchase_unit_id: ids.unit,
  purchase_unit_code: "PCS",
  purchase_unit_name: "件",
  purchase_unit_symbol: "件",
  base_unit_id: ids.unit,
  base_unit_code: "PCS",
  base_unit_name: "件",
  base_unit_symbol: "件",
  base_unit_conversion: "1.000000",
  unit_price: "100.00",
  tax_rate: "0.130000",
  tax_inclusive: true,
};

export function projectOptions() {
  return [
    project,
    ...Array.from({ length: 100 }, (_, index) => ({
      id: `34100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: `E2E 分页项目 ${index + 1}`,
      status: "constructing",
    })),
  ];
}

export function costCategoryOptions() {
  return [
    category,
    ...Array.from({ length: 100 }, (_, index) => ({
      ...category,
      id: `34200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      code: `E2E-${index + 1}`,
      name: `E2E 成本分类 ${index + 1}`,
      sort_order: index + 2,
      is_system: false,
    })),
  ];
}

export function catalogOptions() {
  return [
    catalogItem,
    ...Array.from({ length: 20 }, (_, index) => ({
      ...catalogItem,
      supplier_product_id:
        `34300000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      supplier_sku_id:
        `34400000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      supplier_price_list_item_id:
        `34500000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      product_code: `E2E-PAGED-${index + 1}`,
      product_name: `E2E 分页商品 ${index + 1}`,
      sku_code: `E2E-PAGED-SKU-${index + 1}`,
      sku_name: `E2E 分页商品 SKU ${index + 1}`,
    })),
  ];
}

export function requisitionRecord({
  id,
  requestNo,
  status,
  budgetStatus,
  totalAmount,
  version,
  createdBy = ids.requester,
}) {
  const submitted = status !== "draft";
  return {
    id,
    tenant_id: ids.tenant,
    request_no: requestNo,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    status,
    budget_status: budgetStatus,
    currency: "CNY",
    reason: "E2E 预置待审批申请",
    expected_delivery_date: "2026-08-31",
    remark: null,
    priced_at: now,
    subtotal_amount: totalAmount === "300.00" ? "265.49" : "0.00",
    tax_amount: totalAmount === "300.00" ? "34.51" : "0.00",
    total_amount: totalAmount,
    purchase_order_id: null,
    version,
    created_by_employee_id: createdBy,
    updated_by_employee_id: createdBy,
    submitted_by_employee_id: submitted ? createdBy : null,
    submitted_at: submitted ? now : null,
    reviewed_by_employee_id: null,
    reviewed_at: null,
    review_remark: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: now,
    updated_at: now,
  };
}

export function initialCancellableRequisition() {
  return requisitionRecord({
    id: ids.cancellable,
    requestNo: "REQ-E2E-0001",
    status: "pending_approval",
    budgetStatus: "within_budget",
    totalAmount: "300.00",
    version: 2,
  });
}
