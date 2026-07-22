import type { ClientConfig } from "tencentcloud-sdk-nodejs-common";
import { ocr } from "tencentcloud-sdk-nodejs-ocr";
import type {
  BankCardOCRRequest,
  BankCardOCRResponse,
  BizLicenseOCRRequest,
  BizLicenseOCRResponse,
  GeneralBasicOCRRequest,
  GeneralBasicOCRResponse,
  RecognizeEncryptedIDCardOCRRequest,
  RecognizeEncryptedIDCardOCRResponse,
} from "tencentcloud-sdk-nodejs-ocr/tencentcloud/services/ocr/v20181119/ocr_models";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

type CamProbeClient = {
  BizLicenseOCR(request: BizLicenseOCRRequest): Promise<BizLicenseOCRResponse>;
  BankCardOCR(request: BankCardOCRRequest): Promise<BankCardOCRResponse>;
  RecognizeEncryptedIDCardOCR(
    request: RecognizeEncryptedIDCardOCRRequest,
  ): Promise<RecognizeEncryptedIDCardOCRResponse>;
  GeneralBasicOCR(request: GeneralBasicOCRRequest): Promise<GeneralBasicOCRResponse>;
};

type ProbeAction =
  | "BizLicenseOCR"
  | "BankCardOCR"
  | "RecognizeEncryptedIDCardOCR"
  | "GeneralBasicOCR";

type ProbeOutcome =
  | "success"
  | "business_error"
  | "permission_denied"
  | "credential_error"
  | "transport_error";

type ProviderError = {
  code?: string;
  requestId?: string;
  request_id?: string;
};

type ProbeCheck = {
  action: ProbeAction;
  expected: "allowed" | "denied";
  outcome: ProbeOutcome;
  passed: boolean;
  provider_code: string | null;
  request_id: string | null;
};

type ReadinessInput = {
  client: CamProbeClient;
  write?: (line: string) => void;
};

const BLANK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=";

export async function runTencentOcrCamReadiness(input: ReadinessInput) {
  const probes: Array<{
    action: ProbeAction;
    expected: "allowed" | "denied";
    execute: () => Promise<unknown>;
  }> = [
    {
      action: "BizLicenseOCR",
      expected: "allowed",
      execute: () => input.client.BizLicenseOCR({
        ImageBase64: BLANK_PNG_BASE64,
        EnableCopyWarn: true,
      }),
    },
    {
      action: "BankCardOCR",
      expected: "allowed",
      execute: () => input.client.BankCardOCR({ ImageBase64: BLANK_PNG_BASE64 }),
    },
    {
      action: "RecognizeEncryptedIDCardOCR",
      expected: "allowed",
      execute: () => input.client.RecognizeEncryptedIDCardOCR({
        EncryptedBody: "invalid-readiness-probe",
        Encryption: {
          CiphertextBlob: "invalid-readiness-probe",
          Iv: Buffer.alloc(16).toString("base64"),
          Algorithm: "AES-256-CBC",
          EncryptList: ["EncryptedBody"],
          TagList: [],
        },
      }),
    },
    {
      action: "GeneralBasicOCR",
      expected: "denied",
      execute: () => input.client.GeneralBasicOCR({ ImageBase64: BLANK_PNG_BASE64 }),
    },
  ];

  const checks: ProbeCheck[] = [];
  for (const probe of probes) {
    checks.push(await executeProbe(probe));
  }

  const output = {
    generated_at: new Date().toISOString(),
    ready: checks.every((check) => check.passed),
    policy_file: "deploy/tencent-ocr-phase1-cam-policy.json",
    probe_image: "embedded_1x1_blank_png",
    billable_document_used: false,
    checks,
  };
  (input.write ?? console.log)(JSON.stringify(output));
  return output;
}

async function executeProbe(input: {
  action: ProbeAction;
  expected: "allowed" | "denied";
  execute: () => Promise<unknown>;
}): Promise<ProbeCheck> {
  try {
    await input.execute();
    return buildCheck(input, "success", null, null);
  } catch (error) {
    const providerError = readProviderError(error);
    const outcome = classifyProviderError(providerError);
    return buildCheck(
      input,
      outcome,
      providerError.code ?? null,
      providerError.requestId ?? providerError.request_id ?? null,
    );
  }
}

function buildCheck(
  input: { action: ProbeAction; expected: "allowed" | "denied" },
  outcome: ProbeOutcome,
  providerCode: string | null,
  requestId: string | null,
): ProbeCheck {
  const passed = input.expected === "allowed"
    ? outcome === "success" || outcome === "business_error"
    : outcome === "permission_denied";
  return {
    action: input.action,
    expected: input.expected,
    outcome,
    passed,
    provider_code: providerCode,
    request_id: requestId,
  };
}

function readProviderError(error: unknown): ProviderError {
  return error && typeof error === "object" ? error as ProviderError : {};
}

function classifyProviderError(error: ProviderError): ProbeOutcome {
  const code = error.code ?? "";
  if (/UnauthorizedOperation|OperationDenied|NoPermission|Forbidden/i.test(code)) {
    return "permission_denied";
  }
  if (/AuthFailure|InvalidCredential|SecretId|SignatureFailure/i.test(code)) {
    return "credential_error";
  }
  if ((error.requestId ?? error.request_id) && code) return "business_error";
  return "transport_error";
}

function createClientFromEnvironment(): CamProbeClient {
  const secretId = process.env.TENCENT_OCR_SECRET_ID?.trim() ?? "";
  const secretKey = process.env.TENCENT_OCR_SECRET_KEY?.trim() ?? "";
  if (!secretId || !secretKey) {
    throw Errors.business(
      503,
      "腾讯云OCR预检密钥未配置",
      ErrorCodes.OCR_CONFIG_MISSING,
    );
  }

  const config: ClientConfig = {
    credential: { secretId, secretKey },
    region: process.env.TENCENT_OCR_REGION?.trim() || "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: process.env.TENCENT_OCR_ENDPOINT?.trim() || "ocr.tencentcloudapi.com",
        protocol: "https://",
        reqMethod: "POST",
        reqTimeout: 10,
      },
    },
  };
  return new ocr.v20181119.Client(config);
}

async function main() {
  const result = await runTencentOcrCamReadiness({
    client: createClientFromEnvironment(),
  });
  if (!result.ready) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "腾讯云OCR CAM预检失败";
    console.error(message);
    process.exit(1);
  });
}
