import { Errors } from "@/errors/error-factory";
import {
  financeCorrectionAuditRepository,
  type LedgerCorrectionAuditRow,
  type ReceivableCorrectionEventRow,
} from "@/repositories/finance-correction-audits";
import type {
  FinanceCorrectionAuditListQuery,
  FinanceCorrectionAuditOperation,
  FinanceCorrectionAuditRecord,
} from "@/schema/finance-correction-audits";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type Dependencies = {
  repository: Pick<
    typeof financeCorrectionAuditRepository,
    "listReceivableCorrectionEvents" | "listLedgerCorrectionAudits"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

const OPERATION_LABELS: Record<FinanceCorrectionAuditOperation, string> = {
  manual_allocation: "人工核销",
  adjust_allocation: "调整核销",
  reverse_allocation: "撤销核销",
  generate_payment_ledger: "补生成收款台账",
  link_ledger_payment: "关联收款",
  mark_legacy_ledger: "标记历史流水",
};

export class FinanceCorrectionAuditService {
  constructor(
    private readonly dependencies: Dependencies = {
      repository: financeCorrectionAuditRepository,
      accessPolicyService,
    },
  ) {}

  async listAudits(
    authContext: AuthContext,
    query: FinanceCorrectionAuditListQuery,
  ) {
    const tenantId = this.requireView(authContext);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const candidateLimit = page * pageSize;
    const [receivableResult, ledgerResult] = await Promise.all([
      this.dependencies.repository.listReceivableCorrectionEvents({
        tenantId,
        query,
        candidateLimit,
      }),
      this.dependencies.repository.listLedgerCorrectionAudits({
        tenantId,
        query,
        candidateLimit,
      }),
    ]);

    const receivableRecords = receivableResult.list
      .map((row) => this.mapReceivableEvent(row))
      .filter((record): record is FinanceCorrectionAuditRecord =>
        Boolean(record)
      );
    const ledgerRecords = ledgerResult.list
      .flatMap((row) => this.mapLedgerRow(row));
    const allRecords = [...receivableRecords, ...ledgerRecords]
      .sort((left, right) =>
        right.occurred_at.localeCompare(left.occurred_at)
      );
    const from = (page - 1) * pageSize;
    const list = allRecords.slice(from, from + pageSize);
    const total = receivableResult.total + ledgerResult.total;

    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
      summary: {
        total,
        ledger_repair: ledgerResult.total,
        receivable_allocation: receivableResult.total,
      },
    };
  }

  private requireView(authContext: AuthContext) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.reconciliation.manage",
      )
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private mapReceivableEvent(
    row: ReceivableCorrectionEventRow,
  ): FinanceCorrectionAuditRecord | null {
    const operation = receivableEventOperation(row.event_type);
    if (!operation) return null;
    const allocationId = readString(row.after_snapshot, "id") ??
      readString(row.before_snapshot, "id");
    const paymentId = readString(row.after_snapshot, "payment_id") ??
      readString(row.before_snapshot, "payment_id");
    const amount = readNumber(row.after_snapshot, "amount") ??
      readNumber(row.before_snapshot, "amount");
    const href = new URLSearchParams();
    href.set("project_id", row.project_id);
    href.set("receivable_plan_id", row.receivable_plan_id);
    if (allocationId) href.set("allocation_id", allocationId);

    return {
      id: `receivable:${row.id}`,
      operation,
      operation_label: OPERATION_LABELS[operation],
      domain: "receivable",
      project_id: row.project_id,
      project_name: row.project_name,
      actor_employee_id: row.created_by,
      actor_employee_name: row.created_by_name,
      occurred_at: row.created_at,
      reason: row.note,
      amount,
      receivable_plan_id: row.receivable_plan_id,
      allocation_id: allocationId,
      payment_id: paymentId,
      ledger_id: null,
      target: {
        label: "查看应收计划",
        href: `/finance/receivables?${href}`,
      },
    };
  }

  private mapLedgerRow(row: LedgerCorrectionAuditRow): FinanceCorrectionAuditRecord[] {
    const records: FinanceCorrectionAuditRecord[] = [];
    if (row.payment_linked_at) {
      records.push({
        id: `ledger:${row.id}:link_ledger_payment`,
        operation: "link_ledger_payment",
        operation_label: OPERATION_LABELS.link_ledger_payment,
        domain: "ledger",
        project_id: row.project_id,
        project_name: row.project_name,
        actor_employee_id: row.payment_linked_by,
        actor_employee_name: row.payment_linked_by_name,
        occurred_at: row.payment_linked_at,
        reason: row.payment_link_reason,
        amount: row.amount,
        receivable_plan_id: null,
        allocation_id: null,
        payment_id: row.payment_id,
        ledger_id: row.id,
        target: ledgerTarget(row.id),
      });
    }
    if (row.legacy_payment_ledger_marked_at) {
      records.push({
        id: `ledger:${row.id}:mark_legacy_ledger`,
        operation: "mark_legacy_ledger",
        operation_label: OPERATION_LABELS.mark_legacy_ledger,
        domain: "ledger",
        project_id: row.project_id,
        project_name: row.project_name,
        actor_employee_id: row.legacy_payment_ledger_marked_by,
        actor_employee_name: row.legacy_payment_ledger_marked_by_name,
        occurred_at: row.legacy_payment_ledger_marked_at,
        reason: row.legacy_payment_ledger_reason,
        amount: row.amount,
        receivable_plan_id: null,
        allocation_id: null,
        payment_id: row.payment_id,
        ledger_id: row.id,
        target: ledgerTarget(row.id),
      });
    }
    return records;
  }
}

function receivableEventOperation(
  eventType: string,
): FinanceCorrectionAuditOperation | null {
  if (eventType === "allocate_payment") return "manual_allocation";
  if (eventType === "adjust_allocation") return "adjust_allocation";
  if (eventType === "reverse_allocation") return "reverse_allocation";
  return null;
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function ledgerTarget(ledgerId: string) {
  return {
    label: "查看台账流水",
    href: `/finance/ledger?ledger_id=${ledgerId}`,
  };
}

export const financeCorrectionAuditService = new FinanceCorrectionAuditService();
