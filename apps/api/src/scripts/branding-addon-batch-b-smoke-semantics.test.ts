import { describe, expect, test } from "bun:test";

import {
  assertInitialCreateOrderResult,
  assertRepeatedCreateOrderResult,
} from "./branding-addon-batch-b-smoke-contracts";

const baseData = {
  idempotent: false,
  reused_pending: false,
  order: {
    id: "10000000-0000-4000-8000-000000000001",
    order_no: "BA202607280001",
    product_code: "custom_support_branding_annual",
    product_name: "年度品牌权益",
    amount_fen: 1,
    term_years: 1,
    status: "pending",
    expires_at: "2026-07-28T00:05:00.000Z",
    created_at: "2026-07-28T00:00:00.000Z",
  },
  payment_request: {
    timeStamp: "123",
    nonceStr: "nonce",
    package: "prepay_id=prepay",
    signType: "RSA",
    paySign: "signature",
  },
};

describe("branding add-on repeated create semantics", () => {
  test("accepts only mutually exclusive initial, replay and pending-reuse flags", () => {
    const snapshot = assertInitialCreateOrderResult(baseData);

    expect(() =>
      assertRepeatedCreateOrderResult({
        ...baseData,
        idempotent: true,
      }, snapshot, "idempotency replay", {
        idempotent: true,
        reusedPending: false,
      })
    ).not.toThrow();

    expect(() =>
      assertRepeatedCreateOrderResult({
        ...baseData,
        reused_pending: true,
      }, snapshot, "pending reuse", {
        idempotent: false,
        reusedPending: true,
      })
    ).not.toThrow();

    expect(() =>
      assertRepeatedCreateOrderResult({
        ...baseData,
        idempotent: true,
        reused_pending: true,
      }, snapshot, "idempotency replay", {
        idempotent: true,
        reusedPending: false,
      })
    ).toThrow("idempotency replay flags are invalid");
  });

  test.each([
    ["order id", { id: "20000000-0000-4000-8000-000000000002" }],
    ["order number", { order_no: "BA202607280002" }],
    ["product code", { product_code: "other" }],
    ["product name", { product_name: "changed" }],
    ["amount", { amount_fen: 2 }],
    ["term", { term_years: 2 }],
    ["payment expiry", { expires_at: "2026-07-28T00:06:00.000Z" }],
    ["creation time", { created_at: "2026-07-28T00:00:01.000Z" }],
    ["status", { status: "paid" }],
  ])("rejects a changed %s", (_name, orderPatch) => {
    const snapshot = assertInitialCreateOrderResult(baseData);
    expect(() =>
      assertRepeatedCreateOrderResult({
        ...baseData,
        idempotent: true,
        order: { ...baseData.order, ...orderPatch },
      }, snapshot, "idempotency replay", {
        idempotent: true,
        reusedPending: false,
      })
    ).toThrow();
  });

  test("requires a valid payment request on every replay or pending reuse", () => {
    const snapshot = assertInitialCreateOrderResult(baseData);
    expect(() =>
      assertRepeatedCreateOrderResult({
        ...baseData,
        idempotent: true,
        payment_request: null,
      }, snapshot, "idempotency replay", {
        idempotent: true,
        reusedPending: false,
      })
    ).toThrow("payment_request must be an object");
  });
});
