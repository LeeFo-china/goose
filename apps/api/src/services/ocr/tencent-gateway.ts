import {
  constants,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  randomBytes,
} from "node:crypto";

import type { ClientConfig } from "tencentcloud-sdk-nodejs-common";
import { ocr } from "tencentcloud-sdk-nodejs-ocr";
import type {
  BankCardOCRRequest,
  BankCardOCRResponse,
  BizLicenseOCRRequest,
  BizLicenseOCRResponse,
  RecognizeEncryptedIDCardOCRRequest,
  RecognizeEncryptedIDCardOCRResponse,
} from "tencentcloud-sdk-nodejs-ocr/tencentcloud/services/ocr/v20181119/ocr_models";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";
import type { OcrProviderAction } from "./capabilities";

const TencentOcrClient = ocr.v20181119.Client;

export type TencentOcrClientPort = {
  BizLicenseOCR(request: BizLicenseOCRRequest): Promise<BizLicenseOCRResponse>;
  BankCardOCR(request: BankCardOCRRequest): Promise<BankCardOCRResponse>;
  RecognizeEncryptedIDCardOCR(
    request: RecognizeEncryptedIDCardOCRRequest,
  ): Promise<RecognizeEncryptedIDCardOCRResponse>;
};

export type TencentOcrSettingsPort = {
  getString(key: string, fallbackValue?: string): Promise<string>;
  getSecretString(key: string, fallbackValue?: string): Promise<string>;
  getNumber(key: string, fallbackValue: number): Promise<number>;
  getBoolean(key: string, fallbackValue: boolean): Promise<boolean>;
};

export type TencentOcrGatewayInput = {
  providerAction: OcrProviderAction;
  imageUrl?: string;
  imageBase64?: string;
  cardSide?: "FRONT" | "BACK";
};

export type TencentOcrGatewayResult =
  | BizLicenseOCRResponse
  | BankCardOCRResponse
  | RecognizeEncryptedIDCardOCRResponse;

type GatewayDependencies = {
  settings?: TencentOcrSettingsPort;
  clientFactory?: (config: ClientConfig) => TencentOcrClientPort;
  encryptKey?: (publicKeyPem: string, aesKey: Buffer) => Buffer;
};

type LoadedConfig = {
  client: TencentOcrClientPort;
  encryptedIdEnabled: boolean;
  encryptionPublicKeyPem: string;
  encryptionAlgorithm: string;
};

type SafeProviderError = {
  code?: string;
  requestId?: string;
  request_id?: string;
};

export class TencentOcrGateway {
  private readonly settings: TencentOcrSettingsPort;
  private readonly clientFactory: (config: ClientConfig) => TencentOcrClientPort;
  private readonly encryptKey: (publicKeyPem: string, aesKey: Buffer) => Buffer;

  constructor(dependencies: GatewayDependencies = {}) {
    this.settings = dependencies.settings ?? systemSettingsService;
    this.clientFactory = dependencies.clientFactory ?? ((config) => new TencentOcrClient(config));
    this.encryptKey = dependencies.encryptKey ?? encryptAesKey;
  }

  async recognize(input: TencentOcrGatewayInput): Promise<TencentOcrGatewayResult> {
    const config = await this.loadConfig();
    try {
      if (input.providerAction === "BizLicenseOCR") {
        return await config.client.BizLicenseOCR({
          ...imageInput(input),
          EnableCopyWarn: true,
          EnablePeriodComplete: true,
        });
      }
      if (input.providerAction === "BankCardOCR") {
        return await config.client.BankCardOCR({
          ...imageInput(input),
          RetBorderCutImage: false,
          RetCardNoImage: false,
          EnableCopyCheck: true,
          EnableReshootCheck: true,
          EnableBorderCheck: true,
          EnableQualityValue: true,
        });
      }
      return await this.recognizeEncryptedId(config, input);
    } catch (error) {
      if (isOcrAppError(error)) throw error;
      throw normalizeProviderError(error);
    }
  }

