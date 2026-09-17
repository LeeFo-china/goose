import { describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type { PlatformWechatAccountRecord } from "@/repositories/platform-auth";
import type { UserOAuthIdentityRecord } from "@/repositories/user-identities";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const OAUTH_ID = "33333333-3333-4333-8333-333333333333";
const OPENID = "wx-platform-admin-openid";

async function createService(overrides: {
  employee?: PlatformWechatAccountRecord | null;
  oauth?: UserOAuthIdentityRecord | null;
  unbound?: Array<{ id: string }>;
} = {}) {
  const { PlatformAuthService } = await import("@/services/platform-auth");
  const employee: PlatformWechatAccountRecord | null =
    overrides.employee === undefined
    ? {
        id: EMPLOYEE_ID,
        tenant_id: null,
        user_id: AUTH_USER_ID,
        phone: "18612345353",
        status: "active",
      }
    : overrides.employee;
  const oauth: UserOAuthIdentityRecord | null = overrides.oauth === undefined
    ? {
        id: OAUTH_ID,
        user_id: AUTH_USER_ID,
        platform: "wechat_mini",
        openid: OPENID,
        unionid: null,
        status: "active",
        bound_at: "2026-09-17T00:00:00.000Z",
        unbound_at: null,
        created_at: "2026-09-17T00:00:00.000Z",
        updated_at: "2026-09-17T00:00:00.000Z",
      }
    : overrides.oauth;
  const unbound = overrides.unbound ?? [{ id: OAUTH_ID }];
  const findEmployeeAccount = mock(async () => employee);
  const findActiveOauthIdentity = mock(async () => oauth);
  const unbindOauthIdentities = mock(async () => unbound);
  const recordAuthEvent = mock(async () => undefined);
  const invalidateOauthIdentityCache = mock(() => undefined);
  const invalidateWechatIdentityCheckCache = mock(() => undefined);
  const invalidateAuthContext = mock(() => undefined);
  const service = new PlatformAuthService({
    accountRepository: { findEmployeeAccount },
    identityRepository: {
      findActiveOauthIdentity,
      unbindOauthIdentities,
      recordAuthEvent,
    },
    identityCache: { invalidateOauthIdentityCache },
    invalidateWechatIdentityCheckCache,
    invalidateAuthContext,
  });
  return {
    service,
    findEmployeeAccount,
    findActiveOauthIdentity,
    unbindOauthIdentities,
    recordAuthEvent,
    invalidateOauthIdentityCache,
    invalidateWechatIdentityCheckCache,
    invalidateAuthContext,
  };
}

const validInput = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  openid: OPENID,
};

async function expectBusinessError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
) {
  try {
    await promise;
    throw new Error("expected request to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(statusCode);
    expect((error as AppError).code).toBe(code);
  }
}

describe("PlatformAuthService.unbindWechat", () => {
  test("unbinds only the current WeChat identity and invalidates auth caches", async () => {
    const context = await createService();

    await expect(context.service.unbindWechat(validInput)).resolves.toEqual({
      success: true,
      message: "微信绑定已解除",
    });
    expect(context.findEmployeeAccount).toHaveBeenCalledWith(EMPLOYEE_ID);
    expect(context.findActiveOauthIdentity).toHaveBeenCalledWith(
      "wechat_mini",
      OPENID,
    );
    expect(context.unbindOauthIdentities).toHaveBeenCalledWith({
      userId: AUTH_USER_ID,
      platform: "wechat_mini",
      openid: OPENID,
    });
    expect(context.invalidateOauthIdentityCache).toHaveBeenCalledWith({
      userId: AUTH_USER_ID,
      platform: "wechat_mini",
      openid: OPENID,
    });
    expect(context.invalidateWechatIdentityCheckCache).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      openid: OPENID,
    });
    expect(context.invalidateAuthContext).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      employeeId: EMPLOYEE_ID,
    });
    expect(context.recordAuthEvent).toHaveBeenCalledTimes(1);
  });

  test("rejects an admin account without a usable recovery phone", async () => {
    const context = await createService({
      employee: {
        id: EMPLOYEE_ID,
        tenant_id: null,
        user_id: AUTH_USER_ID,
        phone: "",
        status: "active",
      },
    });

    await expectBusinessError(
      context.service.unbindWechat(validInput),
      422,
      "UNBIND_FORBIDDEN",
    );
    expect(context.unbindOauthIdentities).not.toHaveBeenCalled();
  });

  test("rejects a stale platform employee binding", async () => {
    const context = await createService({
      employee: {
        id: EMPLOYEE_ID,
        tenant_id: null,
        user_id: "44444444-4444-4444-8444-444444444444",
        phone: "18612345353",
        status: "active",
      },
    });

    await expectBusinessError(
      context.service.unbindWechat(validInput),
      409,
      "WECHAT_BINDING_NOT_MATCHED",
    );
    expect(context.unbindOauthIdentities).not.toHaveBeenCalled();
  });

  test("rejects a stale OAuth binding", async () => {
    const context = await createService({ oauth: null });

    await expectBusinessError(
      context.service.unbindWechat(validInput),
      409,
      "WECHAT_BINDING_NOT_MATCHED",
    );
    expect(context.unbindOauthIdentities).not.toHaveBeenCalled();
  });

  test("rejects a concurrent unbind that updates no active identity", async () => {
    const context = await createService({ unbound: [] });

    await expectBusinessError(
      context.service.unbindWechat(validInput),
      409,
      "WECHAT_BINDING_NOT_MATCHED",
    );
    expect(context.invalidateOauthIdentityCache).toHaveBeenCalledTimes(1);
    expect(context.invalidateWechatIdentityCheckCache).toHaveBeenCalledTimes(1);
  });
});
