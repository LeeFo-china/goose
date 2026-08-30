import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WorkflowTaskProjectMemberSummary = {
  role_code: string;
  role_name: string | null;
  employee_id: string;
  employee_name: string | null;
};

export type WorkflowTaskProjectSummary = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  property_label: string | null;
  members: WorkflowTaskProjectMemberSummary[];
};

export type WorkflowTaskCustomerSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  owner: {
    id: string;
    name: string | null;
  } | null;
};

export type WorkflowTaskExpenseRequestSummary = {
  id: string;
  request_no: string | null;
  title: string | null;
  mode: string | null;
  total_amount: number | null;
  created_at: string | null;
  employee: {
    id: string;
    name: string | null;
  } | null;
  project: {
    id: string;
    name: string | null;
  } | null;
};

export type WorkflowTaskReceivableSummary = {
  id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  title: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
};

export type WorkflowTaskProjectAcceptanceSummary = {
  id: string;
  project_id: string;
  acceptance_type: string;
  stage_code: string;
  title: string;
  status: string;
  submitted_at: string | null;
  updated_at: string | null;
  initiator: {
    id: string;
    name: string | null;
  } | null;
  reviewer: {
    id: string;
    name: string | null;
  } | null;
};

export type WorkflowTaskSupplierPurchaseBatchSummary = {
  id: string;
  batch_no: string;
  project_id: string;
  total_amount: number | null;
  item_count: number;
  supplier_count: number;
  submitted_by_employee_id: string | null;
  submitted_at: string | null;
};

export type WorkflowTaskEmployeeSummary = {
  id: string;
  name: string | null;
};

type ProjectSummaryRow = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  property: {
    community: string | null;
    building_info: string | null;
  } | null;
};

type ProjectMemberSummaryRow = {
  project_id: string;
  employee_id: string;
  role_code: string;
  role_name: string | null;
  employee: {
    id: string;
    name: string | null;
  } | null;
};

type SupplierPurchaseBatchSummaryRow = Omit<
  WorkflowTaskSupplierPurchaseBatchSummary,
  "total_amount" | "submitted_at"
> & {
  total_amount: string | number | null;
  submitted_at: string | null;
  updated_at: string | null;
};

