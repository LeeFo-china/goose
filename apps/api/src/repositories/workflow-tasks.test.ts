import { describe, expect, mock, test } from "bun:test";

const orCalls: string[] = [];
const eqCalls: Array<readonly [string, unknown]> = [];
const selectCalls: string[] = [];
const updateCalls: unknown[] = [];
const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
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

function createFlakyDirectSqlMock(rows: unknown[]): DirectSqlMock {
  let taskQueryCount = 0;
  return ((first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if ("raw" in first) {
      const fragment = { strings: Array.from(first), values };
      if (fragment.strings.join(" ").includes("FROM public.workflow_tasks")) {
        directSqlQueries.push(fragment);
        taskQueryCount += 1;
        if (taskQueryCount === 1) {
          return Promise.reject(new Error("temporary direct sql failure"));
        }
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
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push({ name, params });
        return {
          data: [{
            ...directWorkflowTaskRow(),
            total_count: 1,
          }],
          error: null,
        };
      },
    }),
  },
}));

mock.module("@/utils/postgres-direct", () => ({
  getDirectPostgresSql: () => directSql,
}));

describe("workflowTaskRepository", () => {
  test("passes role and permission assignees to the accessible tasks RPC", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
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

    expect(orCalls).toHaveLength(0);
    expect(rpcCalls).toEqual([{
      name: "list_accessible_workflow_tasks",
      params: expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_employee_id: "employee-1",
        p_role_codes: ["finance"],
        p_permission_codes: ["finance.payment.confirm"],
        p_status: "pending",
      }),
    }]);
  });

  test("can restrict accessible tasks RPC to the selected runtime instance", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
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

    expect(orCalls).toHaveLength(0);
    expect(rpcCalls).toEqual([{
      name: "list_accessible_workflow_tasks",
      params: expect.objectContaining({
        p_subject_type: "project",
        p_subject_id: "project-1",
        p_instance_id: "instance-current",
      }),
    }]);
  });

  test("selects an id after assigning a pending task so the update request returns", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
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
    rpcCalls.length = 0;
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
    rpcCalls.length = 0;
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

  test("uses RPC fallback instead of long PostgREST filters when direct SQL is unavailable", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = null;
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["system_admin"],
      permissionCodes: Array.from(
        { length: 103 },
        (_, index) => `system.permission_${index}`,
      ),
      subjectType: "project",
      subjectId: "project-1",
      page: 1,
      pageSize: 20,
    });

    expect(orCalls).toHaveLength(0);
    expect(rpcCalls).toEqual([{
      name: "list_accessible_workflow_tasks",
      params: expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_employee_id: "employee-1",
        p_role_codes: ["system_admin"],
        p_subject_type: "project",
        p_subject_id: "project-1",
        p_page: 1,
        p_page_size: 20,
      }),
    }]);
    expect(result.list[0]?.id).toBe("task-1");
    expect(result.pagination.total).toBe(1);
  });

  test("uses RPC fallback for project workflow summaries when direct SQL is unavailable", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = null;
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository.listAccessiblePendingByProjectIds({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["system_admin"],
      permissionCodes: Array.from(
        { length: 103 },
        (_, index) => `system.permission_${index}`,
      ),
      projectIds: ["project-1"],
      limit: 100,
    });

    expect(orCalls).toHaveLength(0);
    expect(rpcCalls).toEqual([{
      name: "list_accessible_project_workflow_tasks",
      params: expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_employee_id: "employee-1",
        p_role_codes: ["system_admin"],
        p_project_ids: ["project-1"],
        p_limit: 100,
      }),
    }]);
    expect(result[0]?.id).toBe("task-1");
  });

  test("does not permanently disable direct SQL after a transient failure", async () => {
    orCalls.length = 0;
    eqCalls.length = 0;
    selectCalls.length = 0;
    updateCalls.length = 0;
    rpcCalls.length = 0;
    directSqlQueries.length = 0;
    directSql = createFlakyDirectSqlMock([directWorkflowTaskRow()]);
    lastOperation = null;
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const fallbackResult = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: ["finance.payment.confirm"],
      page: 1,
      pageSize: 20,
    });
    const recoveredResult = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["finance"],
      permissionCodes: ["finance.payment.confirm"],
      page: 1,
      pageSize: 20,
    });

    expect(orCalls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(1);
    expect(directSqlQueries).toHaveLength(2);
    expect(fallbackResult.list[0]?.id).toBe("task-1");
    expect(recoveredResult.list[0]?.id).toBe("task-1");
  });
});
