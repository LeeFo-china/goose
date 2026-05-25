import { Errors } from "@/errors/error-factory";
import type {
  CustomerServiceTicketAction,
  CustomerServiceTicketStatus,
} from "@gooes/domain";
import type { CustomerServiceTicketListQuery } from "@/schema/customer-service";
import { SupabaseDB } from "@/utils/supabase";

export const CUSTOMER_SERVICE_TICKET_SELECT = `
  *,
  customer:customers!customer_service_tickets_customer_id_fkey(
    id,
    name,
    phone,
    owner_id,
    tenant_id
  ),
  project:projects!customer_service_tickets_project_id_fkey(
    id,
    name,
    status,
    customer_id,
    tenant_id
  ),
  assigned_employee:employees!customer_service_tickets_assigned_employee_id_fkey(
    id,
    name,
    phone,
    status,
    tenant_id
  )
`;

export type CustomerServiceTicketRecord = {
  id: string;
  tenant_id: string;
  ticket_no: string;
  customer_id: string;
  project_id: string | null;
  category: string;
  title: string | null;
  content: string;
  images: unknown;
  status: CustomerServiceTicketStatus;
  priority: string;
  assigned_employee_id: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: unknown;
  project?: unknown;
  assigned_employee?: unknown;
};

export type CustomerServiceTicketActionRecord = {
  id: string;
  tenant_id: string;
  ticket_id: string;
  action: string;
  from_status: CustomerServiceTicketStatus | null;
  to_status: CustomerServiceTicketStatus | null;
  operator_employee_id: string | null;
  operator_auth_user_id: string | null;
  content: string | null;
  metadata: unknown;
  created_at: string;
  operator_employee?: unknown;
};

type TicketPatch = {
  status?: CustomerServiceTicketStatus;
  assigned_employee_id?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  updated_at?: string;
};

class CustomerServiceTicketRepository {
  private from(table: string) {
    return (SupabaseDB.getAdminClient() as unknown as { from: (table: string) => any })
      .from(table);
  }

  async findCustomer(input: { customerId: string; tenantId: string }) {
    const { data, error } = await this.from("customers")
      .select("id, tenant_id, owner_id, name, phone")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户失败", error);
    }

