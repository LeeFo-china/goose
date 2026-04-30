// src/plugins/error-handler.ts
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error";
import { fail } from "@/utils/response";
import { ErrorCodes } from "../errors/error-codes";
import { ZodError } from "zod";
import { getRequestLogContext } from "@/utils/logging";

function hasFastifyValidation(error: unknown): error is { validation: unknown } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "validation" in error &&
      (error as { validation?: unknown }).validation,
  );
}

function getErrorLogPayload(
  error: unknown,
  request: FastifyRequest,
  statusCode: number,
  code: string,
) {
  return {
    ...getRequestLogContext(request),
    statusCode,
    code,
    err: error,
  };
}

function getErrorLogMeta(error: unknown) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: "application error",
    };
  }

  if (error instanceof ZodError || hasFastifyValidation(error)) {
    return {
      statusCode: 400,
      code: ErrorCodes.VALIDATION_ERROR,
      message: "validation error",
    };
  }

  return {
    statusCode: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    message: "unhandled error",
  };
}

const errorHandler: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    const logMeta = getErrorLogMeta(error);
    const logPayload = getErrorLogPayload(
      error,
      request,
      logMeta.statusCode,
      logMeta.code,
    );

    if (logMeta.statusCode >= 500) {
      request.log.error(logPayload, logMeta.message);
    } else {
      request.log.warn(logPayload, logMeta.message);
    }

    // ✅ 自定义错误
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send(fail(error.message, error.code, requestId, error.details));
    }

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string[]> = {};

      for (const issue of error.issues) {
        const key = issue.path.join(".") || "root";
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }

      return reply.status(400).send({
        status: "fail",
        message: "参数校验失败",
        errors: fieldErrors,
      });
    }

    // ✅ schema 验证错误
    if (hasFastifyValidation(error)) {
      return reply
        .status(400)
        .send(
          fail(
            "参数验证失败",
            ErrorCodes.VALIDATION_ERROR,
            requestId,
            error.validation,
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
