import type {
  H5MarketingLeadStatus,
  H5MarketingPageDisplayScene,
  H5MarketingPageStatus,
  MarketingCampaignStatus,
  MarketingCampaignType,
  MarketingCampaignTargetScopeType,
} from "@/components/marketing/marketing-types";

export const campaignTypeOptions = [
  ["share_assist", "分享助力"],
  ["appointment_reward", "预约奖励"],
] as const satisfies readonly (readonly [MarketingCampaignType, string])[];

export const campaignStatusOptions = [
  ["draft", "草稿"],
  ["active", "进行中"],
  ["paused", "已暂停"],
  ["closed", "已关闭"],
] as const satisfies readonly (readonly [MarketingCampaignStatus, string])[];

export const targetScopeOptions = [
  ["all_projects", "全部项目"],
  ["project_list", "指定项目"],
] as const satisfies readonly (readonly [MarketingCampaignTargetScopeType, string])[];

export const h5PageStatusOptions = [
  ["draft", "草稿"],
  ["published", "已发布"],
  ["offline", "已下线"],
  ["archived", "已归档"],
] as const satisfies readonly (readonly [H5MarketingPageStatus, string])[];

export const h5PageDisplaySceneOptions = [
  ["all", "全部场景"],
  ["home", "首页"],
  ["customer_home", "客户首页"],
  ["project_detail", "项目详情"],
  ["marketing_list", "活动列表"],
] as const satisfies readonly (readonly [H5MarketingPageDisplayScene, string])[];

export const h5MarketingLeadStatusOptions = [
  ["new", "新线索"],
  ["contacted", "已联系"],
  ["converted", "已转化"],
  ["invalid", "无效"],
] as const satisfies readonly (readonly [H5MarketingLeadStatus, string])[];
