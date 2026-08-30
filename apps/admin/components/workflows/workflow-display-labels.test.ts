import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  workflowActionLabel,
  workflowActionDisplayLabel,
  workflowAttributeLabel,
  workflowAttributeValue,
  workflowInstanceStatusLabel,
  workflowNodeKeyLabel,
  workflowNodeStatusLabel,
  workflowNodeTitle,
  workflowSubjectTypeLabel,
  workflowTransitionNodeLabel,
} from "./workflow-display-labels";

function containsEnglishKey(value: string) {
  return /[A-Za-z_]/.test(value);
}

describe("workflow display labels", () => {
  test("maps customer workflow keys to Chinese labels", () => {
    const labels = [
      workflowSubjectTypeLabel("customer"),
      workflowInstanceStatusLabel("completed"),
      workflowNodeKeyLabel("designing"),
      workflowNodeKeyLabel("end"),
      workflowNodeTitle({ nodeKey: "potential", nodeTitle: "potential" }),
      workflowTransitionNodeLabel("arrived", new Map(), "开始"),
      workflowActionLabel("mark_signed"),
      workflowActionLabel("start_design"),
      workflowActionDisplayLabel("start_design", "start_design"),
      workflowNodeStatusLabel("current", "current"),
      workflowAttributeLabel("assignee_employee_name", 0),
      workflowAttributeValue("following"),
      workflowAttributeValue("start_design"),
    ];

    expect(labels).toEqual([
      "客户",
      "已完成",
      "设计中",
      "结束",
      "潜在客户",
      "已到店",
      "客户签约",
      "开始设计",
      "开始设计",
      "当前",
      "负责人",
      "跟进中",
      "开始设计",
    ]);
    expect(labels.some(containsEnglishKey)).toBe(false);
  });

  test("uses Chinese fallbacks instead of leaking unknown enum keys", () => {
    expect(workflowSubjectTypeLabel("customer_profile")).toBe("业务对象");
    expect(workflowInstanceStatusLabel("ready_for_archive")).toBe("未知状态");
    expect(workflowNodeKeyLabel("waiting_review")).toBe("未命名节点");
    expect(workflowNodeStatusLabel("ready_for_archive")).toBe("待处理");
    expect(workflowActionLabel("manual_sync")).toBe("执行动作");
    expect(workflowActionDisplayLabel("manual_sync", "manual_sync")).toBe("执行动作");
    expect(workflowAttributeLabel("stage_code", 1)).toBe("属性 2");
    expect(workflowAttributeValue("waiting_review")).toBe("已配置");
  });

  test("maps supplier purchase batch workflow subject and node keys", () => {
    expect(workflowSubjectTypeLabel("manual")).toBe("手动");
    expect(workflowSubjectTypeLabel("supplier_purchase_batch")).toBe("采购批次");
    expect(workflowNodeKeyLabel("purchase_review")).toBe("采购审批");
    expect(workflowNodeKeyLabel("finance_review")).toBe("财务审批");
    expect(workflowNodeKeyLabel("approved_end")).toBe("审批通过");
    expect(workflowNodeKeyLabel("rejected_end")).toBe("审批驳回");
  });

  test("uses shared Chinese labels in the runtime panel", () => {
    const runtimePanelSource = readFileSync(
      new URL("./workflow-runtime-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(runtimePanelSource).toContain(
      "workflowSubjectTypeLabel(instance.subject_type)",
    );
    expect(runtimePanelSource).toContain(
      'workflowNodeKeyLabel(instance.current_node_key, "-")',
    );
    expect(runtimePanelSource).not.toContain("const subjectLabels");
  });
});
