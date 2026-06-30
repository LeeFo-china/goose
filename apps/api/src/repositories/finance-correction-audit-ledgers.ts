import { Errors } from "@/errors/error-factory";
import type {
  FinanceCorrectionAuditListQuery,
  FinanceCorrectionAuditOperation,
} from "@/schema/finance-correction-audits";
import { SupabaseDB } from "@/utils/supabase/index";

export type LedgerCorrectionAuditRow = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  project_name: string | null;
  amount: number | null;
  occurred_at: string | null;
  payment_id: string | null;
  expense_settlement_id: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  payment_linked_at: string | null;
  payment_linked_by: string | null;
  payment_linked_by_name: string | null;
  payment_link_reason: string | null;
  legacy_payment_ledger_marked_at: string | null;
  legacy_payment_ledger_marked_by: string | null;
  legacy_payment_ledger_marked_by_name: string | null;
  legacy_payment_ledger_reason: string | null;
  generated_ledger_at: string | null;
  generated_ledger_by: string | null;
  generated_ledger_by_name: string | null;
  generated_ledger_reason: string | null;
  generated_ledger_operation: Extract<
    FinanceCorrectionAuditOperation,
    "generate_payment_ledger" | "generate_expense_ledger"
  > | null;
  cost_category_updated_at: string | null;
  cost_category_updated_by: string | null;
  cost_category_updated_by_name: string | null;
  metadata: Record<string, unknown> | null;
};

type ListInput = {
  tenantId: string;
  query: FinanceCorrectionAuditListQuery;
  candidateLimit: number;
};

export async function listLedgerCorrectionAuditRows(
  input: ListInput,
): Promise<{ list: LedgerCorrectionAuditRow[]; total: number }> {
  if (input.query.operation && !isLedgerOperation(input.query.operation)) {
    return { list: [], total: 0 };
  }

  const [linked, legacy, generated, generatedExpense, costCategory] =
    await Promise.all([
      input.query.operation && input.query.operation !== "link_ledger_payment"
        ? Promise.resolve({ list: [], total: 0 })
        : listLinkedLedgerRows(input),
      input.query.operation && input.query.operation !== "mark_legacy_ledger"
        ? Promise.resolve({ list: [], total: 0 })
        : listLegacyLedgerRows(input),
      input.query.operation && input.query.operation !== "generate_payment_ledger"
        ? Promise.resolve({ list: [], total: 0 })
        : listGeneratedPaymentLedgerRows(input),
      input.query.operation && input.query.operation !== "generate_expense_ledger"
        ? Promise.resolve({ list: [], total: 0 })
        : listGeneratedExpenseLedgerRows(input),
      input.query.operation &&
          input.query.operation !== "update_expense_ledger_category"
        ? Promise.resolve({ list: [], total: 0 })
        : listExpenseLedgerCostCategoryRows(input),
    ]);
  const list = [
    ...linked.list,
    ...legacy.list,
    ...generated.list,
    ...generatedExpense.list,
    ...costCategory.list,
  ]
    .sort((left, right) =>
      ledgerOccurredAt(right).localeCompare(ledgerOccurredAt(left))
    )
    .slice(0, input.candidateLimit);

  return {
    list,
    total:
      linked.total +
      legacy.total +
      generated.total +
      generatedExpense.total +
      costCategory.total,
  };
}

async function listLinkedLedgerRows(input: ListInput) {
  let request = baseLedgerRequest(input.tenantId, "project_payment")
    .not("payment_linked_at", "is", null)
    .order("payment_linked_at", { ascending: false });
  request = applyLedgerSharedFilters(request, input, "payment_linked");
  return executeLedgerRequest(request, input, "查询财务台账关联收款审计失败");
}

async function listLegacyLedgerRows(input: ListInput) {
  let request = baseLedgerRequest(input.tenantId, "project_payment")
    .not("legacy_payment_ledger_marked_at", "is", null)
    .order("legacy_payment_ledger_marked_at", { ascending: false });
  request = applyLedgerSharedFilters(request, input, "legacy_marked");
  return executeLedgerRequest(request, input, "查询财务台账历史标记审计失败");
}