    return (data || null) as {
      id: string;
      tenant_id: string;
      owner_id: string | null;
      name: string | null;
      phone: string | null;
    } | null;
  }

  async findProject(input: { projectId: string; tenantId: string }) {
    const { data, error } = await this.from("projects")
      .select("id, tenant_id, customer_id, name, status")
      .eq("id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    return (data || null) as {
      id: string;
      tenant_id: string;
      customer_id: string | null;
      name: string | null;
      status: string | null;
    } | null;
  }

  async listCustomerIdsByOwnerIds(input: {
    tenantId: string;
    ownerIds: string[];
  }) {
    if (input.ownerIds.length === 0) {
      return [] as string[];
    }

    const { data, error } = await this.from("customers")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .in("owner_id", input.ownerIds);

    if (error) {
      throw Errors.dbError("查询可见客户失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

  async findEmployee(input: { employeeId: string; tenantId: string }) {
    const { data, error } = await this.from("employees")
      .select("id, tenant_id, name, phone, status")
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工失败", error);
    }

    return (data || null) as {
      id: string;
      tenant_id: string;
      name: string | null;
      phone: string | null;
      status: string | null;
    } | null;
  }

  async create(input: {
    tenantId: string;
    ticketNo: string;
    customerId: string;
    projectId: string | null;
    category: string;
    title: string | null;
    content: string;
    images: string[];
  }) {
    const { data, error } = await this.from("customer_service_tickets")
      .insert({
        tenant_id: input.tenantId,
        ticket_no: input.ticketNo,
        customer_id: input.customerId,
        project_id: input.projectId,
        category: input.category,
        title: input.title,
        content: input.content,
        images: input.images,
        status: "open",
        priority: "normal",
      })
      .select(CUSTOMER_SERVICE_TICKET_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建客服问题失败", error);
    }

    return data as unknown as CustomerServiceTicketRecord;
  }

  async list(input: {
    tenantId: string;
    query: CustomerServiceTicketListQuery;
    visibleCustomerIds?: string[] | null;
  }) {
    const from = (input.query.page - 1) * input.query.pageSize;
    const to = from + input.query.pageSize - 1;
    let request = this.from("customer_service_tickets")
      .select(CUSTOMER_SERVICE_TICKET_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.query.status) request = request.eq("status", input.query.status);
    if (input.query.category) request = request.eq("category", input.query.category);
    if (input.query.priority) request = request.eq("priority", input.query.priority);
    if (input.query.assigned_employee_id) {
      request = request.eq("assigned_employee_id", input.query.assigned_employee_id);
    }
    if (input.query.customer_id) request = request.eq("customer_id", input.query.customer_id);
    if (input.query.project_id) request = request.eq("project_id", input.query.project_id);
    if (input.visibleCustomerIds) {
      request = request.in("customer_id", input.visibleCustomerIds);
    }
    if (input.query.keyword) {
      const keyword = input.query.keyword
        .replace(/\\/g, "\\\\")
        .replace(/[%_]/g, "\\$&")
        .replace(/,/g, "\\,");
      request = request.or(`ticket_no.ilike.%${keyword}%,title.ilike.%${keyword}%,content.ilike.%${keyword}%`);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询客服问题失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerServiceTicketRecord[],
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.query.pageSize) : 0,
      },
    };
  }

  async listByCustomer(input: {
    tenantId: string;
    customerId: string;
    query: CustomerServiceTicketListQuery;
  }) {
    return this.list({
      tenantId: input.tenantId,
      query: {
        ...input.query,
        customer_id: input.customerId,
      },
    });
  }

  async findById(input: { ticketId: string; tenantId: string }) {
    const { data, error } = await this.from("customer_service_tickets")
      .select(CUSTOMER_SERVICE_TICKET_SELECT)
      .eq("id", input.ticketId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客服问题失败", error);
    }

    return (data || null) as unknown as CustomerServiceTicketRecord | null;
  }

  async updateTicket(input: {
    ticketId: string;
    tenantId: string;
    patch: TicketPatch;
  }) {
    const { data, error } = await this.from("customer_service_tickets")
      .update({
        ...input.patch,
        updated_at: input.patch.updated_at ?? new Date().toISOString(),
      })
      .eq("id", input.ticketId)
      .eq("tenant_id", input.tenantId)
      .select(CUSTOMER_SERVICE_TICKET_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新客服问题失败", error);
    }

    return data as unknown as CustomerServiceTicketRecord;
  }

  async createAction(input: {
    tenantId: string;
    ticketId: string;
    action: CustomerServiceTicketAction | "create";
    fromStatus?: CustomerServiceTicketStatus | null;
    toStatus?: CustomerServiceTicketStatus | null;
    operatorEmployeeId?: string | null;
    operatorAuthUserId?: string | null;
    content?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const { data, error } = await this.from("customer_service_ticket_actions")
      .insert({
        tenant_id: input.tenantId,
        ticket_id: input.ticketId,
        action: input.action,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        operator_employee_id: input.operatorEmployeeId ?? null,
        operator_auth_user_id: input.operatorAuthUserId ?? null,
        content: input.content ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("记录客服问题操作失败", error);
    }

    return data as CustomerServiceTicketActionRecord;
  }

  async listActions(input: { ticketId: string; tenantId: string }) {
    const { data, error } = await this.from("customer_service_ticket_actions")
      .select(`
        *,
        operator_employee:employees!customer_service_ticket_actions_operator_employee_id_fkey(
          id,
          name,
          phone,
          status,
          tenant_id
        )
      `)
      .eq("ticket_id", input.ticketId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客服问题操作记录失败", error);
    }

    return (data || []) as CustomerServiceTicketActionRecord[];
  }
}

export const customerServiceTicketRepository = new CustomerServiceTicketRepository();
