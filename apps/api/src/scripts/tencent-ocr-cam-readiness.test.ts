import { describe, expect, mock, test } from "bun:test";
import { createDecipheriv, generateKeyPairSync } from "node:crypto";

const readinessModulePromise = import("./tencent-ocr-cam-readiness");

function providerFailure(code: string, requestId: string) {
  return { code, requestId };
}

const TEST_ENCRYPTED_ID_REQUEST = {
  EncryptedBody: Buffer.from("encrypted-body").toString("base64"),
  Encryption: {
    CiphertextBlob: Buffer.alloc(128, 1).toString("base64"),
    Iv: Buffer.alloc(16).toString("base64"),
    Algorithm: "AES-256-CBC",
    EncryptList: ["EncryptedBody"],
    TagList: [],
  },
};

function createClient(overrides: Partial<Record<string, ReturnType<typeof mock>>> = {}) {
  return {
    BizLicenseOCR:
      overrides.BizLicenseOCR ??
      mock(async () => {
        throw providerFailure("FailedOperation.NoBizLicense", "license-request");
      }),
    BankCardOCR:
      overrides.BankCardOCR ??
      mock(async () => {
        throw providerFailure("FailedOperation.OcrFailed", "bank-request");
      }),
    RecognizeEncryptedIDCardOCR:
      overrides.RecognizeEncryptedIDCardOCR ??
      mock(async () => {
        throw providerFailure("InvalidParameterValue", "id-request");
      }),
    GeneralBasicOCR:
      overrides.GeneralBasicOCR ??
      mock(async () => {
        throw providerFailure("AuthFailure.UnauthorizedOperation", "general-request");
      }),
  };
}

