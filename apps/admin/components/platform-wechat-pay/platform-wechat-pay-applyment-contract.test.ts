import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getOfficialApplymentProgress } from "./platform-wechat-pay-applyment-progress";
import { shouldAutoSyncWechatApplyment } from "./platform-wechat-pay-applyment-sync";

describe("platform wechat pay official applyment contract", () => {
  test("marks the tenant submission complete while platform review is current", () => {
    const progress = getOfficialApplymentProgress("submitted");

    expect(progress.value).toBe(17);
    expect(progress.stages.map((stage) => stage.label)).toEqual([
      "平台审核",
      "微信审核",
      "账户验证",
      "商户签约",
      "开通完成",
      "激活收款",
    ]);
    expect(progress.stages.map((stage) => stage.state)).toEqual([
      "current",
      "pending",
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

    expect(platformRejected.stages[0]).toEqual({
      label: "平台审核",
      state: "issue",
    });
    expect(wechatRejected.stages[1]).toEqual({
      label: "微信审核",
      state: "issue",
    });
    expect(wechatRejected.stages[2]?.state).toBe("pending");
  });

  test("keeps a canceled WeChat application at the review stage", () => {
    const closed = getOfficialApplymentProgress(
      "closed",
      "APPLYMENT_STATE_CANCELED",
    );

    expect(closed.stages[1]).toEqual({
      label: "微信审核",
      state: "issue",
    });
    expect(closed.stages[2]?.state).toBe("pending");
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

  test("keeps the platform sign link as tenant signing assistance", () => {
    const source = readFileSync(
      new URL("./platform-wechat-pay-applyment-actions.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("租户签约协助");
    expect(source).toContain("主签约入口在租户侧");
    expect(source).toContain("查看签约链接");
    expect(source).not.toContain("打开签约链接");
  });
});
