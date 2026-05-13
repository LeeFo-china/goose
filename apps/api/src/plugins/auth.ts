import type { FastifyInstance } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { verifyToken } from "@/utils/jwt";
import { fail } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase";
import { userIdentityService } from "@/services/user-identities";

type AuthIdentitySource = "legacy" | "dual" | "membership";

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

function getAuthIdentitySource(): AuthIdentitySource {
  const value = (process.env.AUTH_IDENTITY_SOURCE || "dual").trim().toLowerCase();
  if (value === "legacy" || value === "membership") {
    return value;
  }

  return "dual";
}

async function assertWechatBusinessBinding(payload: ReturnType<typeof verifyToken>) {
  if (!payload?.openid || !payload.sub || !payload.tenant_id) {
    return;
  }

  const adminClient = SupabaseDB.getAdminClient();
  const identitySource = getAuthIdentitySource();

  if (payload.customer_id) {
    let hasActiveMembership = false;
    if (identitySource !== "legacy") {
      hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
        userId: payload.sub,
        tenantId: payload.tenant_id,
        identityType: "customer",
        identityId: payload.customer_id,
      });
    }

    if (!hasActiveMembership && identitySource === "membership") {
      throw Errors.unauthorized(
        "当前微信绑定关系已变化，请重新登录",
        ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
      );
    }

    if (!hasActiveMembership) {
      const { data, error } = await adminClient
        .from("customers")
        .select("id")
        .eq("id", payload.customer_id)
        .eq("tenant_id", payload.tenant_id)
        .eq("user_id", payload.sub)
        .maybeSingle();

      if (error) {
        throw Errors.dbError("校验客户微信绑定失败", error);
      }

      if (!data) {
        throw Errors.unauthorized(
          "当前微信绑定关系已变化，请重新登录",
          ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
        );
      }
    }
  }

  if (payload.employee_id) {
    let hasActiveMembership = false;
    if (identitySource !== "legacy") {
      hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
        userId: payload.sub,
        tenantId: payload.tenant_id,
        identityType: "employee",
        identityId: payload.employee_id,
      });
    }

    if (!hasActiveMembership && identitySource === "membership") {
      throw Errors.unauthorized(
        "当前微信绑定关系已变化，请重新登录",
        ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
      );
    }

    if (!hasActiveMembership) {
      const { data, error } = await adminClient
        .from("employees")
        .select("id")
        .eq("id", payload.employee_id)
        .eq("tenant_id", payload.tenant_id)
        .eq("user_id", payload.sub)
        .maybeSingle();

      if (error) {
        throw Errors.dbError("校验员工微信绑定失败", error);
      }

      if (!data) {
        throw Errors.unauthorized(
          "当前微信绑定关系已变化，请重新登录",
          ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
        );
      }
    }
  }
}

async function assertWechatOauthCredential(payload: ReturnType<typeof verifyToken>) {
  if (!payload?.openid || !payload.sub) {
    return;
  }

  const identitySource = getAuthIdentitySource();
  if (identitySource === "legacy") {
    return;
  }

  const activeOauth = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid: payload.openid,
  });
  if (activeOauth?.user_id === payload.sub) {
    return;
  }

  if (identitySource === "dual") {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_identities")
      .select("auth_user_id")
      .eq("openid", payload.openid)
      .eq("auth_user_id", payload.sub)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("校验微信登录凭证失败", error);
    }

    if (data) {
      return;
    }
  }

  throw Errors.unauthorized(
    "当前微信登录凭证已失效，请重新登录",
    ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
  );
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

    if (payload.token_type && payload.token_type !== "auth") {
      const error = getTokenError("invalid");
      return reply.status(error.statusCode).send(sendUnauthorized(error, request.id));
    }

    await assertWechatOauthCredential(payload);
    await assertWechatBusinessBinding(payload);

    request.user = payload;
  });
};

export default authPlugin;
