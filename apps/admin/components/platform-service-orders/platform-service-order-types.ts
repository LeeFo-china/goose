import type {
  PlatformServicePaymentStatus,
  PlatformServiceStatus,
} from "@gooes/domain";

export type PageData<RecordType> = {
  list: RecordType[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type ServiceTenantSummary = {
  id: string;
  name: string | null;
  status?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
};

export type PlatformServiceOrderAction = {
  enabled: boolean;
  label: string;
  disabled_reason: string | null;
};

export type PlatformServiceWechatShippingStatus =
  | "not_started"
  | "pending"
  | "succeeded"
  | "failed";

export type PlatformServiceWechatShippingReport = {
  id: string | null;
  status: PlatformServiceWechatShippingStatus | string;
  attempt_count: number;
  wechat_errcode: number | null;
  wechat_errmsg: string | null;
  provider_request_id: string | null;
  last_attempt_at: string | null;
  succeeded_at: string | null;
  updated_at: string | null;
  source?: string | null;
};

export type PlatformServiceOrderListItem = {
  id: string;
  tenant_id?: string;
  order_no: string;
  product_code: string;
  term_years: number;
  amount_fen: number;
  paid_amount_fen?: number | null;
  payment_status: PlatformServicePaymentStatus | string;
  service_status: PlatformServiceStatus | string;
  transaction_id?: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  tenant?: ServiceTenantSummary | ServiceTenantSummary[] | null;
  wechat_shipping_report?: PlatformServiceWechatShippingReport | null;
  available_actions?: Record<string, PlatformServiceOrderAction>;
};

export type PlatformServiceWorkOrderListItem = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  order_no: string;
  status: PlatformServiceStatus | string;
  assignee_employee_id: string | null;
  created_by_employee_id: string | null;
  assigned_at?: string | null;
  version?: number;
  created_at: string;
  updated_at: string;
  available_actions?: Record<string, PlatformServiceOrderAction>;
  order?: {
    id: string;
    order_no: string;
    product_code: string;
    term_years: number;
    amount_fen: number;
    payment_status: PlatformServicePaymentStatus | string;
    service_status: PlatformServiceStatus | string;
    paid_at: string | null;
    tenant?: ServiceTenantSummary | ServiceTenantSummary[] | null;
  } | null;
};

export type PlatformServiceRefundRequestListItem = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  reason: string;
  status: "reviewing" | "approved" | "rejected" | "cancelled" | string;
  version?: number;
  created_by_employee_id: string;
  reviewed_by_employee_id?: string | null;
  reviewed_at?: string | null;
  review_remark?: string | null;
  created_at: string;
  updated_at: string;
  order?: {
    id: string;
    order_no: string;
    product_code: string;
    term_years: number;
    amount_fen: number;
    payment_status: PlatformServicePaymentStatus | string;
    service_status: PlatformServiceStatus | string;
    paid_at: string | null;
    tenant?: ServiceTenantSummary | ServiceTenantSummary[] | null;
  } | null;
};
