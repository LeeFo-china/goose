import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import type { ClaimVerificationResult } from "@/repositories/phone-identity-login";
import {
  PhoneIdentityLoginService,
  type RequestLike,
  type PhoneIdentityLoginServiceDependencies,
} from "./service";

const PHONE = "13800138000";
const OPENID = "mini-openid";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000010";
const SHARE_LINK_ID = "00000000-0000-4000-8000-000000000011";
const TENANT_ID = "00000000-0000-4000-8000-000000000012";
const DEV_BYPASS_CODE = "000000";

describe("PhoneIdentityLoginService development SMS bypass", () => {
  test("verify requires an SMS code when development bypass is disabled", async () => {
    const deps = dependencies();

    await withPhoneLoginWithoutCode("false", async () => {
      await expect(new PhoneIdentityLoginService(deps).verify({
        input: { phone: PHONE },
        request: request(),
      })).rejects.toMatchObject({
        statusCode: 400,
        code: ErrorCodes.SMS_CODE_REQUIRED,
      });
    });

    expect(deps.smsService.reserveBypassCode).not.toHaveBeenCalled();
    expect(deps.sessionRepository.claimVerification).not.toHaveBeenCalled();
  });

  test("verify creates a development bypass SMS record before claiming the session", async () => {
    const deps = dependencies();

    await withPhoneLoginWithoutCode("true", async () => {
      const result = await new PhoneIdentityLoginService(deps).verify({
        input: { phone: PHONE },
        request: request(),
      });

      expect(result).toMatchObject({
        status: "visitor_verified",
        auth: {
          verified_phone: PHONE,
        },
      });
    });

    expect(deps.smsService.reserveBypassCode).toHaveBeenCalledWith({
      phone: PHONE,
      scene: "login_identity",
      now: "2026-07-15T00:00:00.000Z",
    });
    expect(deps.sessionRepository.claimVerification).toHaveBeenCalledWith({
      phone: PHONE,
      code: DEV_BYPASS_CODE,
      authUserId: AUTH_USER_ID,
      openidHash: sha256(OPENID),
      now: "2026-07-15T00:00:00.000Z",
      expiresAt: "2026-07-15T00:05:00.000Z",
    });
  });
});

function dependencies(overrides: Partial<{
  claimVerification: () => Promise<ClaimVerificationResult>;
}> = {}): PhoneIdentityLoginServiceDependencies {
  return {
    smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
      reserveBypassCode: mock(async () => ({ code: DEV_BYPASS_CODE })),
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
      listCustomersByPhone: mock(async () => []),
      listEmployeesByPhone: mock(async () => []),
      listPartnerMembersByPhone: mock(async () => []),
      listActiveMembershipKeys: mock(async () => new Set<string>()),
      listActiveWechatOauthUserIds: mock(async () => new Set<string>()),
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
      authenticate: mock(async () => ({ mode: "customer", authMode: "customer" })),
      buildCurrentAuth: mock(async () => ({ mode: "customer", authMode: "customer" })),
    },
    resolveAuthUserId: mock(async () => AUTH_USER_ID),
    now: () => new Date("2026-07-15T00:00:00.000Z"),
    createSelectionToken: () => "selection-token-abcdefghijklmnopqrstuvwxyz1234567890",
    visitorSigner: mock((input) => ({
      token: "visitor-token",
      visitorId: `wechat_visitor_${sha256(input.openid).slice(0, 8)}`,
    })),
  };
}

async function withPhoneLoginWithoutCode<T>(
  value: string,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
  process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE;
    } else {
      process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = previous;
    }
  }
}

function request(): RequestLike {
  return {
    id: "request-1",
    user: {
      sub: AUTH_USER_ID,
      openid: OPENID,
      unionid: null,
      token_type: "visitor_session" as const,
    },
    log: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
