import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workflowPath = join(
  import.meta.dir,
  "../.github/workflows/verify-production-customer-start-following.yml",
);

describe("production customer start_following verification", () => {
  test("is an environment-protected, deployment-bound manual operation", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("deployed_sha:");
    expect(workflow).toContain("confirm_text:");
    expect(workflow).toContain("runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("group: deploy-docker-services-main");
    expect(workflow).toContain(
      "TARGET_CUSTOMER_ID: ${{ secrets.CUSTOMER_WORKFLOW_SMOKE_TARGET_ID }}",
    );
    expect(workflow).toContain(
      'test "${CONFIRM_TEXT}" = "确认推进生产客户开始跟进"',
    );
    expect(workflow).toContain('test "${actual_sha}" = "${EXPECTED_DEPLOYED_SHA}"');
  });

  test("fails closed before write and uses the deployed HTTP task endpoint", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain('customer.status !== "potential"');
    expect(workflow).toContain('state?.instance_status !== "running"');
    expect(workflow).toContain('state.current_node_key !== "potential"');
    expect(workflow).toContain('action.business_action === "start_following"');
    expect(workflow).toContain('actions.length !== 1');
    expect(workflow).toContain('process.env.JWT_EXPIRES_IN = "5m"');
    expect(workflow).toContain('method: "POST"');
    expect(workflow).toContain('`/workflow-tasks/${action.task_id}/complete`');
    expect(workflow).toContain('"Idempotency-Key"');
    expect(workflow).not.toContain(".insert(");
    expect(workflow).not.toContain(".update(");
    expect(workflow).not.toContain(".delete(");
  });

  test("proves the customer, workflow node, and original task reached final state", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).toContain('after.status !== "following"');
    expect(workflow).toContain('afterState?.current_node_key !== "following"');
    expect(workflow).toContain('oldTask.status !== "completed"');
    expect(workflow).toContain('action.business_action === "start_following"');
    expect(workflow).toContain("production-customer-start-following-");
    expect(workflow).toContain("retention-days: 7");
  });
});
