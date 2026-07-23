import { describe, expect, test } from "bun:test";

import {
  getMaterialRetryAction,
  reconcileMaterialStates,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  changeApplymentAttachments,
  createApplymentAttachmentMutationIntent,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  createOcrReviewMutationGeneration,
  runGenerationGuardedOcrReviewMutation,
  setupOcrReviewMutationGeneration,
} from "./finance-wechat-pay-applyment-ocr-mutation";
import {
  buildWechatPayApplymentPartialDraftPayload,
} from "./finance-wechat-pay-applyment-schema";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

const RECOGNITION_ID = "11111111-1111-4111-8111-111111111111";

function deferredRejection() {
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((_, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

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
  test("does not report an old draft confirmation rejection", async () => {
    const runtime = createOcrReviewMutationGeneration();
    const cleanup = setupOcrReviewMutationGeneration(runtime);
    const request = deferredRejection();
    const errors: string[] = [];
    const generation = runtime.current();
    const outcome = runGenerationGuardedOcrReviewMutation({
      generation,
      isCurrentGeneration: runtime.isCurrent,
      mutate: () => request.promise,
      fallbackMessage: "识别结果保存失败",
      onError: (message) => errors.push(message),
    });

    cleanup();
    setupOcrReviewMutationGeneration(runtime);
    request.reject(new Error("old confirm failed"));

    await expect(outcome).resolves.toEqual({ type: "stale" });
    expect(errors).toEqual([]);
  });

  test("does not report an old draft manual rejection", async () => {
    const runtime = createOcrReviewMutationGeneration();
    const cleanup = setupOcrReviewMutationGeneration(runtime);
    const request = deferredRejection();
    const errors: string[] = [];
    const generation = runtime.current();
    const outcome = runGenerationGuardedOcrReviewMutation({
      generation,
      isCurrentGeneration: runtime.isCurrent,
      mutate: () => request.promise,
      fallbackMessage: "手动填写状态保存失败",
      onError: (message) => errors.push(message),
    });

    cleanup();
    setupOcrReviewMutationGeneration(runtime);
    request.reject(new Error("old manual failed"));

    await expect(outcome).resolves.toEqual({ type: "stale" });
    expect(errors).toEqual([]);
  });

  test("does not report a rejection after the OCR review unmounts", async () => {
    const runtime = createOcrReviewMutationGeneration();
    const cleanup = setupOcrReviewMutationGeneration(runtime);
    const request = deferredRejection();
    const errors: string[] = [];
    const outcome = runGenerationGuardedOcrReviewMutation({
      generation: runtime.current(),
      isCurrentGeneration: runtime.isCurrent,
      mutate: () => request.promise,
      fallbackMessage: "识别结果保存失败",
      onError: (message) => errors.push(message),
    });

    cleanup();
    request.reject(new Error("unmounted confirm failed"));

    await expect(outcome).resolves.toEqual({ type: "stale" });
    expect(errors).toEqual([]);
  });

  test("allows submission after StrictMode setup cleanup setup replay", async () => {
    const runtime = createOcrReviewMutationGeneration();
    const firstCleanup = setupOcrReviewMutationGeneration(runtime);
    firstCleanup();
    const secondCleanup = setupOcrReviewMutationGeneration(runtime);
    firstCleanup();
    let persisted = 0;

    const outcome = await runGenerationGuardedOcrReviewMutation({
      generation: runtime.current(),
      isCurrentGeneration: runtime.isCurrent,
      mutate: async () => {
        persisted += 1;
      },
      fallbackMessage: "识别结果保存失败",
      onError: () => undefined,
    });

    expect(outcome).toEqual({ type: "persisted" });
    expect(persisted).toBe(1);
    secondCleanup();
  });

  test("preserves a manual persistence error through unrelated reconciliation", () => {
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

    const reconciled = reconcileMaterialStates(
      [
        manualAttachment,
        {
          category: "legal_representative_id_card_front",
          object_key: "tenant/identity-front.jpg",
        },
      ],
      { license_copy: manualState },
    );

    expect(reconciled.license_copy).toEqual(manualState);
    expect(getMaterialRetryAction(reconciled.license_copy)).toBe("persist");
  });

  test("clears a manual persistence error only after persistence succeeds", async () => {
    const fixture = createReviewFixture();
    const manualAttachment: WechatPayApplymentAttachment = {
      ...fixture.originalAttachment,
      ocr_review_status: "manual",
    };
    let attachments = [manualAttachment];
    let states: ApplymentMaterialStateMap = {
      license_copy: {
        ...fixture.originalState,
        status: "manual",
        error: "手动填写状态保存失败",
      },
    };

    await changeApplymentAttachments({
      currentAttachments: attachments,
      currentStates: states,
      nextAttachments: attachments,
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
      captureRollback: () => () => undefined,
      persist: async () => undefined,
      clearError: () => undefined,
      reportError: () => undefined,
      reportOperationError: () => undefined,
    });

    expect(states.license_copy).toEqual({
      ...fixture.originalState,
      status: "manual",
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

  test("persists OCR values and confirmed metadata in the same mutation", async () => {
    const fixture = createReviewFixture();
    const form = new FormData();
    let payloads: Record<string, unknown>[] = [];

    await changeApplymentAttachments({
      currentAttachments: fixture.attachments,
      currentStates: fixture.states,
      nextAttachments: [fixture.confirmedAttachment],
      intent: createApplymentAttachmentMutationIntent(
        fixture.attachments,
        [fixture.confirmedAttachment],
      ),
      relatedMutation: {
        commitOptimistic: () => {
          form.set("license_name", "识别后的主体名称");
        },
        rollback: () => {
          form.delete("license_name");
        },
      },
      getCurrentAttachments: () => fixture.attachments,
      commitLocal: () => undefined,
      getCurrentStates: () => fixture.states,
      commitStates: () => undefined,
      enqueue: (operation) => operation(),
      isActive: () => true,
      captureRollback: () => () => undefined,
      persist: async ({ attachments }) => {
        payloads = [
          buildWechatPayApplymentPartialDraftPayload(form, { attachments }),
        ];
      },
      clearError: () => undefined,
      reportError: () => undefined,
      reportOperationError: () => undefined,
    });

    expect(payloads).toEqual([{
      license_name: "识别后的主体名称",
      attachments: [fixture.confirmedAttachment],
    }]);
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
