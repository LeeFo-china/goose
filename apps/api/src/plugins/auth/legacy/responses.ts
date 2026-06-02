import type { FastifyRequest } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { fail } from "@/utils/response";
import type { AuthRejectReason, TokenErrorReason } from "./types";

export function sendUnauthorized(
  appError: ReturnType<typeof Errors.unauthorized>,
  requestId: string,
) {
  return fail(appError.message, appError.code, requestId, appError.details);
}

export function getTokenError(reason: TokenErrorReason) {
  if (reason === "missing") {
    return Errors.unauthorized("缺少登录凭证", ErrorCodes.TOKEN_MISSING);
  }

  if (reason === "expired") {
    return Errors.unauthorized("登录已过期，请重新登录", ErrorCodes.TOKEN_EXPIRED);
  }

  return Errors.unauthorized("登录凭证无效", ErrorCodes.TOKEN_INVALID);
}

export function logAuthReject(
  request: FastifyRequest,
  reason: AuthRejectReason,
  details: Record<string, unknown> = {},
) {
  request.log.warn(
    {
      requestId: request.id,
      path: request.url.split("?")[0] ?? "/",
      method: request.method,
      reason,
      ...details,
    },
    "[auth-plugin] request rejected",
  );
}
