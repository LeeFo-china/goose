export const now = "2026-07-29T10:00:00.000Z";

export const ids = {
  tenant: "22000000-0000-4000-8000-000000000001",
  relationship: "22000000-0000-4000-8000-000000000002",
  supplier: "22000000-0000-4000-8000-000000000003",
  project: "22000000-0000-4000-8000-000000000004",
  employee: "22000000-0000-4000-8000-000000000005",
  user: "22000000-0000-4000-8000-000000000006",
  unit: "22000000-0000-4000-8000-000000000007",
  productTile: "22000000-0000-4000-8000-000000000008",
  skuTile: "22000000-0000-4000-8000-000000000009",
  priceListTile: "22000000-0000-4000-8000-000000000010",
  priceItemTile: "22000000-0000-4000-8000-000000000011",
  productGrout: "22000000-0000-4000-8000-000000000012",
  skuGrout: "22000000-0000-4000-8000-000000000013",
  priceListGrout: "22000000-0000-4000-8000-000000000014",
  priceItemGrout: "22000000-0000-4000-8000-000000000015",
  fulfillment: "22000000-0000-4000-8000-000000000017",
  legacyOrder: "33000000-0000-4000-8000-000000000099",
};

export const session = {
  user_id: ids.user,
  login_channel: "admin_web",
  employee: {
    id: ids.employee,
    name: "采购管理员",
    phone: "18637605353",
    status: "active",
    tenant_department_id: null,
    department_name: "采购部",
    post_id: null,
    post_name: "采购经理",
    avatar: null,
  },
  tenant: {
    id: ids.tenant,
    name: "E2E 装修公司",
    slug: "supplier-purchase-order-e2e",
    status: "active",
  },
  roles: ["tenant_admin"],
  permissions: [
    { code: "supplier.view", scope: "all" },
    { code: "supplier.purchase-order.view", scope: "all" },
    { code: "supplier.purchase-order.manage", scope: "all" },
    { code: "project.read", scope: "all" },
    { code: "project.update", scope: "all" },
  ],
  token: "supplier-purchase-order-token",
  expires_at: "2099-12-31T23:59:59+08:00",
};

export function currentServiceAccessSummary() {
  return {
    accessStatus: "workspace_available",
    accessMode: "paid",
    accessLevel: "read_write",
    canEnterWorkspace: true,
    readonly: false,
    trialId: null,
    trialStatus: null,
    startsAt: null,
    endsAt: null,
    evaluatedAt: now,
    title: "平台技术服务可用",
    message: "当前企业可正常使用工作台。",
    primaryAction: { key: "enter_workspace", label: "进入工作台" },
    secondaryAction: null,
  };
}

export const project = {
  id: ids.project,
  tenant_id: ids.tenant,
  name: "E2E 海棠湾项目",
  status: "constructing",
};

export const relationship = {
  id: ids.relationship,
  tenant_id: ids.tenant,
  supplier_id: ids.supplier,
  relationship_status: "active",
  settlement_term_days: 30,
  credit_limit_minor: 0,
  invoice_required_before_payment: true,
  default_currency: "CNY",
  default_tax_inclusive: true,
  tenant_owner_employee_id: null,
  started_at: now,
  ended_at: null,
  remark: null,
  version: 1,
  created_at: now,
  updated_at: now,
  contract_health: "valid",
  supplier: {
    id: ids.supplier,
    code: "E2E-SUPPLIER",
    name: "E2E 建材供应商",
    legal_name: "E2E 建材供应商有限公司",
    supplier_type: "manufacturer",
    onboarding_status: "approved",
    operational_status: "active",
    version: 1,
  },
};

function catalogItem({
  productId,
  productCode,
  productName,
  skuId,
  skuCode,
  skuName,
  priceListId,
  priceListCode,
  priceItemId,
  unitPrice,
  taxInclusive = true,
}) {
  return {
    supplier_product_id: productId,
    product_code: productCode,
    product_name: productName,
    supplier_sku_id: skuId,
    sku_code: skuCode,
    sku_name: skuName,
    specification: null,
    model: null,
    supplier_price_list_id: priceListId,
    price_list_code: priceListCode,
    price_list_version: 1,
    effective_from: "2026-01-01T00:00:00.000Z",
    effective_until: null,
    supplier_price_list_item_id: priceItemId,
    purchase_unit_id: ids.unit,
    purchase_unit_code: "PCS",
    purchase_unit_name: "件",
    purchase_unit_symbol: "件",
    base_unit_id: ids.unit,
    base_unit_code: "PCS",
    base_unit_name: "件",
    base_unit_symbol: "件",
    base_unit_conversion: "1.000000",
    unit_price: unitPrice,
    tax_rate: "0.130000",
    tax_inclusive: taxInclusive,
  };
}

