import { describe, expect, test } from "bun:test";
import { getWorkflowRoleFallbackLabel } from "./workflow-approval-assignee-select";

describe("getWorkflowRoleFallbackLabel", () => {
  test("uses readable labels for built-in role codes", () => {
    expect(getWorkflowRoleFallbackLabel("finance_base")).toBe("财务基础角色");
  });
});
