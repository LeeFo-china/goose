import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type {
  PhoneCustomerRecord,
  PhoneEmployeeRecord,
} from "@/repositories/phone-identity-candidates";
import type { ClaimVerificationResult } from "@/repositories/phone-identity-login";
import type { PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal-types";
import {
  PhoneIdentityLoginService,
  type PhoneIdentityLoginServiceDependencies,
} from "./service";

const PHONE = "13800138000";
const CODE = "123456";
const OPENID = "mini-openid";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000010";
const SHARE_LINK_ID = "00000000-0000-4000-8000-000000000002";
const TENANT_ID = "00000000-0000-4000-8000-000000000003";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000005";
const PARTNER_MEMBER_ID = "00000000-0000-4000-8000-000000000006";
const SELECTION_TOKEN = "selection-token-abcdefghijklmnopqrstuvwxyz1234567890";

describe("PhoneIdentityLoginService", () => {
  test("sendCode uses login_identity scene and does not discover identities", async () => {
    const deps = dependencies();
    const service = new PhoneIdentityLoginService(deps);

    await expect(service.sendCode({
      input: { phone: PHONE },
      request: request(),
      requestIp: "127.0.0.1",
      requestDevice: "iPhone",
    })).resolves.toEqual({ success: true, cooldown_seconds: 60 });

    expect(deps.smsService.sendCode).toHaveBeenCalledWith({
      phone: PHONE,
      scene: "login_identity",
      requestIp: "127.0.0.1",
      requestDevice: "iPhone",
    });
    expect(deps.candidateRepository.listCustomersByPhone).not.toHaveBeenCalled();
  });

  test("verify rejects missing mini-program actor before claiming SMS", async () => {
    const deps = dependencies();
    const service = new PhoneIdentityLoginService(deps);

    await expect(service.verify({
      input: { phone: PHONE, code: CODE },
      request: request({ user: undefined }),
    })).rejects.toMatchObject({
      statusCode: 401,
      code: ErrorCodes.AUTH_SESSION_REQUIRED,
    });
    expect(deps.sessionRepository.claimVerification).not.toHaveBeenCalled();
  });

  test("verify maps invalid and expired SMS claim statuses", async () => {
    const invalidDeps = dependencies({
      claimVerification: mock(async () => ({ status: "sms_invalid" as const, sessionId: null })),
    });
    await expect(new PhoneIdentityLoginService(invalidDeps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    })).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCodes.SMS_CODE_INVALID,
    });

    const expiredDeps = dependencies({
      claimVerification: mock(async () => ({ status: "sms_expired" as const, sessionId: null })),
    });
    await expect(new PhoneIdentityLoginService(expiredDeps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    })).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCodes.SMS_CODE_EXPIRED,
    });
  });

  test("zero identities returns a verified visitor without binding or customer creation", async () => {
    const deps = dependencies({
      visitorSigner: mock(() => ({
        token: "visitor-token",
        visitorId: "wechat_visitor_hash",
      })),
    });
    const service = new PhoneIdentityLoginService(deps);

    const result = await service.verify({
      input: { phone: PHONE, code: CODE, share_token: "share-token" },
      request: request({ user: { openid: OPENID, token_type: "visitor_session" } }),
    });

    expect(result).toEqual({
      status: "visitor_verified",
      next_action: "submit_platform_lead",
      auth: {
        token: "visitor-token",
        user_id: null,
        visitor_id: "wechat_visitor_hash",
        roles: ["visitor"],
        mode: "platform_visitor",
        authMode: "platform_visitor",
        phone: PHONE,
        verified_phone: PHONE,
        has_customer_profile: false,
        tenant: null,
        customer: null,
        employee: null,
        partner: null,
      },
    });
    expect(deps.resolveAuthUserId).toHaveBeenCalled();
    expect(deps.bindings.authenticate).not.toHaveBeenCalled();
    expect(deps.visitorSigner).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      unionid: null,
      verifiedPhone: PHONE,
      shareLinkId: SHARE_LINK_ID,
    });
  });

  test("raw matches with no usable candidates return account unavailable", async () => {
    const deps = dependencies({
      customers: [customer({ tenant: tenant({ status: "disabled" }) })],
    });

    await expect(new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    })).rejects.toMatchObject({
      statusCode: 403,
      code: ErrorCodes.IDENTITY_ACCOUNT_UNAVAILABLE,
    });
  });

  test("one current candidate signs current auth without binding mutation", async () => {
    const deps = dependencies({
      customers: [customer({ user_id: AUTH_USER_ID })],
      buildCurrentAuth: mock(async () => ({ mode: "customer", authMode: "customer" })),
    });
    const result = await new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    });

    expect(result).toEqual({
      status: "authenticated",
      auth: { mode: "customer", authMode: "customer" },
    });
    expect(deps.bindings.buildCurrentAuth).toHaveBeenCalledWith(expect.objectContaining({
      targetMode: "customer",
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      employeeId: null,
      partnerMemberId: null,
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      phone: PHONE,
    }));
    expect(deps.bindings.authenticate).not.toHaveBeenCalled();
  });

  test("one bindable candidate authenticates directly", async () => {
    const deps = dependencies({
      employees: [employee({ user_id: null })],
      authenticate: mock(async () => ({
        mode: "tenant_employee",
        authMode: "tenant_employee",
      })),
    });

    await expect(new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    })).resolves.toMatchObject({
      status: "authenticated",
      auth: { mode: "tenant_employee" },
    });
    expect(deps.bindings.authenticate).toHaveBeenCalledWith(expect.objectContaining({
      targetMode: "tenant_employee",
      employeeId: EMPLOYEE_ID,
    }));
  });

  test("one rebind candidate propagates existing stable rebind error", async () => {
    const deps = dependencies({
      partnerMembers: [partnerMember({ auth_user_id: "other-user" })],
      activeWechatOauthUserIds: new Set(["other-user"]),
      authenticate: mock(async () => {
        throw Errors.business(
          409,
          "该合伙人成员已绑定其他微信",
          "PARTNER_MEMBER_ALREADY_BOUND",
        );
      }),
    });

    await expect(new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE },
      request: request(),
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PARTNER_MEMBER_ALREADY_BOUND",
    });
  });

  test("multiple candidates persist selection and return public candidate data", async () => {
    const deps = dependencies({
      customers: [customer()],
      employees: [employee()],
    });
    const result = await new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE, share_token: "share-token" },
      request: request(),
    });

    expect(result).toMatchObject({
      status: "selection_required",
      selection_token: SELECTION_TOKEN,
      expires_in: 300,
      phone_masked: "138****8000",
      candidates: [
        {
          target_mode: "customer",
          role_label: "客户",
          binding_state: "bindable",
        },
        {
          target_mode: "tenant_employee",
          role_label: "员工",
          binding_state: "bindable",
        },
      ],
    });
    expect(deps.sessionRepository.beginSelection).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      authUserId: AUTH_USER_ID,
      openidHash: sha256(OPENID),
      selectionTokenHash: sha256(SELECTION_TOKEN),
      shareContext: {
        share_link_id: SHARE_LINK_ID,
        tenant_id: TENANT_ID,
        share_employee_id: null,
        source: "employee_share",
      },
      candidates: expect.arrayContaining([
        expect.objectContaining({
          target_mode: "customer",
          tenant_id: TENANT_ID,
          customer_id: CUSTOMER_ID,
        }),
      ]),
      now: "2026-07-15T00:00:00.000Z",
    });
  });

  test("share context sorts matching tenant first", async () => {
    const deps = dependencies({
      customers: [
        customer({
          id: "00000000-0000-4000-8000-000000000111",
          tenant_id: "00000000-0000-4000-8000-000000000111",
          tenant: tenant({
            id: "00000000-0000-4000-8000-000000000111",
            name: "A装饰",
          }),
        }),
        customer({ tenant: tenant({ name: "Z装饰" }) }),
      ],
    });

    const result = await new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE, share_token: "share-token" },
      request: request(),
    });

    expect(result.status).toBe("selection_required");
    if (result.status !== "selection_required") return;
    expect(result.candidates[0]).toMatchObject({
      target_mode: "customer",
      title: "Z装饰",
    });
    expect(deps.bindings.authenticate).not.toHaveBeenCalled();
  });

  test("safe logs exclude phone, code, openid, and raw selection token", async () => {
    const info = mock(() => undefined);
    const deps = dependencies({ customers: [customer()], employees: [employee()] });
    await new PhoneIdentityLoginService(deps).verify({
      input: { phone: PHONE, code: CODE },
      request: request({ log: { info, warn: mock(() => undefined) } }),
    });

    const serializedLogs = JSON.stringify(info.mock.calls);
    expect(serializedLogs).not.toContain(PHONE);
    expect(serializedLogs).not.toContain(CODE);
    expect(serializedLogs).not.toContain(OPENID);
    expect(serializedLogs).not.toContain(SELECTION_TOKEN);
    expect(serializedLogs).toContain(SESSION_ID);
  });
});

