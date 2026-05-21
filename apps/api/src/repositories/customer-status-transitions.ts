import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import type { CustomerStatus, CustomerStatusAction } from "@gooes/domain";

export type CustomerStatusTransitionCreateInput = {
  tenantId: string;
  customerId: string;
  fromStatus: CustomerStatus | null;
  toStatus: CustomerStatus;
  action: CustomerStatusAction;
  operatorEmployeeId?: string | null;
  operatorAuthUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type CustomerStatusTransitionRecord = {
  id: string;
  tenant_id: string;
  customer_id: string;
  from_status: CustomerStatus | null;
  to_status: CustomerStatus;
  action: CustomerStatusAction;
  operator_employee_id: string | null;
  operator_auth_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

class CustomerStatusTransitionRepository {
  async create(input: CustomerStatusTransitionCreateInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_status_transition_logs")
      .insert({
        tenant_id: input.tenantId,
        customer_id: input.customerId,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        action: input.action,
        operator_employee_id: input.operatorEmployeeId ?? null,
        operator_auth_user_id: input.operatorAuthUserId ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入客户状态流转日志失败", error);
    }

    return data as CustomerStatusTransitionRecord;
  }
}

export const customerStatusTransitionRepository =
  new CustomerStatusTransitionRepository();
