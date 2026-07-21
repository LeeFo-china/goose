import { describe, expect, mock, test } from "bun:test";
import {
  createVerify,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import type { WechatPayApplymentSubmitRequest } from "./wechat-pay-applyment-request-builder";

const RESPONSE_TIMESTAMP = "1782873600";
const RESPONSE_NONCE = "wechat-response-nonce";
const PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
const merchantKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const wechatKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

const profile = {
  merchantId: "1561816121",
  serialNo: "MERCHANT_CERT_SERIAL",
  privateKeyPem: merchantKeys.privateKey,
  wechatPayPublicKeyId: PUBLIC_KEY_ID,
  wechatPayPublicKeyPem: wechatKeys.publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
};

const submitRequest = {
  business_code: "1561816121_WPA202607010001",
  contact_info: {
    contact_type: "LEGAL",
    contact_name: "encrypted-contact-name",
    mobile_phone: "encrypted-mobile",
    contact_email: "encrypted-email",
  },
  subject_info: {
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    business_license_info: {
      license_copy: "media-license",
      license_number: "91411525MA00000000",
      merchant_name: "固始晴天装饰工程有限公司",
      legal_person: "张三",
    },
    identity_info: {
      id_doc_type: "IDENTIFICATION_TYPE_IDCARD",
      id_card_info: {
        id_card_copy: "media-front",
        id_card_national: "media-back",
        id_card_name: "encrypted-name",
        id_card_number: "encrypted-id",
        card_period_begin: "2020-01-01",
        card_period_end: "长期",
      },
    },
  },
  business_info: {
    merchant_shortname: "晴天装饰",
    service_phone: "0376-1234567",
    sales_info: {
      sales_scenes_type: ["SALES_SCENES_MINI_PROGRAM"],
      mini_program_info: {
        mini_program_appid: "wxbac3b1e168fd968a",
      },
    },
  },
  settlement_info: {
    settlement_id: "719",
    qualification_type: "生活服务/家装服务",
  },
  bank_account_info: {
    bank_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    account_name: "encrypted-account-name",
    account_bank: "中国银行",
    account_number: "encrypted-account-number",
  },
} satisfies WechatPayApplymentSubmitRequest;

describe("WechatPayApplymentGateway", () => {
  test("uploads multipart media while signing only the exact meta JSON", async () => {
    const fetchMock = mock(async () => signedResponse({ media_id: "media-1" }));
    const gateway = await createGateway(fetchMock as unknown as typeof fetch);
    const file = Buffer.from("image-bytes");
    const sha256 = "a".repeat(64);

    const result = await gateway.uploadMedia({
      profile,
      filename: "license.png",
      contentType: "image/png",
      sha256,
      file,
    });

    expect(result).toEqual({
      mediaId: "media-1",
      requestId: "wechat-request-id",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.mch.weixin.qq.com/v3/merchant/media/upload",
    );
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe(
      "multipart/form-data; boundary=gooes-test-boundary",
    );
    expect(headers.get("Wechatpay-Serial")).toBeNull();
    expectAuthorization(
      headers.get("Authorization") ?? "",
      "POST",
      "/v3/merchant/media/upload",
      JSON.stringify({ filename: "license.png", sha256 }),
    );
    const multipart = Buffer.from(init.body as ArrayBuffer).toString("latin1");
    expect(multipart).toContain('name="meta"');
    expect(multipart).toContain('name="file"; filename="license.png"');
    expect(multipart).toContain("\r\n--gooes-test-boundary--\r\n");
  });

  test("submits an official applyment with the WeChat Pay public key ID", async () => {
    const fetchMock = mock(async () => signedResponse({
      applyment_id: 2000002124775691,
    }));
    const gateway = await createGateway(fetchMock as unknown as typeof fetch);

    const result = await gateway.submit({ profile, request: submitRequest });

    expect(result).toEqual({
      applymentId: "2000002124775691",
      requestId: "wechat-request-id",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.mch.weixin.qq.com/v3/applyment4sub/applyment/",
    );
    const headers = new Headers(init.headers);
    expect(headers.get("Wechatpay-Serial")).toBe(PUBLIC_KEY_ID);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify(submitRequest));
    expectAuthorization(
      headers.get("Authorization") ?? "",
      "POST",
      "/v3/applyment4sub/applyment/",
      JSON.stringify(submitRequest),
    );
  });

  test("queries by an encoded business code and maps the verified state", async () => {
    const fetchMock = mock(async () => signedResponse({
      business_code: "1561816121_WPA/001?",
      applyment_id: 2000002124775691,
      sub_mchid: "1900000109",
      sign_url: "https://pay.weixin.qq.com/sign/example",
      applyment_state: "APPLYMENT_STATE_TO_BE_SIGNED",
      applyment_state_msg: "待签约",
      audit_detail: [],
    }));
    const gateway = await createGateway(fetchMock as unknown as typeof fetch);

    const result = await gateway.queryByBusinessCode({
      profile,
      businessCode: "1561816121_WPA/001?",
    });

    expect(result).toEqual({
      businessCode: "1561816121_WPA/001?",
      applymentId: "2000002124775691",
      subMchid: "1900000109",
      signUrl: "https://pay.weixin.qq.com/sign/example",
      applymentState: "APPLYMENT_STATE_TO_BE_SIGNED",
      applymentStateMessage: "待签约",
      auditDetail: [],
      requestId: "wechat-request-id",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const urlPath =
      "/v3/applyment4sub/applyment/business_code/1561816121_WPA%2F001%3F";
    expect(url).toBe(`https://api.mch.weixin.qq.com${urlPath}`);
    expect(init.method).toBe("GET");
    expectAuthorization(
      new Headers(init.headers).get("Authorization") ?? "",
      "GET",
      urlPath,
      "",
    );
  });

  test("rejects a response with an invalid signature and keeps only request ID", async () => {
    const wrongKey = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" },
    }).privateKey;
    const gateway = await createGateway(
      mock(async () => signedResponse(
        { applyment_id: 2000002124775691 },
        { signingKey: wrongKey, requestId: "invalid-signature-id" },
      )) as unknown as typeof fetch,
    );

    await expect(gateway.submit({ profile, request: submitRequest }))
      .rejects.toMatchObject({
        code: "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
        details: { requestId: "invalid-signature-id" },
      });
  });

  test("maps signed WeChat failures without exposing the message or request body", async () => {
    const upstreamMessage = "身份证号 41000019900101001X 不正确";
    const gateway = await createGateway(
      mock(async () => signedResponse(
        { code: "PARAM_ERROR", message: upstreamMessage },
        { status: 400, requestId: "rejected-request-id" },
      )) as unknown as typeof fetch,
    );

    const error = await gateway.submit({
      profile,
      request: submitRequest,
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
      details: {
        operation: "submit",
        requestId: "rejected-request-id",
        status: 400,
        wechatCode: "PARAM_ERROR",
      },
    });
    expect(JSON.stringify(error)).not.toContain(upstreamMessage);
    expect(JSON.stringify(error)).not.toContain(submitRequest.contact_info.contact_name);
  });

  test("aborts timed-out requests with a stable diagnostic", async () => {
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

    await expect(gateway.submit({ profile, request: submitRequest }))
      .rejects.toMatchObject({
        statusCode: 504,
        code: "WECHAT_PAY_APPLYMENT_TIMEOUT",
        details: {
          operation: "submit",
          requestId: null,
          timeoutMs: 5,
        },
      });
  });
});

async function createGateway(fetchImpl: typeof fetch, requestTimeoutMs = 1_000) {
  const { WechatPayApplymentGateway } = await import(
    "./wechat-pay-applyment-gateway"
  );
  return new WechatPayApplymentGateway({
    fetchImpl,
    nonceFactory: () => "request-nonce",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
    boundaryFactory: () => "gooes-test-boundary",
    requestTimeoutMs,
  });
}

function signedResponse(
  payload: Record<string, unknown>,
  options: {
    status?: number;
    requestId?: string;
    signingKey?: string;
  } = {},
) {
  const rawBody = JSON.stringify(payload);
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(
      `${RESPONSE_TIMESTAMP}\n${RESPONSE_NONCE}\n${rawBody}\n`,
    ),
    options.signingKey ?? wechatKeys.privateKey,
  ).toString("base64");
  return new Response(rawBody, {
    status: options.status ?? 200,
    headers: {
      "request-id": options.requestId ?? "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": RESPONSE_NONCE,
      "wechatpay-serial": PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
}

function expectAuthorization(
  authorization: string,
  method: string,
  urlPath: string,
  body: string,
) {
  expect(authorization).toContain('mchid="1561816121"');
  expect(authorization).toContain('serial_no="MERCHANT_CERT_SERIAL"');
  const signature = authorization.match(/signature="([^"]+)"/)?.[1] ?? "";
  const verifier = createVerify("RSA-SHA256");
  verifier.update(
    `${method}\n${urlPath}\n${RESPONSE_TIMESTAMP}\nrequest-nonce\n${body}\n`,
  );
  verifier.end();
  expect(verifier.verify(merchantKeys.publicKey, signature, "base64"))
    .toBe(true);
}
