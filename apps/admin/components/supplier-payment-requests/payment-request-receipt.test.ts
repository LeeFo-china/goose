import { afterEach, expect, test } from "bun:test";
import { initialInvoiceRequest } from "../../e2e/supplier-payment-mock-fixture.mjs";
import { createPaymentRequestCommand, restorePaymentRequestCommand, runPaymentRequestCommand, type PaymentRequestCommandKind } from "./payment-request-command";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const states = { create: ["saved", "draft"], update: ["saved", "draft"], submit: ["submitted", "pending_approval"],
  approve: ["approved", "approved"], reject: ["rejected", "rejected"], cancel: ["cancelled", "cancelled"], close: ["closed", "closed"] } as const;

for (const destination of ["project", "warehouse"] as const) {
  test(`${destination} old pending without amount baseline cannot release its original key`, async () => {
    const source = initialInvoiceRequest().payment_request;
    const facts = { ...source, ...(destination === "project" ? {} : { destination_type: destination, project_id: null, warehouse_id: crypto.randomUUID() }) };
    const pending = createPaymentRequestCommand("approve", facts.id, { expected_version: 2 }, facts);
    Reflect.deleteProperty(pending, "amounts");
    const restored = restorePaymentRequestCommand(JSON.stringify({ scope: "t:u", slot: "actions", pending }), "t:u", "actions");
    expect(restored?.command.attempt).toEqual(pending.command.attempt);
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { status: "approved", idempotent: true,
      version: 3, payment_request: { ...facts, status: "approved", version: 3 } } }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(restored!)).type).toBe("uncertain");
  });
  test(`${destination} approve preserves frozen amounts and legacy pending keeps its key without accepting a receipt`, async () => {
    const source = initialInvoiceRequest().payment_request;
    const facts = { ...source, ...(destination === "project" ? {} : { destination_type: destination, project_id: null, warehouse_id: crypto.randomUUID() }) };
    const pending = createPaymentRequestCommand("approve", facts.id, { expected_version: 2 }, facts);
    const good = { status: "approved", idempotent: true, version: 3, payment_request: { ...facts, version: 3, status: "approved" } };
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good,
      payment_request: { ...good.payment_request, requested_amount: "999.00", paid_amount: "1.00" } } }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
    const restored = restorePaymentRequestCommand(JSON.stringify({ scope: "t:u", slot: "actions", pending }), "t:u", "actions");
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: good }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(restored!)).type).toBe("accepted");
    const legacy = { ...pending };
    Reflect.deleteProperty(legacy, "amounts");
    const old = restorePaymentRequestCommand(JSON.stringify({ scope: "t:u", slot: "actions", pending: legacy }), "t:u", "actions");
    expect(old?.command.attempt).toEqual(pending.command.attempt);
    expect((await runPaymentRequestCommand(old!)).type).toBe("uncertain");
  });
  for (const kind of Object.keys(states) as Exclude<PaymentRequestCommandKind, "pay">[]) {
    test(`${destination} ${kind} accepts only the original frozen destination after reload`, async () => {
      const source = initialInvoiceRequest().payment_request;
      const scope = destination === "project" ? { project_id: source.project_id }
        : { destination_type: destination, project_id: null, warehouse_id: crypto.randomUUID() };
      const expected = kind === "create" ? 0 : 2;
      const request = { ...source, ...scope, version: expected + 1, status: states[kind][1], paid_amount: kind === "close" ? "1.00" : "0.00" };
      const payload = kind === "create" || kind === "update"
        ? { id: request.id, ...scope, expected_version: expected, tenant_supplier_id: request.tenant_supplier_id,
          reason: "结算", allocations: [{ payable_event_id: crypto.randomUUID(), requested_amount: request.requested_amount }] }
        : { expected_version: expected, reason: "结算原因", remark: "审核备注" };
      const pending = createPaymentRequestCommand(kind, request.id, payload, request);
      const restored = restorePaymentRequestCommand(JSON.stringify({ scope: "tenant:user", slot: "test", pending }), "tenant:user", "test");
      expect(restored).not.toBeNull();
      const good = { status: states[kind][0], version: request.version, idempotent: true, payment_request: request };
      globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: good }), { preconnect: originalFetch.preconnect });
      expect((await runPaymentRequestCommand(restored!)).type).toBe("accepted");
      globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good,
        payment_request: { ...request, requested_amount: "999.00" } } }), { preconnect: originalFetch.preconnect });
      expect((await runPaymentRequestCommand(restored!)).type).toBe("uncertain");
      globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good,
        payment_request: { ...request, paid_amount: kind === "close" ? "0.00" : "1.00" } } }), { preconnect: originalFetch.preconnect });
      expect((await runPaymentRequestCommand(restored!)).type).toBe("uncertain");
      const changed = destination === "project" ? { destination_type: "warehouse", project_id: null, warehouse_id: crypto.randomUUID() }
        : { destination_type: "project", project_id: source.project_id, warehouse_id: null };
      globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good, payment_request: { ...request, ...changed } } }), { preconnect: originalFetch.preconnect });
      expect((await runPaymentRequestCommand(restored!)).type).toBe("uncertain");
    });
  }

  test(`${destination} payment requires original UUID, key, allocation total and evidence`, async () => {
    const source = initialInvoiceRequest().payment_request;
    const request = { ...source, ...(destination === "project" ? {} : { destination_type: destination, project_id: null, warehouse_id: crypto.randomUUID() }),
      status: "paid", paid_amount: source.requested_amount, version: 4 };
    const payload = { id: crypto.randomUUID(), expected_version: 3, payment_method: "bank_transfer" as const,
      payment_reference: "BANK-TEST", paid_at: "2030-01-10T08:00:00.000Z", evidence_images: ["proof.png"],
      allocations: [{ payment_request_allocation_id: crypto.randomUUID(), payable_event_id: crypto.randomUUID(), amount: source.requested_amount }] };
    const originalFacts = { ...request, paid_amount: "0.00" };
    const pending = createPaymentRequestCommand("pay", request.id, payload, originalFacts);
    const payment = { ...request, id: payload.id, payment_request_id: request.id, payment_no: "PAY-TEST", amount: source.requested_amount,
      payment_method: payload.payment_method, payment_reference: payload.payment_reference, paid_at: payload.paid_at,
      evidence_images: payload.evidence_images, confirmed_by_employee_id: request.updated_by_employee_id, idempotency_key: pending.command.attempt.idempotencyKey };
    const good = { status: "paid", idempotent: false, version: 4, payment_request: request, payment };
    for (const invalid of [{ id: crypto.randomUUID() }, { idempotency_key: crypto.randomUUID() }, { amount: "0.01" }, { evidence_images: ["other.png"] }]) {
      globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good, payment: { ...payment, ...invalid } } }), { preconnect: originalFetch.preconnect });
      expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
    }
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: good }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(pending)).type).toBe("accepted");
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { ...good, status: "partially_paid",
      payment_request: { ...request, status: "partially_paid", paid_amount: "0.01" } } }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
    const partialPayload = { ...payload, allocations: [{ ...payload.allocations[0], amount: "10.00" }] };
    const partial = createPaymentRequestCommand("pay", request.id, partialPayload, originalFacts);
    const partialReceipt = { ...good, status: "partially_paid", payment_request: { ...request, status: "partially_paid", paid_amount: "20.00" },
      payment: { ...payment, amount: "10.00", idempotency_key: partial.command.attempt.idempotencyKey } };
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: partialReceipt }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(partial)).type).toBe("uncertain");
    partialReceipt.payment_request.paid_amount = "10.00";
    expect((await runPaymentRequestCommand(partial)).type).toBe("accepted");
  });
}