export function initialCatalog() {
  return [
    catalogItem({
      productId: ids.productTile,
      productCode: "E2E-TILE",
      productName: "E2E 抛釉砖",
      skuId: ids.skuTile,
      skuCode: "E2E-TILE-800",
      skuName: "E2E 抛釉砖 800x800",
      priceListId: ids.priceListTile,
      priceListCode: "E2E-BASE-TILE",
      priceItemId: ids.priceItemTile,
      unitPrice: "10.00",
    }),
    catalogItem({
      productId: ids.productGrout,
      productCode: "E2E-GROUT",
      productName: "E2E 美缝剂",
      skuId: ids.skuGrout,
      skuCode: "E2E-GROUT-2KG",
      skuName: "E2E 美缝剂 2kg",
      priceListId: ids.priceListGrout,
      priceListCode: "E2E-BASE-GROUT",
      priceItemId: ids.priceItemGrout,
      unitPrice: "20.00",
      taxInclusive: false,
    }),
  ];
}

export function directContractScenario() {
  const orderId = "33000000-0000-4000-8000-000000000099";
  const itemTile = "33000000-0000-4000-8000-000000000001";
  const itemGrout = "33000000-0000-4000-8000-000000000002";
  const shipmentA = "33000000-0000-4000-8000-000000000101";
  const shipmentB = "33000000-0000-4000-8000-000000000102";
  const receiptA = "33000000-0000-4000-8000-000000000201";
  const orderPath = `/supplier-purchase-orders/${orderId}`;
  const shipmentPath = `${orderPath}/shipments`;
  const receiptPath = `${orderPath}/receipts`;
  const draft = {
    expected_version: 0,
    project_id: ids.project,
    tenant_supplier_id: ids.relationship,
    expected_delivery_date: null,
    remark: "错误契约测试采购单",
    items: [
      { supplier_sku_id: ids.skuTile, quantity: 2 },
      { supplier_sku_id: ids.skuGrout, quantity: 3 },
    ],
  };
  const confirmation = {
    expected_version: 3,
    confirmed_at: "2029-12-31T08:00:00.000Z",
    remark: null,
  };
  const shipment = {
    id: shipmentA,
    expected_fulfillment_version: 1,
    shipment_no: "SHP-CONTRACT-A",
    shipped_at: "2030-01-01T01:00:00.000Z",
    items: [
      { purchase_order_item_id: itemTile, quantity: 1 },
      { purchase_order_item_id: itemGrout, quantity: 1 },
    ],
  };
  const shipmentBPayload = {
    ...shipment,
    id: shipmentB,
    expected_fulfillment_version: 3,
    shipment_no: "SHP-CONTRACT-B",
    items: [{ purchase_order_item_id: itemTile, quantity: 0.5 }],
  };
  const receipt = {
    id: receiptA,
    expected_fulfillment_version: 2,
    receipt_no: "REC-CONTRACT-A",
    received_at: "2030-01-01T02:00:00.000Z",
    items: [{
      purchase_order_item_id: itemTile,
      accepted_quantity: 0.5,
      rejected_quantity: 0.5,
      variance_reason: "抽检破损",
    }],
  };
  const error = (path, key, payload, status, code, details = false) => ({
    path,
    key,
    payload,
    status,
    code,
    details,
  });
  const success = (path, key, payload, idempotent = false) => ({
    path,
    key,
    payload,
    status: 200,
    idempotent,
  });

  return {
    expectedAttempts: 20,
    requiredOutcomes: [
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED",
      "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED",
      "SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED",
      "SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT",
      "SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT",
      "SUPPLIER_IDEMPOTENCY_CONFLICT",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
      "idempotent_replay",
    ],
    commands: [
      success(`${orderPath}/save-draft`, "contract-save-1", draft),
      error(
        `${orderPath}/submit`,
        "contract-submit-price-change",
        { expected_version: 1 },
        409,
        "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
      ),
      success(
        `${orderPath}/save-draft`,
        "contract-save-2",
        { ...draft, expected_version: 1 },
      ),
      success(
        `${orderPath}/submit`,
        "contract-submit",
        { expected_version: 2 },
      ),
      error(
        `${orderPath}/confirm-fulfillment`,
        "   ",
        { unexpected: true },
        400,
        "VALIDATION_ERROR",
      ),
      error(
        "/supplier-purchase-orders/not-a-uuid/confirm-fulfillment",
        "contract-invalid-path",
        confirmation,
        400,
        "VALIDATION_ERROR",
        true,
      ),
      error(
        `${orderPath}/confirm-fulfillment`,
        "contract-confirm-invalid-body",
        { ...confirmation, unexpected: true },
        400,
        "VALIDATION_ERROR",
        true,
      ),
      error(
        shipmentPath,
        "contract-shipment-invalid-body",
        { ...shipment, unexpected: true },
        400,
        "VALIDATION_ERROR",
        true,
      ),
      error(
        receiptPath,
        "contract-receipt-invalid-body",
        {
          ...receipt,
          items: [{
            purchase_order_item_id: itemTile,
            accepted_quantity: 0,
            rejected_quantity: 0.5,
            variance_reason: null,
          }],
        },
        400,
        "VALIDATION_ERROR",
        true,
      ),
      error(
        "/supplier-purchase-orders/33000000-0000-4000-8000-000000000404/confirm-fulfillment",
        "contract-order-not-found",
        confirmation,
        404,
        "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
      ),
      error(
        shipmentPath,
        "contract-not-confirmed",
        shipment,
        409,
        "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED",
      ),
      error(
        `${orderPath}/confirm-fulfillment`,
        "contract-order-version",
        { ...confirmation, expected_version: 2 },
        409,
        "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
      ),
      success(
        `${orderPath}/confirm-fulfillment`,
        "contract-confirm",
        confirmation,
      ),
      error(
        `${orderPath}/confirm-fulfillment`,
        "contract-already-confirmed",
        confirmation,
        409,
        "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED",
      ),
      error(
        shipmentPath,
        "contract-fulfillment-version",
        { ...shipment, expected_fulfillment_version: 9 },
        409,
        "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
      ),
      error(
        shipmentPath,
        "contract-over-shipped",
        {
          ...shipment,
          id: shipmentB,
          shipment_no: "SHP-CONTRACT-OVER",
          items: [{ purchase_order_item_id: itemTile, quantity: 2.0001 }],
        },
        409,
        "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED",
      ),
      success(shipmentPath, "contract-shipment-a", shipment),
      error(
        shipmentPath,
        "contract-shipment-id",
        {
          ...shipment,
          expected_fulfillment_version: 2,
          shipment_no: "SHP-CONTRACT-ID-DUPLICATE",
          items: [{ purchase_order_item_id: itemTile, quantity: 0.5 }],
        },
        409,
        "SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT",
      ),
      error(
        receiptPath,
        "contract-over-received",
        {
          ...receipt,
          receipt_no: "REC-CONTRACT-OVER",
          items: [{
            purchase_order_item_id: itemTile,
            accepted_quantity: 1.0001,
            rejected_quantity: 0,
            variance_reason: null,
          }],
        },
        409,
        "SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED",
      ),
      error(
        receiptPath,
        "contract-variance-required",
        {
          ...receipt,
          receipt_no: "REC-CONTRACT-VARIANCE",
          items: [{
            purchase_order_item_id: itemTile,
            accepted_quantity: 0,
            rejected_quantity: 0.5,
            variance_reason: null,
          }],
        },
        400,
        "VALIDATION_ERROR",
        true,
      ),
      success(receiptPath, "contract-receipt-a", receipt),
      success(shipmentPath, "contract-shipment-b", shipmentBPayload),
      success(
        shipmentPath,
        "contract-shipment-b",
        shipmentBPayload,
        true,
      ),
      error(
        shipmentPath,
        "contract-shipment-b",
        { ...shipmentBPayload, shipment_no: "SHP-CONTRACT-CONFLICT" },
        409,
        "SUPPLIER_IDEMPOTENCY_CONFLICT",
      ),
      error(
        receiptPath,
        "contract-receipt-id",
        {
          ...receipt,
          expected_fulfillment_version: 4,
          receipt_no: "REC-CONTRACT-ID-DUPLICATE",
          received_at: "2030-01-01T04:00:00.000Z",
          items: [{
            purchase_order_item_id: itemTile,
            accepted_quantity: 0.5,
            rejected_quantity: 0,
            variance_reason: null,
          }],
        },
        409,
        "SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT",
      ),
      error(
        `${orderPath}/cancel`,
        "contract-cancel-invalid-body",
        { expected_version: 3, reason: " " },
        400,
        "VALIDATION_ERROR",
        true,
      ),
      error(
        `${orderPath}/cancel`,
        "contract-cancel-started",
        { expected_version: 3, reason: "已有发货" },
        409,
        "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
      ),
    ],
  };
}
