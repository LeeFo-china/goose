import { Errors } from "@/errors/error-factory";
import type { NotificationListQuery } from "@/schema/notifications";
import { SupabaseDB } from "@/utils/supabase";

export type NotificationRecord = {
  id: string;
  tenant_id: string | null;
  recipient_employee_id: string;
  scene: string;
  title: string;
  content: string;
  target_type: string | null;
  target_id: string | null;
  target_url: string | null;
  payload: unknown;
  status: "unread" | "read";
  read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateNotificationInput = {
  tenantId: string | null;
  recipientEmployeeId: string;
  scene: string;
  title: string;
  content: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUrl?: string | null;
  payload?: Record<string, unknown>;
};

type EmployeeLite = {
  id: string;
  name: string | null;
  phone: string | null;
};

class NotificationRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async createMany(inputs: CreateNotificationInput[]) {
    if (inputs.length === 0) return [] as NotificationRecord[];

    const { data, error } = await this.from("notifications")
      .insert(inputs.map((input) => ({
        tenant_id: input.tenantId,
        recipient_employee_id: input.recipientEmployeeId,
        scene: input.scene,
        title: input.title,
        content: input.content,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        target_url: input.targetUrl ?? null,
        payload: input.payload ?? {},
        status: "unread",
      })))
      .select("*");

    if (error) {
      throw Errors.dbError("创建站内通知失败", error);
    }

    return (data || []) as NotificationRecord[];
  }

  async listForEmployee(input: {
    employeeId: string;
    query: NotificationListQuery;
  }) {
    const from = (input.query.page - 1) * input.query.pageSize;
    const to = from + input.query.pageSize - 1;

    let request = this.from("notifications")
      .select("*", { count: "exact" })
      .eq("recipient_employee_id", input.employeeId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.query.status) {
      request = request.eq("status", input.query.status);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询站内通知失败", error);
    }

    return {
      list: (data || []) as NotificationRecord[],
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.query.pageSize) : 0,
      },
    };
  }

  async getSummary(employeeId: string) {
    const { count, error } = await this.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_employee_id", employeeId)
      .eq("status", "unread");

    if (error) {
      throw Errors.dbError("查询未读通知失败", error);
    }

    return {
      unread_count: count || 0,
    };
  }

  async markRead(input: {
    employeeId: string;
    ids?: string[];
  }) {
    const payload = {
      status: "read",
      read_at: new Date().toISOString(),
    };

    let request = this.from("notifications")
      .update(payload)
      .eq("recipient_employee_id", input.employeeId)
      .eq("status", "unread");

    if (input.ids && input.ids.length > 0) {
      request = request.in("id", Array.from(new Set(input.ids)));
    }

    const { data, error } = await request
      .select("*");

    if (error) {
      throw Errors.dbError("标记通知已读失败", error);
    }

    return {
      updated_count: ((data || []) as NotificationRecord[]).length,
      list: (data || []) as NotificationRecord[],
    };
  }

  async listTenantAdminEmployees(tenantId: string) {
    const { data, error } = await this.from("employee_roles")
      .select(`
        employee:employees!employee_roles_employee_id_fkey(
          id,
          name,
          phone,
          tenant_id,
          status
        ),
        role:roles!employee_roles_role_id_fkey(
          code,
          status
        )
      `)
      .eq("role.code", "system_admin")
      .eq("role.status", "active");

    if (error) {
      throw Errors.dbError("查询租户管理员失败", error);
    }

    const employees = new Map<string, EmployeeLite>();
    for (const row of (data || []) as Array<{
      employee?: EmployeeLite & { tenant_id?: string | null; status?: string | null }
        | Array<EmployeeLite & { tenant_id?: string | null; status?: string | null }>
        | null;
      role?: { code?: string | null; status?: string | null }
        | Array<{ code?: string | null; status?: string | null }>
        | null;
    }>) {
      const employee = Array.isArray(row.employee) ? row.employee[0] : row.employee;
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      if (
        role?.code !== "system_admin" ||
        employee?.tenant_id !== tenantId ||
        employee.status !== "active"
      ) {
        continue;
      }

      employees.set(employee.id, {
        id: employee.id,
        name: employee.name,
        phone: employee.phone,
      });
    }

    return Array.from(employees.values());
  }

  async findCustomerById(id: string) {
    const { data, error } = await this.from("customers")
      .select("id,name,phone,tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询通知客户失败", error);
    }

    return (data || null) as {
      id: string;
      name: string | null;
      phone: string | null;
      tenant_id: string | null;
    } | null;
  }
}

export const notificationRepository = new NotificationRepository();
