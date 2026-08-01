import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { PartnerAuthResponse } from "@/services/platform-partner-portal";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type LoginStateFixture = {
  authUserId: string;
  oauthUnionid: string;
  memberships: Array<{ identity_type: string; identity_id: string }>;
  customerOptions: Array<Record<string, unknown>>;
  employeeLoginRows: Array<{ identity_id: string }>;
};

const resolveWechatLoginStateByOpenid = mock(async (): Promise<LoginStateFixture> => ({
  authUserId: "00000000-0000-4000-8000-000000000401",
  oauthUnionid: "wx-unionid",
  memberships: [],
  customerOptions: [],
  employeeLoginRows: [],
}));
const resolveWechatLoginMembershipState = mock(async () => ({
  memberships: [],
  customerOptions: [],
  employeeLoginRows: [],
}));
const partnerAuthResponse: PartnerAuthResponse = {
  mode: "platform_partner",
  authMode: "platform_partner",
  token: "partner-token",
  user_id: "00000000-0000-4000-8000-000000000401",
  roles: ["platform_partner"],
  member: {
    id: "00000000-0000-4000-8000-000000000301",
    partner_id: "00000000-0000-4000-8000-000000000201",
    name: "张三",
    phone: "13800138000",
    role: "owner",
    status: "active",
  },
  partner: {
    id: "00000000-0000-4000-8000-000000000201",
    name: "信阳城市合伙人",
    status: "active",
    region_codes: ["411500"],
    level: { code: "city_partner", name: "城市合伙人" },
  },
  level: {
    id: "00000000-0000-4000-8000-000000000101",
    code: "city_partner",
    name: "城市合伙人",
    status: "active",
  },
};
const loginResolvedAuthUser = mock(
  async (): Promise<PartnerAuthResponse | null> => partnerAuthResponse,
);
const logInfo = mock(() => undefined);
const logWarn = mock(() => undefined);
const logError = mock(() => undefined);
const rotateForLogin = mock(async () => ({
  credentialId: "00000000-0000-4000-8000-000000000501",
  oauthIdentityId: "00000000-0000-4000-8000-000000000601",
  sessionRevision: 1,
  status: "active" as const,
  obtainedAt: "2026-07-31T13:10:00.000Z",
}));

mock.module("@/services/wechat-customer-identities", () => ({
  wechatCustomerIdentityService: {
    resolveWechatLoginStateByOpenid,
    resolveWechatLoginMembershipState,
  },
}));

mock.module("@/services/platform-partner-portal", () => ({
  platformPartnerPortalService: {
    loginResolvedAuthUser,
  },
}));

mock.module("@/services/wechat-mini-session-credentials", () => ({
  wechatMiniSessionCredentialService: {
    rotateForLogin,
  },
}));

function createRequest(): FastifyRequest {
  const log = { info: logInfo, warn: logWarn, error: logError };
  return { id: "test-request", body: { code: "wx-code" }, log } as unknown as FastifyRequest;
}

function createContext() {
  return {
    prewarmVisitorHomeData: mock(() => undefined),
    getWeChatSession: mock(async () => ({
      openid: "wx-openid",
      unionid: "wx-unionid",
      session_key: "wx-session-key",
    })),
    getOrCreateAuthUser: mock(async () => ({
      kind: "auth_user",
      userId: "00000000-0000-4000-8000-000000000401",
      isNewUser: false,
    })),
    runAuthBackgroundTask: mock(() => undefined),
    setCachedVisitorOnlyAuthUser: mock(() => undefined),
    clearVisitorOnlyAuthUserCache: mock(() => undefined),
    buildEmployeeLoginContextFromMembership: mock(async () => ({
      token: "employee-token",
      tenant: { id: "tenant-1", name: "测试租户" },
      employee: { id: "employee-1", name: "测试员工" },
    })),
    prewarmEmployeeAuthContext: mock(() => undefined),
    signCustomerSession: mock(async () => ({
      mode: "customer",
      token: "customer-token",
      user_id: "00000000-0000-4000-8000-000000000401",
      roles: ["customer"],
    })),
    createAuthUserVisitorResponse: mock(() => ({
      mode: "platform_visitor",
      authMode: "platform_visitor",
      token: "visitor-token",
      user_id: null,
      roles: ["visitor"],
    })),
  };
}

