import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_CHECKPOINT_ERROR,
  createMaterialOperationGeneration,
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
});
