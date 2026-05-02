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

