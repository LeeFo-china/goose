import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import type { VerifiedJwtPayload } from "./types";

export async function assertDouyinCustomerIdentityBinding(
  payload: VerifiedJwtPayload,
) {
  if (
    payload.token_type !== "auth" ||
    payload.login_channel !== "douyin" ||
    !payload.sub ||
    !payload.tenant_id ||
    !payload.customer_id ||
    !payload.subject_hash
  ) {
    throw Errors.unauthorized(
      "当前抖音客户登录状态无效，请重新登录",
      ErrorCodes.TOKEN_INVALID,
    );
  }

  const activeOauth = await userIdentityService.findActiveOauthIdentity({
    platform: "douyin_mini",
    openid: payload.subject_hash,
  });
  if (activeOauth?.user_id !== payload.sub) {
    throw Errors.unauthorized(
      "当前抖音登录凭证已失效，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }

  const hasMembership = await userIdentityService.hasActiveBusinessMembership({
    userId: payload.sub,
    tenantId: payload.tenant_id,
    identityType: "customer",
    identityId: payload.customer_id,
  });
  if (!hasMembership) {
    throw Errors.unauthorized(
      "当前客户绑定关系已变化，请重新登录",
      ErrorCodes.CUSTOMER_CONTEXT_MISSING,
    );
  }
}
