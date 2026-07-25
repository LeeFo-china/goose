import { randomUUID } from "node:crypto";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { readVerifiedWechatPayJson } from "@/services/wechat-pay-api-response";
import {
  buildWechatPayApplymentMediaMultipart,
  type WechatPayApplymentMediaContentType,
  type WechatPayApplymentSubmitRequest,
} from "@/services/wechat-pay-applyment-request-builder";
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

const MEDIA_URL_PATH = "/v3/merchant/media/upload";
const SUBMIT_URL_PATH = "/v3/applyment4sub/applyment/";
const QUERY_URL_PATH_PREFIX =
  "/v3/applyment4sub/applyment/business_code/";
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type FetchImpl = typeof fetch;
type ApplymentOperation = "upload_media" | "submit" | "query";

export type WechatPayApplymentGatewayProfile = {
  merchantId: string;
  serialNo: string;
  privateKeyPem: string;
  wechatPayPublicKeyId: string;
  wechatPayPublicKeyPem: string;
  baseUrl: string;
};

export type WechatPayApplymentAuditDetail = {
  field: string;
  fieldName: string;
  rejectReason: string;
};

export type WechatPayApplymentState =
  | "APPLYMENT_STATE_EDITTING"
  | "APPLYMENT_STATE_AUDITING"
  | "APPLYMENT_STATE_REJECTED"
  | "APPLYMENT_STATE_TO_BE_CONFIRMED"
  | "APPLYMENT_STATE_TO_BE_SIGNED"
  | "APPLYMENT_STATE_SIGNING"
  | "APPLYMENT_STATE_FINISHED"
  | "APPLYMENT_STATE_CANCELED";

export type WechatPayApplymentQueryResult = {
  businessCode: string;
  applymentId: string;
  subMchid: string | null;
  signUrl: string | null;
  applymentState: WechatPayApplymentState;
  applymentStateMessage: string;
  auditDetail: WechatPayApplymentAuditDetail[];
  requestId: string | null;
};

export type UploadApplymentMediaInput = {
  profile: WechatPayApplymentGatewayProfile;
  filename: string;
  contentType: WechatPayApplymentMediaContentType;
  sha256: string;
  file: Uint8Array;
};

export type SubmitWechatPayApplymentGatewayInput = {
  profile: WechatPayApplymentGatewayProfile;
  request: WechatPayApplymentSubmitRequest;
};

export type QueryWechatPayApplymentInput = {
  profile: WechatPayApplymentGatewayProfile;
  businessCode: string;
};

export interface WechatPayApplymentGatewayPort {
  uploadMedia(input: UploadApplymentMediaInput): Promise<{
    mediaId: string;
    requestId: string | null;
  }>;
  submit(input: SubmitWechatPayApplymentGatewayInput): Promise<{
    applymentId: string;
    requestId: string | null;
  }>;
  queryByBusinessCode(
    input: QueryWechatPayApplymentInput,
  ): Promise<WechatPayApplymentQueryResult>;
}

type WechatPayApplymentGatewayDependencies = {
  fetchImpl?: FetchImpl;
  nonceFactory?: () => string;
  timestampFactory?: () => string;
  nowSecondsFactory?: () => number;
  boundaryFactory?: () => string;
  requestTimeoutMs?: number;
};

