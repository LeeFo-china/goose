import type { ClientConfig } from "tencentcloud-sdk-nodejs-common";
import { ocr } from "tencentcloud-sdk-nodejs-ocr";
import { constants, createCipheriv, publicEncrypt, randomBytes } from "node:crypto";
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
import { isTencentOcrEncryptionPublicKeyPem } from "@/services/ocr/tencent-encryption-key";

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
  credentialSource?: ReadinessCredentialSource;
  encryptedIdRequest?: RecognizeEncryptedIDCardOCRRequest;
  endpoint?: string;
  write?: (line: string) => void;
};

type ReadinessCredentialSource = "platform_settings" | "environment";

type ReadinessPlatformSettingRecord = {
  key: string;
  value_text: string | null;
  is_secret: boolean;
  status: "active" | "inactive";
};

type ReadinessPlatformSettingReader = {
  findByKey(key: string, tenantId?: string | null): Promise<ReadinessPlatformSettingRecord | null>;
};

type ReadinessEnvironment = Record<string, string | undefined>;

type ReadinessContextInput = {
  source?: ReadinessCredentialSource;
  platformSettingReader?: ReadinessPlatformSettingReader;
  decryptSecret?: (value: string) => string;
  environment?: ReadinessEnvironment;
  clientFactory?: (config: ClientConfig) => CamProbeClient;
  encryptedIdRequestFactory?: (publicKeyPem: string) => RecognizeEncryptedIDCardOCRRequest;
};

const OFFICIAL_OCR_ENDPOINT = "ocr.tencentcloudapi.com";

const BLANK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n9sAAAAASUVORK5CYII=";

