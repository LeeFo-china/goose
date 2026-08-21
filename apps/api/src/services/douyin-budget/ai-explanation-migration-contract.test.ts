import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

const migrationsDirectory = new URL(
  '../../../../../supabase/migrations/',
  import.meta.url,
);
const stateMachineMigration = new URL(
  '20260821103000_create_douyin_budget_ai_state_machine.sql',
  migrationsDirectory,
);
const sceneMigration = new URL(
  '20260821103100_seed_douyin_budget_ai_route.sql',
  migrationsDirectory,
);
const primaryBindingMigration = new URL(
  '20260821103150_bind_douyin_budget_ai_primary_model.sql',
  migrationsDirectory,
);
const fallbackRepairMigration = new URL(
  '20260821103200_remove_douyin_budget_ai_fallback.sql',
  migrationsDirectory,
);

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function definition(source: string, functionName: string): string {
  return compact(
    source.match(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$function\\$;`,
      ),
    )?.[0] ?? '',
  );
}

describe('douyin budget AI state machine migration', () => {
  test('does not rewrite any already-applied budget migration', async () => {
    const hashes = new Map([
      [
        '20260821100000_create_douyin_budget_estimates.sql',
        'eb48541bd898a574f140b593d9458b6684474af17b5115df71d11a864ce15980',
      ],
      [
        '20260821101000_fix_douyin_budget_estimate_ownership.sql',
        'a4a9f8cc944b3621202684f3b05245e01dafc84c139c1644c357bb566497e525',
      ],
      [
        '20260821102000_create_douyin_budget_estimate_command.sql',
        'c7cef16093948b334c62c83f6a32d9d6d3ffcd65ce4cf4adce2da5575442cae1',
      ],
      [
        '20260821102100_restrict_douyin_budget_estimate_inserts.sql',
        '4f2de46df739320d43d364ba323ab8020c3b99328da686cc67fdb672a5c931a1',
      ],
      [
        '20260821102200_order_douyin_budget_rate_locks.sql',
        '3a7f817f339bf7c393723e4e84ba1d50579342ef8b1a1f965f32df9d84eef5e1',
      ],
      [
        '20260821103000_create_douyin_budget_ai_state_machine.sql',
        '60de1072071be59048a973db39484f1ea722a703007e4cb797d9df6ecd93d4ff',
      ],
      [
        '20260821103100_seed_douyin_budget_ai_route.sql',
        'a83177f0603509b300c3e326d14010ff183bfd4ee2e1a7ecbd8f29f50ae8620d',
      ],
      [
        '20260821103150_bind_douyin_budget_ai_primary_model.sql',
        '1a2180514751814f5989b6af6fe5cd32c4d2709c4a3131bf78e48254a8568219',
      ],
      [
        '20260821103200_remove_douyin_budget_ai_fallback.sql',
        '99d1896ec5d9238bf4ae5d0f975e40b1f8120d1e829cffbad8f70e5f59f79fd8',
      ],
    ]);
    for (const [name, expectedHash] of hashes) {
      const contents = await Bun.file(new URL(name, migrationsDirectory)).text();
      expect(createHash('sha256').update(contents).digest('hex')).toBe(
        expectedHash,
      );
    }
  });

  test('defines three exact security-definer RPCs with row locks and full scope', async () => {
    const source = await Bun.file(stateMachineMigration).text();
    for (const name of [
      'claim_douyin_budget_ai_analysis',
      'complete_douyin_budget_ai_analysis',
      'fail_douyin_budget_ai_analysis',
    ]) {
      const fn = definition(source, name);
      expect(fn).toContain('returns jsonb language plpgsql security definer');
      expect(fn).toContain('set search_path = pg_catalog, public');
      expect(fn).toContain('from public.douyin_budget_estimates as estimate');
      expect(fn).toContain('for update');
      expect(fn).toContain('estimate.id = p_estimate_id');
      expect(fn).toContain('estimate.tenant_id = p_tenant_id');
      expect(fn).toContain(
        'estimate.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id',
      );
      expect(fn).toContain('estimate.subject_hash = p_subject_hash');
      expect(fn).toContain("'code', 'douyin_budget_estimate_not_found'");
      expect(fn).toContain("'code', 'douyin_budget_estimate_expired'");
    }
  });

  test('claims, reclaims and exhausts attempts atomically under the row lock', async () => {
    const source = await Bun.file(stateMachineMigration).text();
    const fn = definition(source, 'claim_douyin_budget_ai_analysis');
    expect(fn).toContain("v_estimate.ai_status = 'pending'");
    expect(fn).toContain('v_estimate.ai_claimed_at is null');
    expect(fn).toContain("v_now - interval '60 seconds'");
    expect(fn).toContain('v_estimate.ai_attempt_count < 3');
    expect(fn).toContain('ai_attempt_count = ai_attempt_count + 1');
    expect(fn).toContain("ai_status = 'failed'");
    expect(fn).toContain("ai_last_error_code = 'douyin_budget_ai_attempts_exhausted'");
    expect(fn).toContain("v_estimate.ai_status = 'failed' and p_retry");
    expect(fn).toContain("v_estimate.ai_status = 'skipped'");
    expect(fn).toContain("v_action := 'claimed'");
    expect(fn).toContain("v_action text := 'saved'");
    expect(fn).toContain("'action', v_action");
    expect(fn).toContain("'attempt_count', v_estimate.ai_attempt_count");
    expect(fn).toContain("'claimed_at', v_estimate.ai_claimed_at");
  });

  test('uses the exact database lease for complete/fail and no-ops stale workers', async () => {
    const source = await Bun.file(stateMachineMigration).text();
    for (const name of [
      'complete_douyin_budget_ai_analysis',
      'fail_douyin_budget_ai_analysis',
    ]) {
      const fn = definition(source, name);
      expect(fn).toContain("v_estimate.ai_status = 'pending'");
      expect(fn).toContain('v_estimate.ai_attempt_count = p_attempt_count');
      expect(fn).toContain('v_estimate.ai_claimed_at = p_claimed_at');
      expect(fn).toContain('select estimate.* into v_estimate');
      expect(fn).not.toContain('raise exception');
    }
    const complete = definition(source, 'complete_douyin_budget_ai_analysis');
    expect(complete).toContain("ai_status = 'succeeded'");
    expect(complete).toContain('ai_analysis = p_ai_analysis');
    expect(complete).toContain('ai_provider = p_ai_provider');
    expect(complete).toContain('ai_model = p_ai_model');
    const fail = definition(source, 'fail_douyin_budget_ai_analysis');
    expect(fail).toContain("ai_status = 'failed'");
    expect(fail).toContain('ai_last_error_code = p_error_code');
  });

  test('removes direct estimate UPDATE and exposes RPCs only to service_role', async () => {
    const source = await Bun.file(stateMachineMigration).text();
    const sql = compact(source);
    expect(source.startsWith('-- Rollback: forward-only.')).toBe(true);
    expect(sql).toMatch(/^begin; set local lock_timeout = '5s';/);
    expect(sql).toMatch(/commit;$/);
    expect(sql).toContain(
      'revoke update on table public.douyin_budget_estimates from service_role',
    );
    for (const name of [
      'claim_douyin_budget_ai_analysis',
      'complete_douyin_budget_ai_analysis',
      'fail_douyin_budget_ai_analysis',
    ]) {
      expect(source).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated;`,
        ),
      );
      expect(source).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role;`,
        ),
      );
    }
    expect(source).not.toMatch(
      /GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|authenticated)/,
    );
  });

  test('seeds a bounded route while preserving an existing model selection', async () => {
    const source = await Bun.file(sceneMigration).text();
    const sql = compact(source);
    expect(source.startsWith('-- Rollback: forward-only.')).toBe(true);
    expect(sql).toContain("'douyin_budget_explanation'");
    expect(sql).toContain("'deepseek-chat'");
    expect(sql).toContain('0.200::numeric');
    expect(sql).toContain("'json_object'");
    expect(sql).toContain('30000');
    expect(sql).toContain('on conflict (scene_code) do update set');
    expect(sql).toMatch(
      /primary_model_id = coalesce\(\s*public\.ai_scene_routes\.primary_model_id, excluded\.primary_model_id\s*\)/,
    );
    expect(sql).toMatch(
      /fallback_model_id = coalesce\(\s*public\.ai_scene_routes\.fallback_model_id, excluded\.fallback_model_id\s*\)/,
    );
    expect(sql).not.toMatch(/api[_-]?key\s*=/);
  });

  test('removes the final scene fallback without changing its primary route', async () => {
    const source = await Bun.file(fallbackRepairMigration).text();
    const sql = compact(source);
    expect(source.startsWith('-- Rollback: forward-only.')).toBe(true);
    expect(sql).toContain("scene_code = 'douyin_budget_explanation'");
    expect(sql).toContain('set fallback_model_id = null');
    expect(sql).toContain('route.fallback_model_id is null');
    expect(sql).toContain('route.temperature = 0.200::numeric');
    expect(sql).toContain("route.response_format = 'json_object'");
    expect(sql).toContain('route.timeout_ms = 30000');
    expect(sql).toContain("model.code = 'deepseek-chat'");
    expect(sql).not.toMatch(/set\s+primary_model_id/);
    expect(sql).not.toMatch(/set\s+temperature/);
    expect(sql).not.toMatch(/set\s+response_format/);
    expect(sql).not.toMatch(/set\s+timeout_ms/);
  });

  test('binds the primary model before the fallback repair on fresh replay', async () => {
    const source = await Bun.file(primaryBindingMigration).text();
    const sql = compact(source);
    expect(source.startsWith('-- Rollback: forward-only.')).toBe(true);
    expect(sql).toContain("route.scene_code = 'douyin_budget_explanation'");
    expect(sql).toContain('set primary_model_id = model.id');
    expect(sql).toContain("model.code = 'deepseek-chat'");
    expect(sql).toContain("provider.code = 'deepseek'");
    expect(sql).toContain("model.status = 'active'");
    expect(sql).toContain("provider.status = 'active'");
    expect(sql).toContain('route.temperature = 0.200::numeric');
    expect(sql).toContain("route.response_format = 'json_object'");
    expect(sql).toContain('route.timeout_ms = 30000');
    expect(sql).not.toMatch(/set\s+fallback_model_id/);
    expect(sql).not.toMatch(/set\s+temperature/);
    expect(sql).not.toMatch(/set\s+response_format/);
    expect(sql).not.toMatch(/set\s+timeout_ms/);
    expect(
      '20260821103150_bind_douyin_budget_ai_primary_model.sql'
        < '20260821103200_remove_douyin_budget_ai_fallback.sql',
    ).toBe(true);
  });
});
