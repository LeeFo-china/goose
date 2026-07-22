import {
  createDecipheriv,
} from "node:crypto";

import { describe, expect, mock, test } from "bun:test";

import type {
  TencentOcrClientPort,
  TencentOcrSettingsPort,
} from "./tencent-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const gatewayModulePromise = import("./tencent-gateway");

const TEST_PUBLIC_KEY = "test-tencent-ocr-public-key";

function createSettings(overrides: Record<string, string | boolean | number> = {}) {
  const values: Record<string, string | boolean | number> = {
    TENCENT_OCR_ENABLED: true,
    TENCENT_OCR_SECRET_ID: "secret-id",
    TENCENT_OCR_SECRET_KEY: "secret-key",
    TENCENT_OCR_REGION: "ap-guangzhou",
    TENCENT_OCR_ENDPOINT: "ocr.tencentcloudapi.com",
    TENCENT_OCR_REQUEST_TIMEOUT_MS: 10_000,
    TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED: true,
    TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM: TEST_PUBLIC_KEY,
    TENCENT_OCR_ENCRYPTION_ALGORITHM: "AES-256-CBC",
    ...overrides,
  };
  return {
    getString: mock(async (key: string, fallback = "") => String(values[key] ?? fallback)),
    getSecretString: mock(async (key: string, fallback = "") => String(values[key] ?? fallback)),
    getNumber: mock(async (key: string, fallback: number) => Number(values[key] ?? fallback)),
    getBoolean: mock(async (key: string, fallback: boolean) => Boolean(values[key] ?? fallback)),
  } satisfies TencentOcrSettingsPort;
}

describe("TencentOcrGateway", () => {
  test("uses inspected SDK request flags for license and bank card", async () => {
    const { TencentOcrGateway } = await gatewayModulePromise;
    const client: TencentOcrClientPort = {
      BizLicenseOCR: mock(async () => ({ Name: "示例公司", RequestId: "license-id" })),
      BankCardOCR: mock(async () => ({ CardNo: "6222", RequestId: "bank-id" })),
      RecognizeEncryptedIDCardOCR: mock(async () => ({ RequestId: "id-id" })),
    };
    const gateway = new TencentOcrGateway({
      settings: createSettings(),
      clientFactory: () => client,
    });

    await gateway.recognize({ providerAction: "BizLicenseOCR", imageUrl: "https://signed/license.jpg" });
    await gateway.recognize({ providerAction: "BankCardOCR", imageUrl: "https://signed/bank.jpg" });

    expect(client.BizLicenseOCR).toHaveBeenCalledWith({
      ImageUrl: "https://signed/license.jpg",
      EnableCopyWarn: true,
      EnablePeriodComplete: true,
    });
    expect(client.BankCardOCR).toHaveBeenCalledWith({
      ImageUrl: "https://signed/bank.jpg",
      RetBorderCutImage: false,
      RetCardNoImage: false,
      EnableCopyCheck: true,
      EnableReshootCheck: true,
      EnableBorderCheck: true,
      EnableQualityValue: true,
    });
  });

  test("encrypts ID request and decrypts the encrypted response", async () => {
    const { TencentOcrGateway } = await gatewayModulePromise;
    let requestAesKey: Buffer | null = null;
    const client: TencentOcrClientPort = {
      BizLicenseOCR: mock(async () => ({ RequestId: "license-id" })),
      BankCardOCR: mock(async () => ({ RequestId: "bank-id" })),
      RecognizeEncryptedIDCardOCR: mock(async (request) => {
        const aesKey = requestAesKey;
        if (!aesKey) throw new TypeError("missing test AES key");
        const decipher = createDecipheriv("aes-256-cbc", aesKey, Buffer.from(request.Encryption.Iv, "base64"));
        const inner = JSON.parse(Buffer.concat([
          decipher.update(Buffer.from(request.EncryptedBody, "base64")),
          decipher.final(),
        ]).toString("utf8")) as Record<string, unknown>;
        expect(inner).toMatchObject({
          ImageUrl: "https://signed/id.jpg",
          CardSide: "FRONT",
          EnableRecognitionRectify: true,
        });
        expect(JSON.parse(String(inner.Config))).toMatchObject({
          CopyWarn: true,
          BorderCheckWarn: true,
          ReshootWarn: true,
          DetectPsWarn: true,
          InvalidDateWarn: true,
          Quality: true,
          ReflectWarn: true,
        });

        const responseCipher = (await import("node:crypto")).createCipheriv(
          "aes-256-cbc",
          aesKey,
          Buffer.from(request.Encryption.Iv, "base64"),
        );
        const encryptedBody = Buffer.concat([
          responseCipher.update(JSON.stringify({ Name: "李四", IdNum: "4115" }), "utf8"),
          responseCipher.final(),
        ]).toString("base64");
        return { EncryptedBody: encryptedBody, RequestId: "request-id" };
      }),
    };
    const gateway = new TencentOcrGateway({
      settings: createSettings(),
      clientFactory: () => client,
      encryptKey: (publicKeyPem, aesKey) => {
        expect(publicKeyPem).toBe(TEST_PUBLIC_KEY);
        requestAesKey = aesKey;
        return Buffer.from("encrypted-aes-key");
      },
    });

    const result = await gateway.recognize({
      providerAction: "RecognizeEncryptedIDCardOCR",
      imageUrl: "https://signed/id.jpg",
      cardSide: "FRONT",
    });
    expect(result).toMatchObject({
      Name: "李四",
      IdNum: "4115",
      RequestId: "request-id",
    });
  });

  test("never falls back when encrypted ID capability is unavailable", async () => {
    const { TencentOcrGateway } = await gatewayModulePromise;
    const gateway = new TencentOcrGateway({
      settings: createSettings({ TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM: "" }),
      clientFactory: () => ({
        BizLicenseOCR: mock(async () => ({})),
        BankCardOCR: mock(async () => ({})),
        RecognizeEncryptedIDCardOCR: mock(async () => ({})),
      }),
    });

    await expect(gateway.recognize({
      providerAction: "RecognizeEncryptedIDCardOCR",
      imageUrl: "https://signed/id.jpg",
      cardSide: "BACK",
    })).rejects.toMatchObject({ code: "OCR_CAPABILITY_UNAVAILABLE" });
  });

  test("maps provider errors without exposing provider payload", async () => {
    const { TencentOcrGateway } = await gatewayModulePromise;
    const gateway = new TencentOcrGateway({
      settings: createSettings(),
      clientFactory: () => ({
        BizLicenseOCR: mock(async () => {
          throw {
            code: "RequestLimitExceeded",
            requestId: "safe-request-id",
            message: "contains https://signed/private.jpg",
          };
        }),
        BankCardOCR: mock(async () => ({})),
        RecognizeEncryptedIDCardOCR: mock(async () => ({})),
      }),
    });

    await expect(gateway.recognize({
      providerAction: "BizLicenseOCR",
      imageUrl: "https://signed/private.jpg",
    })).rejects.toMatchObject({
      code: "OCR_PROVIDER_RATE_LIMITED",
      details: { providerCode: "RequestLimitExceeded", requestId: "safe-request-id" },
    });
  });
});
