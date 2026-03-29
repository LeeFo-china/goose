// src/errors/error-codes.ts
export const ErrorCodes = {
  // 通用
  INTERNAL_ERROR: "INTERNAL_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // 用户
  USER_NOT_FOUND: "USER_NOT_FOUND",
  USER_EXISTS: "USER_EXISTS",

  // 权限
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // 数据库
  DB_ERROR: "DB_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
