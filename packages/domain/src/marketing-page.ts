export const MARKETING_PAGE_STATUS_VALUES = [
  'draft',
  'published',
  'offline',
  'archived',
] as const;

export type MarketingPageStatus =
  (typeof MARKETING_PAGE_STATUS_VALUES)[number];

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
