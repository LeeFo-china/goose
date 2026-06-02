import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { signToken, signVisitorSessionToken, type JwtPayload } from "@/utils/jwt";
import { primeWechatIdentityCheckCacheFromToken } from "@/plugins/auth";
import {
  ReviewWechatRebindRequestSchema,
  SendCodeSchema,
  VerifyRoleSchema,
  WechatRebindRequestListQuerySchema,
  WechatRebindRequestParamsSchema,
  WechatRebindRequestSchema,
} from "@/schema/wechat";
import { authorizationService, type AuthContext } from "@/services/authorization";
import { marketingPageService } from "@/services/marketing-pages";
import { systemSettingsService } from "@/services/system-settings";
import { tenantShareLinkService } from "@/services/tenant-share-links";
import { customerSelfServiceService } from "@/services/customer-self-service";
import { customerCoreService } from "@/services/customer-core";
import { homeDashboardService } from "@/services/home-dashboard";
import { taskCenterService } from "@/services/task-center";
import { projectSer } from "@/services/projects";
import { getDecorationQaSuggestions } from "@/services/decoration-qa";
import { userIdentityService } from "@/services/user-identities";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { wechatAuthIdentityService } from "@/services/wechat-auth-identities";
import { wechatAuthRoleService } from "@/services/wechat-auth-roles";
import {
  wechatCustomerIdentityService,
  type CustomerTenantOption,
} from "@/services/wechat-customer-identities";
import type { WechatLoginMembershipRow } from "@/repositories/wechat-customer-identities";
import { wechatEmployeeIdentityService } from "@/services/wechat-employee-identities";
import { wechatRebindRequestService } from "@/services/wechat-rebind-requests";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import {
  isEmployeeOperableStatus,
  type AuthTargetRole,
  type SmsScene,
} from "@gooes/domain";
import {
  CustomerTenantSelectBodySchema,
  H5MarketingSessionBodySchema,
  VISITOR_ONLY_AUTH_USER_CACHE_TTL_MS,
  WeChatAuthBodySchema,
  type ActiveBusinessMembership,
  type WeChatSessionResponse,
  type WechatAuthResolution,
} from "./shared";

