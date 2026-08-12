import { z } from 'zod';
import { PLATFORM_SERVICE_TRIAL_STATUS_VALUES } from './platform-service-trial';

export const TENANT_SERVICE_ACCESS_MODE_VALUES = [
  'paid',
  'paid_onboarding',
  'trial',
  'grace',
  'legacy',
  'service_blocked',
  'hard_blocked',
] as const;

export const TENANT_SERVICE_ROUTE_ACCESS_VALUES = [
  'session',
  'recovery',
  'read',
  'write',
  'public_or_callback',
] as const;

export type TenantServiceAccessMode =
  (typeof TENANT_SERVICE_ACCESS_MODE_VALUES)[number];

export type TenantServiceRouteAccess =
  (typeof TENANT_SERVICE_ROUTE_ACCESS_VALUES)[number];

export type TenantServiceAccessLevel = 'read_write' | 'read_only' | 'none';

export const EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES = [
  'workspace_available',
  'pending_review',
  'scheduled',
  'grace_period',
  'expired',
  'service_blocked',
  'hard_blocked',
] as const;

export const EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES = [
  'enter_workspace',
  'enter_readonly_workspace',
  'view_trial',
  'apply_trial',
  'purchase_service',
  'contact_platform',
  'refresh',
] as const;

export type EmployeeServiceAccessStatus =
  (typeof EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES)[number];

export type EmployeeServiceAccessActionKey =
  (typeof EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES)[number];

export const EmployeeServiceAccessActionSchema = z.object({
  key: z.enum(EMPLOYEE_SERVICE_ACCESS_ACTION_VALUES),
  label: z.string().trim().min(1).max(40),
  path: z.string().trim().min(1).max(300).nullable(),
}).strict();

export const EmployeeServiceAccessSummarySchema = z.object({
  can_enter_workspace: z.boolean(),
  readonly: z.boolean(),
  access_mode: z.enum(TENANT_SERVICE_ACCESS_MODE_VALUES),
  access_level: z.enum(['read_write', 'read_only', 'none']),
  access_status: z.enum(EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES),
  trial_id: z.uuid().nullable(),
  trial_status: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).nullable(),
  starts_at: z.iso.datetime({ offset: true }).nullable(),
  ends_at: z.iso.datetime({ offset: true }).nullable(),
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  primary_action: EmployeeServiceAccessActionSchema.nullable(),
  secondary_action: EmployeeServiceAccessActionSchema.nullable(),
  evaluated_at: z.iso.datetime({ offset: true }),
}).strict().superRefine((summary, context) => {
  const hasTrialId = summary.trial_id !== null;
  const hasTrialStatus = summary.trial_status !== null;
  if (hasTrialId !== hasTrialStatus) {
    context.addIssue({ code: 'custom', message: 'trial facts must be complete' });
  }

  if (summary.access_status === 'workspace_available') {
    if (!summary.can_enter_workspace || summary.readonly
      || summary.access_level !== 'read_write') {
      context.addIssue({ code: 'custom', message: 'workspace access invalid' });
    }
    return;
  }

  if (summary.access_status === 'grace_period') {
    if (!summary.can_enter_workspace || !summary.readonly
      || summary.access_mode !== 'grace'
      || summary.access_level !== 'read_only') {
      context.addIssue({ code: 'custom', message: 'grace access invalid' });
    }
    return;
  }

  if (summary.can_enter_workspace || summary.readonly
    || summary.access_level !== 'none') {
    context.addIssue({ code: 'custom', message: 'blocked access invalid' });
  }
  if (summary.access_status === 'hard_blocked'
    && summary.access_mode !== 'hard_blocked') {
    context.addIssue({ code: 'custom', message: 'hard block mode invalid' });
  }
});

export type EmployeeServiceAccessAction = z.infer<
  typeof EmployeeServiceAccessActionSchema
>;

export type EmployeeServiceAccessSummary = z.infer<
  typeof EmployeeServiceAccessSummarySchema
>;
