export type UsageTab = "summary" | "ai" | "sms" | "social_video";

export const statusOptions = [
  { value: "__all", label: "全部状态" },
  { value: "success", label: "成功" },
  { value: "failure", label: "失败" },
] as const;

export const smsStatusOptions = [
  ...statusOptions,
  { value: "mock", label: "模拟发送" },
  { value: "disabled", label: "服务禁用" },
] as const;

export const socialVideoStatusOptions = [
  { value: "__all", label: "全部状态" },
  { value: "completed", label: "完成" },
  { value: "failed", label: "失败" },
  { value: "pending", label: "排队" },
  { value: "resolving", label: "解析中" },
  { value: "downloading", label: "下载中" },
  { value: "extracting_audio", label: "提取音频" },
  { value: "creating_asr_task", label: "创建识别" },
  { value: "transcribing", label: "识别中" },
] as const;

export const socialVideoBillableOptions = [
  { value: "__all", label: "全部计费" },
  { value: "true", label: "计费" },
  { value: "false", label: "不计费" },
] as const;

export function buildUsageHref(input: {
  basePath: string;
  tab?: UsageTab;
  page?: number;
  pageSize?: number;
  aiPage?: number;
  aiPageSize?: number;
  smsPage?: number;
  smsPageSize?: number;
  socialVideoPage?: number;
  socialVideoPageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  tenantId?: string;
  aiStatus?: string;
  smsStatus?: string;
  socialVideoStatus?: string;
  socialVideoBillable?: string;
}) {
  const params = new URLSearchParams();
  if (input.tab && input.tab !== "summary") params.set("tab", input.tab);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.aiPage && input.aiPage > 1) params.set("aiPage", String(input.aiPage));
  if (input.aiPageSize) params.set("aiPageSize", String(input.aiPageSize));
  if (input.smsPage && input.smsPage > 1) params.set("smsPage", String(input.smsPage));
  if (input.smsPageSize) params.set("smsPageSize", String(input.smsPageSize));
  if (input.socialVideoPage && input.socialVideoPage > 1) params.set("socialVideoPage", String(input.socialVideoPage));
  if (input.socialVideoPageSize) params.set("socialVideoPageSize", String(input.socialVideoPageSize));
  if (input.dateFrom) params.set("date_from", input.dateFrom);
  if (input.dateTo) params.set("date_to", input.dateTo);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.tenantId) params.set("tenant_id", input.tenantId);
  if (input.aiStatus && input.aiStatus !== "__all") params.set("ai_status", input.aiStatus);
  if (input.smsStatus && input.smsStatus !== "__all") params.set("sms_status", input.smsStatus);
  if (input.socialVideoStatus && input.socialVideoStatus !== "__all") {
    params.set("social_video_status", input.socialVideoStatus);
  }
  if (input.socialVideoBillable && input.socialVideoBillable !== "__all") {
    params.set("social_video_billable", input.socialVideoBillable);
  }
  const query = params.toString();
  return query ? `${input.basePath}?${query}` : input.basePath;
}
