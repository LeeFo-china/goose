import type {
  ProjectAcceptanceStatus,
  ProjectAcceptanceType,
  ProjectLogStageCode,
} from "@gooes/domain";

export type AcceptanceItemResult = "pass" | "fail" | "not_applicable";

export type AcceptanceItem = {
  id: string;
  section_id?: string | null;
  category: string | null;
  title: string;
  standard: string;
  required: boolean;
  allow_not_applicable: boolean;
  photo_required: boolean;
  photo_min_count: number;
  photo_max_count: number;
  result: AcceptanceItemResult | null;
  remark: string | null;
  images: string[];
  image_items?: AcceptanceImageItem[];
  rectification_remark: string | null;
  rectification_images: string[];
  rectification_image_items?: AcceptanceImageItem[];
};

export type AcceptanceProgress = {
  total: number;
  checked: number;
  passed: number;
  failed: number;
  not_applicable: number;
  required_incomplete: number;
};

export type AcceptanceSection = {
  id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  items: AcceptanceItem[];
};

export type AcceptanceTemplateItem = {
  id: string;
  section_id: string | null;
  category: string | null;
  title: string;
  standard: string;
  required: boolean;
  allow_not_applicable: boolean;
  photo_required: boolean;
  photo_min_count: number;
  photo_max_count: number;
  remark_required_on_fail: boolean;
  sort_order: number;
};

export type AcceptanceTemplateSection = {
  id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  items: AcceptanceTemplateItem[];
};

export type AcceptanceTemplate = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  acceptance_type: ProjectAcceptanceType;
  stage_code: ProjectLogStageCode;
  stage_label?: string | null;
  sections?: AcceptanceTemplateSection[];
  items?: AcceptanceTemplateItem[];
};

export type AcceptanceTemplateListData = {
  list?: AcceptanceTemplate[];
};

export type AcceptanceImageItem = {
  id?: string | null;
  acceptance_id?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  path?: string | null;
  url?: string | null;
  thumb_url?: string | null;
  source?: "acceptance_item" | "rectification_item" | string | null;
  created_at?: string | null;
};

export type AcceptanceAction = {
  id: string;
  action: string;
  operator_type: "employee" | "customer" | "system" | string;
  operator_id: string | null;
  operator?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  from_status?: ProjectAcceptanceStatus | null;
  to_status?: ProjectAcceptanceStatus | null;
  comment: string | null;
  created_at: string | null;
  images?: string[];
  image_items?: AcceptanceImageItem[];
  referenced_images?: AcceptanceImageItem[];
};

export type ProjectAcceptance = {
  id: string;
  project_id: string;
  acceptance_type?: ProjectAcceptanceType;
  stage_code: ProjectLogStageCode;
  stage_label: string | null;
  title: string;
  status: ProjectAcceptanceStatus;
  status_label: string;
  summary: string | null;
  reject_reason: string | null;
  reject_source: "leader" | "customer" | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  items: AcceptanceItem[];
  sections?: AcceptanceSection[];
  progress?: AcceptanceProgress;
  failed_count?: number;
  required_incomplete_count?: number;
  can_submit?: boolean;
  blocked_reason?: string | null;
  actions?: AcceptanceAction[];
  initiator?: { name?: string | null } | null;
  reviewer?: { name?: string | null } | null;
  latest_customer_notification?: AcceptanceNotification | null;
};

export type ConstructionStageItem = {
  stage_code: ProjectLogStageCode;
  stage_label: string;
  status: string;
  acceptance_id: string | null;
  acceptance_status: string | null;
  blocked_reason: string | null;
};

export type ConstructionStagePayload = {
  project_status: string | null;
  required_completed: boolean;
  current_stage: ProjectLogStageCode | null;
  missing_required_stages: Array<{
    stage_code: ProjectLogStageCode;
    stage_label: string;
  }>;
  stages: ConstructionStageItem[];
};

export type AcceptanceNotification = {
  id: string;
  status: "active" | "used" | "expired" | "revoked" | string;
  send_status: "sent" | "failed" | null | string;
  send_error: string | null;
  phone: string;
  link_type: string | null;
  sent_at: string | null;
  expire_at: string;
  used_at: string | null;
  created_at: string;
};

export type AcceptanceListData = {
  list: ProjectAcceptance[];
  pagination: {
    total: number;
  };
};

export type NotifyCustomerResult = {
  sent: boolean;
  reused?: boolean;
  phone: string;
  link_type: string;
  expire_at: string;
};

export type DirectUploadInitResult = {
  provider: "tencent_cos";
  bucket: string;
  region: string | null;
  object_key: string;
  storage_path: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
  expires_in: number;
  expires_at: string;
};

export type DirectUploadCompleteResult = {
  url?: string;
  path?: string;
  provider?: string;
  object_key?: string;
  storage_path?: string;
};

export type EditableItem = {
  id: string;
  result: AcceptanceItemResult | null;
  remark: string;
  images: string[];
  imagePreviews: string[];
  rectification_remark: string;
  rectification_images: string[];
  rectificationImagePreviews: string[];
};

export type EditableState = {
  summary: string;
  items: Record<string, EditableItem>;
};

export type AcceptanceDialogState =
  | {
    type: "approve" | "reject" | "delete";
    acceptanceId: string;
    title: string;
    comment: string;
  }
  | null;
