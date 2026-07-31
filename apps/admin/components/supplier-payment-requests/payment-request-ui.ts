import type {
  SupplierPaymentMethod,
  SupplierPaymentRequestStatus,
} from "./payment-request-types";

export const paymentRequestStatusMeta: Record<
  SupplierPaymentRequestStatus,
  {
    label: string;
    variant: "outline" | "secondary" | "success" | "warning" | "danger";
  }
> = {
  draft: { label: "草稿", variant: "secondary" },
  pending_approval: { label: "待审批", variant: "warning" },
  approved: { label: "已批准", variant: "success" },
  partially_paid: { label: "部分付款", variant: "warning" },
  paid: { label: "已付清", variant: "success" },
  rejected: { label: "已驳回", variant: "danger" },
  cancelled: { label: "已取消", variant: "secondary" },
  closed: { label: "已关闭", variant: "secondary" },
};

export const paymentMethodLabels: Record<SupplierPaymentMethod, string> = {
  bank_transfer: "银行转账",
  wechat: "微信支付",
  alipay: "支付宝",
  cash: "现金",
  other: "其他",
};

export function formatPaymentDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function shortPaymentId(value: string) {
  return value.slice(0, 8) || "未知";
}
