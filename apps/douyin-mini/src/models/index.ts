export const DOUYIN_ENTRY_PATHS = [
  "pages/home/index",
  "pages/company/index",
  "pages/privacy/index",
  "pages/cases/index",
  "pages/case-detail/index",
  "pages/sites/index",
  "pages/site-detail/index",
  "pages/budget/index",
  "pages/lead/index",
  "pages/lead-success/index",
] as const;

export const DOUYIN_SOURCE_TYPES = [
  "short_video", "live", "search", "profile", "share", "direct", "other",
] as const;

export type DouyinEntryPath = (typeof DOUYIN_ENTRY_PATHS)[number];
export type DouyinSourceType = (typeof DOUYIN_SOURCE_TYPES)[number];

export type LaunchContext = {
  entry_path: DouyinEntryPath;
  scene: string;
  source_type: DouyinSourceType;
  campaign_code?: string;
  content_id?: string;
};

export type DouyinEnvironment = {
  appId: string;
  envType: string;
  version: string;
};

export type DeploymentConfig = {
  deployment_key?: string;
};

export type StoredSession = {
  accessToken: string;
  expiresAt: number;
};

export type SessionExchangeInput = {
  app_id: string;
  deployment_key?: string;
  code: string;
  launch_context: LaunchContext;
};

export type SessionExchangeResult = {
  accessToken: string;
  expiresIn: number;
};

export type BootstrapData = {
  installation: { status: "active"; template_version: string | null };
  company: CompanyData;
  theme: { primary_color: string; navigation_text_color: "black" | "white" };
  features: {
    cases: boolean;
    sites: boolean;
    sms_lead: boolean;
    douyin_phone: false;
    phone_capture_mode: "sms";
  };
  content: {
    home_banners: HomeBanner[];
    trust_metrics: Array<{ label: string; value: string }>;
    featured_projects: PublicProject[];
    featured_cases: PublicProject[];
    active_sites: PublicProject[];
  };
  privacy_policy_version: string;
};

export type HomeBanner = {
  image_url: string;
  title: string;
  subtitle: string;
};

export type ServiceRegion = {
  province: string | null;
  city: string;
  district: string | null;
};

export type CompanyData = {
  name: string;
  logo_url: string | null;
  summary: string | null;
  service_phone: string;
  public_address: string | null;
  address_region: {
    province: string | null;
    city: string | null;
    district: string | null;
  };
  service_regions: ServiceRegion[];
  qualifications: Array<{ title: string; image_url: string | null }>;
};

export type PublicProject = {
  id: string;
  title: string;
  phase: PublicProjectPhase;
  cover_image_url: string | null;
  public_images: string[];
  style_tags: string[];
  layout: string | null;
  area: number | null;
  budget_band: string | null;
  community: string;
  city: string | null;
  district: string | null;
  status: string | null;
  start_date: string | null;
  updated_at: string;
  description: string | null;
};

export type PublicProjectPhase = "in_progress" | "completed";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PublicProjectPage = { items: PublicProject[]; pagination: PaginationMeta };

export type PublicSiteLog = {
  id: string;
  stage_code: string | null;
  node_name: string | null;
  images: string[];
  created_at: string;
};

export type PublicSiteLogPage = { items: PublicSiteLog[]; pagination: PaginationMeta };

export type DouyinPropertyCondition = "rough" | "old_house";
export type DouyinDecorationTier = "economy" | "comfortable" | "quality";
export type DouyinDecorationScope = "whole_house" | "partial";
export type DouyinBudgetOptionCode =
  | "demolition"
  | "water_electricity_upgrade"
  | "custom_cabinet";
export type DouyinBudgetCategoryCode =
  | "base"
  | "water_electricity"
  | "materials"
  | "custom"
  | "other";
export type DouyinBudgetAiStatus = "pending" | "succeeded" | "failed" | "skipped";

export type DouyinBudgetPublicOption = {
  code: DouyinBudgetOptionCode;
  label: string;
  applicable_property_conditions: DouyinPropertyCondition[];
  applicable_decoration_tiers: DouyinDecorationTier[];
  applicable_decoration_scopes: DouyinDecorationScope[];
};

export type DouyinBudgetPublicConfig = {
  property_conditions: Array<{ value: DouyinPropertyCondition; label: string }>;
  decoration_tiers: Array<{ value: DouyinDecorationTier; label: string }>;
  decoration_scopes: Array<{ value: DouyinDecorationScope; label: string }>;
  options: DouyinBudgetPublicOption[];
  pricing_version: string;
  effective_from: string;
  effective_to: string | null;
  disclaimer: string;
};

export type DouyinBudgetEstimateRequest = {
  area: number;
  property_condition: DouyinPropertyCondition;
  decoration_tier: DouyinDecorationTier;
  decoration_scope: DouyinDecorationScope;
  layout?: string;
  style?: string;
  option_codes: DouyinBudgetOptionCode[];
  demand?: string;
};

export type DouyinBudgetEstimateCategory = {
  category_code: DouyinBudgetCategoryCode;
  label: string;
  minimum_amount: number;
  maximum_amount: number;
};

export type DouyinBudgetEstimateResult = {
  id: string;
  estimate_no: string;
  minimum_total: number;
  maximum_total: number;
  categories: DouyinBudgetEstimateCategory[];
  calculation_basis: string[];
  included_items: string[];
  excluded_items: string[];
  pricing_version: string;
  pricing_effective_from: string;
  pricing_effective_to: string | null;
  disclaimer: string;
  ai_status: DouyinBudgetAiStatus;
};

export type DouyinBudgetAiAnalysis = {
  summary: string;
  allocation_advice: string[];
  risk_factors: string[];
  onsite_questions: string[];
};

export type DouyinBudgetAiExplanationResponse = {
  estimate: DouyinBudgetEstimateResult;
  ai_analysis: DouyinBudgetAiAnalysis | null;
};

export type ServiceUnavailableCode =
  | "DOUYIN_INSTALLATION_MISSING"
  | "DOUYIN_INSTALLATION_DISABLED"
  | "DOUYIN_AUTHORIZATION_EXPIRED"
  | "DOUYIN_SESSION_EXCHANGE_FAILED"
  | "TENANT_NOT_AVAILABLE"
  | "NETWORK_ERROR";
