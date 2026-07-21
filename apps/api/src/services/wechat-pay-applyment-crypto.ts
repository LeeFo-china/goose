import { constants, publicEncrypt } from "node:crypto";

import { Errors } from "@/errors/error-factory";

export function encryptWechatPaySensitiveField(
  value: string,
  publicKeyPem: string,
): string {
  try {
    return publicEncrypt(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha1",
      },
      Buffer.from(value, "utf8"),
    ).toString("base64");
  } catch {
    throw Errors.business(
      409,
      "微信支付公钥无效，无法加密进件敏感资料",
      "WECHAT_PAY_APPLYMENT_PUBLIC_KEY_INVALID",
    );
  }
}
