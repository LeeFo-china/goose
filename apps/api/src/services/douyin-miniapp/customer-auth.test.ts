import { describe, expect, mock, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { DouyinCustomerAuthService } from "./customer-auth";

const douyinUser = {
  sub: "a".repeat(64),
  token_type: "douyin_miniapp" as const,
  login_channel: "douyin" as const,
  tenant_id: "33333333-3333-4333-8333-333333333333",
  douyin_installation_id: "22222222-2222-4222-8222-222222222222",
  douyin_app_id: "tt-authorizer-1",
  subject_hash: "a".repeat(64),
};

const activeCustomer = {
  id: "11111111-1111-4111-8111-111111111111",
  tenant_id: douyinUser.tenant_id,
  user_id: null,
  name: "张三",
  phone: "13800138000",
  tenant: {
    id: douyinUser.tenant_id,
    name: "青禾装饰",
    slug: "qinghe",
    status: "active",
  },
};

describe("DouyinCustomerAuthService", () => {
  test("sendCode requires a Douyin miniapp session and sends login_identity SMS", async () => {
    const sendCode = mock(async () => ({ success: true as const, cooldown_seconds: 60 }));
    const service = makeService({
      smsService: {
        sendCode,
        reserveBypassCode: mock(async () => ({ code: "123456" })),
        findValidPending: mock(async () => null),
        markVerified: mock(async () => undefined),
      },
    });

    await expect(service.sendCode({
      request: { user: douyinUser, id: "req-1", log: testLog() },
      input: { phone: "13800138000" },
      requestIp: "127.0.0.1",
    })).resolves.toEqual({ success: true, cooldown_seconds: 60 });
    expect(sendCode).toHaveBeenCalledWith({
      phone: "13800138000",
      scene: "login_identity",
      requestIp: "127.0.0.1",
      requestDevice: douyinUser.subject_hash,
      requestIpLimit: 5,
    });
  });

  test("authorized Douyin phone authenticates a single customer and signs customer auth", async () => {
    const tokenSigner = mock(() => "customer-auth-token");
    const service = makeService({ tokenSigner });

    const result = await service.authorizePhone({
      request: { user: douyinUser, id: "req-2", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    });

    expect(result).toMatchObject({
      status: "authenticated",
      auth: {
        token: "customer-auth-token",
        mode: "customer",
        roles: ["customer"],
        tenant: { id: douyinUser.tenant_id, name: "青禾装饰" },
        customer: { id: activeCustomer.id, name: "张三", phone: "13800138000" },
        verified_phone: "13800138000",
      },
    });
    expect(tokenSigner).toHaveBeenCalledWith(expect.objectContaining({
      token_type: "auth",
      login_channel: "douyin",
      roles: ["customer"],
      tenant_id: douyinUser.tenant_id,
      customer_id: activeCustomer.id,
      subject_hash: douyinUser.subject_hash,
    }));
  });

  test("rendering phone authorization issues a miniapp session without requiring a customer record", async () => {
    const renderingTokenSigner = mock(() => "rendering-miniapp-token");
    const service = makeService({
      renderingTokenSigner,
      candidateRepository: { ...baseCandidateRepository(), listCustomersByPhone: mock(async () => []) },
    });
    const result = await service.authorizeRenderingPhone({
      request: { user: douyinUser, id: "req-rendering", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    });
    expect(result).toEqual({ access_token: "rendering-miniapp-token", expires_in: 7200 });
    expect(renderingTokenSigner).toHaveBeenCalledWith({
      tenant_id: douyinUser.tenant_id,
      douyin_installation_id: douyinUser.douyin_installation_id,
      douyin_app_id: douyinUser.douyin_app_id,
      subject_hash: douyinUser.subject_hash,
      verified_phone: "13800138000",
    });
  });

  test("rendering SMS verification consumes a valid one-use code before issuing a verified miniapp session", async () => {
    const findValidPending = mock(async () => ({ id: "88888888-8888-4888-8888-888888888888",
      phone: "13800138000", scene: "login_identity" as const, code: "123456",
      status: "pending" as const, expired_at: "2026-09-10T00:05:00.000Z",
      verified_at: null, created_at: "2026-09-10T00:00:00.000Z",
      request_ip: null, request_device: null }));
    const markVerified = mock(async () => undefined);
    const renderingTokenSigner = mock(() => "rendering-miniapp-token");
    const service = makeService({
      smsService: { sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
        reserveBypassCode: mock(async () => ({ code: "123456" })), findValidPending, markVerified },
      renderingTokenSigner,
    });
    const result = await service.verifyRenderingSms({
      request: { user: douyinUser }, input: { phone: "13800138000", code: "123456" },
    });
    expect(findValidPending).toHaveBeenCalledWith({
      phone: "13800138000", code: "123456", scene: "login_identity",
    });
    expect(markVerified).toHaveBeenCalledWith("88888888-8888-4888-8888-888888888888");
    expect(result).toEqual({ access_token: "rendering-miniapp-token", expires_in: 7200 });
    expect(renderingTokenSigner).toHaveBeenCalledWith(expect.objectContaining({
      subject_hash: douyinUser.subject_hash, verified_phone: "13800138000",
    }));
  });

  test("rendering SMS verification never signs a session for an invalid code", async () => {
    const markVerified = mock(async () => undefined);
    const renderingTokenSigner = mock(() => "rendering-miniapp-token");
    const service = makeService({ smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
      reserveBypassCode: mock(async () => ({ code: "123456" })),
      findValidPending: mock(async () => null), markVerified,
    }, renderingTokenSigner });
    await expect(service.verifyRenderingSms({
      request: { user: douyinUser }, input: { phone: "13800138000", code: "000000" },
    })).rejects.toMatchObject({ code: ErrorCodes.SMS_CODE_INVALID });
    expect(markVerified).not.toHaveBeenCalled();
    expect(renderingTokenSigner).not.toHaveBeenCalled();
  });

  test("multiple customer candidates return selection_required without employee candidates", async () => {
    const service = makeService({
      candidateRepository: {
        ...baseCandidateRepository(),
        listCustomersByPhone: mock(async () => [
          activeCustomer,
          {
            ...activeCustomer,
            id: "44444444-4444-4444-8444-444444444444",
            tenant: { ...activeCustomer.tenant, name: "同城装饰" },
          },
        ]),
        listEmployeesByPhone: mock(async () => [{
          id: "emp",
          tenant_id: activeCustomer.tenant_id,
          user_id: null,
          name: "员工",
          phone: "13800138000",
          status: "active",
          tenant: activeCustomer.tenant,
          tenant_department: null,
          post: null,
        }]),
      },
    });

    const result = await service.verifySms({
      request: { user: douyinUser, id: "req-3", log: testLog() },
      input: { phone: "13800138000", code: "123456" },
    });

    expect(result.status).toBe("selection_required");
    if (result.status === "selection_required") {
      expect(result.candidates.every((item) => item.target_mode === "customer")).toBe(true);
    }
  });

  test("authorized phone without a customer returns an authenticated visitor", async () => {
    const createLocalPlatformUser = mock(async () =>
      "77777777-7777-4777-8777-777777777777"
    );
    const syncOauthIdentityBestEffort = mock(async () => undefined);
    const bindCustomerAuthUser = mock(async () => undefined);
    const tokenSigner = mock(() => "customer-auth-token");
    const visitorTokenSigner = mock(() => "douyin-visitor-token");
    const service = makeService({
      authUsers: { createLocalPlatformUser },
      userIdentities: {
        findActiveOauthIdentity: mock(async () => null),
        syncOauthIdentityBestEffort,
        syncBusinessMembershipBestEffort: mock(async () => undefined),
      },
      customerIdentity: {
        getCustomerTenantOptionById: mock(async () => activeCustomer),
        bindCustomerAuthUser,
      },
      candidateRepository: {
        ...baseCandidateRepository(),
        listCustomersByPhone: mock(async () => []),
      },
      tokenSigner,
      visitorTokenSigner,
    });

    await expect(service.authorizePhone({
      request: { user: douyinUser, id: "req-4", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    })).resolves.toMatchObject({
      status: "authenticated",
      auth: {
        token: "douyin-visitor-token",
        user_id: "77777777-7777-4777-8777-777777777777",
        visitor_id: "77777777-7777-4777-8777-777777777777",
        mode: "platform_visitor",
        authMode: "platform_visitor",
        roles: ["visitor"],
        verified_phone: "13800138000",
        phone_masked: "138****8000",
        has_customer_profile: false,
        tenant: null,
        customer: null,
      },
    });
    expect(createLocalPlatformUser).toHaveBeenCalledTimes(1);
    expect(syncOauthIdentityBestEffort).toHaveBeenCalledWith({
      userId: "77777777-7777-4777-8777-777777777777",
      platform: "douyin_mini",
      openid: douyinUser.subject_hash,
      unionid: null,
      source: "douyin_customer_auth",
    });
    expect(visitorTokenSigner).toHaveBeenCalledWith({
      userId: "77777777-7777-4777-8777-777777777777",
      tenantId: douyinUser.tenant_id,
      installationId: douyinUser.douyin_installation_id,
      appId: douyinUser.douyin_app_id,
      subjectHash: douyinUser.subject_hash,
      verifiedPhone: "13800138000",
    });
    expect(tokenSigner).not.toHaveBeenCalled();
    expect(bindCustomerAuthUser).not.toHaveBeenCalled();
  });

  test("SMS login without a customer returns the same authenticated visitor", async () => {
    const visitorTokenSigner = mock(() => "douyin-sms-visitor-token");
    const service = makeService({
      visitorTokenSigner,
      candidateRepository: {
        ...baseCandidateRepository(),
        listCustomersByPhone: mock(async () => []),
      },
    });

    await expect(service.verifySms({
      request: { user: douyinUser, id: "req-5", log: testLog() },
      input: { phone: "13800138000", code: "123456" },
    })).resolves.toMatchObject({
      status: "authenticated",
      auth: {
        token: "douyin-sms-visitor-token",
        mode: "platform_visitor",
        has_customer_profile: false,
        phone_masked: "138****8000",
      },
    });
    expect(visitorTokenSigner).toHaveBeenCalledTimes(1);
  });
});

function testLog() {
  return { info: () => undefined, warn: () => undefined };
}

function makeService(
  overrides: Partial<ConstructorParameters<typeof DouyinCustomerAuthService>[0]> = {},
) {
  return new DouyinCustomerAuthService({
    smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
      reserveBypassCode: mock(async () => ({ code: "123456" })),
      findValidPending: mock(async () => null),
      markVerified: mock(async () => undefined),
    },
    sessionRepository: {
      claimVerification: mock(async () => ({
        status: "claimed" as const,
        sessionId: "99999999-9999-4999-8999-999999999999",
      })),
      beginSelection: mock(async () => "ready" as const),
      reserveSelection: mock(async () => ({
        status: "reserved" as const,
        sessionId: "99999999-9999-4999-8999-999999999999",
        verifiedPhone: "13800138000",
        candidate: {
          id: activeCustomer.id,
          targetMode: "customer" as const,
          tenantId: activeCustomer.tenant_id,
          customerId: activeCustomer.id,
          employeeId: null,
          partnerId: null,
          partnerMemberId: null,
        },
      })),
      finalizeSelection: mock(async () => "consumed" as const),
      releaseSelection: mock(async () => "released" as const),
    },
    candidateRepository: baseCandidateRepository(),
    authUsers: {
      createLocalPlatformUser: mock(async () =>
        "77777777-7777-4777-8777-777777777777"
      ),
    },
    userIdentities: {
      findActiveOauthIdentity: mock(async () => null),
      syncOauthIdentityBestEffort: mock(async () => undefined),
      syncBusinessMembershipBestEffort: mock(async () => undefined),
    },
    customerIdentity: {
      getCustomerTenantOptionById: mock(async () => activeCustomer),
      bindCustomerAuthUser: mock(async () => undefined),
    },
    accessTokens: { getAuthorizerAccessToken: mock(async () => "authorizer-access-token") },
    phoneGateway: { getPhoneNumberInfo: mock(async () => ({ phone: "13800138000" })) },
    douyinPhoneNumberPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    tokenSigner: mock(() => "customer-auth-token"),
    now: () => new Date("2026-09-10T00:00:00.000Z"),
    createSelectionToken: () => "S".repeat(43),
    ...overrides,
  });
}

function baseCandidateRepository() {
  return {
    listCustomersByPhone: mock(async () => [activeCustomer]),
    listEmployeesByPhone: mock(async () => []),
    listPartnerMembersByPhone: mock(async () => []),
    listActiveMembershipKeys: mock(async () => new Set<string>()),
    listActiveOauthUserIds: mock(async () => new Set<string>()),
  };
}
