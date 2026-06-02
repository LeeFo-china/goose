import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { authorizationService } from "@/services/authorization";
import { userIdentityService } from "@/services/user-identities";
import {
  buildWechatIdentityCheckCacheKey,
  runWechatIdentityCheckOnce,
} from "./wechat-cache";
import type { VerifiedJwtPayload } from "./types";

export async function assertWechatBusinessBinding(payload: VerifiedJwtPayload) {
  if (!payload.openid || !payload.sub || !payload.tenant_id) {
    return;
  }

  const userId = payload.sub;
  const tenantId = payload.tenant_id;
  const customerId = payload.customer_id ?? null;
  const employeeId = payload.employee_id ?? null;
  if (employeeId) {
    await authorizationService.assertEmployeeBoundToAuthUser({
      authUserId: userId,
      employeeId,
      tenantId,
    });
  }

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

export async function assertWechatOauthCredential(payload: VerifiedJwtPayload) {
  if (!payload.openid || !payload.sub) {
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
