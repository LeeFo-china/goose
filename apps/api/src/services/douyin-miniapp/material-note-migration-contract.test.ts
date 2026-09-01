import { describe, expect, test } from 'bun:test';

const migrationFile = new URL(
  '../../../../../supabase/migrations/20260901120000_create_douyin_material_notes.sql',
  import.meta.url,
);

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tableDefinition(sql: string, tableName: string): string {
  const normalized = normalize(sql);
  const start = normalized.indexOf(`create table public.${tableName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = normalized.indexOf(');', start);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + 2);
}

function functionDefinition(sql: string, functionName: string): string {
  const normalized = normalize(sql);
  const markers = [
    `create or replace function public.${functionName}`,
    `create function public.${functionName}`,
  ];
  const start = Math.max(...markers.map((marker) => normalized.indexOf(marker)));
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = normalized.indexOf('as $function$', start);
  expect(bodyStart).toBeGreaterThan(start);
  const end = normalized.indexOf('$function$;', bodyStart + 13);
  expect(end).toBeGreaterThan(bodyStart);
  return normalized.slice(start, end + 11);
}

function expectInOrder(source: string, fragments: readonly string[]): void {
  let cursor = 0;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor);
    expect(next, `expected fragment after offset ${cursor}: ${fragment}`).toBeGreaterThanOrEqual(0);
    cursor = next + fragment.length;
  }
}

describe('douyin material note migration', () => {
  test('is an explicit forward-only transaction', async () => {
    const source = await Bun.file(migrationFile).text();
    const sql = normalize(source);
    const lowerSource = source.toLowerCase();

    expect(sql).toStartWith('begin;');
    expect(sql).toEndWith('commit;');
    expect(lowerSource).toContain('rollback');
    expect(lowerSource).toContain('forward-only');
    expect(lowerSource).toContain('revoke api and rpc privileges');
    expect(lowerSource).toContain('existing claim data must not be dropped');
    expect(lowerSource).toContain('reviewed forward migration');
  });

  test('creates tenant-safe note and immutable version storage', async () => {
    const source = await Bun.file(migrationFile).text();
    const notes = tableDefinition(source, 'douyin_material_notes');
    const versions = tableDefinition(source, 'douyin_material_note_versions');

    for (const fragment of [
      'id uuid primary key default gen_random_uuid()',
      'tenant_id uuid not null',
      "status text not null default 'draft'",
      'published_version_id uuid null',
      'published_at timestamptz null',
      'created_by uuid not null',
      'updated_by uuid not null',
      'created_at timestamptz not null',
      'updated_at timestamptz not null',
      'unique (id, tenant_id)',
      'foreign key (created_by, tenant_id)',
      'foreign key (updated_by, tenant_id)',
    ]) {
      expect(notes).toContain(fragment);
    }
    expect(notes).toContain("status in ('draft', 'published', 'archived', 'withdrawn')");
    expect(notes).toContain("status = 'draft' and published_version_id is null and published_at is null");
    expect(notes).toContain("status = 'published' and published_version_id is not null and published_at is not null");
    expect(notes).toContain('published_version_id is null and published_at is null');
    expect(notes).toContain('published_version_id is not null and published_at is not null');

    for (const fragment of [
      'id uuid primary key default gen_random_uuid()',
      'tenant_id uuid not null',
      'note_id uuid not null',
      'version_no integer not null',
      'title text not null',
      'summary text not null',
      'category text not null',
      'applicable_to text null',
      'content_blocks jsonb not null',
      'created_by uuid not null',
      'created_at timestamptz not null',
      'unique (note_id, version_no)',
      'unique (id, note_id, tenant_id)',
      'foreign key (note_id, tenant_id)',
      'foreign key (created_by, tenant_id)',
    ]) {
      expect(versions).toContain(fragment);
    }
    expect(versions).toContain('version_no > 0');
    expect(versions).toContain('char_length(btrim(title)) between 1 and 300');
    expect(versions).toContain('char_length(btrim(summary)) between 1 and 1000');
    expect(versions).toContain('char_length(btrim(category)) between 1 and 100');
    expect(versions).toContain('applicable_to is null or char_length(btrim(applicable_to)) between 1 and 300');

    const sql = normalize(source);
    expect(sql).toContain('foreign key (published_version_id, id, tenant_id) references public.douyin_material_note_versions(id, note_id, tenant_id)');
    expect(sql).toContain('material_note_version_immutable');
    expect(sql).toContain("message = 'material_note_version_immutable'");
    expect(sql).toContain('before update or delete on public.douyin_material_note_versions');
    expect(sql).toContain('material_note_delete_forbidden');
    expect(sql).toContain('before delete on public.douyin_material_notes');
  });

  test('validates bounded strict text-only content blocks in SQL', async () => {
    const source = await Bun.file(migrationFile).text();
    const validator = functionDefinition(source, 'is_valid_douyin_material_note_content_blocks');

    expect(validator).toContain("jsonb_typeof(p_blocks) <> 'array'");
    expect(validator).toContain('jsonb_array_length(p_blocks) > 100');
    expect(validator).toContain('pg_column_size(p_blocks) > 524288');
    expect(validator).toContain("octet_length(convert_to(p_blocks::text, 'utf8')) > 524288");
    for (const type of ['heading', 'paragraph', 'list', 'quote', 'callout']) {
      expect(validator).toContain(`'${type}'`);
    }
    for (const forbidden of ['image', 'gallery', 'metrics', 'url', 'html']) {
      expect(validator).not.toContain(`'${forbidden}'`);
    }
    expect(validator).toContain("block ->> 'level' not in ('2', '3')");
    expect(validator).toContain("block ->> 'style' not in ('ordered', 'unordered')");
    expect(validator).toContain("block ->> 'tone' not in ('info', 'warning')");
    expect(validator).toContain('jsonb_array_length(block -> \'items\') not between 1 and 50');
    expect(validator).toContain('char_length(btrim(item.value #>> \'{}\')) not between 1 and 2000');
    expect(validator).toContain("block - array['type', 'text']::text[] <> '{}'::jsonb");
    expect(validator).toContain("block - array['type', 'level', 'text']::text[] <> '{}'::jsonb");
    expect(validator).toContain("block - array['type', 'style', 'items']::text[] <> '{}'::jsonb");
    expect(validator).toContain("block - array['type', 'text', 'attribution']::text[] <> '{}'::jsonb");
    expect(validator).toContain("block - array['type', 'tone', 'title', 'text']::text[] <> '{}'::jsonb");

    const typeCaseStart = validator.indexOf("case block ->> 'type'");
    expect(typeCaseStart).toBeGreaterThanOrEqual(0);
    const typeCaseEnd = validator.indexOf('end case;', typeCaseStart);
    expect(typeCaseEnd).toBeGreaterThan(typeCaseStart);
    const typeCase = validator.slice(typeCaseStart, typeCaseEnd + 'end case;'.length);
    const elseStart = typeCase.lastIndexOf('else');
    expect(elseStart).toBeGreaterThanOrEqual(0);
    expect(typeCase.slice(elseStart)).toBe('else return false; end case;');

    expect(normalize(source)).toContain('check (public.is_valid_douyin_material_note_content_blocks(content_blocks))');
  });

  test('creates scoped claims and an immutable state-command ledger', async () => {
    const source = await Bun.file(migrationFile).text();
    const claims = tableDefinition(source, 'douyin_material_note_claims');
    const events = tableDefinition(source, 'douyin_material_note_command_events');

    for (const fragment of [
      'tenant_id uuid not null',
      'douyin_miniapp_installation_id uuid not null',
      'subject_hash text not null',
      'note_id uuid not null',
      'claimed_version_id uuid not null',
      'claimed_at timestamptz not null',
      'removed_at timestamptz null',
      'unique (douyin_miniapp_installation_id, subject_hash, note_id)',
      'unique (id, tenant_id)',
      'foreign key (douyin_miniapp_installation_id, tenant_id)',
      'foreign key (note_id, tenant_id)',
      'foreign key (claimed_version_id, note_id, tenant_id)',
    ]) {
      expect(claims).toContain(fragment);
    }
    expect(claims).toContain("subject_hash ~ '^[0-9a-f]{64}$'");

    expect(events).toContain("command in ('publish', 'archive', 'withdraw')");
    expect(events).toContain("request_digest ~ '^[0-9a-f]{64}$'");
    expect(events).toContain("jsonb_typeof(result) = 'object'");
    expect(events).toContain('unique (tenant_id, idempotency_key)');
    expect(events).toContain('foreign key (note_id, tenant_id)');
    expect(events).toContain('foreign key (created_by, tenant_id)');
    expect(normalize(source)).toContain('before update or delete on public.douyin_material_note_command_events');
  });

  test('creates bounded listing, owned-claim and tenant-filtered search indexes', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());
    const compact = sql.replace(/\s*([(),])\s*/g, '$1');

    expect(compact).toContain('on public.douyin_material_notes(tenant_id,status,published_at desc,id desc)');
    expect(compact).toContain('on public.douyin_material_notes(tenant_id,updated_at desc,id desc)');
    expect(compact).toContain('on public.douyin_material_note_claims(douyin_miniapp_installation_id,subject_hash,claimed_at desc,id desc)where removed_at is null');
    for (const column of ['title', 'summary', 'category']) {
      expect(sql).toContain(`on public.douyin_material_note_versions using gin (${column} extensions.gin_trgm_ops)`);
    }
    expect(compact).toContain('on public.douyin_material_note_versions(tenant_id,note_id,version_no desc)');
  });

  test('enables RLS and grants only the service API role', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());
    const tables = [
      'douyin_material_notes',
      'douyin_material_note_versions',
      'douyin_material_note_claims',
      'douyin_material_note_command_events',
    ];

    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant select on table public.${table} to service_role`);
    }
    expect(sql).not.toContain('create policy');

    const functions = [
      'create_douyin_material_note',
      'append_douyin_material_note_version',
      'execute_douyin_material_note_state_command',
      'claim_douyin_material_note',
      'remove_douyin_material_note_claim',
      'clear_douyin_material_note_claims',
      'erase_douyin_material_note_subject_data',
    ];
    for (const name of functions) {
      const definition = functionDefinition(await Bun.file(migrationFile).text(), name);
      expect(definition).toContain('security definer');
      expect(definition).toContain('set search_path = pg_catalog, public');
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated, service_role`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`));
    }
  });

  test('seeds the three domain permissions for active tenant system admins', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());

    for (const [code, name, action] of [
      ['douyin_material_note.read', '查看抖音资料', 'read'],
      ['douyin_material_note.manage', '管理抖音资料', 'manage'],
      ['douyin_material_note.publish', '发布抖音资料', 'publish'],
    ]) {
      expect(sql).toContain(`'${code}', '${name}', 'douyin_miniapp', 'douyin_material_note', '${action}'`);
    }
    expect(sql).toContain('on conflict (code) do update set');
    expect(sql).toContain("roles.code = 'system_admin'");
    expect(sql).toContain('roles.tenant_id is not null');
    expect(sql).toContain("roles.status = 'active'");
    expect(sql).toContain("tenants.status = 'active'");
    expect(sql).toContain("permissions.status = 'active'");
    expect(sql).toContain("select roles.id, permissions.id, 'all'");
    expect(sql).toContain('on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope');
  });

  test('preserves every historical marketing event while adding material events', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());
    for (const event of [
      'page_view', 'button_click', 'phone_click', 'form_submit', 'app_launch',
      'case_view', 'site_view', 'lead_cta_click', 'sms_send', 'lead_submit',
      'lead_submit_success', 'phone_call_click', 'material_preview',
      'material_claim', 'material_copy', 'material_budget_click',
      'material_lead_click',
    ]) {
      expect(sql).toContain(`'${event}'`);
    }
    expect(sql).toContain('drop constraint if exists marketing_events_event_name_check');
    expect(sql).toContain('add constraint marketing_events_event_name_check check');
  });

  test('creates notes and appends versions under tenant and actor locks', async () => {
    const source = await Bun.file(migrationFile).text();
    const create = functionDefinition(source, 'create_douyin_material_note');
    const append = functionDefinition(source, 'append_douyin_material_note_version');

    for (const body of [create, append]) {
      expect(body).toContain("tenant.status = 'active'");
      expect(body).toContain("employee.status = 'active'");
      expect(body).toContain('employee.tenant_id = p_tenant_id');
      expect(body).toContain('insert into public.douyin_material_note_versions');
    }
    expectInOrder(create, [
      'insert into public.douyin_material_notes',
      'insert into public.douyin_material_note_versions',
      "jsonb_build_object('note_id'",
    ]);
    expect(create).toContain("'version_no', 1");
    expect(create).toContain("'status', 'draft'");
    expect(append).toContain('for update');
    expect(append).toContain("v_note.status = 'withdrawn'");
    expect(append).toContain("message = 'material_note_withdrawn'");
    expectInOrder(append, [
      'select coalesce(max(version.version_no), 0) + 1',
      'insert into public.douyin_material_note_versions',
      'update public.douyin_material_notes',
    ]);
  });

  test('executes state transitions with canonical digest and safe replay', async () => {
    const body = functionDefinition(
      await Bun.file(migrationFile).text(),
      'execute_douyin_material_note_state_command',
    );

    expect(body).toContain("p_command not in ('publish', 'archive', 'withdraw')");
    expect(body).toContain("p_expected_status not in ('draft', 'published', 'archived', 'withdrawn')");
    expect(body).toContain('extensions.digest(convert_to(jsonb_build_object(');
    expect(body).toContain("'sha256'");
    expectInOrder(body, [
      'pg_advisory_xact_lock',
      'from public.douyin_material_note_command_events',
      'return v_event.result',
      'from public.douyin_material_notes as note',
      'for update',
    ]);
    expect(body).toContain('v_event.request_digest is distinct from v_request_digest');
    expect(body).toContain('v_event.command is distinct from p_command');
    expect(body).toContain('v_event.note_id is distinct from p_note_id');
    expect(body).toContain("message = 'material_note_idempotency_conflict'");
    expect(body).toContain('v_note.status is distinct from p_expected_status');
    expect(body).toContain("message = 'material_note_state_conflict'");
    expect(body).toContain("p_command = 'publish'");
    expect(body).toContain('version.note_id = p_note_id');
    expect(body).toContain('version.tenant_id = p_tenant_id');
    for (const transition of [
      "v_note.status = 'draft' and p_command in ('publish', 'archive')",
      "v_note.status = 'published' and p_command in ('publish', 'archive', 'withdraw')",
      "v_note.status = 'archived' and p_command in ('publish', 'withdraw')",
    ]) {
      expect(body).toContain(transition);
    }
    expect(body).toContain("v_note.status = 'withdrawn'");
    expectInOrder(body, [
      'update public.douyin_material_notes',
      'insert into public.douyin_material_note_command_events',
      'return v_result',
    ]);
  });

  test('rejects withdrawn notes before reading claims and otherwise preserves locked versions', async () => {
    const body = functionDefinition(
      await Bun.file(migrationFile).text(),
      'claim_douyin_material_note',
    );

    expect(body).toContain("installation.installation_kind = 'merchant'");
    expect(body).toContain("installation.authorization_status = 'active'");
    expect(body).toContain("tenant.status = 'active'");
    expectInOrder(body, [
      'from public.douyin_material_notes as note',
      'for update',
      "v_note.status = 'withdrawn'",
      "message = 'material_note_withdrawn'",
      'from public.douyin_material_note_claims as claim',
      'for update',
      'v_claim.removed_at is null',
      "v_note.status <> 'published'",
    ]);
    expect(body).toContain('v_claim.removed_at is null');
    expect(body).toContain('already_claimed := true');
    expect(body).toContain('set removed_at = null');
    expect(body).toContain('claimed_version_id = v_note.published_version_id');
    expect(body).toContain('insert into public.douyin_material_note_claims');
    expect(body).toContain('insert into public.marketing_events');
    expect(body).toContain("'material_claim'");
    expect(body).toContain("'note_id', p_note_id");
    expect(body).toContain("'claim_id', v_claim.id");
    expect(body).toContain("'version', v_version.version_no");
    const eventStart = body.indexOf('insert into public.marketing_events');
    const returnStart = body.indexOf('return jsonb_build_object', eventStart);
    const eventSegment = body.slice(eventStart, returnStart);
    expect(eventSegment).not.toContain('content_blocks');
    expect(body).toContain("'material', jsonb_build_object(");
    for (const key of ['id', 'version', 'title', 'summary', 'category', 'applicable_to', 'content_blocks']) {
      expect(body).toContain(`'${key}'`);
    }
  });

  test('removes one claim idempotently and clears all active claims with one update', async () => {
    const source = await Bun.file(migrationFile).text();
    const remove = functionDefinition(source, 'remove_douyin_material_note_claim');
    const clear = functionDefinition(source, 'clear_douyin_material_note_claims');

    expect(remove).toContain('claim.id = p_claim_id');
    expect(remove).toContain('claim.tenant_id = p_tenant_id');
    expect(remove).toContain('claim.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id');
    expect(remove).toContain('claim.subject_hash = p_subject_hash');
    expect(remove).toContain("message = 'material_note_claim_not_found'");
    expect(remove).toContain('if v_claim.removed_at is null then');
    expect(remove).toContain("jsonb_build_object('removed', true)");

    expect(clear.match(/update public\.douyin_material_note_claims/g)?.length).toBe(1);
    expect(clear).toContain('removed_at is null');
    expect(clear).toContain('get diagnostics v_removed_count = row_count');
    expect(clear).toContain("jsonb_build_object('removed_count', v_removed_count)");
  });

  test('erases only the subject material footprint', async () => {
    const body = functionDefinition(
      await Bun.file(migrationFile).text(),
      'erase_douyin_material_note_subject_data',
    );

    expect(body).toContain('delete from public.douyin_material_note_claims');
    expect(body).toContain('delete from public.marketing_events');
    expect(body).toContain('tenant.id = p_tenant_id');
    expect(body).toContain('installation.id = p_douyin_miniapp_installation_id');
    expect(body).toContain('installation.tenant_id = p_tenant_id');
    expect(body).not.toContain("tenant.status = 'active'");
    expect(body).not.toContain("installation.installation_kind = 'merchant'");
    expect(body).not.toContain("installation.authorization_status = 'active'");
    expect(body).toContain("event.source = 'douyin_miniapp'");
    expect(body).toContain("event.event_name in ('material_preview', 'material_claim', 'material_copy', 'material_budget_click', 'material_lead_click')");
    expect(body).toContain('event.tenant_id = p_tenant_id');
    expect(body).toContain('event.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id');
    expect(body).toContain('event.subject_hash = p_subject_hash');
    expect(body).toContain('get diagnostics v_deleted_claim_count = row_count');
    expect(body).toContain('get diagnostics v_deleted_event_count = row_count');
    expect(body).toContain("'deleted_claim_count', v_deleted_claim_count");
    expect(body).toContain("'deleted_event_count', v_deleted_event_count");
  });
});
