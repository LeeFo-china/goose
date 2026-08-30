import { beforeEach, describe, expect, mock, test } from "bun:test";

type SqlFragment = { strings: string[]; values: unknown[] };
type DirectSqlMock = ((
  first: TemplateStringsArray | unknown[],
  ...values: unknown[]
) => Promise<unknown[]> | SqlFragment);

const directSqlQueries: SqlFragment[] = [];
const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
let directSql: DirectSqlMock | null = null;
let rpcRows: unknown[] = [];

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

function createQueuedDirectSqlMock(rowSets: unknown[][]): DirectSqlMock {
  const queuedRows = [...rowSets];
  return ((first: TemplateStringsArray | unknown[], ...values: unknown[]) => {
    if ("raw" in first) {
      const fragment = { strings: Array.from(first), values };
      if (fragment.strings.join(" ").includes("FROM public.workflow_tasks")) {
        directSqlQueries.push(fragment);
        return Promise.resolve(queuedRows.shift() ?? []);
      }
      return fragment;
    }
    return { strings: ["IN"], values: [first] };
  }) as DirectSqlMock;
}

function taskRow(totalCount = 1) {
  return {
    id: "task-1",
    tenant_id: "tenant-1",
    instance_id: "instance-1",
    instance_node_id: "instance-node-1",
    definition_id: "definition-1",
    version_id: "version-1",
    node_id: "node-1",
    node_key: "purchase_review",
    node_type: "approval",
    title: "采购审批",
    status: "pending",
    assignee_employee_id: null,
    assignee_role_code: null,
    assignee_permission_code: "supplier.purchase-requisition.approve",
    due_at: null,
    completed_by: null,
    completed_at: null,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
    instance: {
      id: "instance-1",
      subject_type: "supplier_purchase_batch",
      subject_id: "batch-1",
      status: "running",
      current_node_key: "purchase_review",
      current_node_snapshot: null,
    },
    total_count: totalCount,
  };
}

mock.module("@/utils/postgres-direct", () => ({
  getDirectPostgresSql: () => directSql,
}));

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: mock(() => ({})),
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push({ name, params });
        return { data: rpcRows, error: null };
      },
    }),
  },
}));

