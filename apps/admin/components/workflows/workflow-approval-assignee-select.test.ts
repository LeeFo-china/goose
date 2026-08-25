import { describe, expect, test } from "bun:test";
import { getWorkflowRoleFallbackLabel } from "./workflow-approval-assignee-select";

describe("getWorkflowRoleFallbackLabel", () => {
  test("uses readable labels for built-in role codes", () => {
    expect(getWorkflowRoleFallbackLabel("finance_base")).toBe("财务基础角色");
  });

  test("does not expose unknown role codes as user-facing labels", () => {
    expect(getWorkflowRoleFallbackLabel("custom_internal_role")).toBe("未知角色");
  });
});
