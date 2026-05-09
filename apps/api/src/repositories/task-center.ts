import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerFollowUpTodoSource = {
  id: string;
  customer_id: string | null;
  content: string;
  created_at: string | null;
  next_follow_at: string | null;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    owner_id: string | null;
    status: string | null;
  } | null;
};

export type ProjectLogTodoSource = {
  id: string;
  name: string | null;
  status: string | null;
  address: string | null;
  created_at: string | null;
  designer_id: string | null;
  supervisor_id: string | null;
  property: {
    community: string | null;
    building_info: string | null;
  } | null;
};

export type ExpenseRequestTodoSource = {
  id: string;
  request_no: string | null;
  title: string | null;
  status: string;
  current_step: string;
  employee_id: string;
  assignee_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  employee: {
    id: string;
    name: string | null;
  } | null;
  project: {
    id: string;
    name: string | null;
  } | null;
};

export type ProjectAcceptanceTodoSource = {
  id: string;
  project_id: string;
  stage_code: string;
  title: string;
  status: string;
  initiator_id: string;
  reviewer_id: string | null;
  reject_source: string | null;
  submitted_at: string | null;
  rejected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  project: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
  initiator: {
    id: string;
    name: string | null;
  } | null;
  reviewer: {
    id: string;
    name: string | null;
  } | null;
};

class TaskCenterRepository {
  async listOwnedCustomerIds(employeeId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("customers")
      .select("id")
      .eq("owner_id", employeeId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询客户待处理范围失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async listCustomerFollowUpsByCustomerIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as CustomerFollowUpTodoSource[];
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_follow_ups")
      .select(`
        id,
        customer_id,
        content,
        created_at,
        next_follow_at,
        customer:customers!customer_follow_ups_customer_id_fkey(
          id,
          name,
          phone,
          owner_id,
          status
        )
      `)
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户跟进待处理失败", error);
    }

    return (data || []) as unknown as CustomerFollowUpTodoSource[];
  }

  async listOwnedActiveProjects(employeeId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select(`
        id,
        name,
        status,
        address,
        created_at,
        designer_id,
        supervisor_id,
        property:properties!projects_property_id_fkey(
          community,
          building_info
        )
      `)
      .eq("status", "constructing")
      .or(`designer_id.eq.${employeeId},supervisor_id.eq.${employeeId}`);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询项目日志待处理范围失败", error);
    }

    return (data || []) as unknown as ProjectLogTodoSource[];
  }

  async listTodayProjectLogs(
    employeeId: string,
    projectIds: string[],
    fromIso: string,
    tenantId?: string | null,
  ) {
    if (projectIds.length === 0) {
      return [] as Array<{ id: string; project_id: string }>;
    }

    let query = SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id")
      .eq("employee_id", employeeId)
      .in("project_id", projectIds)
      .gte("created_at", fromIso);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询今日施工日志失败", error);
    }

    return (data || []) as Array<{ id: string; project_id: string }>;
  }

  async listExpenseRequestTodos(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(`
        id,
        request_no,
        title,
        status,
        current_step,
        employee_id,
        assignee_id,
        created_at,
        updated_at,
        rejected_at,
        rejected_reason,
        employee:employees!expense_requests_employee_id_fkey(
          id,
          name
        ),
        project:projects(
          id,
          name
        )
      `)
      .in("status", ["draft", "rejected", "pending", "approved"]);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询费用申请待处理失败", error);
    }

    return (data || []) as unknown as ExpenseRequestTodoSource[];
  }

  async listProjectAcceptanceTodos(tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select(`
        id,
        project_id,
        stage_code,
        title,
        status,
        initiator_id,
        reviewer_id,
        reject_source,
        submitted_at,
        rejected_at,
        created_at,
        updated_at,
        project:projects(
          id,
          name,
          status
        ),
        initiator:employees!project_acceptances_initiator_id_fkey(
          id,
          name
        ),
        reviewer:employees!project_acceptances_reviewer_id_fkey(
          id,
          name
        )
      `)
      .in("status", ["draft", "submitted", "rejected"]);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.order("updated_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询项目验收待处理失败", error);
    }

    return (data || []) as unknown as ProjectAcceptanceTodoSource[];
  }
}

export const taskCenterRepository = new TaskCenterRepository();