function dependencies(overrides: Partial<{
  claimVerification: () => Promise<ClaimVerificationResult>;
  customers: PhoneCustomerRecord[];
  employees: PhoneEmployeeRecord[];
  partnerMembers: PlatformPartnerMemberRecord[];
  activeMembershipKeys: Set<string>;
  activeWechatOauthUserIds: Set<string>;
  authenticate: (input: unknown) => Promise<Record<string, unknown>>;
  buildCurrentAuth: (input: unknown) => Promise<Record<string, unknown>>;
  visitorSigner: PhoneIdentityLoginServiceDependencies["visitorSigner"];
}> = {}): PhoneIdentityLoginServiceDependencies {
  return {
    smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
    },
    sessionRepository: {
      claimVerification: overrides.claimVerification ??
        mock(async () => ({ status: "claimed" as const, sessionId: SESSION_ID })),
      beginSelection: mock(async () => "ready" as const),
      reserveSelection: mock(async () => ({
        status: "session_not_found" as const,
        sessionId: null,
      })),
      finalizeSelection: mock(async () => "consumed" as const),
      releaseSelection: mock(async () => "released" as const),
    },
    candidateRepository: {
      listCustomersByPhone: mock(async () => overrides.customers ?? []),
      listEmployeesByPhone: mock(async () => overrides.employees ?? []),
      listPartnerMembersByPhone: mock(async () => overrides.partnerMembers ?? []),
      listActiveMembershipKeys: mock(async () =>
        overrides.activeMembershipKeys ?? new Set<string>()
      ),
      listActiveWechatOauthUserIds: mock(async () =>
        overrides.activeWechatOauthUserIds ?? new Set<string>()
      ),
    },
    tenantShareLinks: {
      resolveLoginContext: mock(async () => ({
        shareLinkId: SHARE_LINK_ID,
        tenantId: TENANT_ID,
        shareEmployeeId: null,
        source: "employee_share",
      })),
    },
    bindings: {
      authenticate: overrides.authenticate ??
        mock(async () => ({ mode: "customer", authMode: "customer" })),
      buildCurrentAuth: overrides.buildCurrentAuth ??
        mock(async () => ({ mode: "customer", authMode: "customer" })),
    },
    resolveAuthUserId: mock(async () => AUTH_USER_ID),
    now: () => new Date("2026-07-15T00:00:00.000Z"),
    createSelectionToken: () => SELECTION_TOKEN,
    visitorSigner: overrides.visitorSigner ??
      mock(() => ({ token: "visitor-token", visitorId: "wechat_visitor_hash" })),
  };
}