class WorkflowTaskCardContextRepository {
  async listProjectSummariesByIds(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<WorkflowTaskProjectSummary[]> {
    const projectIds = unique(input.projectIds).slice(0, 100);
    if (projectIds.length === 0) return [];

    const [projectResult, memberResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("projects")
        .select(`
          id,
          name,
          status,
          address,
          property:properties!projects_property_id_fkey(
            community,
            building_info
          )
        `)
        .eq("tenant_id", input.tenantId)
        .in("id", projectIds),
      SupabaseDB.getAdminClient()
        .from("project_members")
        .select(`
          project_id,
          employee_id,
          role_code,
          role_name,
          employee:employees!project_members_employee_id_fkey(
            id,
            name
          )
        `)
        .in("project_id", projectIds)
        .in("role_code", ["designer", "construction_manager", "supervisor"])
        .eq("is_primary", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (projectResult.error) {
      throw Errors.dbError("查询流程待办项目摘要失败", projectResult.error);
    }
    if (memberResult.error) {
      throw Errors.dbError("查询流程待办项目成员摘要失败", memberResult.error);
    }

    const membersByProjectId = new Map<string, WorkflowTaskProjectMemberSummary[]>();
    for (const row of (memberResult.data ?? []) as unknown as ProjectMemberSummaryRow[]) {
      membersByProjectId.set(row.project_id, [
        ...(membersByProjectId.get(row.project_id) ?? []),
        {
          role_code: row.role_code,
          role_name: row.role_name,
          employee_id: row.employee_id,
          employee_name: row.employee?.name ?? null,
        },
      ]);
    }

    return ((projectResult.data ?? []) as unknown as ProjectSummaryRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      address: row.address,
      property_label: buildPropertyLabel(row.property),
      members: membersByProjectId.get(row.id) ?? [],
    }));
  }

  async listCustomerSummariesByIds(input: {
    tenantId: string;
    customerIds: string[];
  }): Promise<WorkflowTaskCustomerSummary[]> {
    const customerIds = unique(input.customerIds).slice(0, 100);
    if (customerIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        name,
        phone,
        status,
        owner:employees!customers_owner_id_fkey(
          id,
          name
        )
      `)
      .eq("tenant_id", input.tenantId)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询流程待办客户摘要失败", error);
    }

    return (data ?? []) as unknown as WorkflowTaskCustomerSummary[];
  }

  async listExpenseRequestSummariesByIds(input: {
    tenantId: string;
    expenseRequestIds: string[];
  }): Promise<WorkflowTaskExpenseRequestSummary[]> {
    const expenseRequestIds = unique(input.expenseRequestIds).slice(0, 100);
    if (expenseRequestIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(`
        id,
        request_no,
        title,
        mode,
        total_amount,
        created_at,
        employee:employees!expense_requests_employee_id_fkey(
          id,
          name
        ),
        project:projects(
          id,
          name
        )
      `)
      .eq("tenant_id", input.tenantId)
      .in("id", expenseRequestIds);

    if (error) {
      throw Errors.dbError("查询流程待办费用申请摘要失败", error);
    }

    return (data ?? []) as unknown as WorkflowTaskExpenseRequestSummary[];
  }

  async listSupplierPurchaseBatchSummariesByIds(input: {
    tenantId: string;
    batchIds: string[];
  }): Promise<WorkflowTaskSupplierPurchaseBatchSummary[]> {
    const batchIds = unique(input.batchIds).slice(0, 100);
    if (batchIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("supplier_purchase_batches")
      .select(`
        id,
        batch_no,
        project_id,
        total_amount,
        item_count,
        supplier_count,
        submitted_by_employee_id,
        submitted_at,
        updated_at
      `)
      .in("id", batchIds)
      .eq("tenant_id", input.tenantId)
      .limit(100);

    if (error) {
      throw Errors.dbError("查询流程待办采购批次摘要失败", error);
    }

    return ((data ?? []) as unknown as SupplierPurchaseBatchSummaryRow[]).map(
      (row) => ({
        id: row.id,
        batch_no: row.batch_no,
        project_id: row.project_id,
        total_amount: toFiniteNumber(row.total_amount),
        item_count: row.item_count,
        supplier_count: row.supplier_count,
        submitted_by_employee_id: row.submitted_by_employee_id,
        submitted_at: row.submitted_at ?? row.updated_at,
      }),
    );
  }

  async listEmployeeSummariesByIds(input: {
    tenantId: string;
    employeeIds: string[];
  }): Promise<WorkflowTaskEmployeeSummary[]> {
    const employeeIds = unique(input.employeeIds).slice(0, 100);
    if (employeeIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id,name")
      .in("id", employeeIds)
      .eq("tenant_id", input.tenantId)
      .limit(100);

    if (error) {
      throw Errors.dbError("查询流程待办员工摘要失败", error);
    }

    return (data ?? []) as WorkflowTaskEmployeeSummary[];
  }

  async listProjectReceivableSummaries(input: {
    tenantId: string;
    keys: Array<{
      projectId: string;
      workflowInstanceId: string;
      workflowNodeKey: string;
    }>;
  }): Promise<WorkflowTaskReceivableSummary[]> {
    const projectIds = unique(input.keys.map((key) => key.projectId)).slice(0, 100);
    const workflowInstanceIds = unique(input.keys.map((key) => key.workflowInstanceId))
      .slice(0, 100);
    if (projectIds.length === 0 || workflowInstanceIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(`
        id,
        project_id,
        workflow_instance_id,
        workflow_node_key,
        title,
        amount,
        paid_amount,
        due_date,
        status
      `)
      .eq("tenant_id", input.tenantId)
      .in("project_id", projectIds)
      .in("workflow_instance_id", workflowInstanceIds)
      .limit(Math.min(input.keys.length * 2, 200));

    if (error) {
      throw Errors.dbError("查询流程待办应收摘要失败", error);
    }

    return (data ?? []) as unknown as WorkflowTaskReceivableSummary[];
  }

  async listProjectAcceptanceSummariesByProjectIds(input: {
    tenantId: string;
    projectIds: string[];
  }): Promise<WorkflowTaskProjectAcceptanceSummary[]> {
    const projectIds = unique(input.projectIds).slice(0, 100);
    if (projectIds.length === 0) return [];

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select(`
        id,
        project_id,
        acceptance_type,
        stage_code,
        title,
        status,
        submitted_at,
        updated_at,
        initiator:employees!project_acceptances_initiator_id_fkey(
          id,
          name
        ),
        reviewer:employees!project_acceptances_reviewer_id_fkey(
          id,
          name
        )
      `)
      .eq("tenant_id", input.tenantId)
      .in("project_id", projectIds)
      .order("updated_at", { ascending: false })
      .limit(Math.min(projectIds.length * 5, 500));

    if (error) {
      throw Errors.dbError("查询流程待办验收摘要失败", error);
    }

    return (data ?? []) as unknown as WorkflowTaskProjectAcceptanceSummary[];
  }
}

function buildPropertyLabel(
  property: ProjectSummaryRow["property"],
): string | null {
  const parts = [
    property?.community,
    property?.building_info,
  ].filter((part): part is string => Boolean(part?.trim()));

  return parts.length > 0 ? parts.join(" ") : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}

function toFiniteNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const workflowTaskCardContextRepository =
  new WorkflowTaskCardContextRepository();
