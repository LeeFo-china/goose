import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatRebindStatus = "pending" | "approved" | "rejected" | "cancelled";
export type WechatRebindTargetRole = "customer" | "employee";

export type WechatRebindRequestRecord = {
  id: string;
  tenant_id: string | null;
  target_role: WechatRebindTargetRole;
  target_customer_id: string | null;
  target_employee_id: string | null;
  phone: string;
  old_auth_user_id: string | null;
  new_auth_user_id: string;
  applicant_name: string | null;
  project_hint: string | null;
  community_hint: string | null;
  remark: string | null;
  status: WechatRebindStatus;
  reviewer_employee_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WechatTargetIdentityRecord = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  status?: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  delete: () => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  is: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

class WechatRebindRequestRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string): UntypedTable {
    return (this.client as unknown as {
      from: (tableName: string) => UntypedTable;
    }).from(table);
  }

  async findCustomer(id: string, tenantId: string) {
    const { data, error } = await this.from("customers")
      .select("id, tenant_id, name, phone, user_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async findEmployee(id: string, tenantId: string) {
    const { data, error } = await this.from("employees")
      .select("id, tenant_id, name, phone, user_id, status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工身份失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async unbindCustomer(input: {
    customerId: string;
    tenantId: string;
    authUserId: string;
  }) {
    const { data, error } = await this.from("customers")
      .update({ user_id: null })
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.authUserId)
      .select("id, tenant_id, name, phone, user_id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("解除客户微信绑定失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async findCustomerBinding(input: {
    customerId: string;
    tenantId: string;
  }) {
    const { data, error } = await this.from("customers")
      .select("id, tenant_id, name, phone, user_id")
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户微信绑定失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async unbindEmployee(input: {
    employeeId: string;
    tenantId: string;
    authUserId: string;
  }) {
    const { data, error } = await this.from("employees")
      .select("id, tenant_id, name, phone, user_id, status")
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("解除员工微信绑定失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async deleteWechatIdentity(authUserId: string) {
    const { error } = await this.from("wechat_identities")
      .delete()
      .eq("auth_user_id", authUserId);

    if (error) {
      throw Errors.dbError("删除微信身份映射失败", error);
    }
  }

  async findPendingDuplicate(input: {
    phone: string;
    targetRole: WechatRebindTargetRole;
    targetCustomerId?: string | null;
    targetEmployeeId?: string | null;
  }) {
    let request = this.from("wechat_rebind_requests")
      .select("*")
      .eq("phone", input.phone)
      .eq("target_role", input.targetRole)
      .eq("status", "pending")
      .limit(1);

    request = input.targetRole === "customer"
      ? request.eq("target_customer_id", input.targetCustomerId)
      : request.eq("target_employee_id", input.targetEmployeeId);

    const { data, error } = await request.maybeSingle();
    if (error) {
      throw Errors.dbError("查询换绑申请失败", error);
    }

    return (data || null) as WechatRebindRequestRecord | null;
  }

  async create(input: {
    tenantId: string;
    targetRole: WechatRebindTargetRole;
    targetCustomerId?: string | null;
    targetEmployeeId?: string | null;
    phone: string;
    oldAuthUserId: string;
    newAuthUserId: string;
    applicantName?: string | null;
    projectHint?: string | null;
    communityHint?: string | null;
    remark?: string | null;
  }) {
    const { data, error } = await this.from("wechat_rebind_requests")
      .insert({
        tenant_id: input.tenantId,
        target_role: input.targetRole,
        target_customer_id: input.targetCustomerId ?? null,
        target_employee_id: input.targetEmployeeId ?? null,
        phone: input.phone,
        old_auth_user_id: input.oldAuthUserId,
        new_auth_user_id: input.newAuthUserId,
        applicant_name: input.applicantName ?? null,
        project_hint: input.projectHint ?? null,
        community_hint: input.communityHint ?? null,
        remark: input.remark ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("提交微信换绑申请失败", error);
    }

    return data as WechatRebindRequestRecord;
  }

  async list(input: {
    tenantId: string;
    status?: WechatRebindStatus;
    page: number;
    pageSize: number;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let request = this.from("wechat_rebind_requests")
      .select("*", { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) {
      request = request.eq("status", input.status);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询微信换绑申请失败", error);
    }

    return {
      list: (data || []) as WechatRebindRequestRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findById(id: string) {
    const { data, error } = await this.from("wechat_rebind_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信换绑申请失败", error);
    }

    return (data || null) as WechatRebindRequestRecord | null;
  }

  async updateCustomerUserId(input: {
    customerId: string;
    tenantId: string;
    phone: string;
    oldAuthUserId: string;
    authUserId: string;
  }) {
    const { data, error } = await this.from("customers")
      .update({ user_id: input.authUserId })
      .eq("id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .eq("phone", input.phone)
      .eq("user_id", input.oldAuthUserId)
      .select("id, tenant_id, name, phone, user_id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新客户微信绑定失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async updateEmployeeUserId(input: {
    employeeId: string;
    tenantId: string;
    phone: string;
    oldAuthUserId: string;
    authUserId: string;
  }) {
    const { data, error } = await this.from("employees")
      .update({ user_id: input.authUserId })
      .eq("id", input.employeeId)
      .eq("tenant_id", input.tenantId)
      .eq("phone", input.phone)
      .eq("user_id", input.oldAuthUserId)
      .select("id, tenant_id, name, phone, user_id, status")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新员工微信绑定失败", error);
    }

    return (data || null) as WechatTargetIdentityRecord | null;
  }

  async review(input: {
    id: string;
    status: "approved" | "rejected";
    reviewerEmployeeId: string | null;
    comment?: string | null;
  }) {
    const { data, error } = await this.from("wechat_rebind_requests")
      .update({
        status: input.status,
        reviewer_employee_id: input.reviewerEmployeeId,
        review_comment: input.comment ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("审核微信换绑申请失败", error);
    }

    return (data || null) as WechatRebindRequestRecord | null;
  }
}

export const wechatRebindRequestRepository = new WechatRebindRequestRepository();
