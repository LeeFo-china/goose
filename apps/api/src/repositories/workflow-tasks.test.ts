import { describe, expect, mock, test } from "bun:test";

const orCalls: string[] = [];
const eqCalls: Array<readonly [string, unknown]> = [];
const selectCalls: string[] = [];
const updateCalls: unknown[] = [];
let lastOperation: "select" | "update" | null = null;

class WorkflowTasksQuery {
  select(columns = "") {
    selectCalls.push(columns);
    lastOperation = "select";
    return this;
  }

  update(payload: unknown) {
    updateCalls.push(payload);
    lastOperation = "update";
    return this;
  }

  eq(column: string, value: unknown) {
    eqCalls.push([column, value]);
    return this;
  }

  or(filter: string) {
    orCalls.push(filter);
    return this;
  }

  order() {
    return this;
  }

  async range() {
    return { data: [], error: null, count: 0 };
  }

  async limit() {
    return lastOperation === "update"
      ? { data: [{ id: "task-1" }], error: null }
      : { data: [], error: null, count: 0 };
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => new WorkflowTasksQuery(),
    }),
  },
}));

describe("workflowTaskRepository", () => {
  test("does not match employee-assigned tasks through role or permission filters", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: ["finance.payment.confirm"],
    });

    expect(orCalls[0]).toBe([
      "assignee_employee_id.eq.employee-1",
      "and(assignee_employee_id.is.null,assignee_role_code.in.(finance))",
      "and(assignee_employee_id.is.null,assignee_permission_code.in.(finance.payment.confirm))",
      "and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.is.null)",
    ].join(","));
  });

  test("can restrict accessible tasks to the selected runtime instance", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      subjectType: "project",
      subjectId: "project-1",
      instanceId: "instance-current",
    });

    expect(eqCalls).toContainEqual(["instance_id", "instance-current"]);
  });

  test("selects an id after assigning a pending task so the update request returns", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.assignPendingTask({
      tenantId: "tenant-1",
      instanceId: "instance-1",
      nodeKey: "potential",
      assigneeEmployeeId: "owner-1",
    });

    expect(updateCalls).toEqual([{ assignee_employee_id: "owner-1" }]);
    expect(selectCalls).toContain("id");
    expect(eqCalls).toEqual([
      ["tenant_id", "tenant-1"],
      ["instance_id", "instance-1"],
      ["node_key", "potential"],
      ["status", "pending"],
    ]);
  });
});
