// src/plugins/error-handler.ts
import type { FastifyPluginAsync } from "fastify";
import { AppError } from "../errors/app-error";
import { fail } from "@/utils/response.ts";
import { ErrorCodes } from "../errors/error-codes";

const errorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    // 🔥 日志分级
    if (error instanceof AppError) {
      request.log.warn({
        err: error,
        requestId,
      });
    } else {
      request.log.error({
        err: error,
        requestId,
      });
    }

    // ✅ 自定义错误
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(fail(error.message, error.code, requestId, error.details));
    }

    // ✅ schema 验证错误
    if ((error as any).validation) {
      return reply
        .status(400)
        .send(
          fail(
            "参数验证失败",
            ErrorCodes.VALIDATION_ERROR,
            requestId,
            (error as any).validation,
          ),
        );
    }

    // ❗ 未知错误（兜底）
    return reply
      .status(500)
      .send(fail("服务器内部错误", ErrorCodes.INTERNAL_ERROR, requestId));
  });

  // 404
  app.setNotFoundHandler((request, reply) => {
    return reply
      .status(404)
      .send(
        fail(
          `接口 ${request.method} ${request.url} 不存在`,
          "ROUTE_NOT_FOUND",
          request.id,
        ),
      );
  });
};

export default errorHandler;