export class WechatPayApplymentGateway
  implements WechatPayApplymentGatewayPort {
  private readonly fetchImpl: FetchImpl;
  private readonly nonceFactory?: () => string;
  private readonly timestampFactory?: () => string;
  private readonly nowSecondsFactory: () => number;
  private readonly boundaryFactory: () => string;
  private readonly requestTimeoutMs: number;

  constructor(dependencies: WechatPayApplymentGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
    this.nowSecondsFactory = dependencies.nowSecondsFactory ??
      (() => Math.floor(Date.now() / 1_000));
    this.boundaryFactory = dependencies.boundaryFactory ??
      (() => `gooes-${randomUUID().replaceAll("-", "")}`);
    this.requestTimeoutMs = normalizeTimeout(dependencies.requestTimeoutMs);
  }

  async uploadMedia(input: UploadApplymentMediaInput): Promise<{
    mediaId: string;
    requestId: string | null;
  }> {
    const multipart = buildWechatPayApplymentMediaMultipart({
      boundary: this.boundaryFactory(),
      filename: input.filename,
      contentType: input.contentType,
      sha256: input.sha256,
      file: input.file,
    });
    const verified = await this.execute({
      operation: "upload_media",
      profile: input.profile,
      method: "POST",
      urlPath: MEDIA_URL_PATH,
      signingBody: multipart.metaJson,
      requestBody: multipart.body,
      contentType: multipart.contentType,
      includePublicKeyId: false,
    });
    const mediaId = requiredString(verified.payload, "media_id");
    if (!mediaId) throwInvalidResponse("upload_media", verified.requestId);
    return { mediaId, requestId: verified.requestId };
  }

  async submit(input: SubmitWechatPayApplymentGatewayInput): Promise<{
    applymentId: string;
    requestId: string | null;
  }> {
    const body = JSON.stringify(input.request);
    const verified = await this.execute({
      operation: "submit",
      profile: input.profile,
      method: "POST",
      urlPath: SUBMIT_URL_PATH,
      signingBody: body,
      requestBody: body,
      contentType: "application/json",
      includePublicKeyId: true,
    });
    const applymentId = parseApplymentId(verified.payload.applyment_id);
    if (!applymentId) throwInvalidResponse("submit", verified.requestId);
    return { applymentId, requestId: verified.requestId };
  }

  async queryByBusinessCode(
    input: QueryWechatPayApplymentInput,
  ): Promise<WechatPayApplymentQueryResult> {
    const urlPath = `${QUERY_URL_PATH_PREFIX}${encodeURIComponent(input.businessCode)}`;
    const verified = await this.execute({
      operation: "query",
      profile: input.profile,
      method: "GET",
      urlPath,
      signingBody: "",
      requestBody: undefined,
      contentType: undefined,
      includePublicKeyId: false,
    });
    return parseQueryResult(
      verified.payload,
      input.businessCode,
      verified.requestId,
    );
  }

  private async execute(input: {
    operation: ApplymentOperation;
    profile: WechatPayApplymentGatewayProfile;
    method: "GET" | "POST";
    urlPath: string;
    signingBody: string;
    requestBody: RequestInit["body"];
    contentType: string | undefined;
    includePublicKeyId: boolean;
  }) {
    const authorization = this.buildAuthorization(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let requestId: string | null = null;

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: authorization,
      };
      if (input.contentType) headers["Content-Type"] = input.contentType;
      if (input.includePublicKeyId) {
        headers["Wechatpay-Serial"] = input.profile.wechatPayPublicKeyId;
      }
      const response = await this.fetchImpl(
        `${normalizeBaseUrl(input.profile.baseUrl)}${input.urlPath}`,
        {
          method: input.method,
          headers,
          body: input.requestBody,
          signal: controller.signal,
          redirect: "error",
        },
      );
      requestId = response.headers.get("request-id")?.trim() || null;
      const verified = await readVerifiedWechatPayJson({
        response,
        publicKeyId: input.profile.wechatPayPublicKeyId,
        publicKeyPem: input.profile.wechatPayPublicKeyPem,
        nowSeconds: this.nowSecondsFactory(),
      });
      requestId = verified.requestId;
      if (!response.ok) {
        throwUpstreamError({
          operation: input.operation,
          requestId,
          status: response.status,
          payload: verified.payload,
        });
      }
      return verified;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw Errors.business(
          504,
          "微信支付进件请求超时",
          "WECHAT_PAY_APPLYMENT_TIMEOUT",
          {
            operation: input.operation,
            requestId,
            timeoutMs: this.requestTimeoutMs,
          },
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
        "微信支付进件请求失败",
        "WECHAT_PAY_APPLYMENT_TRANSPORT_FAILED",
        { operation: input.operation, requestId },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAuthorization(input: {
    profile: WechatPayApplymentGatewayProfile;
    method: "GET" | "POST";
    urlPath: string;
    signingBody: string;
  }): string {
    try {
      return buildWechatPayAuthorization({
        method: input.method,
        urlPath: input.urlPath,
        body: input.signingBody,
        merchantId: input.profile.merchantId,
        serialNo: input.profile.serialNo,
        privateKeyPem: input.profile.privateKeyPem,
        nonce: this.nonceFactory?.(),
        timestamp: this.timestampFactory?.(),
      });
    } catch {
      throw Errors.business(
        409,
        "微信支付服务商私钥格式不正确",
        "WECHAT_PAY_APPLYMENT_PRIVATE_KEY_INVALID",
      );
    }
  }
}

function parseQueryResult(
  payload: Record<string, unknown>,
  expectedBusinessCode: string,
  requestId: string | null,
): WechatPayApplymentQueryResult {
  const businessCode = requiredString(payload, "business_code");
  const applymentId = parseApplymentId(payload.applyment_id);
  const state = parseApplymentState(payload.applyment_state);
  const stateMessage = requiredString(payload, "applyment_state_msg");
  const auditDetail = parseAuditDetail(payload.audit_detail);
  if (
    businessCode !== expectedBusinessCode ||
    !applymentId ||
    !state ||
    !stateMessage ||
    !auditDetail
  ) {
    throwInvalidResponse("query", requestId);
  }
  return {
    businessCode,
    applymentId,
    subMchid: optionalString(payload, "sub_mchid"),
    signUrl: optionalString(payload, "sign_url"),
    applymentState: state,
    applymentStateMessage: stateMessage,
    auditDetail,
    requestId,
  };
}

const APPLYMENT_STATES = new Set<WechatPayApplymentState>([
  "APPLYMENT_STATE_EDITTING",
  "APPLYMENT_STATE_AUDITING",
  "APPLYMENT_STATE_REJECTED",
  "APPLYMENT_STATE_TO_BE_CONFIRMED",
  "APPLYMENT_STATE_TO_BE_SIGNED",
  "APPLYMENT_STATE_SIGNING",
  "APPLYMENT_STATE_FINISHED",
  "APPLYMENT_STATE_CANCELED",
]);

function parseApplymentState(value: unknown): WechatPayApplymentState | null {
  return typeof value === "string" &&
      APPLYMENT_STATES.has(value as WechatPayApplymentState)
    ? value as WechatPayApplymentState
    : null;
}

function parseApplymentId(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === "string" && /^\d+$/.test(value) ? value : null;
}

function parseAuditDetail(value: unknown): WechatPayApplymentAuditDetail[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const result: WechatPayApplymentAuditDetail[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const field = requiredString(record, "field");
    const fieldName = requiredString(record, "field_name");
    const rejectReason = requiredString(record, "reject_reason");
    if (!field || !fieldName || !rejectReason) return null;
    result.push({ field, fieldName, rejectReason });
  }
  return result;
}

function throwUpstreamError(input: {
  operation: ApplymentOperation;
  requestId: string | null;
  status: number;
  payload: Record<string, unknown>;
}): never {
  const details = {
    operation: input.operation,
    requestId: input.requestId,
    status: input.status,
    wechatCode: safeWechatCode(input.payload.code),
    wechatMessage: safeWechatMessage(input.payload.message),
  };
  if (input.status === 429 || input.status >= 500) {
    throw Errors.business(
      503,
      "微信支付进件服务暂时不可用",
      "WECHAT_PAY_APPLYMENT_UPSTREAM_UNAVAILABLE",
      details,
    );
  }
  throw Errors.business(
    502,
    "微信支付拒绝了进件请求",
    "WECHAT_PAY_APPLYMENT_REQUEST_REJECTED",
    details,
  );
}

function throwInvalidResponse(
  operation: ApplymentOperation,
  requestId: string | null,
): never {
  throw Errors.business(
    502,
    "微信支付进件应答格式不正确",
    "WECHAT_PAY_APPLYMENT_RESPONSE_INVALID",
    { operation, requestId },
  );
}

function requiredString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return value == null ? null : requiredString(record, key);
}

function safeWechatCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? value
    : null;
}

function safeWechatMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 300 ||
    /[\u0000-\u001F\u007F]/.test(normalized) ||
    /\d{11,}/.test(normalized)
  ) return null;
  return normalized;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
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

export const wechatPayApplymentGateway = new WechatPayApplymentGateway();
