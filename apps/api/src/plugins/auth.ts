import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { verifyToken, verifyTokenDetailed } from "@/utils/jwt";
import { fail } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { userIdentityService } from "@/services/user-identities";
import { customerCoreService } from "@/services/customer-core";
import { projectSer } from "@/services/projects";

type VerifiedJwtPayload = NonNullable<ReturnType<typeof verifyToken>>;

const DEFAULT_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS = 30_000;
const MAX_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS = 60_000;
const MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE = 4_000;
const AUTH_TIMING_LOG_MIN_DURATION_MS = 100;

const wechatIdentityCheckCache = new Map<string, { expiresAt: number }>();
const wechatIdentityCheckInFlight = new Map<string, Promise<void>>();

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
    (method === "GET" || method === "HEAD")
    && url.startsWith("/public/tenants/")
    && url.includes("/marketing-pages")
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/public/tenant-share-links/")
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

  if (
    method === "POST"
    && url.startsWith("/public/tenants/")
    && url.includes("/marketing-pages/")
    && (url.endsWith("/leads") || url.endsWith("/events"))
  ) {
    return true;
  }

  if (
    method === "POST"
    && url === "/customer/project-acceptances/open-ticket/verify"
  ) {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && url.startsWith("/customer/project-acceptances/")
  ) {
    return true;
  }

  if (
    method === "POST"
    && url.startsWith("/project-acceptances/")
    && (url.endsWith("/customer-confirm") || url.endsWith("/customer-dispute"))
  ) {
    return true;
  }

  return false;
}

function isVisitorSessionRoute(method: string, url: string) {
  if (method === "POST" && url === "/auth/verify-role") {
    return true;
  }

  if (
    (method === "GET" || method === "HEAD")
    && (url === "/projects/frontend-visible" || url === "/front/projects" || url.startsWith("/front/projects/"))
  ) {
    return true;
  }

  if (
    method === "GET"
    && url === "/ai/decoration-qa/suggestions"
  ) {
    return true;
  }

  if (
    method === "POST"
    && (url === "/ai/decoration-qa" || url === "/ai/decoration-qa/stream")
  ) {
    return true;
  }

  return false;
}

function isPureVisitorPayload(payload: VerifiedJwtPayload) {
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  return (
    roles.length === 1 &&
    roles[0] === "visitor" &&
    !payload.tenant_id &&
    !payload.customer_id &&
    !payload.employee_id
  );
}

function shouldPrewarmEmployeeAuthContext(url: string, payload: VerifiedJwtPayload) {
  return (
    url === "/employee/bootstrap" &&
    Boolean(payload.sub) &&
    Boolean(payload.employee_id)
  );
}

function prewarmEmployeeAuthContextForRequest(
  request: FastifyRequest,
  payload: VerifiedJwtPayload,
) {
  if (!payload.sub || !payload.employee_id) {
    return;
  }

  const startedAt = Date.now();
  void authorizationService.prewarmEmployeeAuthContext({
    authUserId: payload.sub,
    employeeId: payload.employee_id,
  }).then((authContext) => {
    request.log.info(
      {
        requestId: request.id,
        stage: "prewarm_employee_auth_context",
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[auth-plugin] background stage completed",
    );

    const homeStartedAt = Date.now();
    void Promise.allSettled([
      projectSer.listProjects({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          ownership: "self",
          mode: "home",
        },
      }),
      customerCoreService.listCustomers({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          mode: "home",
        },
      }),
    ]).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          stage: "prewarm_employee_home_lists",
          durationMs: Date.now() - homeStartedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[auth-plugin] background stage completed",
      );
    }).catch((error) => {
      request.log.warn(
        {
          requestId: request.id,
          stage: "prewarm_employee_home_lists",
          durationMs: Date.now() - homeStartedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          error: error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
        },
        "[auth-plugin] background stage failed",
      );
    });
  }).catch((error) => {
    request.log.warn(
      {
        requestId: request.id,
        stage: "prewarm_employee_auth_context",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
      },
      "[auth-plugin] background stage failed",
    );
  });
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

function logAuthReject(
  request: FastifyRequest,
  reason: "missing" | "expired" | "invalid" | "unsupported_visitor_route" | "unsupported_token_type",
  details: Record<string, unknown> = {},
) {
  request.log.warn(
    {
      requestId: request.id,
      path: request.url.split("?")[0] ?? "/",
      method: request.method,
      reason,
      ...details,
    },
    "[auth-plugin] request rejected",
  );
}

function getWechatIdentityCheckCacheTtlMs() {
  const parsed = Number(process.env.WECHAT_IDENTITY_CHECK_CACHE_TTL_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS;
  }

  return Math.min(parsed, MAX_WECHAT_IDENTITY_CHECK_CACHE_TTL_MS);
}

function pruneWechatIdentityCheckCache(now: number) {
  if (wechatIdentityCheckCache.size < MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE) {
    return;
  }

  for (const [key, value] of wechatIdentityCheckCache.entries()) {
    if (value.expiresAt <= now) {
      wechatIdentityCheckCache.delete(key);
    }
  }

  if (wechatIdentityCheckCache.size >= MAX_WECHAT_IDENTITY_CHECK_CACHE_SIZE) {
    wechatIdentityCheckCache.clear();
  }
}

