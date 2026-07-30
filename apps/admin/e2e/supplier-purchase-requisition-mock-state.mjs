import {
  catalogItem,
  ids,
  initialCancellableRequisition,
  now,
  project,
  relationship,
  requisitionRecord,
  sessionFor,
} from "./supplier-purchase-requisition-mock-fixture.mjs";

function money(value) {
  return Number(value).toFixed(2);
}

function pricedFacts(quantity) {
  const total = Number(quantity) * 100;
  const subtotal = Math.round((total / 1.13) * 100) / 100;
  return {
    subtotal: money(subtotal),
    tax: money(total - subtotal),
    total: money(total),
  };
}

function itemFor(requisitionId, quantity, index = 1) {
  const amounts = pricedFacts(quantity);
  return {
    id: `34600000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    tenant_id: ids.tenant,
    purchase_requisition_id: requisitionId,
    line_no: index,
    cost_category_id: ids.category,
    supplier_product_id: ids.product,
    supplier_sku_id: ids.sku,
    supplier_price_list_id: ids.priceList,
    supplier_price_list_item_id: ids.priceItem,
    product_code_snapshot: catalogItem.product_code,
    product_name_snapshot: catalogItem.product_name,
    sku_code_snapshot: catalogItem.sku_code,
    sku_name_snapshot: catalogItem.sku_name,
    specification_snapshot: catalogItem.specification,
    model_snapshot: null,
    purchase_unit_id: ids.unit,
    purchase_unit_code_snapshot: "PCS",
    purchase_unit_name_snapshot: "件",
    purchase_unit_symbol_snapshot: "件",
    base_unit_id: ids.unit,
    base_unit_code_snapshot: "PCS",
    base_unit_name_snapshot: "件",
    base_unit_symbol_snapshot: "件",
    base_unit_conversion: "1.000000",
    price_list_code_snapshot: catalogItem.price_list_code,
    price_list_version_snapshot: 1,
    price_effective_from_snapshot: catalogItem.effective_from,
    price_effective_until_snapshot: null,
    quantity: String(quantity),
    unit_price: "100.00",
    tax_rate: "0.130000",
    tax_inclusive: true,
    line_subtotal_amount: amounts.subtotal,
    line_tax_amount: amounts.tax,
    line_total_amount: amounts.total,
    created_at: now,
  };
}

function commitmentFor(requisition, otherAmount) {
  return {
    id: `34700000-0000-4000-8000-${
      requisition.id.slice(-12)
    }`,
    tenant_id: ids.tenant,
    project_id: ids.project,
    cost_category_id: ids.category,
    source_type: "supplier_purchase_requisition",
    source_id: requisition.id,
    amount: requisition.total_amount,
    status: "reserved",
    budget_amount_snapshot: "1000.00",
    expense_amount_snapshot: "0.00",
    other_commitment_amount_snapshot: money(otherAmount),
    available_amount_snapshot: money(1000 - otherAmount),
    created_by_employee_id: requisition.created_by_employee_id,
    released_by_employee_id: null,
    released_at: null,
    release_reason: null,
    created_at: now,
    updated_at: now,
  };
}

export function createState() {
  const cancellable = initialCancellableRequisition();
  return {
    role: "requester",
    requisitions: [cancellable],
    items: new Map([[cancellable.id, [
      { ...itemFor(cancellable.id, "3"), id: ids.cancellableItem },
    ]]]),
    commitments: [{
      ...commitmentFor(cancellable, 0),
      id: ids.cancellableCommitment,
    }],
    purchaseOrders: [],
    purchaseOrderItems: new Map(),
    mutations: [],
    listGets: [],
    idempotency: new Map(),
    requestSequence: 2,
  };
}

export function currentSession(state) {
  return sessionFor(state.role);
}

function commandResult(status, requisition, idempotent = false, extra = {}) {
  return {
    status,
    idempotent,
    requisition: structuredClone(requisition),
    version: requisition.version,
    ...extra,
  };
}

export function recordMutation(state, request, path, payload) {
  const raw = request.headers["idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw ?? null;
  const entry = {
    method: request.method,
    path,
    idempotencyKey: key,
    payload: structuredClone(payload),
  };
  state.mutations.push(entry);
  return { key, entry };
}

export function replay(state, key, path, payload) {
  if (!key?.trim() || key.trim().length > 120) {
    return { error: ["VALIDATION_ERROR", 400, "缺少有效的幂等键"] };
  }
  const fingerprint = `${path}:${JSON.stringify(payload)}`;
  const previous = state.idempotency.get(key);
  if (!previous) return { key, fingerprint };
  if (previous.fingerprint !== fingerprint) {
    return {
      error: [
        "SUPPLIER_IDEMPOTENCY_CONFLICT",
        409,
        "幂等键已用于其他供应商操作",
      ],
    };
  }
  return {
    response: {
      ...structuredClone(previous.response),
      idempotent: true,
    },
  };
}

export function remember(state, key, fingerprint, response) {
  state.idempotency.set(key, {
    fingerprint,
    response: structuredClone(response),
  });
}

export function saveDraft(state, requisitionId, payload) {
  let requisition = state.requisitions.find(({ id }) => id === requisitionId);
  if (!requisition) {
    if (payload.expected_version !== 0) {
      return {
        error: [
          "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
          404,
          "采购申请不存在",
        ],
      };
    }
    requisition = requisitionRecord({
      id: requisitionId,
      requestNo: `REQ-E2E-${String(state.requestSequence++).padStart(4, "0")}`,
      status: "draft",
      budgetStatus: "unchecked",
      totalAmount: "0.00",
      version: 0,
      createdBy: currentSession(state).employee.id,
    });
    state.requisitions.unshift(requisition);
  }
  if (requisition.status !== "draft" ||
    requisition.version !== payload.expected_version) {
    return {
      error: [
        "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
        409,
        "采购申请版本已变化",
      ],
    };
  }
  const line = payload.items?.[0];
  if (!line || line.supplier_sku_id !== ids.sku ||
    line.cost_category_id !== ids.category) {
    return {
      error: [
        "VALIDATION_ERROR",
        400,
        "采购申请明细无效",
      ],
    };
  }
  const amounts = pricedFacts(line.quantity);
  Object.assign(requisition, {
    project_id: payload.project_id,
    tenant_supplier_id: payload.tenant_supplier_id,
    reason: payload.reason,
    expected_delivery_date: payload.expected_delivery_date,
    remark: payload.remark,
    subtotal_amount: amounts.subtotal,
    tax_amount: amounts.tax,
    total_amount: amounts.total,
    priced_at: now,
    updated_by_employee_id: currentSession(state).employee.id,
    updated_at: now,
    version: requisition.version + 1,
  });
  state.items.set(requisition.id, [itemFor(requisition.id, line.quantity)]);
  return { response: commandResult("saved", requisition) };
}

export function submit(state, requisition, payload) {
  if (!requisition || requisition.status !== "draft") {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT", 409,
      "采购申请当前状态不允许提交"] };
  }
  if (requisition.version !== payload.expected_version) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT", 409,
      "采购申请版本已变化"] };
  }
  const other = state.commitments
    .filter(({ status }) => ["reserved", "converted"].includes(status))
    .reduce((sum, item) => sum + Number(item.amount), 0);
  requisition.status = "pending_approval";
  requisition.budget_status =
    Number(requisition.total_amount) <= 1000 - other
      ? "within_budget"
      : "over_budget";
  requisition.submitted_by_employee_id = currentSession(state).employee.id;
  requisition.submitted_at = now;
  requisition.version += 1;
  state.commitments.push(commitmentFor(requisition, other));
  return { response: commandResult("submitted", requisition) };
}

export function review(state, requisition, payload) {
  if (!requisition || requisition.status !== "pending_approval") {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT", 409,
      "采购申请当前状态不允许审批"] };
  }
  const session = currentSession(state);
  if (session.employee.id === requisition.created_by_employee_id) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW", 409,
      "申请人不能审批自己的申请"] };
  }
  if (requisition.version !== payload.expected_version) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT", 409,
      "采购申请版本已变化"] };
  }
  requisition.status = payload.action === "approve" ? "approved" : "rejected";
  requisition.reviewed_by_employee_id = session.employee.id;
  requisition.reviewed_at = now;
  requisition.review_remark = payload.remark;
  requisition.version += 1;
  if (payload.action === "reject") releaseCommitments(state, requisition.id,
    session.employee.id, payload.remark ?? "requisition_rejected");
  return { response: commandResult(requisition.status, requisition) };
}

function releaseCommitments(state, sourceId, employeeId, reason) {
  for (const commitment of state.commitments) {
    if (commitment.source_id !== sourceId ||
      !["reserved", "converted"].includes(commitment.status)) continue;
    commitment.status = "released";
    commitment.released_by_employee_id = employeeId;
    commitment.released_at = now;
    commitment.release_reason = reason;
    commitment.updated_at = now;
  }
}

export function cancel(state, requisition, payload) {
  if (!requisition ||
    !["draft", "pending_approval", "approved"].includes(requisition.status)) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT", 409,
      "采购申请当前状态不允许取消"] };
  }
  if (requisition.version !== payload.expected_version) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT", 409,
      "采购申请版本已变化"] };
  }
  const employeeId = currentSession(state).employee.id;
  requisition.status = "cancelled";
  requisition.cancelled_by_employee_id = employeeId;
  requisition.cancelled_at = now;
  requisition.cancel_reason = payload.reason;
  requisition.version += 1;
  releaseCommitments(state, requisition.id, employeeId, payload.reason);
  return { response: commandResult("cancelled", requisition) };
}

function purchaseOrderFor(state, requisition, purchaseOrderId) {
  return {
    id: purchaseOrderId,
    tenant_id: ids.tenant,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    order_no: `PO-E2E-REQ-${requisition.request_no.slice(-4)}`,
    status: "draft",
    currency: "CNY",
    expected_delivery_date: requisition.expected_delivery_date,
    remark: requisition.remark,
    priced_at: now,
    subtotal_amount: requisition.subtotal_amount,
    tax_amount: requisition.tax_amount,
    total_amount: requisition.total_amount,
    purchase_requisition_id: requisition.id,
    version: 1,
    created_by_employee_id: currentSession(state).employee.id,
    updated_by_employee_id: currentSession(state).employee.id,
    submitted_by_employee_id: null,
    submitted_at: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: now,
    updated_at: now,
    project,
    supplier: {
      ...relationship.supplier,
      onboarding_status: "approved",
      operational_status: "active",
    },
    purchase_requisition: {
      id: requisition.id,
      request_no: requisition.request_no,
      status: "converted",
      budget_status: requisition.budget_status,
    },
  };
}

export function convert(state, requisition, payload) {
  if (!requisition || requisition.status !== "approved") {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT", 409,
      "采购申请当前状态不允许转换"] };
  }
  if (requisition.version !== payload.expected_version) {
    return { error: ["SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT", 409,
      "采购申请版本已变化"] };
  }
  const order = purchaseOrderFor(state, requisition, payload.purchase_order_id);
  state.purchaseOrders.push(order);
  state.purchaseOrderItems.set(order.id,
    (state.items.get(requisition.id) ?? []).map((item) => ({
      ...item,
      supplier_purchase_order_id: order.id,
      supplier_id: ids.supplier,
      subtotal_amount: item.line_subtotal_amount,
      tax_amount: item.line_tax_amount,
      total_amount: item.line_total_amount,
      updated_at: now,
    })));
  requisition.status = "converted";
  requisition.purchase_order_id = order.id;
  requisition.version += 1;
  for (const commitment of state.commitments) {
    if (commitment.source_id === requisition.id &&
      commitment.status === "reserved") commitment.status = "converted";
  }
  return {
    response: commandResult("converted", requisition, false, {
      purchase_order_id: order.id,
    }),
  };
}