async function listGeneratedPaymentLedgerRows(input: ListInput) {
  let request = baseLedgerRequest(input.tenantId, "project_payment")
    .eq("metadata->>operation", "generate_missing_project_payment_ledger")
    .order("occurred_at", { ascending: false });
  request = applyLedgerSharedFilters(request, input, "generated");
  return executeLedgerRequest(request, input, "查询财务台账补生成审计失败");
}

async function listGeneratedExpenseLedgerRows(input: ListInput) {
  let request = baseLedgerRequest(input.tenantId, "expense_settlement")
    .eq("metadata->>operation", "generate_expense_ledger")
    .order("occurred_at", { ascending: false });
  request = applyLedgerSharedFilters(request, input, "generated");
  return executeLedgerRequest(request, input, "查询费用支出台账补生成审计失败");
}

async function listExpenseLedgerCostCategoryRows(input: ListInput) {
  let request = baseLedgerRequest(input.tenantId, "expense_settlement")
    .not("cost_category_updated_at", "is", null)
    .order("cost_category_updated_at", { ascending: false });
  request = applyLedgerSharedFilters(request, input, "cost_category_updated");
  return executeLedgerRequest(request, input, "查询费用支出台账成本归集审计失败");
}

async function executeLedgerRequest(
  request: ReturnType<typeof baseLedgerRequest>,
  input: ListInput,
  errorMessage: string,
) {
  const limit = Math.max(input.candidateLimit, 1);
  const { data, error, count } = await request.range(0, limit - 1);
  if (error) throw Errors.dbError(errorMessage, error);
  return {
    list: ((data as unknown[]) || []).map((row) => normalizeLedgerRow(row)),
    total: count || 0,
  };
}

