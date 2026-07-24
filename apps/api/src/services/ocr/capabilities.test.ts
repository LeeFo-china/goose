import { describe, expect, test } from "bun:test";

import {
  getOcrCapability,
  listPlatformOcrCapabilities,
  listPublicOcrCapabilities,
  listTenantOcrCapabilities,
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

  test("exposes supplier business license OCR only to platform onboarding", () => {
    const capability = getOcrCapability(
      "supplier_onboarding",
      "business_license",
    );

    expect(capability).toMatchObject({
      providerAction: "BizLicenseOCR",
      supported_mime_types: ["image/jpeg", "image/png"],
      max_size_bytes: 5 * 1024 * 1024,
      output_fields: [
        "license_name",
        "license_code",
        "license_address",
        "license_period_begin",
        "license_period_end",
        "legal_representative_name",
      ],
    });
    expect(listTenantOcrCapabilities()).not.toContainEqual(
      expect.objectContaining({ scene: "supplier_onboarding" }),
    );
    expect(listPlatformOcrCapabilities("supplier_onboarding")).toEqual([
      expect.objectContaining({
        scene: "supplier_onboarding",
        document_type: "business_license",
      }),
    ]);
  });

  test("returns no capability for Phase 1 unsupported combinations", () => {
    expect(getOcrCapability("expense_request", "general_invoice")).toBeNull();
  });
});
