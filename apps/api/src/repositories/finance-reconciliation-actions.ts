import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationExceptionCode,
} from "@/schema/finance-reconciliation";

export type FinanceReconciliationSubjectType = "receivable" | "payment" | "ledger";

export type FinanceReconciliationActionRecord = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: FinanceReconciliationExceptionCode;
  subject_type: FinanceReconciliationSubjectType;
  subject_id: string | null;
  project_id: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  created_at: string;
};

export type CreateFinanceReconciliationActionInput = {
  tenantId: string;
  exceptionFingerprint: string;
  exceptionCode: FinanceReconciliationExceptionCode;
  subjectType: FinanceReconciliationSubjectType;
  subjectId: string | null;
  projectId: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actorEmployeeId: string | null;
};

type ActionDbRow = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: FinanceReconciliationExceptionCode;
  subject_type: FinanceReconciliationSubjectType;
  subject_id: string | null;
  project_id: string | null;
  action: FinanceReconciliationAction;
  remark: string;
  actor_employee_id: string | null;
  actor_employee_name?: string | null;
  created_at: string;
  actor_employee?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

class FinanceReconciliationActionsRepository {
  async listLatestActions(input: {
    tenantId: string;
    fingerprints: string[];
  }): Promise<Map<string, FinanceReconciliationActionRecord>> {
    const fingerprints = Array.from(new Set(input.fingerprints.filter(Boolean)));
    if (fingerprints.length === 0) return new Map();

    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "list_latest_finance_reconciliation_exception_actions",
      {
        p_tenant_id: input.tenantId,
        p_fingerprints: fingerprints,
      },
    );

    if (error) {
      throw Errors.dbError("查询对账异常处理记录失败", error);
    }

    const latest = new Map<string, FinanceReconciliationActionRecord>();
    for (const row of (data || []) as unknown as ActionDbRow[]) {
      if (latest.has(row.exception_fingerprint)) continue;
      latest.set(row.exception_fingerprint, normalizeActionRow(row));
    }
    return latest;
  }

  async createAction(
    input: CreateFinanceReconciliationActionInput,
  ): Promise<FinanceReconciliationActionRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_reconciliation_exception_actions")
      .insert({
        tenant_id: input.tenantId,
        exception_fingerprint: input.exceptionFingerprint,
        exception_code: input.exceptionCode,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        project_id: input.projectId,
        action: input.action,
        remark: input.remark,
        actor_employee_id: input.actorEmployeeId,
      })
      .select(`
        id,
        tenant_id,
        exception_fingerprint,
        exception_code,
        subject_type,
        subject_id,
        project_id,
        action,
        remark,
        actor_employee_id,
        created_at,
        actor_employee:employees!finance_reconciliation_exception_actions_actor_employee_id_fkey(name)
      `)
      .single();

    if (error) {
      throw Errors.dbError("保存对账异常处理记录失败", error);
    }
    if (!data) {
      throw Errors.dbError("保存对账异常处理记录失败");
    }

    return normalizeActionRow(data as unknown as ActionDbRow);
  }
}

function normalizeActionRow(row: ActionDbRow): FinanceReconciliationActionRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    exception_fingerprint: row.exception_fingerprint,
    exception_code: row.exception_code,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    project_id: row.project_id,
    action: row.action,
    remark: row.remark,
    actor_employee_id: row.actor_employee_id,
    actor_employee_name:
      row.actor_employee_name ?? relationOne(row.actor_employee)?.name ?? null,
    created_at: row.created_at,
  };
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export const financeReconciliationActionsRepository =
  new FinanceReconciliationActionsRepository();
