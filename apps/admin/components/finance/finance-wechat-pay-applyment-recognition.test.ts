import { describe, expect, test } from "bun:test";

import { buildInitialMaterialStates } from "./finance-wechat-pay-applyment-flow-model";
import { processApplymentUploadedMaterials } from "./finance-wechat-pay-applyment-recognition";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

describe("wechat pay applyment recognition processing", () => {
  test("recognizes supported uploaded materials without a separate consent gate", async () => {
    const license: WechatPayApplymentAttachment = {
      category: "license_copy",
      object_key: "tenant/license_copy.jpg",
      file_object_id: "22222222-2222-4222-8222-222222222222",
      ocr_review_status: "uploaded",
    };
    const states = buildInitialMaterialStates([license]);
    const recognized: WechatPayApplymentAttachment[] = [];

    await processApplymentUploadedMaterials({
      attachments: [license],
      materialStates: states,
      supportedDocumentTypes: new Set(["business_license"]),
      excludedObjectKeys: new Set(),
      isActive: () => true,
      markUnsupportedManual: async () => undefined,
      recognize: async (attachment) => {
        recognized.push(attachment);
      },
    });

    expect(recognized).toEqual([license]);
  });
});
