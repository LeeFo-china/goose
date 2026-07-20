import {
  createDecipheriv,
  X509Certificate,
} from "node:crypto";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { readVerifiedWechatPayJson } from "@/services/wechat-pay-api-response";
import { stringField } from "@/services/wechat-pay-gateway-response";
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

const CERTIFICATES_URL_PATH = "/v3/certificates";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const AUTH_TAG_LENGTH = 16;

type FetchImpl = typeof fetch;

export type WechatPayProfileProbeInput = {
  merchantId: string;
  serialNo: string;
  privateKeyPem: string;
  apiV3Key: string;
  wechatPayPublicKeyId: string;
  wechatPayPublicKeyPem: string;
  baseUrl: string;
};

export type WechatPayProfileProbeResult = {
  ok: true;
  probe_mode: "platform_certificate" | "wechat_pay_public_key";
  api_v3_key_probe: "decrypted" | "format_only";
  request_id: string | null;
};

type WechatPayProfileValidationGatewayDependencies = {
  fetchImpl?: FetchImpl;
  nonceFactory?: () => string;
  timestampFactory?: () => string;
  nowSecondsFactory?: () => number;
  requestTimeoutMs?: number;
};

export class WechatPayProfileValidationGateway {
  private readonly fetchImpl: FetchImpl;
  private readonly nonceFactory?: () => string;
  private readonly timestampFactory?: () => string;
  private readonly nowSecondsFactory: () => number;
  private readonly requestTimeoutMs: number;

  constructor(
    dependencies: WechatPayProfileValidationGatewayDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
    this.nowSecondsFactory = dependencies.nowSecondsFactory ??
      (() => Math.floor(Date.now() / 1_000));
    this.requestTimeoutMs = normalizeTimeout(dependencies.requestTimeoutMs);
  }

  async probe(
    input: WechatPayProfileProbeInput,
  ): Promise<WechatPayProfileProbeResult> {
    const authorization = this.buildAuthorization(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let requestId: string | null = null;

    try {
      const response = await this.fetchImpl(
        `${input.baseUrl.replace(/\/+$/, "")}${CERTIFICATES_URL_PATH}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: authorization,
            "Wechatpay-Serial": input.wechatPayPublicKeyId,
          },
          signal: controller.signal,
        },
      );
      requestId = response.headers.get("request-id")?.trim() || null;
      const verified = await readVerifiedWechatPayJson({
        response,
        publicKeyId: input.wechatPayPublicKeyId,
        publicKeyPem: input.wechatPayPublicKeyPem,
        nowSeconds: this.nowSecondsFactory(),
      });

      if (
        response.status === 404 &&
        stringField(verified.payload, "code") === "RESOURCE_NOT_EXISTS"
      ) {
        return {
          ok: true,
          probe_mode: "wechat_pay_public_key",
          api_v3_key_probe: "format_only",
          request_id: verified.requestId,
        };
      }
      if (!response.ok) {
        throw Errors.business(
          502,
          "微信支付拒绝了配置验证请求",
          "WECHAT_PAY_PROFILE_PROBE_REJECTED",
          { requestId },
        );
      }

      decryptOnePlatformCertificate(verified.payload, input.apiV3Key);
      return {
        ok: true,
        probe_mode: "platform_certificate",
        api_v3_key_probe: "decrypted",
        request_id: verified.requestId,
      };
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw Errors.business(
          504,
          "微信支付配置验证请求超时",
          "WECHAT_PAY_PROFILE_PROBE_TIMEOUT",
          { requestId },
        );
      }
      if (error instanceof AppError) {
        throw Errors.business(error.statusCode, error.message, error.code, {
          ...safeDetails(error.details),
          requestId,
        });
      }
      throw Errors.business(
        502,
        "微信支付配置验证请求失败",
        "WECHAT_PAY_PROFILE_PROBE_TRANSPORT_FAILED",
        { requestId },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAuthorization(input: WechatPayProfileProbeInput) {
    try {
      return buildWechatPayAuthorization({
        method: "GET",
        urlPath: CERTIFICATES_URL_PATH,
        body: "",
        merchantId: input.merchantId,
        serialNo: input.serialNo,
        privateKeyPem: input.privateKeyPem,
        nonce: this.nonceFactory?.(),
        timestamp: this.timestampFactory?.(),
      });
    } catch {
      throw Errors.business(
        409,
        "微信支付商户私钥格式不正确",
        "WECHAT_PAY_PRIVATE_KEY_INVALID",
      );
    }
  }
}

function decryptOnePlatformCertificate(
  payload: Record<string, unknown>,
  apiV3Key: string,
) {
  const data = payload.data;
  if (!Array.isArray(data) || data.length === 0) {
    throwInvalidCertificateResponse();
  }

  for (const item of data) {
    const plaintext = tryDecryptCertificate(item, apiV3Key);
    if (plaintext && isPemCertificate(plaintext)) return;
  }
  throw Errors.business(
    502,
    "微信支付平台证书解密失败",
    "WECHAT_PAY_PLATFORM_CERTIFICATE_DECRYPT_FAILED",
  );
}

function tryDecryptCertificate(item: unknown, apiV3Key: string) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const encrypted = (item as Record<string, unknown>).encrypt_certificate;
  if (!encrypted || typeof encrypted !== "object" || Array.isArray(encrypted)) {
    return null;
  }
  const record = encrypted as Record<string, unknown>;
  if (stringField(record, "algorithm") !== "AEAD_AES_256_GCM") return null;
  const nonce = stringField(record, "nonce");
  const ciphertextValue = stringField(record, "ciphertext");
  if (!nonce || !ciphertextValue) return null;

  try {
    const ciphertext = Buffer.from(ciphertextValue, "base64");
    if (ciphertext.length <= AUTH_TAG_LENGTH) return null;
    const encryptedBody = ciphertext.subarray(0, -AUTH_TAG_LENGTH);
    const authTag = ciphertext.subarray(-AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key),
      Buffer.from(nonce),
    );
    const associatedData = stringField(record, "associated_data");
    if (associatedData) decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(encryptedBody),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function isPemCertificate(value: string) {
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("-----BEGIN CERTIFICATE-----") ||
    !trimmed.endsWith("-----END CERTIFICATE-----")
  ) {
    return false;
  }
  try {
    new X509Certificate(trimmed);
    return true;
  } catch {
    return false;
  }
}

function throwInvalidCertificateResponse(): never {
  throw Errors.business(
    502,
    "微信支付平台证书响应格式不正确",
    "WECHAT_PAY_PLATFORM_CERTIFICATE_RESPONSE_INVALID",
  );
}

function normalizeTimeout(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.floor(value as number)
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

function safeDetails(details: unknown) {
  return details && typeof details === "object" && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export const wechatPayProfileValidationGateway =
  new WechatPayProfileValidationGateway();
