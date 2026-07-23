import { describe, expect, test } from "bun:test";
import {
  createApplymentAttachmentRetryCoordinator,
} from "./finance-wechat-pay-applyment-material-retry";
import type {
  ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

const attachment: WechatPayApplymentAttachment = {
  category: "license_copy",
  file_object_id: "file-1",
  object_key: "tenant/license.jpg",
  ocr_review_status: "failed",
};

describe("wechat pay applyment material retry coordinator", () => {
  test("deduplicates double recognition retry and skips reviewed material", async () => {
    let attachments = [attachment];
    let states: ApplymentMaterialStateMap = {
      license_copy: {
        status: "failed",
        attachmentObjectKey: attachment.object_key,
        recognitionId: null,
        fields: [],
        warnings: [],
        error: "识别失败",
      },
    };
    let recognitionCalls = 0;
    let releaseRecognition: () => void = () => undefined;
    const pendingRecognition = new Promise<void>((resolve) => {
      releaseRecognition = resolve;
    });
    const retry = createApplymentAttachmentRetryCoordinator({
      getAttachments: () => attachments,
      getMaterialStates: () => states,
      getCheckpointErrors: () => ({}),
      enqueue: (operation) => operation(),
      checkpoint: async () => undefined,
      persistState: async () => undefined,
      recognize: async () => {
        recognitionCalls += 1;
        await pendingRecognition;
        states = {
          license_copy: {
            ...states.license_copy!,
            status: "review_required",
            recognitionId: "recognition-1",
            error: null,
          },
        };
      },
    });

    const first = retry.retryRecognition(attachment);
    const second = retry.retryRecognition(attachment);
    expect(first).toBe(second);
    releaseRecognition();
    await Promise.all([first, second]);
    expect(recognitionCalls).toBe(1);

    await retry.retryRecognition(attachment);
    expect(recognitionCalls).toBe(1);
    attachments = [];
  });

  test("rechecks current attachment and save error inside the queue", async () => {
    let attachments = [attachment];
    let checkpointErrors: Readonly<Record<string, string>> = {
      [attachment.object_key]: "附件保存失败",
    };
    let checkpointCalls = 0;
    let recognitionCalls = 0;
    const retry = createApplymentAttachmentRetryCoordinator({
      getAttachments: () => attachments,
      getMaterialStates: () => ({
        license_copy: {
          status: "failed",
          attachmentObjectKey: attachment.object_key,
          recognitionId: null,
          fields: [],
          warnings: [],
          error: "识别失败",
        },
      }),
      getCheckpointErrors: () => checkpointErrors,
      enqueue: async (operation) => {
        attachments = [];
        checkpointErrors = {};
        await operation();
      },
      checkpoint: async () => {
        checkpointCalls += 1;
      },
      persistState: async () => undefined,
      recognize: async () => {
        recognitionCalls += 1;
      },
    });

    await retry.retryRecognition(attachment);
    await retry.retrySave(attachment);
    expect(recognitionCalls).toBe(0);
    expect(checkpointCalls).toBe(0);
  });
});
