import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import type {
  ProjectAcceptanceAction,
  ProjectAcceptanceItemResult,
  ProjectAcceptanceRejectSource,
  ProjectAcceptanceStatus,
  ProjectAcceptanceType,
  ProjectLogStageCode,
} from "@gooes/domain";

export type ProjectAcceptanceTemplateRow = {
  id: string;
  acceptance_type: ProjectAcceptanceType;
  stage_code: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  project_type: string | null;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceTemplateSectionRow = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceTemplateSectionWriteRow = {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: string;
};

export type ProjectAcceptanceTemplateItemRow = {
  id: string;
  template_id: string;
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
  input_type: string;
  options: unknown;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceTemplateItemWriteRow = {
  id: string;
  template_id: string;
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
  input_type: string;
  options: unknown;
  sort_order: number;
  status: string;
};

export type ProjectAcceptanceRow = {
  id: string;
  tenant_id: string | null;
  project_id: string;
  acceptance_type: ProjectAcceptanceType;
  stage_code: string;
  template_id: string | null;
  template_version: number;
  template_snapshot: unknown;
  title: string;
  status: ProjectAcceptanceStatus;
  initiator_id: string;
  reviewer_id: string | null;
  customer_id: string | null;
  summary: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  customer_confirmed_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  reject_source: ProjectAcceptanceRejectSource | null;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceItemRow = {
  id: string;
  tenant_id: string | null;
  acceptance_id: string;
  template_item_id: string | null;
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
  result: ProjectAcceptanceItemResult | null;
  remark: string | null;
  rectification_remark: string | null;
  rectification_images: unknown;
  images: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceActionRow = {
  id: string;
  tenant_id: string | null;
  acceptance_id: string;
  operator_type: "employee" | "customer" | "system";
  operator_id: string | null;
  action: ProjectAcceptanceAction;
  from_status: ProjectAcceptanceStatus | null;
  to_status: ProjectAcceptanceStatus;
  comment: string | null;
  metadata: unknown;
  created_at: string;
};

export type ProjectAcceptanceProjectRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  customer_id: string | null;
  status: string | null;
};

export type ProjectAcceptanceEmployeeRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  avatar: string | null;
};

export type ProjectAcceptanceCustomerRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant?: {
    id: string | null;
    status: string | null;
  } | Array<{
    id: string | null;
    status: string | null;
  }> | null;
};

export type ListAcceptancesInput = {
  page: number;
  pageSize: number;
  project_id?: string;
  acceptance_type?: ProjectAcceptanceType;
  status?: ProjectAcceptanceStatus;
  stage_code?: ProjectLogStageCode;
  reviewer_id?: string;
  customer_id?: string;
  visibleProjectIds?: string[] | null;
  tenantId?: string | null;
};

export { Errors, SupabaseDB };
export type {
  ProjectAcceptanceAction,
  ProjectAcceptanceItemResult,
  ProjectAcceptanceRejectSource,
  ProjectAcceptanceStatus,
  ProjectAcceptanceType,
  ProjectLogStageCode,
};
