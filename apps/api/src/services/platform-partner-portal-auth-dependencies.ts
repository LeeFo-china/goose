import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { userIdentityService } from "@/services/user-identities";
import {
  createWechatVisitorUser,
  getOrCreateAuthUser,
  getWeChatSession,
} from "@/services/wechat-auth-legacy/identity";
import {
  runAuthBackgroundTask,
  serializeBackgroundError,
} from "@/services/wechat-auth-legacy/common";

export async function defaultWechatSessionResolver(code: string) {
  return getWeChatSession.call({}, code);
}

export async function defaultAuthUserResolver(input: {
  request?: FastifyRequest;
  openid: string;
  unionid?: string | null;
}) {
  const request = input.request ?? createFallbackRequest();
  const context = {
    serializeBackgroundError,
    runAuthBackgroundTask,
    createWechatVisitorUser,
  };
  const resolution = await getOrCreateAuthUser.call(
    context,
    request,
    input.openid,
    input.unionid ?? undefined,
    { allowVisitorSession: false },
  );

  if (resolution.kind !== "auth_user") {
    throw Errors.unauthorized();
  }

  return {
    userId: resolution.userId,
    isNewUser: resolution.isNewUser,
  };
}

export async function defaultOauthIdentityEnsurer(input: {
  userId: string;
  openid: string;
  unionid?: string | null;
}) {
  await userIdentityService.syncOauthIdentityBestEffort({
    userId: input.userId,
    platform: "wechat_mini",
    openid: input.openid,
    unionid: input.unionid ?? null,
    source: "platform_partner_portal_auth",
  });

  const activeIdentity = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid: input.openid,
  });
  if (activeIdentity?.user_id !== input.userId) {
    throw Errors.dbError("同步微信登录凭证失败");
  }
}

function createFallbackRequest() {
  const log = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { id: "partner-portal-auth", log } as unknown as FastifyRequest;
}
