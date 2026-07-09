import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readCustomerStatusPanelSource() {
  return readFileSync(
    new URL("./customer-status-panel.tsx", import.meta.url),
    "utf8",
  );
}

describe("CustomerStatusPanel display", () => {
  test("does not render workflow enum keys directly in the customer detail card", () => {
    const source = readCustomerStatusPanelSource();

    expect(source).toContain("workflowSubjectTypeLabel");
    expect(source).toContain("workflowTransitionNodeLabel");
    expect(source).toContain("workflowActionLabel");
    expect(source).not.toContain("{workflowState.subject_type}");
    expect(source).not.toContain("item.source_node_key || \"开始\"");
    expect(source).not.toContain("item.target_node_key || \"结束\"");
    expect(source).not.toContain("{item.action || \"complete\"}");
    expect(source).not.toContain("workflow 待办");
    expect(source).not.toContain("workflow subject state");
  });
});
