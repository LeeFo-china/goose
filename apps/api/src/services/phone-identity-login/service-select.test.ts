import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  PhoneIdentityLoginService,
  type PhoneIdentityLoginServiceDependencies,
} from "./service";

const PHONE = "13800138000";
const OPENID = "mini-openid";
const AUTH_USER_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000010";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000011";
const TENANT_ID = "00000000-0000-4000-8000-000000000003";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000004";
const SELECTION_TOKEN = "selection-token-abcdefghijklmnopqrstuvwxyz1234567890";

describe("PhoneIdentityLoginService.select", () => {
  test("reserves a selected candidate, authenticates, and finalizes the session", async () => {
    const deps = dependencies();

    await expect(new PhoneIdentityLoginService(deps).select({
      input: { selection_token: SELECTION_TOKEN, candidate_id: CANDIDATE_ID },
      request: request(),
    })).resolves.toEqual({
      status: "authenticated",
      auth: { mode: "customer", authMode: "customer" },
    });

    expect(deps.sessionRepository.reserveSelection).toHaveBeenCalledWith({
      selectionTokenHash: sha256(SELECTION_TOKEN),
      candidateId: CANDIDATE_ID,
      authUserId: AUTH_USER_ID,
      openidHash: sha256(OPENID),
      now: "2026-07-15T00:00:00.000Z",
    });
    expect(deps.bindings.authenticate).toHaveBeenCalledWith({
      targetMode: "customer",
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      employeeId: null,
      partnerMemberId: null,
      authUserId: AUTH_USER_ID,
      openid: OPENID,
      phone: PHONE,
    });
    expect(deps.sessionRepository.finalizeSelection).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
      now: "2026-07-15T00:00:00.000Z",
    });
    expect(deps.sessionRepository.releaseSelection).not.toHaveBeenCalled();
  });

  test("maps terminal reserve statuses to stable errors", async () => {
    const cases = [
      ["expired", 410, ErrorCodes.IDENTITY_SELECTION_EXPIRED],
      ["selection_consumed", 409, ErrorCodes.IDENTITY_SELECTION_CONSUMED],
      ["in_progress", 409, ErrorCodes.IDENTITY_SELECTION_IN_PROGRESS],
      ["option_unavailable", 409, ErrorCodes.IDENTITY_OPTION_UNAVAILABLE],
      ["session_not_found", 401, ErrorCodes.AUTH_SESSION_REQUIRED],
    ] as const;

    for (const [status, statusCode, code] of cases) {
      const deps = dependencies({
        reserveSelection: mock(async () => ({
          status,
          sessionId: status === "session_not_found" ? null : SESSION_ID,
        })),
      });

      await expect(new PhoneIdentityLoginService(deps).select({
        input: { selection_token: SELECTION_TOKEN, candidate_id: CANDIDATE_ID },
        request: request(),
      })).rejects.toMatchObject({ statusCode, code });
      expect(deps.bindings.authenticate).not.toHaveBeenCalled();
    }
  });

  test("releases a reserved selection when binding fails", async () => {
    const deps = dependencies({
      authenticate: mock(async () => {
        throw Errors.business(
          409,
          "该客户档案已绑定其他账号",
          ErrorCodes.WECHAT_ALREADY_BOUND,
        );
      }),
    });

    await expect(new PhoneIdentityLoginService(deps).select({
      input: { selection_token: SELECTION_TOKEN, candidate_id: CANDIDATE_ID },
      request: request(),
    })).rejects.toMatchObject({ code: ErrorCodes.WECHAT_ALREADY_BOUND });
    expect(deps.sessionRepository.releaseSelection).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      candidateId: CANDIDATE_ID,
      now: "2026-07-15T00:00:00.000Z",
    });
  });

  test("same consumed candidate is idempotent without finalizing again", async () => {
    const deps = dependencies({
      reserveSelection: mock(async () => reserveResult("same_candidate_consumed")),
    });

    await expect(new PhoneIdentityLoginService(deps).select({
      input: { selection_token: SELECTION_TOKEN, candidate_id: CANDIDATE_ID },
      request: request(),
    })).resolves.toMatchObject({ status: "authenticated" });
    expect(deps.sessionRepository.finalizeSelection).not.toHaveBeenCalled();
    expect(deps.sessionRepository.releaseSelection).not.toHaveBeenCalled();
  });

  test("safe logs exclude selection token, phone, and openid", async () => {
    const info = mock(() => undefined);
    await new PhoneIdentityLoginService(dependencies()).select({
      input: { selection_token: SELECTION_TOKEN, candidate_id: CANDIDATE_ID },
      request: request({ log: { info, warn: mock(() => undefined) } }),
    });

    const serializedLogs = JSON.stringify(info.mock.calls);
    expect(serializedLogs).not.toContain(SELECTION_TOKEN);
    expect(serializedLogs).not.toContain(PHONE);
    expect(serializedLogs).not.toContain(OPENID);
    expect(serializedLogs).toContain(CANDIDATE_ID);
  });
});

function dependencies(overrides: Partial<{
  reserveSelection: PhoneIdentityLoginServiceDependencies["sessionRepository"]["reserveSelection"];
  authenticate: (input: unknown) => Promise<Record<string, unknown>>;
}> = {}): PhoneIdentityLoginServiceDependencies {
  return {
    smsService: {
      sendCode: mock(async () => ({ success: true as const, cooldown_seconds: 60 })),
    },
    sessionRepository: {
      claimVerification: mock(async () => ({
        status: "claimed" as const,
        sessionId: SESSION_ID,
      })),
      beginSelection: mock(async () => "ready" as const),
      reserveSelection: overrides.reserveSelection ??
        mock(async () => reserveResult("reserved")),
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
        shareLinkId: "00000000-0000-4000-8000-000000000002",
        tenantId: TENANT_ID,
      })),
    },
    bindings: {
      authenticate: overrides.authenticate ??
        mock(async () => ({ mode: "customer", authMode: "customer" })),
      buildCurrentAuth: mock(async () => ({ mode: "customer", authMode: "customer" })),
    },
    resolveAuthUserId: mock(async () => AUTH_USER_ID),
    now: () => new Date("2026-07-15T00:00:00.000Z"),
    createSelectionToken: () => SELECTION_TOKEN,
    visitorSigner: mock(() => ({
      token: "visitor-token",
      visitorId: "wechat_visitor_hash",
    })),
  };
}

function reserveResult(
  status: "reserved" | "same_candidate_in_progress" | "same_candidate_consumed",
) {
  return {
    status,
    sessionId: SESSION_ID,
    verifiedPhone: PHONE,
    candidate: {
      id: CANDIDATE_ID,
      targetMode: "customer" as const,
      tenantId: TENANT_ID,
      customerId: CUSTOMER_ID,
      employeeId: null,
      partnerId: null,
      partnerMemberId: null,
    },
  };
}

function request(overrides: Partial<{
  log: { info: ReturnType<typeof mock>; warn: ReturnType<typeof mock> };
}> = {}) {
  return {
    id: "request-1",
    user: {
      sub: AUTH_USER_ID,
      openid: OPENID,
      unionid: null,
      token_type: "visitor_session" as const,
    },
    log: overrides.log ?? {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
