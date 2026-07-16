import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { bindCustomerAuthUser as bindCustomerAuthUserType } from "./binding";

const findCustomerIdentityByAuthUserAndTenant = mock(async () => null as unknown);
const bindCustomerAuthUserRepository = mock(async () => undefined);
const syncBusinessMembershipBestEffort = mock(async () => undefined);
const assertCustomerCanBind = mock(async () => undefined);

mock.module("./shared", () => ({
  CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS: 60_000,
  LOGIN_STATE_BY_OPENID_CACHE_TTL_MS: 300_000,
  LOGIN_STATE_BY_OPENID_MISS_CACHE_TTL_MS: 15_000,
  MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE: 4_000,
  Errors,
  userIdentityService: {
    syncBusinessMembershipBestEffort,
  },
  wechatCustomerIdentityRepository: {
    findCustomerIdentityByAuthUserAndTenant,
    bindCustomerAuthUser: bindCustomerAuthUserRepository,
  },
  wechatRebindRequestService: {
    assertCustomerCanBind,
  },
}));

let bindCustomerAuthUser: typeof bindCustomerAuthUserType;

beforeAll(async () => {
  ({ bindCustomerAuthUser } = await import("./binding"));
});

beforeEach(() => {
  findCustomerIdentityByAuthUserAndTenant.mockReset();
  bindCustomerAuthUserRepository.mockReset();
  syncBusinessMembershipBestEffort.mockReset();
  assertCustomerCanBind.mockReset();
  findCustomerIdentityByAuthUserAndTenant.mockResolvedValue(null);
  bindCustomerAuthUserRepository.mockResolvedValue(undefined);
});

describe("bindCustomerAuthUser", () => {
  test("rejects binding when current auth user already has another customer in the same tenant", async () => {
    findCustomerIdentityByAuthUserAndTenant.mockResolvedValue({
      id: "customer-existing",
      tenant_id: "tenant-1",
      user_id: "auth-user-1",
      phone: "13900139000",
    });

    await expect(bindCustomerAuthUser.call(cacheContext(), {
      authUserId: "auth-user-1",
      customer: {
        id: "customer-target",
        tenant_id: "tenant-1",
        claimed_at: null,
      },
    })).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.WECHAT_ALREADY_BOUND,
      details: expect.objectContaining({
        tenant_id: "tenant-1",
        customer_id: "customer-target",
        current_customer_id: "customer-existing",
      }),
    });

    expect(bindCustomerAuthUserRepository).not.toHaveBeenCalled();
  });

  test("maps customer tenant user unique violations to a stable business error", async () => {
    bindCustomerAuthUserRepository.mockRejectedValue(Errors.dbError("绑定客户身份失败", {
      code: "23505",
      message: "duplicate key value violates unique constraint \"customers_tenant_user_id_unique\"",
      details: "Key (tenant_id, user_id)=(tenant-1, auth-user-1) already exists.",
    }));

    await expect(bindCustomerAuthUser.call(cacheContext(), {
      authUserId: "auth-user-1",
      customer: {
        id: "customer-target",
        tenant_id: "tenant-1",
        claimed_at: null,
      },
    })).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCodes.WECHAT_ALREADY_BOUND,
    });
  });
});

function cacheContext() {
  return {
    customerTenantOptionsCache: new Map(),
    customerTenantOptionsInFlight: new Map(),
    loginMembershipStateCache: new Map(),
    loginMembershipStateInFlight: new Map(),
    loginStateByOpenidCache: new Map(),
    loginStateByOpenidInFlight: new Map(),
  };
}
