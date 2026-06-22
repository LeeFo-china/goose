import { describe, expect, mock, test } from "bun:test";

type EqCall = readonly [string, unknown];
type InCall = readonly [string, unknown[]];

const eqCalls: EqCall[] = [];
const inCalls: InCall[] = [];
const orderCalls: Array<readonly [string, unknown]> = [];
let runningSingleData: Record<string, unknown> | null = runtimeInstance("instance-running", "running");
let completedSingleData: Record<string, unknown> | null = runtimeInstance(
  "instance-completed",
  "completed",
);
let runningListData: Array<Record<string, unknown>> = [
  runtimeInstance("instance-running", "running", "project-1"),
];
let completedListData: Array<Record<string, unknown>> = [
  runtimeInstance("instance-completed", "completed", "project-2"),
];

class WorkflowInstancesQuery {
  private status: unknown = null;

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    eqCalls.push([column, value]);
    if (column === "status") this.status = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    inCalls.push([column, values]);
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
    const data = this.status === "completed"
      ? completedSingleData
      : runningSingleData;
    return {
      data,
      error: null,
    };
  }

  then<TResult1 = {
    data: unknown;
    error: unknown;
    count: number | null;
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      data: unknown;
      error: unknown;
      count: number | null;
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const data = this.status === "completed" ? completedListData : runningListData;
    return Promise.resolve({ data, error: null, count: data.length }).then(
      onfulfilled,
      onrejected,
    );
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
  test("loads the running runtime instance before considering completed history", async () => {
    eqCalls.length = 0;
    inCalls.length = 0;
    orderCalls.length = 0;
    runningSingleData = runtimeInstance("instance-running", "running");
    completedSingleData = runtimeInstance("instance-completed", "completed");
    const { workflowSubjectStateRepository } = await import(
      "./workflow-subject-states"
    );

    await workflowSubjectStateRepository.findLatestRuntimeInstance({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(eqCalls).toContainEqual(["status", "running"]);
    expect(eqCalls).not.toContainEqual(["status", "completed"]);
    expect(orderCalls.map(([column]) => column)).toEqual([
      "started_at",
      "created_at",
      "updated_at",
      "id",
    ]);
  });

  test("falls back to the latest completed runtime instance for read-only display", async () => {
    eqCalls.length = 0;
    inCalls.length = 0;
    orderCalls.length = 0;
    runningSingleData = null;
    completedSingleData = runtimeInstance("instance-completed", "completed");
    const { workflowSubjectStateRepository } = await import(
      "./workflow-subject-states"
    );

    const instance = await workflowSubjectStateRepository.findLatestRuntimeInstance({
      tenantId: "tenant-1",
      subjectType: "project",
      subjectId: "project-1",
    });

    expect(instance?.id).toBe("instance-completed");
    expect(instance?.status).toBe("completed");
    expect(eqCalls).toContainEqual(["status", "running"]);
    expect(eqCalls).toContainEqual(["status", "completed"]);
  });

  test("lists running runtime first and completed runtime for subjects without running instance", async () => {
    eqCalls.length = 0;
    inCalls.length = 0;
    orderCalls.length = 0;
    runningListData = [
      runtimeInstance("instance-running", "running", "project-1"),
    ];
    completedListData = [
      runtimeInstance("instance-old-completed", "completed", "project-1"),
      runtimeInstance("instance-completed", "completed", "project-2"),
    ];
    const { workflowSubjectStateRepository } = await import(
      "./workflow-subject-states"
    );

    const instances = await workflowSubjectStateRepository
      .listLatestRuntimeInstancesBySubjectIds({
        tenantId: "tenant-1",
        subjectType: "project",
        subjectIds: ["project-1", "project-2"],
      });

    expect(instances.map((item) => [item.subject_id, item.id])).toEqual([
      ["project-1", "instance-running"],
      ["project-2", "instance-completed"],
    ]);
    expect(eqCalls).toContainEqual(["status", "running"]);
    expect(eqCalls).toContainEqual(["status", "completed"]);
    expect(inCalls).toContainEqual(["subject_id", ["project-1", "project-2"]]);
  });
});

function runtimeInstance(
  id: string,
  status: string,
  subjectId = "project-1",
): Record<string, unknown> {
  return {
    id,
    tenant_id: "tenant-1",
    definition_id: "definition-1",
    version_id: "version-1",
    subject_type: "project",
    subject_id: subjectId,
    status,
    current_node_key: status === "completed" ? "end" : "payment_stage_2",
    current_node_snapshot: null,
    started_at: "2026-06-14T11:20:53.492Z",
    created_at: "2026-06-14T11:20:53.492Z",
    updated_at: status === "completed"
      ? "2026-06-16T16:20:04.646Z"
      : "2026-06-15T16:20:04.646Z",
  };
}
