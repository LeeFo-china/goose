import { Errors } from "@/errors/error-factory";
import { isPostgresUniqueViolation } from "@/repositories/repository-errors";
import type { BrandingAddonOrderStatus } from "@/services/branding-addon-contracts";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};
type AddonQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact" }): AddonQuery;
  insert(record: Record<string, unknown>): AddonQuery;
  update(patch: Record<string, unknown>): AddonQuery;
  eq(column: string, value: unknown): AddonQuery;
  gt(column: string, value: unknown): AddonQuery;
  or(filter: string): AddonQuery;
  order(column: string, options: { ascending: boolean }): AddonQuery;
  range(from: number, to: number): AddonQuery;
  limit(value: number): AddonQuery;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};

type AddonClient = {
  from(
    table: "tenant_addon_orders" | "tenant_addon_wechat_notifications",
  ): AddonQuery;
  rpc(
    name: "branding_confirm_addon_purchase",
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

export type BrandingAddonOrderRecord = {
  id: string;
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  idempotency_key: string;
  product_id: string;
  product_code: "custom_support_branding_annual";
  entitlement_code: "custom_support_branding";
  product_name: string;
  amount_fen: number;
  term_years: 1;
  purchase_notes: string;
  refund_policy: string;
  status: BrandingAddonOrderStatus;
  channel: "wechat_pay";
  payer_openid: string;
  payment_config_id: string;
  expected_guard_version: number;
  payment_mchid: string;
  payment_appid: string;
  prepay_id: string | null;
  payment_expires_at: string;
  transaction_id: string | null;
  paid_amount_fen: number | null;
  paid_at: string | null;
  closed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  entitlement_event_id: string | null;
  created_by: string;
  metadata: Record<string, unknown>;
  close_claim_token: string | null;
  close_claim_expires_at: string | null;
  close_attempt_count: number;
  close_last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandingAddonWechatNotificationRecord = {
  id: string;
  notify_id: string;
  tenant_id: string;
  order_id: string;
  event_type: string;
  resource_type: string;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformBrandingAddonOrderRecord = BrandingAddonOrderRecord & {
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type BrandingAddonOrderCreateInput = Omit<
  BrandingAddonOrderRecord,
  | "id"
  | "prepay_id"
  | "transaction_id"
  | "paid_amount_fen"
  | "paid_at"
  | "closed_at"
  | "failure_code"
  | "failure_message"
  | "entitlement_event_id"
  | "close_claim_token"
  | "close_claim_expires_at"
  | "close_attempt_count"
  | "close_last_error"
  | "created_at"
  | "updated_at"
>;

export type BrandingAddonNotificationCreateInput = Omit<
  BrandingAddonWechatNotificationRecord,
  "id" | "processed_at" | "error_message" | "created_at" | "updated_at"
>;

export type BrandingConfirmPurchaseInput = {
  orderId: string;
  outTradeNo: string;
  transactionId: string;
  paidAmountFen: number;
  paidAt: string;
  mchid: string;
  appid: string;
  notificationId: string | null;
  metadata: Record<string, unknown>;
};

export type BrandingConfirmPurchaseResult = {
  idempotent: boolean;
  order: BrandingAddonOrderRecord | null;
  entitlement: Record<string, unknown> | null;
  event: Record<string, unknown> | null;
  source_type: "purchase";
};

const ORDER_COLUMNS = [
  "id,tenant_id,order_no,out_trade_no,idempotency_key,product_id,product_code",
  "entitlement_code,product_name,amount_fen,term_years,purchase_notes,refund_policy",
  "status,channel,payer_openid,payment_config_id,expected_guard_version",
  "payment_mchid,payment_appid,prepay_id,payment_expires_at,transaction_id",
  "paid_amount_fen,paid_at,closed_at,failure_code,failure_message",
  "entitlement_event_id,created_by,metadata,close_claim_token",
  "close_claim_expires_at,close_attempt_count,close_last_error,created_at,updated_at",
].join(",");

const NOTIFICATION_COLUMNS =
  "id,notify_id,tenant_id,order_id,event_type,resource_type,raw_payload," +
  "signature_valid,processed,processed_at,error_message,created_at,updated_at";

export class BrandingAddonOrderRepository {
  constructor(
    private readonly clientProvider: () => AddonClient = () =>
      SupabaseDB.getAdminClient() as unknown as AddonClient,
  ) {}

  async findByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    return this.findTenantOrder([
      ["tenant_id", input.tenantId],
      ["idempotency_key", input.idempotencyKey],
    ]);
  }

  async findPendingByTenantProduct(input: {
    tenantId: string;
    productCode: string;
  }) {
    return this.findTenantOrder([
      ["tenant_id", input.tenantId],
      ["product_code", input.productCode],
      ["status", "pending"],
    ]);
  }

  async createOrder(input: BrandingAddonOrderCreateInput) {
    const { data, error } = await this.orders()
      .insert(input)
      .select(ORDER_COLUMNS)
      .single();
    if (error) {
      const conflict = orderConflict(error);
      if (conflict) throw conflict;
      throw Errors.dbError("创建年度品牌权益订单失败", error);
    }
    return data as BrandingAddonOrderRecord;
  }

  async markPrepayCreated(input: {
    tenantId: string;
    orderId: string;
    prepayId: string;
    now: Date;
  }) {
    const { data, error } = await this.orders()
      .update({ prepay_id: input.prepayId })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .eq("status", "pending")
      .gt("payment_expires_at", input.now.toISOString())
      .select(ORDER_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("保存年度品牌权益预支付单失败", error);
    return (data as BrandingAddonOrderRecord | null) ?? null;
  }

  async findTenantOrderById(input: { tenantId: string; orderId: string }) {
    return this.findTenantOrder([
      ["tenant_id", input.tenantId],
      ["id", input.orderId],
    ]);
  }

  async listTenantOrders(input: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    status?: BrandingAddonOrderStatus;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let query = this.orders()
      .select(ORDER_COLUMNS, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.status) query = query.eq("status", input.status);
    const { data, error, count } = await query;
    if (error) throw Errors.dbError("查询年度品牌权益订单列表失败", error);
    return pageResult<BrandingAddonOrderRecord>(data, count, pagination);
  }

  async listPlatformOrders(input: {
    page?: number;
    pageSize?: number;
    tenantId?: string;
    status?: BrandingAddonOrderStatus;
    keyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let query = this.orders()
      .select(
        `${ORDER_COLUMNS},tenant:tenants!tenant_addon_orders_tenant_id_fkey(id,name,slug)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.tenantId) query = query.eq("tenant_id", input.tenantId);
    if (input.status) query = query.eq("status", input.status);
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      query = query.or(
        `order_no.ilike.%${escaped}%,out_trade_no.ilike.%${escaped}%,transaction_id.ilike.%${escaped}%`,
      );
    }
    const { data, error, count } = await query;
    if (error) throw Errors.dbError("查询平台品牌权益订单失败", error);
    return pageResult<PlatformBrandingAddonOrderRecord>(
      data,
      count,
      pagination,
    );
  }

  async findPlatformOrderById(orderId: string) {
    const { data, error } = await this.orders()
      .select(
        `${ORDER_COLUMNS},tenant:tenants!tenant_addon_orders_tenant_id_fkey(id,name,slug)`,
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台品牌权益订单失败", error);
  return (data as PlatformBrandingAddonOrderRecord | null) ?? null;
  }
  async findByOutTradeNo(outTradeNo: string) {
    return this.findUniquePaymentIdentifier(
      "out_trade_no",
      outTradeNo,
      "BRANDING_ADDON_OUT_TRADE_NO_DUPLICATED",
      "商户订单号匹配到多个年度品牌权益订单",
    );
  }

  async findByTransactionId(transactionId: string) {
    return this.findUniquePaymentIdentifier(
      "transaction_id",
      transactionId,
      "BRANDING_ADDON_TRANSACTION_ID_DUPLICATED",
      "微信支付订单号匹配到多个年度品牌权益订单",
    );
  }

  async findNotificationByNotifyId(notifyId: string) {
    const { data, error } = await this.notifications()
      .select(NOTIFICATION_COLUMNS)
      .eq("notify_id", notifyId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益微信通知失败", error);
    return (data as BrandingAddonWechatNotificationRecord | null) ?? null;
  }

  async createNotification(input: BrandingAddonNotificationCreateInput) {
    const { data, error } = await this.notifications()
      .insert(input)
      .select(NOTIFICATION_COLUMNS)
      .single();
    if (error) {
      if (isPostgresUniqueViolation(error)) {
        const existing = await this.findNotificationByNotifyId(input.notify_id);
        if (existing) return existing;
      }
      throw Errors.dbError("写入品牌权益微信通知失败", error);
    }
    return data as BrandingAddonWechatNotificationRecord;
  }

  async markNotificationProcessed(input: {
    notificationId: string;
    processedAt?: Date;
  }) {
    return this.updateNotification(input.notificationId, {
      processed: true,
      processed_at: (input.processedAt ?? new Date()).toISOString(),
      error_message: null,
    }, "标记品牌权益微信通知已处理失败");
  }

  async markNotificationFailed(input: {
    notificationId: string;
    errorMessage: string;
  }) {
    return this.updateNotification(input.notificationId, {
      processed: false,
      processed_at: null,
      error_message: boundedOptionalText(input.errorMessage),
    }, "记录品牌权益微信通知失败原因失败");
  }

  async confirmPurchase(input: BrandingConfirmPurchaseInput) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_confirm_addon_purchase",
      {
        p_order_id: input.orderId,
        p_out_trade_no: input.outTradeNo,
        p_transaction_id: input.transactionId,
        p_paid_amount_fen: input.paidAmountFen,
        p_paid_at: input.paidAt,
        p_mchid: input.mchid,
        p_appid: input.appid,
        p_notification_id: input.notificationId,
        p_metadata: input.metadata,
      },
    );
    if (error) {
      const mapped = confirmationError(error);
      if (mapped) throw mapped;
      throw Errors.dbError("确认年度品牌权益支付失败", error);
    }
    return data as BrandingConfirmPurchaseResult;
  }

  private orders() {
    return this.clientProvider().from("tenant_addon_orders");
  }

  private notifications() {
    return this.clientProvider().from("tenant_addon_wechat_notifications");
  }

  private async findTenantOrder(filters: Array<[string, unknown]>) {
    let query = this.orders().select(ORDER_COLUMNS);
    for (const [column, value] of filters) query = query.eq(column, value);
    const { data, error } = await query.maybeSingle();
    if (error) throw Errors.dbError("查询年度品牌权益订单失败", error);
    return (data as BrandingAddonOrderRecord | null) ?? null;
  }

  private async findUniquePaymentIdentifier(
    column: "out_trade_no" | "transaction_id",
    value: string,
    code: string,
    message: string,
  ) {
    const { data, error } = await this.orders()
      .select(ORDER_COLUMNS)
      .eq(column, value)
      .limit(2);
    if (error) throw Errors.dbError("查询年度品牌权益支付订单失败", error);
    const rows = (data ?? []) as BrandingAddonOrderRecord[];
    if (rows.length > 1) throw Errors.business(409, message, code);
    return rows[0] ?? null;
  }

  private async updateNotification(
    notificationId: string,
    patch: Record<string, unknown>,
    message: string,
  ) {
    const { data, error } = await this.notifications()
      .update(patch)
      .eq("id", notificationId)
      .select(NOTIFICATION_COLUMNS)
      .single();
    if (error) throw Errors.dbError(message, error);
    return data as BrandingAddonWechatNotificationRecord;
  }
}

type Pagination = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

function normalizePagination(page = 1, pageSize = 20): Pagination {
  const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const normalizedSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.min(100, Math.floor(pageSize)))
    : 20;
  const from = (normalizedPage - 1) * normalizedSize;
  return {
    page: normalizedPage,
    pageSize: normalizedSize,
    from,
    to: from + normalizedSize - 1,
  };
}

function pageResult<T>(data: unknown, count: number | null | undefined, page: Pagination) {
  const total = count ?? 0;
  return {
    list: (data ?? []) as T[],
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      total,
      totalPages: total ? Math.ceil(total / page.pageSize) : 0,
    },
  };
}

function orderConflict(error: unknown) {
  if (!isPostgresUniqueViolation(error)) return null;
  if (containsToken(error, "tenant_addon_orders_tenant_idempotency_key")) {
    return Errors.business(409, "幂等键已被使用", "BRANDING_ADDON_IDEMPOTENCY_KEY_CONFLICT");
  }
  if (containsToken(error, "tenant_addon_orders_pending_product_unique_idx")) {
    return Errors.business(409, "已存在待支付订单", "BRANDING_ADDON_PENDING_ORDER_EXISTS");
  }
  if (containsToken(error, "tenant_addon_orders_out_trade_no_unique_idx")) {
    return Errors.business(409, "商户订单号冲突", "BRANDING_ADDON_OUT_TRADE_NO_CONFLICT");
  }
  return null;
}

const CONFIRMATION_ERRORS = {
  BRANDING_ADDON_CONFIRM_INPUT_INVALID: [400, "支付确认参数不合法"],
  BRANDING_ADDON_ORDER_NOT_FOUND: [404, "年度品牌权益订单不存在"],
  BRANDING_ADDON_OUT_TRADE_NO_MISMATCH: [409, "商户订单号不匹配"],
  BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH: [409, "支付金额不匹配"],
  BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH: [409, "支付商户上下文不匹配"],
  BRANDING_ADDON_TRANSACTION_CONFLICT: [409, "微信支付订单号冲突"],
  BRANDING_ADDON_ORDER_STATUS_INVALID: [409, "订单状态不允许确认支付"],
  BRANDING_ADDON_TENANT_NOT_FOUND: [404, "订单所属租户不存在"],
  BRANDING_ADDON_NOTIFICATION_MISMATCH: [409, "支付通知与订单不匹配"],
} as const;

function confirmationError(error: unknown) {
  for (const [code, [status, message]] of Object.entries(CONFIRMATION_ERRORS)) {
    if (containsToken(error, code)) return Errors.business(status, message, code);
  }
  return null;
}

function containsToken(error: unknown, token: string) {
  if (!error || typeof error !== "object") return false;
  return ["message", "details", "hint"].some((key) => {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" && value.includes(token);
  });
}

function boundedOptionalText(value: string) {
  const bounded = value.trim().slice(0, 500);
  return bounded.length > 0 ? bounded : null;
}

export const brandingAddonOrderRepository =
  new BrandingAddonOrderRepository();
