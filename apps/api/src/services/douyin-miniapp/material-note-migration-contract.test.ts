import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
function migrationUrl(file: string): URL {
  return new URL(`../../../../../supabase/migrations/${file}`, import.meta.url);
}
const migrationFile = migrationUrl('20260901120000_create_douyin_material_notes.sql');
const validateEventConstraintMigrationFile = migrationUrl('20260901120010_validate_douyin_material_note_events.sql');
const swapEventConstraintMigrationFile = migrationUrl('20260901120020_swap_douyin_material_note_events.sql');
const eventErasureIndexMigrationFile = migrationUrl('20260901120030_index_douyin_material_note_event_erasure.sql');
const siteContentDomainFile = new URL('../../../../../packages/domain/src/site-content.ts', import.meta.url);
const migrationSource = readFileSync(migrationFile, 'utf8');
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
function addedCheckConstraint(sql: string, constraintName: string): string {
  const normalized = normalize(sql);
  const marker = `add constraint ${constraintName} check (`;
  const start = normalized.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const endMarker = ') not valid;';
  const end = normalized.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + endMarker.length);
}
function stringLiterals(source: string): string[] {
  return [...source.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[0].slice(1, -1).replace(/''/g, "'"));
}
function expectInOrder(source: string, fragments: readonly string[]): void {
  let cursor = 0;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor);
    expect(next, `expected fragment after offset ${cursor}: ${fragment}`).toBeGreaterThanOrEqual(0);
    cursor = next + fragment.length;
  }
}
function expectContains(source: string, fragments: readonly string[]): void { fragments.forEach((fragment) => expect(source).toContain(fragment)); }
function expectOmits(source: string, fragments: readonly string[]): void { fragments.forEach((fragment) => expect(source).not.toContain(fragment)); }
describe('douyin material note migration', () => {
  test('is an explicit forward-only transaction', async () => {
    const sql = normalize(migrationSource);
    const lowerSource = migrationSource.toLowerCase();
    expect(sql).toStartWith('begin;');
    expect(sql).toEndWith('commit;');
    expectContains(lowerSource, [
      'rollback', 'forward-only', 'revoke api and rpc privileges',
      'existing claim data must not be dropped', 'reviewed forward migration',
    ]);
  });
  test('creates tenant-safe note and immutable version storage', async () => {
    const notes = tableDefinition(migrationSource, 'douyin_material_notes');
    const versions = tableDefinition(migrationSource, 'douyin_material_note_versions');
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
    const shapeStart = notes.indexOf(
      'constraint douyin_material_notes_publication_shape_check check (',
    );
    expect(shapeStart).toBeGreaterThanOrEqual(0);
    const publicationShape = notes.slice(shapeStart);
    expectInOrder(publicationShape, [
      "status = 'draft' and published_version_id is null and published_at is null",
      "status = 'published' and published_version_id is not null and published_at is not null",
      "status in ('archived', 'withdrawn')",
      'published_version_id is null and published_at is null',
      'published_version_id is not null and published_at is not null',
    ]);
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
    const sql = normalize(migrationSource);
    expect(sql).toContain('foreign key (published_version_id, id, tenant_id) references public.douyin_material_note_versions(id, note_id, tenant_id)');
    expect(sql).toContain('material_note_version_immutable');
    expect(sql).toContain("message = 'material_note_version_immutable'");
    expect(sql).toContain('before update or delete on public.douyin_material_note_versions');
    expect(sql).toContain('material_note_delete_forbidden');
    expect(sql).toContain('before delete on public.douyin_material_notes');
  });
  test('validates bounded strict text-only content blocks in SQL', async () => {
    const validator = functionDefinition(migrationSource, 'is_valid_douyin_material_note_content_blocks');
    const siteContentDomain = await Bun.file(siteContentDomainFile).text();
    expectContains(validator, [
      "jsonb_typeof(p_blocks) <> 'array'", 'jsonb_array_length(p_blocks) > 100',
      'pg_column_size(p_blocks) > 524288',
      "octet_length(convert_to(p_blocks::text, 'utf8')) > 524288",
    ]);
    expectContains(normalize(siteContentDomain), [
      'const max_blocks_utf8_bytes = 512 * 1024;',
      'getserializedutf8bytelength(blocks) > max_blocks_utf8_bytes',
    ]);
    for (const type of ['heading', 'paragraph', 'list', 'quote', 'callout']) {
      expect(validator).toContain(`'${type}'`);
    }
    for (const forbidden of ['image', 'gallery', 'metrics', 'url', 'html']) {
      expect(validator).not.toContain(`'${forbidden}'`);
    }
    expectContains(validator, [
      "block ->> 'level' not in ('2', '3')", "block ->> 'style' not in ('ordered', 'unordered')",
      "block ->> 'tone' not in ('info', 'warning')",
      'jsonb_array_length(block -> \'items\') not between 1 and 50',
      'char_length(btrim(item.value #>> \'{}\')) not between 1 and 2000',
      "block - array['type', 'text']::text[] <> '{}'::jsonb",
      "block - array['type', 'level', 'text']::text[] <> '{}'::jsonb",
      "block - array['type', 'style', 'items']::text[] <> '{}'::jsonb",
      "block - array['type', 'text', 'attribution']::text[] <> '{}'::jsonb",
      "block - array['type', 'tone', 'title', 'text']::text[] <> '{}'::jsonb",
    ]);
    const typeCaseStart = validator.indexOf("case block ->> 'type'");
    expect(typeCaseStart).toBeGreaterThanOrEqual(0);
    const typeCaseEnd = validator.indexOf('end case;', typeCaseStart);
    expect(typeCaseEnd).toBeGreaterThan(typeCaseStart);
    const typeCase = validator.slice(typeCaseStart, typeCaseEnd + 'end case;'.length);
    const elseStart = typeCase.lastIndexOf('else');
    expect(elseStart).toBeGreaterThanOrEqual(0);
    expect(typeCase.slice(elseStart)).toBe('else return false; end case;');
    expect(normalize(migrationSource)).toContain('check (public.is_valid_douyin_material_note_content_blocks(content_blocks))');
  });
  test('creates scoped claims and an immutable state-command ledger', async () => {
    const claims = tableDefinition(migrationSource, 'douyin_material_note_claims');
    const events = tableDefinition(migrationSource, 'douyin_material_note_command_events');
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
    expectContains(events, [
      "command in ('publish', 'archive', 'withdraw')", "request_digest ~ '^[0-9a-f]{64}$'",
      "jsonb_typeof(result) = 'object'", 'unique (tenant_id, idempotency_key)',
      'foreign key (note_id, tenant_id)', 'foreign key (created_by, tenant_id)',
    ]);
    expect(normalize(migrationSource)).toContain('before update or delete on public.douyin_material_note_command_events');
  });
  test('creates bounded listing, owned-claim and tenant-filtered search indexes', async () => {
    const sql = normalize(migrationSource);
    const compact = sql.replace(/\s*([(),])\s*/g, '$1');
    expect(compact).toContain('on public.douyin_material_notes(tenant_id,status,published_at desc,id desc)');
    expect(compact).toContain('on public.douyin_material_notes(tenant_id,updated_at desc,id desc)');
    expect(compact).toContain('on public.douyin_material_note_claims(douyin_miniapp_installation_id,subject_hash,claimed_at desc,id desc)where removed_at is null');
    expect(compact).toContain(
      'on public.douyin_material_note_claims(tenant_id,note_id)where removed_at is null',
    );
    for (const column of ['title', 'summary', 'category']) {
      expect(sql).toContain(`on public.douyin_material_note_versions using gin (${column} extensions.gin_trgm_ops)`);
    }
    expect(compact).toContain('on public.douyin_material_note_versions(tenant_id,note_id,version_no desc)');
  });
  test('enables RLS and grants only the service API role', async () => {
    const sql = normalize(migrationSource);
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
      const definition = functionDefinition(migrationSource, name);
      expect(definition).toContain('security definer');
      expect(definition).toContain('set search_path = pg_catalog, public');
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated, service_role`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`));
    }
  });
  test('seeds the three domain permissions for active tenant system admins', async () => {
    const sql = normalize(migrationSource);
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
  test('adds every historical and material event through an unvalidated shadow check', async () => {
    const sql = normalize(migrationSource);
    const eventCheck = addedCheckConstraint(migrationSource, 'marketing_events_event_name_check_material_notes');
    const expectedEvents = [
      'page_view', 'button_click', 'phone_click', 'form_submit', 'app_launch',
      'case_view', 'site_view', 'lead_cta_click', 'sms_send', 'lead_submit',
      'lead_submit_success', 'phone_call_click', 'material_preview', 'material_claim',
      'material_copy', 'material_budget_click', 'material_lead_click',
    ];
    expect(stringLiterals(eventCheck)).toEqual(expectedEvents);
    expect(eventCheck).toEndWith(') not valid;');
    expect(sql).not.toContain('drop constraint if exists marketing_events_event_name_check');
  });
  test('validates, swaps and indexes marketing events in release-safe stages', async () => {
    const validateSql = normalize(await Bun.file(validateEventConstraintMigrationFile).text());
    const swapSql = normalize(await Bun.file(swapEventConstraintMigrationFile).text());
    const indexSource = await Bun.file(eventErasureIndexMigrationFile).text();
    const indexSql = normalize(indexSource);
    expect(validateSql).toStartWith('begin;');
    expect(validateSql).toEndWith('commit;');
    expectInOrder(validateSql, [
      "set local statement_timeout = '5min'",
      'validate constraint marketing_events_event_name_check_material_notes',
      'reset statement_timeout',
      'reset lock_timeout',
      'commit;',
    ]);
    expectOmits(validateSql, ['rename constraint', 'drop constraint']);
    expect(swapSql).toStartWith('begin;');
    expect(swapSql).toEndWith('commit;');
    expect(swapSql).toContain('constraint_definition.convalidated');
    expectInOrder(swapSql, [
      "set local lock_timeout = '5s'",
      'drop constraint marketing_events_event_name_check',
      'rename constraint marketing_events_event_name_check_material_notes to marketing_events_event_name_check',
      'reset statement_timeout',
      'reset lock_timeout',
      'commit;',
    ]);
    expect(swapSql).not.toContain('validate constraint');
    const indexLines = indexSource.split(/\r?\n/);
    expect(indexLines[0]).toBe('-- gooes:migration-mode=nontransactional');
    expect(indexLines[1]).toBe(
      '-- gooes:expected-index=public.marketing_events_material_subject_erase_idx|public.marketing_events|false|btree|tenant_id,douyin_miniapp_installation_id,subject_hash|pg_catalog.uuid_ops,pg_catalog.uuid_ops,pg_catalog.text_ops|null',
    );
    expect(indexSql).toContain('create index concurrently if not exists marketing_events_material_subject_erase_idx on public.marketing_events(tenant_id, douyin_miniapp_installation_id, subject_hash)');
    expectInOrder(indexSql, [
      "set statement_timeout = '30min'",
      'create index concurrently if not exists marketing_events_material_subject_erase_idx',
      'reset statement_timeout',
      'reset lock_timeout',
    ]);
    expectOmits(indexSql, ['where ', 'begin;', 'commit;']);
  });
  test('creates notes and appends versions under tenant and actor locks', async () => {
    const create = functionDefinition(migrationSource, 'create_douyin_material_note');
    const append = functionDefinition(migrationSource, 'append_douyin_material_note_version');
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
    const body = functionDefinition(migrationSource, 'execute_douyin_material_note_state_command');
    expectContains(body, [
      "p_command not in ('publish', 'archive', 'withdraw')",
      "p_expected_status not in ('draft', 'published', 'archived', 'withdrawn')",
      'extensions.digest(convert_to(jsonb_build_object(', "'sha256'",
    ]);
    expectInOrder(body, [
      'pg_advisory_xact_lock',
      'from public.douyin_material_note_command_events',
      'return v_event.result',
      'from public.douyin_material_notes as note',
      'for update',
    ]);
    expectContains(body, [
      'v_event.request_digest is distinct from v_request_digest',
      'v_event.command is distinct from p_command', 'v_event.note_id is distinct from p_note_id',
      "message = 'material_note_idempotency_conflict'",
      'v_note.status is distinct from p_expected_status', "message = 'material_note_state_conflict'",
      "p_command = 'publish'", 'version.note_id = p_note_id', 'version.tenant_id = p_tenant_id',
    ]);
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
    const body = functionDefinition(migrationSource, 'claim_douyin_material_note');
    expectContains(body, [
      "installation.installation_kind = 'merchant'",
      "installation.authorization_status = 'active'", "tenant.status = 'active'",
    ]);
    expectInOrder(body, [
      'from public.douyin_material_notes as note',
      'for update',
      "message = 'material_note_not_found'",
      "v_note.status = 'withdrawn'",
      "message = 'material_note_withdrawn'",
      'from public.douyin_material_note_claims as claim',
      'for update',
      'v_claim.removed_at is null',
      "v_note.status <> 'published'",
    ]);
    expectContains(body, ['v_claim.removed_at is null', 'already_claimed := true']);
    const activeClaimStart = body.indexOf(
      'if found and v_claim.removed_at is null then',
    );
    const inactiveClaimStart = body.indexOf('else', activeClaimStart);
    expect(activeClaimStart).toBeGreaterThanOrEqual(0);
    expect(inactiveClaimStart).toBeGreaterThan(activeClaimStart);
    const activeClaimBranch = body.slice(activeClaimStart, inactiveClaimStart);
    expect(activeClaimBranch).not.toContain('update public.douyin_material_note_claims');
    expect(activeClaimBranch).not.toContain('claimed_at =');
    expectContains(body, [
      'set removed_at = null', 'claimed_version_id = v_note.published_version_id',
      'insert into public.douyin_material_note_claims', 'insert into public.marketing_events',
      "'material_claim'", "'note_id', p_note_id", "'claim_id', v_claim.id",
      "'version', v_version.version_no",
    ]);
    const eventStart = body.indexOf('insert into public.marketing_events');
    const returnStart = body.indexOf('return jsonb_build_object', eventStart);
    const eventSegment = body.slice(eventStart, returnStart);
    expect(eventSegment).not.toContain('content_blocks');
    expect(body).toContain("'material', jsonb_build_object(");
    for (const key of ['id', 'version', 'title', 'summary', 'category', 'applicable_to', 'content_blocks']) {
      expect(body).toContain(`'${key}'`);
    }
  });
  test('writes claim analytics only behind the mutation guard', async () => {
    const body = functionDefinition(migrationSource, 'claim_douyin_material_note');
    const eventStart = body.indexOf('insert into public.marketing_events');
    expect(eventStart).toBeGreaterThanOrEqual(0);
    const eventGuardStart = body.lastIndexOf('if ', eventStart);
    const eventGuardEnd = body.indexOf('end if;', eventStart);
    expect(eventGuardStart).toBeGreaterThanOrEqual(0);
    expect(eventGuardEnd).toBeGreaterThan(eventStart);
    expect(body.slice(eventGuardStart, eventGuardEnd)).toStartWith(
      'if v_write_event then',
    );
  });
  test('captures mutation timestamps only after command and row locks succeed', async () => {
    const append = functionDefinition(migrationSource, 'append_douyin_material_note_version');
    const command = functionDefinition(migrationSource, 'execute_douyin_material_note_state_command');
    const claim = functionDefinition(migrationSource, 'claim_douyin_material_note');
    for (const body of [append, command, claim]) {
      expect(body).toContain('v_now timestamptz;');
      expect(body).not.toContain('v_now timestamptz := clock_timestamp();');
    }
    expectInOrder(append, [
      'from public.douyin_material_notes as note',
      'for update',
      'v_now := clock_timestamp();',
      'insert into public.douyin_material_note_versions',
      'update public.douyin_material_notes',
    ]);
    expectInOrder(command, [
      'pg_advisory_xact_lock',
      'from public.douyin_material_notes as note',
      'for update',
      'v_now := clock_timestamp();',
      "if p_command = 'publish' then",
    ]);
    expectInOrder(claim, [
      'from public.douyin_material_note_claims as claim',
      'for update',
      'else',
      "v_note.status <> 'published'",
      'v_now := clock_timestamp();',
      'update public.douyin_material_note_claims',
    ]);
  });
  test('removes one claim idempotently and clears all active claims with one update', async () => {
    const remove = functionDefinition(migrationSource, 'remove_douyin_material_note_claim');
    const clear = functionDefinition(migrationSource, 'clear_douyin_material_note_claims');
    expectContains(remove, [
      'claim.id = p_claim_id', 'claim.tenant_id = p_tenant_id',
      'claim.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id',
      'claim.subject_hash = p_subject_hash', "message = 'material_note_claim_not_found'",
      'if v_claim.removed_at is null then', "jsonb_build_object('removed', true)",
    ]);
    expect(clear.match(/update public\.douyin_material_note_claims/g)?.length).toBe(1);
    expectContains(clear, [
      'removed_at is null', 'get diagnostics v_removed_count = row_count',
      "jsonb_build_object('removed_count', v_removed_count)",
    ]);
  });
  test('erases only the subject material footprint', async () => {
    const body = functionDefinition(migrationSource, 'erase_douyin_material_note_subject_data');
    expectContains(body, [
      'delete from public.douyin_material_note_claims', 'delete from public.marketing_events',
      'tenant.id = p_tenant_id', 'installation.id = p_douyin_miniapp_installation_id',
      'installation.tenant_id = p_tenant_id', "event.source = 'douyin_miniapp'",
      "event.event_name in ('material_preview', 'material_claim', 'material_copy', 'material_budget_click', 'material_lead_click')",
      'event.tenant_id = p_tenant_id',
      'event.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id',
      'event.subject_hash = p_subject_hash', 'get diagnostics v_deleted_claim_count = row_count',
      'get diagnostics v_deleted_event_count = row_count',
      "'deleted_claim_count', v_deleted_claim_count", "'deleted_event_count', v_deleted_event_count",
    ]);
    expectOmits(body, [
      "tenant.status = 'active'", "installation.installation_kind = 'merchant'",
      "installation.authorization_status = 'active'",
    ]);
  });
});
