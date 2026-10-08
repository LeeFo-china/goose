import { describe, expect, test } from 'bun:test';
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE, type PlatformServiceTrialScopeV1 } from '@gooes/domain';
import * as schemas from './service-trials';
import { CreatePlatformTenantSchema } from './platform-tenants';

const scope: PlatformServiceTrialScopeV1 = { version: 1, capabilities: ['core.projects'] };
const command = {
  scope, expected_version: 2, reason: '调整业务范围',
  idempotency_key: '55555555-5555-4555-8555-555555555555',
};
const tenant = { name: '试用装企', slug: 'trial-company' };
const trial = {
  enabled: true as const, trial_days: 30, reason: command.reason,
  idempotency_key: command.idempotency_key,
};

describe('service trial scope contracts', () => {
  test('accepts all thirteen shared capabilities in updates and manual creation', () => {
    const scope = PLATFORM_SERVICE_TRIAL_FULL_SCOPE;
    expect(scope.capabilities).toHaveLength(13);
    expect(schemas.PlatformServiceTrialUpdateScopeSchema.parse({ ...command, scope }).scope)
      .toEqual(scope);
    expect(CreatePlatformTenantSchema.parse({ ...tenant, trial: { ...trial, scope } }).trial)
      .toEqual({ ...trial, scope });
  });

  test('accepts the versioned scope command and trims its reason', () => {
    expect(schemas.PlatformServiceTrialUpdateScopeSchema).toBeDefined();
    expect(schemas.PlatformServiceTrialUpdateScopeSchema.parse({
      ...command, reason: ` ${command.reason} `,
    })).toEqual(command);
  });

  test.each([
    { scope: undefined }, { scope: null },
    { scope: { version: 2, capabilities: ['core.projects'] } },
    { scope: { version: 1, capabilities: [] } },
    { scope: { version: 1, capabilities: ['*'] } },
    { scope: { version: 1, capabilities: ['core.projects', 'core.projects'] } },
    { reason: ' ' }, { reason: 'a'.repeat(501) },
    { expected_version: 0 }, { expected_version: 1.5 },
    { expected_version: '2' }, { idempotency_key: 'not-a-uuid' },
    { idempotency_key: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' },
    { trial_days: 365 }, { allow_override: true }, { actor_employee_id: 'spoof' },
  ])('rejects invalid or extraneous command fields %j', (patch) => {
    expect(schemas.PlatformServiceTrialUpdateScopeSchema).toBeDefined();
    expect(schemas.PlatformServiceTrialUpdateScopeSchema.safeParse({
      ...command, ...patch,
    }).success).toBe(false);
  });

  test('preserves explicit scope and leaves legacy trial input unchanged', () => {
    expect(CreatePlatformTenantSchema.parse({ ...tenant, trial: { ...trial, scope } }).trial)
      .toEqual({ ...trial, scope });
    expect(CreatePlatformTenantSchema.parse({ ...tenant, trial }).trial).toEqual(trial);
    expect(CreatePlatformTenantSchema.parse(tenant)).not.toHaveProperty('trial');
  });

  test.each([
    { enabled: false, scope }, { ...trial, scope: null },
    { ...trial, scope: { version: 1, capabilities: ['unknown'] } },
    { ...trial, scope: { ...scope, capabilities: [] } },
    { ...trial, scope: { ...scope, extra: true } },
  ])('rejects invalid creation scope %j', (invalidTrial) => {
    expect(CreatePlatformTenantSchema.safeParse({ ...tenant, trial: invalidTrial }).success)
      .toBe(false);
  });
});
