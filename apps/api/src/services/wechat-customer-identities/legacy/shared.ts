export {
  wechatCustomerIdentityRepository,
  type WechatCustomerIdentityRow,
  type WechatLoginMembershipRow,
  type WechatLoginStateRow,
  type WechatCustomerTenantOption,
} from "@/repositories/wechat-customer-identities";
import type {
  WechatCustomerTenantOption,
  WechatLoginMembershipRow,
} from "@/repositories/wechat-customer-identities";
export { Errors } from "@/errors/error-factory";
export { userIdentityService } from "@/services/user-identities";
export type { UserBusinessMembershipRecord } from "@/repositories/user-identities";
import type { UserBusinessMembershipRecord } from "@/repositories/user-identities";
export { wechatRebindRequestService } from "@/services/wechat-rebind-requests";

export const CUSTOMER_TENANT_OPTIONS_CACHE_TTL_MS = 60_000;
export const LOGIN_STATE_BY_OPENID_CACHE_TTL_MS = 5 * 60_000;
export const LOGIN_STATE_BY_OPENID_MISS_CACHE_TTL_MS = 15_000;
export const MAX_CUSTOMER_TENANT_OPTIONS_CACHE_SIZE = 4_000;

export type WechatLoginMembershipState = {
  memberships: UserBusinessMembershipRecord[];
  customerOptions: WechatCustomerTenantOption[];
  employeeLoginRows: WechatLoginMembershipRow[];
};

export type WechatLoginStateByOpenid = WechatLoginMembershipState & {
  authUserId: string;
  oauthUnionid: string | null;
};

export type WechatCustomerIdentityCacheContext = {
  customerTenantOptionsCache: Map<string, {
    expiresAt: number;
    value: WechatCustomerTenantOption[];
  }>;
  customerTenantOptionsInFlight: Map<string, Promise<WechatCustomerTenantOption[]>>;
  loginMembershipStateCache: Map<string, {
    expiresAt: number;
    value: WechatLoginMembershipState;
  }>;
  loginMembershipStateInFlight: Map<string, Promise<WechatLoginMembershipState>>;
  loginStateByOpenidCache: Map<string, {
    expiresAt: number;
    value: WechatLoginStateByOpenid | null;
  }>;
  loginStateByOpenidInFlight: Map<string, Promise<WechatLoginStateByOpenid | null>>;
};
