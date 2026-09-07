import { afterEach, expect, test } from "bun:test";
import { initialInvoiceRequest } from "../../e2e/supplier-payment-mock-fixture.mjs";
import { createPaymentRequestCommand, runPaymentRequestCommand, restorePaymentRequestCommand } from "./payment-request-command";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("real financial sender must not treat a truncated HTTP 200 as successful evidence", async () => {
  globalThis.fetch = Object.assign(async () => new Response('{"success":true,"data":', { status: 200 }), { preconnect: originalFetch.preconnect });
  const request = initialInvoiceRequest().payment_request;
  const pending = createPaymentRequestCommand("submit", request.id, { expected_version: 2 }, request);
  expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
});

test("invalid identity/version/destination or empty receipts remain uncertain; legal receipt is accepted", async () => {
  const request = { ...initialInvoiceRequest().payment_request, status: "pending_approval", version: 3 };
  const pending = createPaymentRequestCommand("submit", request.id, { expected_version: 2 }, request);
  const good = { status: "submitted", idempotent: false, version: 3, payment_request: request };
  for (const response of [undefined, {}, { ...good, version: 4 }, { ...good, payment_request: { ...request, id: crypto.randomUUID() } },
    { ...good, payment_request: { ...request, destination_type: "warehouse", project_id: null, warehouse_id: crypto.randomUUID() } }]) {
    globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: response }), { preconnect: originalFetch.preconnect });
    expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
  }
  globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: good }), { preconnect: originalFetch.preconnect });
  expect((await runPaymentRequestCommand(pending)).type).toBe("accepted");
});

test("reload keeps original key/payload/destination and is tenant-user isolated", () => {
  const request = initialInvoiceRequest().payment_request;
  const pending = createPaymentRequestCommand("submit", request.id, { expected_version: 2 }, request);
  const raw = JSON.stringify({ scope: "tenant-a:user-a", slot: "actions", pending });
  const restored = restorePaymentRequestCommand(raw, "tenant-a:user-a", "actions");
  expect(restored?.command.attempt).toEqual(pending.command.attempt);
  expect(restored?.command.payload).toEqual(pending.command.payload);
  expect(restored?.destination).toEqual(pending.destination);
  expect(restored?.amounts).toEqual({ requested_amount: request.requested_amount, paid_amount: request.paid_amount });
  expect(restored?.requestNo).toBe(request.request_no);
  expect(restored?.command.phase).toBe("uncertain");
  expect(restorePaymentRequestCommand(raw, "tenant-a:user-b", "actions")).toBeNull();
});

test("payment receipt must preserve the payment UUID, original key and a consistent paid status", async () => {
  const request = { ...initialInvoiceRequest().payment_request, status: "paid", paid_amount: "10.00", version: 4 };
  const payload = { id: crypto.randomUUID(), expected_version: 3, payment_method: "bank_transfer" as const,
    payment_reference: "BANK-TEST", paid_at: "2030-01-10T08:00:00.000Z", evidence_images: ["proof.png"],
    allocations: [{ payment_request_allocation_id: crypto.randomUUID(), payable_event_id: crypto.randomUUID(), amount: "10.00" }] };
  const pending = createPaymentRequestCommand("pay", request.id, payload, request);
  const payment = { ...request, id: payload.id, payment_request_id: request.id, payment_no: "PAY-TEST", amount: "10.00",
    payment_method: payload.payment_method, payment_reference: payload.payment_reference, paid_at: payload.paid_at,
    evidence_images: payload.evidence_images, confirmed_by_employee_id: request.updated_by_employee_id,
    idempotency_key: pending.command.attempt.idempotencyKey };
  globalThis.fetch = Object.assign(async () => Response.json({ success: true, data: { status: "paid", idempotent: false,
    version: 4, payment_request: request, payment } }), { preconnect: originalFetch.preconnect });
  expect((await runPaymentRequestCommand(pending)).type).toBe("uncertain");
});

test("a permission rejection during an uncertain replay does not disprove the original write", async () => {
  const request = initialInvoiceRequest().payment_request;
  const pending = createPaymentRequestCommand("submit", request.id, { expected_version: 2 }, request);
  const restored = restorePaymentRequestCommand(JSON.stringify({ scope: "tenant:user", slot: "actions", pending }), "tenant:user", "actions");
  expect(restored).not.toBeNull();
  globalThis.fetch = Object.assign(async () => Response.json({ success: false, message: "权限已变更" }, { status: 403 }), { preconnect: originalFetch.preconnect });
  expect((await runPaymentRequestCommand(restored!)).type).toBe("uncertain");
  expect((await runPaymentRequestCommand(pending)).type).toBe("rejected");
});
