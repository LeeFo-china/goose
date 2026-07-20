import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import type { Inserts, Tables } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";
import type { WechatPayOrderListQuery } from "@/schema/wechat-pay-orders";

export type WechatPayOrderRecord = Tables<"wechat_payment_orders">;
export type WechatPayOrderCreateInput = Inserts<"wechat_payment_orders">;
export type ServiceProviderWechatPayOrderCreateInput =
  WechatPayOrderCreateInput & {
    platform_payment_config_id: string;
    expected_platform_guard_version: number;
    expected_tenant_config_updated_at: string;
  };
export type WechatPayNotificationRecord = Tables<"wechat_payment_notifications">;
export type WechatPayNotificationCreateInput =
  Inserts<"wechat_payment_notifications">;

export type WechatPayReceivablePlanRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: string;
  title: string;
  amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
};

export type WechatPayOrderListItem = WechatPayOrderRecord & {
  project?: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
  receivable_plan?: {
    id: string;
    title: string | null;
    payment_type: string | null;
    status: string | null;
    amount: number | string | null;
    paid_amount: number | string | null;
    due_date: string | null;
  } | null;
  payment?: {
    id: string;
    status: string | null;
    amount: number | string | null;
    pay_date: string | null;
    payment_channel: string | null;
    provider: string | null;
    provider_transaction_id: string | null;
  } | null;
};

