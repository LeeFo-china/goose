import { describe, expect, test } from "bun:test";
import {
  buildSubjectBackfillPlan,
  findSnapshotNode,
  shouldCreatePendingTask,
} from "./plan";

const snapshot = {
  nodes: [
    {
      id: "node-following",
      node_key: "following",
      node_type: "business",
      business_kind: "phone_follow_up",
      title: "电话跟进",
      config: { required_permissions: ["customer.update"] },
    },
    {
      id: "node-payment",
      node_key: "payment",
      node_type: "approval",
      business_kind: "expense_approval",
      title: "登记打款",
      config: { required_permissions: ["expense_request.pay"] },
    },
    {
      id: "node-done",
      node_key: "done",
      node_type: "end",
      business_kind: null,
      title: "已完成",
      config: { required_permissions: [] },
    },
  ],
};

describe("workflow runtime backfill plan", () => {
  test("maps current customer statuses to existing workflow nodes", () => {
    const plan = buildSubjectBackfillPlan({
      subjectType: "customer",
      subjectId: "customer-1",
      legacyStatus: "potential",
      legacyStep: null,
      snapshot,
      hasRunningInstance: false,
    });

    expect(plan.action).toBe("create");
    if (plan.action === "create") {
      expect(plan.nodeKey).toBe("following");
      expect(plan.instanceStatus).toBe("running");
    }
  });

  test("skips legacy rows when the mapped node is not in the active snapshot", () => {
    const plan = buildSubjectBackfillPlan({
      subjectType: "customer",
      subjectId: "customer-2",
      legacyStatus: "invalid",
      legacyStep: null,
      snapshot,
      hasRunningInstance: false,
    });

    expect(plan.action).toBe("skip");
    if (plan.action === "skip") {
      expect(plan.reason).toBe("mapped_node_missing");
    }
  });

  test("does not create a duplicate running instance for the same subject", () => {
    const plan = buildSubjectBackfillPlan({
      subjectType: "expense_request",
      subjectId: "expense-1",
      legacyStatus: "approved",
      legacyStep: "payment",
      snapshot,
      hasRunningInstance: true,
    });

    expect(plan.action).toBe("skip");
    if (plan.action === "skip") {
      expect(plan.reason).toBe("running_instance_exists");
    }
  });

  test("creates pending tasks only for running non-end nodes", () => {
    const paymentNode = findSnapshotNode(snapshot, "payment");
    const doneNode = findSnapshotNode(snapshot, "done");

    expect(paymentNode?.requiredPermission).toBe("expense_request.pay");
    expect(shouldCreatePendingTask("running", paymentNode)).toBe(true);
    expect(shouldCreatePendingTask("completed", paymentNode)).toBe(false);
    expect(shouldCreatePendingTask("completed", doneNode)).toBe(false);
  });
});
