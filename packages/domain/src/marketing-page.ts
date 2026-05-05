export const MARKETING_PAGE_STATUS_VALUES = [
  'draft',
  'published',
  'offline',
  'archived',
] as const;

export type MarketingPageStatus =
  (typeof MARKETING_PAGE_STATUS_VALUES)[number];

export const MARKETING_PAGE_DISPLAY_SCENE_VALUES = [
  'all',
  'home',
  'customer_home',
  'project_detail',
  'marketing_list',
] as const;

export type MarketingPageDisplayScene =
  (typeof MARKETING_PAGE_DISPLAY_SCENE_VALUES)[number];

export const MARKETING_PAGE_VERSION_STATUS_VALUES = [
  'draft',
  'published',
  'archived',
] as const;

export type MarketingPageVersionStatus =
  (typeof MARKETING_PAGE_VERSION_STATUS_VALUES)[number];

export const MARKETING_PAGE_BLOCK_TYPE_VALUES = [
  'hero',
  'image',
  'text',
  'button',
  'image_text',
  'case_list',
  'countdown',
  'lead_form',
  'phone_cta',
  'floating_phone_cta',
  'footer',
] as const;

export type MarketingPageBlockType =
  (typeof MARKETING_PAGE_BLOCK_TYPE_VALUES)[number];

export const MARKETING_PAGE_EVENT_NAME_VALUES = [
  'page_view',
  'button_click',
  'phone_click',
  'form_submit',
] as const;

export type MarketingPageEventName =
  (typeof MARKETING_PAGE_EVENT_NAME_VALUES)[number];

export const MARKETING_LEAD_STATUS_VALUES = [
  'new',
  'contacted',
  'converted',
  'invalid',
] as const;

export type MarketingLeadStatus =
  (typeof MARKETING_LEAD_STATUS_VALUES)[number];

export interface MarketingPageStatusConfigItem {
  label: string;
  type: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export const MarketingPageStatusConfig: Record<
  MarketingPageStatus,
  MarketingPageStatusConfigItem
> = {
  draft: { label: '草稿', type: 'default' },
  published: { label: '已发布', type: 'success' },
  offline: { label: '已下线', type: 'warning' },
  archived: { label: '已归档', type: 'default' },
};

export const MarketingPageVersionStatusConfig: Record<
  MarketingPageVersionStatus,
  MarketingPageStatusConfigItem
> = {
  draft: { label: '草稿', type: 'default' },
  published: { label: '已发布', type: 'success' },
  archived: { label: '已归档', type: 'default' },
};

export const MarketingPageDisplaySceneConfig: Record<
  MarketingPageDisplayScene,
  { label: string }
> = {
  all: { label: '全部场景' },
  home: { label: '首页' },
  customer_home: { label: '客户首页' },
  project_detail: { label: '项目详情' },
  marketing_list: { label: '活动列表' },
};

export const MarketingLeadStatusConfig: Record<
  MarketingLeadStatus,
  MarketingPageStatusConfigItem
> = {
  new: { label: '新线索', type: 'primary' },
  contacted: { label: '已联系', type: 'warning' },
  converted: { label: '已转化', type: 'success' },
  invalid: { label: '无效', type: 'default' },
};

export const MarketingPageBlockTypeConfig: Record<
  MarketingPageBlockType,
  { label: string }
> = {
  hero: { label: '顶部 Banner' },
  image: { label: '图片' },
  text: { label: '文本' },
  button: { label: '按钮' },
  image_text: { label: '图文卡片' },
  case_list: { label: '案例列表' },
  countdown: { label: '倒计时' },
  lead_form: { label: '预约表单' },
  phone_cta: { label: '电话按钮' },
  floating_phone_cta: { label: '悬浮电话' },
  footer: { label: '底部信息' },
};

export const MarketingPageEventNameConfig: Record<
  MarketingPageEventName,
  { label: string }
> = {
  page_view: { label: '页面访问' },
  button_click: { label: '按钮点击' },
  phone_click: { label: '电话点击' },
  form_submit: { label: '表单提交' },
};

export const isMarketingPageStatus = (
  value: string | null | undefined,
): value is MarketingPageStatus =>
  typeof value === 'string' &&
  MARKETING_PAGE_STATUS_VALUES.includes(value as MarketingPageStatus);

export const isMarketingPageDisplayScene = (
  value: string | null | undefined,
): value is MarketingPageDisplayScene =>
  typeof value === 'string' &&
  MARKETING_PAGE_DISPLAY_SCENE_VALUES.includes(
    value as MarketingPageDisplayScene,
  );

export const isMarketingPageVersionStatus = (
  value: string | null | undefined,
): value is MarketingPageVersionStatus =>
  typeof value === 'string' &&
  MARKETING_PAGE_VERSION_STATUS_VALUES.includes(
    value as MarketingPageVersionStatus,
  );

export const isMarketingPageBlockType = (
  value: string | null | undefined,
): value is MarketingPageBlockType =>
  typeof value === 'string' &&
  MARKETING_PAGE_BLOCK_TYPE_VALUES.includes(
    value as MarketingPageBlockType,
  );

export const isMarketingPageEventName = (
  value: string | null | undefined,
): value is MarketingPageEventName =>
  typeof value === 'string' &&
  MARKETING_PAGE_EVENT_NAME_VALUES.includes(
    value as MarketingPageEventName,
  );

export const isMarketingLeadStatus = (
  value: string | null | undefined,
): value is MarketingLeadStatus =>
  typeof value === 'string' &&
  MARKETING_LEAD_STATUS_VALUES.includes(value as MarketingLeadStatus);
