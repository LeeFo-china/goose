import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const workflowUrl = new URL(
  "../.github/workflows/audit-production-customer-workflow.yml",
  import.meta.url,
);
const workflow = existsSync(workflowUrl)
  ? readFileSync(workflowUrl, "utf8")
  : "";

describe("production customer workflow audit contract", () => {
  test("is a protected tenant- and revision-bound production dispatch", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain(
      "runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]",
    );
    expect(workflow).toContain("group: deploy-docker-services-main");
    expect(workflow).toContain("timeout-minutes: 10");
    expect(workflow).toContain("gooes-prod-vm-0-3");
    expect(workflow).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(workflow).toContain("确认审核客户工作流回填");
    expect(workflow).toContain("EXPECTED_DEPLOYED_SHA");
    expect(workflow).toContain("org.opencontainers.image.revision");
    expect(workflow).toContain('test "${actual_sha}" = "${EXPECTED_DEPLOYED_SHA}"');
  });

  test("executes the deployed audit in immutable dry-run mode", () => {
    expect(workflow).toContain("docker exec gooes-api bun");
    expect(workflow).toContain(
      "/app/apps/api/src/scripts/backfill-workflow-runtime-from-state-machine.ts",
    );
    expect(workflow).toContain("--subject-type customer");
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("--created-before");
    expect(workflow).not.toContain("--apply");
  });

  test("validates workflow graph and uploads private evidence", () => {
    expect(workflow).toContain("customer_main");
    expect(workflow).toContain("start_to_potential");
    expect(workflow).toContain("potential_to_following");
    expect(workflow).toContain("active_workflow_definition_missing");
    expect(workflow).toContain("mapped_node_missing");
    expect(workflow).toContain("customer.potential.dry_run_create");
    expect(workflow).toContain("actions/upload-artifact@v6");
    expect(workflow).toContain("retention-days: 7");
  });

  test("verifies repaired detail state while allowing legitimate progression", () => {
    expect(workflow).toContain("Verify repaired customer detail state read-only");
    expect(workflow).toContain("workflowSubjectsService.getState");
    expect(workflow).toContain('business_action === "start_following"');
    expect(workflow).toContain("customer.status !== state.current_node_key");
    expect(workflow).toContain("potential += 1");
    expect(workflow).toContain("customer-workflow-detail-verification.json");
    expect(workflow).toContain(".ready == .checked");
    expect(workflow).toContain(".startFollowing == .potential");
    expect(workflow).not.toContain(".startFollowing == .checked");
  });
});
