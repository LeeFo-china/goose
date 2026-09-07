import { payableDestination, type PayableDestinationFields } from "../supplier-payables/payable-destination";

export type SupplierPaymentCommandRefresh = {
  refreshPayables: true;
  refreshRequests: true;
  refreshRequestDetail: true;
  refreshPurchaseOrderSummary: true;
  refreshProjectFinance: boolean;
};

export type PaymentRequestRefreshOutcome<Latest> =
  | {
    status: "refreshed";
    latest: Latest;
    releaseAttempt: true;
    closeDialogs: true;
    notifyChanged: true;
    refreshRequired: false;
  }
  | {
    status: "failed";
    latest: null;
    releaseAttempt: false;
    closeDialogs: false;
    notifyChanged: false;
    refreshRequired: true;
  };

export function supplierPaymentCommandRefresh(destination?: PayableDestinationFields): SupplierPaymentCommandRefresh {
  return {
    refreshPayables: true,
    refreshRequests: true,
    refreshRequestDetail: true,
    refreshPurchaseOrderSummary: true,
    refreshProjectFinance: destination === undefined || payableDestination(destination)?.destination_type === "project",
  };
}

export function paymentRequestRefreshOutcome<Latest>(
  latest: Latest | null,
): PaymentRequestRefreshOutcome<Latest> {
  return latest === null
    ? {
      status: "failed",
      latest: null,
      releaseAttempt: false,
      closeDialogs: false,
      notifyChanged: false,
      refreshRequired: true,
    }
    : {
      status: "refreshed",
      latest,
      releaseAttempt: true,
      closeDialogs: true,
      notifyChanged: true,
      refreshRequired: false,
    };
}
