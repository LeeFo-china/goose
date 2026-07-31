import {
  ids,
  initialInvoiceRequest,
  initialPayables,
  now,
  sessionFor,
  supplier,
} from "./supplier-payment-mock-fixture.mjs";

function cents(value) {
  if (!/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value)) {
    throw new RangeError(`Invalid money: ${value}`);
  }
  const [integer, fraction] = value.split(".");
  return BigInt(integer) * 100n + BigInt(fraction);
}

function money(value) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function createState() {
  const invoice = initialInvoiceRequest();
  return {
    role: "applicant",
    payables: initialPayables(),
    requests: [invoice.payment_request],
    allocations: new Map([[invoice.payment_request.id, invoice.allocations]]),
    payments: new Map([[invoice.payment_request.id, []]]),
    journal: [],
    listGets: [],
    paymentSequence: 0,
  };
}

export function currentSession(state) {
  return sessionFor(state.role);
}

function actorId(state) {
  return currentSession(state).employee.id;
}

export function recordListGet(state, path, url) {
  state.listGets.push({
    path,
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("pageSize"),
  });
}

export function recordMutation(state, request, path, payload) {
  const entry = {
    method: request.method,
    path,
    idempotencyKey: request.headers["idempotency-key"] ?? null,
    payload: structuredClone(payload),
  };
  state.journal.push(entry);
  return entry;
}

export function listPayables(state, url) {
  let records = state.payables.map(withAvailableAmount);
  const filters = {
    project_id: "project_id",
    tenant_supplier_id: "tenant_supplier_id",
    purchase_order_id: "supplier_purchase_order_id",
    status: "status",
  };
  for (const [parameter, field] of Object.entries(filters)) {
    const value = url.searchParams.get(parameter);
    if (value) records = records.filter((record) => record[field] === value);
  }
  return records.sort((left, right) =>
    left.due_at.localeCompare(right.due_at) || left.id.localeCompare(right.id)
  );
}

export function payableFacts(state, idsToRead) {
  return idsToRead.map((id) => state.payables.find((item) => item.id === id))
    .filter(Boolean).map(withAvailableAmount);
}

function withAvailableAmount(payable) {
  const available = cents(payable.amount) - cents(payable.paid_amount) -
    cents(payable.reserved_amount);
  return {
    ...structuredClone(payable),
    available_to_request_amount: money(available < 0n ? 0n : available),
  };
}

export function listRequests(state, url) {
  let records = state.requests.map(toListItem);
  const filters = {
    project_id: "project_id",
    tenant_supplier_id: "tenant_supplier_id",
    status: "status",
  };
  for (const [parameter, field] of Object.entries(filters)) {
    const value = url.searchParams.get(parameter);
    if (value) records = records.filter((record) => record[field] === value);
  }
  const keyword = (url.searchParams.get("keyword") ?? "").toLowerCase();
  if (keyword) {
    records = records.filter((record) =>
      record.request_no.toLowerCase().includes(keyword) ||
      record.reason.toLowerCase().includes(keyword)
    );
  }
  return records.sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at) ||
    right.request_no.localeCompare(left.request_no)
  );
}

