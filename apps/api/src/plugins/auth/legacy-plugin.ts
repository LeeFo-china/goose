import type { FastifyInstance } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { verifyTokenDetailed } from "@/utils/jwt";
import {
  prewarmEmployeeAuthContextForRequest,
  shouldPrewarmEmployeeAuthContext,
} from "./legacy/employee-prewarm";
import {
  assertWechatCustomerBootstrap,
  getCustomerBootstrapPreloadOptions,
} from "./legacy/customer-bootstrap-preload";
import {
  getTokenError,
  logAuthReject,
  sendUnauthorized,
} from "./legacy/responses";
import {
  isPublicRoute,
  isPureVisitorPayload,
  isVisitorSessionRoute,
} from "./legacy/routes";
import { logAuthStage } from "./legacy/timing";
import {
  assertWechatIdentityBinding,
} from "./legacy/wechat-assertions";

export { primeWechatIdentityCheckCacheFromToken } from "./legacy/wechat-cache";

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
      logAuthReject(request, "missing", { hasAuthorization: Boolean(authorization) });
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const token = authorization.slice(7).trim();
    if (!token) {
      const error = getTokenError("missing");
      logAuthReject(request, "missing", { hasAuthorization: true });
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    const tokenResult = await logAuthStage(request, "verify_token", async () =>
      verifyTokenDetailed(token)
    );
    const payload = tokenResult.payload;
    if (!payload) {
      const reason = tokenResult.reason === "expired" ? "expired" : "invalid";
      const error = getTokenError(reason);
      logAuthReject(request, reason);
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    if (payload.token_type === "visitor_session") {
      if (!isVisitorSessionRoute(method, url)) {
        const error = Errors.unauthorized(
          "访客会话不支持该操作，请先完成身份验证",
          ErrorCodes.TOKEN_INVALID,
        );
        logAuthReject(request, "unsupported_visitor_route", {
          tokenType: payload.token_type,
          visitorId: payload.visitor_id,
        });
        return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
      }

      request.user = payload;
      return;
    }

    if (payload.token_type && payload.token_type !== "auth") {
      const error = getTokenError("invalid");
      logAuthReject(request, "unsupported_token_type", { tokenType: payload.token_type });
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    if (payload.openid && isPureVisitorPayload(payload) && isVisitorSessionRoute(method, url)) {
      request.log.info(
        { requestId: request.id, path: url },
        "[auth-plugin] skip visitor oauth credential check",
      );
      request.user = payload;
      return;
    }

    if (shouldPrewarmEmployeeAuthContext(url, payload)) {
      prewarmEmployeeAuthContextForRequest(request, payload);
    }

    const bootstrapOptions = getCustomerBootstrapPreloadOptions(
      method,
      url,
      request.url,
    );
    const identityBinding = bootstrapOptions
      ? await logAuthStage(request, "assert_wechat_customer_bootstrap", () =>
        assertWechatCustomerBootstrap(payload, bootstrapOptions)
      )
      : await logAuthStage(request, "assert_wechat_identity_binding", () =>
        assertWechatIdentityBinding(payload)
      );
    if (identityBinding?.customer_context || identityBinding?.user_profile !== undefined) {
      const requestWithPreload = request as typeof request & {
        preloadedCustomerContext?: unknown;
        preloadedUserProfile?: unknown;
        preloadedCustomerHomeProjects?: unknown;
      };
      requestWithPreload.preloadedCustomerContext = identityBinding.customer_context;
      requestWithPreload.preloadedUserProfile = identityBinding.user_profile;
      if (bootstrapOptions && "home_projects" in identityBinding) {
        requestWithPreload.preloadedCustomerHomeProjects = {
          page: bootstrapOptions.page,
          pageSize: bootstrapOptions.pageSize,
          list: identityBinding.home_projects,
        };
      }
    }

    request.user = payload;
  });
};

export default authPlugin;