function buildWechatIdentityCheckCacheKey(kind: "oauth" | "business", payload: VerifiedJwtPayload) {
  return [
    kind,
    payload.sub,
    payload.openid ?? "",
    payload.tenant_id ?? "",
    payload.customer_id ?? "",
    payload.employee_id ?? "",
  ].join(":");
}

function hasWechatIdentityCheckCache(key: string) {
  const cached = wechatIdentityCheckCache.get(key);
  if (!cached) {
    return false;
  }

  if (cached.expiresAt <= Date.now()) {
    wechatIdentityCheckCache.delete(key);
    wechatIdentityCheckInFlight.delete(key);
    return false;
  }

  return true;
}

function setWechatIdentityCheckCache(key: string, payload: VerifiedJwtPayload) {
  const now = Date.now();
  pruneWechatIdentityCheckCache(now);

  const tokenExpiresAt = payload.exp ? payload.exp * 1000 : Number.POSITIVE_INFINITY;
  const expiresAt = Math.min(
    now + getWechatIdentityCheckCacheTtlMs(),
    tokenExpiresAt,
  );

  if (expiresAt > now) {
    wechatIdentityCheckCache.set(key, { expiresAt });
  }
}

async function runWechatIdentityCheckOnce(
  cacheKey: string,
  payload: VerifiedJwtPayload,
  handler: () => Promise<void>,
) {
  if (hasWechatIdentityCheckCache(cacheKey)) {
    return;
  }

  const inFlight = wechatIdentityCheckInFlight.get(cacheKey);
  if (inFlight) {
    await inFlight;
    return;
  }

  const request = handler()
    .then(() => {
      setWechatIdentityCheckCache(cacheKey, payload);
    })
    .finally(() => {
      if (wechatIdentityCheckInFlight.get(cacheKey) === request) {
        wechatIdentityCheckInFlight.delete(cacheKey);
      }
    });
  wechatIdentityCheckInFlight.set(cacheKey, request);
  await request;
}

export function primeWechatIdentityCheckCacheFromToken(token: string) {
  const payload = verifyToken(token);
  if (!payload?.sub || !payload.openid) {
    return;
  }

  setWechatIdentityCheckCache(
    buildWechatIdentityCheckCacheKey("oauth", payload),
    payload,
  );

  if (payload.tenant_id && (payload.customer_id || payload.employee_id)) {
    setWechatIdentityCheckCache(
      buildWechatIdentityCheckCacheKey("business", payload),
      payload,
    );
  }
}

async function logAuthStage<T>(
  request: FastifyRequest,
  stage: string,
  handler: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await handler();
    const durationMs = Date.now() - startedAt;
    if (durationMs >= AUTH_TIMING_LOG_MIN_DURATION_MS) {
      request.log.info(
        { requestId: request.id, stage, durationMs },
        "[auth-plugin] stage completed",
      );
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    request.log.warn(
      {
        requestId: request.id,
        stage,
        durationMs,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
      },
      "[auth-plugin] stage failed",
    );
    throw error;
  }
}

async function assertWechatBusinessBinding(payload: ReturnType<typeof verifyToken>) {
  if (!payload?.openid || !payload.sub || !payload.tenant_id) {
    return;
  }

  const userId = payload.sub;
  const tenantId = payload.tenant_id;
  const customerId = payload.customer_id ?? null;
  const employeeId = payload.employee_id ?? null;
  const cacheKey = buildWechatIdentityCheckCacheKey("business", payload);
  await runWechatIdentityCheckOnce(cacheKey, payload, async () => {
    if (customerId) {
      const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
        userId,
        tenantId,
        identityType: "customer",
        identityId: customerId,
      });

      if (!hasActiveMembership) {
        throw Errors.unauthorized(
          "当前微信绑定关系已变化，请重新登录",
          ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
        );
      }
    }

    if (employeeId) {
      const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
        userId,
        tenantId,
        identityType: "employee",
        identityId: employeeId,
      });

      if (!hasActiveMembership) {
        throw Errors.unauthorized(
          "当前微信绑定关系已变化，请重新登录",
          ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
        );
      }
    }
  });
}

async function assertWechatOauthCredential(payload: ReturnType<typeof verifyToken>) {
  if (!payload?.openid || !payload.sub) {
    return;
  }

  const openid = payload.openid;
  const userId = payload.sub;
  const cacheKey = buildWechatIdentityCheckCacheKey("oauth", payload);
  await runWechatIdentityCheckOnce(cacheKey, payload, async () => {
    const activeOauth = await userIdentityService.findActiveOauthIdentity({
      platform: "wechat_mini",
      openid,
    });
    if (activeOauth?.user_id === userId) {
      return;
    }

    throw Errors.unauthorized(
      "当前微信登录凭证已失效，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  });
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

    await Promise.all([
      logAuthStage(request, "assert_wechat_oauth_credential", () =>
        assertWechatOauthCredential(payload)
      ),
      logAuthStage(request, "assert_wechat_business_binding", () =>
        assertWechatBusinessBinding(payload)
      ),
    ]);

    request.user = payload;
  });
};

export default authPlugin;
