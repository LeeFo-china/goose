import { describe, expect, test } from "bun:test";
import { resolveCustomerWorkflowTaskOperation } from "./workflow-task-customer-bridge";

describe("resolveCustomerWorkflowTaskOperation", () => {
  test("maps customer workflow nodes to supported customer status actions", () => {
    expect(resolveCustomerWorkflowTaskOperation({
      nodeKey: "following",
      action: "complete",
      reason: null,
      output: {},
    })).toEqual({
      action: "mark_arrived",
      payload: { action: "mark_arrived" },
    });

    expect(resolveCustomerWorkflowTaskOperation({
      nodeKey: "arrived",
      action: "complete",
      reason: null,
      output: {},
    })).toEqual({
      action: "start_design",
      payload: { action: "start_design" },
    });
  });

  test("maps explicit invalid action and skips unsupported signed transition", () => {
    expect(resolveCustomerWorkflowTaskOperation({
      nodeKey: "following",
      action: "mark_invalid",
      reason: "无效线索",
      output: {},
    })).toEqual({
      action: "mark_invalid",
      payload: { action: "mark_invalid", reason: "无效线索" },
    });

    expect(resolveCustomerWorkflowTaskOperation({
      nodeKey: "designing",
      action: "complete",
      reason: null,
      output: {},
    })).toBeNull();
  });
});
