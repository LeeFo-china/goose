import { Errors } from "@/errors/error-factory";
import {
  TENANT_INTERNAL_ORDER_SELECT,
  type OrderRecord,
} from "@/repositories/platform-service-order-records";
import { SupabaseDB } from "@/utils/supabase";

export type OrderShippingReportStatus = "pending" | "succeeded" | "failed";

export type OrderShippingReportSource =
  | "tenant_acceptance"
  | "platform_acceptance";

export type OrderShippingReportRecord = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  source: OrderShippingReportSource;
  status: OrderShippingReportStatus;
  attempt_count: number;
  last_attempt_key: string | null;
  request_payload: Record<string, unknown>;
  wechat_errcode: number | null;
  wechat_errmsg: string | null;
  provider_request_id: string | null;
  last_attempt_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  updated_at: string;
};

type QueryResult = { data: unknown; error: unknown };

type ShippingReportQuery = PromiseLike<QueryResult> & {
  select(columns: string): ShippingReportQuery;
  eq(column: string, value: unknown): ShippingReportQuery;
  in(column: string, values: unknown[]): ShippingReportQuery;
  limit(value: number): ShippingReportQuery;
  maybeSingle(): Promise<QueryResult>;
};

type ShippingReportClient = {
  from(
    table: "tenant_service_order_shipping_reports" | "tenant_service_orders",
  ): ShippingReportQuery;
  rpc(name: string, params: Record<string, unknown>): PromiseLike<QueryResult>;
};

const SHIPPING_REPORT_SELECT = [
  "id",
  "tenant_id",
  "service_order_id",
  "source",
  "status",
  "attempt_count",
  "last_attempt_key",
  "request_payload",
  "wechat_errcode",
  "wechat_errmsg",
  "provider_request_id",
  "last_attempt_at",
  "succeeded_at",
  "created_at",
  "updated_at",
].join(",");

const MAX_SHIPPING_REPORT_LOOKUP_SIZE = 100;

type BeginAttemptInput = {
  tenantId: string;
  serviceOrderId: string;
  source: OrderShippingReportSource;
  attemptKey: string;
  requestPayload: Record<string, unknown>;
  attemptedAt: string;
};

type FinishAttemptInput = {
  reportId: string;
  attemptKey: string;
  status: Exclude<OrderShippingReportStatus, "pending">;
  wechatErrcode: number | null;
  wechatErrmsg: string | null;
  providerRequestId: string | null;
  finishedAt: string;
};

export class PlatformServiceOrderShippingReportRepository {
  constructor(
    private readonly clientProvider: () => ShippingReportClient = () =>
      SupabaseDB.getAdminClient() as unknown as ShippingReportClient,
  ) {}

  async beginOrderShippingReportAttempt(
    input: BeginAttemptInput,
  ): Promise<OrderShippingReportRecord> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_begin_order_shipping_report_attempt",
      {
        p_tenant_id: input.tenantId,
        p_service_order_id: input.serviceOrderId,
        p_source: input.source,
        p_attempt_key: input.attemptKey,
        p_request_payload: input.requestPayload,
        p_attempted_at: input.attemptedAt,
      },
    );
    if (error) throw Errors.dbError("开始平台服务发货上报失败", error);
    return data as OrderShippingReportRecord;
  }

  async listByServiceOrderIds(
    serviceOrderIds: string[],
  ): Promise<OrderShippingReportRecord[]> {
    const uniqueIds = [...new Set(serviceOrderIds.filter(Boolean))]
      .slice(0, MAX_SHIPPING_REPORT_LOOKUP_SIZE);
    if (uniqueIds.length === 0) return [];

    // 调用方订单列表 pageSize 最大为 100，这里按当前页订单 ID 一次性补齐上报状态，避免 N+1。
    const { data, error } = await this.clientProvider()
      .from("tenant_service_order_shipping_reports")
      .select(SHIPPING_REPORT_SELECT)
      .in("service_order_id", uniqueIds)
      .limit(MAX_SHIPPING_REPORT_LOOKUP_SIZE);
    if (error) throw Errors.dbError("查询平台服务发货上报记录失败", error);
    return Array.isArray(data) ? data as OrderShippingReportRecord[] : [];
  }

  async findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<OrderShippingReportRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("tenant_service_order_shipping_reports")
      .select(SHIPPING_REPORT_SELECT)
      .eq("service_order_id", serviceOrderId)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台服务发货上报记录失败", error);
    return (data as OrderShippingReportRecord | null) ?? null;
  }

  async findReportableOrderById(orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("tenant_service_orders")
      .select(TENANT_INTERNAL_ORDER_SELECT)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台服务订单发货上报信息失败", error);
    return (data as OrderRecord | null) ?? null;
  }

  async finishOrderShippingReportAttempt(
    input: FinishAttemptInput,
  ): Promise<OrderShippingReportRecord> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_finish_order_shipping_report_attempt",
      {
        p_report_id: input.reportId,
        p_attempt_key: input.attemptKey,
        p_status: input.status,
        p_wechat_errcode: input.wechatErrcode,
        p_wechat_errmsg: input.wechatErrmsg,
        p_provider_request_id: input.providerRequestId,
        p_finished_at: input.finishedAt,
      },
    );
    if (error) throw Errors.dbError("完成平台服务发货上报失败", error);
    return data as OrderShippingReportRecord;
  }
}

export const platformServiceOrderShippingReportRepository =
  new PlatformServiceOrderShippingReportRepository();
