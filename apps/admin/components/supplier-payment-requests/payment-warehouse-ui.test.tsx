import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { initialInvoiceRequest } from "../../e2e/supplier-payment-mock-fixture.mjs";
import { PaymentRequestFacts } from "./payment-request-detail-content";
import { PaymentRequestList } from "./payment-request-list";
import type { SupplierPaymentRequestDetail } from "./payment-request-types";

const warehouseId = "00000000-0000-4000-8000-000000000099";
const detail: SupplierPaymentRequestDetail = {
  ...initialInvoiceRequest(), payment_request: { ...initialInvoiceRequest().payment_request,
    status: "approved", currency: "CNY", destination_type: "warehouse", project_id: null, warehouse_id: warehouseId },
};
test("warehouse financial facts and list render null project without an internal ID as destination", () => {
  const facts = renderToStaticMarkup(<PaymentRequestFacts detail={detail} supplierName="建材供应商" />);
  expect(facts).toContain("采购去向");
  expect(facts).toContain("仓库补货");
  expect(facts).not.toContain(warehouseId);
  const list = renderToStaticMarkup(<PaymentRequestList records={[{ ...detail.payment_request, warehouse_name: "北区历史仓", supplier_name: "建材供应商" }]}
    loading={false} permissions={{ canManage: true, canApprove: true, canPay: true }} pendingRequestId={null} onOpen={() => {}} onAction={() => {}} />);
  expect(list).toContain("北区历史仓");
  expect(list).not.toContain("更多操作");
  expect(list).not.toContain(warehouseId);
});
