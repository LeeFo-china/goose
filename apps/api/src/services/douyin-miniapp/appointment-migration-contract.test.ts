import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';

const migrationFile = new URL(
  '../../../../../supabase/migrations/20260821105000_create_douyin_measurement_appointments.sql',
  import.meta.url,
);

const repairMigrationFile = new URL(
  '../../../../../supabase/migrations/20260821105100_fix_douyin_appointment_replay_and_numbers.sql',
  import.meta.url,
);

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function topLevelSql(sql: string): string {
  return normalize(sql)
    .replace(/do \$block\$.*?\$block\$;/g, ' ')
    .replace(/create (?:or replace )?function .*?as \$function\$.*?\$function\$;/g, ' ');
}

function functionBody(sql: string, functionName: string): string {
  const normalized = normalize(sql);
  const replaceMarker = `create or replace function public.${functionName}`;
  const createMarker = `create function public.${functionName}`;
  const start = normalized.indexOf(replaceMarker) >= 0
    ? normalized.indexOf(replaceMarker)
    : normalized.indexOf(createMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = normalized.indexOf('as $function$', start);
  expect(bodyStart).toBeGreaterThan(start);
  const end = normalized.indexOf('$function$;', bodyStart + 13);
  expect(end).toBeGreaterThan(bodyStart);
  return normalized.slice(start, end + 11);
}

function tableDefinition(sql: string, tableName: string): string {
  const normalized = normalize(sql);
  const marker = `create table public.${tableName}`;
  const start = normalized.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = normalized.indexOf(');', start);
  expect(end).toBeGreaterThan(start);
  return normalized.slice(start, end + 2);
}

describe('douyin appointment migration', () => {
  test('keeps the applied 105000 migration byte-for-byte immutable', async () => {
    const sql = await Bun.file(migrationFile).arrayBuffer();
    expect(createHash('sha256').update(new Uint8Array(sql)).digest('hex')).toBe(
      '0e135bd00efcadb6d0783628047080d63bae0be4f2855bc44f19c4bb80d833b8',
    );
  });

  test('is a forward-only ordered migration without fixture DML', async () => {
    const sql = await Bun.file(migrationFile).text();
    const normalized = normalize(sql);

    expect(sql.toLowerCase()).toContain('rollback');
    expect(normalized).toContain('begin;');
    expect(normalized).toContain("set local lock_timeout = '5s'");
    expect(normalized).toContain("set local statement_timeout = '30s'");
    expect(normalized).toEndWith('commit;');
    expect(normalized).not.toContain('20260820120000');
    expect(normalized).not.toContain('create table public.douyin_miniapp_leads');
    expect(topLevelSql(sql)).not.toMatch(/insert into public\.(tenants|employees|customers)\s*\(/);
  });

  test('creates scoped appointment facts with internal idempotency and immutable request fields', async () => {
    const sql = await Bun.file(migrationFile).text();
    const table = tableDefinition(sql, 'douyin_measurement_appointments');

    for (const fragment of [
      'appointment_no text not null unique',
      'tenant_id uuid not null',
      'douyin_miniapp_installation_id uuid not null',
      'marketing_lead_id uuid not null',
      'customer_id uuid null',
      'budget_estimate_id uuid null',
      'sms_verification_code_id uuid not null unique',
      'preferred_visit_date date not null',
      'preferred_visit_period text not null',
      'community text not null',
      "status text not null default 'pending_confirmation'",
      'confirmed_visit_at timestamptz null',
      'assigned_employee_id uuid null',
      'assigned_at timestamptz null',
      'create_idempotency_key uuid not null',
      'create_request_hash bytea not null',
      "source_snapshot jsonb not null default '{}'::jsonb",
      'updated_existing boolean not null',
      'existing_customer_linked_at_submit boolean not null',
      'recent_pending_appointment_exists boolean not null',
      'version integer not null default 1',
    ]) {
      expect(table).toContain(fragment);
    }
    expect(table).not.toContain('already_submitted');
    expect(table).toContain("preferred_visit_period in ('morning', 'afternoon', 'evening')");
    expect(table).toContain("status in ('pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid')");
    expect(table).toContain('octet_length(create_request_hash) = 32');
    expect(table).toContain('jsonb_typeof(source_snapshot) = \'object\'');
    expect(table).toContain('pg_column_size(source_snapshot) <= 65536');
    expect(table).toContain('unique (douyin_miniapp_installation_id, create_idempotency_key)');
    expect(table).toContain('unique (id, tenant_id)');
    expect(table).toContain('foreign key (douyin_miniapp_installation_id, tenant_id)');
    expect(table).toContain('foreign key (marketing_lead_id, tenant_id)');
    expect(table).toContain('foreign key (customer_id, tenant_id)');
    expect(table).toContain('foreign key (budget_estimate_id, tenant_id)');
    expect(table).toContain('foreign key (assigned_employee_id, tenant_id)');
  });

  test('creates append-only follow-ups and a bounded workflow idempotency ledger', async () => {
    const sql = await Bun.file(migrationFile).text();
    const followUps = tableDefinition(sql, 'douyin_lead_follow_ups');
    const operations = tableDefinition(sql, 'douyin_lead_workflow_operations');

    for (const fragment of [
      'tenant_id uuid not null',
      'marketing_lead_id uuid not null',
      'douyin_measurement_appointment_id uuid not null',
      'employee_id uuid not null',
      'follow_up_type text not null',
      'summary text not null',
      'result text not null',
      'next_follow_up_at timestamptz null',
      'create_idempotency_key uuid not null',
      'create_request_hash bytea not null',
      'unique (tenant_id, create_idempotency_key)',
    ]) {
      expect(followUps).toContain(fragment);
    }
    expect(followUps).toContain("follow_up_type in ('phone', 'wechat', 'online_meeting', 'onsite', 'other')");
    expect(followUps).toContain('char_length(btrim(summary)) between 1 and 500');
    expect(followUps).toContain('char_length(btrim(result)) between 1 and 1000');
    expect(followUps).toContain('octet_length(create_request_hash) = 32');

    expect(operations).toContain("action in ('assign', 'convert', 'mark_invalid')");
    expect(operations).toContain('idempotency_key uuid not null');
    expect(operations).toContain('request_hash bytea not null');
    expect(operations).toContain('result_payload jsonb not null');
    expect(operations).toContain('unique (tenant_id, action, idempotency_key)');
    expect(operations).toContain('octet_length(request_hash) = 32');
    expect(operations).toContain("jsonb_typeof(result_payload) = 'object'");
    expect(operations).toContain('pg_column_size(result_payload) <= 8192');

    expect(normalize(sql)).toContain('douyin_lead_follow_up_immutable');
    expect(normalize(sql)).toContain('douyin_lead_workflow_operation_immutable');
  });

  test('extends existing lead and source tables with tenant-safe ownership', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());

    expect(sql).toContain('alter table public.marketing_leads add column assigned_employee_id uuid null');
    expect(sql).toContain('add column assigned_at timestamptz null');
    expect(sql).toContain('add column version integer not null default 1');
    expect(sql).toContain('marketing_leads_id_tenant_key unique (id, tenant_id)');
    expect(sql).toContain('customers_id_tenant_key unique (id, tenant_id)');
    expect(sql).toContain('alter table public.customer_sources add column marketing_lead_id uuid null');
    expect(sql).toContain('add column douyin_measurement_appointment_id uuid null');
    expect(sql).toContain('foreign key (marketing_lead_id, tenant_id)');
    expect(sql).toContain('foreign key (douyin_measurement_appointment_id, tenant_id)');
    expect(sql).toContain('on public.customer_sources(customer_id, douyin_measurement_appointment_id)');
    expect(sql).toContain('where douyin_measurement_appointment_id is not null');
    expect(sql).toContain('douyin_measurement_customer_source_guard');
    expect(sql).toContain('douyin_measurement_marketing_lead_guard');
  });

  test('submits an appointment with database-derived canonical idempotency and scoped ownership', async () => {
    const sql = await Bun.file(migrationFile).text();
    const body = functionBody(sql, 'submit_douyin_measurement_appointment');

    expect(body).toContain('p_attribution jsonb');
    expect(body).not.toContain('p_request_hash');
    expect(body).toContain("extensions.digest(convert_to(jsonb_build_object(");
    expect(body).toContain("'preferred_visit_date', p_preferred_visit_date");
    expect(body).toContain("'community', btrim(p_community)");
    expect(body).toContain("'demand', case when p_demand is null then null else btrim(p_demand) end");
    expect(body).toContain("'attribution', p_attribution");
    expect(body).toContain('v_appointment.create_request_hash is distinct from v_request_hash');
    expect(body).toContain("'already_submitted', true");
    expect(body).toContain("'already_submitted', false");
    expect(body).toContain("'code', 'douyin_measurement_idempotency_conflict'");

    expect(body).toContain("installation.installation_kind = 'merchant'");
    expect(body).toContain("installation.authorization_status = 'active'");
    expect(body).toContain("tenant.status = 'active'");
    expect(body).toContain("installation.runtime_config ->> 'privacy_policy_version'");
    expect(body).toContain("sms.scene = 'douyin_lead'");
    expect(body).toContain("sms.status is distinct from 'pending'");
    expect(body).toContain('sms.request_device is distinct from p_subject_hash');
    expect(body).toContain("set status = 'verified'");

    expect(body).toContain('estimate.tenant_id = p_tenant_id');
    expect(body).toContain('estimate.douyin_miniapp_installation_id = p_douyin_miniapp_installation_id');
    expect(body).toContain('estimate.subject_hash = p_subject_hash');
    expect(body).not.toContain('estimate.expires_at >');
    expect(body).toContain("lead.source = 'douyin_miniapp'");
    expect(body).toContain("lead.lead_status in ('new', 'contacted')");
    expect(body).toContain("lead.created_at >= v_now - interval '24 hours'");
    expect(body).toContain('from public.customers as customer');
    expect(body).toContain('customer.tenant_id = p_tenant_id');
    expect(body).toContain('customer.phone = p_phone');
    expect(body).not.toContain('insert into public.customers');
    expect(body).toContain('insert into public.customer_sources');
    expect(body).toContain('insert into public.marketing_events');

    for (const forbidden of [
      "'request_ip'",
      "'user_agent'",
      "'sms_code'",
      "'subject_hash'",
    ]) {
      const snapshotStart = body.indexOf('v_source_snapshot :=');
      const snapshotEnd = body.indexOf('if pg_column_size(v_source_snapshot)', snapshotStart);
      expect(body.slice(snapshotStart, snapshotEnd)).not.toContain(forbidden);
    }
  });

  test('assigns with actor scope, optimistic concurrency and cross-lead-safe replay', async () => {
    const sql = await Bun.file(migrationFile).text();
    const body = functionBody(sql, 'assign_douyin_lead');

    expect(body).toContain("'action', 'assign'");
    expect(body).toContain("'lead_id', p_marketing_lead_id");
    expect(body).toContain("'actor_employee_id', p_actor_employee_id");
    expect(body).toContain("'assigned_employee_id', p_assigned_employee_id");
    expect(body).toContain('v_operation.request_hash is distinct from v_request_hash');
    expect(body).toContain("'code', 'douyin_lead_idempotency_conflict'");
    expect(body).toContain('v_lead.version is distinct from p_expected_version');
    expect(body).toContain("'code', 'douyin_lead_version_conflict'");
    expect(body).toContain("employee.status = 'active'");
    expect(body).toContain('employee.tenant_id = p_tenant_id');
    expect(body).toContain('update public.douyin_measurement_appointments');
    expect(body).toContain("status in ('pending_confirmation', 'confirmed')");
  });

  test('appends idempotent follow-ups and enforces explicit appointment transitions', async () => {
    const sql = await Bun.file(migrationFile).text();
    const body = functionBody(sql, 'append_douyin_lead_follow_up');

    expect(body).toContain("'lead_id', p_marketing_lead_id");
    expect(body).toContain("'appointment_id', p_appointment_id");
    expect(body).toContain("'actor_employee_id', p_actor_employee_id");
    expect(body).toContain("'appointment_status', p_appointment_status");
    expect(body).toContain('v_follow_up.create_request_hash is distinct from v_request_hash');
    expect(body).toContain("'code', 'douyin_lead_idempotency_conflict'");
    expect(body).toContain('v_lead.version is distinct from p_expected_version');
    expect(body).toContain("v_appointment.status = 'pending_confirmation'");
    expect(body).toContain("p_appointment_status in ('confirmed', 'canceled', 'invalid')");
    expect(body).toContain("v_appointment.status = 'confirmed'");
    expect(body).toContain("p_appointment_status in ('completed', 'canceled', 'invalid')");
    expect(body).toContain("p_appointment_status = 'confirmed'");
    expect(body).toContain('p_confirmed_visit_at is null');
    expect(body).toContain('insert into public.douyin_lead_follow_ups');
    expect(body).toContain("lead_status = case when lead_status = 'new' then 'contacted'");
  });

  test('converts once, reuses customers by tenant phone and links every appointment source', async () => {
    const sql = await Bun.file(migrationFile).text();
    const body = functionBody(sql, 'convert_douyin_lead_to_customer');

    expect(body).toContain("'action', 'convert'");
    expect(body).toContain('v_operation.request_hash is distinct from v_request_hash');
    expect(body).toContain("v_lead.lead_status = 'invalid'");
    expect(body).toContain("v_lead.lead_status = 'converted'");
    expect(body).toContain("'repeated_conversion', true");
    expect(body).toContain('v_lead.version is distinct from p_expected_version');
    expect(body).toContain('customer.tenant_id = p_tenant_id');
    expect(body).toContain('customer.phone = v_lead.phone');
    expect(body).toContain('insert into public.customers');
    expect(body).toContain("'potential'");
    expect(body).toContain("'douyin'");
    expect(body).toContain('on conflict (tenant_id, phone) where tenant_id is not null and phone is not null do nothing');
    expect(body).toContain("lead_status = 'converted'");
    expect(body).toContain('update public.douyin_measurement_appointments');
    expect(body).toContain('insert into public.customer_sources');
    expect(body).toContain('on conflict (customer_id, douyin_measurement_appointment_id)');
  });

  test('invalidates non-converted leads without creating customers', async () => {
    const sql = await Bun.file(migrationFile).text();
    const body = functionBody(sql, 'mark_douyin_lead_invalid');

    expect(body).toContain("'action', 'mark_invalid'");
    expect(body).toContain('v_operation.request_hash is distinct from v_request_hash');
    expect(body).toContain("v_lead.lead_status = 'converted'");
    expect(body).toContain("'code', 'douyin_lead_converted_not_invalidatable'");
    expect(body).toContain('v_lead.version is distinct from p_expected_version');
    expect(body).toContain("lead_status = 'invalid'");
    expect(body).toContain("when status = 'pending_confirmation' then 'invalid'");
    expect(body).toContain("when status = 'confirmed' then 'canceled'");
    expect(body).not.toContain('insert into public.customers');
  });

  test('enables forced RLS, revokes direct writes and grants only command execution', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());

    for (const tableName of [
      'douyin_measurement_appointments',
      'douyin_lead_follow_ups',
      'douyin_lead_workflow_operations',
    ]) {
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
      expect(sql).toContain(`alter table public.${tableName} force row level security`);
      expect(sql).toContain(`revoke all on table public.${tableName} from public, anon, authenticated, service_role`);
      expect(sql).toContain(`grant select on table public.${tableName} to service_role`);
    }

    for (const command of [
      'submit_douyin_measurement_appointment',
      'assign_douyin_lead',
      'append_douyin_lead_follow_up',
      'convert_douyin_lead_to_customer',
      'mark_douyin_lead_invalid',
    ]) {
      const body = functionBody(sql, command);
      expect(body).toContain('security definer');
      expect(body).toContain('set search_path = pg_catalog, public');
      expect(sql).toContain(`revoke all on function public.${command}`);
      expect(sql).toContain('from public, anon, authenticated');
      expect(sql).toContain(`grant execute on function public.${command}`);
      expect(sql).toContain('to service_role');
    }
  });

  test('locks the five public command signatures and uses one trigger-owned version increment', async () => {
    const sql = normalize(await Bun.file(migrationFile).text());

    for (const signature of [
      'create function public.submit_douyin_measurement_appointment( p_douyin_miniapp_installation_id uuid, p_tenant_id uuid, p_phone text, p_name text, p_community text, p_preferred_visit_date date, p_preferred_visit_period text, p_budget_estimate_id uuid, p_demand text, p_sms_code text, p_idempotency_key uuid, p_subject_hash text, p_request_ip text, p_user_agent text, p_privacy_policy_version text, p_consented_at timestamptz, p_attribution jsonb ) returns jsonb',
      'create function public.assign_douyin_lead( p_tenant_id uuid, p_marketing_lead_id uuid, p_actor_employee_id uuid, p_assigned_employee_id uuid, p_expected_version integer, p_idempotency_key uuid ) returns jsonb',
      'create function public.append_douyin_lead_follow_up( p_tenant_id uuid, p_marketing_lead_id uuid, p_appointment_id uuid, p_actor_employee_id uuid, p_follow_up_type text, p_summary text, p_result text, p_next_follow_up_at timestamptz, p_appointment_status text, p_confirmed_visit_at timestamptz, p_expected_version integer, p_idempotency_key uuid ) returns jsonb',
      'create function public.convert_douyin_lead_to_customer( p_tenant_id uuid, p_marketing_lead_id uuid, p_actor_employee_id uuid, p_expected_version integer, p_idempotency_key uuid ) returns jsonb',
      'create function public.mark_douyin_lead_invalid( p_tenant_id uuid, p_marketing_lead_id uuid, p_actor_employee_id uuid, p_reason text, p_expected_version integer, p_idempotency_key uuid ) returns jsonb',
    ]) {
      expect(sql).toContain(signature);
    }

    expect(sql.match(/new\.version := old\.version \+ 1/g)).toHaveLength(2);
    expect(sql).toContain(
      'create trigger douyin_measurement_marketing_lead_guard before insert or update or delete on public.marketing_leads',
    );
    expect(sql).toContain(
      'create trigger douyin_measurement_appointment_guard before update or delete on public.douyin_measurement_appointments',
    );
    for (const command of [
      'submit_douyin_measurement_appointment',
      'assign_douyin_lead',
      'append_douyin_lead_follow_up',
      'convert_douyin_lead_to_customer',
      'mark_douyin_lead_invalid',
    ]) {
      expect(functionBody(sql, command)).not.toContain('set version =');
    }
  });

  test('adds bounded indexes for every planned list and ownership path', async () => {
    const sql = normalize(await Bun.file(migrationFile).text())
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/,\s+/g, ',');

    for (const fragment of [
      'on public.douyin_measurement_appointments(tenant_id,status,created_at desc,id desc)',
      'on public.douyin_measurement_appointments(marketing_lead_id,created_at desc,id desc)',
      'on public.douyin_measurement_appointments(tenant_id,assigned_employee_id,status,created_at desc,id desc)',
      'on public.douyin_measurement_appointments(customer_id,created_at desc,id desc)',
      'on public.douyin_lead_follow_ups(tenant_id,marketing_lead_id,created_at desc,id desc)',
      'on public.douyin_lead_follow_ups(douyin_measurement_appointment_id,created_at desc,id desc)',
      'on public.marketing_leads(tenant_id,lead_status,created_at desc,id desc)',
      "where source = 'douyin_miniapp'",
      'on public.marketing_leads(tenant_id,assigned_employee_id,lead_status,created_at desc,id desc)',
      'on public.customer_sources(marketing_lead_id)',
      'on public.customer_sources(douyin_measurement_appointment_id)',
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  test('adds an exact non-null follow-up replay payload only when history is empty', async () => {
    const sql = await Bun.file(repairMigrationFile).text();
    const normalized = normalize(sql);

    expect(normalized).toContain('if exists ( select 1 from public.douyin_lead_follow_ups ) then raise exception');
    expect(normalized).toContain("message = 'douyin_lead_follow_up_replay_repair_requires_empty_table'");
    expect(normalized).toContain('add column result_payload jsonb null');
    expect(normalized).toContain('alter column result_payload set not null');
    expect(normalized).toContain("result_payload - array[ 'action', 'result', 'follow_up_id', 'lead_id', 'appointment_id', 'lead_version', 'appointment_version', 'appointment_status', 'idempotent' ] = '{}'::jsonb");
    expect(normalized).toContain("result_payload ->> 'action' = 'follow_up'");
    expect(normalized).toContain("result_payload ->> 'result' = 'followed_up'");
    expect(normalized).toContain("result_payload ->> 'follow_up_id' = id::text");
    expect(normalized).toContain("result_payload ->> 'lead_id' = marketing_lead_id::text");
    expect(normalized).toContain("result_payload ->> 'appointment_id' = douyin_measurement_appointment_id::text");
    expect(normalized).toContain("result_payload -> 'idempotent' = 'false'::jsonb");
    expect(normalized).toContain('pg_column_size(result_payload) <= 4096');
  });

  test('replays the stored follow-up result with only the idempotent flag changed', async () => {
    const sql = await Bun.file(repairMigrationFile).text();
    const body = functionBody(sql, 'append_douyin_lead_follow_up');

    expect(body).toContain('v_follow_up.result_payload || jsonb_build_object(');
    expect(body).toContain("'idempotent', true");
    expect(body).toContain('v_follow_up.create_request_hash is distinct from v_request_hash');
    expect(body).toContain("'code', 'douyin_lead_idempotency_conflict'");
    expect(body).toContain("'lead_version', v_lead.version");
    expect(body).toContain("'appointment_version', v_appointment.version");
    expect(body).toContain("'appointment_status', v_appointment.status");
    expect(body).toContain("'idempotent', false");
    expect(body).toContain('result_payload,');
    expect(body).toContain('v_result,');
    expect(body.indexOf('update public.marketing_leads')).toBeLessThan(body.indexOf('insert into public.douyin_lead_follow_ups'));
    expect(body.indexOf('update public.douyin_measurement_appointments')).toBeLessThan(body.indexOf('insert into public.douyin_lead_follow_ups'));
    expect(body).toContain("return jsonb_build_object('data', v_result)");
  });

  test('allocates appointment numbers per Shanghai natural day from the unique index', async () => {
    const sql = await Bun.file(repairMigrationFile).text();
    const body = functionBody(sql, 'submit_douyin_measurement_appointment');

    expect(body).toContain("to_char(v_now at time zone 'asia/shanghai', 'yyyymmdd')");
    expect(body).toContain("'douyin-measurement-appointment-number:' || v_appointment_prefix");
    expect(body).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(body).toContain('appointment.appointment_no >= v_appointment_prefix || \'000001\'');
    expect(body).toContain('appointment.appointment_no <= v_appointment_prefix || \'999999\'');
    expect(body).toContain('order by appointment.appointment_no desc');
    expect(body).toContain('limit 1');
    expect(body).toContain("substring(appointment.appointment_no from 15 for 6)::integer");
    expect(body).toContain('v_number_value := coalesce(v_number_value, 0) + 1');
    expect(body).toContain("'code', 'douyin_measurement_number_exhausted'");
    expect(body).not.toContain('nextval');
    expect(body).not.toContain('douyin_measurement_appointment_number_seq');
  });

  test('allows only reviewed top-level repair statements and no business invocation', async () => {
    const sql = await Bun.file(repairMigrationFile).text();
    const topLevel = topLevelSql(sql);

    expect(topLevel).not.toMatch(/\b(insert|update|delete|merge|copy|call|select)\b/);
    const statements = topLevel.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin|set local |alter table |revoke all on function |grant execute on function |comment on |commit$)/);
    }
  });
});
