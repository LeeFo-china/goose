import { Errors } from "@/errors/error-factory";
import {
  type BrandingAddonNotificationCreateInput,
  type BrandingAddonCallbackOrderRecord,
  type BrandingAddonConfirmedOrderRecord,
  type BrandingAddonOrderCreateInput,
  type BrandingAddonPaymentOrderRecord,
  type BrandingAddonWechatNotificationRecord,
  CALLBACK_ORDER_COLUMNS,
  NOTIFICATION_COLUMNS,
  PAYMENT_ORDER_COLUMNS,
  PLATFORM_ORDER_DETAIL_COLUMNS,
  PLATFORM_ORDER_LIST_COLUMNS,
  type PlatformBrandingAddonOrderDetailRecord,
  type PlatformBrandingAddonOrderListRecord,
  TENANT_ORDER_DETAIL_COLUMNS,
  TENANT_ORDER_LIST_COLUMNS,
  type TenantBrandingAddonOrderDetailRecord,
  type TenantBrandingAddonOrderListRecord,
} from "@/repositories/branding-addon-order-records";
import {
  boundedBrandingAddonNotificationError,
  hasSameBrandingAddonNotificationIdentity,
  mapBrandingAddonConfirmationError,
  mapBrandingAddonOrderConflict,
} from "@/repositories/branding-addon-order-repository-support";
import { markBrandingAddonOrderFailedBeforePrepay, type MarkBrandingAddonOrderFailedBeforePrepayInput } from "@/repositories/branding-addon-order-failure-transition";
import { isPostgresUniqueViolation } from "@/repositories/repository-errors";
import type { BrandingAddonOrderStatus } from "@/services/branding-addon-contracts";
import { SupabaseDB } from "@/utils/supabase";
export type {
  BrandingAddonNotificationCreateInput,
  BrandingAddonCallbackOrderRecord,
  BrandingAddonConfirmedOrderRecord,
  BrandingAddonOrderCreateInput,
  BrandingAddonOrderRecord,
  BrandingAddonPaymentOrderRecord,
  BrandingAddonWechatNotificationRecord,
  PlatformBrandingAddonOrderDetailRecord,
  PlatformBrandingAddonOrderListRecord,
  TenantBrandingAddonOrderDetailRecord,
  TenantBrandingAddonOrderListRecord,
} from "@/repositories/branding-addon-order-records";

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type AddonQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact" }): AddonQuery;
  insert(record: Record<string, unknown>): AddonQuery;
  update(patch: Record<string, unknown>): AddonQuery;
  eq(column: string, value: unknown): AddonQuery;
  is(column: string, value: unknown): AddonQuery;
  gt(column: string, value: unknown): AddonQuery;
  gte(column: string, value: unknown): AddonQuery;
  lte(column: string, value: unknown): AddonQuery;
  ilike(column: string, pattern: string): AddonQuery;
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
  order: BrandingAddonConfirmedOrderRecord | null;
  entitlement: Record<string, unknown> | null;
  event: Record<string, unknown> | null;
  source_type: "purchase";
};

export class BrandingAddonOrderRepository {
  constructor(
    private readonly clientProvider: () => AddonClient = () =>
      SupabaseDB.getAdminClient() as unknown as AddonClient,
  ) {}

