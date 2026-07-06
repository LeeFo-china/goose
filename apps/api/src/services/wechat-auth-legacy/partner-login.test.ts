import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { PartnerAuthResponse } from "@/services/platform-partner-portal";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const resolveWechatLoginStateByOpenid = mock(async () => ({
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

function createRequest(): FastifyRequest {
  const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { id: "test-request", body: { code: "wx-code" }, log } as unknown as FastifyRequest;
}

function createContext() {
  return {
    prewarmVisitorHomeData: mock(() => undefined),
    getWeChatSession: mock(async () => ({ openid: "wx-openid", unionid: "wx-unionid" })),
    getOrCreateAuthUser: mock(async () => ({
      kind: "auth_user",
      userId: "00000000-0000-4000-8000-000000000401",
      isNewUser: false,
    })),
    runAuthBackgroundTask: mock(() => undefined),
    setCachedVisitorOnlyAuthUser: mock(() => undefined),
    clearVisitorOnlyAuthUserCache: mock(() => undefined),
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
  });
});
