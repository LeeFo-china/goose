import { Errors } from "@/errors/error-factory";
import type {
  FinanceProjectLedgerTotals,
  FinanceProjectSupplierTotals,
} from "@/repositories/finance-project-summary";
import { SupabaseDB } from "@/utils/supabase/index";
import {
  addMoneyCents,
  moneyCentsToSafeNumber,
} from "@/utils/fixed-point-money";

const MAX_BATCH_PROJECTS = 100;
const MAX_FACT_ROWS = 10_000;

export async function listFinanceProjectLedgerTotals(input: {
  tenantId: string;
  projectIds: string[];
}): Promise<Map<string, FinanceProjectLedgerTotals>> {
  const projectIds = requireProjectBatch(input.projectIds);
  if (projectIds.length === 0) return new Map();

  const { data, error } = await queryFactPages(
    "finance_ledger_entries",
    "project_id,direction,entry_type,amount,cost_category_id",
    input.tenantId,
    projectIds,
  );
  if (error) throw Errors.dbError("查询项目财务流水汇总失败", error);
  const rows = requireBoundedRows(data, "项目财务流水");

  const totals = new Map<string, FinanceProjectLedgerTotals>();
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || typeof row.project_id !== "string") continue;
    const current = totals.get(row.project_id) ?? emptyLedgerTotals();
    const amount = parseMoney(row.amount, "解析项目财务流水汇总失败", data);
    if (row.direction === "in") {
      current.income_amount += amount;
    } else if (
      row.direction === "out" &&
      row.entry_type !== "supplier_payment"
    ) {
      current.expense_amount += amount;
      if (typeof row.cost_category_id !== "string") {
        current.unallocated_expense_amount += amount;
      } else {
        current.expense_by_category.set(
          row.cost_category_id,
          (current.expense_by_category.get(row.cost_category_id) ?? 0) + amount,
        );
      }
    }
    current.ledger_entry_count += 1;
    totals.set(row.project_id, current);
  }
  return totals;
}

export async function listFinanceProjectSupplierTotals(input: {
  tenantId: string;
  projectIds: string[];
}): Promise<Map<string, FinanceProjectSupplierTotals>> {
  const projectIds = requireProjectBatch(input.projectIds);
  if (projectIds.length === 0) return new Map();

  const [costResult, payableResult, paymentResult] = await Promise.all([
    queryFactPages(
      "project_cost_events",
      "project_id,cost_category_id,amount",
      input.tenantId,
      projectIds,
    ),
    queryFactPages(
      "supplier_payable_events",
      "project_id,amount",
      input.tenantId,
      projectIds,
    ),
    queryFactPages(
      "supplier_payments",
      "project_id,amount",
      input.tenantId,
      projectIds,
    ),
  ]);
  const costs = parseFactResult(
    costResult,
    "查询项目供应商成本失败",
    "项目供应商成本",
  );
  const payables = parseFactResult(
    payableResult,
    "查询项目供应商应付失败",
    "项目供应商应付",
  );
  const payments = parseFactResult(
    paymentResult,
    "查询项目供应商付款失败",
    "项目供应商付款",
  );

  const centsTotals = new Map<string, SupplierCentsTotals>();
  aggregateSupplierCosts(costs, centsTotals);
  aggregateFacts(payables, centsTotals, "supplierPayableCents");
  aggregateFacts(payments, centsTotals, "supplierCashCents");
  return finalizeSupplierTotals(centsTotals);
}

