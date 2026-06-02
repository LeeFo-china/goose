import {
  customerTenantOptionsCacheKey,
  getCachedLoginMembershipState,
  getCachedLoginStateByOpenid,
  setCachedCustomerTenantOptions,
  setCachedLoginMembershipState,
  setCachedLoginStateByOpenid,
} from "./cache";
import {
  collectEmployeeLoginRows,
  mapLoginCustomerOption,
  mapLoginMembership,
} from "./mappers";
import {
  wechatCustomerIdentityRepository,
  type WechatCustomerIdentityCacheContext,
  type WechatCustomerTenantOption,
  type WechatLoginMembershipRow,
  type WechatLoginMembershipState,
  type WechatLoginStateByOpenid,
  type WechatLoginStateRow,
} from "./shared";

async function loadWechatLoginMembershipState(
  context: WechatCustomerIdentityCacheContext,
  authUserId: string,
) {
  const rows = await wechatCustomerIdentityRepository.listWechatLoginMemberships(authUserId);
  const state = buildLoginMembershipStateFromRows(context, authUserId, rows);
  return state;
}

export async function resolveWechatLoginMembershipState(
  this: WechatCustomerIdentityCacheContext,
  authUserId: string,
) {
  const cached = getCachedLoginMembershipState(this, authUserId);
  if (cached) {
    return cached;
  }

  const inFlight = this.loginMembershipStateInFlight.get(authUserId);
  if (inFlight) {
    return inFlight;
  }

  const request = loadWechatLoginMembershipState(this, authUserId)
    .then((result) => {
      setCachedLoginMembershipState(this, authUserId, result);
      return result;
    })
    .finally(() => {
      if (this.loginMembershipStateInFlight.get(authUserId) === request) {
        this.loginMembershipStateInFlight.delete(authUserId);
      }
    });
  this.loginMembershipStateInFlight.set(authUserId, request);
  return request;
}

function normalizeLoginStateRow(row: WechatLoginStateRow): WechatLoginMembershipRow | null {
  if (!row.membership_id || !row.identity_type || !row.identity_id || !row.status) {
    return null;
  }

  return {
    ...row,
    membership_id: row.membership_id,
    user_id: row.auth_user_id,
    tenant_id: row.tenant_id,
    identity_type: row.identity_type,
    identity_id: row.identity_id,
    status: row.status,
    is_default: Boolean(row.is_default),
  };
}

function buildLoginMembershipStateFromRows(
  context: WechatCustomerIdentityCacheContext,
  authUserId: string,
  rows: WechatLoginMembershipRow[],
): WechatLoginMembershipState {
  const memberships = rows.map((row) => mapLoginMembership(row));
  const customerOptions = rows
    .map((row) => mapLoginCustomerOption(row))
    .filter((item): item is WechatCustomerTenantOption => Boolean(item));
  const employeeLoginRows = collectEmployeeLoginRows(authUserId, rows);

  setCachedLoginMembershipState(context, authUserId, {
    memberships,
    customerOptions,
    employeeLoginRows,
  });
  setCachedCustomerTenantOptions(
    context,
    customerTenantOptionsCacheKey({ authUserId }),
    customerOptions,
  );

  return {
    memberships,
    customerOptions,
    employeeLoginRows,
  };
}

async function loadWechatLoginStateByOpenid(
  context: WechatCustomerIdentityCacheContext,
  openid: string,
): Promise<WechatLoginStateByOpenid | null> {
  const rows = await wechatCustomerIdentityRepository.resolveWechatLoginStateByOpenid(openid);
  const first = rows[0];
  if (!first) {
    return null;
  }

  const authUserId = first.auth_user_id;
  const membershipRows = rows
    .map((row) => normalizeLoginStateRow(row))
    .filter((row): row is WechatLoginMembershipRow => Boolean(row));
  const state = buildLoginMembershipStateFromRows(context, authUserId, membershipRows);

  return {
    authUserId,
    oauthUnionid: first.oauth_unionid,
    ...state,
  };
}

export async function resolveWechatLoginStateByOpenid(
  this: WechatCustomerIdentityCacheContext,
  openid: string,
): Promise<WechatLoginStateByOpenid | null> {
  const cached = getCachedLoginStateByOpenid(this, openid);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = this.loginStateByOpenidInFlight.get(openid);
  if (inFlight) {
    return inFlight;
  }

  const request = loadWechatLoginStateByOpenid(this, openid)
    .then((result) => {
      setCachedLoginStateByOpenid(this, openid, result);
      return result;
    })
    .finally(() => {
      if (this.loginStateByOpenidInFlight.get(openid) === request) {
        this.loginStateByOpenidInFlight.delete(openid);
      }
    });

  this.loginStateByOpenidInFlight.set(openid, request);
  return request;
}