export async function bindCustomerToAuthUser(this: any, 
  request: FastifyRequest | null,
  authUserId: string,
  customer: CustomerTenantOption,
  options?: {
    openid?: string | null;
  },
) {
  const logCustomerBindStage = (
    stage: string,
    startedAt: number,
    extra: Record<string, unknown> = {},
  ) => {
    request?.log.info(
      {
        requestId: request.id,
        stage,
        durationMs: Date.now() - startedAt,
        ...extra,
      },
      "[auth] customer bind stage completed",
    );
  };

  const membershipStartedAt = Date.now();
  const hasActiveMembership = await userIdentityService.hasActiveBusinessMembership({
    userId: authUserId,
    tenantId: customer.tenant_id,
    identityType: "customer",
    identityId: customer.id,
  });
  logCustomerBindStage("current_membership_checked", membershipStartedAt, {
    authUserId,
    customerId: customer.id,
    hasActiveMembership,
  });

  if (customer.user_id && customer.user_id !== authUserId && !hasActiveMembership) {
    const existingOpenidStartedAt = Date.now();
    const existingOpenid = await this.findOpenIdByAuthUserId(customer.user_id);
    logCustomerBindStage("existing_customer_openid_checked", existingOpenidStartedAt, {
      customerAuthUserId: customer.user_id,
      hasExistingOpenid: Boolean(existingOpenid),
    });
    if (existingOpenid) {
      const rebindStartedAt = Date.now();
      await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
      logCustomerBindStage("customer_rebind_checked", rebindStartedAt, {
        customerAuthUserId: customer.user_id,
      });
    }

    if (!options?.openid) {
      throw Errors.badRequest("当前账号未绑定微信身份");
    }

    const oauthStartedAt = Date.now();
    await userIdentityService.syncOauthIdentityBestEffort({
      userId: customer.user_id,
      platform: "wechat_mini",
      openid: options.openid,
      source: "customer_verify_role_bind_existing_auth_user",
    });
    logCustomerBindStage("oauth_identity_synced", oauthStartedAt, {
      customerAuthUserId: customer.user_id,
    });

    const membershipSyncStartedAt = Date.now();
    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: customer.user_id,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
      source: "customer_verify_role_bind_existing_auth_user",
    });
    logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
      customerAuthUserId: customer.user_id,
      customerId: customer.id,
      tenantId: customer.tenant_id,
    });
    wechatCustomerIdentityService.invalidateWechatLoginState({
      authUserId: customer.user_id,
      openid: options.openid,
    });
    authorizationService.invalidateAuthContext({ authUserId });
    authorizationService.invalidateAuthContext({ authUserId: customer.user_id });
    return customer.user_id;
  }

  if (!hasActiveMembership) {
    const rebindStartedAt = Date.now();
    await wechatRebindRequestService.assertCustomerCanBind(authUserId, customer);
    logCustomerBindStage("customer_rebind_checked", rebindStartedAt, {
      customerAuthUserId: customer.user_id,
    });
  }

  if (customer.user_id === authUserId && hasActiveMembership) {
    return authUserId;
  }

  if (customer.user_id === authUserId) {
    const membershipSyncStartedAt = Date.now();
    await userIdentityService.syncBusinessMembershipBestEffort({
      userId: authUserId,
      tenantId: customer.tenant_id,
      identityType: "customer",
      identityId: customer.id,
      source: "customer_bind_auth_user_existing",
    });
    logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
      authUserId,
      customerId: customer.id,
      tenantId: customer.tenant_id,
    });
    wechatCustomerIdentityService.invalidateWechatLoginState({
      authUserId,
      openid: options?.openid,
    });
    return authUserId;
  }

  if (hasActiveMembership && customer.user_id && customer.user_id !== authUserId) {
    authorizationService.invalidateAuthContext({
      authUserId: customer.user_id,
    });
  }

  const bindStartedAt = Date.now();
  await wechatCustomerIdentityService.bindCustomerAuthUser({
    authUserId,
    customer,
  });
  logCustomerBindStage("customer_auth_user_bound", bindStartedAt, {
    authUserId,
    customerId: customer.id,
    tenantId: customer.tenant_id,
  });

  authorizationService.invalidateAuthContext({
    authUserId,
  });

  const membershipSyncStartedAt = Date.now();
  await userIdentityService.syncBusinessMembershipBestEffort({
    userId: authUserId,
    tenantId: customer.tenant_id,
    identityType: "customer",
    identityId: customer.id,
    source: "customer_bind_auth_user",
  });
  logCustomerBindStage("business_membership_synced", membershipSyncStartedAt, {
    authUserId,
    customerId: customer.id,
    tenantId: customer.tenant_id,
  });
  wechatCustomerIdentityService.invalidateWechatLoginState({
    authUserId,
    openid: options?.openid,
  });

  return authUserId;
}

export async function resolveCustomerLoginState(this: any, 
  request: FastifyRequest,
  authUserId: string,
  phone: string,
  openid: string | null,
  shareToken?: string | null,
) {
  if (shareToken) {
    return this.resolveCustomerLoginStateByShareToken({
      authUserId,
      phone,
      openid,
      shareToken,
    });
  }

  const customers = await this.listCustomerTenantOptionsByPhone(phone);

  if (customers.length === 0) {
    const roles = await this.getUserRoles(authUserId);
    const token = this.signWechatAuthToken({
      sub: authUserId,
      openid: openid ?? undefined,
      roles,
      verified_phone: phone,
    });

    return {
      mode: "platform_visitor",
      token,
      user_id: authUserId,
      roles,
      is_new_user: false,
      phone,
      has_customer_profile: false,
      message: "暂未匹配到装修公司，可先提交装修需求，平台顾问会协助分配。",
    };
  }

  if (customers.length === 1) {
    const customer = customers[0]!;
    const customerAuthUserId = await this.bindCustomerToAuthUser(
      request,
      authUserId,
      customer,
      { openid },
    );
    return this.signCustomerSession({
      authUserId: customerAuthUserId,
      openid,
      customer: {
        ...customer,
        user_id: customerAuthUserId,
      },
      roles: ["customer"],
      request,
    });
  }

  const roles = await this.getUserRoles(authUserId);
  const token = this.signWechatAuthToken({
    sub: authUserId,
    openid: openid ?? undefined,
    roles,
    verified_phone: phone,
  });

  return {
    mode: "select_tenant",
    token,
    user_id: authUserId,
    roles,
    is_new_user: false,
    phone,
    tenants: customers.map((item: CustomerTenantOption) =>
      this.serializeCustomerTenantOption(item)
    ),
  };
}

