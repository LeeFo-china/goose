import { Errors } from "../errors/error-factory";
import { SupabaseDB } from "../utils/supabase";
import {
  buildIlikePattern,
  type ConfirmPaymentInput,
  type CreatePendingOrderInput,
  type NotificationCreateInput,
  normalizePagination,
  type OrderRecord,
  pageResult,
  PLATFORM_PRODUCT_SELECT,
  type PlatformProductRecord,
  type ProductDraftCreateInput,
  type ProductDraftUpdateInput,
  type ProductPublishInput,
  REFUND_REQUEST_SELECT,
  type ProductRecord,
  type ProductVersionRecord,
  type RefundRequestRecord,
  type RefundRequestCreateInput,
  TENANT_ORDER_SELECT,
  TENANT_PRODUCT_SELECT,
} from "./platform-service-order-records";

type QueryResult = { data: unknown; error: unknown; count?: number | null };

type ServiceQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact" }): ServiceQuery;
  insert(record: Record<string, unknown>): ServiceQuery;
  update(patch: Record<string, unknown>): ServiceQuery;
  eq(column: string, value: unknown): ServiceQuery;
  ilike(column: string, pattern: string): ServiceQuery;
  or(filter: string): ServiceQuery;
  order(column: string, options: { ascending: boolean }): ServiceQuery;
  range(from: number, to: number): ServiceQuery;
  limit(value: number): ServiceQuery;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
};

