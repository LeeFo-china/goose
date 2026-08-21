import { z } from 'zod';

import {
  EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES,
  TENANT_SERVICE_ACCESS_MODE_VALUES,
  type EmployeeServiceAccessStatus,
} from './platform-service-access';
import { PLATFORM_SERVICE_TRIAL_STATUS_VALUES } from './platform-service-trial';

export const ADMIN_SERVICE_ACCESS_ACTION_VALUES = [
  'enter_workspace',
  'enter_readonly_workspace',
  'view_trial',
  'apply_trial',
  'purchase_service',
  'contact_tenant_admin',
  'contact_platform',
  'refresh',
] as const;

export const AdminServiceAccessActionSchema = z.object({
  key: z.enum(ADMIN_SERVICE_ACCESS_ACTION_VALUES),
  label: z.string().trim().min(1).max(40),
}).strict();

export const AdminTenantServiceAccessSchema = z.object({
  accessStatus: z.enum(EMPLOYEE_SERVICE_ACCESS_STATUS_VALUES),
  accessMode: z.enum(TENANT_SERVICE_ACCESS_MODE_VALUES),
  accessLevel: z.enum(['read_write', 'read_only', 'none']),
  canEnterWorkspace: z.boolean(),
  readonly: z.boolean(),
  trialId: z.uuid().nullable(),
  trialStatus: z.enum(PLATFORM_SERVICE_TRIAL_STATUS_VALUES).nullable(),
  startsAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  evaluatedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(300),
  primaryAction: AdminServiceAccessActionSchema.nullable(),
  secondaryAction: AdminServiceAccessActionSchema.nullable(),
}).strict().superRefine((summary, context) => {
  const hasTrialId = summary.trialId !== null;
  const hasTrialStatus = summary.trialStatus !== null;
  if (hasTrialId !== hasTrialStatus) {
    context.addIssue({ code: 'custom', message: 'trial facts must be complete' });
  }

  const expectedTrialStatus = expectedTrialStatusFor(summary.accessStatus);
  if (expectedTrialStatus && summary.trialStatus !== expectedTrialStatus) {
    context.addIssue({ code: 'custom', message: 'trial status mismatch' });
  }
  if (summary.accessMode === 'trial' && summary.trialStatus !== 'active') {
    context.addIssue({ code: 'custom', message: 'trial access facts missing' });
  }
  if (summary.accessMode === 'grace'
    && summary.trialStatus !== 'grace_period') {
    context.addIssue({ code: 'custom', message: 'grace trial facts missing' });
  }

  if (summary.accessStatus === 'workspace_available') {
    if (!summary.canEnterWorkspace || summary.readonly
      || summary.accessLevel !== 'read_write'
      || !['paid', 'paid_onboarding', 'trial', 'legacy'].includes(
        summary.accessMode,
      )) {
      context.addIssue({ code: 'custom', message: 'workspace access invalid' });
    }
    return;
  }

  if (summary.accessStatus === 'grace_period') {
    if (!summary.canEnterWorkspace || !summary.readonly
      || summary.accessMode !== 'grace'
      || summary.accessLevel !== 'read_only') {
      context.addIssue({ code: 'custom', message: 'grace access invalid' });
    }
    return;
  }

  if (summary.canEnterWorkspace || summary.readonly
    || summary.accessLevel !== 'none') {
    context.addIssue({ code: 'custom', message: 'blocked access invalid' });
  }
  const expectedBlockedMode = summary.accessStatus === 'hard_blocked'
    ? 'hard_blocked'
    : 'service_blocked';
  if (summary.accessMode !== expectedBlockedMode) {
    context.addIssue({ code: 'custom', message: 'blocked access mode invalid' });
  }
});

export type AdminServiceAccessAction = z.infer<
  typeof AdminServiceAccessActionSchema
>;

export type AdminTenantServiceAccess = z.infer<
  typeof AdminTenantServiceAccessSchema
>;

function expectedTrialStatusFor(status: EmployeeServiceAccessStatus) {
  if (status === 'pending_review' || status === 'scheduled'
    || status === 'expired') return status;
  return status === 'grace_period' ? 'grace_period' : null;
}
