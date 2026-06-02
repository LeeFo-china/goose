import {
  bindCustomerAuthUser,
  bindCustomerRole,
} from "./legacy/binding";
import {
  invalidateCustomerTenantOptions,
  invalidateWechatLoginState,
} from "./legacy/cache";
import {
  resolveWechatLoginMembershipState,
  resolveWechatLoginStateByOpenid,
} from "./legacy/login-state";
import {
  getCustomerTenantOptionById,
  listCustomerTenantOptionsByAuthUser,
  listCustomerTenantOptionsByMembership,
  listCustomerTenantOptionsByMemberships,
  listCustomerTenantOptionsByPhone,
} from "./legacy/tenant-options";
import type {
  WechatCustomerIdentityRow,
  WechatCustomerTenantOption,
} from "./legacy/shared";

class WechatCustomerIdentityService {
  customerTenantOptionsCache = new Map<string, {
    expiresAt: number;
    value: WechatCustomerTenantOption[];
  }>();
  customerTenantOptionsInFlight = new Map<string, Promise<WechatCustomerTenantOption[]>>();
  loginMembershipStateCache = new Map<string, {
    expiresAt: number;
    value: ReturnType<typeof resolveWechatLoginMembershipState> extends Promise<infer T> ? T : never;
  }>();
  loginMembershipStateInFlight = new Map<string, ReturnType<typeof resolveWechatLoginMembershipState>>();
  loginStateByOpenidCache = new Map<string, {
    expiresAt: number;
    value: ReturnType<typeof resolveWechatLoginStateByOpenid> extends Promise<infer T> ? T : never;
  }>();
  loginStateByOpenidInFlight = new Map<string, ReturnType<typeof resolveWechatLoginStateByOpenid>>();

  invalidateWechatLoginState = invalidateWechatLoginState;
  invalidateCustomerTenantOptions = invalidateCustomerTenantOptions;
  resolveWechatLoginMembershipState = resolveWechatLoginMembershipState;
  resolveWechatLoginStateByOpenid = resolveWechatLoginStateByOpenid;
  listCustomerTenantOptionsByPhone = listCustomerTenantOptionsByPhone;
  listCustomerTenantOptionsByAuthUser = listCustomerTenantOptionsByAuthUser;
  listCustomerTenantOptionsByMemberships = listCustomerTenantOptionsByMemberships;
  listCustomerTenantOptionsByMembership = listCustomerTenantOptionsByMembership;
  getCustomerTenantOptionById = getCustomerTenantOptionById;
  bindCustomerAuthUser = bindCustomerAuthUser;
  bindCustomerRole = bindCustomerRole;
}

export type CustomerIdentityRow = WechatCustomerIdentityRow;
export type CustomerTenantOption = WechatCustomerTenantOption;

export const wechatCustomerIdentityService =
  new WechatCustomerIdentityService();