export async function resolveCustomerLoginStateByShareToken(this: any, input: {
  authUserId: string;
  phone: string;
  openid: string | null;
  shareToken: string;
}) {
  const bound = await tenantShareLinkService.bindCustomer({
    authUserId: input.authUserId,
    phone: input.phone,
    shareToken: input.shareToken,
  });

  const customer = await this.getCustomerTenantOptionById(
    bound.customer_id,
    bound.tenant_id,
  );
  if (!customer) {
    throw Errors.dbError("员工分享客户绑定后未找到客户档案", bound);
  }

  await userIdentityService.syncBusinessMembershipBestEffort({
    userId: input.authUserId,
    tenantId: bound.tenant_id,
    identityType: "customer",
    identityId: bound.customer_id,
    source: "customer_share_token_bind",
  });

  return {
    ...(await this.signCustomerSession({
      authUserId: input.authUserId,
      openid: input.openid,
      customer: {
        ...customer,
        user_id: input.authUserId,
      },
    })),
    share_binding: {
      share_link_id: bound.share_link_id,
      share_employee_id: bound.share_employee_id,
      dedupe_result: bound.dedupe_result,
      source: bound.source,
    },
  };
}

export async function selectCustomerTenantForAuthUser(this: any, input: {
  authUserId: string;
  openid: string | null;
  verifiedPhone: string | null;
  tenantId: string;
  customerId: string;
}) {
  const customer = await this.getCustomerTenantOptionById(
    input.customerId,
    input.tenantId,
  );
  if (!customer) {
    throw Errors.notFound("客户租户关系不存在");
  }

  const tenant = this.normalizeTenantRelation(customer.tenant);
  if (tenant?.status !== "active") {
    throw Errors.business(403, "租户状态不可用", "FORBIDDEN");
  }

  const canSelectByCurrentBinding = customer.user_id === input.authUserId;
  const canSelectByMembership = await userIdentityService.hasActiveBusinessMembership({
    userId: input.authUserId,
    tenantId: customer.tenant_id,
    identityType: "customer",
    identityId: customer.id,
  });
  const canSelectByVerifiedPhone = Boolean(
    input.verifiedPhone &&
      customer.phone &&
      input.verifiedPhone === customer.phone,
  );
  if (!canSelectByMembership && !canSelectByCurrentBinding && !canSelectByVerifiedPhone) {
    throw Errors.business(403, "当前账号不能选择该装修公司", "FORBIDDEN");
  }

  const customerAuthUserId = await this.bindCustomerToAuthUser(
    null,
    input.authUserId,
    customer,
    { openid: input.openid },
  );

  return this.signCustomerSession({
    authUserId: customerAuthUserId,
    openid: input.openid,
    customer: {
      ...customer,
      user_id: customerAuthUserId,
    },
  });
}

export async function bindCustomerRole(this: any, 
  authUserId: string,
  phone: string,
  options?: {
    createIfMissing?: boolean;
    customerOrigin?: string | null;
  },
) {
  await wechatCustomerIdentityService.bindCustomerRole({
    authUserId,
    phone,
    createIfMissing: options?.createIfMissing,
    customerOrigin: options?.customerOrigin,
  });
}
