import { describe, expect, mock, test } from "bun:test";
import { constants, generateKeyPairSync, publicEncrypt } from "node:crypto";
import { DouyinOpenPlatformClient } from "./client";

const AUTHORIZER_TOKEN = "authorizer-token-value";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function encryptedPhoneData(phone: string, appId = "authorizer-appid"): string {
  return publicEncrypt({
    key: publicKey,
    padding: constants.RSA_PKCS1_PADDING,
  }, Buffer.from(JSON.stringify({
    phoneNumber: `+86 ${phone}`,
    purePhoneNumber: phone,
    countryCode: "86",
    watermark: { appid: appId, timestamp: 1_799_999_999 },
  }), "utf8")).toString("base64");
}

function encryptedMalformedPkcs1Data(): string {
  const block = Buffer.alloc(256);
  block[0] = 0;
  block[1] = 2;
  block[2] = 1;
  block[3] = 0;
  block.write(JSON.stringify({
    purePhoneNumber: "13800000000",
    watermark: { appid: "authorizer-appid" },
  }), 4, "utf8");
  return publicEncrypt({
    key: publicKey,
    padding: constants.RSA_NO_PADDING,
  }, block).toString("base64");
}

describe("DouyinOpenPlatformClient phone number", () => {
  test("exchanges a Douyin getPhoneNumber code and decrypts the official response", async () => {
    const fetch = mock(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ err_no: 0, log_id: "phone-log", data: encryptedPhoneData("13800000000") }));
    const client = new DouyinOpenPlatformClient({ fetch });

    await expect(client.getPhoneNumberInfo({
      appId: "authorizer-appid",
      authorizerAccessToken: AUTHORIZER_TOKEN,
      code: "phone-code",
      privateKeyPem,
    })).resolves.toEqual({ phone: "13800000000" });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://open.douyin.com/api/apps/v1/get_phonenumber_info/",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "access-token": AUTHORIZER_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ code: "phone-code" }),
    });
  });

  test("rejects malformed phone responses without exposing the code or token", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "phone-log",
        data: "not-a-phone",
      }),
    });

    let caught: unknown;
    try {
      await client.getPhoneNumberInfo({
        appId: "authorizer-appid",
        authorizerAccessToken: AUTHORIZER_TOKEN,
        code: "phone-code",
        privateKeyPem,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
    });
    expect(JSON.stringify(caught)).not.toContain(AUTHORIZER_TOKEN);
    expect(JSON.stringify(caught)).not.toContain("phone-code");
  });

  test("rejects decrypted phone data for another miniapp", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "phone-log",
        data: encryptedPhoneData("13800000000", "another-appid"),
      }),
    });

    await expect(client.getPhoneNumberInfo({
      appId: "authorizer-appid",
      authorizerAccessToken: AUTHORIZER_TOKEN,
      code: "phone-code",
      privateKeyPem,
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
    });
  });

  test("rejects PKCS1 phone data with malformed padding", async () => {
    const client = new DouyinOpenPlatformClient({
      fetch: async () => jsonResponse({
        err_no: 0,
        log_id: "phone-log",
        data: encryptedMalformedPkcs1Data(),
      }),
    });

    await expect(client.getPhoneNumberInfo({
      appId: "authorizer-appid",
      authorizerAccessToken: AUTHORIZER_TOKEN,
      code: "phone-code",
      privateKeyPem,
    })).rejects.toMatchObject({
      statusCode: 502,
      code: "DOUYIN_OPEN_PLATFORM_RESPONSE_INVALID",
    });
  });
});
