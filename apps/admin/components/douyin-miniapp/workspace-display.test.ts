import { describe, expect, test } from "bun:test";

import {
  authorizationLabel,
  profileStatusLabel,
  releaseLabel,
  workspaceNextAction,
} from "./workspace-display";

describe("Douyin miniapp workspace display", () => {
  test("localizes authorization states for tenant operators", () => {
    expect(authorizationLabel("unbound")).toBe("未授权");
    expect(authorizationLabel("active")).toBe("已授权");
    expect(authorizationLabel("disabled")).toBe("已停用");
    expect(authorizationLabel("revoked")).toBe("已解除授权");
  });

  test("localizes release states including failure paths", () => {
    expect(releaseLabel("not_uploaded")).toBe("尚未上传");
    expect(releaseLabel("audit_rejected")).toBe("审核驳回");
    expect(releaseLabel("sync_error")).toBe("状态同步失败");
    expect(releaseLabel("released")).toBe("已发布");
  });

  test("makes public profile review state visible", () => {
    expect(profileStatusLabel("draft")).toBe("公开资料草稿");
    expect(profileStatusLabel("pending_review")).toBe("公开资料待审核");
    expect(profileStatusLabel("published")).toBe("公开资料展示中");
    expect(profileStatusLabel("suspended")).toBe("公开资料已暂停");
  });

  test("prioritizes authorization before release actions", () => {
    expect(
      workspaceNextAction({
        authorizationState: "unbound",
        releaseState: "not_uploaded",
      }),
    ).toBe("授权抖音小程序");

    expect(
      workspaceNextAction({
        authorizationState: "active",
        releaseState: "not_uploaded",
      }),
    ).toBe("上传首个版本");

    expect(
      workspaceNextAction({
        authorizationState: "active",
        releaseState: "audit_rejected",
      }),
    ).toBe("处理审核反馈");
  });

  test("uses concise Chinese copy without dash separators", () => {
    const labels = [
      authorizationLabel("disabled"),
      releaseLabel("testing"),
      workspaceNextAction({
        authorizationState: "active",
        releaseState: "audit_approved",
      }),
    ];

    expect(labels.join("")).not.toMatch(/[—–]/);
    expect(labels).not.toContain("发布小程序");
    expect(labels).toContain("同步审核状态");
  });
});
