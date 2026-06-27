import { describe, expect, test } from "bun:test";
import {
  getWorkflowBusinessFlowOptionsForTrack,
  getWorkflowCapabilityOptionsForTrack,
  getWorkflowFinanceKindOptionsForTrack,
  getWorkflowNodePresetsForTrack,
  getWorkflowRuntimeIntegrationHint,
  getWorkflowTrack,
} from "./workflow-business-track";

describe("workflow business track options", () => {
  test("recognizes custom keys derived from decoration workflow template keys", () => {
    expect(getWorkflowTrack({ workflow_key: "customer_main_custom" })).toBe("customer_design");
    expect(getWorkflowTrack({ workflow_key: "project_signing_custom" })).toBe("project_signing");
    expect(getWorkflowTrack({ workflow_key: "construction_main_custom" })).toBe("construction");
    expect(getWorkflowTrack({ workflow_key: "construction_custom_mq7hqqgl_1_d0c5a149" }))
      .toBe("construction");
  });

  test("filters customer design workflow to customer capabilities", () => {
    const track = getWorkflowTrack({ workflow_key: "customer_main" });

    expect(track).toBe("customer_design");
    expect(getWorkflowCapabilityOptionsForTrack(track).map((option) => option.value)).toEqual([
      "business",
      "approval",
      "notification",
    ]);
    expect(getWorkflowBusinessFlowOptionsForTrack(track).map((option) => option.value)).toEqual([
      "customer_lead",
      "phone_follow_up",
      "store_visit",
      "design",
    ]);
  });

  test("allows project signing to insert payment collection but not settlement", () => {
    const track = getWorkflowTrack({ workflow_key: "project_signing" });

    expect(getWorkflowCapabilityOptionsForTrack(track).map((option) => option.value)).toEqual([
      "business",
      "finance",
      "approval",
      "notification",
    ]);
    expect(getWorkflowFinanceKindOptionsForTrack(track).map((option) => option.value)).toEqual([
      "payment_collection",
    ]);
  });

  test("filters construction workflow to construction, procedure and payment gates", () => {
    const track = getWorkflowTrack({ workflow_key: "construction_main" });

    expect(getWorkflowCapabilityOptionsForTrack(track).map((option) => option.value)).toEqual([
      "construction",
      "procedure",
      "finance",
      "approval",
      "notification",
    ]);
    expect(getWorkflowBusinessFlowOptionsForTrack(track)).toEqual([]);
    expect(getWorkflowFinanceKindOptionsForTrack(track).map((option) => option.value)).toEqual([
      "payment_collection",
    ]);
  });

  test("hides automation and subflow presets from strict business tracks", () => {
    const presets = getWorkflowNodePresetsForTrack("construction");

    expect(presets.map((preset) => preset.key)).toEqual([
      "start",
      "workflow_step",
      "notification",
      "end",
    ]);
  });

  test("provides runtime integration hints for business workflows", () => {
    expect(getWorkflowRuntimeIntegrationHint({ workflow_key: "customer_main" })?.badge).toBe(
      "客户状态已接入",
    );
    expect(getWorkflowRuntimeIntegrationHint({ workflow_key: "project_signing" })?.badge).toBe(
      "项目状态已接入",
    );
    expect(getWorkflowRuntimeIntegrationHint({ workflow_key: "construction_main" })?.badge).toBe(
      "施工状态已接入",
    );
    expect(getWorkflowRuntimeIntegrationHint({ workflow_key: "expense_approval" })?.badge).toBe(
      "费用审批已接入",
    );
    expect(getWorkflowRuntimeIntegrationHint({ workflow_key: "manual_custom" })).toBeNull();
  });
});
