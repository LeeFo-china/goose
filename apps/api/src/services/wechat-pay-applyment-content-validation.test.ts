import { expect, test } from "bun:test";

import type { WechatPayApplymentRecord } from "@/repositories/wechat-pay-applyments";
import { getApplymentSubmissionContentBlockers } from "@/services/wechat-pay-applyment-content-validation";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "33333333-3333-4333-8333-333333333333";

function attachment(category: string, status: string) {
  return {
    category,
    object_key: `tenants/${tenantId}/${category}.jpg`,
    file_object_id: "77777777-7777-4777-8777-777777777777",
    ocr_recognition_id: "66666666-6666-4666-8666-666666666666",
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

test("allows confirmed OCR created before applyment subject binding", async () => {
  const blockers = await getApplymentSubmissionContentBlockers({
    applyment: applyment([attachment("license_copy", "confirmed")]),
    ocrRecognitionRepository: {
      findByIdsForTenant: async () => [{
        id: "66666666-6666-4666-8666-666666666666",
        tenant_id: tenantId,
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "77777777-7777-4777-8777-777777777777",
        subject_type: null,
        subject_id: null,
        status: "succeeded",
      }],
    },
  });

  expect(blockers).toEqual([]);
});

test("allows confirmed OCR bound to the current applyment after image replacement", async () => {
  const blockers = await getApplymentSubmissionContentBlockers({
    applyment: applyment([attachment("license_copy", "confirmed")]),
    ocrRecognitionRepository: {
      findByIdsForTenant: async () => [{
        id: "66666666-6666-4666-8666-666666666666",
        tenant_id: tenantId,
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "88888888-8888-4888-8888-888888888888",
        subject_type: "wechat_pay_applyment",
        subject_id: applymentId,
        status: "succeeded",
      }],
    },
  });

  expect(blockers).toEqual([]);
});

test("rejects unbound confirmed OCR for a different file", async () => {
  const blockers = await getApplymentSubmissionContentBlockers({
    applyment: applyment([attachment("license_copy", "confirmed")]),
    ocrRecognitionRepository: {
      findByIdsForTenant: async () => [{
        id: "66666666-6666-4666-8666-666666666666",
        tenant_id: tenantId,
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "88888888-8888-4888-8888-888888888888",
        subject_type: null,
        subject_id: null,
        status: "succeeded",
      }],
    },
  });

  expect(blockers).toContainEqual({
    code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
    category: "license_copy",
  });
});

test("rejects confirmed OCR bound to a different applyment", async () => {
  const blockers = await getApplymentSubmissionContentBlockers({
    applyment: applyment([attachment("license_copy", "confirmed")]),
    ocrRecognitionRepository: {
      findByIdsForTenant: async () => [{
        id: "66666666-6666-4666-8666-666666666666",
        tenant_id: tenantId,
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "77777777-7777-4777-8777-777777777777",
        subject_type: "wechat_pay_applyment",
        subject_id: "99999999-9999-4999-8999-999999999999",
        status: "succeeded",
      }],
    },
  });

  expect(blockers).toContainEqual({
    code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
    category: "license_copy",
  });
});
