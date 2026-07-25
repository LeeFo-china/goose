import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_CHECKPOINT_ERROR,
  checkpointApplymentAttachment,
  createMaterialOperationGeneration,
  retainAttachmentCheckpointErrors,
  retainUnpersistedAttachmentKeys,
  runAttachmentCheckpoint,
} from "./finance-wechat-pay-applyment-checkpoint";

describe("wechat pay applyment attachment checkpoint", () => {
  test("keeps a failed upload out of OCR and resumes once after save retry", async () => {
    const generation = createMaterialOperationGeneration();
    const objectKey = "tenant/license.jpg";
    const unpersisted = new Set([objectKey]);
    let error: string | null = null;
    let persistCalls = 0;
    let recognitionCalls = 0;

    const failed = await runAttachmentCheckpoint({
      generation: generation.current(),
      isCurrent: generation.isCurrent,
      persist: async () => {
        persistCalls += 1;
        throw new Error("save unavailable");
      },
      onFailed: () => {
        error = ATTACHMENT_CHECKPOINT_ERROR;
      },
      onPersisted: async () => {
        unpersisted.delete(objectKey);
        recognitionCalls += 1;
      },
    });

    expect(failed.type).toBe("persist_failed");
    expect(unpersisted.has(objectKey)).toBe(true);
    expect(error as string | null).toBe(ATTACHMENT_CHECKPOINT_ERROR);
    expect(recognitionCalls).toBe(0);

    const retried = await runAttachmentCheckpoint({
      generation: generation.current(),
      isCurrent: generation.isCurrent,
      persist: async () => {
        persistCalls += 1;
      },
      onFailed: () => undefined,
      onPersisted: async () => {
        unpersisted.delete(objectKey);
        error = null;
        recognitionCalls += 1;
      },
    });

    expect(retried.type).toBe("persisted");
    expect(persistCalls).toBe(2);
    expect(unpersisted.has(objectKey)).toBe(false);
    expect(error).toBeNull();
    expect(recognitionCalls).toBe(1);
  });

  test("ignores old generations before persist and after in-flight results", async () => {
    const generation = createMaterialOperationGeneration();
    let persistCalls = 0;
    let committed = 0;

    const staleBeforeStart = generation.current();
    generation.advance();
    const skipped = await runAttachmentCheckpoint({
      generation: staleBeforeStart,
      isCurrent: generation.isCurrent,
      persist: async () => {
        persistCalls += 1;
      },
      onFailed: () => undefined,
      onPersisted: async () => {
        committed += 1;
      },
    });
    expect(skipped.type).toBe("stale");
    expect(persistCalls).toBe(0);

    let releasePersist: () => void = () => undefined;
    const pendingPersist = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    const inFlight = runAttachmentCheckpoint({
      generation: generation.current(),
      isCurrent: generation.isCurrent,
      persist: async () => {
        persistCalls += 1;
        await pendingPersist;
      },
      onFailed: () => undefined,
      onPersisted: async () => {
        committed += 1;
      },
    });
    generation.advance();
    releasePersist();

    expect((await inFlight).type).toBe("stale");
    expect(persistCalls).toBe(1);
    expect(committed).toBe(0);
  });

  test("drops stale unpersisted keys after replacement or removal", () => {
    const unpersisted = new Set(["tenant/old.jpg", "tenant/kept.jpg"]);

    retainUnpersistedAttachmentKeys(unpersisted, [
      {
        category: "license_copy",
        object_key: "tenant/new.jpg",
      },
      {
        category: "legal_representative_id_card_front",
        object_key: "tenant/kept.jpg",
      },
    ]);
    expect([...unpersisted]).toEqual(["tenant/kept.jpg"]);

    retainUnpersistedAttachmentKeys(unpersisted, []);
    expect(unpersisted.size).toBe(0);
  });

  test("shows and clears a non-OCR checkpoint error without recognition", async () => {
    const attachment = {
      category: "business_scene_material" as const,
      object_key: "tenant/store.jpg",
    };
    let errors = {};
    let persistCalls = 0;
    let recognitionCalls = 0;
    let manualCalls = 0;
    let reportedError = "";
    let shouldFail = true;
    const unpersisted = new Set([attachment.object_key]);
    const generation = createMaterialOperationGeneration();

    const checkpoint = () => checkpointApplymentAttachment({
      attachment,
      generation: generation.current(),
      isCurrent: generation.isCurrent,
      isCurrentAttachment: () => true,
      persist: async () => {
        persistCalls += 1;
        if (shouldFail) throw new Error("save unavailable");
      },
      getErrors: () => errors,
      commitErrors: (nextErrors) => {
        errors = nextErrors;
      },
      removeUnpersisted: (objectKey) => unpersisted.delete(objectKey),
      hasOutstandingErrors: () => Object.keys(errors).length > 0,
      reportError: (message) => {
        reportedError = message;
      },
      capabilityLoading: false,
      supportedDocumentTypes: new Set(["business_license"]),
      markUnsupportedManual: async () => {
        manualCalls += 1;
      },
      recognize: async () => {
        recognitionCalls += 1;
      },
    });

    const failed = await checkpoint();
    expect(failed.type).toBe("persist_failed");
    expect(errors).toEqual({
      [attachment.object_key]: ATTACHMENT_CHECKPOINT_ERROR,
    });
    expect(reportedError).toBe(ATTACHMENT_CHECKPOINT_ERROR);
    expect(unpersisted.has(attachment.object_key)).toBe(true);

    shouldFail = false;
    const retried = await checkpoint();
    expect(retried.type).toBe("persisted");
    expect(persistCalls).toBe(2);
    expect(errors).toEqual({});
    expect(reportedError).toBe("");
    expect(unpersisted.has(attachment.object_key)).toBe(false);
    expect(recognitionCalls).toBe(0);
    expect(manualCalls).toBe(0);
  });

  test("removes checkpoint errors for replaced or deleted attachments", () => {
    const errors = {
      "tenant/old.jpg": ATTACHMENT_CHECKPOINT_ERROR,
      "tenant/kept.jpg": ATTACHMENT_CHECKPOINT_ERROR,
    };
    expect(retainAttachmentCheckpointErrors(errors, [
      {
        category: "license_copy",
        object_key: "tenant/new.jpg",
      },
      {
        category: "business_scene_material",
        object_key: "tenant/kept.jpg",
      },
    ])).toEqual({
      "tenant/kept.jpg": ATTACHMENT_CHECKPOINT_ERROR,
    });
    expect(retainAttachmentCheckpointErrors(errors, [])).toEqual({});
  });

  test("starts recognition after a pending save completes", async () => {
    const attachment = {
      category: "license_copy" as const,
      file_object_id: "file-1",
      object_key: "tenant/license.jpg",
    };
    let releasePersist: () => void = () => undefined;
    const pendingPersist = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    let recognitionCalls = 0;
    const generation = createMaterialOperationGeneration();

    const checkpoint = checkpointApplymentAttachment({
      attachment,
      generation: generation.current(),
      isCurrent: generation.isCurrent,
      isCurrentAttachment: () => true,
      persist: () => pendingPersist,
      getErrors: () => ({}),
      commitErrors: () => undefined,
      removeUnpersisted: () => undefined,
      hasOutstandingErrors: () => false,
      reportError: () => undefined,
      capabilityLoading: false,
      supportedDocumentTypes: new Set(["business_license"]),
      markUnsupportedManual: async () => undefined,
      recognize: async () => {
        recognitionCalls += 1;
      },
    });

    releasePersist();
    expect((await checkpoint).type).toBe("persisted");
    expect(recognitionCalls).toBe(1);
  });
});
