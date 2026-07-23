import { describe, expect, test } from "bun:test";
import {
  reportGenerationGuardedError,
  runGenerationGuardedSave,
} from "./finance-wechat-pay-applyment-save-generation";

describe("wechat pay applyment generation guarded save", () => {
  test("does not commit an old request result after resetting to another draft", async () => {
    let releaseRequest: (value: { id: string }) => void = () => undefined;
    const request = new Promise<{ id: string }>((resolve) => {
      releaseRequest = resolve;
    });
    let generation = 1;
    let currentApplymentId = "draft-b";
    const save = runGenerationGuardedSave({
      request: () => request,
      isCurrent: () => generation === 1,
      commit: (result) => {
        currentApplymentId = result.id;
      },
    });

    generation = 2;
    releaseRequest({ id: "draft-a" });

    expect((await save).type).toBe("stale");
    expect(currentApplymentId).toBe("draft-b");
  });

  test("does not report an old request rejection after resetting drafts", async () => {
    let rejectRequest: (error: unknown) => void = () => undefined;
    const request = new Promise<void>((_resolve, reject) => {
      rejectRequest = reject;
    });
    let generation = 1;
    const reportedErrors: unknown[] = [];
    const materialErrors: string[] = [];
    const checkpointErrors: string[] = [];
    const report = (currentError: unknown) => {
      reportedErrors.push(currentError);
      materialErrors.push("failed");
      checkpointErrors.push("failed");
    };
    expect(reportGenerationGuardedError({
      generation: 1,
      isCurrent: (candidate) => candidate === generation,
      error: new Error("current save failed"),
      report,
    })).toBe(true);
    expect(reportedErrors).toHaveLength(1);
    reportedErrors.length = 0;
    materialErrors.length = 0;
    checkpointErrors.length = 0;

    const completion = request.catch((error) => {
      reportGenerationGuardedError({
        generation: 1,
        isCurrent: (candidate) => candidate === generation,
        error,
        report,
      });
    });

    generation = 2;
    rejectRequest(new Error("draft-a save failed"));
    await completion;

    expect(reportedErrors).toEqual([]);
    expect(materialErrors).toEqual([]);
    expect(checkpointErrors).toEqual([]);
  });
});
