import { describe, expect, test } from "bun:test";
import type { WorkflowTimelineNode } from "@/services/project-workflow-progress";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("tenant owner gantt acceptance evidence", () => {
  test("marks completed acceptance-required nodes as blocked until customer confirmation", async () => {
    const { enrichProjectTimelineWithAcceptanceEvidence } = await import(
      "./tenant-owner-dashboard-workflow-progress"
    );
    const nodes = [acceptanceNode("done")];

    const blocked = enrichProjectTimelineWithAcceptanceEvidence({
      projectId: "project-1",
      nodes,
      acceptances: [],
    });
    const confirmed = enrichProjectTimelineWithAcceptanceEvidence({
      projectId: "project-1",
      nodes,
      acceptances: [{
        id: "acceptance-1",
        project_id: "project-1",
        stage_code: "plumbing_electrical",
        status: "customer_confirmed",
        updated_at: "2026-09-01T09:00:00.000Z",
      }],
    });

    expect(blocked[0]?.status).toBe("blocked");
    expect(blocked[0]?.attributes.acceptance_status).toBeNull();
    expect(confirmed[0]?.status).toBe("done");
    expect(confirmed[0]?.attributes.acceptance_status).toBe(
      "customer_confirmed",
    );
  });
});

function acceptanceNode(status: WorkflowTimelineNode["status"]): WorkflowTimelineNode {
  return {
    node_key: "procedure_plumbing_electrical",
    node_title: "水电",
    node_type: "procedure",
    business_kind: "procedure_template",
    status,
    group: { key: "construction", label: "施工阶段", order: 10 },
    display: {
      label: "水电",
      status_label: status === "done" ? "已完成" : "进行中",
      status_variant: status === "done" ? "success" : "warning",
    },
    attributes: {
      stage_code: "plumbing_electrical",
      acceptance_enabled: true,
      acceptance_required: true,
    },
    actions: [],
  };
}
