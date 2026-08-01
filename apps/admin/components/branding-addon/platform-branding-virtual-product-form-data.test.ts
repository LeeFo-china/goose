import { describe, expect, test } from "bun:test";

import type {
  PlatformBrandingVirtualProduct,
  PlatformBrandingVirtualProductSummary,
} from "./platform-branding-addon-product-types";
import {
  buildMappingPatch,
  createDraft,
} from "./platform-branding-virtual-product-form-data";

const mapping: PlatformBrandingVirtualProduct = {
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "merchant",
  offer_id: "offer",
  provider_product_id: "product",
  expected_amount_fen: 9_900,
  encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 4,
  status: "active",
  validation_status: "valid",
  validated_at: "2026-07-31T10:00:00.000Z",
  version: 6,
};

const summary: PlatformBrandingVirtualProductSummary = {
  environment: "production",
  mapping,
  secret: { key: "hidden", revision: 4, configured: true },
};

describe("platform branding virtual-product form data", () => {
  test("keeps an unchanged validated active mapping active", () => {
    expect(buildMappingPatch({
      environment: "production",
      draft: createDraft(mapping),
      summary,
      amountFen: 9_900,
    })).toMatchObject({ ok: true, patch: { status: "active" } });
  });

  test("moves an active mapping to draft when the unified price changes", () => {
    expect(buildMappingPatch({
      environment: "production",
      draft: createDraft(mapping),
      summary,
      amountFen: 12_900,
    })).toMatchObject({
      ok: true,
      patch: { expected_amount_fen: 12_900, status: "draft" },
    });
  });

  test("moves an active mapping to draft when provider identifiers change", () => {
    expect(buildMappingPatch({
      environment: "production",
      draft: { ...createDraft(mapping), offerId: "new-offer" },
      summary,
      amountFen: 9_900,
    })).toMatchObject({ ok: true, patch: { status: "draft" } });
  });
});
