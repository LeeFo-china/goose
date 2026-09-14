import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL(
  '../../../../../supabase/migrations/20260914191000_customer_rendering_ark_safety.sql', import.meta.url,
), 'utf8').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();

test('ready means normalized input, not a forged CI approval', () => {
  expect(sql).toContain("status IN ('issued', 'processing', 'pending_review', 'approved', 'ready', 'rejected', 'failed', 'deleted')");
  expect(sql).toContain("status IN ('pending_review', 'approved')");
  expect(sql).toContain("SET status = 'ready', review_due_at = NULL");
  expect(sql).toContain("normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL");
  expect(sql).not.toContain("review_decision = 'approved' AND input.normalized_object_key");
});

test('job success and operator reconciliation require a durable Ark result without COS review', () => {
  expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalize_customer_rendering_job(');
  expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reconcile_customer_rendering_job(');
  expect(sql).toContain("v_job.provider_state <> 'response_received'");
  expect(sql).toContain('v_job.result_sha256 IS NULL');
  expect(sql).not.toContain("v_job.output_review_decision IS DISTINCT FROM 'approved'");
  expect(sql).toMatch(/^BEGIN;.*COMMIT;$/);
});
