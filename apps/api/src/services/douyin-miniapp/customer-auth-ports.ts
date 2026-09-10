import type { FastifyRequest } from "fastify";
import type { DouyinOpenPlatformGateway } from "@/gateways/douyin-open-platform/client";
import type {
  PhoneCustomerRecord,
  PhoneEmployeeRecord,
} from "@/repositories/phone-identity-candidates";
import type {
  PhoneIdentityLoginRepository,
} from "@/repositories/phone-identity-login";
import type { PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal-types";
import type { SmsVerificationCodeService } from "@/services/sms-verification-codes";
import type {
  CustomerTenantOption,
} from "@/services/wechat-customer-identities/legacy-service";
import type { JwtPayload } from "@/utils/jwt";
import type { DouyinMiniappAccessTokenService } from "./access-tokens";
import type { DouyinMiniappContentRepository } from "@/repositories/douyin-miniapp-content";

type RequestLogger = Pick<FastifyRequest["log"], "info" | "warn">;
export type DouyinCustomerAuthRequestLike = {
  id?: string;
  user?: JwtPayload;
  log?: RequestLogger;
};
type SmsService = Pick<SmsVerificationCodeService, "sendCode" | "reserveBypassCode">;
type CandidateRepository = {
  listCustomersByPhone: (phone: string) => Promise<PhoneCustomerRecord[]>;
  listEmployeesByPhone: (phone: string) => Promise<PhoneEmployeeRecord[]>;
  listPartnerMembersByPhone: (phone: string) => Promise<PlatformPartnerMemberRecord[]>;
  listActiveMembershipKeys: (authUserId: string) => Promise<Set<string>>;
  listActiveOauthUserIds: (userIds: string[], platform: "douyin_mini") => Promise<Set<string>>;
};
type UserIdentityPort = {
  findActiveOauthIdentity: (input: {
    platform: "douyin_mini";
    openid: string;
  }) => Promise<{ user_id: string } | null>;
  syncOauthIdentityBestEffort: (input: {
    userId: string;
    platform: "douyin_mini";
    openid: string;
    unionid?: string | null;
    source: string;
  }) => Promise<void>;
  syncBusinessMembershipBestEffort: (input: {
    userId: string;
    tenantId: string | null;
    identityType: "customer";
    identityId: string;
    source: string;
  }) => Promise<void>;
};
type CustomerIdentityPort = {
  getCustomerTenantOptionById: (
    customerId: string,
    tenantId: string,
  ) => Promise<CustomerTenantOption | null>;
  bindCustomerAuthUser: (input: {
    authUserId: string;
    customer: CustomerTenantOption;
  }) => Promise<unknown>;
};
export type AccessTokenPort = Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;
export type PhoneGateway = Pick<DouyinOpenPlatformGateway, "getPhoneNumberInfo">;
type ContentRepository = Pick<DouyinMiniappContentRepository, "findActiveInstallation">;
export type TokenSigner = (payload: Omit<JwtPayload, "iat" | "exp">) => string;

export type DouyinCustomerAuthDependencies = {
  smsService: SmsService;
  sessionRepository: Pick<PhoneIdentityLoginRepository,
    "claimVerification" | "beginSelection" | "reserveSelection" |
    "finalizeSelection" | "releaseSelection">;
  candidateRepository: CandidateRepository;
  authUsers: {
    createLocalPlatformUser: (input: {
      platform: "douyin_mini";
      subject: string;
      source: string;
    }) => Promise<string>;
  };
  userIdentities: UserIdentityPort;
  customerIdentity: CustomerIdentityPort;
  accessTokens?: AccessTokenPort;
  phoneGateway?: PhoneGateway;
  contextRepository?: ContentRepository;
  douyinPhoneNumberPrivateKeyPem?: string | null;
  tokenSigner?: TokenSigner;
  now?: () => Date;
  createSelectionToken?: () => string;
};
