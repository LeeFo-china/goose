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

  test("zero customer match does not create a customer profile", async () => {
    const createLocalPlatformUser = mock(async () =>
      "77777777-7777-4777-8777-777777777777"
    );
    const service = makeService({
      authUsers: { createLocalPlatformUser },
      candidateRepository: {
        ...baseCandidateRepository(),
        listCustomersByPhone: mock(async () => []),
      },
    });

    await expect(service.authorizePhone({
      request: { user: douyinUser, id: "req-4", log: testLog() },
      input: { douyin_phone_code: "official-phone-code" },
    })).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCodes.CUSTOMER_CONTEXT_MISSING,
    });
    expect(createLocalPlatformUser).not.toHaveBeenCalled();
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
