import type {
  FinanceOperatingReportSupplierCostRow,
} from "@/repositories/finance-operating-report";
import {
  addMoneyCents,
  moneyCentsToSafeNumber,
} from "@/utils/fixed-point-money";

export function aggregateSupplierCostCentsBy(
  rows: FinanceOperatingReportSupplierCostRow[],
  getKey: (row: FinanceOperatingReportSupplierCostRow) => string,
) {
  const totals = new Map<string, bigint>();
  for (const row of rows) {
    const key = getKey(row);
    totals.set(
      key,
      addMoneyCents(
        totals.get(key) ?? BigInt(0),
        row.amount,
        context(rows),
      ),
    );
  }
  return totals;
}

export function supplierCostCentsToNumber(
  cents: bigint,
  rows: FinanceOperatingReportSupplierCostRow[],
) {
  return moneyCentsToSafeNumber(cents, context(rows));
}

export function sumSupplierCostCents(totals: Map<string, bigint>) {
  let cents = BigInt(0);
  for (const amount of totals.values()) cents += amount;
  return cents;
}

function context(rows: FinanceOperatingReportSupplierCostRow[]) {
  return {
    parseErrorMessage: "解析财务运营报表供应商成本失败",
    overflowMessage: "财务运营报表供应商成本超过安全汇总边界",
    details: rows,
  };
}
