import { describe, expect, test } from "bun:test";
import { getOfficialApplymentProgress } from "./platform-wechat-pay-applyment-progress";
import { shouldAutoSyncWechatApplyment } from "./platform-wechat-pay-applyment-sync";

describe("platform wechat pay official applyment contract", () => {
  test("marks the tenant submission complete while platform review is current", () => {
    const progress = getOfficialApplymentProgress("submitted");

    expect(progress.value).toBe(17);
    expect(progress.stages.map((stage) => stage.state)).toEqual([
      "done",
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  test("distinguishes platform rejection from a WeChat rejection", () => {
    const platformRejected = getOfficialApplymentProgress("rejected", null);
    const wechatRejected = getOfficialApplymentProgress(
      "rejected",
      "APPLYMENT_STATE_REJECTED",
    );

    expect(platformRejected.stages[1]).toEqual({
      label: "平台审核",
      state: "issue",
    });
    expect(wechatRejected.stages[2]).toEqual({
      label: "微信审核",
      state: "issue",
    });
    expect(wechatRejected.stages[3]?.state).toBe("pending");
  });

  test("marks all stages complete only after tenant payment activation", () => {
    const opened = getOfficialApplymentProgress("opened");
    const bound = getOfficialApplymentProgress("bound");
    const active = getOfficialApplymentProgress("active");

    expect(opened.value).toBe(83);
    expect(opened.stages.at(-1)?.state).toBe("current");
    expect(bound.value).toBe(83);
    expect(bound.stages.at(-1)?.state).toBe("current");
    expect(active.value).toBe(100);
    expect(active.stages.every((stage) => stage.state === "done")).toBe(true);
  });

  test("auto-syncs only non-terminal official states with a backend action", () => {
    expect(shouldAutoSyncWechatApplyment("reviewing", true)).toBe(true);
    expect(shouldAutoSyncWechatApplyment("opening", true)).toBe(true);
    expect(shouldAutoSyncWechatApplyment("reviewing", false)).toBe(false);
    expect(shouldAutoSyncWechatApplyment("opened", true)).toBe(false);
    expect(shouldAutoSyncWechatApplyment("active", true)).toBe(false);
  });
});