function toListItem(request) {
  return {
    id: request.id,
    project_id: request.project_id,
    tenant_supplier_id: request.tenant_supplier_id,
    supplier_id: request.supplier_id,
    supplier_name: supplier.name,
    request_no: request.request_no,
    status: request.status,
    currency: request.currency,
    requested_amount: request.requested_amount,
    paid_amount: request.paid_amount,
    reason: request.reason,
    version: request.version,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

export function requestDetail(state, requestId) {
  const paymentRequest = state.requests.find(({ id }) => id === requestId);
  if (!paymentRequest) return null;
  return {
    payment_request: structuredClone(paymentRequest),
    allocations: structuredClone(state.allocations.get(requestId) ?? []),
  };
}

export function paymentRecords(state, requestId) {
  return structuredClone(state.payments.get(requestId) ?? []);
}

export function createDraft(state, payload) {
  if (state.requests.some(({ id }) => id === payload.id)) {
    return failure("PAYMENT_REQUEST_CONFLICT", "付款申请已存在", 409);
  }
  if (payload.project_id !== ids.project ||
    payload.tenant_supplier_id !== ids.relationship) {
    return failure("VALIDATION_ERROR", "付款申请范围无效", 400);
  }
  const lines = [];
  let total = 0n;
  for (const [index, input] of payload.allocations.entries()) {
    const payable = state.payables.find(({ id }) =>
      id === input.payable_event_id
    );
    if (!payable) return failure("PAYABLE_NOT_FOUND", "应付不存在", 404);
    const amount = cents(input.requested_amount);
    const available = cents(withAvailableAmount(payable).available_to_request_amount);
    if (amount <= 0n || amount > available) {
      return failure("PAYABLE_BALANCE_CONFLICT", "应付可申请余额不足", 409);
    }
    total += amount;
    lines.push({
      id: `35000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`,
      payable_event_id: payable.id,
      requested_amount: input.requested_amount,
      paid_amount: "0.00",
      payable_amount: payable.amount,
      due_at: payable.due_at,
      supplier_purchase_order_id: payable.supplier_purchase_order_id,
      receipt_id: payable.receipt_id,
      receipt_item_id: payable.receipt_item_id,
      invoice_required_before_payment:
        payable.invoice_required_before_payment,
    });
  }
  const employeeId = actorId(state);
  const request = {
    id: payload.id,
    tenant_id: ids.tenant,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    request_no: "PAYREQ-E2E-0002",
    status: "draft",
    currency: "CNY",
    requested_amount: money(total),
    paid_amount: "0.00",
    reason: payload.reason,
    remark: payload.remark ?? null,
    version: 1,
    submitted_by_employee_id: null,
    submitted_at: null,
    reviewed_by_employee_id: null,
    reviewed_at: null,
    review_remark: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    closed_by_employee_id: null,
    closed_at: null,
    close_reason: null,
    created_by_employee_id: employeeId,
    updated_by_employee_id: employeeId,
    created_at: now,
    updated_at: now,
  };
  state.requests.push(request);
  state.allocations.set(request.id, lines);
  state.payments.set(request.id, []);
  return success("saved", request);
}

export function submitRequest(state, requestId, payload) {
  const request = mutableRequest(state, requestId, payload, "draft");
  if (request.error) return request;
  request.status = "pending_approval";
  request.submitted_by_employee_id = actorId(state);
  request.submitted_at = now;
  applyReservation(state, requestId);
  advance(request, state);
  return success("submitted", request);
}

export function approveRequest(state, requestId, payload) {
  const request = mutableRequest(
    state,
    requestId,
    payload,
    "pending_approval",
  );
  if (request.error) return request;
  if (request.submitted_by_employee_id === actorId(state)) {
    return failure("SELF_APPROVAL_FORBIDDEN", "提交人不能审批", 403);
  }
  request.status = "approved";
  request.reviewed_by_employee_id = actorId(state);
  request.reviewed_at = now;
  request.review_remark = payload.remark ?? null;
  advance(request, state);
  return success("approved", request);
}

export function confirmPayment(state, requestId, payload) {
  const request = mutableRequest(
    state,
    requestId,
    payload,
    ["approved", "partially_paid"],
  );
  if (request.error) return request;
  const allocations = state.allocations.get(requestId) ?? [];
  if (allocations.some((item) => item.invoice_required_before_payment)) {
    return failure("INVOICE_REQUIRED", "付款前必须提供发票", 409);
  }
  if (!Array.isArray(payload.evidence_images) || !payload.evidence_images.length) {
    return failure("VALIDATION_ERROR", "付款凭证不能为空", 400);
  }
  let amount = 0n;
  for (const input of payload.allocations) {
    const allocation = allocations.find((candidate) =>
      candidate.id === input.payment_request_allocation_id &&
      candidate.payable_event_id === input.payable_event_id
    );
    if (!allocation) return failure("VALIDATION_ERROR", "付款分配无效", 400);
    const paid = cents(input.amount);
    const remaining = cents(allocation.requested_amount) -
      cents(allocation.paid_amount);
    if (paid <= 0n || paid > remaining) {
      return failure("PAYMENT_BALANCE_CONFLICT", "付款分配超过余额", 409);
    }
    allocation.paid_amount = money(cents(allocation.paid_amount) + paid);
    const payable = state.payables.find(({ id }) =>
      id === allocation.payable_event_id
    );
    payable.paid_amount = money(cents(payable.paid_amount) + paid);
    payable.reserved_amount = money(cents(payable.reserved_amount) - paid);
    payable.open_amount = money(cents(payable.amount) - cents(payable.paid_amount));
    payable.status = cents(payable.open_amount) === 0n ? "paid" : "partially_paid";
    amount += paid;
  }
  request.paid_amount = money(cents(request.paid_amount) + amount);
  request.status = cents(request.paid_amount) === cents(request.requested_amount)
    ? "paid"
    : "partially_paid";
  advance(request, state);
  state.paymentSequence += 1;
  const payment = {
    id: payload.id,
    tenant_id: ids.tenant,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    supplier_id: ids.supplier,
    payment_request_id: request.id,
    payment_no: `PAY-E2E-${String(state.paymentSequence).padStart(4, "0")}`,
    currency: "CNY",
    amount: money(amount),
    payment_method: payload.payment_method,
    payment_reference: payload.payment_reference,
    paid_at: payload.paid_at,
    evidence_images: structuredClone(payload.evidence_images),
    remark: payload.remark ?? null,
    confirmed_by_employee_id: actorId(state),
    idempotency_key: `mock-payment-${state.paymentSequence}`,
    created_at: now,
  };
  state.payments.get(request.id).push(payment);
  return { status: request.status, idempotent: false, payment_request: request,
    payment, version: request.version };
}

function mutableRequest(state, requestId, payload, statuses) {
  const request = state.requests.find(({ id }) => id === requestId);
  if (!request) return failure("PAYMENT_REQUEST_NOT_FOUND", "付款申请不存在", 404);
  const allowed = Array.isArray(statuses) ? statuses : [statuses];
  if (!allowed.includes(request.status) || payload.expected_version !== request.version) {
    return failure("PAYMENT_REQUEST_CONFLICT", "付款申请状态或版本冲突", 409);
  }
  return request;
}

function applyReservation(state, requestId) {
  for (const allocation of state.allocations.get(requestId) ?? []) {
    const payable = state.payables.find(({ id }) =>
      id === allocation.payable_event_id
    );
    payable.reserved_amount = allocation.requested_amount;
    payable.status = "reserved";
  }
}

function advance(request, state) {
  request.version += 1;
  request.updated_by_employee_id = actorId(state);
  request.updated_at = new Date(Date.parse(now) + request.version * 1000)
    .toISOString();
}

function success(status, request) {
  return { status, idempotent: false, payment_request: request,
    version: request.version };
}

function failure(code, message, status) {
  return { error: { code, message, status } };
}

export function financialSummary(state) {
  const payables = state.payables;
  const sum = (key) => money(payables.reduce(
    (total, payable) => total + cents(payable[key]),
    0n,
  ));
  return {
    purchase_order_id: ids.purchaseOrder,
    accepted_amount: "120.00",
    payable_amount: sum("amount"),
    reserved_request_amount: sum("reserved_amount"),
    paid_amount: sum("paid_amount"),
    open_amount: sum("open_amount"),
    available_to_request_amount: money(payables.reduce(
      (total, payable) => total +
        cents(withAvailableAmount(payable).available_to_request_amount),
      0n,
    )),
  };
}
