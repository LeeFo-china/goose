export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type UsageRange = {
  date_from: string;
  date_to: string;
};

export type UsageAiSummary = {
  call_count: number;
  success_count: number;
  failure_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  missing_token_count: number;
  status_counts?: Record<string, number>;
  scene_counts?: Record<string, number>;
  provider_counts?: Record<string, number>;
  model_counts?: Record<string, number>;
};

export type UsageSmsSummary = {
  send_count: number;
  success_count: number;
  failure_count: number;
  mock_count: number;
  disabled_count: number;
  status_counts?: Record<string, number>;
  provider_counts?: Record<string, number>;
  channel_mode_counts?: Record<string, number>;
  purpose_counts?: Record<string, number>;
};

export type UsageSocialVideoSummary = {
  transcription_count: number;
  billable_transcription_count: number;
  success_count: number;
  failure_count: number;
  duration_seconds: number;
  billable_minutes: number;
  missing_duration_count: number;
  status_counts?: Record<string, number>;
  provider_counts?: Record<string, number>;
};

export type UsageTenant = {
  id: string;
  name: string | null;
  slug: string | null;
  status?: string | null;
};

export type PlatformTenantUsageItem = {
  tenant: UsageTenant;
  ai: UsageAiSummary;
  sms: UsageSmsSummary;
  social_video: UsageSocialVideoSummary;
};

export type PlatformTenantUsageData = {
  range: UsageRange;
  list: PlatformTenantUsageItem[];
  pagination: Pagination;
};

export type TenantUsageSummaryData = {
  range: UsageRange;
  tenant: UsageTenant;
  ai: UsageAiSummary;
  sms: UsageSmsSummary;
  social_video: UsageSocialVideoSummary;
};

export type UsageAiLogRecord = {
  id: string;
  tenant_id: string | null;
  scene_code: string;
  provider_code: string | null;
  model_code: string | null;
  model_name: string | null;
  status: "success" | "failure";
  request_id: string | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  error_code: string | null;
  error_message: string | null;
  source: string | null;
  billable: boolean | null;
  created_at: string | null;
};

export type UsageSmsLogRecord = {
  id: string;
  tenant_id: string | null;
  provider: string;
  channel_mode: string | null;
  purpose: string;
  template_code: string | null;
  phone_masked: string;
  status: "success" | "failure" | "mock" | "disabled";
  request_id: string | null;
  provider_code: string | null;
  provider_message: string | null;
  error_code: string | null;
  error_message: string | null;
  sms_count: number;
  duration_ms: number | null;
  created_at: string | null;
};

export type UsageSocialVideoLogRecord = {
  id: string;
  tenant_id: string | null;
  platform: "douyin";
  source_url: string;
  status:
    | "pending"
    | "resolving"
    | "downloading"
    | "extracting_audio"
    | "creating_asr_task"
    | "transcribing"
    | "completed"
    | "failed";
  provider: string | null;
  audio_duration_seconds: number | null;
  billable: boolean | null;
  billing_duration_seconds: number | null;
  billing_minutes: number | null;
  billing_source: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  completed_at: string | null;
};

export type UsageLogListData<T> = {
  list: T[];
  pagination: Pagination;
};
