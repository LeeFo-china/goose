import { describe, expect, test } from "bun:test";

import {
  APPLYMENT_STAGE_KEYS,
  buildInitialMaterialState,
  buildInitialMaterialStates,
  canLeaveMaterialsStage,
  canLeaveRecognitionStage,
  getApplymentProgress,
  getInitialApplymentStage,
  getRequiredApplymentAttachments,
  updateAttachmentOcrReviewMetadata,
  type ApplymentMaterialState,
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

const legalAttachments = [
  attachment("license_copy", "confirmed"),
  attachment("legal_representative_id_card_front", "manual"),
  attachment("legal_representative_id_card_back", "confirmed"),
] as const;

describe("wechat pay applyment flow model", () => {
  test("uses the canonical OCR-first stage order and stage progress", () => {
    expect(APPLYMENT_STAGE_KEYS).toEqual([
      "materials",
      "recognition",
      "supplement",
      "submit",
    ]);
    expect(getApplymentProgress("materials")).toBe(25);
    expect(getApplymentProgress("recognition")).toBe(50);
    expect(getApplymentProgress("submit")).toBe(100);
  });

  test("adds contact ID cards only for a SUPER contact", () => {
    expect(getRequiredApplymentAttachments("LEGAL")).toEqual([
      "license_copy",
      "legal_representative_id_card_front",
      "legal_representative_id_card_back",
    ]);
    expect(getRequiredApplymentAttachments("SUPER")).toEqual([
      "license_copy",
      "legal_representative_id_card_front",
      "legal_representative_id_card_back",
      "contact_id_card_front",
      "contact_id_card_back",
    ]);
  });

  test("restores persisted confirmed metadata with empty transient OCR data", () => {
    expect(buildInitialMaterialState({
      category: "license_copy",
      object_key: "tenant/license.jpg",
      ocr_recognition_id: RECOGNITION_ID,
      ocr_review_status: "confirmed",
    })).toEqual({
      status: "confirmed",
      attachmentObjectKey: "tenant/license.jpg",
      recognitionId: RECOGNITION_ID,
      fields: [],
      warnings: [],
      error: null,
    });
  });

  test("restores absent or non-persistable status as uploaded", () => {
    expect(buildInitialMaterialState(
      attachment("license_copy"),
    ).status).toBe("uploaded");

    const transientAttachment = {
      ...attachment("license_copy"),
      ocr_review_status: "recognizing",
    } as unknown as WechatPayApplymentAttachment;
    expect(buildInitialMaterialState(transientAttachment).status).toBe(
      "uploaded",
    );
  });

  test("keeps only OCR-capable categories and lets the last replacement win", () => {
    const states = buildInitialMaterialStates([
      {
        ...attachment("license_copy", "failed"),
        object_key: "tenant/old-license.jpg",
      },
      {
        category: "business_scene_material",
        object_key: "tenant/store.jpg",
      },
      {
        category: "backend_future_category",
        object_key: "tenant/future.jpg",
      },
      {
        ...attachment("license_copy", "confirmed"),
        object_key: "tenant/new-license.jpg",
        ocr_recognition_id: RECOGNITION_ID,
      },
    ]);

    expect(states).toEqual({
      license_copy: {
        status: "confirmed",
        attachmentObjectKey: "tenant/new-license.jpg",
        recognitionId: RECOGNITION_ID,
        fields: [],
        warnings: [],
        error: null,
      },
    });
    expect(states).not.toHaveProperty("backend_future_category");
  });

  test("updates only matching attachment metadata without mutating input", () => {
    const attachments: readonly WechatPayApplymentAttachment[] = [
      attachment("license_copy", "uploaded"),
      attachment("legal_representative_id_card_front", "confirmed"),
    ];
    const before = structuredClone(attachments);

    const updated = updateAttachmentOcrReviewMetadata(
      attachments,
      attachments[0].object_key,
      {
        ocr_recognition_id: RECOGNITION_ID,
        ocr_review_status: "review_required",
      },
    );

    expect(updated).not.toBe(attachments);
    expect(updated).toEqual([
      {
        ...attachments[0],
        ocr_recognition_id: RECOGNITION_ID,
        ocr_review_status: "review_required",
      },
      attachments[1],
    ]);
    expect(updated[1]).toBe(attachments[1]);
    expect(attachments).toEqual(before);
  });

  test("blocks materials when a required LEGAL or SUPER attachment is missing", () => {
    expect(canLeaveMaterialsStage({
      contactType: "LEGAL",
      attachments: [],
      materialStates: {},
    })).toEqual({
      allowed: false,
      reason: "请先上传全部必传资料",
    });
    expect(canLeaveMaterialsStage({
      contactType: "SUPER",
      attachments: legalAttachments,
      materialStates: buildInitialMaterialStates(legalAttachments),
    })).toEqual({
      allowed: false,
      reason: "请先上传全部必传资料",
    });
  });

  test("blocks materials while any material is recognizing", () => {
    expect(canLeaveMaterialsStage({
      contactType: "LEGAL",
      attachments: legalAttachments,
      materialStates: {
        ...buildInitialMaterialStates(legalAttachments),
        settlement_account_proof: materialState(
          "settlement_account_proof",
          "recognizing",
        ),
      },
    })).toEqual({
      allowed: false,
      reason: "证照正在识别，请稍候",
    });
  });

  test("blocks recognition while an uploaded OCR-capable material needs review", () => {
    const attachments = [
      attachment("license_copy", "review_required"),
    ];

    expect(canLeaveRecognitionStage({
      attachments,
      materialStates: buildInitialMaterialStates(attachments),
    })).toEqual({
      allowed: false,
      reason: "请先核对全部证照识别结果或选择手动填写",
    });
  });

  test("allows recognition when all uploaded OCR materials are manual or confirmed", () => {
    expect(canLeaveRecognitionStage({
      attachments: [
        ...legalAttachments,
        attachment("business_scene_material"),
      ],
      materialStates: buildInitialMaterialStates(legalAttachments),
    })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  test("also blocks an optional settlement proof that still needs review", () => {
    const attachments = [
      ...legalAttachments,
      attachment("settlement_account_proof", "review_required"),
    ];

    expect(canLeaveRecognitionStage({
      attachments,
      materialStates: buildInitialMaterialStates(attachments),
    })).toEqual({
      allowed: false,
      reason: "请先核对全部证照识别结果或选择手动填写",
    });
  });

  test("resumes a new draft at materials and failed OCR at recognition", () => {
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: [],
      materialStates: {},
      blockerStages: [],
    })).toBe("materials");

    const failedAttachments = [
      attachment("license_copy", "failed"),
      attachment("legal_representative_id_card_front", "confirmed"),
      attachment("legal_representative_id_card_back", "manual"),
    ];
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: failedAttachments,
      materialStates: buildInitialMaterialStates(failedAttachments),
      blockerStages: ["supplement"],
    })).toBe("recognition");
  });

  test("resumes at the earliest canonical blocker after OCR is closed", () => {
    const materialStates = buildInitialMaterialStates(legalAttachments);
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: legalAttachments,
      materialStates,
      blockerStages: ["supplement"],
    })).toBe("supplement");
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: legalAttachments,
      materialStates,
      blockerStages: ["supplement", "materials"],
    })).toBe("materials");
    expect(getInitialApplymentStage({
      contactType: "LEGAL",
      attachments: legalAttachments,
      materialStates,
      blockerStages: ["submit"],
    })).toBe("submit");
  });

  test("does not mutate attachments while building or guarding state", () => {
    const attachments = legalAttachments.map((item) => ({ ...item }));
    const before = structuredClone(attachments);
    const states = buildInitialMaterialStates(attachments);

    canLeaveMaterialsStage({
      contactType: "LEGAL",
      attachments,
      materialStates: states,
    });
    canLeaveRecognitionStage({ attachments, materialStates: states });
    getInitialApplymentStage({
      contactType: "LEGAL",
      attachments,
      materialStates: states,
      blockerStages: ["supplement"],
    });

    expect(attachments).toEqual(before);
  });
});
