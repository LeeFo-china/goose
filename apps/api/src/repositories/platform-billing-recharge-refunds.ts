import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type {
  TenantCreditRefundRequestRecord,
  TenantCreditRefundRequestStatus,
} from "@/repositories/billing-recharge-refunds";
import { SupabaseDB } from "@/utils/supabase/index";

type TenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
};

export type PlatformRechargeRefundRequestRecord =
  TenantCreditRefundRequestRecord & {
    order: TenantCreditOrderRecord | null;
    tenant: TenantLite | null;
  };

export type PlatformRechargeRefundRequestReviewStatus =
  | "approved"
  | "rejected";

export type PlatformRechargeRefundMirrorStatus =
  | PlatformRechargeRefundRequestReviewStatus
  | "refunding"
  | "refunded"
  | "failed";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (
    table:
      | "tenant_credit_refund_requests"
      | "tenant_credit_orders"
      | "tenants",
  ) => UntypedTable;
};

class PlatformBillingRechargeRefundRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listRequests(input: {
    page: number;
    pageSize: number;
    status?: TenantCreditRefundRequestStatus;
    keyword?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("tenant_credit_refund_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      const orderIds = await this.findMatchingOrderIds(escaped);
      const filters = [`request_no.ilike.%${escaped}%`];
      if (orderIds.length > 0) {
        filters.push(`order_id.in.(${orderIds.join(",")})`);
      }
      request = request.or(filters.join(","));
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询积分充值退款申请失败", error);
    }

    return {
      list: await this.hydrate((data ?? []) as TenantCreditRefundRequestRecord[]),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findRequestById(id: string) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值退款申请失败", error);
    }

    const list = await this.hydrate(
      data ? [data as TenantCreditRefundRequestRecord] : [],
    );
    return list[0] ?? null;
  }

  async reviewRequest(input: {
    id: string;
    fromStatuses: TenantCreditRefundRequestStatus[];
    status: PlatformRechargeRefundRequestReviewStatus;
    reviewedByEmployeeId: string;
    reviewedAt: string;
    reviewNote: string;
  }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .update({
        status: input.status,
        reviewed_by_employee_id: input.reviewedByEmployeeId,
        reviewed_at: input.reviewedAt,
        review_note: input.reviewNote,
      })
      .eq("id", input.id)
      .in("status", input.fromStatuses)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("审核积分充值退款申请失败", error);
    }

    const list = await this.hydrate(
      data ? [data as TenantCreditRefundRequestRecord] : [],
    );
    return list[0] ?? null;
  }

  async markRequestRefunding(input: {
    id: string;
    fromStatuses: TenantCreditRefundRequestStatus[];
    outRefundNo: string;
  }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .update({
        status: "refunding",
        out_refund_no: input.outRefundNo,
        failure_message: null,
      })
      .eq("id", input.id)
      .in("status", input.fromStatuses)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("执行积分充值退款申请失败", error);
    }

    const list = await this.hydrate(
      data ? [data as TenantCreditRefundRequestRecord] : [],
    );
    return list[0] ?? null;
  }

  async saveWechatRefundResult(input: {
    id: string;
    outRefundNo: string;
    wechatRefundId: string | null;
    refundAmountFen: number;
    metadata: Record<string, unknown>;
  }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .update({
        out_refund_no: input.outRefundNo,
        wechat_refund_id: input.wechatRefundId,
        refund_amount_fen: input.refundAmountFen,
        metadata: input.metadata,
        failure_message: null,
      })
      .eq("id", input.id)
      .eq("status", "refunding")
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存微信退款结果失败", error);
    }

    const list = await this.hydrate([data as TenantCreditRefundRequestRecord]);
    const request = list[0];
    if (!request) {
      throw Errors.business(
        500,
        "保存微信退款结果失败",
        "BILLING_RECHARGE_REFUND_SAVE_FAILED",
      );
    }
    return request;
  }

  async markRequestFailed(input: {
    id: string;
    failureMessage: string;
    metadata: Record<string, unknown>;
  }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .update({
        status: "failed",
        failure_message: input.failureMessage,
        metadata: input.metadata,
      })
      .eq("id", input.id)
      .eq("status", "refunding")
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("标记积分充值退款申请为失败状态失败", error);
    }

    const list = await this.hydrate(
      data ? [data as TenantCreditRefundRequestRecord] : [],
    );
    return list[0] ?? null;
  }

  async markOrderRefundStatus(input: {
    tenantId: string;
    orderId: string;
    refundStatus: PlatformRechargeRefundMirrorStatus;
  }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .update({ refund_status: input.refundStatus })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新积分充值订单退款状态失败", error);
    }

    return data as TenantCreditOrderRecord;
  }

  private async findMatchingOrderIds(keyword: string) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("id")
      .eq("channel", "wechat_pay")
      .or(
        `order_no.ilike.%${keyword}%,out_trade_no.ilike.%${keyword}%,transaction_id.ilike.%${keyword}%`,
      )
      .limit(1000);

    if (error) {
      throw Errors.dbError("查询积分充值退款申请关联订单失败", error);
    }

    return ((data ?? []) as Array<{ id: string }>).map((item) => item.id);
  }

  private async hydrate(records: TenantCreditRefundRequestRecord[]) {
    if (records.length === 0) return [];

    const [orders, tenants] = await Promise.all([
      this.findOrders(unique(records.map((item) => item.order_id))),
      this.findTenants(unique(records.map((item) => item.tenant_id))),
    ]);

    return records.map((item): PlatformRechargeRefundRequestRecord => ({
      ...item,
      order: orders.get(item.order_id) ?? null,
      tenant: tenants.get(item.tenant_id) ?? null,
    }));
  }

  private async findOrders(ids: string[]) {
    if (ids.length === 0) return new Map<string, TenantCreditOrderRecord>();

    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询积分充值退款申请关联订单失败", error);
    }

    return new Map(
      ((data ?? []) as TenantCreditOrderRecord[]).map((item) => [item.id, item]),
    );
  }

  private async findTenants(ids: string[]) {
    if (ids.length === 0) return new Map<string, TenantLite>();

    const { data, error } = await this.from("tenants")
      .select("id,name,slug")
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询积分充值退款申请关联租户失败", error);
    }

    return new Map(((data ?? []) as TenantLite[]).map((item) => [item.id, item]));
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item))));
}

export const platformBillingRechargeRefundRepository =
  new PlatformBillingRechargeRefundRepository();
