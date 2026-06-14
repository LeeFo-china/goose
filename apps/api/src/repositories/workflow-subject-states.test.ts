import { describe, expect, mock, test } from "bun:test";

type EqCall = readonly [string, unknown];

const eqCalls: EqCall[] = [];

class WorkflowInstancesQuery {
  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    eqCalls.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  async maybeSingle() {
    return {
      data: {
        id: "instance-running",
        tenant_id: "tenant-1",
        definition_id: "definition-1",
        version_id: "version-1",
        subject_type: "project",
        subject_id: "project-1",
        status: "running",
        current_node_key: "payment_stage_2",
        current_node_snapshot: null,
      },
      error: null,
    };
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => new WorkflowInstancesQuery(),
    }),
  },
}));

describe("workflowSubjectStateRepository", () => {
  test("loads the running runtime instance instead of the latest canceled instance", async () => {
    eqCalls.length = 0;
    const { workflowSubjectStateRepository } = await import(
      "./workflow-subject-states"
    );

    await workflowSubjectStateRepository.findLatestRuntimeInstance({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(eqCalls).toContainEqual(["status", "running"]);
  });
});
