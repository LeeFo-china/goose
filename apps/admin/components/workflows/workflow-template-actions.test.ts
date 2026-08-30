import { describe, expect, test } from "bun:test";
import { WORKFLOW_TEMPLATE_OPTIONS } from "./workflow-template-actions";

describe("workflow template actions", () => {
  test("offers the supplier purchase batch approval template", () => {
    expect(WORKFLOW_TEMPLATE_OPTIONS).toContainEqual({
      key: "supplier_purchase_batch_approval",
      label: "采购批次审批",
      title: "创建采购审批并在超预算时追加财务审批",
    });
  });
});
