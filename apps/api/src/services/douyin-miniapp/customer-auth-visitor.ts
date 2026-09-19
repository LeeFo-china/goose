import { maskPhone } from "@/services/phone-identity-login/helpers";
import type { DouyinVisitorSessionTokenInput } from "@/utils/jwt";

type DouyinVisitorActor = {
  tenantId: string;
  installationId: string;
  appId: string;
  subjectHash: string;
};

type SyncOauthIdentity = (input: {
  userId: string;
  platform: "douyin_mini";
  openid: string;
  unionid: null;
  source: string;
}) => Promise<void>;

export async function buildDouyinVerifiedVisitorAuth(input: {
  actor: DouyinVisitorActor;
  authUserId: string;
  verifiedPhone: string;
  syncOauthIdentity: SyncOauthIdentity;
  tokenSigner: (payload: DouyinVisitorSessionTokenInput) => string;
}) {
  await input.syncOauthIdentity({
    userId: input.authUserId,
    platform: "douyin_mini",
    openid: input.actor.subjectHash,
    unionid: null,
    source: "douyin_customer_auth",
  });
  return {
    token: input.tokenSigner({
      userId: input.authUserId,
      tenantId: input.actor.tenantId,
      installationId: input.actor.installationId,
      appId: input.actor.appId,
      subjectHash: input.actor.subjectHash,
      verifiedPhone: input.verifiedPhone,
    }),
    user_id: input.authUserId,
    visitor_id: input.authUserId,
    mode: "platform_visitor" as const,
    authMode: "platform_visitor" as const,
    roles: ["visitor"] as ["visitor"],
    verified_phone: input.verifiedPhone,
    phone_masked: maskPhone(input.verifiedPhone),
    has_customer_profile: false as const,
    tenant: null,
    customer: null,
  };
}
