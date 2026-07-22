import { describe, expect, test } from "bun:test";

import {
  getOcrCapability,
  listPublicOcrCapabilities,
} from "./capabilities";

describe("OCR capability catalog", () => {
  test("exposes only the four Phase 1 applyment capabilities", () => {
    const capabilities = listPublicOcrCapabilities("wechat_pay_applyment");

    expect(capabilities).toHaveLength(4);
    expect(capabilities.map((item) => item.document_type)).toEqual([
      "business_license",
      "id_card_front",
      "id_card_back",
      "bank_card",
    ]);
    expect(JSON.stringify(capabilities)).not.toContain("providerAction");
    expect(JSON.stringify(capabilities)).not.toContain("concurrencyLimit");
  });

  test("keeps provider and file constraints server-owned", () => {
    const capability = getOcrCapability(
      "wechat_pay_applyment",
      "business_license",
    );

    expect(capability).toMatchObject({
      providerAction: "BizLicenseOCR",
      supported_mime_types: ["image/jpeg", "image/png"],
      max_size_bytes: 5 * 1024 * 1024,
      concurrencyLimit: 8,
      attachment_categories: ["license_copy"],
    });
  });

  test("returns no capability for Phase 1 unsupported combinations", () => {
    expect(getOcrCapability("expense_request", "general_invoice")).toBeNull();
  });
});