async function queryFactPages(
  table: string,
  columns: string,
  tenantId: string,
  projectIds: string[],
): Promise<{ data: unknown; error: unknown }> {
  const rows: unknown[] = [];
  for (let from = 0; from <= MAX_FACT_ROWS; from += 1_000) {
    const to = Math.min(from + 999, MAX_FACT_ROWS);
    const result = await SupabaseDB.getAdminClient()
      .from(table)
      .select(columns)
      .eq("tenant_id", tenantId)
      .in("project_id", projectIds)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (result.error) return { data: [], error: result.error };
    if (!Array.isArray(result.data)) {
      return { data: result.data, error: null };
    }
    rows.push(...result.data);
    if (result.data.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}

function parseFactResult(
  result: { data: unknown; error: unknown },
  errorMessage: string,
  factName: string,
) {
  if (result.error) throw Errors.dbError(errorMessage, result.error);
  return requireBoundedRows(result.data, factName);
}

function aggregateFacts(
  rows: unknown[],
  totals: Map<string, SupplierCentsTotals>,
  field: "supplierPayableCents" | "supplierCashCents",
) {
  for (const value of rows) {
    const row = asRecord(value);
    if (!row || typeof row.project_id !== "string") {
      throw Errors.dbError("解析项目供应商财务事实失败", rows);
    }
    const current = totals.get(row.project_id) ?? emptySupplierCentsTotals();
    current[field] = addSupplierMoney(current[field], row.amount, rows);
    totals.set(row.project_id, current);
  }
}

function aggregateSupplierCosts(
  rows: unknown[],
  totals: Map<string, SupplierCentsTotals>,
) {
  for (const value of rows) {
    const row = asRecord(value);
    if (
      !row ||
      typeof row.project_id !== "string" ||
      typeof row.cost_category_id !== "string"
    ) {
      throw Errors.dbError("解析项目供应商财务事实失败", rows);
    }
    const current = totals.get(row.project_id) ?? emptySupplierCentsTotals();
    current.supplierCostCents = addSupplierMoney(
      current.supplierCostCents,
      row.amount,
      rows,
    );
    current.costCentsByCategory.set(
      row.cost_category_id,
      addSupplierMoney(
        current.costCentsByCategory.get(row.cost_category_id) ?? BigInt(0),
        row.amount,
        rows,
      ),
    );
    totals.set(row.project_id, current);
  }
}

function finalizeSupplierTotals(
  centsTotals: Map<string, SupplierCentsTotals>,
): Map<string, FinanceProjectSupplierTotals> {
  const totals = new Map<string, FinanceProjectSupplierTotals>();
  for (const [projectId, cents] of centsTotals) {
    const openCents = cents.supplierPayableCents > cents.supplierCashCents
      ? cents.supplierPayableCents - cents.supplierCashCents
      : BigInt(0);
    totals.set(projectId, {
      supplier_cost_amount: supplierCentsToNumber(cents.supplierCostCents),
      supplier_payable_open_amount: supplierCentsToNumber(openCents),
      supplier_cash_paid_amount: supplierCentsToNumber(cents.supplierCashCents),
      supplier_cost_by_category: new Map(
        [...cents.costCentsByCategory].map(([categoryId, amount]) => [
          categoryId,
          supplierCentsToNumber(amount),
        ]),
      ),
    });
  }
  return totals;
}

function addSupplierMoney(current: bigint, value: unknown, details: unknown) {
  return addMoneyCents(current, value, {
    parseErrorMessage: "解析项目供应商财务事实失败",
    overflowMessage: "项目供应商财务事实超过安全汇总边界",
    details,
  });
}

function supplierCentsToNumber(cents: bigint) {
  return moneyCentsToSafeNumber(cents, {
    parseErrorMessage: "解析项目供应商财务事实失败",
    overflowMessage: "项目供应商财务事实超过安全汇总边界",
    details: null,
  });
}

function requireProjectBatch(projectIds: string[]) {
  if (projectIds.length > MAX_BATCH_PROJECTS) {
    throw Errors.badRequest("项目财务汇总批量范围不能超过 100 个项目");
  }
  return [...new Set(projectIds)];
}

function requireBoundedRows(data: unknown, factName: string): unknown[] {
  if (!Array.isArray(data)) throw Errors.dbError(`解析${factName}失败`, data);
  if (data.length > MAX_FACT_ROWS) {
    throw Errors.business(
      422,
      `${factName}超过单次汇总边界`,
      "FINANCE_PROJECT_SUPPLIER_FACTS_TOO_MANY_ROWS",
    );
  }
  return data;
}

function parseMoney(value: unknown, message: string, details: unknown) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && value.trim() === "")
  ) {
    throw Errors.dbError(message, details);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Errors.dbError(message, details);
  }
  return roundMoney(amount);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function emptyLedgerTotals(): FinanceProjectLedgerTotals {
  return {
    income_amount: 0,
    expense_amount: 0,
    unallocated_expense_amount: 0,
    ledger_entry_count: 0,
    expense_by_category: new Map(),
  };
}

type SupplierCentsTotals = {
  supplierCostCents: bigint;
  supplierPayableCents: bigint;
  supplierCashCents: bigint;
  costCentsByCategory: Map<string, bigint>;
};

function emptySupplierCentsTotals(): SupplierCentsTotals {
  return {
    supplierCostCents: BigInt(0),
    supplierPayableCents: BigInt(0),
    supplierCashCents: BigInt(0),
    costCentsByCategory: new Map(),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
