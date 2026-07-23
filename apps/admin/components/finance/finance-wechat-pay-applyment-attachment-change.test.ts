import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_CHECKPOINT_ERROR,
  createAttachmentChangeCheckpointSnapshot,
  restoreAttachmentChangeCheckpointSnapshot,
} from "./finance-wechat-pay-applyment-checkpoint";
import {
  buildInitialMaterialStates,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import { changeApplymentAttachments } from "./finance-wechat-pay-applyment-manual-entry";
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
      rollback: () => restoreAttachmentChangeCheckpointSnapshot({
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
      changeAttachments: async (nextAttachments) => {
        expect(nextAttachments).toEqual([]);
        throw new Error("save unavailable");
      },
      reportError: (message) => {
        reportedError = message;
      },
    })).rejects.toThrow("save unavailable");

    expect(committedTypes).toEqual(["LEGAL", "SUPER"]);
    expect(reportedError).toBe("save unavailable");
  });
});
