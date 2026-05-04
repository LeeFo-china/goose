export type MarketingCampaignType = "share_assist" | "appointment_reward";
export type MarketingCampaignStatus = "draft" | "active" | "paused" | "closed";
export type MarketingCampaignTargetScopeType = "all_projects" | "project_list";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type MarketingProjectOption = {
  id: string;
  name: string | null;
  status?: string | null;
  address?: string | null;
};

export type MarketingCampaignSummary = {
  instance_count: number;
  active_instance_count: number;
  achieved_instance_count: number;
  reward_claimed_count: number;
  closed_instance_count: number;
};

export type MarketingCampaignRecord = {
  id: string;
  campaign_type: MarketingCampaignType;
  name: string;
  status: MarketingCampaignStatus;
  enabled: boolean;
  target_scope_type: MarketingCampaignTargetScopeType;
  valid_from: string | null;
  valid_until: string | null;
};

export type MarketingCampaignDetail = MarketingCampaignRecord & {
  template_id?: string | null;
  template_summary?: {
    id: string;
    name: string;
    status: string;
  } | null;
  auto_close_on_expire: boolean;
  reward_title: string | null;
  reward_remark: string | null;
  reward_claim_instruction: string | null;
  reward_claim_channel: string | null;
  include_project_ids: string[];
  exclude_project_ids: string[];
  scopes: Array<{
    scope_mode: "include" | "exclude";
    project_id: string;
    project_name: string | null;
  }>;
  config_payload: Record<string, unknown>;
  summary: MarketingCampaignSummary;
};

export type H5MarketingPageStatus = "draft" | "published" | "offline" | "archived";
export type H5MarketingPageDisplayScene =
  | "all"
  | "home"
  | "customer_home"
  | "project_detail"
  | "marketing_list";
export type H5MarketingLeadStatus = "new" | "contacted" | "converted" | "invalid";

export type H5MarketingPageRecord = {
  id: string;
  title: string;
  slug: string;
  status: H5MarketingPageStatus;
  description: string | null;
  cover_image: string | null;
  display_scene: H5MarketingPageDisplayScene;
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  published_version_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type H5MarketingLeadRecord = {
  id: string;
  page_id: string | null;
  page_version_id: string | null;
  name: string | null;
  phone: string | null;
  community: string | null;
  city: string | null;
  form_data: Record<string, unknown>;
  source: string;
  lead_status: H5MarketingLeadStatus;
  follow_remark: string | null;
  followed_by: string | null;
  followed_at: string | null;
  wx_openid: string | null;
  customer_id: string | null;
  request_ip: string | null;
  user_agent: string | null;
  created_at: string;
  page?: {
    id: string;
    title: string | null;
    slug: string | null;
  } | null;
  customer?: {
    id: string;
    name: string | null;
    phone: string | null;
    status: string | null;
    owner_id: string | null;
  } | null;
};
