import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_CHECKPOINT_ERROR,
  createAttachmentChangeCheckpointSnapshot,
  retainAttachmentCheckpointErrors,
  retainUnpersistedAttachmentKeys,
  restoreAttachmentChangeCheckpointSnapshot,
} from "./finance-wechat-pay-applyment-checkpoint";
import {
  buildInitialMaterialStates,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  changeApplymentAttachments,
  createApplymentAttachmentMutationIntent,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  createApplymentAttachmentRetryCoordinator,
} from "./finance-wechat-pay-applyment-material-retry";
import { changeApplymentContactTypeWithRollback } from "./finance-wechat-pay-applyment-contact-type";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

function attachment(
  category: WechatPayApplymentAttachmentCategory,
): WechatPayApplymentAttachment {
  return {
    category,
    object_key: `tenant/${category}.jpg`,
    ocr_review_status: "confirmed",
  };
}

describe("wechat pay applyment attachment changes", () => {
  test("rolls back a deleted attachment when persistence fails", async () => {
    const license = attachment("license_copy");
    const baselineStates: ApplymentMaterialStateMap = {
      ...buildInitialMaterialStates([license]),
      license_copy: {
        status: "uploaded",
        attachmentObjectKey: license.object_key,
        recognitionId: null,
        fields: [],
        warnings: [],
        error: null,
      },
    };
    let currentAttachments: WechatPayApplymentAttachment[] = [license];
    let currentStates = baselineStates;
    let checkpointErrors = {
      [license.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
    };
    const unpersistedObjectKeys = new Set([license.object_key]);
    const snapshot = createAttachmentChangeCheckpointSnapshot({
      attachments: currentAttachments,
      materialStates: currentStates,
      checkpointErrors,
      unpersistedObjectKeys,
    });
    let reportedError = "";

    await expect(changeApplymentAttachments({
      currentAttachments,
      currentStates,
      nextAttachments: [],
      getCurrentAttachments: () => currentAttachments,
      commitLocal: (attachments, states) => {
        currentAttachments = attachments;
        currentStates = states;
        checkpointErrors = {};
        unpersistedObjectKeys.clear();
      },
      getCurrentStates: () => currentStates,
      commitStates: (states) => {
        currentStates = states;
      },
      enqueue: (operation) => operation(),
      isActive: () => true,
      captureRollback: () => () =>
        restoreAttachmentChangeCheckpointSnapshot({
          snapshot,
          unpersistedObjectKeys,
          commitLocal: (attachments, states) => {
            currentAttachments = attachments;
            currentStates = states;
          },
          commitCheckpointErrors: (errors) => {
            checkpointErrors = errors;
          },
        }),
      persist: async () => {
        throw new Error("save unavailable");
      },
      clearError: () => undefined,
      reportError: () => undefined,
      reportOperationError: (error) => {
        reportedError = error instanceof Error ? error.message : "failed";
      },
    })).rejects.toThrow("save unavailable");

    expect(currentAttachments).toEqual([license]);
    expect(currentStates).toEqual(baselineStates);
    expect([...unpersistedObjectKeys]).toEqual([license.object_key]);
    expect(checkpointErrors).toEqual({
      [license.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
    });
    expect(reportedError).toBe("save unavailable");

    let checkpointCalls = 0;
    let recognitionCalls = 0;
    const retry = createApplymentAttachmentRetryCoordinator({
      getAttachments: () => currentAttachments,
      getMaterialStates: () => currentStates,
      getCheckpointErrors: () => checkpointErrors,
      enqueue: (operation) => operation(),
      checkpoint: async () => {
        checkpointCalls += 1;
      },
      recognize: async () => {
        recognitionCalls += 1;
      },
    });
    await retry.retrySave(license);
    expect(checkpointCalls).toBe(1);
    expect(recognitionCalls).toBe(0);
  });

  test("rolls back SUPER contact type when contact deletion fails", async () => {
    const contact = attachment("contact_id_card_front");
    const committedTypes: string[] = [];
    let reportedError = "";

    await expect(changeApplymentContactTypeWithRollback({
      currentType: "SUPER",
      nextType: "LEGAL",
      attachments: [contact],
      commitType: (value) => {
        committedTypes.push(value);
      },
      changeAttachments: async (nextAttachments, options) => {
        expect(nextAttachments).toEqual([]);
        expect(options?.relatedMutation?.contactType).toBe("LEGAL");
        options?.relatedMutation?.commitOptimistic();
        options?.relatedMutation?.rollback();
        throw new Error("save unavailable");
      },
      reportError: (message) => {
        reportedError = message;
      },
    })).rejects.toThrow("save unavailable");

    expect(committedTypes).toEqual(["LEGAL", "SUPER"]);
    expect(reportedError).toBe("save unavailable");
  });

  test("rebases a second delete after the first delete fails", async () => {
    const harness = createOverlappingDeleteHarness([true, false]);
    const [license, legalFront] = harness.baseline;

    const first = harness.remove([legalFront]);
    const second = harness.remove([license]);
    const results = await Promise.allSettled([first, second]);

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(harness.currentAttachments()).toEqual([license]);
    expect(harness.serverAttachments()).toEqual([license]);
    expect(harness.unpersistedKeys()).toEqual([license.object_key]);
    expect(harness.checkpointErrors()).toEqual({
      [license.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
    });
    expect(harness.currentStates().license_copy).toMatchObject({
      status: "confirmed",
      attachmentObjectKey: license.object_key,
    });
    expect(
      harness.currentStates().legal_representative_id_card_front,
    ).toBeUndefined();
  });

  test("restores the complete baseline when overlapping deletes both fail", async () => {
    const harness = createOverlappingDeleteHarness([true, true]);
    const [license, legalFront] = harness.baseline;

    const first = harness.remove([legalFront]);
    const second = harness.remove([license]);
    const results = await Promise.allSettled([first, second]);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(harness.currentAttachments()).toEqual([license, legalFront]);
    expect(harness.serverAttachments()).toEqual([license, legalFront]);
    expect(harness.unpersistedKeys()).toEqual([
      license.object_key,
      legalFront.object_key,
    ]);
    expect(harness.checkpointErrors()).toEqual({
      [license.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
      [legalFront.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
    });
    expect(harness.currentStates()).toEqual(
      buildInitialMaterialStates([license, legalFront]),
    );
  });
});

function createOverlappingDeleteHarness(failures: boolean[]) {
  const baseline = [
    attachment("license_copy"),
    attachment("legal_representative_id_card_front"),
  ];
  let currentAttachments = [...baseline];
  let serverAttachments = [...baseline];
  let currentStates = buildInitialMaterialStates(baseline);
  let checkpointErrors = Object.fromEntries(
    baseline.map((item) => [item.object_key, ATTACHMENT_CHECKPOINT_ERROR]),
  );
  const unpersistedObjectKeys = new Set(
    baseline.map((item) => item.object_key),
  );
  let operationQueue = Promise.resolve();
  let persistIndex = 0;

  function enqueue(operation: () => Promise<void>) {
    const queued = operationQueue
      .catch(() => undefined)
      .then(operation);
    operationQueue = queued.catch(() => undefined);
    return queued;
  }

  function remove(nextAttachments: WechatPayApplymentAttachment[]) {
    const intent = createApplymentAttachmentMutationIntent(
      baseline,
      nextAttachments,
    );
    return changeApplymentAttachments({
      currentAttachments,
      currentStates,
      nextAttachments,
      intent,
      getCurrentAttachments: () => currentAttachments,
      commitLocal: (attachments, states) => {
        currentAttachments = attachments;
        currentStates = states;
        retainUnpersistedAttachmentKeys(
          unpersistedObjectKeys,
          attachments,
        );
        checkpointErrors = retainAttachmentCheckpointErrors(
          checkpointErrors,
          attachments,
        );
      },
      getCurrentStates: () => currentStates,
      commitStates: (states) => {
        currentStates = states;
      },
      enqueue,
      isActive: () => true,
      captureRollback: () => {
        const snapshot = createAttachmentChangeCheckpointSnapshot({
          attachments: currentAttachments,
          materialStates: currentStates,
          checkpointErrors,
          unpersistedObjectKeys,
        });
        return () => restoreAttachmentChangeCheckpointSnapshot({
          snapshot,
          unpersistedObjectKeys,
          commitLocal: (attachments, states) => {
            currentAttachments = attachments;
            currentStates = states;
          },
          commitCheckpointErrors: (errors) => {
            checkpointErrors = errors;
          },
        });
      },
      persist: async (input) => {
        const shouldFail = failures[persistIndex] ?? false;
        persistIndex += 1;
        if (shouldFail) throw new Error("save unavailable");
        serverAttachments = [...input.attachments];
      },
      clearError: () => undefined,
      reportError: () => undefined,
      reportOperationError: () => undefined,
    });
  }

  return {
    baseline,
    remove,
    currentAttachments: () => currentAttachments,
    serverAttachments: () => serverAttachments,
    currentStates: () => currentStates,
    checkpointErrors: () => checkpointErrors,
    unpersistedKeys: () => [...unpersistedObjectKeys],
  };
}
