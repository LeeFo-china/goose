export const now = "2030-01-10T08:00:00.000Z";

export const ids = {
  tenant: "35000000-0000-4000-8000-000000000001",
  applicant: "35000000-0000-4000-8000-000000000002",
  applicantUser: "35000000-0000-4000-8000-000000000003",
  approver: "35000000-0000-4000-8000-000000000004",
  approverUser: "35000000-0000-4000-8000-000000000005",
  finance: "35000000-0000-4000-8000-000000000006",
  financeUser: "35000000-0000-4000-8000-000000000007",
  project: "35000000-0000-4000-8000-000000000008",
  relationship: "35000000-0000-4000-8000-000000000009",
  supplier: "35000000-0000-4000-8000-000000000010",
  purchaseOrder: "35000000-0000-4000-8000-000000000011",
  purchaseOrderItem: "35000000-0000-4000-8000-000000000012",
  receiptOne: "35000000-0000-4000-8000-000000000013",
  receiptItemOne: "35000000-0000-4000-8000-000000000014",
  receiptTwo: "35000000-0000-4000-8000-000000000015",
  receiptItemTwo: "35000000-0000-4000-8000-000000000016",
  payableOne: "35100000-0000-4000-8000-000000000001",
  payableTwo: "35200000-0000-4000-8000-000000000001",
  invoicePayable: "35300000-0000-4000-8000-000000000001",
  invoiceRequest: "35000000-0000-4000-8000-000000000020",
  invoiceAllocation: "35000000-0000-4000-8000-000000000021",
  invoiceOrder: "35000000-0000-4000-8000-000000000022",
  invoiceReceipt: "35000000-0000-4000-8000-000000000023",
  invoiceReceiptItem: "35000000-0000-4000-8000-000000000024",
};

const roleFacts = {
  applicant: {
    employeeId: ids.applicant,
    userId: ids.applicantUser,
    name: "付款申请人",
    permissions: [
      "supplier.view",
      "supplier.payable.view",
      "supplier.payment-request.view",
      "supplier.payment-request.manage",
      "supplier.purchase-order.view",
    ],
  },
  approver: {
    employeeId: ids.approver,
    userId: ids.approverUser,
    name: "付款审批人",
    permissions: [
      "supplier.view",
      "supplier.payable.view",
      "supplier.payment-request.view",
      "supplier.payment-request.approve",
      "supplier.purchase-order.view",
    ],
  },
  finance: {
    employeeId: ids.finance,
    userId: ids.financeUser,
    name: "财务付款人",
    permissions: [
      "supplier.view",
      "supplier.payable.view",
      "supplier.payment-request.view",
      "supplier.payment-request.pay",
      "supplier.purchase-order.view",
    ],
  },
};

export function sessionFor(role) {
  const facts = roleFacts[role];
  if (!facts) throw new TypeError(`Unknown supplier payment role: ${role}`);
  return {
    user_id: facts.userId,
    login_channel: "admin_web",
    employee: {
      id: facts.employeeId,
      name: facts.name,
      phone: "18637605353",
      status: "active",
      tenant_department_id: null,
      department_name: "财务部",
      post_id: null,
      post_name: facts.name,
      avatar: null,
    },
    tenant: {
      id: ids.tenant,
      name: "E2E 装修公司",
      slug: "supplier-payment-e2e",
      status: "active",
    },
    roles: ["tenant_admin"],
    permissions: facts.permissions.map((code) => ({ code, scope: "all" })),
    token: `supplier-payment-${role}-token`,
    expires_at: "2099-12-31T23:59:59+08:00",
  };
}

export const project = {
  id: ids.project,
  name: "E2E 海棠湾项目",
  status: "constructing",
};

export const supplier = {
  id: ids.supplier,
  code: "E2E-SUPPLIER",
  name: "E2E 建材供应商",
  legal_name: "E2E 建材供应商有限公司",
  onboarding_status: "approved",
  operational_status: "active",
};

export const relationship = {
  tenant_supplier_id: ids.relationship,
  supplier_id: ids.supplier,
  relationship_status: "active",
  default_currency: "CNY",
  supplier,
};

export const purchaseOrder = {
  id: ids.purchaseOrder,
  tenant_id: ids.tenant,
  project_id: ids.project,
  tenant_supplier_id: ids.relationship,
  supplier_id: ids.supplier,
  order_no: "PO-PAY-0001",
  status: "submitted",
  currency: "CNY",
  expected_delivery_date: "2030-01-01",
  remark: "E2E 已完成分批收货",
  priced_at: now,
  subtotal_amount: "106.19",
  tax_amount: "13.81",
  total_amount: "120.00",
  purchase_requisition_id: null,
  version: 4,
  created_by_employee_id: ids.applicant,
  updated_by_employee_id: ids.applicant,
  submitted_by_employee_id: ids.applicant,
  submitted_at: now,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: now,
  updated_at: now,
  project,
  supplier,
  purchase_requisition: null,
};

function payable({ id, receiptId, receiptItemId, receiptNo, amount }) {
  return {
    id,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    supplier_purchase_order_id: ids.purchaseOrder,
    receipt_id: receiptId,
    receipt_item_id: receiptItemId,
    project_name: project.name,
    supplier_name: supplier.name,
    purchase_order_no: purchaseOrder.order_no,
    receipt_no: receiptNo,
    invoice_required_before_payment: false,
    amount,
    paid_amount: "0.00",
    reserved_amount: "0.00",
    open_amount: amount,
    currency: "CNY",
    occurred_at: "2030-01-01T04:00:00.000Z",
    due_at: "2030-01-31T15:59:59.999Z",
    status: "open",
  };
}

export function initialPayables() {
  return [
    payable({
      id: ids.payableOne,
      receiptId: ids.receiptOne,
      receiptItemId: ids.receiptItemOne,
      receiptNo: "REC-PAY-0001",
      amount: "80.00",
    }),
    payable({
      id: ids.payableTwo,
      receiptId: ids.receiptTwo,
      receiptItemId: ids.receiptItemTwo,
      receiptNo: "REC-PAY-0002",
      amount: "40.00",
    }),
  ];
}

export function initialInvoiceRequest() {
  return {
    payment_request: {
      id: ids.invoiceRequest,
      tenant_id: ids.tenant,
      project_id: ids.project,
      tenant_supplier_id: ids.relationship,
      supplier_id: ids.supplier,
      request_no: "PAYREQ-E2E-INVOICE",
      status: "approved",
      currency: "CNY",
      requested_amount: "30.00",
      paid_amount: "0.00",
      reason: "E2E 发票门禁申请",
      remark: null,
      version: 3,
      submitted_by_employee_id: ids.applicant,
      submitted_at: now,
      reviewed_by_employee_id: ids.approver,
      reviewed_at: now,
      review_remark: "已批准，待发票",
      cancelled_by_employee_id: null,
      cancelled_at: null,
      cancel_reason: null,
      closed_by_employee_id: null,
      closed_at: null,
      close_reason: null,
      created_by_employee_id: ids.applicant,
      updated_by_employee_id: ids.approver,
      created_at: now,
      updated_at: now,
    },
    allocations: [{
      id: ids.invoiceAllocation,
      payable_event_id: ids.invoicePayable,
      requested_amount: "30.00",
      paid_amount: "0.00",
      payable_amount: "30.00",
      due_at: "2030-01-31T15:59:59.999Z",
      supplier_purchase_order_id: ids.invoiceOrder,
      receipt_id: ids.invoiceReceipt,
      receipt_item_id: ids.invoiceReceiptItem,
      invoice_required_before_payment: true,
    }],
  };
}