  async findByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    return this.findInternalOrder([
      ["tenant_id", input.tenantId],
      ["idempotency_key", input.idempotencyKey],
    ]);
  }

  async findPendingByTenantProduct(input: {
    tenantId: string;
    productCode: string;
  }) {
    return this.findInternalOrder([
      ["tenant_id", input.tenantId],
      ["product_code", input.productCode],
      ["status", "pending"],
    ]);
  }

  async createOrder(input: BrandingAddonOrderCreateInput) {
    const { data, error } = await this.orders()
      .insert(input)
      .select(PAYMENT_ORDER_COLUMNS)
      .single();
    if (error) {
      const conflict = mapBrandingAddonOrderConflict(error);
      if (conflict) throw conflict;
      throw Errors.dbError("创建年度品牌权益订单失败");
    }
    return data as BrandingAddonPaymentOrderRecord;
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
      .select(PAYMENT_ORDER_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("保存年度品牌权益预支付单失败");
    return (data as BrandingAddonPaymentOrderRecord | null) ?? null;
  }

  async markFailedBeforePrepay(
    input: MarkBrandingAddonOrderFailedBeforePrepayInput,
  ) {
    return markBrandingAddonOrderFailedBeforePrepay(this.orders(), input);
  }

  async findTenantOrderById(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.orders()
      .select(TENANT_ORDER_DETAIL_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询年度品牌权益订单失败");
    return (data as TenantBrandingAddonOrderDetailRecord | null) ?? null;
  }

  async findInternalTenantOrderById(input: {
    tenantId: string;
    orderId: string;
  }) {
    return this.findInternalOrder([
      ["tenant_id", input.tenantId],
      ["id", input.orderId],
    ]);
  }

  async listTenantOrders(input: {
    tenantId: string;
    page?: number;
    pageSize?: number;
    status?: BrandingAddonOrderStatus;
    keyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let query = this.orders()
      .select(TENANT_ORDER_LIST_COLUMNS, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.status) query = query.eq("status", input.status);
    if (input.keyword) {
      query = query.ilike("order_no", buildIlikePattern(input.keyword));
    }
    const { data, error, count } = await query;
    if (error) throw Errors.dbError("查询年度品牌权益订单列表失败");
    return pageResult<TenantBrandingAddonOrderListRecord>(
      data,
      count,
      pagination,
    );
  }

  async listPlatformOrders(input: {
    page?: number;
    pageSize?: number;
    tenantId?: string;
    status?: BrandingAddonOrderStatus;
    keyword?: string;
    createdFrom?: string;
    createdTo?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let query = this.orders()
      .select(
        `${PLATFORM_ORDER_LIST_COLUMNS},tenant:tenants!tenant_addon_orders_tenant_id_fkey(id,name,slug)`,
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.tenantId) query = query.eq("tenant_id", input.tenantId);
    if (input.status) query = query.eq("status", input.status);
    if (input.createdFrom) query = query.gte("created_at", input.createdFrom);
    if (input.createdTo) query = query.lte("created_at", input.createdTo);
    if (input.keyword) {
      const pattern = quotePostgrestValue(buildIlikePattern(input.keyword));
      query = query.or(
        `order_no.ilike.${pattern},out_trade_no.ilike.${pattern},transaction_id.ilike.${pattern}`,
      );
    }
    const { data, error, count } = await query;
    if (error) throw Errors.dbError("查询平台品牌权益订单失败");
    return pageResult<PlatformBrandingAddonOrderListRecord>(
      data,
      count,
      pagination,
    );
  }

  async findPlatformOrderById(orderId: string) {
    const { data, error } = await this.orders()
      .select(
        `${PLATFORM_ORDER_DETAIL_COLUMNS},tenant:tenants!tenant_addon_orders_tenant_id_fkey(id,name,slug)`,
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台品牌权益订单失败");
    return (data as PlatformBrandingAddonOrderDetailRecord | null) ?? null;
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
    if (error) throw Errors.dbError("查询品牌权益微信通知失败");
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
        if (
          existing &&
          hasSameBrandingAddonNotificationIdentity(existing, input)
        ) {
          return existing;
        }
        if (existing) {
          throw Errors.business(
            409,
            "微信支付通知 ID 与既有订单不一致",
            "BRANDING_ADDON_NOTIFICATION_ID_COLLISION",
          );
        }
      }
      throw Errors.dbError("写入品牌权益微信通知失败");
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
    const { data, error } = await this.notifications()
      .update({
        processed: false,
        processed_at: null,
        error_message: boundedBrandingAddonNotificationError(
          input.errorMessage,
        ),
      })
      .eq("id", input.notificationId)
      .eq("processed", false)
      .select(NOTIFICATION_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("记录品牌权益微信通知失败原因失败");
    return (data as BrandingAddonWechatNotificationRecord | null) ?? null;
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
      const mapped = mapBrandingAddonConfirmationError(error);
      if (mapped) throw mapped;
      throw Errors.dbError("确认年度品牌权益支付失败");
    }
    return data as BrandingConfirmPurchaseResult;
  }

  private orders() {
    return this.clientProvider().from("tenant_addon_orders");
  }

  private notifications() {
    return this.clientProvider().from("tenant_addon_wechat_notifications");
  }

  private async findInternalOrder(filters: Array<[string, unknown]>) {
    let query = this.orders().select(PAYMENT_ORDER_COLUMNS);
    for (const [column, value] of filters) query = query.eq(column, value);
    const { data, error } = await query.maybeSingle();
    if (error) throw Errors.dbError("查询年度品牌权益订单失败");
    return (data as BrandingAddonPaymentOrderRecord | null) ?? null;
  }

  private async findUniquePaymentIdentifier(
    column: "out_trade_no" | "transaction_id",
    value: string,
    code: string,
    message: string,
  ) {
    const { data, error } = await this.orders()
      .select(CALLBACK_ORDER_COLUMNS)
      .eq(column, value)
      .limit(2);
    if (error) throw Errors.dbError("查询年度品牌权益支付订单失败");
    const rows = (data ?? []) as BrandingAddonCallbackOrderRecord[];
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
    if (error) throw Errors.dbError(message);
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

function buildIlikePattern(value: string) {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export const brandingAddonOrderRepository =
  new BrandingAddonOrderRepository();
