// src/errors/error-factory.ts
import { AppError } from "./app-error";
import { ErrorCodes } from "./error-codes.ts";

export const Errors = {
  badRequest: (msg: string) =>
    new AppError(400, msg, ErrorCodes.VALIDATION_ERROR),

  notFound: (msg: string) => new AppError(404, msg, ErrorCodes.USER_NOT_FOUND),

  unauthorized: () => new AppError(401, "未授权", ErrorCodes.UNAUTHORIZED),

  forbidden: () => new AppError(403, "无权限", ErrorCodes.FORBIDDEN),

  dbError: (msg = "数据库错误", details?: unknown) =>
    new AppError(500, msg, ErrorCodes.DB_ERROR, details),
};
