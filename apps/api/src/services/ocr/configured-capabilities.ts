import type { OcrCapability } from "@gooes/domain";

import { isTencentOcrEncryptionPublicKeyPem } from "./tencent-encryption-key";

export function filterConfiguredOcrCapabilities(
  capabilities: OcrCapability[],
  encryptedIdEnabled: boolean,
  encryptionPublicKeyPem: string,
) {
  const encryptedIdAvailable = encryptedIdEnabled &&
    isTencentOcrEncryptionPublicKeyPem(encryptionPublicKeyPem);
  return encryptedIdAvailable ? capabilities : capabilities.filter(
    (item) => item.document_type !== "id_card_front" &&
      item.document_type !== "id_card_back",
  );
}
