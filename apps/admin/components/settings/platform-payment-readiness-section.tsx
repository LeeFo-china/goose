"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { formatDateTime } from "@/components/settings/platform-payment-settings-shared";
import type {
  PlatformWechatPayProfileValidationResult,
  PlatformWechatPayProfileView,
  PlatformWechatPayReadinessProfile,
} from "@/components/settings/platform-payment-settings-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";

type ValidationFeedback = {
  tone: "error" | "success";
  message: string;
  code?: string;
  requestId?: string | null;
};

type BackendRequestError = Error & {
  code?: unknown;
  requestId?: unknown;
};

const VALIDATION_REQUEST_ERROR_MESSAGE =
  "微信支付配置验证请求失败，请稍后重试。";
const STABLE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,99}$/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SAFE_ERROR_MESSAGE_LENGTH = 200;

export function PaymentProfileReadinessSection({
  profile,
  readiness,
  readonly,
  loading,
  refreshReadiness,
}: {
  profile: PlatformWechatPayProfileView;
  readiness: PlatformWechatPayReadinessProfile | null;
  readonly: boolean;
  loading: boolean;
  refreshReadiness: () => Promise<void>;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<ValidationFeedback | null>(null);
  const [pending, startTransition] = useTransition();
  const config = profile.config;
  const lastValidatedAt = readiness?.last_validated_at ??
    config?.last_validated_at;
  const hasValidationEvidence = Boolean(
    config?.last_validation_error_message ||
      config?.last_validation_error_code ||
      config?.last_validation_request_id,
  );

  function validateProfile() {
    if (readonly || !profile.configured) return;

    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await requestBackendJson<
          PlatformWechatPayProfileValidationResult
        >(
          `/platform/payment/wechat-pay/profiles/${profile.profile_code}/validate`,
          {
            method: "POST",
            fallbackMessage: VALIDATION_REQUEST_ERROR_MESSAGE,
          },
        );
        setFeedback(result.validation.ok
          ? {
            tone: "success",
            message: "微信支付配置验证通过。",
            requestId: result.validation.request_id,
          }
          : {
            tone: "error",
            message: result.validation.message,
            code: result.validation.error_code,
            requestId: result.validation.request_id,
          });
        router.refresh();
        await refreshReadiness();
      } catch (validationError) {
        setFeedback(toSafeValidationRequestFeedback(validationError));
      }
    });
  }

  const readinessLabel = loading && !readiness
    ? "检查中"
    : readiness?.ready
    ? "已就绪"
    : readiness
    ? "未就绪"
    : "状态未知";

  return (
    <section
      aria-label={`${profile.label}上线就绪状态`}
      className="border-b bg-muted/20 px-4 py-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">上线就绪</h3>
            <Badge
              variant={readiness?.ready
                ? "success"
                : readiness
                ? "danger"
                : "secondary"}
            >
              {readinessLabel}
            </Badge>
            <span className="text-xs text-muted-foreground">
              最近验证：{lastValidatedAt
                ? formatDateTime(lastValidatedAt)
                : "暂无"}
            </span>
          </div>

          {readiness?.blockers.length ? (
            <ul className="mt-2 grid gap-1.5" aria-label="上线阻塞项">
              {readiness.blockers.map((blocker) => (
                <li
                  key={blocker.code}
                  className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2"
                >
                  <span>{blocker.message}</span>
                  <code className="break-all text-xs text-muted-foreground">
                    {blocker.code}
                  </code>
                </li>
              ))}
            </ul>
          ) : readiness?.ready ? (
            <p className="mt-2 text-xs text-muted-foreground">无阻塞项</p>
          ) : null}

          {hasValidationEvidence ? (
            <div className="mt-2 text-sm">
              {config?.last_validation_error_message ? (
                <p>{config.last_validation_error_message}</p>
              ) : null}
              {config?.last_validation_error_code ||
                  config?.last_validation_request_id ? (
                <p className="mt-0.5 break-all text-xs text-muted-foreground">
                  {config.last_validation_error_code
                    ? `错误码：${config.last_validation_error_code}`
                    : null}
                  {config.last_validation_error_code &&
                    config.last_validation_request_id
                    ? "；"
                    : null}
                  {config.last_validation_request_id
                    ? `Request-ID：${config.last_validation_request_id}`
                    : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={readonly || !profile.configured || pending}
          aria-busy={pending}
          onClick={validateProfile}
        >
          {pending ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {pending ? "正在验证配置" : "验证支付配置"}
        </Button>
      </div>

      {feedback ? (
        <div className="mt-3">
          <StatusAlert tone={feedback.tone} title="配置验证">
            <div className="flex flex-col gap-1">
              <span>{feedback.message}</span>
              {feedback.code || feedback.requestId ? (
                <span className="break-all text-xs">
                  {feedback.code ? `错误码：${feedback.code}` : null}
                  {feedback.code && feedback.requestId ? "；" : null}
                  {feedback.requestId
                    ? `Request-ID：${feedback.requestId}`
                    : null}
                </span>
              ) : null}
            </div>
          </StatusAlert>
        </div>
      ) : null}
    </section>
  );
}

export function toSafeValidationRequestFeedback(
  error: unknown,
): ValidationFeedback {
  if (!(error instanceof Error)) {
    return {
      tone: "error",
      message: VALIDATION_REQUEST_ERROR_MESSAGE,
    };
  }

  const requestError = error as BackendRequestError;
  const message = safeErrorMessage(error.message) ??
    VALIDATION_REQUEST_ERROR_MESSAGE;
  const code = safeDiagnostic(requestError.code, STABLE_ERROR_CODE_PATTERN);
  const requestId = safeDiagnostic(
    requestError.requestId,
    SAFE_REQUEST_ID_PATTERN,
  );
  return {
    tone: "error",
    message,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

function safeErrorMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > MAX_SAFE_ERROR_MESSAGE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function safeDiagnostic(value: unknown, pattern: RegExp) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return pattern.test(normalized) ? normalized : null;
}
