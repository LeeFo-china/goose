import { describe, expect, test } from 'bun:test';
import { buildSettingsCommand, fenToYuan, yuanToFen } from './settings-form-data';

describe('customer rendering settings amount conversion', () => {
  test('converts exact decimal yuan to integer fen', () => {
    expect(yuanToFen('0.01')).toBe(1);
    expect(yuanToFen('1.23')).toBe(123);
    expect(yuanToFen('1000000')).toBe(100000000);
    expect(fenToYuan(123)).toBe('1.23');
    expect(fenToYuan(null)).toBe('');
  });

  test('rejects ambiguous or out-of-range amounts', () => {
    for (const value of ['0', '0.001', '1e2', '-1', '01.23', '1000000.01', 'NaN', '']) {
      expect(yuanToFen(value)).toBeNull();
    }
  });
});

test('settings command preserves server version and requires an auditable bounded budget', () => {
  const valid = {
    enabled: true, dailyTaskLimit: '2', dailyBudgetYuan: '1.20',
    perJobReserveYuan: '0.60', reason: '  河南试点开通  ',
  };
  expect(buildSettingsCommand(valid, 0)).toEqual({ ok: true, command: {
    enabled: true, daily_task_limit: 2, daily_budget_fen: 120,
    per_job_reserve_fen: 60, expected_version: 0, reason: '河南试点开通',
  } });
  const invalid = buildSettingsCommand({ ...valid, dailyTaskLimit: '10001',
    dailyBudgetYuan: '0.50', reason: 'x' }, 4);
  expect(invalid.ok).toBe(false);
  if (!invalid.ok) {
    expect(invalid.errors.dailyTaskLimit).toBeTruthy();
    expect(invalid.errors.perJobReserveYuan).toBeTruthy();
    expect(invalid.errors.reason).toBeTruthy();
  }
});
