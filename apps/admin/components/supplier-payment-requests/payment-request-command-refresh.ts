export type SupplierPaymentCommandRefresh = {
  refreshPayables: true;
  refreshRequests: true;
  refreshRequestDetail: true;
  refreshPurchaseOrderSummary: true;
  refreshProjectFinance: true;
};

export function supplierPaymentCommandRefresh(): SupplierPaymentCommandRefresh {
  return {
    refreshPayables: true,
    refreshRequests: true,
    refreshRequestDetail: true,
    refreshPurchaseOrderSummary: true,
    refreshProjectFinance: true,
  };
}