describe("Tencent OCR CAM readiness", () => {
  test("passes only when Phase 1 actions are reachable and the out-of-scope action is denied", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;
    const write = mock((_line: string) => undefined);

    const result = await runTencentOcrCamReadiness({
      client: createClient(),
      encryptedIdRequest: TEST_ENCRYPTED_ID_REQUEST,
      write,
    });

    expect(result.ready).toBe(true);
    expect(result).toMatchObject({
      credential_source: "platform_settings",
      official_endpoint: true,
      runtime_probe_ready: true,
      policy_binding_verified: false,
      production_ready: false,
      encrypted_id_probe_payload_valid: true,
      real_document_used: false,
    });
    expect(result.checks).toEqual([
      expect.objectContaining({
        action: "BizLicenseOCR",
        outcome: "business_error",
        passed: true,
      }),
      expect.objectContaining({
        action: "BankCardOCR",
        outcome: "business_error",
        passed: true,
      }),
      expect.objectContaining({
        action: "RecognizeEncryptedIDCardOCR",
        outcome: "business_error",
        passed: true,
      }),
      expect.objectContaining({
        action: "GeneralBasicOCR",
        outcome: "permission_denied",
        passed: true,
      }),
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).not.toContain("message");
  });

  test("loads the effective platform settings instead of environment credentials by default", async () => {
    const { createTencentOcrCamReadinessContext, runTencentOcrCamReadiness } =
      await readinessModulePromise;
    const capturedConfigs: unknown[] = [];
    const { publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });
    const values: Record<string, string | number> = {
      TENCENT_OCR_SECRET_ID: "platform-secret-id",
      TENCENT_OCR_SECRET_KEY: "platform-secret-key",
      TENCENT_OCR_REGION: "ap-guangzhou",
      TENCENT_OCR_ENDPOINT: "ocr.tencentcloudapi.com",
      TENCENT_OCR_REQUEST_TIMEOUT_MS: 12_000,
      TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM: publicKey,
    };
    const platformSettingReader = {
      findByKey: mock(async (key: string) => ({
        key,
        value_text: String(values[key] ?? ""),
        is_secret:
          key === "TENCENT_OCR_SECRET_ID" ||
          key === "TENCENT_OCR_SECRET_KEY" ||
          key === "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM",
        status: "active" as const,
      })),
    };

    const context = await createTencentOcrCamReadinessContext({
      source: "platform_settings",
      platformSettingReader,
      decryptSecret: (value) => value,
      encryptedIdRequestFactory: (publicKeyPem) => {
        expect(publicKeyPem).toBe(publicKey.trim());
        return TEST_ENCRYPTED_ID_REQUEST;
      },
      environment: {
        TENCENT_OCR_SECRET_ID: "environment-secret-id",
        TENCENT_OCR_SECRET_KEY: "environment-secret-key",
      },
      clientFactory: (config) => {
        capturedConfigs.push(config);
        return createClient();
      },
    });

    expect(context.credentialSource).toBe("platform_settings");
    expect(context.encryptedIdRequest).toEqual(TEST_ENCRYPTED_ID_REQUEST);
    expect(capturedConfigs).toEqual([
      expect.objectContaining({
        credential: {
          secretId: "platform-secret-id",
          secretKey: "platform-secret-key",
        },
        region: "ap-guangzhou",
        profile: {
          httpProfile: expect.objectContaining({
            endpoint: "ocr.tencentcloudapi.com",
            reqTimeout: 12,
          }),
        },
      }),
    ]);

    const output = await runTencentOcrCamReadiness({
      client: context.client,
      credentialSource: context.credentialSource,
      endpoint: context.endpoint,
      encryptedIdRequest: context.encryptedIdRequest,
      write: mock(() => undefined),
    });
    expect(JSON.stringify(output)).not.toContain("platform-secret-id");
    expect(JSON.stringify(output)).not.toContain("platform-secret-key");
    expect(JSON.stringify(output)).not.toContain(publicKey.trim());
  });

  test("creates an encrypted ID probe and passes its AES key to PKCS1 encryption", async () => {
    const { createTencentEncryptedIdProbeRequest } = await readinessModulePromise;
    const { publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    let aesKey: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    const request = createTencentEncryptedIdProbeRequest(publicKey, (receivedKey, key) => {
      expect(receivedKey).toBe(publicKey);
      aesKey = key;
      return Buffer.from("encrypted-aes-key");
    });
    expect(aesKey).toHaveLength(32);
    const iv = Buffer.from(request.Encryption.Iv, "base64");
    const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
    const body = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(request.EncryptedBody, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );

    expect(body).toMatchObject({ CardSide: "FRONT" });
    expect(body.ImageBase64).toBeString();
    expect(body.ImageBase64.length).toBeGreaterThan(10);
    expect(request.Encryption).toMatchObject({
      CiphertextBlob: Buffer.from("encrypted-aes-key").toString("base64"),
      Algorithm: "AES-256-CBC",
      EncryptList: ["EncryptedBody"],
      TagList: [],
    });
  });

  test("does not mark a malformed encrypted ID request as a valid probe payload", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient(),
      encryptedIdRequest: {
        EncryptedBody: "encrypted-body",
        Encryption: {
          CiphertextBlob: "",
          Iv: "not-a-valid-iv",
          Algorithm: "AES-256-CBC",
          EncryptList: ["EncryptedBody"],
          TagList: [],
        },
      },
      write: mock(() => undefined),
    });

    expect(result.encrypted_id_probe_payload_valid).toBe(false);
    expect(result.ready).toBe(false);
  });

  test("does not fall back to environment credentials when platform records are missing", async () => {
    const { createTencentOcrCamReadinessContext } = await readinessModulePromise;

    await expect(
      createTencentOcrCamReadinessContext({
        source: "platform_settings",
        platformSettingReader: {
          findByKey: mock(async () => null),
        },
        decryptSecret: (value) => value,
        environment: {
          TENCENT_OCR_SECRET_ID: "environment-secret-id",
          TENCENT_OCR_SECRET_KEY: "environment-secret-key",
        },
        clientFactory: mock(() => createClient()),
      }),
    ).rejects.toMatchObject({ code: "OCR_CONFIG_MISSING" });
  });

  test("fails closed before client creation when the effective endpoint is not Tencent OCR", async () => {
    const { createTencentOcrCamReadinessContext } = await readinessModulePromise;
    const clientFactory = mock(() => createClient());

    await expect(
      createTencentOcrCamReadinessContext({
        source: "environment",
        environment: {
          TENCENT_OCR_SECRET_ID: "secret-id",
          TENCENT_OCR_SECRET_KEY: "secret-key",
          TENCENT_OCR_ENDPOINT: "ocr-proxy.example.com",
        },
        clientFactory,
      }),
    ).rejects.toMatchObject({
      code: "OCR_CONFIG_MISSING",
    });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  test("fails when an out-of-scope OCR action remains reachable", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient({
        GeneralBasicOCR: mock(async () => {
          throw providerFailure("FailedOperation.ImageDecodeFailed", "general-request");
        }),
      }),
      write: mock(() => undefined),
    });

    expect(result.ready).toBe(false);
    expect(result.checks.at(-1)).toMatchObject({
      action: "GeneralBasicOCR",
      outcome: "business_error",
      passed: false,
    });
  });

  test("fails when a required Phase 1 action is denied", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient({
        BankCardOCR: mock(async () => {
          throw providerFailure("AuthFailure.UnauthorizedOperation", "bank-request");
        }),
      }),
      write: mock(() => undefined),
    });

    expect(result.ready).toBe(false);
    expect(result.checks[1]).toMatchObject({
      action: "BankCardOCR",
      outcome: "permission_denied",
      passed: false,
    });
  });

  test("does not treat provider throttling as proof that a required action is reachable", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient({
        BizLicenseOCR: mock(async () => {
          throw providerFailure("RequestLimitExceeded", "throttled-request");
        }),
      }),
      write: mock(() => undefined),
    });

    expect(result.ready).toBe(false);
    expect(result.checks[0]).toMatchObject({
      action: "BizLicenseOCR",
      outcome: "business_error",
      provider_code: "RequestLimitExceeded",
      passed: false,
    });
  });

  test("does not treat an encrypted ID unknown error as parameter-validation evidence", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient({
        RecognizeEncryptedIDCardOCR: mock(async () => {
          throw providerFailure("FailedOperation.UnKnowError", "unknown-request");
        }),
      }),
      write: mock(() => undefined),
    });

    expect(result.ready).toBe(false);
    expect(result.checks[2]).toMatchObject({
      action: "RecognizeEncryptedIDCardOCR",
      provider_code: "FailedOperation.UnKnowError",
      passed: false,
    });
  });

  test("fails closed when credentials are invalid", async () => {
    const { runTencentOcrCamReadiness } = await readinessModulePromise;

    const result = await runTencentOcrCamReadiness({
      client: createClient({
        BizLicenseOCR: mock(async () => {
          throw providerFailure("AuthFailure.SecretIdNotFound", "credential-request");
        }),
      }),
      write: mock(() => undefined),
    });

    expect(result.ready).toBe(false);
    expect(result.checks[0]).toMatchObject({
      action: "BizLicenseOCR",
      outcome: "credential_error",
      passed: false,
    });
  });
});
