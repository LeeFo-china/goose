import { Errors } from "@/errors/error-factory";
import {
  addMoneyCents,
  moneyCentsToSafeNumber,
} from "@/utils/fixed-point-money";

export type ProjectCostBudgetSupplierCostTotals = {
  sourceRowCount: number;
  totalSupplierCostAmount: number;
  byCategory: Map<string, number>;
  categoryDetails: Map<string, {
    code: string | null;
    name: string | null;
  }>;
};

export function summarizeProjectSupplierCosts(
  rows: unknown[],
): ProjectCostBudgetSupplierCostTotals {
  if (rows.length > 10_000) {
    throw Errors.business(
      422,
      "项目供应商成本事件过多，请使用成本汇总任务",
      "PROJECT_SUPPLIER_COST_EVENTS_TOO_MANY_ROWS",
    );
  }
  const context = {
    parseErrorMessage: "解析项目供应商实际成本失败",
    overflowMessage: "项目供应商实际成本超过安全汇总边界",
    details: rows,
  };
  const categoryCents = new Map<string, bigint>();
  const categoryDetails = new Map<string, {
    code: string | null;
    name: string | null;
  }>();
  let totalCents = BigInt(0);
  for (const value of rows) {
    const row = asRecord(value);
    const category = parseCategory(row?.cost_category);
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.cost_category_id !== "string" ||
      !category
    ) {
      throw Errors.dbError(context.parseErrorMessage, rows);
    }
    totalCents = addMoneyCents(totalCents, row.amount, context);
    categoryCents.set(
      row.cost_category_id,
      addMoneyCents(
        categoryCents.get(row.cost_category_id) ?? BigInt(0),
        row.amount,
        context,
      ),
    );
    const existing = categoryDetails.get(row.cost_category_id);
    if (
      existing &&
      (existing.code !== category.code || existing.name !== category.name)
    ) {
      throw Errors.dbError(context.parseErrorMessage, rows);
    }
    categoryDetails.set(row.cost_category_id, category);
  }

  return {
    sourceRowCount: rows.length,
    totalSupplierCostAmount: moneyCentsToSafeNumber(totalCents, context),
    byCategory: new Map(
      [...categoryCents].map(([id, cents]) => [
        id,
        moneyCentsToSafeNumber(cents, context),
      ]),
    ),
    categoryDetails,
  };
}

function parseCategory(value: unknown) {
  const category = asRecord(Array.isArray(value) ? value[0] : value);
  if (
    !category ||
    typeof category.code !== "string" ||
    typeof category.name !== "string"
  ) {
    return null;
  }
  return { code: category.code, name: category.name };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
