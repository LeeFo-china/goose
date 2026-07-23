import { describe, expect, test } from "bun:test";

import {
  getMockAttachmentReadinessBlockers,
  initialApplyment,
  mockOcrRecognitions,
} from "../e2e/wechat-pay-applyment-mock-fixture.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("WeChat Pay applyment E2E fixture", () => {
  test("keeps every confirmed OCR attachment owned and fully linked", () => {
    expect(getMockAttachmentReadinessBlockers(initialApplyment)).toEqual([]);

    for (const attachment of initialApplyment.attachments) {
      expect(attachment.object_key).toStartWith(
        `tenants/${initialApplyment.tenant_id}/wechat-pay-applyment/`
        + "unassigned/2026/07/23/",
      );
      expect(attachment.file_object_id).toMatch(UUID_PATTERN);
      expect(attachment.ocr_recognition_id).toMatch(UUID_PATTERN);
      expect(mockOcrRecognitions).toContainEqual(expect.objectContaining({
        id: attachment.ocr_recognition_id,
        tenant_id: initialApplyment.tenant_id,
        file_object_id: attachment.file_object_id,
        subject_type: "wechat_pay_applyment",
        subject_id: initialApplyment.id,
        status: "succeeded",
        scene: "wechat_pay_applyment",
      }));
    }
  });

  test("derives mock readiness blockers from object and OCR ownership rules", () => {
    const missingRequired = structuredClone(initialApplyment);
    missingRequired.attachments = missingRequired.attachments.filter(
      (attachment) => attachment.category !== "license_copy",
    );
    expect(getMockAttachmentReadinessBlockers(missingRequired)).toContainEqual({
      code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
      category: "license_copy",
    });

    const invalidObjectKey = structuredClone(initialApplyment);
    invalidObjectKey.attachments[0].object_key = "tenants/mock/license.png";
    expect(getMockAttachmentReadinessBlockers(invalidObjectKey)).toContainEqual({
      code: "APPLYMENT_OBJECT_KEY_INVALID",
      category: "license_copy",
    });

    const mismatchedRecognitions = structuredClone(mockOcrRecognitions);
    mismatchedRecognitions[0].document_type = "bank_card";
    expect(getMockAttachmentReadinessBlockers(
      initialApplyment,
      mismatchedRecognitions,
    )).toContainEqual({
      code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH",
      category: "license_copy",
    });
  });
});
