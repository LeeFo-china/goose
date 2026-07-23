import { describe, expect, test } from "bun:test";

import {
  reconcileMaterialStates,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  changeApplymentAttachments,
  createApplymentAttachmentMutationIntent,
} from "./finance-wechat-pay-applyment-manual-entry";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

const RECOGNITION_ID = "11111111-1111-4111-8111-111111111111";

function createReviewFixture() {
  const originalAttachment: WechatPayApplymentAttachment = {
    category: "license_copy",
    object_key: "tenant/license.jpg",
    ocr_recognition_id: RECOGNITION_ID,
    ocr_review_status: "review_required",
  };
  const originalState: ApplymentMaterialState = {
    status: "review_required",
    attachmentObjectKey: originalAttachment.object_key,
    recognitionId: RECOGNITION_ID,
    fields: [{
      key: "license_name",
      label: "主体名称",
      value: "示例商户",
      normalized: true,
      sensitive: false,
      confidence: 0.99,
    }],
    warnings: [],
    error: null,
  };
  const confirmedAttachment: WechatPayApplymentAttachment = {
    ...originalAttachment,
    ocr_review_status: "confirmed",
  };
  let attachments = [originalAttachment];
  let states: ApplymentMaterialStateMap = { license_copy: originalState };
  let fieldSource = "manual";

  return {
    originalAttachment,
    originalState,
    confirmedAttachment,
    get attachments() {
      return attachments;
    },
    get states() {
      return states;
    },
    get fieldSource() {
      return fieldSource;
    },
    change(persist: () => Promise<void>) {
      return changeApplymentAttachments({
        currentAttachments: attachments,
        currentStates: states,
        nextAttachments: [confirmedAttachment],
        intent: createApplymentAttachmentMutationIntent(
          attachments,
          [confirmedAttachment],
        ),
        relatedMutation: {
          commitOptimistic: () => {
            fieldSource = "ocr";
          },
          rollback: () => {
            fieldSource = "manual";
          },
        },
        getCurrentAttachments: () => attachments,
        commitLocal: (nextAttachments, nextStates) => {
          attachments = nextAttachments;
          states = nextStates;
        },
        getCurrentStates: () => states,
        commitStates: (nextStates) => {
          states = nextStates;
        },
        enqueue: (operation) => operation(),
        isActive: () => true,
        captureRollback: () => {
          const rollbackAttachments = attachments;
          const rollbackStates = states;
          return () => {
            attachments = rollbackAttachments;
            states = rollbackStates;
          };
        },
        persist: persist,
        clearError: () => undefined,
        reportError: () => undefined,
        reportOperationError: () => undefined,
      });
    },
  };
}

describe("wechat pay applyment OCR state mutation", () => {
  test("idempotently synchronizes persisted manual metadata", () => {
    const fixture = createReviewFixture();
    const manualAttachment: WechatPayApplymentAttachment = {
      ...fixture.originalAttachment,
      ocr_review_status: "manual",
    };
    const manualState: ApplymentMaterialState = {
      ...fixture.originalState,
      status: "manual",
      error: "手动填写状态保存失败",
    };

    expect(reconcileMaterialStates(
      [manualAttachment],
      { license_copy: manualState },
    ).license_copy).toEqual({
      ...manualState,
      error: null,
    });
  });

  test("commits confirmed metadata to the current material state immediately", async () => {
    const fixture = createReviewFixture();

    await fixture.change(async () => {
      expect(fixture.attachments[0].ocr_review_status).toBe("confirmed");
      expect(fixture.states.license_copy?.status).toBe("confirmed");
      expect(fixture.fieldSource).toBe("ocr");
    });

    expect(fixture.states.license_copy).toEqual({
      ...fixture.originalState,
      status: "confirmed",
    });
  });

  test("rolls back attachments material state and field source on failure", async () => {
    const fixture = createReviewFixture();

    await expect(fixture.change(async () => {
      throw new Error("save unavailable");
    })).rejects.toThrow("save unavailable");

    expect(fixture.attachments).toEqual([fixture.originalAttachment]);
    expect(fixture.states).toEqual({
      license_copy: fixture.originalState,
    });
    expect(fixture.fieldSource).toBe("manual");
  });
});
