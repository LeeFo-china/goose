import { describe, expect, test } from "bun:test";

import {
  getCurrentApplymentAttachment,
  updateCurrentApplymentAttachmentOcrReviewMetadata,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

const RECOGNITION_ID = "11111111-1111-4111-8111-111111111111";

function duplicatedAttachments() {
  const oldLicense: WechatPayApplymentAttachment = {
    category: "license_copy",
    object_key: "tenant/old-license.jpg",
    ocr_recognition_id: "22222222-2222-4222-8222-222222222222",
    ocr_review_status: "review_required",
  };
  const currentLicense: WechatPayApplymentAttachment = {
    category: "license_copy",
    object_key: "tenant/current-license.jpg",
    ocr_recognition_id: RECOGNITION_ID,
    ocr_review_status: "review_required",
  };
  return { oldLicense, currentLicense };
}

describe("wechat pay applyment current attachment selection", () => {
  test("selects the last attachment for a duplicated category", () => {
    const { oldLicense, currentLicense } = duplicatedAttachments();

    expect(getCurrentApplymentAttachment(
      [oldLicense, currentLicense],
      "license_copy",
    )).toBe(currentLicense);
  });

  test("aligns OCR metadata and recognition with the last object key", () => {
    const { oldLicense, currentLicense } = duplicatedAttachments();

    const updated = updateCurrentApplymentAttachmentOcrReviewMetadata(
      [oldLicense, currentLicense],
      "license_copy",
      {
        ocr_recognition_id: RECOGNITION_ID,
        ocr_review_status: "confirmed",
      },
    );

    expect(updated?.attachment).toBe(currentLicense);
    expect(updated?.attachments).toEqual([
      oldLicense,
      {
        ...currentLicense,
        ocr_review_status: "confirmed",
      },
    ]);
  });
});
