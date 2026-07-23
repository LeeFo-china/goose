import { describe, expect, test } from "bun:test";

import {
  buildInitialMaterialStates,
  type ApplymentMaterialState,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  getReachableStage,
  isApplymentStageReachable,
} from "./finance-wechat-pay-applyment-stage-reachability";
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
  objectKey = `tenant/${category}.jpg`,
): ApplymentMaterialState {
  return {
    status,
    attachmentObjectKey: objectKey,
    recognitionId: RECOGNITION_ID,
    fields: [],
    warnings: [],
    error: null,
  };
}

const legalAttachments = [
  attachment("license_copy", "confirmed"),
  attachment("legal_representative_id_card_front", "manual"),
  attachment("legal_representative_id_card_back", "confirmed"),
] as const;

describe("wechat pay applyment stage reachability", () => {
  test("relocks submit when a required attachment is deleted", () => {
    const completeStates = buildInitialMaterialStates(legalAttachments);
    const currentStage = (
      attachments: readonly WechatPayApplymentAttachment[],
    ) => getReachableStage({
      unlockedStage: "submit",
      contactType: "LEGAL",
      attachments,
      materialStates: completeStates,
      supplementValid: true,
    });

    expect(currentStage(legalAttachments)).toBe("submit");
    expect(currentStage(legalAttachments.slice(1))).toBe("materials");
    expect(currentStage(legalAttachments)).toBe("submit");
  });

  test("relocks submit when LEGAL changes to SUPER without contact IDs", () => {
    expect(getReachableStage({
      unlockedStage: "submit",
      contactType: "SUPER",
      attachments: legalAttachments,
      materialStates: buildInitialMaterialStates(legalAttachments),
      supplementValid: true,
    })).toBe("materials");

    const superAttachments = [
      ...legalAttachments,
      attachment("contact_id_card_front", "confirmed"),
      attachment("contact_id_card_back", "manual"),
    ];
    expect(getReachableStage({
      unlockedStage: "submit",
      contactType: "SUPER",
      attachments: superAttachments,
      materialStates: buildInitialMaterialStates(superAttachments),
      supplementValid: true,
    })).toBe("submit");
  });

  test("relocks later stages while recognition becomes unresolved", () => {
    const replacedLicense = {
      ...attachment("license_copy", "review_required"),
      object_key: "tenant/replaced-license.jpg",
    };
    const replacedAttachments = [
      replacedLicense,
      ...legalAttachments.slice(1),
    ];
    const unresolvedStates = {
      ...buildInitialMaterialStates(replacedAttachments),
      license_copy: materialState(
        "license_copy",
        "review_required",
        replacedLicense.object_key,
      ),
    };

    expect(getReachableStage({
      unlockedStage: "submit",
      contactType: "LEGAL",
      attachments: replacedAttachments,
      materialStates: unresolvedStates,
      supplementValid: true,
    })).toBe("recognition");
    expect(getReachableStage({
      unlockedStage: "submit",
      contactType: "LEGAL",
      attachments: replacedAttachments,
      materialStates: {
        ...unresolvedStates,
        license_copy: materialState(
          "license_copy",
          "confirmed",
          replacedLicense.object_key,
        ),
      },
      supplementValid: true,
    })).toBe("submit");
  });

  test("keeps submit unreachable while supplement fields are invalid", () => {
    const reachableStage = getReachableStage({
      unlockedStage: "submit",
      contactType: "LEGAL",
      attachments: legalAttachments,
      materialStates: buildInitialMaterialStates(legalAttachments),
      supplementValid: false,
    });

    expect(reachableStage).toBe("supplement");
    expect(isApplymentStageReachable("supplement", reachableStage)).toBe(true);
    expect(isApplymentStageReachable("submit", reachableStage)).toBe(false);
  });
});
