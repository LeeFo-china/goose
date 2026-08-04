import { Errors } from "@/errors/error-factory";
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

type ShippingReportClient = {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<QueryResult>;
};

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
