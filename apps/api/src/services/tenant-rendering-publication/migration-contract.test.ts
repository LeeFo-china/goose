import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const migration = new URL(
  '../../../../../supabase/migrations/20260913001512_publish_tenant_rendering_styles.sql',
  import.meta.url,
);
const normalized = existsSync(migration)
  ? readFileSync(migration, 'utf8').replace(/\s+/g, ' ').toLowerCase()
  : '';

describe('租户自助发布 migration 合同', () => {
  test('以有界事务增加完整发布快照并保留原有资料', () => {
    expect(existsSync(migration)).toBe(true);
    for (const fragment of [
      'begin;', "set local lock_timeout = '5s'", "set local statement_timeout = '60s'", 'commit;',
      "check (status in ('draft', 'published', 'hidden'))",
      'published_title text', 'published_space text', 'published_style text',
      'published_color_notes text', 'published_material_notes text', 'published_source_type text',
      'published_file_id uuid', 'published_version integer', 'published_at timestamptz',
      'published_by_employee_id uuid references public.employees(id) on delete set null',
      'tenant_rendering_styles_snapshot_check', 'published_version > 0 and published_version <= version',
      "status <> 'draft' or published_version is null", "status <> 'published' or published_version is not null",
      'published_title = btrim(published_title)', 'char_length(published_title) between 1 and 80',
      'char_length(published_color_notes) <= 300', 'char_length(published_material_notes) <= 300',
      "published_space in ('living_room', 'bedroom')",
      "published_source_type in ('real_case', 'design', 'ai_concept')",
    ]) expect(normalized).toContain(fragment);
    expect(normalized).not.toMatch(/drop table (?:public\.)?tenant_rendering_styles/);
  });

  test('命令与公开文件使用租户复合外键、唯一键和有界目录索引', () => {
    for (const fragment of [
      'create table public.tenant_rendering_style_publish_commands', 'request_hash char(64)',
      "status in ('preparing', 'succeeded', 'failed')", 'lease_token uuid', 'lease_expires_at timestamptz',
      'unique (tenant_id, idempotency_key)', 'unique (tenant_id, style_id, expected_version)',
      'foreign key (tenant_id, style_id) references public.tenant_rendering_styles (tenant_id, id)',
      'foreign key (tenant_id, public_file_id) references public.platform_file_objects (tenant_id, id)',
      'foreign key (tenant_id, published_file_id) references public.platform_file_objects (tenant_id, id)',
      'tenant_rendering_styles_public_catalog_idx',
      '(tenant_id, published_space, published_style, sort_order, id)',
      "where status = 'published' and deleted_at is null",
    ]) expect(normalized).toContain(fragment);
  });

  test('三支原子命令仅开放 service_role 并固定 search_path 和锁顺序', () => {
    const table = 'public.tenant_rendering_style_publish_commands';
    expect(normalized).toContain(`alter table ${table} enable row level security`);
    expect(normalized).toContain(`revoke all on table ${table} from public, anon, authenticated, service_role`);
    expect(normalized).toContain(`grant select on table ${table} to service_role`);
    expect(normalized).not.toMatch(/create policy/);
    for (const name of ['begin', 'complete', 'fail']) {
      const functionName = `${name}_tenant_rendering_style_publish`;
      expect(normalized).toMatch(new RegExp(`create function public\\.${functionName}\\([^;]+security definer set search_path = pg_catalog, public`));
      expect(normalized).toMatch(new RegExp(`revoke all on function public\\.${functionName}\\([^;]+from public, anon, authenticated;`));
      expect(normalized).toMatch(new RegExp(`grant execute on function public\\.${functionName}\\([^;]+to service_role;`));
    }
    expect(normalized).toContain('for update');
    expect(normalized).toContain('pg_advisory_xact_lock');
    expect(normalized).toContain('order by id for update');
  });

  test('公开副本只由源文件生成、激活时完整复制快照并保证幂等', () => {
    for (const fragment of [
      "'rendering_style_public'", "'public/renovation-styles/'", "'image/webp'",
      "'migrating'", "set status = 'active', visibility = 'public', public_url = p_public_url",
      'published_title = v_style.title', 'published_file_id = v_command.public_file_id',
      'published_version = v_style.version + 1', 'version = v_style.version + 1',
      "'in_progress'", "'idempotency_conflict'", "'version_conflict'", "'not_found'",
      "v_command.lease_token is distinct from p_lease_token", "interval '120 seconds'",
      "p_public_url !~ '^https://'", 'char_length(p_public_url) > 2048',
      'published_by_employee_id = p_employee_id', 'created_by_employee_id = p_employee_id',
    ]) expect(normalized).toContain(fragment);
    const beginSignature = normalized.split('create function public.begin_tenant_rendering_style_publish(')[1]?.split('returns jsonb')[0] ?? '';
    expect(beginSignature).not.toContain('url');
    expect(normalized).toContain('platform_cos_public_base_url');
    const returns = [...normalized.matchAll(/return jsonb_build_object\((.*?)\);/g)].map((match) => match[1]);
    expect(returns.length).toBeGreaterThan(0);
    for (const result of returns) {
      expect(result).not.toMatch(/sqlerrm|sqlstate|secret|public_url|legacy_url|signed_url/);
    }
    const completeAndFail = normalized.split('create function public.complete_tenant_rendering_style_publish(')[1] ?? '';
    for (const result of completeAndFail.matchAll(/return jsonb_build_object\((.*?)\);/g)) {
      expect(result[1]).not.toMatch(/object_key|bucket|region|checksum/);
    }
  });

  test('稳定发布人归属并说明物理删除仍需隔离并发验证和重试', () => {
    const complete = normalized.split('create function public.complete_tenant_rendering_style_publish(')[1]
      ?.split('create function public.fail_tenant_rendering_style_publish(')[0] ?? '';
    expect(complete).toContain("id = p_employee_id and status = 'active' for share");
    expect(complete.indexOf('from public.employees')).toBeLessThan(complete.indexOf('from public.tenant_rendering_styles'));
    expect(complete).toContain('正常 api 停用员工');
    expect(complete).toContain('物理删除/维护仍须对序列化失败或死锁重试');
  });

  test('丢失原键后按同版本命令恢复，同时保留新旧键的请求绑定', () => {
    const begin = normalized.split('create function public.begin_tenant_rendering_style_publish(')[1]
      ?.split('create function public.complete_tenant_rendering_style_publish(')[0] ?? '';
    for (const fragment of [
      'join public.tenant_rendering_style_publish_command_keys as keys',
      'keys.idempotency_key = p_idempotency_key for update of command',
      'if not v_key_known then select * into v_command',
      'where tenant_id = p_tenant_id and style_id = p_style_id and expected_version = p_expected_version for update',
      'v_command.request_hash::text is distinct from p_request_hash',
      'insert into public.tenant_rendering_style_publish_command_keys',
    ]) expect(begin).toContain(fragment);
    expect(begin).not.toContain('v_command.id is null and exists');
    const table = 'public.tenant_rendering_style_publish_command_keys';
    for (const fragment of [
      `create table ${table}`, 'primary key (tenant_id, idempotency_key)',
      'foreign key (tenant_id, command_id) references public.tenant_rendering_style_publish_commands (tenant_id, id)',
      `alter table ${table} enable row level security`,
      `revoke all on table ${table} from public, anon, authenticated, service_role`,
      `grant select on table ${table} to service_role`,
    ]) expect(normalized).toContain(fragment);
  });

  test('SQL 回归断言不会把 NULL 当成通过，并覆盖丢键后恢复', () => {
    const sql = readFileSync(new URL('../../../../../supabase/tests/tenant_rendering_style_publication.sql', import.meta.url), 'utf8');
    expect(sql).not.toContain('<>');
    expect(sql).not.toMatch(/v_(?:result|claim)->>'[^']+'\s*=/);
    for (const fragment of ['丢失原键后失败重领', '丢失原键后过期重领', '成功版本使用新键', '旧键重试仍返回同一命令']) {
      expect(sql).toContain(fragment);
    }
  });
});
