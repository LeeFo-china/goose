export const TENANT_ACTIVITY_CHANNEL_VALUES = ['admin_web', 'wechat_mini'] as const;
export type TenantActivityChannel = (typeof TENANT_ACTIVITY_CHANNEL_VALUES)[number];

export const TENANT_ACTIVITY_KIND_VALUES = [
  'view', 'login', 'customer_created', 'follow_up_created', 'project_created',
  'construction_log_created', 'acceptance_handled',
] as const;
export type TenantActivityKind = (typeof TENANT_ACTIVITY_KIND_VALUES)[number];

export interface TenantActivityBusinessActions {
  customer_created: number;
  follow_up_created: number;
  project_created: number;
  construction_log_created: number;
  acceptance_handled: number;
}

/** Optional on tenant list/detail records; null metrics never mean observed zero. */
export interface TenantActivitySummary {
  status: 'collecting' | 'ready' | 'unavailable';
  collection_started_at: string | null;
  window_start: string | null;
  window_end: string | null;
  observed_days: number;
  last_active_at: string | null;
  active_employee_count: number | null;
  admin_active_employee_count: number | null;
  mini_active_employee_count: number | null;
  active_days: number | null;
  admin_login_count: number | null;
  mini_login_count: number | null;
  business_actions: TenantActivityBusinessActions | null;
}
