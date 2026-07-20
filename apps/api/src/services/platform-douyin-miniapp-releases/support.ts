import { z } from "zod";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type {
  DouyinMiniappReleaseAuditResult,
  DouyinMiniappReleaseStatus,
} from "@/repositories/douyin-miniapp-releases";

const SENSITIVE_METADATA = /token|secret|phone|openid/i;
const SAFE_ERROR_CODE = /^[A-Z0-9_:-]{1,128}$/;
const SAFE_LOG_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const ListQuerySchema = z.strictObject({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
});
export const UploadInputSchema = z.strictObject({
  template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  template_version: z.string().max(64).regex(SEMVER_PATTERN),
  description: z.string().trim().min(1).max(200),
  channel: z.enum(["default", "1"]),
});
export const AuditInputSchema = z.strictObject({
  host_names: z.array(
    z.string().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/)
      .refine((value) => !SENSITIVE_METADATA.test(value)),
  ).min(1).max(20).refine((values) => new Set(values).size === values.length),
  audit_note: z.string().trim().min(1).max(1000)
    .refine((value) => !SENSITIVE_METADATA.test(value)),
});

export type PlatformDouyinMiniappReleaseListQuery = z.input<typeof ListQuerySchema>;
export type PlatformDouyinMiniappReleaseUploadInput = z.input<typeof UploadInputSchema>;
export type PlatformDouyinMiniappReleaseAuditInput = z.input<typeof AuditInputSchema>;

export function parseRequest<Output>(schema: z.ZodType<Output>, input: unknown): Output {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw Errors.fromZod(parsed.error);
  return parsed.data;
}

export function hasDevelopmentPermission(snapshot: unknown): boolean {
  return Array.isArray(snapshot) && snapshot.some((entry) =>
    typeof entry === "object" && entry !== null && "id" in entry && entry.id === 1);
}

export function exactAuditStage(
  audit: { readonly version: string; readonly status?: string | number; readonly reason?: string }
    | undefined,
  version: string,
) {
  if (!audit || audit.version !== version) throw auditVersionMismatch();
  return audit;
}

export function mapAuditStatus(status: string | number | undefined): {
  readonly releaseStatus: DouyinMiniappReleaseStatus;
  readonly auditStatus: NonNullable<DouyinMiniappReleaseAuditResult["status"]>;
} {
  const mapping = {
    0: ["audit_pending", "pending"],
    1: ["audit_approved", "approved"],
    2: ["audit_rejected", "rejected"],
    3: ["failed", "failed"],
  } as const;
  const mapped = typeof status === "number" ? mapping[status as keyof typeof mapping] : undefined;
  if (!mapped) throw publishStateConflict();
  return { releaseStatus: mapped[0], auditStatus: mapped[1] };
}

export function safeAuditResult(
  status: NonNullable<DouyinMiniappReleaseAuditResult["status"]>,
  reason: string | undefined,
): DouyinMiniappReleaseAuditResult {
  const safeReason = reason?.trim();
  return {
    status,
    ...(safeReason && safeReason.length <= 1000 && !SENSITIVE_METADATA.test(safeReason)
      ? { reason: safeReason }
      : {}),
  };
}

export function safeProviderFailure(error: unknown): {
  readonly statusCode: number;
  readonly code: string;
  readonly logId?: string;
} {
  const statusCode = error instanceof AppError
    && Number.isInteger(error.statusCode)
    && error.statusCode >= 400
    && error.statusCode <= 599
    ? error.statusCode
    : 502;
  const code = error instanceof AppError && SAFE_ERROR_CODE.test(error.code)
    ? error.code
    : "DOUYIN_OPEN_PLATFORM_REQUEST_FAILED";
  const details = error instanceof AppError && typeof error.details === "object"
    && error.details !== null && "log_id" in error.details
    ? error.details.log_id
    : undefined;
  const logId = typeof details === "string"
    && SAFE_LOG_ID.test(details)
    && !SENSITIVE_METADATA.test(details)
    ? details
    : undefined;
  return { statusCode, code, ...(logId ? { logId } : {}) };
}

export function sanitizedProviderError(error: unknown): AppError {
  const safe = safeProviderFailure(error);
  return Errors.business(
    safe.statusCode,
    "抖音开放平台请求失败",
    safe.code,
    safe.logId ? { log_id: safe.logId } : undefined,
  );
}

export function requestError(message: string, code: string): AppError {
  return Errors.business(400, message, code);
}

export function installationNotFound(): AppError {
  return Errors.business(404, "抖音小程序安装不存在", "DOUYIN_INSTALLATION_NOT_FOUND");
}

export function releaseNotFound(): AppError {
  return Errors.business(404, "抖音小程序发布记录不存在", "DOUYIN_RELEASE_NOT_FOUND");
}

export function installationStateConflict(): AppError {
  return Errors.business(409, "抖音小程序安装当前状态不可发布", "DOUYIN_INSTALLATION_STATE_CONFLICT");
}

export function releaseStateConflict(): AppError {
  return Errors.business(409, "抖音小程序发布记录状态不允许此操作", "DOUYIN_RELEASE_STATE_CONFLICT");
}

export function publishStateConflict(): AppError {
  return Errors.business(409, "抖音小程序版本尚未审核通过", "DOUYIN_RELEASE_NOT_APPROVED");
}

export function repositoryResponseError(): AppError {
  return Errors.business(500, "抖音小程序发布数据格式无效", "DOUYIN_RELEASE_RESPONSE_INVALID");
}

function auditVersionMismatch(): AppError {
  return Errors.business(
    409,
    "抖音审核版本与发布记录不一致",
    "DOUYIN_AUDIT_VERSION_MISMATCH",
  );
}
