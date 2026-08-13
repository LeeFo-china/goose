import type {
  PlatformServiceTrialCapability,
  PlatformServiceTrialScopeV1,
  PlatformServiceTrialSource,
  PlatformServiceTrialStatus,
  PlatformServiceTrialType,
  ServiceTrialFollowUpStatus,
  ServiceTrialFollowUpType,
} from "@gooes/domain";

import type { PageData } from "@/components/platform-service-orders/platform-service-order-types";

export type {
  PlatformServiceTrialCapability,
  PlatformServiceTrialScopeV1,
  PlatformServiceTrialSource,
  PlatformServiceTrialStatus,
  PlatformServiceTrialType,
  ServiceTrialFollowUpStatus,
  ServiceTrialFollowUpType,
};

export type PlatformServiceTrialAction = {
  enabled: boolean;
  disabled_reason: string | null;
};

export type PlatformServiceTrialAvailableActions = {
  withdraw?: PlatformServiceTrialAction;
  review?: PlatformServiceTrialAction;
  extend?: PlatformServiceTrialAction;
  revoke?: PlatformServiceTrialAction;
  assign?: PlatformServiceTrialAction;
  purchase?: PlatformServiceTrialAction;
};

export type PlatformServiceTrialActionKey = keyof PlatformServiceTrialAvailableActions;

export type PlatformServiceTrialTenant = {
  id: string;
  name: string;
  slug: string;
  contact_name: string | null;
  contact_phone: string | null;
};

export type PlatformServiceTrialAssignee = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
};

export type PlatformServiceTrialAssigneeCandidateRole = {
  code: string;
  name: string | null;
};

export type PlatformServiceTrialAssigneeCandidate = {
  id: string;
  name: string | null;
  phone_masked: string | null;
  status: "active" | "suspended" | "leaved" | "pending";
  roles: PlatformServiceTrialAssigneeCandidateRole[];
  selectable: boolean;
  historical: boolean;
};

export type PlatformServiceTrialAssigneeCandidatePage = {
  list: PlatformServiceTrialAssigneeCandidate[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PlatformServiceTrialEvent = {
  id: string;
  event_type: string;
  from_status: PlatformServiceTrialStatus | null;
  to_status: PlatformServiceTrialStatus | null;
  reason: string | null;
  occurred_at: string;
};

export type PlatformServiceTrialRecord = {
  id: string;
  tenant_id: string;
  source: PlatformServiceTrialSource;
  trial_type: PlatformServiceTrialType;
  status: PlatformServiceTrialStatus;
  persisted_status: PlatformServiceTrialStatus;
  application_reason: string | null;
  expected_user_count: number | null;
  expected_project_count: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  grant_reason: string | null;
  review_decision: "approved" | "rejected" | null;
  review_reason: string | null;
  revoke_reason: string | null;
  withdraw_reason: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  granted_at: string | null;
  starts_at: string | null;
  activated_at: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  withdrawn_at: string | null;
  revoked_at: string | null;
  converted_at: string | null;
  converted_order_id: string | null;
  assignee_employee_id: string | null;
  scope: PlatformServiceTrialScopeV1;
  extension_count: number;
  version: number;
  created_at: string;
  updated_at: string;
  tenant: PlatformServiceTrialTenant;
  assignee: PlatformServiceTrialAssignee | null;
};

export type PlatformServiceTrialListItem = PlatformServiceTrialRecord & {
  available_actions: PlatformServiceTrialAvailableActions;
};

export type PlatformServiceTrialDetailItem = PlatformServiceTrialRecord & {
  events: PlatformServiceTrialEvent[];
};

export type PlatformServiceTrialListData = PageData<PlatformServiceTrialListItem> & {
  server_time: string;
};

export type PlatformServiceTrialSummary = {
  pending_review_count: number;
  scheduled_count: number;
  current_active_count: number;
  expiring_within_7_days_count: number;
  month_new_count: number;
  month_approved_count: number;
  month_converted_count: number;
  application_approval_rate: number;
  activated_cohort_conversion_rate: number;
  server_time: string;
};

export type PlatformServiceTrialDetailData = {
  trial: PlatformServiceTrialDetailItem;
  available_actions: PlatformServiceTrialAvailableActions;
  server_time: string;
};

export type PlatformServiceTrialFollowUp = {
  id: string;
  trial_id: string;
  tenant_id: string;
  follow_up_type: ServiceTrialFollowUpType;
  status: ServiceTrialFollowUpStatus;
  summary: string;
  result: string;
  next_follow_up_at: string | null;
  created_by_employee_id: string;
  created_at: string;
  idempotent?: boolean;
};

export type PlatformServiceTrialFollowUpPage = PageData<
  PlatformServiceTrialFollowUp
>;

export type PlatformServiceTrialPolicy = {
  id: string;
  trial_days: number;
  grace_days: number;
  reminder_days: number[];
  max_trial_days: number;
  max_grace_days: number;
  max_schedule_days: number;
  max_extension_count: number;
  max_extension_days: number;
  reapply_cooldown_days: number;
  allow_repeat: boolean;
  standard_scope: PlatformServiceTrialScopeV1;
  guided_scope: PlatformServiceTrialScopeV1;
  version: number;
  change_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformServiceTrialPolicyData = {
  policy: PlatformServiceTrialPolicy;
  available_actions: {
    update_policy: PlatformServiceTrialAction;
  };
  server_time: string;
};
