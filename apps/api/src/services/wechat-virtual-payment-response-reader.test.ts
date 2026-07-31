import { describe, expect, test } from "bun:test";

import {
  MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES,
  normalizeWechatVirtualPaymentRequestId,
  readWechatVirtualPaymentResponseBody,
} from "./wechat-virtual-payment-response-reader";

const SAFE_REQUEST_ID = "xpay/request-id:2026_08-01.1";

describe("wechat virtual payment bounded response reader", () => {
  test("rejects an oversized valid Content-Length before pulling the body", async () => {
    let wasPulled = false;
    let wasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        wasPulled = true;
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        wasCancelled = true;
      },
    }, { highWaterMark: 0 });
    const response = new Response(body, {
      headers: {
        "content-length": String(
          MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES + 1,
        ),
      },
    });

    await expect(readWechatVirtualPaymentResponseBody(
      response,
      SAFE_REQUEST_ID,
    )).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_VIRTUAL_PAYMENT_RESPONSE_TOO_LARGE",
      details: {
        httpStatus: 200,
        wechatErrcode: null,
        requestId: SAFE_REQUEST_ID,
      },
    });
    expect(wasPulled).toBe(false);
    expect(wasCancelled).toBe(true);
  });

  test("cancels an unknown-length stream as soon as cumulative bytes exceed 64 KiB", async () => {
    let wasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(
          MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES,
        ));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        wasCancelled = true;
      },
    });

    await expect(readWechatVirtualPaymentResponseBody(
      new Response(body),
      SAFE_REQUEST_ID,
    )).rejects.toMatchObject({
      code: "WECHAT_VIRTUAL_PAYMENT_RESPONSE_TOO_LARGE",
    });
    expect(wasCancelled).toBe(true);
  });

  test("accepts the exact 64 KiB boundary and ignores an invalid declared length", async () => {
    const text = "x".repeat(MAX_WECHAT_VIRTUAL_PAYMENT_RESPONSE_BYTES);
    const response = new Response(text, {
      headers: { "content-length": "not-a-number" },
    });

    await expect(readWechatVirtualPaymentResponseBody(
      response,
      SAFE_REQUEST_ID,
    )).resolves.toBe(text);
  });

  test("treats a null response body as an empty success body", async () => {
    await expect(readWechatVirtualPaymentResponseBody(
      new Response(null, { status: 204 }),
      SAFE_REQUEST_ID,
    )).resolves.toBe("");
  });

  test.each([
    ["TimeoutError", 504, "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT"],
    ["AbortError", 504, "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT"],
    ["NetworkError", 502, "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED"],
  ])("classifies a %s stream read failure", async (name, statusCode, code) => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new DOMException("sensitive upstream URL", name));
      },
    }, { highWaterMark: 0 });

    const error = await readWechatVirtualPaymentResponseBody(
      new Response(body, { status: 200 }),
      SAFE_REQUEST_ID,
    ).catch((caught) => caught);
    expect(error).toMatchObject({
      statusCode,
      code,
      details: {
        httpStatus: 200,
        wechatErrcode: null,
        requestId: SAFE_REQUEST_ID,
      },
    });
    expect(JSON.stringify(error)).not.toContain("sensitive upstream URL");
  });
});

describe("wechat virtual payment request id normalization", () => {
  test.each([
    SAFE_REQUEST_ID,
    "A".repeat(128),
    "request-id/with:safe.characters_01",
  ])("accepts an explicitly safe request id: %s", (value) => {
    expect(normalizeWechatVirtualPaymentRequestId(value)).toBe(value);
  });

  test.each([
    null,
    "",
    "request id with spaces",
    "request\tid",
    "request\nid",
    "request?id",
    "A".repeat(129),
  ])("drops an unsafe request id", (value) => {
    expect(normalizeWechatVirtualPaymentRequestId(value)).toBeNull();
  });
});
