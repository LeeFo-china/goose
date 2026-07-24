import { describe, expect, test } from "bun:test";

import {
  buildInitialMaterialStates,
  buildRecoveredMaterialState,
  getMaterialRetryAction,
  getPendingRecognitionAttachments,
  isCurrentMaterialAttachment,
  rebaseUploadedApplymentAttachment,
  reconcileMaterialStates,
  replaceApplymentAttachment,
  runMaterialRecognitionOperation,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";
import {
  changeApplymentAttachments,
  MANUAL_ENTRY_PERSIST_ERROR,
  persistUnsupportedApplymentMaterialsAsManual,
} from "./finance-wechat-pay-applyment-manual-entry";

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

  test("rebases an uploaded attachment onto current OCR metadata", () => {
    const oldLicense = {
      ...attachment("license_copy", "uploaded"),
      object_key: "tenant/old-license.jpg",
    };
    const reviewedIdentity = {
      ...attachment(
        "legal_representative_id_card_front",
        "review_required",
      ),
      ocr_recognition_id: RECOGNITION_ID,
    };
    const uploadedLicense = {
      ...attachment("license_copy", "uploaded"),
      file_object_id: "22222222-2222-4222-8222-222222222222",
      object_key: "tenant/new-license.jpg",
      ocr_recognition_id: null,
    };

    const next = rebaseUploadedApplymentAttachment(
      [oldLicense, reviewedIdentity],
      uploadedLicense,
    );

    expect(next).toEqual([uploadedLicense, reviewedIdentity]);
    expect(next.filter((item) => item.category === "license_copy")).toHaveLength(
      1,
    );
    expect(next[1]).toMatchObject({
      object_key: reviewedIdentity.object_key,
      ocr_recognition_id: RECOGNITION_ID,
      ocr_review_status: "review_required",
    });
  });

  test("keeps recognition results when draft persistence fails and retries only persistence", async () => {
    let recognitionCalls = 0;
    let persistenceCalls = 0;
    let state = materialState("license_copy", "recognizing");
    const recognition = {
      id: RECOGNITION_ID,
      fields: [{
        key: "license_name",
        label: "主体名称",
        value: "示例商户",
        normalized: true,
        sensitive: false,
        confidence: 0.99,
      }],
      warnings: [],
    };

    const outcome = await runMaterialRecognitionOperation({
      recognize: async () => {
        recognitionCalls += 1;
        return recognition;
      },
      commitRecognition: (result) => {
        state = {
          status: "review_required",
          attachmentObjectKey: "tenant/license_copy.jpg",
          recognitionId: result.id,
          fields: result.fields,
          warnings: result.warnings,
          error: null,
        };
        return true;
      },
      persistRecognition: async () => {
        persistenceCalls += 1;
        throw new Error("save unavailable");
      },
    });

    expect(outcome.type).toBe("persist_failed");
    state = { ...state, error: "识别结果保存失败" };
    expect(state).toMatchObject({
      status: "review_required",
      recognitionId: RECOGNITION_ID,
      fields: recognition.fields,
      error: "识别结果保存失败",
    });
    expect(getMaterialRetryAction(state)).toBe("persist");

    if (getMaterialRetryAction(state) === "persist") {
      persistenceCalls += 1;
      state = { ...state, error: null };
    }

    expect(recognitionCalls).toBe(1);
    expect(persistenceCalls).toBe(2);
    expect(state.status).toBe("review_required");
    expect(state.recognitionId).toBe(RECOGNITION_ID);
  });

  test("retries an uploaded attachment checkpoint without starting OCR first", () => {
    const state: ApplymentMaterialState = {
      ...materialState("license_copy", "uploaded"),
      error: "附件保存失败",
    };

    expect(getMaterialRetryAction(state)).toBe("persist");
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
      legal_representative_id_card_front: {
        ...materialState(
          "legal_representative_id_card_front",
          "uploaded",
        ),
        error: "附件保存失败",
      },
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
    expect(reconcileMaterialStates([], states)).toEqual({});
  });

  test("moves a failed material to manual immediately without a refresh", () => {
    const manualLicense = {
      ...attachment("license_copy", "manual"),
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
    const failedState: ApplymentMaterialState = {
      status: "failed",
      attachmentObjectKey: manualLicense.object_key,
      recognitionId: RECOGNITION_ID,
      fields,
      warnings,
      error: "证照识别失败",
    };

    expect(reconcileMaterialStates(
      [manualLicense],
      { license_copy: failedState },
    )).toEqual({
      license_copy: {
        status: "manual",
        attachmentObjectKey: manualLicense.object_key,
        recognitionId: RECOGNITION_ID,
        fields,
        warnings,
        error: null,
      },
    });
  });

  test("keeps the local manual state when persistence fails", async () => {
    const failedLicense = {
      ...attachment("license_copy", "failed"),
      ocr_recognition_id: RECOGNITION_ID,
    };
    const manualLicense = {
      ...attachment("license_copy", "manual"),
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
    const manualState: ApplymentMaterialState = {
      status: "manual",
      attachmentObjectKey: manualLicense.object_key,
      recognitionId: RECOGNITION_ID,
      fields,
      warnings,
      error: null,
    };
    let currentAttachments: WechatPayApplymentAttachment[] = [failedLicense];
    let currentStates: ApplymentMaterialStateMap = {
      license_copy: {
        ...manualState,
        status: "failed",
        error: "证照识别失败",
      },
    };
    let persistedSource = "";
    let reportedError = "";
    let operationErrorCalls = 0;

    await expect(changeApplymentAttachments({
      currentAttachments,
      currentStates,
      nextAttachments: [manualLicense],
      getCurrentAttachments: () => currentAttachments,
      commitLocal: (attachments, states) => {
        currentAttachments = attachments;
        currentStates = states;
      },
      getCurrentStates: () => currentStates,
      commitStates: (states) => {
        currentStates = states;
      },
      enqueue: (operation) => operation(),
      isActive: () => true,
      captureRollback: () => () => undefined,
      persist: async (input) => {
        persistedSource = input.draftUpdateSource;
        throw new Error("save unavailable");
      },
      clearError: () => undefined,
      reportError: (error) => {
        reportedError = error;
      },
      reportOperationError: () => {
        operationErrorCalls += 1;
      },
    })).rejects.toThrow("save unavailable");

    expect(currentStates.license_copy).toEqual({
      ...manualState,
      status: "manual",
      error: MANUAL_ENTRY_PERSIST_ERROR,
    });
    expect(getMaterialRetryAction(currentStates.license_copy)).toBe("persist");
    expect(currentAttachments[0]).toMatchObject({
      object_key: "tenant/license_copy.jpg",
      ocr_recognition_id: RECOGNITION_ID,
      ocr_review_status: "manual",
    });
    expect(persistedSource).toBe("manual_entry");
    expect(reportedError).toBe(MANUAL_ENTRY_PERSIST_ERROR);
    expect(operationErrorCalls).toBe(0);
  });

  test("keeps automatic manual fallback local when its checkpoint fails", async () => {
    const license = {
      ...attachment("license_copy", "uploaded"),
      file_object_id: "22222222-2222-4222-8222-222222222222",
    };
    let currentAttachments: WechatPayApplymentAttachment[] = [license];
    let currentStates = buildInitialMaterialStates(currentAttachments);
    let persistedSource = "";
    let reportedError = "";

    await persistUnsupportedApplymentMaterialsAsManual({
      attachments: currentAttachments,
      materialStates: currentStates,
      supportedDocumentTypes: new Set(),
      excludedObjectKeys: new Set(),
      isActive: () => true,
      commitLocal: (attachments, states) => {
        currentAttachments = attachments;
        currentStates = states;
      },
      commitStates: (states) => {
        currentStates = states;
      },
      persist: async (input) => {
        persistedSource = input.draftUpdateSource;
        throw new Error("save unavailable");
      },
      reportError: (message) => {
        reportedError = message;
      },
    });

    expect(currentAttachments[0]).toMatchObject({
      object_key: license.object_key,
      ocr_review_status: "manual",
    });
    expect(currentStates.license_copy).toMatchObject({
      status: "manual",
      attachmentObjectKey: license.object_key,
      error: MANUAL_ENTRY_PERSIST_ERROR,
    });
    expect(getMaterialRetryAction(currentStates.license_copy)).toBe("persist");
    expect(persistedSource).toBe("manual_entry");
    expect(reportedError).toBe(MANUAL_ENTRY_PERSIST_ERROR);
  });
});
