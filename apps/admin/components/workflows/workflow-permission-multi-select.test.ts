import { describe, expect, test } from "bun:test";
import { getWorkflowPermissionLabel } from "./workflow-permission-multi-select";

describe("getWorkflowPermissionLabel", () => {
  test("uses domain labels for known permission codes", () => {
    expect(getWorkflowPermissionLabel("expense_request.pay")).toBe("登记费用打款");
  });
});
