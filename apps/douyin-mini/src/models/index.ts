export const DOUYIN_ENTRY_PATHS = [
  "pages/home/index",
  "pages/company/index",
  "pages/privacy/index",
  "pages/cases/index",
  "pages/case-detail/index",
  "pages/sites/index",
  "pages/site-detail/index",
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
  company: {
    name: string;
    logo_url: string | null;
    summary: string | null;
    service_phone: string;
  };
  theme: { primary_color: string; navigation_text_color: "black" | "white" };
  features: Record<string, boolean | string>;
  content: Record<string, unknown>;
  privacy_policy_version: string;
};

export type ServiceUnavailableCode =
  | "DOUYIN_INSTALLATION_MISSING"
  | "DOUYIN_INSTALLATION_DISABLED"
  | "DOUYIN_AUTHORIZATION_EXPIRED"
  | "DOUYIN_SESSION_EXCHANGE_FAILED"
  | "TENANT_NOT_AVAILABLE"
  | "NETWORK_ERROR";