type ServiceClient = {
  from(
    table:
      | "platform_service_products"
      | "platform_service_product_versions"
      | "tenant_service_orders"
      | "tenant_service_work_orders"
      | "tenant_service_wechat_notifications"
      | "tenant_service_refund_requests",
  ): ServiceQuery;
  rpc(
    name: "platform_service_create_pending_order" | "platform_service_confirm_payment",
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

export class PlatformServiceOrderRepository {
  constructor(
    private readonly clientProvider: () => ServiceClient = () =>
      SupabaseDB.getAdminClient() as unknown as ServiceClient,
  ) {}

  async listEnabledProducts(input: { page: number; pageSize: number }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    const { data, error, count } = await this.products()
      .select(TENANT_PRODUCT_SELECT, { count: "exact" })
      .eq("status", "enabled")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (error) throw Errors.dbError("查询平台技术服务商品失败", error);
    return pageResult<ProductRecord>(data, count, pagination);
  }

  async findEnabledProductByCode(code: string): Promise<ProductRecord | null> {
    const { data, error } = await this.products()
      .select(TENANT_PRODUCT_SELECT)
      .eq("code", code)
      .eq("status", "enabled")
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务商品失败", error);
    return (data as ProductRecord | null) ?? null;
  }

  async listPlatformProducts(input: { page: number; pageSize: number }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    const { data, error, count } = await this.products()
      .select(PLATFORM_PRODUCT_SELECT, { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (error) throw Errors.dbError("查询平台技术服务商品失败", error);
    return pageResult<PlatformProductRecord>(data, count, pagination);
  }

  async findPlatformProductById(productId: string) {
    const { data, error } = await this.products()
      .select(PLATFORM_PRODUCT_SELECT)
      .eq("id", productId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务商品失败", error);
    return (data as PlatformProductRecord | null) ?? null;
  }

  async createProductDraft(input: ProductDraftCreateInput) {
    const { data, error } = await this.products()
      .insert({
        code: input.code,
        title: input.title,
        term_years: input.termYears,
        list_amount_fen: input.listAmountFen,
        amount_fen: input.amountFen,
        service_scope: input.serviceScope,
        terms_content: input.termsContent,
        created_by_employee_id: input.employeeId,
        updated_by_employee_id: input.employeeId,
      })
      .select(PLATFORM_PRODUCT_SELECT)
      .single();
    if (error) throw Errors.dbError("创建平台技术服务商品失败", error);
    return data as PlatformProductRecord;
  }

  async updateProductDraft(input: ProductDraftUpdateInput) {
    const patch: Record<string, unknown> = {
      updated_by_employee_id: input.employeeId,
    };
    if (input.code !== undefined) patch.code = input.code;
    if (input.title !== undefined) patch.title = input.title;
    if (input.termYears !== undefined) patch.term_years = input.termYears;
    if (input.listAmountFen !== undefined) {
      patch.list_amount_fen = input.listAmountFen;
    }
    if (input.amountFen !== undefined) patch.amount_fen = input.amountFen;
    if (input.serviceScope !== undefined) patch.service_scope = input.serviceScope;
    if (input.termsContent !== undefined) patch.terms_content = input.termsContent;

    const { data, error } = await this.products()
      .update(patch)
      .eq("id", input.productId)
      .eq("version", input.expectedVersion)
      .select(PLATFORM_PRODUCT_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新平台技术服务商品失败", error);
    return (data as PlatformProductRecord | null) ?? null;
  }

  async publishProductVersion(input: ProductPublishInput) {
    const nextVersion = input.expectedVersion + 1;
    const { data: version, error: versionError } = await this.versions()
      .insert({
        product_id: input.productId,
        version: nextVersion,
        title: input.title,
        term_years: input.termYears,
        list_amount_fen: input.listAmountFen,
        amount_fen: input.amountFen,
        service_scope: input.serviceScope,
        terms_version: input.termsVersion,
        terms_content: input.termsContent,
        published_by_employee_id: input.employeeId,
      })
      .select("id,product_id,version,title,term_years,list_amount_fen,amount_fen,service_scope,terms_version,terms_content")
      .single();
    if (versionError) {
      throw Errors.dbError("发布平台技术服务商品版本失败", versionError);
    }
    const versionRecord = version as ProductVersionRecord;
    const { error: productError } = await this.products()
      .update({
        published_version_id: versionRecord.id,
        version: nextVersion,
        updated_by_employee_id: input.employeeId,
      })
      .eq("id", input.productId)
      .eq("version", input.expectedVersion)
      .select(PLATFORM_PRODUCT_SELECT)
      .maybeSingle();
    if (productError) {
      throw Errors.dbError("更新平台技术服务商品发布指针失败", productError);
    }
    return versionRecord;
  }

  async archiveProduct(input: {
    productId: string;
    expectedVersion: number;
    employeeId: string;
  }) {
    const { data, error } = await this.products()
      .update({
        status: "archived",
        updated_by_employee_id: input.employeeId,
      })
      .eq("id", input.productId)
      .eq("version", input.expectedVersion)
      .select(PLATFORM_PRODUCT_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("归档平台技术服务商品失败", error);
    return (data as PlatformProductRecord | null) ?? null;
  }

  async listOrders(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    paymentStatus?: string;
    serviceStatus?: string;
    keyword?: string;
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let request = this.orders()
      .select(TENANT_ORDER_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);
    if (input.paymentStatus) {
      request = request.eq("payment_status", input.paymentStatus);
    }
    if (input.serviceStatus) {
      request = request.eq("service_status", input.serviceStatus);
    }
    if (input.keyword) {
      request = request.ilike("order_no", buildIlikePattern(input.keyword));
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台技术服务订单失败", error);
    return pageResult<OrderRecord>(data, count, pagination);
  }

  async findOrderByTenantAndId(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.orders()
      .select(TENANT_ORDER_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务订单失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async findOrderByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.orders()
      .select(TENANT_ORDER_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务订单失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async findOrderByOutTradeNo(outTradeNo: string) {
    const { data, error } = await this.orders()
      .select([
        TENANT_ORDER_SELECT,
        "tenant_id",
        "payment_config_id",
        "payment_config_guard_version",
        "payer_openid",
      ].join(","))
      .eq("out_trade_no", outTradeNo)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务支付订单失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async createPendingOrder(input: CreatePendingOrderInput) {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_create_pending_order",
      {
        p_tenant_id: input.tenantId,
        p_product_id: input.productId,
        p_product_version_id: input.productVersionId,
        p_order_no: input.orderNo,
        p_out_trade_no: input.outTradeNo,
        p_idempotency_key: input.idempotencyKey,
        p_product_code: input.productCode,
        p_pricing_version: input.pricingVersion,
        p_product_snapshot: input.productSnapshot,
        p_term_years: input.termYears,
        p_amount_fen: input.amountFen,
        p_payment_config_id: input.paymentConfigId,
        p_payment_config_guard_version: input.paymentConfigGuardVersion,
        p_payer_openid: input.payerOpenid,
        p_payment_expires_at: input.paymentExpiresAt,
        p_terms_version: input.termsVersion,
        p_terms_accepted_at: input.termsAcceptedAt,
        p_created_by_employee_id: input.createdByEmployeeId,
      },
    );
    if (error) throw Errors.dbError("创建平台技术服务订单失败", error);
    return data as OrderRecord;
  }

  async markPrepayCreated(input: { orderId: string; prepayId: string }) {
    const { data, error } = await this.orders()
      .update({ prepay_id: input.prepayId })
      .eq("id", input.orderId)
      .eq("payment_status", "pending")
      .select(TENANT_ORDER_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("保存平台技术服务预支付单失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async hasPendingOrdersForPaymentConfig(paymentConfigId: string) {
    const { data, error } = await this.orders()
      .select("id")
      .eq("payment_config_id", paymentConfigId)
      .eq("payment_status", "pending")
      .limit(1);
    if (error) throw Errors.dbError("检查平台技术服务待支付订单失败", error);
    return Array.isArray(data) && data.length > 0;
  }

  async createWechatNotification(input: NotificationCreateInput) {
    const { data, error } = await this.notifications()
      .insert({
        notify_id: input.notifyId,
        tenant_id: input.tenantId,
        order_id: input.orderId,
        out_trade_no: input.outTradeNo,
        transaction_id: input.transactionId,
        payload: input.payload,
      })
      .select("id,notify_id,tenant_id,order_id,out_trade_no,transaction_id,payload,processed,processed_at,error_message,created_at,updated_at")
      .single();
    if (error) throw Errors.dbError("写入平台技术服务微信通知失败", error);
    return data as Record<string, unknown>;
  }

  async findWechatNotificationByNotifyId(notifyId: string) {
    const { data, error } = await this.notifications()
      .select("id,notify_id,tenant_id,order_id,out_trade_no,transaction_id,payload,processed,processed_at,error_message,created_at,updated_at")
      .eq("notify_id", notifyId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务微信通知失败", error);
    return (data as Record<string, unknown> | null) ?? null;
  }

  async markWechatNotificationProcessed(id: string) {
    const { error } = await this.notifications()
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw Errors.dbError("标记平台技术服务微信通知失败", error);
  }

  async markWechatNotificationFailed(input: { id: string; errorMessage: string }) {
    const { error } = await this.notifications()
      .update({ error_message: input.errorMessage.slice(0, 1000) })
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    if (error) throw Errors.dbError("记录平台技术服务微信通知失败原因失败", error);
  }

  async confirmPayment(input: ConfirmPaymentInput) {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_confirm_payment",
      {
        p_order_id: input.orderId,
        p_transaction_id: input.transactionId,
        p_paid_amount_fen: input.paidAmountFen,
        p_paid_at: input.paidAt,
        p_notification_id: input.notificationId,
        p_metadata: input.metadata,
      },
    );
    if (error) throw Errors.dbError("确认平台技术服务支付失败", error);
    return data as Record<string, unknown>;
  }

  async createRefundRequest(input: RefundRequestCreateInput) {
    const { data, error } = await this.refundRequests()
      .insert({
        tenant_id: input.tenantId,
        service_order_id: input.orderId,
        idempotency_key: input.idempotencyKey,
        reason: input.reason,
        created_by_employee_id: input.createdByEmployeeId,
      })
      .select(REFUND_REQUEST_SELECT)
      .single();
    if (error) throw Errors.dbError("创建平台技术服务退款申请失败", error);
    return data as RefundRequestRecord;
  }

  async findRefundRequestByIdempotencyKey(input: {
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.refundRequests()
      .select(REFUND_REQUEST_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("service_order_id", input.orderId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台技术服务退款申请失败", error);
    return (data as RefundRequestRecord | null) ?? null;
  }

  async markOrderRefundReviewing(input: {
    tenantId: string;
    orderId: string;
    expectedVersion: number;
  }) {
    const { data, error } = await this.orders()
      .update({
        payment_status: "refund_reviewing",
        version: input.expectedVersion + 1,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .eq("version", input.expectedVersion)
      .eq("payment_status", "paid")
      .select(TENANT_ORDER_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新平台技术服务订单退款状态失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  private products() {
    return this.clientProvider().from("platform_service_products");
  }

  private versions() {
    return this.clientProvider().from("platform_service_product_versions");
  }

  private orders() {
    return this.clientProvider().from("tenant_service_orders");
  }

  private notifications() {
    return this.clientProvider().from("tenant_service_wechat_notifications");
  }

  private refundRequests() {
    return this.clientProvider().from("tenant_service_refund_requests");
  }
}

export const platformServiceOrderRepository =
  new PlatformServiceOrderRepository();
