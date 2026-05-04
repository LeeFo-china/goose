import type { FastifyInstance } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { verifyToken } from "@/utils/jwt";
import { fail } from "@/utils/response";

const publicRoutes = new Set([
  "/",
  "/auth",
  "/auth/send-code",
  "/admin/auth/send-code",
  "/admin/auth/login",
]);

function isPublicRoute(method: string, url: string) {
  if (publicRoutes.has(url)) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url === "/ai/decoration-qa/suggestions"
  ) {
    return true;
  }

  if ((method === "GET" || method === "HEAD") && url.startsWith("/share-campaigns/")) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/share-campaign-claim-vouchers/")
  ) {
    return true;
  }

  if (method === "POST" && url === "/share-campaigns/open") {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/public/marketing-pages" || url.startsWith("/public/marketing-pages/"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/public/marketing-pages/")
    && (url.endsWith("/leads") || url.endsWith("/events"))
  ) {
    return true;
  }

  return false;
}

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
    const method = request.method.toUpperCase();

    const authorization = request.headers.authorization;

    if (isPublicRoute(method, url) && !authorization) {
      return;
    }

    if (!authorization?.startsWith("Bearer ")) {
      const error = getTokenError("missing");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      const error = getTokenError("missing");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const payload = verifyToken(token);
    if (!payload) {
      const error = getTokenError("invalid");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    request.user = payload;
  });
};

export default authPlugin;
