// src/errors/error-codes.ts

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  DB_ERROR: "DB_ERROR",
  USER_EXISTS: "USER_EXISTS",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
