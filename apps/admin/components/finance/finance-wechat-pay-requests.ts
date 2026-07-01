import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type WechatPayConfigView = {
  id: string;
  merchant_mode: string;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  status: string;
  enabled_channels: unknown;
  settlement_account_summary: string | null;
  encrypted_config_ref: string | null;
  has_encrypted_config_ref: boolean;
  risk_switches: unknown;
  serial_no_masked: string | null;
  notify_url: string | null;
  validation_status: string;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
};

export type WechatPayConfigData = {
  configured: boolean;
  can_manage: boolean;
  config: WechatPayConfigView | null;
};

export type WechatPayConfigResult = WechatPayConfigData & {
  error: string | null;
};

export type WechatPayOrderStatus =
  | "pending"
  | "paid"
  | "closed"
  | "refunded"
  | "failed";

export type WechatPayOrderRecord = {
  id: string;
  tenant_id: string;
  payment_config_id: string | null;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_task_id: string | null;
  receivable_plan_id: string | null;
  payment_id: string | null;
  out_trade_no: string;
  transaction_id: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  currency: string;
  status: WechatPayOrderStatus;
  payer_openid: string | null;
  prepay_id: string | null;
  paid_at: string | null;
  closed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  latest_notification_id: string | null;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
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

export type WechatPayOrderListData = {
  list: WechatPayOrderRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WechatPayOrderResult = WechatPayOrderListData & {
  error: string | null;
};

const WECHAT_PAY_ORDER_PAGE_SIZE = 20;

export function emptyWechatPayConfig(): WechatPayConfigResult {
  return {
    configured: false,
    can_manage: false,
    config: null,
    error: null,
  };
}

export function emptyWechatPayOrders(page = 1): WechatPayOrderResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: WECHAT_PAY_ORDER_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export async function fetchWechatPayConfig(): Promise<WechatPayConfigResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyWechatPayConfig(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(buildBackendUrl("/finance/wechat-pay/config"), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<WechatPayConfigData>(response);
    return {
      ...(payload.data || emptyWechatPayConfig()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyWechatPayConfig(),
      error: error instanceof Error ? error.message : "微信支付配置加载失败",
    };
  }
}

export async function fetchWechatPayOrders(query: {
  page?: number;
  pageSize?: number;
  status?: string;
  project_id?: string;
  workflow_task_id?: string;
  receivable_plan_id?: string;
}): Promise<WechatPayOrderResult> {
  const token = await getAdminToken();
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize ?? WECHAT_PAY_ORDER_PAGE_SIZE);

  if (!token) {
    return {
      ...emptyWechatPayOrders(page),
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  appendOptionalParam(params, "status", query.status);
  appendOptionalParam(params, "project_id", query.project_id);
  appendOptionalParam(params, "workflow_task_id", query.workflow_task_id);
  appendOptionalParam(params, "receivable_plan_id", query.receivable_plan_id);

  try {
    const response = await fetch(
      buildBackendUrl(`/finance/wechat-pay/orders?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<WechatPayOrderListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: { page, pageSize, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "微信支付订单加载失败",
    };
  }
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

function normalizePage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizePageSize(value: number | undefined) {
  const pageSize = Number(value || WECHAT_PAY_ORDER_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return WECHAT_PAY_ORDER_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), 100);
}
