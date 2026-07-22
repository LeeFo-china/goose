import { createPublicKey } from "node:crypto";

const PKCS1_RSA_PUBLIC_KEY_HEADER = "-----BEGIN RSA PUBLIC KEY-----";
const PKCS1_RSA_PUBLIC_KEY_FOOTER = "-----END RSA PUBLIC KEY-----";
const TENCENT_OCR_RSA_MODULUS_BITS = 1024;

export function isTencentOcrEncryptionPublicKeyPem(value: string) {
  const normalized = value.trim();
  if (
    !normalized.startsWith(PKCS1_RSA_PUBLIC_KEY_HEADER) ||
    !normalized.endsWith(PKCS1_RSA_PUBLIC_KEY_FOOTER)
  ) {
    return false;
  }

  try {
    const key = createPublicKey(normalized);
    return key.asymmetricKeyType === "rsa" &&
      key.asymmetricKeyDetails?.modulusLength === TENCENT_OCR_RSA_MODULUS_BITS;
  } catch {
    return false;
  }
}
