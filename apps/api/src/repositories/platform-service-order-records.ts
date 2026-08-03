export type ProductVersionRecord = {
  id: string;
  version: number;
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
};

export type ProductRecord = {
  id: string;
  code: string;
  status: "draft" | "enabled" | "disabled" | "archived";
  published_version_id: string | null;
  published_version: ProductVersionRecord | ProductVersionRecord[] | null;
};

export type PlatformProductRecord = ProductRecord & {
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
  version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OrderRecord = {
  id: string;
  tenant_id?: string;
  order_no: string;
  out_trade_no?: string;
  product_code: string;
  term_years: number;
  amount_fen: number;
  payment_status: string;
  service_status: string;
  prepay_id: string | null;
  payment_expires_at: string;
  paid_at: string | null;
  closed_at: string | null;
  terms_version: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CreatePendingOrderInput = {
  tenantId: string;
  productId: string;
  productVersionId: string;
  orderNo: string;
  outTradeNo: string;
  idempotencyKey: string;
  productCode: string;
  pricingVersion: number;
  productSnapshot: Record<string, unknown>;
  termYears: number;
  amountFen: number;
  paymentConfigId: string;
  paymentConfigGuardVersion: number;
  payerOpenid: string;
  paymentExpiresAt: string;
  termsVersion: number;
  termsAcceptedAt: string;
  createdByEmployeeId: string;
};

export type ProductDraftCreateInput = {
  code: string;
  title: string;
  termYears: number;
  listAmountFen: number;
  amountFen: number;
  serviceScope: string[];
  termsContent: string;
  employeeId: string;
};

export type ProductDraftUpdateInput = Partial<ProductDraftCreateInput> & {
  productId: string;
  expectedVersion: number;
  employeeId: string;
};

export type ProductPublishInput = {
  productId: string;
  expectedVersion: number;
  title: string;
  termYears: number;
  listAmountFen: number;
  amountFen: number;
  serviceScope: string[];
  termsVersion: number;
  termsContent: string;
  employeeId: string;
};

export type NotificationCreateInput = {
  notifyId: string;
  tenantId: string | null;
  orderId: string | null;
  outTradeNo: string | null;
  transactionId: string | null;
  payload: Record<string, unknown>;
};

export type ConfirmPaymentInput = {
  orderId: string;
  transactionId: string;
  paidAmountFen: number;
  paidAt: string | null;
  notificationId: string | null;
  metadata: Record<string, unknown>;
};

export type RefundRequestCreateInput = {
  tenantId: string;
  orderId: string;
  idempotencyKey: string;
  reason: string;
  createdByEmployeeId: string;
};

export const TENANT_PRODUCT_SELECT = [
  "id",
  "code",
  "status",
  "published_version_id",
  "published_version:platform_service_product_versions!platform_service_products_published_version_fkey(id,version,title,term_years,list_amount_fen,amount_fen,service_scope,terms_version,terms_content)",
].join(",");

export const PLATFORM_PRODUCT_SELECT = [
  "id",
  "code",
  "title",
  "term_years",
  "list_amount_fen",
  "amount_fen",
  "service_scope",
  "terms_version",
  "terms_content",
  "status",
  "version",
  "published_version_id",
  "sort_order",
  "created_at",
  "updated_at",
  "published_version:platform_service_product_versions!platform_service_products_published_version_fkey(id,version,title,term_years,list_amount_fen,amount_fen,service_scope,terms_version,terms_content)",
].join(",");

export const TENANT_ORDER_SELECT = [
  "id",
  "order_no",
  "out_trade_no",
  "product_code",
  "term_years",
  "amount_fen",
  "payment_status",
  "service_status",
  "prepay_id",
  "payment_expires_at",
  "paid_at",
  "closed_at",
  "terms_version",
  "version",
  "created_at",
  "updated_at",
].join(",");

export function normalizePagination(page: number, pageSize: number) {
  const normalizedPage = Math.max(1, Math.floor(page || 1));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(pageSize || 20)));
  const from = (normalizedPage - 1) * normalizedPageSize;
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    from,
    to: from + normalizedPageSize - 1,
  };
}

export function pageResult<T>(
  data: unknown,
  count: number | null | undefined,
  pagination: ReturnType<typeof normalizePagination>,
) {
  const total = count ?? 0;
  return {
    list: (Array.isArray(data) ? data : []) as T[],
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
    },
  };
}

export function buildIlikePattern(value: string) {
  return `%${value.trim()}%`;
}
