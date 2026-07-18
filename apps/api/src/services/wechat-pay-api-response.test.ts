import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { readVerifiedWechatPayJson } from "./wechat-pay-api-response";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOW_SECONDS = 1_721_000_000;
const PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
const NONCE = "response-nonce";
const REQUEST_ID = "wechat-request-id";

const { privateKey, publicKey: publicKeyPem } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

function createSignedResponse(input: {
  rawBody: string;
  timestamp?: string;
  serial?: string;
  signature?: string;
}) {
  const timestamp = input.timestamp ?? String(NOW_SECONDS);
  const signature = input.signature ?? sign(
    "RSA-SHA256",
    Buffer.from(`${timestamp}\n${NONCE}\n${input.rawBody}\n`),
    privateKey,
  ).toString("base64");

  return new Response(input.rawBody, {
    headers: {
      "content-type": "application/json",
      "request-id": REQUEST_ID,
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": NONCE,
      "wechatpay-serial": input.serial ?? PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
}

function readSigned(rawBody: string) {
  return readVerifiedWechatPayJson({
    response: createSignedResponse({ rawBody }),
    publicKeyId: PUBLIC_KEY_ID,
    publicKeyPem,
    nowSeconds: NOW_SECONDS,
  });
}

function readResponseWithout(header: string) {
  const rawBody = JSON.stringify({ status: "PROCESSING" });
  const response = createSignedResponse({ rawBody });
  response.headers.delete(header);
  return readVerifiedWechatPayJson({
    response,
    publicKeyId: PUBLIC_KEY_ID,
    publicKeyPem,
    nowSeconds: NOW_SECONDS,
  });
}

function readWithSerial(serial: string) {
  const rawBody = JSON.stringify({ status: "PROCESSING" });
  return readVerifiedWechatPayJson({
    response: createSignedResponse({ rawBody, serial }),
    publicKeyId: PUBLIC_KEY_ID,
    publicKeyPem,
    nowSeconds: NOW_SECONDS,
  });
}

function readAtOffsetSeconds(offsetSeconds: number) {
  const rawBody = JSON.stringify({ status: "PROCESSING" });
  return readVerifiedWechatPayJson({
    response: createSignedResponse({
      rawBody,
      timestamp: String(NOW_SECONDS - offsetSeconds),
    }),
    publicKeyId: PUBLIC_KEY_ID,
    publicKeyPem,
    nowSeconds: NOW_SECONDS,
  });
}

function readWithSignature(signature: string) {
  const rawBody = JSON.stringify({ status: "PROCESSING" });
  return readVerifiedWechatPayJson({
    response: createSignedResponse({ rawBody, signature }),
    publicKeyId: PUBLIC_KEY_ID,
    publicKeyPem,
    nowSeconds: NOW_SECONDS,
  });
}

describe("readVerifiedWechatPayJson", () => {
  test("accepts a current response signed over the unmodified raw body", async () => {
    const rawBody = '{"status":"PROCESSING"}';
    const result = await readVerifiedWechatPayJson({
      response: createSignedResponse({ rawBody }),
      publicKeyId: PUBLIC_KEY_ID,
      publicKeyPem,
      nowSeconds: NOW_SECONDS,
    });

    expect(result.payload).toEqual({ status: "PROCESSING" });
    expect(result.requestId).toBe("wechat-request-id");
    expect(result.rawBody).toBe(rawBody);
  });

  test.each([
    "wechatpay-timestamp",
    "wechatpay-nonce",
    "wechatpay-serial",
    "wechatpay-signature",
  ])("rejects a response missing %s", async (header) => {
    await expect(readResponseWithout(header)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
    });
  });

  test.each([
    [null, publicKeyPem],
    [PUBLIC_KEY_ID, null],
  ] as const)(
    "rejects missing configured public-key material",
    async (publicKeyId, configuredPublicKeyPem) => {
      const rawBody = JSON.stringify({ status: "PROCESSING" });
      await expect(readVerifiedWechatPayJson({
        response: createSignedResponse({ rawBody }),
        publicKeyId,
        publicKeyPem: configuredPublicKeyPem,
        nowSeconds: NOW_SECONDS,
      })).rejects.toMatchObject({
        code: "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
      });
    },
  );

  test("rejects an unknown public-key id", async () => {
    await expect(readWithSerial("PUB_KEY_ID_OTHER")).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_SERIAL_MISMATCH",
    });
  });

  test("rejects timestamps outside the five-minute window", async () => {
    await expect(readAtOffsetSeconds(301)).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
    });
  });

  test("rejects invalid and SIGNTEST signatures", async () => {
    await expect(readWithSignature("WECHATPAY/SIGNTEST/invalid"))
      .rejects.toMatchObject({ code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID" });
  });

  test("rejects signed non-object JSON", async () => {
    await expect(readSigned("[]")).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_BODY_INVALID",
    });
  });

  test("does not expose a rejected signature or raw body", async () => {
    const rawBody = '{"secret":"must-not-leak"}';
    const signature = "WECHATPAY/SIGNTEST/must-not-leak";

    try {
      await readVerifiedWechatPayJson({
        response: createSignedResponse({ rawBody, signature }),
        publicKeyId: PUBLIC_KEY_ID,
        publicKeyPem,
        nowSeconds: NOW_SECONDS,
      });
      throw new Error("expected response verification to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
      });
      expect(JSON.stringify(error)).not.toContain(signature);
      expect(JSON.stringify(error)).not.toContain(rawBody);
    }
  });

  test("maps a response body read failure to a business error", async () => {
    const response = createSignedResponse({ rawBody: "{}" });
    Object.defineProperty(response, "text", {
      value: async () => {
        throw new TypeError("response stream failed");
      },
    });

    await expect(readVerifiedWechatPayJson({
      response,
      publicKeyId: PUBLIC_KEY_ID,
      publicKeyPem,
      nowSeconds: NOW_SECONDS,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_RESPONSE_BODY_INVALID",
    });
  });
});
