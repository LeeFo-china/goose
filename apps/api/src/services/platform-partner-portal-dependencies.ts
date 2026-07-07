import type { FastifyRequest } from "fastify";
import type { PlatformPartnerPortalRepositoryPort } from "@/repositories/platform-partner-portal";
import type { PartnerInviteCodeQrcodeGenerator } from "@/services/platform-partner-portal-invite-codes";
import type { VisitorSessionSigner } from "@/services/platform-partner-portal-auth-payloads";
import type { smsVerificationCodeService } from "@/services/sms-verification-codes";
import type { JwtPayload } from "@/utils/jwt";

export type WechatSessionResolver = (code: string) => Promise<{
  openid?: string;
  unionid?: string | null;
}>;

export type AuthUserResolver = (input: {
  request?: FastifyRequest;
  openid: string;
  unionid?: string | null;
}) => Promise<{ userId: string; isNewUser: boolean }>;

export type OauthIdentityEnsurer = (input: {
  userId: string;
  openid: string;
  unionid?: string | null;
}) => Promise<void>;

type SmsServicePort = Pick<typeof smsVerificationCodeService, "sendCode">;

export type PlatformPartnerPortalServiceDependencies = {
  repository?: PlatformPartnerPortalRepositoryPort;
  wechatSessionResolver?: WechatSessionResolver;
  authUserResolver?: AuthUserResolver;
  oauthIdentityEnsurer?: OauthIdentityEnsurer;
  tokenSigner?: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
  visitorSessionSigner?: VisitorSessionSigner;
  smsService?: SmsServicePort;
  inviteCodeQrcodeGenerator?: PartnerInviteCodeQrcodeGenerator;
};
