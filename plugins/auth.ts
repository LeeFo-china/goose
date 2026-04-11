import type { FastifyInstance } from "fastify";
import { Errors } from "@/errors/error-factory";
import { verifyToken } from "@/utils/jwt";
import { fail } from "@/utils/response";

const publicRoutes = new Set(["/", "/auth"]);

function sendUnauthorized(appError: ReturnType<typeof Errors.unauthorized>, requestId: string) {
  return fail(appError.message, appError.code, requestId, appError.details);
}

const authPlugin = (app: FastifyInstance) => {
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0];

    // 白名单接口必须跳过鉴权，否则前端无法完成首次登录和静默续签。
    if (publicRoutes.has(url)) {
      return;
    }

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      const error = Errors.unauthorized();
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      const error = Errors.unauthorized();
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const payload = verifyToken(token);
    if (!payload) {
      const error = Errors.unauthorized();
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    request.user = payload;
  });
};

export default authPlugin;
