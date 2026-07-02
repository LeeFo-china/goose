export const WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "settlement_account_proof",
  "business_scene_material",
] as const;

export type WechatPayApplymentAttachmentCategory =
  (typeof WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORIES)[number];

export const WECHAT_PAY_APPLYMENT_REQUIRED_ATTACHMENT_CATEGORIES: WechatPayApplymentAttachmentCategory[] = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];

export const WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORY_LABELS: Record<
  WechatPayApplymentAttachmentCategory,
  string
> = {
  license_copy: "营业执照照片",
  legal_representative_id_card_front: "法人身份证人像面",
  legal_representative_id_card_back: "法人身份证国徽面",
  settlement_account_proof: "结算账户证明",
  business_scene_material: "经营场景材料",
};

export type WechatPayApplymentAttachment = {
  category?: WechatPayApplymentAttachmentCategory | string | null;
  object_key: string;
  file_name?: string | null;
  content_type?: string | null;
  size?: number | null;
};

export type WechatPayApplymentRecord = {
  id: string;
  tenant_id: string;
  application_no: string;
  status: string;
  merchant_short_name: string;
  license_name: string | null;
  license_code: string | null;
  legal_representative_name: string | null;
  super_admin_name: string | null;
  super_admin_phone_masked: string | null;
  super_admin_email: string | null;
  settlement_account_name: string | null;
  settlement_bank_name: string | null;
  settlement_account_summary: string | null;
  business_scene_description: string | null;
  contact_address: string | null;
  attachments: WechatPayApplymentAttachment[];
  remark: string | null;
  applyment_business_code: string | null;
  applyment_id: string | null;
  applyment_state: string;
  applyment_state_message: string | null;
  sub_mchid: string | null;
  sub_appid: string | null;
  appid_binding_state: string;
  appid_binding_message: string | null;
  payment_config_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  opened_at: string | null;
  activated_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type WechatPayApplymentEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  operator_employee_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type WechatPayApplymentDetailData = {
  applyment: WechatPayApplymentRecord | null;
  events: WechatPayApplymentEvent[];
  can_submit: boolean;
};

export type WechatPayApplymentDetailResult = WechatPayApplymentDetailData & {
  error: string | null;
};

export function emptyWechatPayApplyment(): WechatPayApplymentDetailResult {
  return {
    applyment: null,
    events: [],
    can_submit: false,
    error: null,
  };
}

export function getWechatPayApplymentStatusMeta(status?: string | null) {
  if (status === "active") return { label: "已启用", variant: "success" as const };
  if (status === "bound") return { label: "已绑定", variant: "success" as const };
  if (status === "opened") return { label: "已开通", variant: "success" as const };
  if (status === "submitted") return { label: "待平台审核", variant: "warning" as const };
  if (status === "approved") return { label: "审核通过", variant: "default" as const };
  if (status === "applying") return { label: "人工进件中", variant: "default" as const };
  if (status === "reviewing") return { label: "微信审核中", variant: "default" as const };
  if (status === "account_verifying") return { label: "账户验证", variant: "warning" as const };
  if (status === "signing") return { label: "待签约", variant: "warning" as const };
  if (status === "rejected") return { label: "已驳回", variant: "danger" as const };
  if (status === "suspended") return { label: "已暂停", variant: "secondary" as const };
  if (status === "closed") return { label: "已关闭", variant: "secondary" as const };
  return { label: status === "draft" ? "草稿" : "未申请", variant: "outline" as const };
}

export function formatWechatPayApplymentTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function getWechatPayApplymentAttachmentCategoryLabel(
  category?: string | null,
) {
  if (!category) return "申请附件";
  return WECHAT_PAY_APPLYMENT_ATTACHMENT_CATEGORY_LABELS[
    category as WechatPayApplymentAttachmentCategory
  ] || category;
}

export function formatWechatPayApplymentAttachmentSize(size?: number | null) {
  if (!size || size < 0) return "";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

export function buildWechatPayApplymentAttachmentPreviewUrl(objectKey: string) {
  if (!objectKey) return "";
  if (/^https?:\/\//i.test(objectKey) || objectKey.startsWith("blob:")) {
    return objectKey;
  }
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(objectKey)}`;
}
