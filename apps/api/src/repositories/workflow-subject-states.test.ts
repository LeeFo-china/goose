import { describe, expect, mock, test } from "bun:test";

type EqCall = readonly [string, unknown];

const eqCalls: EqCall[] = [];
const orderCalls: Array<readonly [string, unknown]> = [];

class WorkflowInstancesQuery {
  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    eqCalls.push([column, value]);
    return this;
  }

  order(column: string, options: unknown) {
    orderCalls.push([column, options]);
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
        started_at: "2026-06-14T11:20:53.492Z",
        created_at: "2026-06-14T11:20:53.492Z",
        updated_at: "2026-06-15T16:20:04.646Z",
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
    orderCalls.length = 0;
    const { workflowSubjectStateRepository } = await import(
      "./workflow-subject-states"
    );

    await workflowSubjectStateRepository.findLatestRuntimeInstance({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(eqCalls).toContainEqual(["status", "running"]);
    expect(orderCalls.map(([column]) => column)).toEqual([
      "started_at",
      "created_at",
      "updated_at",
      "id",
    ]);
  });
});
