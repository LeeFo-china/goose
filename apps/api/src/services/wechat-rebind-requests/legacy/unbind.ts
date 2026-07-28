import {
  assertActiveWechatOauth,
  assertBusinessIdentityBelongsToUser,
  assertHasPhoneRecovery,
  assertWechatUnbindPrerequisites,
} from "./assertions";
import {
  ErrorCodes,
  Errors,
  authorizationService,
  invalidateWechatIdentityCheckCache,
  userIdentityService,
  wechatCustomerIdentityService,
  wechatRebindRequestRepository,
  type JwtUserLike,
} from "./shared";

export async function unbindCustomer(user: JwtUserLike) {
  if (!user.sub) {
    throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
  }
  assertWechatUnbindPrerequisites(user);

  if (!user.customer_id || !user.tenant_id) {
    throw Errors.business(403, "当前客户身份无效", ErrorCodes.CUSTOMER_CONTEXT_MISSING);
  }

  const customer = await wechatRebindRequestRepository.findCustomerBinding({
    customerId: user.customer_id,
    tenantId: user.tenant_id,
  });
  if (!customer) {
    throw Errors.business(409, "当前微信绑定关系已变化，请重新登录", ErrorCodes.WECHAT_BINDING_NOT_MATCHED);
  }

  assertHasPhoneRecovery(customer);
  await assertBusinessIdentityBelongsToUser({
    userId: user.sub,
    tenantId: user.tenant_id,
    identityType: "customer",
    identityId: user.customer_id,
  });
  await assertActiveWechatOauth(user);
  await userIdentityService.unbindOauthIdentityBestEffort({
    userId: user.sub,
    platform: "wechat_mini",
    openid: user.openid,
    source: "customer_unbind_wechat",
  });

  wechatCustomerIdentityService.invalidateWechatLoginState({
    authUserId: user.sub,
    openid: user.openid,
  });
  invalidateWechatIdentityCheckCache({
    authUserId: user.sub,
    openid: user.openid,
  });
  authorizationService.invalidateAuthContext({ authUserId: user.sub });
  return { success: true, message: "微信绑定已解除" };
}

export async function unbindEmployee(user: JwtUserLike) {
  if (!user.sub) {
    throw Errors.unauthorized("请先登录", ErrorCodes.UNAUTHORIZED);
  }
  assertWechatUnbindPrerequisites(user);

  if (!user.employee_id || !user.tenant_id) {
    throw Errors.business(403, "当前员工身份无效", ErrorCodes.EMPLOYEE_CONTEXT_MISSING);
  }

  const employee = await wechatRebindRequestRepository.findEmployee(user.employee_id, user.tenant_id);
  if (!employee || employee.user_id !== user.sub) {
    throw Errors.business(409, "当前微信绑定关系已变化，请重新登录", ErrorCodes.WECHAT_BINDING_NOT_MATCHED);
  }

  assertHasPhoneRecovery(employee);
  await assertBusinessIdentityBelongsToUser({
    userId: user.sub,
    tenantId: user.tenant_id,
    identityType: "employee",
    identityId: user.employee_id,
  });
  await assertActiveWechatOauth(user);
  const unboundEmployee = await wechatRebindRequestRepository.unbindEmployee({
    employeeId: user.employee_id,
    tenantId: user.tenant_id,
    authUserId: user.sub,
  });
  if (!unboundEmployee) {
    throw Errors.business(409, "当前微信绑定关系已变化，请重新登录", ErrorCodes.WECHAT_BINDING_NOT_MATCHED);
  }

  await userIdentityService.unbindBusinessMembershipBestEffort({
    userId: user.sub,
    tenantId: user.tenant_id,
    identityType: "employee",
    identityId: user.employee_id,
    source: "employee_unbind_wechat",
  });
  await userIdentityService.unbindOauthIdentityBestEffort({
    userId: user.sub,
    platform: "wechat_mini",
    openid: user.openid,
    source: "employee_unbind_wechat",
  });

  authorizationService.invalidateAuthContext({
    authUserId: user.sub,
    employeeId: user.employee_id,
  });
  wechatCustomerIdentityService.invalidateCustomerTenantOptions(user.sub);
  wechatCustomerIdentityService.invalidateWechatLoginState({
    authUserId: user.sub,
    openid: user.openid,
  });
  return { success: true, message: "微信绑定已解除" };
}