describe("wechat /auth platform partner login", () => {
  beforeEach(() => {
    resolveWechatLoginStateByOpenid.mockClear();
    resolveWechatLoginMembershipState.mockClear();
    loginResolvedAuthUser.mockClear();
    logInfo.mockClear();
    logWarn.mockClear();
    logError.mockClear();
    rotateForLogin.mockClear();
  });

  test("returns platform_partner when current WeChat is bound to an active partner member", async () => {
    const { getOpenId } = await import("./login");
    const context = createContext();

    const response = await getOpenId.call(context, createRequest(), {} as never);

    expect(loginResolvedAuthUser).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000401",
      openid: "wx-openid",
      unionid: "wx-unionid",
    });
    expect(response).toEqual({
      data: {
        mode: "platform_partner",
        authMode: "platform_partner",
        token: "partner-token",
        user_id: "00000000-0000-4000-8000-000000000401",
        roles: ["platform_partner"],
        member: {
          id: "00000000-0000-4000-8000-000000000301",
          partner_id: "00000000-0000-4000-8000-000000000201",
          name: "张三",
          phone: "13800138000",
          role: "owner",
          status: "active",
        },
        partner: {
          id: "00000000-0000-4000-8000-000000000201",
          name: "信阳城市合伙人",
          status: "active",
          region_codes: ["411500"],
          level: { code: "city_partner", name: "城市合伙人" },
        },
        level: {
          id: "00000000-0000-4000-8000-000000000101",
          code: "city_partner",
          name: "城市合伙人",
          status: "active",
        },
      },
      message: "登录成功",
    });
    expect(context.createAuthUserVisitorResponse).not.toHaveBeenCalled();
    expect(rotateForLogin).toHaveBeenCalledWith({
      userId: "00000000-0000-4000-8000-000000000401",
      openid: "wx-openid",
      sessionKey: "wx-session-key",
    });
    expect(JSON.stringify(response)).not.toContain("wx-session-key");
    const serializedLogArguments = JSON.stringify([
      logInfo.mock.calls,
      logWarn.mock.calls,
      logError.mock.calls,
    ]);
    expect(serializedLogArguments).not.toContain("session_key");
    expect(serializedLogArguments).not.toContain("wx-session-key");
  });

  test("keeps visitor response when current WeChat is not bound to a partner member", async () => {
    loginResolvedAuthUser.mockImplementationOnce(async () => null);
    const { getOpenId } = await import("./login");
    const context = createContext();

    const response = await getOpenId.call(context, createRequest(), {} as never);

    expect(response).toEqual({
      data: {
        mode: "platform_visitor",
        authMode: "platform_visitor",
        token: "visitor-token",
        user_id: null,
        roles: ["visitor"],
      },
      message: "登录成功",
    });
    expect(rotateForLogin).not.toHaveBeenCalled();
  });

  test("does not swallow synchronous credential persistence failures", async () => {
    const persistenceError = new Error("credential persistence failed");
    rotateForLogin.mockRejectedValueOnce(persistenceError);
    const { getOpenId } = await import("./login");

    await expect(
      getOpenId.call(createContext(), createRequest(), {} as never),
    ).rejects.toBe(persistenceError);
  });

  test("persists the credential before returning an employee login", async () => {
    resolveWechatLoginStateByOpenid.mockImplementationOnce(async () => ({
      authUserId: "00000000-0000-4000-8000-000000000401",
      oauthUnionid: "wx-unionid",
      memberships: [{
        identity_type: "employee",
        identity_id: "employee-1",
      }],
      customerOptions: [],
      employeeLoginRows: [{ identity_id: "employee-1" }],
    }));
    loginResolvedAuthUser.mockImplementationOnce(async () => null);
    const { getOpenId } = await import("./login");

    const response = await getOpenId.call(
      createContext(),
      createRequest(),
      {} as never,
    );

    expect(response.data).toMatchObject({
      mode: "employee",
      token: "employee-token",
    });
    expect(rotateForLogin).toHaveBeenCalledTimes(1);
  });

  test("persists the credential before returning a customer login", async () => {
    resolveWechatLoginStateByOpenid.mockImplementationOnce(async () => ({
      authUserId: "00000000-0000-4000-8000-000000000401",
      oauthUnionid: "wx-unionid",
      memberships: [{
        identity_type: "customer",
        identity_id: "customer-1",
      }],
      customerOptions: [{ id: "customer-1" }],
      employeeLoginRows: [],
    }));
    loginResolvedAuthUser.mockImplementationOnce(async () => null);
    const { getOpenId } = await import("./login");

    const response = await getOpenId.call(
      createContext(),
      createRequest(),
      {} as never,
    );

    expect(response.data).toMatchObject({
      mode: "customer",
      token: "customer-token",
    });
    expect(rotateForLogin).toHaveBeenCalledTimes(1);
  });
});
