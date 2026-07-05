import { Errors } from "@/errors/error-factory";
import {
  listLedgerCorrectionAuditRows,
  type LedgerCorrectionAuditRow,
} from "@/repositories/finance-correction-audit-ledgers";
import type {
  FinanceCorrectionAuditListQuery,
  FinanceCorrectionAuditOperation,
} from "@/schema/finance-correction-audits";
import { SupabaseDB } from "@/utils/supabase/index";

type ReceivableEventType =
  | "allocate_payment"
  | "adjust_allocation"
  | "reverse_allocation";

export type ReceivableCorrectionEventRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name: string | null;
  receivable_plan_id: string;
  event_type: ReceivableEventType;
  title: string;
  note: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type { LedgerCorrectionAuditRow };

export type ReconciliationExceptionActionAuditRow = {
  id: string;
  tenant_id: string;
  exception_fingerprint: string;
  exception_code: string;
  subject_type: string;
  subject_id: string | null;
  project_id: string | null;
  action: FinanceCorrectionAuditOperation;
  remark: string;
  actor_employee_id: string | null;
  actor_employee_name: string | null;
  created_at: string;
};

type ListInput = {
  tenantId: string;
  query: FinanceCorrectionAuditListQuery;
  candidateLimit: number;
};

const RECEIVABLE_EVENT_OPERATIONS: Record<
  ReceivableEventType,
  FinanceCorrectionAuditOperation
> = {
  allocate_payment: "manual_allocation",
  adjust_allocation: "adjust_allocation",
  reverse_allocation: "reverse_allocation",
};

class FinanceCorrectionAuditRepository {
  async listReceivableCorrectionEvents(input: ListInput): Promise<{
    list: ReceivableCorrectionEventRow[];
    total: number;
  }> {
    const eventTypes = receivableEventTypesForOperation(input.query.operation);
    if (input.query.operation && eventTypes.length === 0) {
      return { list: [], total: 0 };
    }

    let request = SupabaseDB.getAdminClient()
      .from("project_receivable_events")
      .select(`
        id,
        tenant_id,
        project_id,
        receivable_plan_id,
        event_type,
        title,
        note,
        before_snapshot,
        after_snapshot,
        created_by,
        created_at,
        project:projects(id, name),
        creator:employees!project_receivable_events_created_by_fkey(id, name)
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .in("event_type", eventTypes)
      .order("created_at", { ascending: false });

    if (input.query.project_id) {
      request = request.eq("project_id", input.query.project_id);
    }
    if (input.query.actor_employee_id) {
      request = request.eq("created_by", input.query.actor_employee_id);
    }
    if (input.query.date_from) {
      request = request.gte(
        "created_at",
        `${input.query.date_from}T00:00:00.000Z`,
      );
    }
    if (input.query.date_to) {
      request = request.lte(
        "created_at",
        `${input.query.date_to}T23:59:59.999Z`,
      );
    }

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询财务修正应收事件失败", error);

    return {
      list: ((data as unknown[]) || []).map((row) =>
        normalizeReceivableEventRow(row)
      ),
      total: count || 0,
    };
  }

  async listLedgerCorrectionAudits(input: ListInput): Promise<{
    list: LedgerCorrectionAuditRow[];
    total: number;
  }> {
    return listLedgerCorrectionAuditRows(input);
  }

  async listReconciliationExceptionActions(input: ListInput): Promise<{
    list: ReconciliationExceptionActionAuditRow[];
    total: number;
  }> {
    if (
      input.query.operation &&
      input.query.operation !== "record_expense_amount_mismatch_review"
    ) {
      return { list: [], total: 0 };
    }

    let request = SupabaseDB.getAdminClient()
      .from("finance_reconciliation_exception_actions")
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
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("action", "record_expense_amount_mismatch_review")
      .order("created_at", { ascending: false });

    if (input.query.project_id) {
      request = request.eq("project_id", input.query.project_id);
    }
    if (input.query.actor_employee_id) {
      request = request.eq("actor_employee_id", input.query.actor_employee_id);
    }
    if (input.query.date_from) {
      request = request.gte(
        "created_at",
        `${input.query.date_from}T00:00:00.000Z`,
      );
    }
    if (input.query.date_to) {
      request = request.lte(
        "created_at",
        `${input.query.date_to}T23:59:59.999Z`,
      );
    }

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询费用金额复核审计失败", error);

    return {
      list: ((data as unknown[]) || []).map((row) =>
        normalizeReconciliationActionRow(row)
      ),
      total: count || 0,
    };
  }
}

function receivableEventTypesForOperation(
  operation?: FinanceCorrectionAuditOperation,
): ReceivableEventType[] {
  if (!operation) {
    return ["allocate_payment", "adjust_allocation", "reverse_allocation"];
  }
  return (Object.entries(RECEIVABLE_EVENT_OPERATIONS) as Array<
    [ReceivableEventType, FinanceCorrectionAuditOperation]
  >)
    .filter(([, mappedOperation]) => mappedOperation === operation)
    .map(([eventType]) => eventType);
}

function normalizeReceivableEventRow(
  value: unknown,
): ReceivableCorrectionEventRow {
  const row = objectOrNull(value) ?? {};
  const project = relationObject(row.project);
  const creator = relationObject(row.creator);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    project_id: String(row.project_id),
    project_name: stringOrNull(project?.name),
    receivable_plan_id: String(row.receivable_plan_id),
    event_type: row.event_type as ReceivableEventType,
    title: String(row.title ?? ""),
    note: stringOrNull(row.note),
    before_snapshot: objectOrNull(row.before_snapshot),
    after_snapshot: objectOrNull(row.after_snapshot),
    created_by: stringOrNull(row.created_by),
    created_by_name: stringOrNull(creator?.name),
    created_at: String(row.created_at),
  };
}

function normalizeReconciliationActionRow(
  value: unknown,
): ReconciliationExceptionActionAuditRow {
  const row = objectOrNull(value) ?? {};
  const actor = relationObject(row.actor_employee);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    exception_fingerprint: String(row.exception_fingerprint),
    exception_code: String(row.exception_code),
    subject_type: String(row.subject_type),
    subject_id: stringOrNull(row.subject_id),
    project_id: stringOrNull(row.project_id),
    action: row.action as FinanceCorrectionAuditOperation,
    remark: String(row.remark ?? ""),
    actor_employee_id: stringOrNull(row.actor_employee_id),
    actor_employee_name: stringOrNull(actor?.name),
    created_at: String(row.created_at),
  };
}

function relationObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return relationObject(value[0]);
  return objectOrNull(value);
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export const financeCorrectionAuditRepository =
  new FinanceCorrectionAuditRepository();
