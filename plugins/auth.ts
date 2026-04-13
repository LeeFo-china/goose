import type { FastifyInstance } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { verifyToken } from "@/utils/jwt";
import { fail } from "@/utils/response";

const publicRoutes = new Set(["/", "/auth", "/auth/send-code"]);

function sendUnauthorized(appError: ReturnType<typeof Errors.unauthorized>, requestId: string) {
  return fail(appError.message, appError.code, requestId, appError.details);
}

function getTokenError(reason: "missing" | "expired" | "invalid") {
  if (reason === "missing") {
    return Errors.unauthorized("缺少登录凭证", ErrorCodes.TOKEN_MISSING);
  }

  if (reason === "expired") {
    return Errors.unauthorized("登录已过期，请重新登录", ErrorCodes.TOKEN_EXPIRED);
  }

  return Errors.unauthorized("登录凭证无效", ErrorCodes.TOKEN_INVALID);
}

const authPlugin = (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "/";

    // 白名单接口必须跳过鉴权，否则前端无法完成首次登录和静默续签。
    if (publicRoutes.has(url)) {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      const error = getTokenError("missing");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      const error = getTokenError("missing");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const result = verifyToken(token);
    if (!result.valid) {
      const error = getTokenError(
        result.reason === "expired" ? "expired" : "invalid",
      );
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    request.user = result.payload;
  });
};

export default authPlugin;
