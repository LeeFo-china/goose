import { describe, expect, test } from 'bun:test';

const migrationUrl = new URL(
  '../../../../../supabase/migrations/20260904090000_repair_openrouter_provider_configuration.sql',
  import.meta.url,
);

function normalizeSql(source: string): string {
  return source.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('OpenRouter provider configuration repair migration', () => {
  test('repairs the provider type and canonical system setting reference', async () => {
    const migration = Bun.file(migrationUrl);

    expect(await migration.exists()).toBe(true);
    const sql = normalizeSql(await migration.text());

    expect(sql).toContain("where provider.code = 'openrouter'");
    expect(sql).toContain("provider_type = 'openrouter'");
    expect(sql).toContain("api_key_setting_key = 'openrouter_api_key'");
    expect(sql).toContain("'https://openrouter.ai/api/v1/chat/completions'");
  });

  test('preserves a legacy direct key only when the platform secret is empty', async () => {
    const sql = normalizeSql(await Bun.file(migrationUrl).text());

    expect(sql).toContain("key = 'openrouter_api_key'");
    expect(sql).toContain('value_text is null');
    expect(sql).toContain("api_key_setting_key ~* '^(sk-|sk_|bearer )'");
    expect(sql).not.toContain('sk-or-v1-');
  });

  test('creates the canonical provider and secret setting when either record is missing', async () => {
    const sql = normalizeSql(await Bun.file(migrationUrl).text());

    expect(sql).toContain('insert into public.system_settings');
    expect(sql).toContain('insert into public.ai_providers');
    expect(sql).toContain('on conflict (code) do update');
    expect(sql).toContain('forward migration');
  });
});
