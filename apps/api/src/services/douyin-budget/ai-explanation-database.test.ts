import { describe, expect, test } from 'bun:test';

import {
  DOUYIN_BUDGET_AI_DATABASE_SCENARIOS,
  parseLocalDouyinBudgetDatabaseUrl,
  runDouyinBudgetAiDatabaseIntegration,
} from './ai-explanation-database.test-helper';

const runLocalIntegration = process.env.DOUYIN_BUDGET_DB_INTEGRATION === '1'
  ? test
  : test.skip;

describe('douyin budget AI local PostgreSQL integration', () => {
  test('accepts only the fixed local Supabase database boundary', () => {
    expect(parseLocalDouyinBudgetDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
    expect(parseLocalDouyinBudgetDatabaseUrl(
      'postgresql://postgres:postgres@localhost:54322/postgres',
    )).toEqual({
      ok: true,
      databaseUrl: 'postgresql://postgres:postgres@localhost:54322/postgres',
    });
    for (const unsafe of [
      'postgresql://postgres:secret@db.example.com:5432/postgres',
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      'postgresql://postgres:postgres@127.0.0.1:54322/other',
      'https://127.0.0.1:54322/postgres',
    ]) {
      expect(parseLocalDouyinBudgetDatabaseUrl(unsafe)).toEqual({ ok: false });
    }
  });

  test('keeps the real database proof surface complete and bounded', () => {
    expect(DOUYIN_BUDGET_AI_DATABASE_SCENARIOS).toEqual([
      'concurrent_single_claim',
      'live_processing_saved',
      'stale_reclaim',
      'attempt_three_exhausted',
      'failed_retry',
      'stale_completion_noop',
      'stale_failure_noop',
      'correct_completion',
      'correct_failure',
      'trigger_enforced',
      'acl_enforced',
      'fixture_cleanup',
    ]);
  });

  runLocalIntegration('proves the lease state machine with real transactions', async () => {
    const summary = await runDouyinBudgetAiDatabaseIntegration();
    for (const scenario of DOUYIN_BUDGET_AI_DATABASE_SCENARIOS) {
      expect(summary[scenario]).toBe(true);
    }
  }, 30_000);
});
