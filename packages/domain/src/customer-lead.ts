import type { PermissionCode } from './permission';

// Only integrated sources are accepted. Adding a channel also requires its
// ingestion, attribution and database constraints; unknown sources stay closed.
export const CUSTOMER_LEAD_SOURCE_VALUES = ['douyin_miniapp', 'h5'] as const;
export type CustomerLeadSource = (typeof CUSTOMER_LEAD_SOURCE_VALUES)[number];
export const CUSTOMER_LEAD_SOURCE_LABELS = {
  douyin_miniapp: '抖音小程序',
  h5: 'H5活动',
} as const satisfies Readonly<Record<CustomerLeadSource, string>>;

export const CUSTOMER_LEAD_STATUS_VALUES = [
  'new', 'contacted', 'converted', 'invalid',
] as const;
export type CustomerLeadStatus = (typeof CUSTOMER_LEAD_STATUS_VALUES)[number];
export const CUSTOMER_LEAD_ACTION_VALUES = [
  'assign', 'follow_up', 'convert', 'mark_invalid',
] as const;
export type CustomerLeadAction = (typeof CUSTOMER_LEAD_ACTION_VALUES)[number];
export const CUSTOMER_LEAD_FOLLOW_UP_TYPE_VALUES = [
  'phone', 'wechat', 'online_meeting', 'onsite', 'other',
] as const;
export type CustomerLeadFollowUpType =
  (typeof CUSTOMER_LEAD_FOLLOW_UP_TYPE_VALUES)[number];
export const CUSTOMER_LEAD_APPOINTMENT_STATUS_VALUES = [
  'pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid',
] as const;
export type CustomerLeadAppointmentStatus =
  (typeof CUSTOMER_LEAD_APPOINTMENT_STATUS_VALUES)[number];

export const CUSTOMER_LEAD_ACTION_PERMISSIONS = {
  assign: 'customer_lead.assign',
  follow_up: 'customer_lead.follow_up',
  convert: 'customer_lead.convert',
  mark_invalid: 'customer_lead.convert',
} as const satisfies Readonly<Record<CustomerLeadAction, PermissionCode>>;

export interface CustomerLeadPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}
export interface CustomerLeadPage<T> {
  readonly list: readonly T[];
  readonly pagination: CustomerLeadPagination;
}

// A lead permission must not implicitly grant access to the associated customer.
export type CustomerLeadCustomerLink =
  | { readonly customer_id: string; readonly can_view_customer: true }
  | { readonly customer_id: null; readonly can_view_customer: false };

export interface CustomerLeadAssigneeOption {
  readonly id: string;
  readonly name: string;
}
export interface CustomerLeadAssignee {
  readonly name: string | null;
  readonly avatar: string | null;
  readonly status: string | null;
}
export interface CustomerLeadBudget {
  readonly estimate_no: string;
  readonly minimum_total: number;
  readonly maximum_total: number;
  readonly ai_status: 'pending' | 'succeeded' | 'failed' | 'skipped' | null;
}
export interface CustomerLeadSourceContext {
  readonly h5?: {
    readonly page_id: string | null;
    readonly page_version_id: string | null;
    readonly page_title: string | null;
    readonly page_slug: string | null;
  };
  readonly demand: string | null;
  readonly attribution: Readonly<Partial<Record<
    'source_type' | 'entry_path' | 'scene' | 'campaign_code' | 'content_id', string
  >>>;
  readonly budget: CustomerLeadBudget | null;
  readonly ai: {
    readonly summary: string;
    readonly allocation_advice: readonly string[];
    readonly risk_factors: readonly string[];
    readonly onsite_questions: readonly string[];
  } | null;
}
export interface CustomerLeadAppointment {
  readonly id: string;
  readonly appointment_no: string;
  readonly preferred_visit_date: string;
  readonly preferred_visit_period: 'morning' | 'afternoon' | 'evening';
  readonly community: string;
  readonly status: CustomerLeadAppointmentStatus;
  readonly confirmed_visit_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
  readonly source_context: CustomerLeadSourceContext | null;
}

export type CustomerLeadSummary = CustomerLeadCustomerLink & {
  readonly id: string;
  readonly source: CustomerLeadSource;
  readonly source_label: string;
  readonly name: string | null;
  readonly phone_masked: string | null;
  readonly community: string | null;
  readonly status: CustomerLeadStatus;
  readonly version: number;
  readonly assigned_employee_id: string | null;
  readonly assignee: CustomerLeadAssignee | null;
  readonly created_at: string;
  readonly followed_at: string | null;
  readonly follow_remark: string | null;
};

export interface CustomerLeadFollowUp {
  readonly id: string;
  readonly appointment_id: string | null;
  readonly follow_up_type: CustomerLeadFollowUpType;
  readonly summary: string;
  readonly result: string;
  readonly next_follow_up_at: string | null;
  readonly created_at: string;
  readonly employee_name: string | null;
}
export type CustomerLeadActionAvailability =
  | { readonly enabled: true; readonly reason: null }
  | { readonly enabled: false; readonly reason: string };
export type CustomerLeadDetail = CustomerLeadSummary & {
  readonly source_context: CustomerLeadSourceContext | null;
  readonly latest_appointment: CustomerLeadAppointment | null;
  readonly appointments: CustomerLeadPage<CustomerLeadAppointment>;
  readonly follow_ups: CustomerLeadPage<CustomerLeadFollowUp>;
  readonly actions: Readonly<Record<CustomerLeadAction, CustomerLeadActionAvailability>>;
};
