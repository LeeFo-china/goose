import { describe, expect, test } from 'bun:test';

const migrationFile = new URL(
  '../../../../../supabase/migrations/20260830110000_align_douyin_measurement_command_owners.sql',
  import.meta.url,
);

const commandSignatures = [
  'public.submit_douyin_miniapp_lead(uuid,uuid,text,text,text,numeric,text,text,text,text,text,uuid,text,text,text,text,timestamp with time zone,jsonb)',
  'public.submit_douyin_measurement_appointment(uuid,uuid,text,text,text,date,text,uuid,text,text,uuid,text,text,text,text,timestamp with time zone,jsonb)',
  'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid)',
  'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)',
  'public.append_douyin_lead_follow_up(uuid,uuid,uuid,uuid,text,text,text,timestamp with time zone,text,timestamp with time zone,integer,uuid)',
  'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid)',
  'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid,uuid,boolean)',
  'public.mark_douyin_lead_invalid(uuid,uuid,uuid,text,integer,uuid)',
] as const;

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function topLevelSql(sql: string): string {
  return normalize(sql).replace(/do \$block\$.*?\$block\$;/g, ' ');
}

describe('douyin measurement command owner alignment migration', () => {
  test('exists as a forward-only migration with bounded execution', async () => {
    expect(await Bun.file(migrationFile).exists()).toBe(true);

    const source = await Bun.file(migrationFile).text();
    const sql = normalize(source);
    expect(source.toLowerCase()).toContain('rollback');
    expect(sql).toContain('begin;');
    expect(sql).toContain("set local lock_timeout = '5s'");
    expect(sql).toContain("set local statement_timeout = '30s'");
    expect(sql).toEndWith('commit;');
  });

  test('aligns every reviewed security-definer command to the lead table owner', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());

    expect(sql).toContain('from pg_catalog.pg_class as class');
    expect(sql).toContain("namespace.nspname = 'public'");
    expect(sql).toContain("class.relname = 'marketing_leads'");
    expect(sql).toContain('pg_catalog.pg_get_userbyid(class.relowner)');
    expect(sql).toContain("v_table_owner in ('anon', 'authenticated', 'service_role')");
    expect(sql).toContain('pg_catalog.to_regprocedure(v_signature)');
    expect(sql).toContain('from pg_catalog.pg_proc as procedure');
    expect(sql).toContain('procedure.prosecdef');
    expect(sql).toMatch(
      /format\(\s*'alter function %s owner to %i',\s*v_signature,\s*v_table_owner\s*\)/,
    );

    for (const signature of commandSignatures) {
      expect(sql).toContain(signature);
    }
  });

  test('does not weaken direct-write protection or mutate business data', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());
    const topLevel = topLevelSql(sql);

    expect(sql).not.toContain('alter table public.marketing_leads owner to');
    expect(sql).not.toContain('create or replace function public.douyin_measurement_marketing_lead_guard');
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on table public\.marketing_leads/);
    expect(sql).not.toMatch(
      /\b(insert\s+into|update\s+public\.|delete\s+from|merge\s+into|copy\s+public\.|call\s+public\.)/,
    );
    expect(topLevel).not.toMatch(/\b(insert|update|delete|merge|copy|call)\b/);
  });
});