function request(overrides: Partial<{
  user: Record<string, unknown> | undefined;
  log: { info: ReturnType<typeof mock>; warn: ReturnType<typeof mock> };
}> = {}) {
  return {
    id: "request-1",
    user: "user" in overrides ? overrides.user : {
      sub: AUTH_USER_ID,
      openid: OPENID,
      unionid: null,
      token_type: "visitor_session",
    },
    log: overrides.log ?? {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
  };
}

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: "某某装饰",
    status: "active",
    ...overrides,
  };
}

function customer(overrides: Partial<PhoneCustomerRecord> = {}): PhoneCustomerRecord {
  return {
    id: CUSTOMER_ID,
    tenant_id: TENANT_ID,
    user_id: null,
    name: "李四",
    phone: PHONE,
    tenant: tenant(),
    ...overrides,
  };
}

function employee(overrides: Partial<PhoneEmployeeRecord> = {}): PhoneEmployeeRecord {
  return {
    id: EMPLOYEE_ID,
    tenant_id: TENANT_ID,
    user_id: null,
    name: "王五",
    phone: PHONE,
    status: "active",
    tenant: tenant(),
    tenant_department: { alias_name: "工程部", code: "engineering" },
    post: { name: "项目经理", code: "pm" },
    ...overrides,
  };
}

function partnerMember(
  overrides: Partial<PlatformPartnerMemberRecord> = {},
): PlatformPartnerMemberRecord {
  return {
    id: PARTNER_MEMBER_ID,
    partner_id: "00000000-0000-4000-8000-000000000007",
    auth_user_id: null,
    name: "张三",
    phone: PHONE,
    role: "owner",
    status: "active",
    partner: {
      id: "00000000-0000-4000-8000-000000000007",
      name: "城市合伙人",
      status: "active",
      region_codes: [],
    },
    ...overrides,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
