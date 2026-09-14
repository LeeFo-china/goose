import { expect, test } from 'bun:test';
import { CustomerRenderingSettingsUpdateSchema } from './platform-customer-rendering-settings';

const valid = {
  enabled: false,
  daily_task_limit: 2,
  daily_budget_fen: 200,
  per_job_reserve_fen: 100,
  expected_version: 0,
  reason: '测试租户试点准备',
};

test('pilot settings require explicit switch, bounded budget and version', () => {
  expect(CustomerRenderingSettingsUpdateSchema.parse(valid)).toEqual(valid);
  for (const invalid of [
    { ...valid, enabled: undefined },
    { ...valid, enabled: true, per_job_reserve_fen: 201 },
    { ...valid, daily_task_limit: 0 },
    { ...valid, daily_budget_fen: 100000001 },
    { ...valid, expected_version: -1 },
    { ...valid, expected_version: 2147483647 },
    { ...valid, reason: '' },
    { ...valid, operator_employee_id: 'forged' },
  ]) expect(CustomerRenderingSettingsUpdateSchema.safeParse(invalid).success).toBe(false);
});
