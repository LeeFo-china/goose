import type {
  OcrDocumentType,
  OcrRecognitionStatus,
  OcrScene,
  OcrTenantPolicyDocumentType,
} from "@gooes/domain";
import type { PlatformListPagination } from "@/components/platform/platform-list-shell";

export type PlatformOcrRecognition = {
  id: string;
  tenant_id: string;
  actor_employee_id: string | null;
  scene: OcrScene;
  document_type: OcrDocumentType;
  provider: string;
  provider_action: string;
  subject_type: string | null;
  subject_id: string | null;
  status: OcrRecognitionStatus;
  provider_request_id: string | null;
  provider_error_code: string | null;
  provider_error_message_safe: string | null;
  billable_units: number;
  duration_ms: number | null;
  processed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type PlatformOcrRecognitionListData = {
  list: PlatformOcrRecognition[];
  pagination: PlatformListPagination;
};

export type PlatformOcrTenantPolicy = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  configured: boolean;
  enabled: boolean;
  allowed_document_types: OcrTenantPolicyDocumentType[];
  daily_limit: number | null;
  remark: string | null;
  enabled_at: string | null;
  updated_by_employee_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PlatformOcrTenantPolicyListData = {
  list: PlatformOcrTenantPolicy[];
  pagination: PlatformListPagination;
};

export const platformOcrRolloutDocumentOptions = [
  { value: "business_license", label: "营业执照" },
  { value: "id_card_front", label: "身份证人像面" },
  { value: "id_card_back", label: "身份证国徽面" },
  { value: "bank_card", label: "银行卡" },
] as const satisfies ReadonlyArray<{
  value: OcrTenantPolicyDocumentType;
  label: string;
}>;

export const platformOcrStatusOptions = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "识别中" },
  { value: "succeeded", label: "成功" },
  { value: "failed", label: "失败" },
  { value: "expired", label: "已过期" },
] as const;

export const platformOcrDocumentOptions = [
  { value: "business_license", label: "营业执照" },
  { value: "id_card_front", label: "身份证人像面" },
  { value: "id_card_back", label: "身份证国徽面" },
  { value: "bank_card", label: "银行卡" },
  { value: "general_invoice", label: "通用票据" },
  { value: "vat_invoice_verify", label: "增值税发票" },
  { value: "store_name", label: "门头招牌" },
  { value: "store_classification", label: "门店分类" },
  { value: "document_classification", label: "文档分类" },
] as const;

export function getOcrStatusLabel(status: OcrRecognitionStatus) {
  return platformOcrStatusOptions.find((item) => item.value === status)?.label
    ?? status;
}

export function getOcrDocumentLabel(documentType: OcrDocumentType) {
  return platformOcrDocumentOptions.find((item) => item.value === documentType)
    ?.label ?? documentType;
}

export function getOcrSceneLabel(scene: OcrScene) {
  if (scene === "wechat_pay_applyment") return "支付进件";
  if (scene === "expense_request") return "员工报销";
  if (scene === "merchant_material") return "商户资料";
  return scene;
}
