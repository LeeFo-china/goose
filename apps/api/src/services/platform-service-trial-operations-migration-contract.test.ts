import { describe, expect, test } from 'bun:test';
const migrationsDirectory = new URL('../../../../supabase/migrations/', import.meta.url);
const minimumReleasedVersion = '20260812070956';
const normalizeSql = (sql: string) =>
  sql.replaceAll(/--.*$/gm, ' ').replaceAll(/\s+/g, ' ').trim().toLowerCase();
async function findMigration() {
  const glob = new Bun.Glob('*_create_platform_service_trial_operations.sql');
  const names = await Array.fromAsync(glob.scan({
    cwd: migrationsDirectory.pathname,
    onlyFiles: true,
  }));
  const name = names.sort().at(-1) ?? '';
  return {
    name,
    text: name ? await Bun.file(new URL(name, migrationsDirectory)).text() : '',
  };
}
function functionDefinition(sql: string, name: string) {
  return sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? '';
}
function functionBody(sql: string, name: string) {
  const definition = functionDefinition(sql, name);
  const start = definition.indexOf('\nAS $$\n');
  const end = definition.lastIndexOf('\n$$;');
  return normalizeSql(start < 0 || end < 0 ? '' : definition.slice(start, end));
}
function expectServiceRoleOnly(sql: string, signature: string) {
  const normalized = normalizeSql(sql);
  for (const role of ['public', 'anon', 'authenticated']) {
    expect(normalized).toContain(`revoke all on function ${signature} from ${role};`);
    expect(normalized).not.toContain(`grant execute on function ${signature} to ${role};`);
  }
  expect(normalized).toContain(`grant execute on function ${signature} to service_role;`);
}
describe('platform service trial operations migration', () => {
  test('[Task 2A] uses one collision-safe forward migration after the latest released version', async () => {
    const migration = await findMigration();
    expect(migration.name).toMatch(/^\d{14}_create_platform_service_trial_operations\.sql$/);
    expect(migration.name.slice(0, 14).localeCompare(minimumReleasedVersion)).toBeGreaterThan(0);
    expect(migration.text).not.toBe('');
    expect(migration.text.toLowerCase()).toContain('forward-only');
    expect(migration.text.toLowerCase()).toContain('manual dml');
  });
  test('[Task 2A] fails closed on missing prerequisites or any partial/replayed schema before DDL', async () => {
    const sql = normalizeSql((await findMigration()).text);
    const begin = sql.indexOf('begin;');
    const preflight = sql.indexOf('service_trial_operations_history_invalid');
    const locks = sql.indexOf('lock table public.roles');
    const ddl = sql.indexOf('create table public.platform_service_trial_operations_state');
    expect(preflight).toBeGreaterThan(begin);
    expect(locks).toBeGreaterThan(preflight);
    expect(ddl).toBeGreaterThan(locks);
    expect(sql.slice(begin, ddl)).not.toMatch(
      /\b(?:create|alter|drop)\s+(?:table|index|policy|trigger|function)\b/,
    );
    for (const prerequisite of [
      'public.tenants',
      'public.employees',
      'public.roles',
      'public.permissions',
      'public.employee_roles',
      'public.role_permissions',
      'public.employee_permission_overrides',
      'public.notifications',
      'public.tenant_service_trials',
      'public.tenant_service_trial_events',
    ]) expect(sql.slice(begin, locks)).toContain(`'${prerequisite}'`);
    expect(sql.slice(begin, locks)).toContain(
      "to_regprocedure('public.platform_service_trial_lock_platform_actor(uuid,text[])')",
    );
    expect(sql.slice(begin, locks)).toContain(
      "to_regprocedure('public.platform_service_trial_normalize_effective_status(uuid,uuid,timestamp with time zone)')",
    );
    expect(sql.slice(begin, locks)).toContain("to_regprocedure('extensions.digest(text,text)')");
    expect(sql.slice(begin, locks)).toContain("to_regprocedure('extensions.gen_random_bytes(integer)')");
    expect(sql.slice(begin, locks)).toContain('information_schema.columns');
    expect(sql.slice(begin, locks)).toContain('pg_proc');
    expect(sql.slice(begin, locks)).toContain('pg_trigger');
    expect(sql.slice(begin, locks)).toContain('pg_constraint');
    expect(sql.slice(begin, locks)).toContain("detail = 'partial or replayed service-trial operations schema detected'");
    expect(sql.slice(begin, locks)).toContain('hint =');
  });
  test('[Task 2A] takes all referenced and altered table locks up front in canonical order', async () => {
    const sql = normalizeSql((await findMigration()).text);
    const roles = sql.indexOf('lock table public.roles');
    const permissions = sql.indexOf('lock table public.permissions', roles);
    const employees = sql.indexOf('lock table public.employees', permissions);
    const memberships = sql.indexOf('lock table public.employee_roles', employees);
    const rolePermissions = sql.indexOf('lock table public.role_permissions', memberships);
    const overrides = sql.indexOf('lock table public.employee_permission_overrides', rolePermissions);
    const tenants = sql.indexOf('lock table public.tenants', overrides);
    const trials = sql.indexOf('lock table public.tenant_service_trials', tenants);
    const events = sql.indexOf('lock table public.tenant_service_trial_events', trials);
    const ddl = sql.indexOf('create table public.platform_service_trial_operations_state');
    for (const position of [
      roles, permissions, employees, memberships, rolePermissions, overrides,
      tenants, trials, events,
    ]) expect(position).toBeGreaterThan(-1);
    expect(permissions).toBeGreaterThan(roles);
    expect(employees).toBeGreaterThan(permissions);
    expect(memberships).toBeGreaterThan(employees);
    expect(rolePermissions).toBeGreaterThan(memberships);
    expect(overrides).toBeGreaterThan(rolePermissions);
    expect(tenants).toBeGreaterThan(overrides);
    expect(trials).toBeGreaterThan(tenants);
    expect(events).toBeGreaterThan(trials);
    expect(ddl).toBeGreaterThan(events);
    expect(sql.slice(ddl)).not.toContain('lock table public.');
  });
  test('[Task 2A] creates exact follow-up facts with binary checks and only controlled cancellation fields', async () => {
    const sql = normalizeSql((await findMigration()).text);
    const table = sql.slice(
      sql.indexOf('create table public.tenant_service_trial_followups'),
      sql.indexOf('create table public.tenant_service_trial_notification_deliveries'),
    );
    for (const field of [
      'id uuid primary key default gen_random_uuid()',
      'trial_id uuid not null',
      'tenant_id uuid not null',
      'follow_up_type text not null',
      "status text not null default 'completed'",
      'summary text not null',
      'result text not null',
      'next_follow_up_at timestamptz null',
      'created_by_employee_id uuid not null',
      'create_idempotency_key uuid not null',
      'create_request_hash bytea not null',
      'canceled_at timestamptz null',
      'canceled_by_employee_id uuid null',
      'cancel_idempotency_key uuid null',
      'cancel_request_hash bytea null',
      'created_at timestamptz not null',
    ]) expect(table).toContain(field);
    expect(table).toContain(
      'foreign key (trial_id, tenant_id) references public.tenant_service_trials(id, tenant_id)',
    );
    expect(table).toContain(
      'created_by_employee_id uuid not null references public.employees(id) on delete restrict',
    );
    expect(table).toContain(
      'canceled_by_employee_id uuid null references public.employees(id) on delete restrict',
    );
    expect(table).toContain("follow_up_type in ('phone', 'wechat', 'online_meeting', 'onsite', 'other')");
    expect(table).toContain("status in ('pending', 'completed', 'canceled')");
    expect(table).toContain("char_length(btrim(summary)) between 1 and 500");
    expect(table).toContain("char_length(btrim(result)) between 1 and 1000");
    expect(table).toContain("status <> 'pending' or next_follow_up_at is not null");
    expect(table).toContain('octet_length(create_request_hash) = 32');
    expect(table).toContain('octet_length(cancel_request_hash) = 32');
    expect(table).toContain("status = 'canceled'");
    expect(table).toContain('canceled_at is not null');
    expect(table).toContain('canceled_by_employee_id is not null');
    expect(table).toContain('cancel_idempotency_key is not null');
    expect(table).toContain('cancel_request_hash is not null');
    expect(table).toContain("status <> 'canceled'");
    expect(table).toContain('canceled_at is null');
    expect(table).toMatch(/check \(\(.*?\) is true\)/);
    expect(table).not.toContain('assigned_to');
    expect(table).not.toContain('due_date');
    expect(sql).toContain(
      'unique (trial_id, create_idempotency_key)',
    );
    expect(sql).toContain(
      'create unique index tenant_service_trial_followups_cancel_idempotency_idx on public.tenant_service_trial_followups (trial_id, cancel_idempotency_key) where cancel_idempotency_key is not null',
    );
    expect(sql).toContain(
      'create index tenant_service_trial_followups_trial_created_idx on public.tenant_service_trial_followups (trial_id, created_at desc, id desc)',
    );
    expect(sql).toContain(
      'create index tenant_service_trial_followups_next_status_idx on public.tenant_service_trial_followups (next_follow_up_at, status)',
    );
  });

  test('[Task 2A] creates and cancels follow-ups with normalized idempotency and canonical locks', async () => {
    const migration = await findMigration();
    const create = functionBody(migration.text, 'platform_service_trial_create_follow_up');
    const cancel = functionBody(migration.text, 'platform_service_trial_cancel_follow_up');
    for (const body of [create, cancel]) {
      expect(body.match(/clock_timestamp\(\)/g)?.length).toBe(1);
      expect(body).toContain('platform_service_trial_lock_platform_actor');
      expect(body).toContain("array['platform.service_trial.manage']::text[]");
      expect(body).toContain('platform_service_trial_normalize_effective_status');
      expect(body.indexOf('platform_service_trial_lock_platform_actor')).toBeLessThan(
        body.indexOf('platform_service_trial_normalize_effective_status'),
      );
      expect(body).not.toContain('application_reason');
      expect(body).not.toContain('contact_phone');
      expect(body).not.toContain('update public.tenant_service_trials');
    }
    expect(cancel).toContain('for update');
    for (const input of [
      'p_actor_employee_id is null', 'p_trial_id is null', 'p_tenant_id is null',
      'p_idempotency_key is null',
    ]) expect(create).toContain(input);
    expect(create).toContain("p_status not in ('pending', 'completed')");
    expect(create).toContain("p_status = 'pending' and p_next_follow_up_at is null");
    expect(create).toContain('char_length(btrim(p_summary)) not between 1 and 500');
    expect(create).toContain('char_length(btrim(p_result)) not between 1 and 1000');
    expect(create).not.toContain("trial_type = 'guided'");
    expect(create).toContain('extensions.digest');
    expect(create).toContain('on conflict (trial_id, create_idempotency_key) do nothing');
    expect(create).toContain('create_request_hash is distinct from v_request_hash');
    expect(create).toContain('service_trial_idempotency_conflict');
    expect(create).toContain("'trial_follow_up_created'");
    expect(create).toContain("v_event_metadata - array['follow_up_id', 'status', 'follow_up_type'] = '{}'::jsonb");
    expect(create).toContain('pg_column_size');
    for (const input of [
      'p_actor_employee_id is null', 'p_trial_id is null', 'p_tenant_id is null',
      'p_follow_up_id is null', 'p_idempotency_key is null',
    ]) expect(cancel).toContain(input);
    expect(cancel).toContain("v_follow_up.status = 'canceled'");
    expect(cancel).toContain('cancel_idempotency_key is not distinct from p_idempotency_key');
    expect(cancel).toContain('cancel_request_hash is distinct from v_request_hash');
    expect(cancel).toContain("'platform_service_trial_follow_up_cancel:'");
    expect(cancel).toContain('cancel_idempotency_key = p_idempotency_key');
    expect(cancel).toContain("v_follow_up.status <> 'pending'");
    expect(cancel).toContain("status = 'canceled'");
    expect(cancel).toContain("'trial_follow_up_canceled'");
    expect(cancel).toContain("v_event_metadata - array['follow_up_id', 'status', 'follow_up_type'] = '{}'::jsonb");
  });

  test('[Task 2A] extends immutable event types without editing released history', async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    expect(sql).toContain('drop constraint tenant_service_trial_events_event_type_check');
    for (const event of ['trial_follow_up_created', 'trial_follow_up_canceled']) {
      expect(sql).toContain(`'${event}'`);
    }
    for (const existing of [
      'application_submitted', 'application_withdrawn', 'application_approved',
      'application_rejected', 'trial_granted', 'trial_activated',
      'trial_grace_started', 'trial_expired', 'trial_extended', 'trial_revoked',
      'trial_assigned', 'formal_purchase_attributed', 'conversion_anomaly',
    ]) expect(sql).toContain(`'${existing}'`);
  });

  test('[Task 2B] enqueues only the approved immediate mappings', async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    const enqueue = functionBody(migration.text, 'platform_service_trial_enqueue_event_notification');
    for (const mapping of [
      "'application_submitted' then 'application_submitted'",
      "'application_approved' then 'approved'",
      "'application_rejected' then 'rejected'",
      "'trial_extended' then 'extended'",
      "'trial_revoked' then 'revoked'",
      "'formal_purchase_attributed' then 'converted'",
    ]) expect(enqueue).toContain(mapping);
    expect(enqueue).not.toContain("'trial_granted' then");
    expect(enqueue).not.toContain("'trial_activated' then");
    expect(sql).toContain(
      'after insert on public.tenant_service_trial_events',
    );
    expect(sql).not.toContain('insert into public.tenant_service_trial_notification_deliveries select event.');
  });

  test('[Task 2B] resolves active recipients with explicit deny precedence and deduplication', async () => {
    const enqueue = functionBody(
      (await findMigration()).text,
      'platform_service_trial_enqueue_event_notification',
    );
    expect(enqueue).toContain("new.event_type = 'application_submitted'");
    expect(enqueue).toContain("permission.code = 'platform.service_trial.review'");
    expect(enqueue).toContain("employee.tenant_id is null");
    expect(enqueue).toContain("employee.status = 'active'");
    expect(enqueue).toContain("role.tenant_id is null");
    expect(enqueue).toContain("role.status = 'active'");
    expect(enqueue).toContain("role_permission.access_scope = 'all'");
    expect(enqueue).toContain("override_record.effect = 'deny'");
    expect(enqueue).toContain("override_record.effect = 'allow'");
    expect(enqueue).toContain("override_record.access_scope = 'all'");
    expect(enqueue).toContain('not exists');
    expect(enqueue).toContain("role.code = 'system_admin'");
    expect(enqueue).toContain('trial.requested_by_employee_id');
    expect(enqueue).toContain('trial.assignee_employee_id');
    expect(enqueue).toContain('select distinct');
  });

  test('[Task 2B] creates a minimal delivery ledger with exact lease, sent, identity and ACL checks', async () => {
    const sql = normalizeSql((await findMigration()).text);
    const table = sql.slice(
      sql.indexOf('create table public.tenant_service_trial_notification_deliveries'),
      sql.indexOf('create index tenant_service_trial_followups_next_status_idx'),
    );
    for (const field of [
      'trial_id uuid not null', 'tenant_id uuid not null', 'event_type text not null',
      'target_date date not null', 'recipient_employee_id uuid not null',
      'due_at timestamptz not null', "status text not null default 'pending'",
      'lease_token uuid null', 'lease_expires_at timestamptz null',
      'attempt_count integer not null default 0', 'retry_at timestamptz null',
      'notification_id uuid null', 'last_error_code text null',
      'sent_at timestamptz null', 'created_at timestamptz not null',
      'updated_at timestamptz not null',
    ]) expect(table).toContain(field);
    expect(table).toContain(
      'unique (trial_id, event_type, target_date, recipient_employee_id)',
    );
    expect(table).toContain("status in ('pending', 'processing', 'sent', 'failed')");
    expect(table).toContain("status = 'processing'");
    expect(table).toContain('lease_token is not null');
    expect(table).toContain('lease_expires_at is not null');
    expect(table).toContain("status <> 'processing'");
    expect(table).toContain('lease_token is null');
    expect(table).toContain("status = 'sent'");
    expect(table).toContain('sent_at is not null');
    expect(table).toContain("status <> 'sent'");
    expect(table).toContain('sent_at is null');
    expect(table).toContain('char_length(last_error_code) <= 64');
    expect(table).toMatch(/check \(\(.*?\) is true\)/);
    expect(table).not.toContain('phone');
    expect(table).not.toContain('content');
    expect(table).not.toContain('title');
    for (const index of [
      'tenant_service_trial_followups_next_status_idx',
      'tenant_service_trial_notifications_due_claim_idx',
      'tenant_service_trial_notifications_lease_idx',
      'tenant_service_trial_notifications_trial_event_idx',
    ]) expect(sql).toContain(`create index ${index}`);
    expect(sql).toContain('create unique index notifications_service_trial_delivery_unique_idx');
    for (const tableName of [
      'tenant_service_trial_followups',
      'tenant_service_trial_notification_deliveries',
    ]) {
      expect(sql).toContain(`alter table public.${tableName} enable row level security`);
      expect(sql).toContain(`alter table public.${tableName} force row level security`);
      for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
        expect(sql).toContain(`revoke all on table public.${tableName} from ${role};`);
      }
      expect(sql).toContain(`grant select on table public.${tableName} to service_role;`);
    }
  });
  test('[Task 2B] uses cutover and immutable policy snapshots for only future time boundaries', async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    expect(sql).toContain('create table public.platform_service_trial_operations_state');
    expect(sql).toContain('cutover_at timestamptz not null');
    expect(sql).toContain('insert into public.platform_service_trial_operations_state');
    expect(sql).toContain('clock_timestamp()');
    const enqueue = functionBody(
      migration.text,
      'platform_service_trial_enqueue_due_notifications',
    );
    expect(enqueue.match(/clock_timestamp\(\)/g)?.length).toBe(1);
    expect(enqueue).toContain("trial.policy_snapshot->'reminder_days'");
    expect(enqueue).not.toContain('platform_service_trial_policies');
    for (const event of [
      'expires_in_7_days', 'expires_in_3_days', 'expires_in_1_day',
      'entered_grace', 'expired',
    ]) expect(enqueue).toContain(`'${event}'`);
    expect(enqueue).toContain('boundary.due_at > state.cutover_at');
    expect(enqueue).toContain('boundary.created_at >= state.cutover_at');
    expect(enqueue).toContain("trial.status not in ('converted', 'revoked', 'rejected', 'withdrawn')");
    expect(enqueue).toContain('trial.trial_ends_at');
    expect(enqueue).toContain('trial.grace_ends_at');
    expect(enqueue).toContain("interval '1 day'");
  });

  test('[Task 2B] claims a bounded stable batch with reclaimable cryptographic leases', async () => {
    const migration = await findMigration();
    const claim = functionBody(
      migration.text,
      'platform_service_trial_claim_notification_deliveries',
    );
    expect(claim.match(/clock_timestamp\(\)/g)?.length).toBe(1);
    expect(claim).toContain('platform_service_trial_enqueue_due_notifications');
    expect(claim).toContain('p_limit between 1 and 100');
    expect(claim).toContain('limit least(p_limit, 100)');
    expect(claim).toContain('for update skip locked');
    expect(claim).toContain("delivery.status in ('pending', 'failed')");
    expect(claim).toContain("delivery.status = 'processing'");
    expect(claim).toContain('delivery.lease_expires_at <= v_now');
    expect(claim).toContain('extensions.gen_random_bytes(16)');
    expect(claim).toContain("status = 'processing'");
    expect(claim).toContain("interval '2 minutes'");
    expect(claim).toContain('order by');
    expect(claim).toContain('coalesce(delivery.retry_at, delivery.due_at)');
    expect(claim).toContain('delivery.id');
    for (const field of [
      'delivery_id', 'lease_token', 'trial_id', 'tenant_id', 'recipient_employee_id',
      'event_type', 'source', 'trial_status', 'starts_at', 'trial_ends_at',
      'grace_ends_at',
    ]) expect(functionDefinition(migration.text,
      'platform_service_trial_claim_notification_deliveries')).toContain(field);
    expect(claim).not.toContain('contact_phone');
    expect(claim).not.toContain('application_reason');
    expect(claim).not.toContain('summary');
    expect(claim).not.toContain('result');
  });

  test('[Task 2B] completes or fails only an active matching lease with safe bounded replay facts', async () => {
    const migration = await findMigration();
    const complete = functionBody(
      migration.text,
      'platform_service_trial_complete_notification_delivery',
    );
    const fail = functionBody(
      migration.text,
      'platform_service_trial_fail_notification_delivery',
    );
    for (const body of [complete, fail]) {
      expect(body.match(/clock_timestamp\(\)/g)?.length).toBe(1);
      expect(body).toContain('for update');
      expect(body).toContain('lease_token');
      expect(body).toContain('lease_expires_at');
      expect(body).toContain('service_trial_notification_lease_invalid');
    }
    expect(complete).toContain("v_delivery.status = 'sent'");
    expect(complete).toContain("status = 'sent'");
    expect(complete).toContain('notification_id = p_notification_id');
    expect(complete).toContain('sent_at = v_now');
    expect(complete).toContain('lease_token = null');
    expect(complete).toContain('lease_expires_at = null');
    expect(fail).toContain("p_error_code !~ '^[a-z][a-z0-9_]{0,63}$'");
    expect(fail).toContain('least(v_delivery.attempt_count + 1, 10)');
    expect(fail).toContain("interval '1 minute'");
    expect(fail).toContain("interval '1 hour'");
    expect(fail).toContain('retry_at =');
    expect(fail).toContain('last_error_code = p_error_code');
    expect(fail).not.toContain('p_last_error');
  });

  test('[Task 2B] uses service-role-only delivery RPCs and private mutation helpers', async () => {
    const sql = (await findMigration()).text;
    for (const signature of [
      'public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid)',
      'public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid)',
      'public.platform_service_trial_claim_notification_deliveries(integer)',
      'public.platform_service_trial_complete_notification_delivery(uuid, uuid, uuid)',
      'public.platform_service_trial_fail_notification_delivery(uuid, uuid, text)',
    ]) expectServiceRoleOnly(sql, signature);
    const normalized = normalizeSql(sql);
    for (const helper of [
      'public.platform_service_trial_protect_follow_up()',
      'public.platform_service_trial_protect_notification_delivery()',
      'public.platform_service_trial_enqueue_event_notification()',
      'public.platform_service_trial_enqueue_due_notifications(timestamp with time zone)',
    ]) {
      for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
        expect(normalized).toContain(`revoke all on function ${helper} from ${role};`);
      }
      expect(normalized).not.toContain(`grant execute on function ${helper}`);
    }
    expect(normalized).toContain('before update or delete on public.tenant_service_trial_followups');
    expect(normalized).toContain('before update or delete on public.tenant_service_trial_notification_deliveries');
    for (const definition of [
      'platform_service_trial_create_follow_up',
      'platform_service_trial_cancel_follow_up',
      'platform_service_trial_claim_notification_deliveries',
      'platform_service_trial_complete_notification_delivery',
      'platform_service_trial_fail_notification_delivery',
    ]) {
      expect(normalizeSql(functionDefinition(sql, definition))).toContain(
        'security definer set search_path = public, pg_temp',
      );
    }
  });

  test('[Task 2A] protects follow-up facts and exposes only SELECT plus command RPCs', async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    const protect = functionBody(migration.text, 'platform_service_trial_protect_follow_up');
    const cancel = functionBody(migration.text, 'platform_service_trial_cancel_follow_up');
    expect(sql).toContain('alter table public.tenant_service_trial_followups enable row level security');
    expect(sql).toContain('alter table public.tenant_service_trial_followups force row level security');
    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toContain(
        `revoke all on table public.tenant_service_trial_followups from ${role};`,
      );
      expect(sql).toContain(
        `revoke all on function public.platform_service_trial_protect_follow_up() from ${role};`,
      );
    }
    expect(sql).toContain('grant select on table public.tenant_service_trial_followups to service_role;');
    expect(sql).not.toContain('grant update on table public.tenant_service_trial_followups');
    expect(sql).not.toContain('grant delete on table public.tenant_service_trial_followups');
    expect(sql).toContain('before update or delete on public.tenant_service_trial_followups');
    expect(protect).toContain("tg_op = 'delete'");
    expect(protect).toContain("old.status <> 'pending'");
    expect(protect).toContain("new.status <> 'canceled'");
    expect(protect).toContain('new.summary is distinct from old.summary');
    expect(protect).toContain('new.result is distinct from old.result');
    expect(protect).toContain("current_setting('app.platform_service_trial_follow_up_guard', true)");
    expect(cancel).toContain("set_config('app.platform_service_trial_follow_up_guard'");
    expect(cancel.match(/set_config\('app\.platform_service_trial_follow_up_guard'/g)?.length)
      .toBeGreaterThanOrEqual(3);
    for (const signature of [
      'public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid)',
      'public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid)',
    ]) expectServiceRoleOnly(migration.text, signature);
    for (const definition of [
      'platform_service_trial_create_follow_up',
      'platform_service_trial_cancel_follow_up',
    ]) expect(normalizeSql(functionDefinition(migration.text, definition))).toContain(
      'security definer set search_path = public, pg_temp',
    );
  });
});
