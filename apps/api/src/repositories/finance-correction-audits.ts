import { Errors } from "@/errors/error-factory";
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

export type LedgerCorrectionAuditRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  project_name: string | null;
  amount: number | null;
  payment_id: string | null;
  payment_linked_at: string | null;
  payment_linked_by: string | null;
  payment_linked_by_name: string | null;
  payment_link_reason: string | null;
  legacy_payment_ledger_marked_at: string | null;
  legacy_payment_ledger_marked_by: string | null;
  legacy_payment_ledger_marked_by_name: string | null;
  legacy_payment_ledger_reason: string | null;
  metadata: Record<string, unknown> | null;
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
    if (input.query.operation && !isLedgerOperation(input.query.operation)) {
      return { list: [], total: 0 };
    }

    const [linked, legacy] = await Promise.all([
      input.query.operation && input.query.operation !== "link_ledger_payment"
        ? Promise.resolve({ list: [], total: 0 })
        : this.listLinkedLedgerRows(input),
      input.query.operation && input.query.operation !== "mark_legacy_ledger"
        ? Promise.resolve({ list: [], total: 0 })
        : this.listLegacyLedgerRows(input),
    ]);
    const list = [...linked.list, ...legacy.list]
      .sort((left, right) =>
        ledgerOccurredAt(right).localeCompare(ledgerOccurredAt(left))
      )
      .slice(0, input.candidateLimit);

    return {
      list,
      total: linked.total + legacy.total,
    };
  }

  private async listLinkedLedgerRows(input: ListInput): Promise<{
    list: LedgerCorrectionAuditRow[];
    total: number;
  }> {
    let request = baseLedgerRequest(input.tenantId)
      .not("payment_linked_at", "is", null)
      .order("payment_linked_at", { ascending: false });
    request = applyLedgerSharedFilters(request, input, "payment_linked");

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询财务台账关联收款审计失败", error);

    return {
      list: ((data as unknown[]) || []).map((row) => normalizeLedgerRow(row)),
      total: count || 0,
    };
  }

  private async listLegacyLedgerRows(input: ListInput): Promise<{
    list: LedgerCorrectionAuditRow[];
    total: number;
  }> {
    let request = baseLedgerRequest(input.tenantId)
      .not("legacy_payment_ledger_marked_at", "is", null)
      .order("legacy_payment_ledger_marked_at", { ascending: false });
    request = applyLedgerSharedFilters(request, input, "legacy_marked");

    const limit = Math.max(input.candidateLimit, 1);
    const { data, error, count } = await request.range(0, limit - 1);
    if (error) throw Errors.dbError("查询财务台账历史标记审计失败", error);

    return {
      list: ((data as unknown[]) || []).map((row) => normalizeLedgerRow(row)),
      total: count || 0,
    };
  }
}

function baseLedgerRequest(tenantId: string) {
  return SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select(`
      id,
      tenant_id,
      project_id,
      amount,
      payment_id,
      payment_linked_at,
      payment_linked_by,
      payment_link_reason,
      legacy_payment_ledger_marked_at,
      legacy_payment_ledger_marked_by,
      legacy_payment_ledger_reason,
      metadata,
      project:projects(id, name),
      payment_linker:employees!finance_ledger_entries_payment_linked_by_fkey(id, name),
      legacy_marker:employees!finance_ledger_entries_legacy_payment_ledger_marked_by_fkey(id, name)
    `, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("entry_type", "project_payment");
}

function applyLedgerSharedFilters(
  request: ReturnType<typeof baseLedgerRequest>,
  input: ListInput,
  mode: "payment_linked" | "legacy_marked",
) {
  let nextRequest = request;
  if (input.query.project_id) {
    nextRequest = nextRequest.eq("project_id", input.query.project_id);
  }
  if (input.query.actor_employee_id) {
    nextRequest = nextRequest.eq(
      mode === "payment_linked"
        ? "payment_linked_by"
        : "legacy_payment_ledger_marked_by",
      input.query.actor_employee_id,
    );
  }
  if (input.query.date_from) {
    nextRequest = nextRequest.gte(
      mode === "payment_linked"
        ? "payment_linked_at"
        : "legacy_payment_ledger_marked_at",
      `${input.query.date_from}T00:00:00.000Z`,
    );
  }
  if (input.query.date_to) {
    nextRequest = nextRequest.lte(
      mode === "payment_linked"
        ? "payment_linked_at"
        : "legacy_payment_ledger_marked_at",
      `${input.query.date_to}T23:59:59.999Z`,
    );
  }
  return nextRequest;
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

function isLedgerOperation(operation: FinanceCorrectionAuditOperation) {
  return operation === "link_ledger_payment" ||
    operation === "mark_legacy_ledger" ||
    operation === "generate_payment_ledger";
}

function ledgerOccurredAt(row: LedgerCorrectionAuditRow) {
  return row.payment_linked_at ??
    row.legacy_payment_ledger_marked_at ??
    "";
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

function normalizeLedgerRow(value: unknown): LedgerCorrectionAuditRow {
  const row = objectOrNull(value) ?? {};
  const project = relationObject(row.project);
  const paymentLinker = relationObject(row.payment_linker);
  const legacyMarker = relationObject(row.legacy_marker);
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    project_id: stringOrNull(row.project_id),
    project_name: stringOrNull(project?.name),
    amount: numberOrNull(row.amount),
    payment_id: stringOrNull(row.payment_id),
    payment_linked_at: stringOrNull(row.payment_linked_at),
    payment_linked_by: stringOrNull(row.payment_linked_by),
    payment_linked_by_name: stringOrNull(paymentLinker?.name),
    payment_link_reason: stringOrNull(row.payment_link_reason),
    legacy_payment_ledger_marked_at: stringOrNull(
      row.legacy_payment_ledger_marked_at,
    ),
    legacy_payment_ledger_marked_by: stringOrNull(
      row.legacy_payment_ledger_marked_by,
    ),
    legacy_payment_ledger_marked_by_name: stringOrNull(legacyMarker?.name),
    legacy_payment_ledger_reason: stringOrNull(row.legacy_payment_ledger_reason),
    metadata: objectOrNull(row.metadata),
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

function numberOrNull(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export const financeCorrectionAuditRepository =
  new FinanceCorrectionAuditRepository();
