// src/utils/response.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiResponse } from "@/types/api";

export function success(data: unknown, requestId?: string) {
  return {
    data,
    requestId,
  };
}

export function fail(
  message: string,
  code: string,
  requestId: string,
  details?: unknown,
) {
  return {
    success: false,
    message,
    code,
    details,
    requestId,
  };
}

export class ResponseHandler {
  /**
   * 成功返回
   */
  static success<T>(data: T, message: string = "success"): ApiResponse<T> {
    return {
      data,
      message,
    };
  }

  /**
   * 错误返回
   */
  static error(
    message: string = "error",
    error: any = null,
  ): ApiResponse<null> {
    return {
      data: null,
      message,
      error,
    };
  }
}
