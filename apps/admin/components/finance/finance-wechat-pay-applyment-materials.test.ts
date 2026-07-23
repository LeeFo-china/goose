import { describe, expect, test } from "bun:test";

import {
  buildInitialMaterialStates,
  buildRecoveredMaterialState,
  getPendingRecognitionAttachments,
  isCurrentMaterialAttachment,
  reconcileMaterialStates,
  replaceApplymentAttachment,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

const RECOGNITION_ID = "11111111-1111-4111-8111-111111111111";

function attachment(
  category: WechatPayApplymentAttachmentCategory,
  status?: WechatPayApplymentAttachment["ocr_review_status"],
): WechatPayApplymentAttachment {
  return {
    category,
    object_key: `tenant/${category}.jpg`,
    ...(status ? { ocr_review_status: status } : {}),
  };
}

function materialState(
  category: WechatPayApplymentAttachmentCategory,
  status: ApplymentMaterialState["status"],
): ApplymentMaterialState {
  return {
    status,
    attachmentObjectKey: `tenant/${category}.jpg`,
    recognitionId: status === "uploaded" ? null : RECOGNITION_ID,
    fields: [],
    warnings: [],
    error: null,
  };
}

describe("wechat pay applyment material helpers", () => {
  test("builds a review state from a restored recognition view", () => {
    const license = {
      ...attachment("license_copy", "review_required"),
      object_key: "tenant/restored-license.jpg",
      ocr_recognition_id: RECOGNITION_ID,
    };
    const fields = [{
      key: "license_name",
      label: "主体名称",
      value: "示例商户",
      normalized: true,
      sensitive: false,
      confidence: 0.99,
    }] as const;
    const warnings = [{
      code: "LOW_CONTRAST",
      level: "warning" as const,
      message: "图片对比度较低",
    }];

    expect(buildRecoveredMaterialState(
      license,
      { id: RECOGNITION_ID, warnings },
      fields,
    )).toEqual({
      status: "review_required",
      attachmentObjectKey: "tenant/restored-license.jpg",
      recognitionId: RECOGNITION_ID,
      fields,
      warnings,
      error: null,
    });
  });

  test("replaces the current category and clears stale OCR metadata", () => {
    const oldLicense = {
      ...attachment("license_copy", "confirmed"),
      object_key: "tenant/old-license.jpg",
      ocr_recognition_id: RECOGNITION_ID,
    };
    const identityFront = attachment(
      "legal_representative_id_card_front",
      "confirmed",
    );
    const uploadedLicense = {
      ...attachment("license_copy", "uploaded"),
      file_object_id: "22222222-2222-4222-8222-222222222222",
      object_key: "tenant/new-license.jpg",
      ocr_recognition_id: null,
    };

    const next = replaceApplymentAttachment(
      [oldLicense, identityFront],
      uploadedLicense,
    );

    expect(next).toEqual([identityFront, uploadedLicense]);
    expect(next).not.toContain(oldLicense);
    expect(next[1]).toMatchObject({
      ocr_recognition_id: null,
      ocr_review_status: "uploaded",
    });
  });

  test("keeps business scene uploads as an ordered multi-value category", () => {
    const first = {
      category: "business_scene_material" as const,
      object_key: "tenant/store-1.jpg",
    };
    const second = {
      category: "business_scene_material" as const,
      object_key: "tenant/store-2.jpg",
    };

    expect(replaceApplymentAttachment([first], second)).toEqual([first, second]);
  });

  test("selects uploaded supported materials in attachment order", () => {
    const license = {
      ...attachment("license_copy", "uploaded"),
      file_object_id: "22222222-2222-4222-8222-222222222222",
    };
    const identityFront = {
      ...attachment("legal_representative_id_card_front", "uploaded"),
      file_object_id: "33333333-3333-4333-8333-333333333333",
    };
    const identityBack = {
      ...attachment("legal_representative_id_card_back", "confirmed"),
      file_object_id: "44444444-4444-4444-8444-444444444444",
    };
    const states = buildInitialMaterialStates([
      identityFront,
      identityBack,
      license,
    ]);

    expect(getPendingRecognitionAttachments({
      attachments: [identityFront, identityBack, license],
      materialStates: states,
      supportedDocumentTypes: new Set(["id_card_front", "business_license"]),
    })).toEqual([identityFront, license]);
    expect(getPendingRecognitionAttachments({
      attachments: [identityFront, identityBack, license],
      materialStates: states,
      supportedDocumentTypes: new Set(["id_card_front", "business_license"]),
      excludedObjectKeys: new Set([identityFront.object_key]),
    })).toEqual([license]);
  });

  test("reconciles replacements without discarding current transient fields", () => {
    const oldLicense = attachment("license_copy", "review_required");
    const identityFront = attachment(
      "legal_representative_id_card_front",
      "uploaded",
    );
    const states: ApplymentMaterialStateMap = {
      license_copy: {
        ...materialState("license_copy", "review_required"),
        fields: [{
          key: "license_name",
          label: "主体名称",
          value: "示例商户",
          normalized: true,
          sensitive: false,
          confidence: 0.99,
        }],
      },
      legal_representative_id_card_front: materialState(
        "legal_representative_id_card_front",
        "uploaded",
      ),
    };
    const replacement = {
      ...attachment("legal_representative_id_card_front", "uploaded"),
      object_key: "tenant/new-front.jpg",
    };

    expect(reconcileMaterialStates(
      [oldLicense, replacement],
      states,
    )).toEqual({
      license_copy: states.license_copy,
      legal_representative_id_card_front: {
        status: "uploaded",
        attachmentObjectKey: "tenant/new-front.jpg",
        recognitionId: null,
        fields: [],
        warnings: [],
        error: null,
      },
    });
    expect(isCurrentMaterialAttachment(
      [oldLicense, replacement],
      identityFront,
    )).toBe(false);
    expect(isCurrentMaterialAttachment(
      [oldLicense, replacement],
      replacement,
    )).toBe(true);
  });
});
