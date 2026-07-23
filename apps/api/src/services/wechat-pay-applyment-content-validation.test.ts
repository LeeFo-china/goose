import { expect, test } from "bun:test";

import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import { getApplymentSubmissionContentBlockers } from "@/services/wechat-pay-applyment-content-validation";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "33333333-3333-4333-8333-333333333333";

function attachment(category: string, status: string) {
  return {
    category,
    object_key: `tenants/${tenantId}/${category}.jpg`,
    ocr_review_status: status,
  };
}

function applyment(attachments: unknown[]): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    contact_type: "LEGAL",
    settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
    attachments,
  } as unknown as WechatPayApplymentRecord;
}

const repository = {
  findByIdsForTenant: async () => [],
};

test("requires review for every uploaded OCR-capable attachment", async () => {
  for (const category of [
    "settlement_account_proof",
    "contact_id_card_front",
  ]) {
    const blockers = await getApplymentSubmissionContentBlockers({
      applyment: applyment([attachment(category, "review_required")]),
      ocrRecognitionRepository: repository,
    });
    expect(blockers).toContainEqual({
      code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED",
      category,
    });
  }
});

test("allows manual review for optional OCR-capable attachments", async () => {
  const blockers = await getApplymentSubmissionContentBlockers({
    applyment: applyment([
      attachment("settlement_account_proof", "manual"),
      attachment("contact_id_card_front", "manual"),
    ]),
    ocrRecognitionRepository: repository,
  });
  expect(blockers).toEqual([]);
});