function baseLedgerRequest(
  tenantId: string,
  entryType: "project_payment" | "expense_settlement",
) {
  return SupabaseDB.getAdminClient()
    .from("finance_ledger_entries")
    .select(`
      id,
      tenant_id,
      project_id,
      occurred_at,
      amount,
      payment_id,
      expense_settlement_id,
      handled_by,
      payment_linked_at,
      payment_linked_by,
      payment_link_reason,
      legacy_payment_ledger_marked_at,
      legacy_payment_ledger_marked_by,
      legacy_payment_ledger_reason,
      cost_category_updated_at,
      cost_category_updated_by,
      metadata,
      project:projects(id, name),
      handler:employees!finance_ledger_entries_handled_by_fkey(id, name),
      payment_linker:employees!finance_ledger_entries_payment_linked_by_fkey(id, name),
      legacy_marker:employees!finance_ledger_entries_legacy_payment_ledger_marked_by_fkey(id, name),
      cost_category_updater:employees!finance_ledger_entries_cost_category_updated_by_fkey(id, name)
    `, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("entry_type", entryType);
}

function applyLedgerSharedFilters(
  request: ReturnType<typeof baseLedgerRequest>,
  input: ListInput,
  mode:
    | "payment_linked"
    | "legacy_marked"
    | "generated"
    | "cost_category_updated",
) {
  let nextRequest = request;
  if (input.query.project_id) nextRequest = nextRequest.eq("project_id", input.query.project_id);
  if (input.query.actor_employee_id) {
    nextRequest = nextRequest.eq(
      actorColumnForLedgerMode(mode),
      input.query.actor_employee_id,
    );
  }
  if (input.query.date_from) {
    nextRequest = nextRequest.gte(
      dateColumnForLedgerMode(mode),
      `${input.query.date_from}T00:00:00.000Z`,
    );
  }
  if (input.query.date_to) {
    nextRequest = nextRequest.lte(
      dateColumnForLedgerMode(mode),
      `${input.query.date_to}T23:59:59.999Z`,
    );
  }
  return nextRequest;
}

function actorColumnForLedgerMode(
  mode:
    | "payment_linked"
    | "legacy_marked"
    | "generated"
    | "cost_category_updated",
) {
  if (mode === "payment_linked") return "payment_linked_by";
  if (mode === "legacy_marked") return "legacy_payment_ledger_marked_by";
  if (mode === "cost_category_updated") return "cost_category_updated_by";
  return "handled_by";
}

function dateColumnForLedgerMode(
  mode:
    | "payment_linked"
    | "legacy_marked"
    | "generated"
    | "cost_category_updated",
) {
  if (mode === "payment_linked") return "payment_linked_at";
  if (mode === "legacy_marked") return "legacy_payment_ledger_marked_at";
  if (mode === "cost_category_updated") return "cost_category_updated_at";
  return "occurred_at";
}

function isLedgerOperation(operation: FinanceCorrectionAuditOperation) {
  return operation === "link_ledger_payment" ||
    operation === "mark_legacy_ledger" ||
    operation === "generate_payment_ledger" ||
    operation === "generate_expense_ledger" ||
    operation === "update_expense_ledger_category";
}

function ledgerOccurredAt(row: LedgerCorrectionAuditRow) {
  return row.payment_linked_at ??
    row.legacy_payment_ledger_marked_at ??
    row.cost_category_updated_at ??
    row.generated_ledger_at ??
    "";
}

function normalizeLedgerRow(value: unknown): LedgerCorrectionAuditRow {
  const row = objectOrNull(value) ?? {};
  const project = relationObject(row.project);
  const handler = relationObject(row.handler);
  const paymentLinker = relationObject(row.payment_linker);
  const legacyMarker = relationObject(row.legacy_marker);
  const costCategoryUpdater = relationObject(row.cost_category_updater);
  const metadata = objectOrNull(row.metadata);
  const generatedOperation = generatedLedgerOperation(
    readString(metadata, "operation"),
  );
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    project_id: stringOrNull(row.project_id),
    project_name: stringOrNull(project?.name),
    amount: numberOrNull(row.amount),
    occurred_at: stringOrNull(row.occurred_at),
    payment_id: stringOrNull(row.payment_id),
    expense_settlement_id: stringOrNull(row.expense_settlement_id),
    handled_by: stringOrNull(row.handled_by),
    handled_by_name: stringOrNull(handler?.name),
    payment_linked_at: stringOrNull(row.payment_linked_at),
    payment_linked_by: stringOrNull(row.payment_linked_by),
    payment_linked_by_name: stringOrNull(paymentLinker?.name),
    payment_link_reason: stringOrNull(row.payment_link_reason),
    legacy_payment_ledger_marked_at: stringOrNull(row.legacy_payment_ledger_marked_at),
    legacy_payment_ledger_marked_by: stringOrNull(row.legacy_payment_ledger_marked_by),
    legacy_payment_ledger_marked_by_name: stringOrNull(legacyMarker?.name),
    legacy_payment_ledger_reason: stringOrNull(row.legacy_payment_ledger_reason),
    generated_ledger_at: generatedOperation ? stringOrNull(row.occurred_at) : null,
    generated_ledger_by: generatedOperation
      ? readString(metadata, "repaired_by") ?? stringOrNull(row.handled_by)
      : null,
    generated_ledger_by_name: generatedOperation ? stringOrNull(handler?.name) : null,
    generated_ledger_reason: generatedOperation ? readString(metadata, "repair_reason") : null,
    generated_ledger_operation: generatedOperation,
    cost_category_updated_at: stringOrNull(row.cost_category_updated_at),
    cost_category_updated_by: stringOrNull(row.cost_category_updated_by),
    cost_category_updated_by_name: stringOrNull(costCategoryUpdater?.name),
    metadata,
  };
}

function generatedLedgerOperation(
  operation: string | null,
): LedgerCorrectionAuditRow["generated_ledger_operation"] {
  if (operation === "generate_missing_project_payment_ledger") {
    return "generate_payment_ledger";
  }
  if (operation === "generate_expense_ledger") return "generate_expense_ledger";
  return null;
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

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  return stringOrNull(record?.[key]);
}

function numberOrNull(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