export type WechatPayOrderListResult = {
  list: WechatPayOrderListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const WECHAT_PAY_ORDER_SELECT = [
  "id",
  "tenant_id",
  "payment_config_id",
  "project_id",
  "workflow_instance_id",
  "workflow_task_id",
  "receivable_plan_id",
  "payment_id",
  "out_trade_no",
  "transaction_id",
  "amount",
  "paid_amount",
  "currency",
  "status",
  "payer_openid",
  "prepay_id",
  "paid_at",
  "closed_at",
  "failed_at",
  "failure_reason",
  "latest_notification_id",
  "metadata",
  "created_by_employee_id",
  "created_at",
  "updated_at",
  "project:projects!wechat_payment_orders_project_id_fkey(id, name, status)",
  [
    "receivable_plan:project_receivable_plans!",
    "wechat_payment_orders_receivable_plan_id_fkey(",
    "id, title, payment_type, status, amount, paid_amount, due_date",
    ")",
  ].join(""),
  [
    "payment:payments!wechat_payment_orders_payment_id_fkey(",
    "id, status, amount, pay_date, payment_channel, provider, ",
    "provider_transaction_id",
    ")",
  ].join(""),
].join(", ");

const RECEIVABLE_PLAN_SELECT = [
  "id",
  "tenant_id",
  "project_id",
  "workflow_instance_id",
  "workflow_node_key",
  "source_type",
  "source_id",
  "payment_type",
  "title",
  "amount",
  "paid_amount",
  "status",
  "due_date",
].join(", ");

const GUARDED_CREATE_ERRORS = {
  WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED:
    "微信支付配置已更新，请重新发起支付",
  WECHAT_PAY_PLATFORM_PROFILE_NOT_READY: "平台服务商支付配置尚未就绪",
  WECHAT_PAY_PLATFORM_PROFILE_MISMATCH:
    "租户支付配置与平台服务商配置不一致",
} as const;
const PENDING_TASK_UNIQUE_CONSTRAINT =
  "wechat_payment_orders_pending_task_unique_idx";

class WechatPayOrderRepository {
  async findByOutTradeNo(
    outTradeNo: string,
  ): Promise<WechatPayOrderRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .select("*")
      .eq("out_trade_no", outTradeNo)
      .limit(2);

    if (error) {
      throw Errors.dbError("查询微信支付订单失败", error);
    }

    const rows = (data ?? []) as WechatPayOrderRecord[];
    if (rows.length > 1) {
      throw Errors.business(
        409,
        "微信支付商户订单号匹配到多个订单",
        "WECHAT_PAY_OUT_TRADE_NO_DUPLICATED",
      );
    }

    return rows[0] ?? null;
  }

  async findPendingByWorkflowTask(input: {
    tenantId: string;
    workflowTaskId: string;
  }): Promise<WechatPayOrderRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("workflow_task_id", input.workflowTaskId)
      .eq("status", "pending")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信支付订单失败", error);
    }

    return (data as WechatPayOrderRecord | null) ?? null;
  }

  async findReceivablePlan(input: {
    tenantId: string;
    planId: string;
  }): Promise<WechatPayReceivablePlanRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(RECEIVABLE_PLAN_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.planId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询应收计划失败", error);
    }

    return data
      ? normalizeReceivablePlan(data as unknown as WechatPayReceivablePlanRecord)
      : null;
  }

  async createOrder(
    input: WechatPayOrderCreateInput,
  ): Promise<WechatPayOrderRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      if (isPendingTaskUniqueViolation(error)) {
        throw pendingOrderConcurrentError();
      }
      throw Errors.dbError("创建微信支付订单失败", error);
    }

    return data as WechatPayOrderRecord;
  }

  async createServiceProviderOrder(
    input: ServiceProviderWechatPayOrderCreateInput,
  ): Promise<WechatPayOrderRecord> {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "wechat_pay_create_pending_service_provider_order",
      {
        p_tenant_id: input.tenant_id,
        p_payment_config_id: input.payment_config_id ?? null,
        p_platform_payment_config_id: input.platform_payment_config_id,
        p_expected_platform_guard_version:
          input.expected_platform_guard_version,
        p_expected_tenant_config_updated_at:
          input.expected_tenant_config_updated_at,
        p_project_id: input.project_id,
        p_workflow_instance_id: input.workflow_instance_id ?? null,
        p_workflow_task_id: input.workflow_task_id ?? null,
        p_receivable_plan_id: input.receivable_plan_id ?? null,
        p_out_trade_no: input.out_trade_no,
        p_amount: input.amount,
        p_payer_openid: input.payer_openid ?? null,
        p_created_by_employee_id: input.created_by_employee_id ?? null,
        p_metadata: input.metadata ?? {},
      },
    );

    if (error) {
      if (isPendingTaskUniqueViolation(error)) {
        throw pendingOrderConcurrentError();
      }
      for (const [code, message] of Object.entries(GUARDED_CREATE_ERRORS)) {
        if (matchesPostgresError(error, "23514", code)) {
          throw Errors.business(409, message, code);
        }
      }
      throw Errors.dbError("创建服务商微信支付订单失败", error);
    }

    return data as WechatPayOrderRecord;
  }

  async markPrepayCreated(input: {
    tenantId: string;
    orderId: string;
    prepayId: string;
  }): Promise<WechatPayOrderRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .update({ prepay_id: input.prepayId })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新微信支付预支付单失败", error);
    }

    return data as WechatPayOrderRecord;
  }

  async findNotificationByNotifyId(input: {
    tenantId: string;
    notifyId: string;
  }): Promise<WechatPayNotificationRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_notifications")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("notify_id", input.notifyId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信支付回调通知失败", error);
    }

    return (data as WechatPayNotificationRecord | null) ?? null;
  }

  async createNotification(
    input: WechatPayNotificationCreateInput,
  ): Promise<WechatPayNotificationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_notifications")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入微信支付回调通知失败", error);
    }

    return data as WechatPayNotificationRecord;
  }

  async markNotificationProcessed(input: {
    tenantId: string;
    notificationId: string;
  }): Promise<WechatPayNotificationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_notifications")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记微信支付回调通知已处理失败", error);
    }

    return data as WechatPayNotificationRecord;
  }

  async markNotificationFailed(input: {
    tenantId: string;
    notificationId: string;
    errorMessage: string;
  }): Promise<WechatPayNotificationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_notifications")
      .update({
        processed: false,
        error_message: input.errorMessage.slice(0, 500),
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记微信支付回调通知失败原因失败", error);
    }

    return data as WechatPayNotificationRecord;
  }

  async markOrderPaid(input: {
    tenantId: string;
    orderId: string;
    paymentId: string;
    transactionId: string;
    paidAmount: number;
    paidAt: string;
    notificationId: string;
  }): Promise<WechatPayOrderRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .update({
        payment_id: input.paymentId,
        transaction_id: input.transactionId,
        paid_amount: input.paidAmount,
        paid_at: input.paidAt,
        status: "paid",
        latest_notification_id: input.notificationId,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新微信支付订单付款状态失败", error);
    }

    return data as WechatPayOrderRecord;
  }

  async listOrders(input: {
    tenantId: string;
    query: WechatPayOrderListQuery;
  }): Promise<WechatPayOrderListResult> {
    const page = input.query.page ?? 1;
    const pageSize = Math.min(input.query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("wechat_payment_orders")
      .select(WECHAT_PAY_ORDER_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId);

    if (input.query.status) request = request.eq("status", input.query.status);
    if (input.query.project_id) {
      request = request.eq("project_id", input.query.project_id);
    }
    if (input.query.receivable_plan_id) {
      request = request.eq("receivable_plan_id", input.query.receivable_plan_id);
    }
    if (input.query.workflow_task_id) {
      request = request.eq("workflow_task_id", input.query.workflow_task_id);
    }

    const { data, error, count } = await request
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询微信支付订单列表失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data ?? []) as unknown as WechatPayOrderListItem[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }
}

function pendingOrderConcurrentError() {
  return Errors.business(
    409,
    "同一流程待办的微信支付订单正在创建",
    "WECHAT_PAY_PENDING_ORDER_CONCURRENT",
  );
}

function isPendingTaskUniqueViolation(error: unknown) {
  const direct = asErrorRecord(error);
  const wrapped = asErrorRecord(direct?.details);
  return [direct, wrapped].some((candidate) =>
    candidate?.code === "23505" &&
    (candidate.constraint === PENDING_TASK_UNIQUE_CONSTRAINT ||
      (typeof candidate.message === "string" &&
        candidate.message.includes(PENDING_TASK_UNIQUE_CONSTRAINT)))
  );
}

function asErrorRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function normalizeReceivablePlan(
  row: WechatPayReceivablePlanRecord,
): WechatPayReceivablePlanRecord {
  return {
    ...row,
    amount: normalizeMoney(row.amount),
    paid_amount: normalizeMoney(row.paid_amount),
  };
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export const wechatPayOrderRepository = new WechatPayOrderRepository();
