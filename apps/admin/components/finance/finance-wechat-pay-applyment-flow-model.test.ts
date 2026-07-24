import { describe, expect, test } from "bun:test";

import {
  buildInitialMaterialState,
  buildInitialMaterialStates,
  updateAttachmentOcrReviewMetadata,
  type ApplymentAttachmentOcrReviewMetadata,
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

describe("wechat pay applyment flow model", () => {
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

  test("requires both nullable OCR metadata keys and readonly material state", () => {
    const metadata: ApplymentAttachmentOcrReviewMetadata = {
      ocr_recognition_id: null,
      ocr_review_status: null,
    };
    expect(updateAttachmentOcrReviewMetadata(
      [attachment("license_copy", "confirmed")],
      "tenant/license_copy.jpg",
      metadata,
    )[0]).toMatchObject(metadata);

    if (false) {
      const state = materialState("license_copy", "confirmed");
      // @ts-expect-error material state fields are immutable
      state.status = "failed";
      const states: ApplymentMaterialStateMap = {};
      // @ts-expect-error material state maps are immutable
      states.license_copy = state;
      // @ts-expect-error both persisted OCR metadata keys are required
      updateAttachmentOcrReviewMetadata([], "tenant/license.jpg", {
        ocr_recognition_id: null,
      });
    }
  });
});