export async function runTencentOcrCamReadiness(input: ReadinessInput) {
  const encryptedIdProbePayloadValid = isValidEncryptedIdProbeRequest(input.encryptedIdRequest);
  const probes: Array<{
    action: ProbeAction;
    expected: "allowed" | "denied";
    execute: () => Promise<unknown>;
  }> = [
    {
      action: "BizLicenseOCR",
      expected: "allowed",
      execute: () =>
        input.client.BizLicenseOCR({
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
      execute: () =>
        input.client.RecognizeEncryptedIDCardOCR(
          input.encryptedIdRequest ?? {
            EncryptedBody: "invalid-readiness-probe",
            Encryption: {
              CiphertextBlob: "invalid-readiness-probe",
              Iv: Buffer.alloc(16).toString("base64"),
              Algorithm: "AES-256-CBC",
              EncryptList: ["EncryptedBody"],
              TagList: [],
            },
          },
        ),
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

  const runtimeProbeReady = checks.every((check) => check.passed);
  const endpoint = input.endpoint?.trim() || OFFICIAL_OCR_ENDPOINT;
  const officialEndpoint = endpoint === OFFICIAL_OCR_ENDPOINT;
  const output = {
    generated_at: new Date().toISOString(),
    ready: runtimeProbeReady && officialEndpoint && encryptedIdProbePayloadValid,
    credential_source: input.credentialSource ?? "platform_settings",
    official_endpoint: officialEndpoint,
    runtime_probe_ready: runtimeProbeReady,
    encrypted_id_probe_payload_valid: encryptedIdProbePayloadValid,
    policy_binding_verified: false,
    production_ready: false,
    policy_file: "deploy/tencent-ocr-phase1-cam-policy.json",
    probe_image: "embedded_1x1_blank_png",
    real_document_used: false,
    checks,
  };
  (input.write ?? console.log)(JSON.stringify(output));
  return output;
}

function isValidEncryptedIdProbeRequest(request: RecognizeEncryptedIDCardOCRRequest | undefined) {
  if (!request?.Encryption) return false;
  const encryption = request.Encryption;
  return (
    isBase64WithByteLength(request.EncryptedBody) &&
    isBase64WithByteLength(encryption.CiphertextBlob, 128) &&
    isBase64WithByteLength(encryption.Iv, 16) &&
    encryption.Algorithm === "AES-256-CBC" &&
    encryption.EncryptList?.length === 1 &&
    encryption.EncryptList[0] === "EncryptedBody" &&
    Array.isArray(encryption.TagList) &&
    encryption.TagList.length === 0
  );
}

function isBase64WithByteLength(value: string | undefined, expectedBytes?: number) {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) return false;
  return expectedBytes === undefined ? decoded.length > 0 : decoded.length === expectedBytes;
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
  const passed =
    input.expected === "allowed"
      ? outcome === "success" ||
        (outcome === "business_error" && isExpectedProbeError(input.action, providerCode))
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

function isExpectedProbeError(action: ProbeAction, code: string | null) {
  if (!code) return false;
  if (action === "BizLicenseOCR") {
    return /^FailedOperation\.(NoBizLicense|OcrFailed|ImageDecodeFailed)$/.test(code);
  }
  if (action === "BankCardOCR") {
    return /^FailedOperation\.(OcrFailed|ImageDecodeFailed)$/.test(code);
  }
  if (action === "RecognizeEncryptedIDCardOCR") {
    return /^(?:InvalidParameter(?:Value)?|FailedOperation\.(?:OcrFailed|ImageDecodeFailed))(?:\.|$)/.test(
      code,
    );
  }
  return false;
}

function readProviderError(error: unknown): ProviderError {
  return error && typeof error === "object" ? (error as ProviderError) : {};
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

export async function createTencentOcrCamReadinessContext(input: ReadinessContextInput = {}) {
  const source = input.source ?? "platform_settings";
  const environment = input.environment ?? process.env;
  const loaded =
    source === "platform_settings"
      ? await loadPlatformSettings(
          input.platformSettingReader ?? (await loadDefaultPlatformSettingReader()),
          input.decryptSecret ?? (await loadDefaultSecretDecryptor()),
        )
      : loadEnvironmentSettings(environment);
  const secretId = loaded.secretId.trim();
  const secretKey = loaded.secretKey.trim();
  if (!secretId || !secretKey) {
    throw Errors.business(503, "腾讯云OCR预检密钥未配置", ErrorCodes.OCR_CONFIG_MISSING);
  }

  const endpoint = loaded.endpoint.trim() || OFFICIAL_OCR_ENDPOINT;
  if (endpoint !== OFFICIAL_OCR_ENDPOINT) {
    throw Errors.business(503, "腾讯云OCR预检必须使用官方服务端点", ErrorCodes.OCR_CONFIG_MISSING);
  }

  const encryptionPublicKeyPem = loaded.encryptionPublicKeyPem.trim();
  if (!isTencentOcrEncryptionPublicKeyPem(encryptionPublicKeyPem)) {
    throw Errors.business(503, "腾讯云OCR身份证加密公钥未配置", ErrorCodes.OCR_CONFIG_MISSING);
  }

  const config: ClientConfig = {
    credential: { secretId, secretKey },
    region: loaded.region.trim() || "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint,
        protocol: "https://",
        reqMethod: "POST",
        reqTimeout: Math.max(1, Math.ceil(loaded.requestTimeoutMs / 1_000)),
      },
    },
  };
  const clientFactory =
    input.clientFactory ?? ((value: ClientConfig) => new ocr.v20181119.Client(value));
  return {
    client: clientFactory(config),
    credentialSource: source,
    encryptedIdRequest: (input.encryptedIdRequestFactory ?? createTencentEncryptedIdProbeRequest)(
      encryptionPublicKeyPem,
    ),
    endpoint,
  };
}

export function createTencentEncryptedIdProbeRequest(
  publicKeyPem: string,
  encryptKey: (publicKey: string, aesKey: Buffer) => Buffer = (publicKey, aesKey) =>
    publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_PADDING }, aesKey),
): RecognizeEncryptedIDCardOCRRequest {
  const aesKey = randomBytes(32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
  const encryptedBody = Buffer.concat([
    cipher.update(JSON.stringify({ ImageBase64: BLANK_PNG_BASE64, CardSide: "FRONT" }), "utf8"),
    cipher.final(),
  ]).toString("base64");
  const encryptedKey = encryptKey(publicKeyPem, aesKey);

  return {
    EncryptedBody: encryptedBody,
    Encryption: {
      CiphertextBlob: encryptedKey.toString("base64"),
      Iv: iv.toString("base64"),
      Algorithm: "AES-256-CBC",
      EncryptList: ["EncryptedBody"],
      TagList: [],
    },
  };
}

async function loadDefaultPlatformSettingReader(): Promise<ReadinessPlatformSettingReader> {
  const { systemSettingRepository } = await import("@/repositories/system-settings");
  return systemSettingRepository;
}

async function loadDefaultSecretDecryptor() {
  const { decryptSecretValue } = await import("@/services/system-settings/legacy/crypto");
  return decryptSecretValue;
}

async function loadPlatformSettings(
  reader: ReadinessPlatformSettingReader,
  decryptSecret: (value: string) => string,
) {
  const [
    secretIdRecord,
    secretKeyRecord,
    regionRecord,
    endpointRecord,
    timeoutRecord,
    encryptionPublicKeyRecord,
  ] = await Promise.all([
    reader.findByKey("TENCENT_OCR_SECRET_ID", null),
    reader.findByKey("TENCENT_OCR_SECRET_KEY", null),
    reader.findByKey("TENCENT_OCR_REGION", null),
    reader.findByKey("TENCENT_OCR_ENDPOINT", null),
    reader.findByKey("TENCENT_OCR_REQUEST_TIMEOUT_MS", null),
    reader.findByKey("TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM", null),
  ]);
  const timeoutValue = Number(readPlatformValue(timeoutRecord, false, "10000"));
  return {
    secretId: readPlatformValue(secretIdRecord, true, "", decryptSecret),
    secretKey: readPlatformValue(secretKeyRecord, true, "", decryptSecret),
    region: readPlatformValue(regionRecord, false, "ap-guangzhou"),
    endpoint: readPlatformValue(endpointRecord, false, OFFICIAL_OCR_ENDPOINT),
    encryptionPublicKeyPem: readPlatformValue(encryptionPublicKeyRecord, true, "", decryptSecret),
    requestTimeoutMs: Number.isFinite(timeoutValue) ? timeoutValue : 10_000,
  };
}

function readPlatformValue(
  record: ReadinessPlatformSettingRecord | null,
  mustBeSecret: boolean,
  fallback = "",
  decryptSecret: (value: string) => string = (value) => value,
) {
  if (!record || record.status !== "active" || mustBeSecret !== record.is_secret) return fallback;
  const storedValue = record.value_text?.trim() ?? "";
  if (!storedValue) return fallback;
  return mustBeSecret ? decryptSecret(storedValue) : storedValue;
}

function loadEnvironmentSettings(environment: ReadinessEnvironment) {
  const requestTimeoutMs = Number(environment.TENCENT_OCR_REQUEST_TIMEOUT_MS ?? 10_000);
  return {
    secretId: environment.TENCENT_OCR_SECRET_ID ?? "",
    secretKey: environment.TENCENT_OCR_SECRET_KEY ?? "",
    region: environment.TENCENT_OCR_REGION ?? "ap-guangzhou",
    endpoint: environment.TENCENT_OCR_ENDPOINT ?? OFFICIAL_OCR_ENDPOINT,
    encryptionPublicKeyPem: environment.TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM ?? "",
    requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : 10_000,
  };
}

function readCredentialSource(args: string[]): ReadinessCredentialSource {
  const sourceArgument = args.find((value) => value.startsWith("--source="));
  const source = sourceArgument?.slice("--source=".length) || "platform_settings";
  if (source === "platform_settings" || source === "environment") return source;
  throw Errors.badRequest("OCR预检配置来源无效");
}

async function main() {
  const context = await createTencentOcrCamReadinessContext({
    source: readCredentialSource(process.argv.slice(2)),
  });
  const result = await runTencentOcrCamReadiness({
    client: context.client,
    credentialSource: context.credentialSource,
    encryptedIdRequest: context.encryptedIdRequest,
    endpoint: context.endpoint,
  });
  if (!result.ready) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "腾讯云OCR CAM预检失败";
    console.error(message);
    process.exit(1);
  });
}
