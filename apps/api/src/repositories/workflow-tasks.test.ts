import { describe, expect, mock, test } from "bun:test";

const orCalls: string[] = [];
const eqCalls: Array<readonly [string, unknown]> = [];
const selectCalls: string[] = [];
const updateCalls: unknown[] = [];
let lastOperation: "select" | "update" | null = null;
let directSql: DirectSqlMock | null = null;

type SqlFragment = {
  strings: string[];
  values: unknown[];
};

type DirectSqlMock = ((
  first: TemplateStringsArray | unknown[],
  ...values: unknown[]
) => Promise<unknown[]> | SqlFragment);

const directSqlQueries: SqlFragment[] = [];

function createDirectSqlMock(rows: unknown[]): DirectSqlMock {
  return ((first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if ("raw" in first) {
      const fragment = { strings: Array.from(first), values };
      if (fragment.strings.join(" ").includes("FROM public.workflow_tasks")) {
        directSqlQueries.push(fragment);
        return Promise.resolve(rows);
      }
      return fragment;
    }

    return { strings: ["IN"], values: [first] };
  }) as DirectSqlMock;
}

function directWorkflowTaskRow() {
  return {
    id: "task-1",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    instance_node_id: "instance-node-1",
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: "node-1",
    node_key: "finance_review",
    node_type: "manual",
    title: "财务确认",
    status: "pending",
    assignee_employee_id: null,
    assignee_role_code: "finance",
    assignee_permission_code: "finance.payment.confirm",
    assignee_employee: null,
    due_at: null,
    completed_by: null,
    completed_at: null,
    created_at: "2026-06-28T00:00:00.000Z",
    updated_at: "2026-06-28T00:01:00.000Z",
    instance: {
      id: "instance-1",
      subject_type: "project",
      subject_id: "project-1",
      status: "active",
      current_node_key: "finance_review",
      current_node_snapshot: null,
    },
    total_count: 1,
  };
}

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

mock.module("@/utils/postgres-direct", () => ({
  getDirectPostgresSql: () => directSql,
}));

describe("workflowTaskRepository", () => {
  test("matches role and permission assignees as separate or combined constraints", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = null;
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
      "and(assignee_employee_id.is.null,assignee_role_code.in.(finance),assignee_permission_code.is.null)",
      "and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.in.(finance.payment.confirm))",
      "and(assignee_employee_id.is.null,assignee_role_code.in.(finance),assignee_permission_code.in.(finance.payment.confirm))",
      "and(assignee_employee_id.is.null,assignee_role_code.is.null,assignee_permission_code.is.null)",
    ].join(","));
  });

  test("can restrict accessible tasks to the selected runtime instance", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = null;
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
    directSqlQueries.length = 0;
    directSql = null;
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

  test("lists accessible tasks through direct Postgres to avoid long PostgREST urls", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = createDirectSqlMock([directWorkflowTaskRow()]);
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: Array.from(
        { length: 80 },
        (_, index) => `finance.permission_${index}`,
      ),
      page: 1,
      pageSize: 20,
    });

    expect(directSqlQueries).toHaveLength(1);
    expect(orCalls).toHaveLength(0);
    expect(result.list[0]?.id).toBe("task-1");
    expect(result.pagination.total).toBe(1);
  });

  test("lists project workflow summaries through direct Postgres to avoid long PostgREST urls", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = createDirectSqlMock([directWorkflowTaskRow()]);
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository.listAccessiblePendingByProjectIds({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: Array.from(
        { length: 80 },
        (_, index) => `finance.permission_${index}`,
      ),
      projectIds: ["project-1"],
      limit: 100,
    });

    expect(directSqlQueries).toHaveLength(1);
    expect(orCalls).toHaveLength(0);
    expect(result[0]?.id).toBe("task-1");
  });
});
