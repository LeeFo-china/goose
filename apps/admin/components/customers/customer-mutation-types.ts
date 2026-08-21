export type Owner = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  avatar?: string | null;
};

export type PropertySummary = {
  id: string;
  community: string | null;
  building_info: string | null;
  layout: string | null;
  area: number | null;
  is_primary?: boolean;
  province?: string | null;
  city?: string | null;
  district?: string | null;
  adcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_status?: string | null;
  location_source?: string | null;
  location_confidence?: number | null;
  location_confirmed_at?: string | null;
};

export type CustomerSourceEmployee = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type DouyinCustomerSourceMetadata = {
  appointment_no: string | null;
  status: "pending_confirmation" | "confirmed" | "completed" | "canceled" | "invalid" | null;
  estimate_no: string | null;
  minimum_total: number | null;
  maximum_total: number | null;
  ai_status: "pending" | "succeeded" | "failed" | "skipped" | null;
  ai_summary: string | null;
  allocation_advice: string[];
  risk_factors: string[];
  onsite_questions: string[];
};

export type CustomerSourceRecord = {
  id: string;
  source: string;
  display_label: string;
  dedupe_result: string | null;
  is_old_customer_new_lead: boolean;
  is_platform_new_lead: boolean;
  is_employee_share: boolean;
  source_employee?: CustomerSourceEmployee | null;
  assigned_by?: CustomerSourceEmployee | null;
  platform_lead?: {
    id: string;
    phone: string | null;
    name: string | null;
    city: string | null;
    community: string | null;
    status: string | null;
    source: string | null;
  } | null;
  share_link?: {
    id: string;
    token: string;
    source: string;
    target_type: string;
    target_id: string | null;
  } | null;
  metadata?: unknown;
  created_at: string;
};

export type CustomerSourceSummary = {
  total: number;
  latest_source: CustomerSourceRecord | null;
  source_tags: string[];
  has_old_customer_new_lead: boolean;
  has_platform_new_lead: boolean;
  has_employee_share: boolean;
};

export type CustomerFollowUpRecord = {
  id: string;
  customer_id?: string | null;
  employee_id: string | null;
  employee_name?: string | null;
  employee?: Owner | Owner[] | null;
  content: string;
  next_follow_at: string | null;
  created_at: string | null;
  comment_count?: number;
  latest_comment_preview?: {
    id: string;
    content: string;
    author_employee_name: string | null;
    created_at: string;
  } | null;
};

export type CustomerLatestProjectSummary = {
  id: string;
  customer_id?: string | null;
  name: string | null;
  status: string | null;
  created_at?: string | null;
};

export type CustomerRecord = {
  id: string;
  name: string | null;
  avatar?: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  can_view_phone?: boolean;
  can_call_phone?: boolean;
  can_copy_phone?: boolean;
  owner_id: string | null;
  owner?: Owner | Owner[] | null;
  owner_name?: string | null;
  source: string | null;
  customer_origin?: string | null;
  self_registered_at?: string | null;
  claimed_at?: string | null;
  status: string | null;
  created_at: string | null;
  douyin_screenshot_images?: string[];
  property_id?: string | null;
  community?: string | null;
  building_info?: string | null;
  layout?: string | null;
  area?: number | null;
  properties?: PropertySummary[];
  property_count?: number;
  latest_follow_up?: CustomerFollowUpRecord | null;
  last_follow_at?: string | null;
  next_follow_at?: string | null;
  follow_up_state?: "none" | "upcoming" | "due" | "overdue" | string;
  latest_project?: CustomerLatestProjectSummary | null;
  source_summary?: CustomerSourceSummary;
  latest_source?: CustomerSourceRecord | null;
  source_tags?: string[];
  has_old_customer_new_lead?: boolean;
  has_platform_new_lead?: boolean;
  has_employee_share?: boolean;
  detail_activity?: CustomerDetailActivity;
};

export type EmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type ProjectEmployeeOption = {
  id: string;
  label: string;
  description?: string | null;
};

export type CustomerMode = "create" | "edit";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

export type CustomerStatusActionItem = {
  action: string;
  label: string;
  from_status: string;
  to_status: string;
  requires_reason?: boolean;
};

export type CustomerDetailActivity = {
  follow_ups?: {
    list?: CustomerFollowUpRecord[];
  };
  sources?: {
    list?: CustomerSourceRecord[];
  };
};