  private async loadConfig(): Promise<LoadedConfig> {
    const [
      enabled,
      secretId,
      secretKey,
      region,
      endpoint,
      requestTimeoutMs,
      encryptedIdEnabled,
      encryptionPublicKeyPem,
      encryptionAlgorithm,
    ] = await Promise.all([
      this.settings.getBoolean("TENCENT_OCR_ENABLED", false),
      this.settings.getSecretString("TENCENT_OCR_SECRET_ID"),
      this.settings.getSecretString("TENCENT_OCR_SECRET_KEY"),
      this.settings.getString("TENCENT_OCR_REGION", "ap-guangzhou"),
      this.settings.getString("TENCENT_OCR_ENDPOINT", "ocr.tencentcloudapi.com"),
      this.settings.getNumber("TENCENT_OCR_REQUEST_TIMEOUT_MS", 10_000),
      this.settings.getBoolean("TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED", false),
      this.settings.getSecretString("TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM"),
      this.settings.getString("TENCENT_OCR_ENCRYPTION_ALGORITHM", "AES-256-CBC"),
    ]);

    if (!enabled) {
      throw Errors.business(503, "腾讯云OCR尚未启用", ErrorCodes.OCR_DISABLED);
    }
    if (!secretId.trim() || !secretKey.trim()) {
      throw Errors.business(503, "腾讯云OCR密钥未配置", ErrorCodes.OCR_CONFIG_MISSING);
    }

    const client = this.clientFactory({
      credential: { secretId: secretId.trim(), secretKey: secretKey.trim() },
      region: region.trim() || "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: endpoint.trim() || "ocr.tencentcloudapi.com",
          protocol: "https://",
          reqMethod: "POST",
          reqTimeout: Math.max(1, Math.ceil(requestTimeoutMs / 1_000)),
        },
      },
    });

    return {
      client,
      encryptedIdEnabled,
      encryptionPublicKeyPem,
      encryptionAlgorithm,
    };
  }

  private async recognizeEncryptedId(
    config: LoadedConfig,
    input: TencentOcrGatewayInput,
  ) {
    if (
      !config.encryptedIdEnabled ||
      !config.encryptionPublicKeyPem.trim() ||
      config.encryptionAlgorithm !== "AES-256-CBC"
    ) {
      throw Errors.business(
        503,
        "加密身份证识别能力尚未配置",
        ErrorCodes.OCR_CAPABILITY_UNAVAILABLE,
      );
    }
    if (!input.cardSide) {
      throw Errors.business(400, "身份证正反面参数缺失", ErrorCodes.OCR_RESULT_INVALID);
    }

    const aesKey = randomBytes(32);
    const iv = randomBytes(16);
    const innerRequest = {
      ...imageInput(input),
      CardSide: input.cardSide,
      Config: JSON.stringify({
        CopyWarn: true,
        BorderCheckWarn: true,
        ReshootWarn: true,
        DetectPsWarn: true,
        InvalidDateWarn: true,
        Quality: true,
        ReflectWarn: true,
      }),
      EnableRecognitionRectify: true,
      EnableReflectDetail: false,
      CardWarnType: "Basic",
    };
    const request: RecognizeEncryptedIDCardOCRRequest = {
      EncryptedBody: encryptAesBody(innerRequest, aesKey, iv),
      Encryption: {
        CiphertextBlob: this.encryptKey(
          config.encryptionPublicKeyPem,
          aesKey,
        ).toString("base64"),
        Iv: iv.toString("base64"),
        Algorithm: "AES-256-CBC",
        EncryptList: ["EncryptedBody"],
        TagList: [],
      },
    };
    const response = await config.client.RecognizeEncryptedIDCardOCR(request);
    if (!response.EncryptedBody) {
      throw Errors.business(502, "身份证加密识别结果无效", ErrorCodes.OCR_RESULT_INVALID);
    }
    const decrypted = decryptAesBody(response.EncryptedBody, aesKey, iv);
    return { ...decrypted, RequestId: response.RequestId };
  }
}

function imageInput(input: TencentOcrGatewayInput) {
  if (input.imageUrl?.trim()) return { ImageUrl: input.imageUrl.trim() };
  if (input.imageBase64?.trim()) return { ImageBase64: input.imageBase64.trim() };
  throw Errors.business(400, "OCR图片输入缺失", ErrorCodes.OCR_FILE_NOT_FOUND);
}

function encryptAesBody(value: unknown, key: Buffer, iv: Buffer) {
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]).toString("base64");
}

function encryptAesKey(publicKeyPem: string, aesKey: Buffer) {
  return publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_PADDING,
    },
    aesKey,
  );
}

function decryptAesBody(value: string, key: Buffer, iv: Buffer) {
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError();
    return parsed as RecognizeEncryptedIDCardOCRResponse;
  } catch {
    throw Errors.business(502, "身份证加密识别结果无效", ErrorCodes.OCR_RESULT_INVALID);
  }
}

function normalizeProviderError(error: unknown) {
  const safe = error && typeof error === "object" ? error as SafeProviderError : {};
  const providerCode = typeof safe.code === "string" ? safe.code : "UnknownProviderError";
  const requestId = typeof safe.requestId === "string"
    ? safe.requestId
    : typeof safe.request_id === "string" ? safe.request_id : null;
  const details = { providerCode, requestId };
  if (/RequestLimit|LimitExceeded|Throttl/i.test(providerCode)) {
    return Errors.business(429, "腾讯云OCR请求频率受限", ErrorCodes.OCR_PROVIDER_RATE_LIMITED, details);
  }
  if (/AuthFailure|InvalidCredential|Unauthorized|SecretId/i.test(providerCode)) {
    return Errors.business(503, "腾讯云OCR配置无效", ErrorCodes.OCR_CONFIG_MISSING, details);
  }
  return Errors.business(502, "腾讯云OCR调用失败", ErrorCodes.OCR_PROVIDER_FAILED, details);
}

function isOcrAppError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("OCR_"),
  );
}

export const tencentOcrGateway = new TencentOcrGateway();
