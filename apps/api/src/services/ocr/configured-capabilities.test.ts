import { generateKeyPairSync } from "node:crypto";

import { describe, expect, test } from "bun:test";

import { listPublicOcrCapabilities } from "./capabilities";
import { filterConfiguredOcrCapabilities } from "./configured-capabilities";

const VALID_PUBLIC_KEY = generateKeyPairSync("rsa", {
  modulusLength: 1024,
}).publicKey.export({ type: "pkcs1", format: "pem" }).toString();

function documentTypes(enabled: boolean, publicKey: string) {
  return filterConfiguredOcrCapabilities(
    listPublicOcrCapabilities("wechat_pay_applyment"),
    enabled,
    publicKey,
  ).map((item) => item.document_type);
}

describe("configured OCR capabilities", () => {
  test("exposes encrypted ID capabilities only with the enabled flag and valid key", () => {
    expect(documentTypes(true, VALID_PUBLIC_KEY)).toEqual([
      "business_license",
      "id_card_front",
      "id_card_back",
      "bank_card",
    ]);
  });

  test("hides encrypted ID capabilities for a disabled flag or invalid key", () => {
    expect(documentTypes(false, VALID_PUBLIC_KEY)).toEqual([
      "business_license",
      "bank_card",
    ]);
    expect(documentTypes(true, "not-a-public-key")).toEqual([
      "business_license",
      "bank_card",
    ]);
  });
});
