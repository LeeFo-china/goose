import { describe, expect, mock, test } from "bun:test";

const readinessModulePromise = import("./tencent-ocr-cam-readiness");

function providerFailure(code: string, requestId: string) {
  return { code, requestId };
}

function createClient(overrides: Partial<Record<string, ReturnType<typeof mock>>> = {}) {
  return {
    BizLicenseOCR: overrides.BizLicenseOCR ?? mock(async () => {
      throw providerFailure("FailedOperation.NoBizLicense", "license-request");
    }),
    BankCardOCR: overrides.BankCardOCR ?? mock(async () => {
      throw providerFailure("FailedOperation.OcrFailed", "bank-request");
    }),
    RecognizeEncryptedIDCardOCR: overrides.RecognizeEncryptedIDCardOCR ?? mock(async () => {
      throw providerFailure("InvalidParameterValue", "id-request");
    }),
    GeneralBasicOCR: overrides.GeneralBasicOCR ?? mock(async () => {
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
      write,
    });

    expect(result.ready).toBe(true);
    expect(result.checks).toEqual([
      expect.objectContaining({ action: "BizLicenseOCR", outcome: "business_error", passed: true }),
      expect.objectContaining({ action: "BankCardOCR", outcome: "business_error", passed: true }),
      expect.objectContaining({ action: "RecognizeEncryptedIDCardOCR", outcome: "business_error", passed: true }),
      expect.objectContaining({ action: "GeneralBasicOCR", outcome: "permission_denied", passed: true }),
    ]);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).not.toContain("message");
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
