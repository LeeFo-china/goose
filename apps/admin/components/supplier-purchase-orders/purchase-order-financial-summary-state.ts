import type {
  SupplierPurchaseOrderFinancialSummary,
} from "./purchase-order-types";

export type PurchaseOrderFinancialSummaryState = {
  summary: SupplierPurchaseOrderFinancialSummary | null;
  isLoading: boolean;
  error: string | null;
};

export const unloadedFinancialSummaryState:
  PurchaseOrderFinancialSummaryState = {
    summary: null,
    isLoading: false,
    error: null,
  };

export function loadingFinancialSummaryState(
  current: PurchaseOrderFinancialSummaryState,
): PurchaseOrderFinancialSummaryState {
  return {
    ...current,
    isLoading: true,
    error: null,
  };
}

export function loadedFinancialSummaryState(
  summary: SupplierPurchaseOrderFinancialSummary,
): PurchaseOrderFinancialSummaryState {
  return {
    summary,
    isLoading: false,
    error: null,
  };
}

export function failedFinancialSummaryState(
  error: string,
): PurchaseOrderFinancialSummaryState {
  return {
    summary: null,
    isLoading: false,
    error,
  };
}
