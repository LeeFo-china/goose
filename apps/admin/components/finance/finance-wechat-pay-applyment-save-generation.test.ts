import { describe, expect, test } from "bun:test";
import { runGenerationGuardedSave } from "./finance-wechat-pay-applyment-save-generation";

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
});
