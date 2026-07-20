import { describe, expect, mock, test } from "bun:test";
import {
  createCipheriv,
  createVerify,
  generateKeyPairSync,
  sign,
} from "node:crypto";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const API_V3_KEY = "12345678901234567890123456789012";
const RESPONSE_TIMESTAMP = "1782873600";
const WECHAT_PAY_PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
const CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIIDOTCCAiGgAwIBAgIUMQcdV2QLM/xaIxQzDGyCIquR2qcwDQYJKoZIhvcNAQEL
BQAwLDEqMCgGA1UEAwwhd2VjaGF0LXBheS1wcm9maWxlLXZhbGlkYXRvci10ZXN0
MB4XDTI2MDcyMDE1MDAyMVoXDTM2MDcxNzE1MDAyMVowLDEqMCgGA1UEAwwhd2Vj
aGF0LXBheS1wcm9maWxlLXZhbGlkYXRvci10ZXN0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA0gS5X56J8TDTqh5+5EFOrHgo9I2ucgPARHmFLdK7jwqr
9PD9nAamn5hPb9483RZZ7qZWVEStqAJ0LzP5xiksTKHH/uZzPkbEzog3V+nSjGzM
7zrgKB6AGN5r211XETznONT8WLJ2y0fdws1PFbF2lzIpQH8naP492spuU0535XGC
Gl0UEooXgzWQ7REskY0Jn/BdzhFX2zt0ok5XEdJ5HNi9E/1ZMkS+TNEhDA9CpDVJ
ozujpOUOzVExYzjwscsoHGh9Rrzrwz2qqVlLnD2+shzizLMyYYUTL8Vdn0MYPvPG
mBP+9gSA+9We/VlC1xMBDF34BYFi+rOVCvfeERjfwwIDAQABo1MwUTAdBgNVHQ4E
FgQU9GZkvdT8f+tjEwifA551vYVdadMwHwYDVR0jBBgwFoAU9GZkvdT8f+tjEwif
A551vYVdadMwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAc4Bk
ebOfdIMy/E+geS5+SGjzQ5vAVBa/9MB0k4on8ALBX43BRMJTOOvGKfEign6XViWG
TGSaQhQ4eQs5tQE7ARM6Rly4mwjPAgOOWTwcnqSX0e/92nyq4H5yzH39dushYLGl
9SW3w1tvDNoUOyYHahKhHwR7K5ZBqx1yYwlrHbpQelc5vwOFDoAItu7wvr4IZHhM
FCZ8pGy2PtYXgxStwDlhIqHs0IFuYJYedamAuqvgLHWttLkJ860etTK6bcR5z3Ww
K14hwSFJo+aW4UxCCMXLMhDBLF8AgW6bn1PhJRLAHQyZQFUZYMRJ4k+nsukY1x7P
W0nHaBSaj/nxtmtIrA==
-----END CERTIFICATE-----`;

const merchantKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const wechatPayKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

function createSignedResponse(
  payload: Record<string, unknown>,
  options: { status?: number; requestId?: string; signingKey?: string } = {},
) {
  const rawBody = JSON.stringify(payload);
  const nonce = "response-nonce";
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${nonce}\n${rawBody}\n`),
    options.signingKey ?? wechatPayKeys.privateKey,
  ).toString("base64");
  return new Response(rawBody, {
    status: options.status ?? 200,
    headers: {
      "request-id": options.requestId ?? "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": nonce,
      "wechatpay-serial": WECHAT_PAY_PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
}

function encryptCertificate(plaintext = CERTIFICATE_PEM) {
  const nonce = "0123456789ab";
  const associatedData = "certificate";
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(API_V3_KEY),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  return {
    algorithm: "AEAD_AES_256_GCM",
    nonce,
    associated_data: associatedData,
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString(
      "base64",
    ),
  };
}

function probeInput() {
  return {
    merchantId: "1561816121",
    serialNo: "MERCHANT_CERT_SERIAL",
    privateKeyPem: merchantKeys.privateKey,
    apiV3Key: API_V3_KEY,
    wechatPayPublicKeyId: WECHAT_PAY_PUBLIC_KEY_ID,
    wechatPayPublicKeyPem: wechatPayKeys.publicKey,
    baseUrl: "https://api.mch.weixin.qq.com",
  };
}

async function createGateway(fetchImpl: typeof fetch, requestTimeoutMs = 1_000) {
  const { WechatPayProfileValidationGateway } = await import(
    "./wechat-pay-profile-validation-gateway"
  );
  return new WechatPayProfileValidationGateway({
    fetchImpl,
    nonceFactory: () => "request-nonce",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
    requestTimeoutMs,
  });
}

describe("WechatPayProfileValidationGateway", () => {
  test("signs GET /v3/certificates and decrypts a verified platform certificate", async () => {
    const fetchMock = mock(async () =>
      createSignedResponse({
        data: [{
          serial_no: "PLATFORM_CERT_SERIAL",
          encrypt_certificate: encryptCertificate(),
        }],
      })
    );
    const gateway = await createGateway(fetchMock as unknown as typeof fetch);

    const result = await gateway.probe(probeInput());

    expect(result).toEqual({
      ok: true,
      probe_mode: "platform_certificate",
      api_v3_key_probe: "decrypted",
      request_id: "wechat-request-id",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.mch.weixin.qq.com/v3/certificates");
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Wechatpay-Serial")).toBe(WECHAT_PAY_PUBLIC_KEY_ID);
    const authorization = headers.get("Authorization") ?? "";
    expect(authorization).toStartWith("WECHATPAY2-SHA256-RSA2048 ");
    expect(authorization).toContain('mchid="1561816121"');
    expect(authorization).toContain('serial_no="MERCHANT_CERT_SERIAL"');
    const signature = authorization.match(/signature="([^"]+)"/)?.[1];
    expect(signature).toBeDefined();
    const verifier = createVerify("RSA-SHA256");
    verifier.update(
      "GET\n/v3/certificates\n1782873600\nrequest-nonce\n\n",
    );
    verifier.end();
    expect(
      verifier.verify(merchantKeys.publicKey, signature ?? "", "base64"),
    ).toBe(true);
  });

  test("accepts a signed RESOURCE_NOT_EXISTS response as public-key mode", async () => {
    const gateway = await createGateway(
      mock(async () =>
        createSignedResponse(
          { code: "RESOURCE_NOT_EXISTS", message: "raw wechat message" },
          { status: 404, requestId: "public-key-request-id" },
        )) as unknown as typeof fetch,
    );

    await expect(gateway.probe(probeInput())).resolves.toEqual({
      ok: true,
      probe_mode: "wechat_pay_public_key",
      api_v3_key_probe: "format_only",
      request_id: "public-key-request-id",
    });
  });

  test("rejects a wrong 32-byte APIv3 key when decrypting certificates", async () => {
    const gateway = await createGateway(
      mock(async () =>
        createSignedResponse({
          data: [{
            serial_no: "PLATFORM_CERT_SERIAL",
            encrypt_certificate: encryptCertificate(),
          }],
        })) as unknown as typeof fetch,
    );

    await expect(gateway.probe({
      ...probeInput(),
      apiV3Key: "00000000000000000000000000000000",
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PLATFORM_CERTIFICATE_DECRYPT_FAILED",
      details: { requestId: "wechat-request-id" },
    });
  });

  test("rejects signed non-success responses without exposing the raw WeChat message", async () => {
    const gateway = await createGateway(
      mock(async () =>
        createSignedResponse(
          { code: "SIGN_ERROR", message: "sensitive upstream detail" },
          { status: 401, requestId: "failed-request-id" },
        )) as unknown as typeof fetch,
    );

    const error = await gateway.probe(probeInput()).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      details: { requestId: "failed-request-id" },
    });
    expect(JSON.stringify(error)).not.toContain("sensitive upstream detail");
  });

  test.each([429, 500, 503])(
    "classifies signed upstream status %s as temporarily unavailable",
    async (status) => {
      const gateway = await createGateway(
        mock(async () =>
          createSignedResponse(
            { code: "SYSTEM_ERROR", message: "raw upstream detail" },
            { status, requestId: `unavailable-${status}` },
          )) as unknown as typeof fetch,
      );

      const error = await gateway.probe(probeInput()).catch((caught) => caught);

      expect(error).toMatchObject({
        statusCode: 503,
        code: "WECHAT_PAY_PROFILE_PROBE_UNAVAILABLE",
        details: { requestId: `unavailable-${status}`, status },
      });
      expect(JSON.stringify(error)).not.toContain("raw upstream detail");
    },
  );

  test("wraps invalid response signatures with a stable AppError", async () => {
    const unrelatedKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    }).privateKey;
    const gateway = await createGateway(
      mock(async () =>
        createSignedResponse(
          { data: [] },
          { signingKey: unrelatedKey, requestId: "invalid-signature-id" },
        )) as unknown as typeof fetch,
    );

    await expect(gateway.probe(probeInput())).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
      details: { requestId: "invalid-signature-id" },
    });
  });

  test("wraps network failures with a stable AppError", async () => {
    const gateway = await createGateway(
      mock(async () => {
        throw new TypeError("network detail");
      }) as unknown as typeof fetch,
    );

    await expect(gateway.probe(probeInput())).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PROFILE_PROBE_TRANSPORT_FAILED",
      details: { requestId: null },
    });
  });

  test("wraps transport timeouts with a stable AppError", async () => {
    const fetchImpl = mock(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    ) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl, 5);

    await expect(gateway.probe(probeInput())).rejects.toMatchObject({
      statusCode: 504,
      code: "WECHAT_PAY_PROFILE_PROBE_TIMEOUT",
      details: { requestId: null },
    });
  });
});
