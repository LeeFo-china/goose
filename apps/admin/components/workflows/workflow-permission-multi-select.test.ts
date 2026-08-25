import { describe, expect, test } from "bun:test";
import {
  getWorkflowPermissionLabel,
  getWorkflowPermissionModuleLabel,
} from "./workflow-permission-multi-select";

describe("getWorkflowPermissionLabel", () => {
  test("uses domain labels for known permission codes", () => {
    expect(getWorkflowPermissionLabel("expense_request.pay")).toBe("登记费用打款");
  });

  test("does not expose unknown permission codes as user-facing labels", () => {
    expect(getWorkflowPermissionLabel("custom_internal.permission_code")).toBe(
      "未知权限点",
    );
  });

  test("uses Chinese labels for common permission modules", () => {
    expect(getWorkflowPermissionModuleLabel("expense_request")).toBe("费用申请");
    expect(getWorkflowPermissionModuleLabel("douyin_miniapp")).toBe("抖音小程序");
    expect(getWorkflowPermissionModuleLabel("custom_internal")).toBe("其他权限");
  });
});