describe("supplier purchase batch workflow task access repository", () => {
  beforeEach(() => {
    directSqlQueries.length = 0;
    rpcCalls.length = 0;
    directSql = null;
    rpcRows = [taskRow()];
  });

  test("filters supplier tasks before direct count and pagination", async () => {
    directSql = createDirectSqlMock([taskRow(41)]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository
      .listAccessibleSupplierPurchaseBatchTasks({
        tenantId: "tenant-1",
        employeeId: "employee-1",
        roleCodes: ["purchase_reviewer"],
        permissionCodes: ["supplier.purchase-requisition.approve"],
        visibleProjectIds: ["project-1", "project-2"],
        page: 2,
        pageSize: 20,
        status: "pending",
        subjectId: "batch-1",
      });

    const query = directSqlQueries[0];
    const sqlText = query?.strings.join(" ? ") ?? "";
    const serialized = JSON.stringify(query);
    expect(serialized).toContain("JOIN public.supplier_purchase_batches AS batch");
    expect(serialized).toContain("batch.tenant_id = task.tenant_id");
    expect(serialized).toContain("instance.subject_id =");
    expect(serialized).toContain("instance.status = 'running'");
    expect(serialized).toContain("instance.current_node_key = task.node_key");
    expect(serialized).toContain(
      "ORDER BY task.updated_at DESC, task.id DESC",
    );
    expect(serialized).toContain("batch.project_id IN");
    expect(serialized).toContain(
      "batch.submitted_by_employee_id IS DISTINCT FROM",
    );
    expect(sqlText.indexOf("ORDER BY task.updated_at DESC, task.id DESC"))
      .toBeLessThan(sqlText.indexOf("OFFSET"));
    expect(sqlText.indexOf("OFFSET")).toBeLessThan(sqlText.indexOf("LIMIT"));
    expect(serialized).toContain("batch-1");
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
  });

  test("keeps tenant and self filters for all-project completed access", async () => {
    directSql = createDirectSqlMock([]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleSupplierPurchaseBatchTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      permissionCodes: ["finance.budget.manage"],
      visibleProjectIds: null,
      status: "completed",
    });

    const serialized = JSON.stringify(directSqlQueries[0]);
    expect(serialized).toContain("task.tenant_id =");
    expect(serialized).toContain("batch.tenant_id = task.tenant_id");
    expect(serialized).toContain(
      "batch.submitted_by_employee_id IS DISTINCT FROM",
    );
    expect(serialized).not.toContain("batch.project_id IN");
    expect(serialized).not.toContain("instance.status = 'running'");
  });

  test("uses the supplier-scoped fallback RPC", async () => {
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository
      .listAccessibleSupplierPurchaseBatchTasks({
        tenantId: "tenant-1",
        employeeId: "employee-1",
        roleCodes: ["purchase_reviewer"],
        permissionCodes: ["supplier.purchase-requisition.approve"],
        visibleProjectIds: ["project-1"],
        page: 3,
        pageSize: 10,
        status: "pending",
        subjectId: "batch-1",
      });

    expect(rpcCalls).toEqual([{
      name: "list_accessible_supplier_purchase_batch_workflow_tasks",
      params: {
        p_tenant_id: "tenant-1",
        p_employee_id: "employee-1",
        p_role_codes: ["purchase_reviewer"],
        p_permission_codes: ["supplier.purchase-requisition.approve"],
        p_visible_project_ids: ["project-1"],
        p_status: "pending",
        p_subject_id: "batch-1",
        p_page: 3,
        p_page_size: 10,
      },
    }]);
    expect(result.pagination).toEqual({
      page: 3,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  test("excludes supplier rows from a denied mixed direct page", async () => {
    directSql = createDirectSqlMock([taskRow()]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      page: 1,
      pageSize: 20,
      status: "pending",
      supplierPurchaseBatchAccess: null,
    });

    expect(JSON.stringify(directSqlQueries[0])).toContain(
      "instance.subject_type <> 'supplier_purchase_batch'",
    );
  });

  test("applies project, current-node, and self scope to an authorized mixed page", async () => {
    directSql = createDirectSqlMock([taskRow()]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["purchase_reviewer"],
      permissionCodes: ["supplier.purchase-requisition.approve"],
      page: 1,
      pageSize: 20,
      status: "pending",
      supplierPurchaseBatchAccess: {
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
      },
    });

    const serialized = JSON.stringify(directSqlQueries[0]);
    expect(serialized).toContain(
      "LEFT JOIN public.supplier_purchase_batches AS batch",
    );
    expect(serialized).toContain("batch.project_id IN");
    expect(serialized).toContain(
      "batch.submitted_by_employee_id IS DISTINCT FROM",
    );
    expect(serialized).toContain("instance.status = 'running'");
    expect(serialized).toContain("instance.current_node_key = task.node_key");
  });

  test("uses the supplier-safe fallback RPC for mixed pages", async () => {
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["purchase_reviewer"],
      permissionCodes: ["supplier.purchase-requisition.approve"],
      page: 1,
      pageSize: 20,
      status: "pending",
      supplierPurchaseBatchAccess: {
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
      },
    });

    expect(rpcCalls).toEqual([{
      name: "list_accessible_workflow_tasks_with_supplier_scope",
      params: expect.objectContaining({
        p_tenant_id: "tenant-1",
        p_supplier_access_allowed: true,
        p_supplier_employee_id: "employee-1",
        p_supplier_visible_project_ids: ["project-1"],
        p_subject_type: null,
        p_page: 1,
        p_page_size: 20,
      }),
    }]);
  });

  test("keeps the explicit direct total on a real out-of-range page", async () => {
    directSql = createQueuedDirectSqlMock([[], [{ total_count: 1 }]]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository
      .listAccessibleSupplierPurchaseBatchTasks({
        tenantId: "tenant-1",
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
        page: 3,
        pageSize: 1,
      });

    expect(result).toEqual({
      list: [],
      pagination: { page: 3, pageSize: 1, total: 1, totalPages: 1 },
    });
    expect(directSqlQueries).toHaveLength(2);
    expect(JSON.stringify(directSqlQueries[1])).toContain("count(*)");
  });

  test("keeps the mixed direct total on a real out-of-range page", async () => {
    directSql = createQueuedDirectSqlMock([[], [{ total_count: 1 }]]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const result = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      page: 3,
      pageSize: 1,
      supplierPurchaseBatchAccess: {
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
      },
    });

    expect(result).toEqual({
      list: [],
      pagination: { page: 3, pageSize: 1, total: 1, totalPages: 1 },
    });
    expect(directSqlQueries).toHaveLength(2);
  });

  test("filters explicit and mixed RPC total sentinels from empty pages", async () => {
    rpcRows = [{ id: null, total_count: 1 }];
    const { workflowTaskRepository } = await import("./workflow-tasks");

    const explicit = await workflowTaskRepository
      .listAccessibleSupplierPurchaseBatchTasks({
        tenantId: "tenant-1",
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
        page: 3,
        pageSize: 1,
      });
    const mixed = await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      page: 3,
      pageSize: 1,
      supplierPurchaseBatchAccess: {
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
      },
    });

    expect(explicit).toEqual({
      list: [],
      pagination: { page: 3, pageSize: 1, total: 1, totalPages: 1 },
    });
    expect(mixed).toEqual(explicit);
  });

  test("preserves legacy direct ordering outside supplier-scoped pages", async () => {
    directSql = createDirectSqlMock([]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      subjectType: "project",
    });

    const serialized = JSON.stringify(directSqlQueries[0]);
    expect(serialized).toContain("ORDER BY task.updated_at DESC");
    expect(serialized).not.toContain("task.id DESC");
  });

  test("deduplicates exactly 10000 visible projects for direct and RPC", async () => {
    directSql = createDirectSqlMock([]);
    const { workflowTaskRepository } = await import("./workflow-tasks");
    const projectIds = Array.from({ length: 10_000 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );

    await workflowTaskRepository.listAccessibleSupplierPurchaseBatchTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      visibleProjectIds: [...projectIds, projectIds[0]!],
    });

    expect(directSqlQueries).toHaveLength(1);
    expect(JSON.stringify(directSqlQueries[0]).match(/00000000-0000-4000/g))
      .toHaveLength(10_000);

    directSql = null;
    await workflowTaskRepository.listAccessibleSupplierPurchaseBatchTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      visibleProjectIds: [...projectIds, projectIds[0]!],
    });
    expect(rpcCalls[0]?.params.p_visible_project_ids).toHaveLength(10_000);
  });

  test("rejects 10001 unique visible projects before direct or RPC access", async () => {
    const { workflowTaskRepository } = await import("./workflow-tasks");
    const visibleProjectIds = Array.from({ length: 10_001 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );

    for (const configuredDirectSql of [createDirectSqlMock([]), null]) {
      directSql = configuredDirectSql;
      await expect(workflowTaskRepository
        .listAccessibleSupplierPurchaseBatchTasks({
          tenantId: "tenant-1",
          employeeId: "employee-1",
          visibleProjectIds,
        })).rejects.toMatchObject({
          statusCode: 400,
          code: "VALIDATION_ERROR",
        });
      await expect(workflowTaskRepository.listAccessibleTasks({
        tenantId: "tenant-1",
        employeeId: "employee-1",
        supplierPurchaseBatchAccess: {
          employeeId: "employee-1",
          visibleProjectIds,
        },
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    }

    expect(directSqlQueries).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  test("uses a guarded UUID cast for explicit and mixed batch joins", async () => {
    directSql = createDirectSqlMock([]);
    const { workflowTaskRepository } = await import("./workflow-tasks");

    await workflowTaskRepository.listAccessibleSupplierPurchaseBatchTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      visibleProjectIds: null,
    });
    await workflowTaskRepository.listAccessibleTasks({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      supplierPurchaseBatchAccess: null,
    });

    const serialized = JSON.stringify(directSqlQueries);
    expect(serialized).toContain("batch.id = CASE");
    expect(serialized).toContain("instance.subject_id::uuid");
    expect(serialized).not.toContain("batch.id::text");
  });
});
