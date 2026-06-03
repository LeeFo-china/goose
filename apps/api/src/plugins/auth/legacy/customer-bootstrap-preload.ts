import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { customerBootstrapAuthService } from "@/services/customer-bootstrap-auth";
import type { WechatCustomerBootstrapVerification } from "@/repositories/customer-bootstrap-auth";
import type { VerifiedJwtPayload } from "./types";
import {
  buildWechatIdentityCheckCacheKey,
  runWechatIdentityCheckOnce,
} from "./wechat-cache";

export type CustomerBootstrapPreloadOptions = {
  page: number;
  pageSize: number;
};

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCustomerBootstrapPreloadOptions(
  method: string,
  path: string,
  requestUrl: string,
) {
  if (method !== "GET" || path !== "/customer/bootstrap") return null;

  const query = new URL(requestUrl, "http://localhost").searchParams;
  const include = query.get("include") || "home_summary";
  const projectsMode = query.get("projects_mode") || "inline";
  if (include !== "home_summary" || projectsMode !== "inline") return null;

  return {
    page: parsePositiveInt(query.get("page"), 1),
    pageSize: parsePositiveInt(query.get("pageSize"), 20),
  };
}

function assertWechatBootstrapResult(result: WechatCustomerBootstrapVerification) {
  if (!result.oauth_matched) {
    throw Errors.unauthorized(
      "当前微信登录凭证已失效，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }

  if (!result.employee_user_matched) {
    throw Errors.unauthorized(
      "当前员工身份已失效，请重新登录",
      ErrorCodes.EMPLOYEE_CONTEXT_MISSING,
    );
  }

  if (!result.customer_membership_matched || !result.employee_membership_matched) {
    throw Errors.unauthorized(
      "当前微信绑定关系已变化，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }
}

export async function assertWechatCustomerBootstrap(
  payload: VerifiedJwtPayload,
  options: CustomerBootstrapPreloadOptions,
) {
  if (!payload.openid || !payload.sub) return undefined;

  const cacheKey = [
    buildWechatIdentityCheckCacheKey("bootstrap", payload),
    options.page,
    options.pageSize,
  ].join(":");
  return runWechatIdentityCheckOnce(cacheKey, payload, async () => {
    const result = await customerBootstrapAuthService.verifyWechatCustomerBootstrap({
      userId: payload.sub!,
      openid: payload.openid!,
      tenantId: payload.tenant_id ?? null,
      customerId: payload.customer_id ?? null,
      employeeId: payload.employee_id ?? null,
      page: options.page,
      pageSize: options.pageSize,
    });
    assertWechatBootstrapResult(result);
    return result;
  });
}
