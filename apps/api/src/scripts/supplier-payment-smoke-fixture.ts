import {
  SMOKE_IDS as PURCHASE_ORDER_IDS,
  seedSupplierFixture,
  selectFixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";
import { orderCommand } from "./supplier-purchase-order-smoke-commands";
import {
  extendFixture,
  reviewRequisition,
  saveRequisition,
  submitRequisition,
  convertRequisition,
  type RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";

export { PURCHASE_ORDER_IDS as SUPPLIER_PAYMENT_BASE_IDS };

export const SUPPLIER_PAYMENT_SMOKE_IDS = {
  order: "86000000-0000-4000-8000-000000000001",
  requisition: "86000000-0000-4000-8000-000000000002",
  costCategory: "86000000-0000-4000-8000-000000000003",
  budget: "86000000-0000-4000-8000-000000000004",
  contractDocument: "86000000-0000-4000-8000-000000000005",
  contract: "86000000-0000-4000-8000-000000000006",
  shipment: "86000000-0000-4000-8000-000000000007",
  partialReceipt: "86000000-0000-4000-8000-000000000008",
  finalReceipt: "86000000-0000-4000-8000-000000000009",
  invoiceOrder: "86000000-0000-4000-8000-000000000010",
  invoiceShipment: "86000000-0000-4000-8000-000000000011",
  invoiceReceipt: "86000000-0000-4000-8000-000000000012",
  requestA: "86000000-0000-4000-8000-000000000013",
  requestB: "86000000-0000-4000-8000-000000000014",
  invoiceRequest: "86000000-0000-4000-8000-000000000015",
  firstPayment: "86000000-0000-4000-8000-000000000016",
  finalPayment: "86000000-0000-4000-8000-000000000017",
  invoicePayment: "86000000-0000-4000-8000-000000000018",
  saveRequestAKey: "86000000-0000-4000-8000-000000000019",
  saveRequestBKey: "86000000-0000-4000-8000-000000000020",
  submitRequestAKey: "86000000-0000-4000-8000-000000000021",
  submitRequestBKey: "86000000-0000-4000-8000-000000000022",
  rejectRequestKey: "86000000-0000-4000-8000-000000000023",
  resubmitRequestKey: "86000000-0000-4000-8000-000000000024",
  approveRequestKey: "86000000-0000-4000-8000-000000000025",
  firstPaymentKey: "86000000-0000-4000-8000-000000000026",
  finalPaymentKey: "86000000-0000-4000-8000-000000000027",
  saveInvoiceRequestKey: "86000000-0000-4000-8000-000000000028",
  submitInvoiceRequestKey: "86000000-0000-4000-8000-000000000029",
  approveInvoiceRequestKey: "86000000-0000-4000-8000-000000000030",
  invoicePaymentKey: "86000000-0000-4000-8000-000000000031",
  tenantIsolationKey: "86000000-0000-4000-8000-000000000032",
  selfReviewApproveKey: "86000000-0000-4000-8000-000000000033",
  selfReviewRejectKey: "86000000-0000-4000-8000-000000000034",
  invoiceRequisition: "86000000-0000-4000-8000-000000000035",
  explainNoiseSupplier: "86000000-0000-4000-8000-000000000036",
  explainNoiseRelationship: "86000000-0000-4000-8000-000000000037",
  explainNoiseProduct: "86000000-0000-4000-8000-000000000038",
  explainNoiseSku: "86000000-0000-4000-8000-000000000039",
  explainNoisePriceList: "86000000-0000-4000-8000-000000000040",
  explainNoisePriceItem: "86000000-0000-4000-8000-000000000041",
  explainNoiseOrder: "86000000-0000-4000-8000-000000000042",
  explainNoiseOrderItem: "86000000-0000-4000-8000-000000000043",
  explainNoiseFulfillment: "86000000-0000-4000-8000-000000000044",
} as const;

export type SupplierPaymentSmokeSql = SmokeSql;

export type SupplierPaymentSmokeFixture = RequisitionSmokeFixture & {
  order_item_id: string;
  invoice_order_item_id: string;
};

class SupplierPaymentSmokeFixtureError extends Error {}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPaymentSmokeFixtureError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireStatus(value: unknown, status: string, label: string): void {
  if (record(value, label).status !== status) {
    throw new SupplierPaymentSmokeFixtureError(
      `${label} did not return ${status}`,
    );
  }
}

async function seedCommercialContract(
  sql: SupplierPaymentSmokeSql,
  fixture: RequisitionSmokeFixture,
): Promise<void> {
  await sql`
    insert into public.platform_file_objects (
      id, tenant_id, owner_type, owner_id, scene, bucket, object_key,
      original_name, mime_type, visibility, status,
      created_by_auth_user_id, created_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.contractDocument}::uuid,
      ${fixture.tenant_id}::uuid, 'tenant', ${fixture.tenant_id}::uuid,
      'supplier_contract_document', 'supplier-payment-smoke',
      'rollback-only/supplier-contract.pdf', 'supplier-contract.pdf',
      'application/pdf', 'private', 'active',
      ${fixture.user_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_contracts (
      id, tenant_id, tenant_supplier_id, contract_no, name,
      lifecycle_status, valid_from, valid_until, settlement_term_days,
      invoice_required_before_payment, document_file_id,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.contract}::uuid,
      ${fixture.tenant_id}::uuid, ${PURCHASE_ORDER_IDS.relationship}::uuid,
      'SMOKE-PAYMENT-CONTRACT', '应付付款回滚烟测合同', 'active',
      current_date - 1, current_date + 1, 30, false,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.contractDocument}::uuid,
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
}

async function prepareRequisitionOrder(
  sql: SupplierPaymentSmokeSql,
  fixture: RequisitionSmokeFixture,
  input: {
    requisitionId: string;
    orderId: string;
    quantity: number;
    label: string;
  },
): Promise<string> {
  requireStatus(
    await saveRequisition(
      sql,
      fixture,
      input.requisitionId,
      0,
      `supplier-payment-smoke-${input.label}-requisition-save`,
      input.quantity,
    ),
    "saved",
    `${input.label} requisition save`,
  );
  requireStatus(
    await submitRequisition(
      sql,
      fixture,
      input.requisitionId,
      1,
      `supplier-payment-smoke-${input.label}-requisition-submit`,
    ),
    "submitted",
    `${input.label} requisition submit`,
  );
  requireStatus(
    await reviewRequisition(
      sql,
      fixture,
      input.requisitionId,
      2,
      "approve",
      `supplier-payment-smoke-${input.label}-requisition-approve`,
    ),
    "approved",
    `${input.label} requisition approval`,
  );
  requireStatus(
    await convertRequisition(
      sql,
      fixture,
      input.requisitionId,
      input.orderId,
      3,
      `supplier-payment-smoke-${input.label}-requisition-convert`,
    ),
    "converted",
    `${input.label} requisition conversion`,
  );
  requireStatus(
    await orderCommand(sql, fixture, "submit", 1, {
      orderId: input.orderId,
    }),
    "submitted",
    `${input.label} converted order submit`,
  );
  return selectOrderItem(sql, fixture.tenant_id, input.orderId);
}

async function prepareInvoiceOrder(
  sql: SupplierPaymentSmokeSql,
  fixture: RequisitionSmokeFixture,
): Promise<string> {
  await sql`
    update public.supplier_contracts
    set invoice_required_before_payment = true,
        version = version + 1
    where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.contract}::uuid
      and tenant_id = ${fixture.tenant_id}::uuid;
  `;
  return prepareRequisitionOrder(sql, fixture, {
    requisitionId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceRequisition,
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceOrder,
    quantity: 1,
    label: "invoice",
  });
}

async function selectOrderItem(
  sql: SupplierPaymentSmokeSql,
  tenantId: string,
  orderId: string,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    select purchase_item.id
    from public.supplier_purchase_order_items as purchase_item
    where purchase_item.tenant_id = ${tenantId}::uuid
      and purchase_item.supplier_purchase_order_id = ${orderId}::uuid
    order by purchase_item.line_no, purchase_item.id
    limit 2;
  `;
  if (rows.length !== 1 || !rows[0]?.id) {
    throw new SupplierPaymentSmokeFixtureError(
      "payment smoke order must have exactly one item",
    );
  }
  return rows[0].id;
}

async function prepareFulfillment(
  sql: SupplierPaymentSmokeSql,
  fixture: RequisitionSmokeFixture,
  input: {
    orderId: string;
    orderItemId: string;
    shipmentId: string;
    quantity: number;
    label: string;
  },
): Promise<void> {
  const confirmed = await sql<{ result: unknown }[]>`
    select public.confirm_supplier_purchase_order_fulfillment(
      ${input.orderId}::uuid,
      ${fixture.tenant_id}::uuid,
      2::integer,
      '2026-07-31T01:00:00.000Z'::timestamptz,
      ${`${input.label} 履约确认`},
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${`supplier-payment-smoke-${input.label}-confirm`}
    ) as result;
  `;
  requireStatus(
    confirmed[0]?.result,
    "confirmed",
    `${input.label} fulfillment confirmation`,
  );
  const items = [{
    purchase_order_item_id: input.orderItemId,
    quantity: input.quantity,
  }];
  const shipped = await sql<{ result: unknown }[]>`
    select public.create_supplier_purchase_order_shipment(
      ${input.shipmentId}::uuid,
      ${input.orderId}::uuid,
      ${fixture.tenant_id}::uuid,
      1::integer,
      ${`SMOKE-PAYMENT-${input.label.toUpperCase()}-SHIPMENT`},
      '2026-07-31T02:00:00.000Z'::timestamptz,
      '数据库付款烟测承运方',
      ${`SMOKE-PAYMENT-${input.label.toUpperCase()}-TRACKING`},
      ${`${input.label} 发货`},
      ${items}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${`supplier-payment-smoke-${input.label}-shipment`}
    ) as result;
  `;
  requireStatus(
    shipped[0]?.result,
    "shipment_created",
    `${input.label} shipment`,
  );
}

export async function seedSupplierPaymentSmokeFixture(
  sql: SupplierPaymentSmokeSql,
): Promise<SupplierPaymentSmokeFixture> {
  const base = await selectFixtureReferences(sql);
  await seedSupplierFixture(sql, base);
  const fixture = await extendFixture(
    sql,
    base,
    SUPPLIER_PAYMENT_SMOKE_IDS.costCategory,
    SUPPLIER_PAYMENT_SMOKE_IDS.budget,
  );
  await seedCommercialContract(sql, fixture);
  const orderItemId = await prepareRequisitionOrder(sql, fixture, {
    requisitionId: SUPPLIER_PAYMENT_SMOKE_IDS.requisition,
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.order,
    quantity: 3.3333,
    label: "main",
  });
  const invoiceOrderItemId = await prepareInvoiceOrder(sql, fixture);
  await prepareFulfillment(sql, fixture, {
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.order,
    orderItemId,
    shipmentId: SUPPLIER_PAYMENT_SMOKE_IDS.shipment,
    quantity: 3.3333,
    label: "main",
  });
  await prepareFulfillment(sql, fixture, {
    orderId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceOrder,
    orderItemId: invoiceOrderItemId,
    shipmentId: SUPPLIER_PAYMENT_SMOKE_IDS.invoiceShipment,
    quantity: 1,
    label: "invoice",
  });
  return {
    ...fixture,
    order_item_id: orderItemId,
    invoice_order_item_id: invoiceOrderItemId,
  };
}
