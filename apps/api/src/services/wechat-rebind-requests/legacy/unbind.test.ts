import { beforeEach, describe, expect, mock, test } from "bun:test";

const user = {
  sub: "00000000-0000-4000-8000-000000000401",
  openid: "wx-customer-openid",
  tenant_id: "00000000-0000-4000-8000-000000000201",
  customer_id: "00000000-0000-4000-8000-000000000301",
};

const assertWechatUnbindPrerequisites = mock(() => undefined);
const assertHasPhoneRecovery = mock(() => undefined);
const assertBusinessIdentityBelongsToUser = mock(async () => undefined);
const assertActiveWechatOauth = mock(async () => undefined);
const findCustomerBinding = mock(async () => ({
  id: user.customer_id,
  tenant_id: user.tenant_id,
  name: "测试客户",
  phone: "13800138000",
  user_id: user.sub,
}));
const unbindOauthIdentityBestEffort = mock(async () => undefined);
const invalidateAuthContext = mock(() => undefined);
const invalidateWechatLoginState = mock(() => undefined);
const invalidateWechatIdentityCheckCache = mock(() => undefined);

mock.module("./assertions", () => ({
  assertWechatUnbindPrerequisites,
  assertHasPhoneRecovery,
  assertBusinessIdentityBelongsToUser,
  assertActiveWechatOauth,
}));

mock.module("./shared", () => ({
  ErrorCodes: {
    UNAUTHORIZED: "UNAUTHORIZED",
    CUSTOMER_CONTEXT_MISSING: "CUSTOMER_CONTEXT_MISSING",
    WECHAT_BINDING_NOT_MATCHED: "WECHAT_BINDING_NOT_MATCHED",
  },
  Errors: {
    unauthorized: (message: string, code: string) =>
      Object.assign(new Error(message), { code }),
    business: (_statusCode: number, message: string, code: string) =>
      Object.assign(new Error(message), { code }),
  },
  authorizationService: {
    invalidateAuthContext,
  },
  userIdentityService: {
    unbindOauthIdentityBestEffort,
  },
  wechatCustomerIdentityService: {
    invalidateWechatLoginState,
  },
  invalidateWechatIdentityCheckCache,
  wechatRebindRequestRepository: {
    findCustomerBinding,
  },
}));

describe("customer WeChat unbind", () => {
  beforeEach(() => {
    assertWechatUnbindPrerequisites.mockClear();
    assertHasPhoneRecovery.mockClear();
    assertBusinessIdentityBelongsToUser.mockClear();
    assertActiveWechatOauth.mockClear();
    findCustomerBinding.mockClear();
    unbindOauthIdentityBestEffort.mockClear();
    invalidateAuthContext.mockClear();
    invalidateWechatLoginState.mockClear();
    invalidateWechatIdentityCheckCache.mockClear();
  });

  test("invalidates login and token caches after OAuth unbind", async () => {
    const { unbindCustomer } = await import("./unbind");

    const result = await unbindCustomer(user);

    expect(result).toEqual({
      success: true,
      message: "微信绑定已解除",
    });
    expect(unbindOauthIdentityBestEffort).toHaveBeenCalledWith({
      userId: user.sub,
      platform: "wechat_mini",
      openid: user.openid,
      source: "customer_unbind_wechat",
    });
    expect(invalidateWechatLoginState).toHaveBeenCalledWith({
      authUserId: user.sub,
      openid: user.openid,
    });
    expect(invalidateWechatIdentityCheckCache).toHaveBeenCalledWith({
      authUserId: user.sub,
      openid: user.openid,
    });
  });
});
