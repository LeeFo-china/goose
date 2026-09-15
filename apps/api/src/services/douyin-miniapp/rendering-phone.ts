import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { DouyinCustomerAuthVerifyInput } from "@/schema/douyin-customer-auth";
import { getDouyinMiniappTokenExpiresInSeconds, signDouyinMiniappToken } from "@/utils/jwt";
import type { DouyinCustomerAuthDependencies } from "./customer-auth-ports";

type Actor = {
  tenantId: string;
  installationId: string;
  appId: string;
  subjectHash: string;
};

export async function verifyRenderingSmsCode(
  smsService: DouyinCustomerAuthDependencies["smsService"],
  input: DouyinCustomerAuthVerifyInput,
): Promise<string> {
  const pending = await smsService.findValidPending({
    phone: input.phone, code: input.code, scene: "login_identity",
  });
  if (!pending) throw Errors.business(400, "验证码错误或已过期", ErrorCodes.SMS_CODE_INVALID);
  await smsService.markVerified(pending.id);
  return input.phone;
}

export function signRenderingPhone(
  actor: Actor,
  phone: string,
  dependencies: DouyinCustomerAuthDependencies,
) {
  const sign = dependencies.renderingTokenSigner ?? signDouyinMiniappToken;
  return {
    access_token: sign({
      tenant_id: actor.tenantId,
      douyin_installation_id: actor.installationId,
      douyin_app_id: actor.appId,
      subject_hash: actor.subjectHash,
      verified_phone: phone,
    }),
    expires_in: (dependencies.renderingTokenExpiresInSeconds
      ?? getDouyinMiniappTokenExpiresInSeconds)(),
  };
}
