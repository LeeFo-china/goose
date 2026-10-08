import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SQL } from 'bun';
import { cleanupFixture, type PhoneFixture } from './tenant-admin-phone-change-fixture';

export const RPC = 'public.change_tenant_admin_login_phone(uuid,uuid,integer,uuid,uuid,integer,text,text,boolean,uuid)';
export interface Command {
  actor: string; user: string; authVersion: number; tenant: string; employee: string;
  version: number; phone: string; reason: string; confirmed: boolean; key: string;
}
export interface Result {
  status: string; employee_id: string; phone_masked: string;
  version: number; changed_at: string; idempotent: boolean;
}
export interface State {
  employee: { phone: string; version: number; admin_auth_version: number; [key: string]: unknown };
  roles: unknown; oauth: unknown; memberships: unknown; customer: unknown; users: unknown;
  reservations: unknown; audits: unknown;
}
export interface Clients { a: SQL; b: SQL; observer: SQL }
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
export async function capture<T>(work: PromiseLike<T>): Promise<Outcome<T>> {
  try { return { ok: true, value: await work }; }
  catch (error) { return { ok: false, error }; }
}
export function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  for (const key of ['errno', 'code']) {
    const value = Reflect.get(error, key);
    if (typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value)) return value;
  }
  return 'UNKNOWN';
}
export function rejected(result: Outcome<unknown>, message: string, code = 'P0001'): void {
  assert(!result.ok, `EXPECTED_REJECTION_${message || code}`);
  assert(errorCode(result.error) === code, `WRONG_SQLSTATE_EXPECTED_${code}_GOT_${errorCode(result.error)}`);
  if (message) assert(result.error instanceof Error && result.error.message === message, `WRONG_REJECTION_EXPECTED_${message}`);
}
export function label(error: unknown): string {
  return error instanceof assert.AssertionError ? error.message.split('\n')[0] : errorCode(error);
}
export function databaseUrl(): string {
  assert(process.env.TENANT_PHONE_TEST_DISPOSABLE === '1', 'EXPLICIT_DISPOSABLE_FLAG_REQUIRED');
  const raw = process.env.TENANT_PHONE_TEST_DATABASE_URL;
  assert(raw, 'DEDICATED_DATABASE_URL_REQUIRED');
  let url: URL;
  try { url = new URL(raw); } catch { return assert.fail('INVALID_DATABASE_URL'); }
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'POSTGRES_URL_REQUIRED');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'LOOPBACK_REQUIRED');
  assert(!url.search && !url.hash, 'DATABASE_URL_OVERRIDES_FORBIDDEN');
  assert(url.port === '55439' && url.pathname === '/postgres', 'OWNED_TRIAL_DATABASE_REQUIRED');
  return raw;
}
export function command(f: PhoneFixture, overrides: Partial<Command> = {}): Command {
  return { actor: f.actor, user: f.actorUser, authVersion: 1, tenant: f.tenant,
    employee: f.employees[0], version: 1, phone: f.phones[3],
    reason: 'same person direct phone regression', confirmed: true, key: randomUUID(), ...overrides };
}
export async function change(db: SQL, c: Command): Promise<Result> {
  const rows = await db<{ result: Result }[]>`SELECT public.change_tenant_admin_login_phone(
    ${c.actor}::uuid,${c.user}::uuid,${c.authVersion}::integer,${c.tenant}::uuid,${c.employee}::uuid,
    ${c.version}::integer,${c.phone}::text,${c.reason}::text,${c.confirmed}::boolean,${c.key}::uuid) AS result`;
  assert(rows[0]?.result, 'RPC_RESULT_MISSING');
  return rows[0].result;
}

// Full-row JSON is intentional: compare every identity field, not just IDs.
// All aggregations are bounded by the UUIDs of this tiny synthetic fixture.
export async function state(db: SQL, f: PhoneFixture, employee = f.employees[0]): Promise<State> {
  const rows = await db<{ value: State }[]>`SELECT jsonb_build_object(
    'employee',(SELECT to_jsonb(e) FROM public.employees e WHERE id=${employee}::uuid),
    'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]') FROM public.employee_roles r WHERE employee_id=${employee}::uuid),
    'oauth',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id),'[]') FROM public.user_oauth_identities o WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)),
    'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.user_business_memberships m WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)),
    'customer',(SELECT to_jsonb(c) FROM public.customers c WHERE id=${f.ordinary}::uuid),
    'users',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.id),'[]') FROM auth.users u WHERE id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)),
    'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.employee_id),'[]') FROM public.tenant_admin_login_phone_reservations r WHERE employee_id=${employee}::uuid),
    'audits',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]') FROM public.platform_audit_logs a WHERE actor_employee_id=${f.actor}::uuid AND resource_id=${employee}::uuid)
  ) AS value`;
  assert(rows[0]?.value.employee, 'TARGET_SNAPSHOT_MISSING');
  return rows[0].value;
}
export async function noSms(db: SQL, f: PhoneFixture): Promise<void> {
  const rows = await db<{ ok: boolean }[]>`SELECT
    NOT EXISTS(SELECT 1 FROM public.tenant_admin_phone_change_challenges WHERE actor_employee_id=${f.actor}::uuid OR tenant_id=${f.tenant}::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.sms_verification_codes WHERE phone=ANY(${db.array(f.phones, 'TEXT')})) AS ok`;
  assert(rows[0]?.ok, 'SMS_OR_CHALLENGE_CREATED');
}
export async function assertChanged(db: SQL, f: PhoneFixture, c: Command, before: State, result: Result): Promise<void> {
  assert(result.status === 'changed' && result.employee_id === c.employee && result.idempotent === false, 'CHANGED_RESULT');
  assert(result.phone_masked === `${c.phone.slice(0, 3)}****${c.phone.slice(-4)}`, 'MASKED_PHONE');
  assert(result.version === before.employee.version + 1 && Number.isFinite(Date.parse(result.changed_at)), 'RESULT_VERSION_TIMESTAMP');
  const after = await state(db, f, c.employee);
  assert.deepEqual(after.employee, { ...before.employee, phone: c.phone,
    version: before.employee.version + 1, admin_auth_version: before.employee.admin_auth_version + 1 }, 'EMPLOYEE_IDENTITY_OR_VERSION_CHANGED');
  for (const key of ['roles', 'oauth', 'memberships', 'customer', 'users'] as const) {
    assert.deepEqual(after[key], before[key], `IDENTITY_CHANGED_${key}`);
  }
  assert.deepEqual(after.reservations, [{ employee_id: c.employee, phone: c.phone }], 'PHONE_RESERVATION');
  const audit = await db<{ ok: boolean }[]>`SELECT count(*)=1 AND bool_and(
    actor_user_id=${c.user}::uuid AND target_tenant_id=${c.tenant}::uuid AND resource_type='employee'
    AND status='success' AND idempotency_key=${c.key}::uuid
    AND metadata->>'authorization_method'='platform_superadmin'
    AND metadata->>'old_phone'=${before.employee.phone} AND metadata->>'new_phone'=${c.phone}
    AND metadata->>'reason'=${c.reason.trim()}
    AND metadata->'request'=jsonb_build_object('tenant_id',${c.tenant}::uuid,'employee_id',${c.employee}::uuid,
      'expected_version',${c.version}::integer,'new_phone',${c.phone}::text,'reason',${c.reason.trim()}::text,'same_person_confirmed',true,
      'authorization_method','platform_superadmin')
    -- Bun 1.3.2 encodes a string parameter inferred as jsonb as a JSON string.
    -- Bind as text first so the JSON object is parsed exactly once.
    AND metadata->'result'=${JSON.stringify(result)}::text::jsonb
  ) AS ok FROM public.platform_audit_logs WHERE actor_employee_id=${f.actor}::uuid
    AND resource_id=${c.employee}::uuid AND action='tenant_admin_phone_change'`;
  assert(audit[0]?.ok === true, 'AUDIT_METHOD_REQUEST_RESULT_OR_COUNT');
  await noSms(db, f);
}
export async function addIdentities(db: SQL, f: PhoneFixture): Promise<void> {
  await db.begin(async (tx) => {
    await tx`INSERT INTO auth.users(id) VALUES(${f.employees[0]}::uuid),(${f.ordinary}::uuid)`;
    await tx`UPDATE public.employees SET user_id=${f.employees[0]}::uuid WHERE id=${f.employees[0]}::uuid`;
    await tx`INSERT INTO public.customers(id,tenant_id,name,phone,user_id)
      VALUES(${f.ordinary}::uuid,${f.tenant}::uuid,'direct phone fixture customer',${f.phones[1]},${f.ordinary}::uuid)`;
    await tx`INSERT INTO public.user_oauth_identities(user_id,platform,openid) VALUES
      (${f.employees[0]}::uuid,'wechat_mini',${`direct-${f.employees[0]}`}),(${f.ordinary}::uuid,'wechat_mini',${`direct-${f.ordinary}`})`;
    await tx`INSERT INTO public.user_business_memberships(user_id,tenant_id,identity_type,identity_id) VALUES
      (${f.employees[0]}::uuid,${f.tenant}::uuid,'employee',${f.employees[0]}::uuid),
      (${f.ordinary}::uuid,${f.tenant}::uuid,'customer',${f.ordinary}::uuid)`;
  });
}
export async function cleanup(db: SQL, f: PhoneFixture): Promise<void> {
  await db.begin(async (tx) => {
    await tx`DELETE FROM public.user_business_memberships WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)`;
    await tx`DELETE FROM public.user_oauth_identities WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)`;
    await tx`DELETE FROM public.customers WHERE id=${f.ordinary}::uuid`;
  });
  await cleanupFixture(db, f);
  await db`DELETE FROM auth.users WHERE id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)`;
  const rows = await db<{ ok: boolean }[]>`SELECT
    NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid))
    AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=${f.ordinary}::uuid)
    AND NOT EXISTS(SELECT 1 FROM public.user_oauth_identities WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid))
    AND NOT EXISTS(SELECT 1 FROM public.user_business_memberships WHERE user_id IN (${f.employees[0]}::uuid,${f.ordinary}::uuid)) AS ok`;
  assert(rows[0]?.ok, 'IDENTITY_CLEANUP_RESIDUAL');
}
function deferred() {
  let resolve: () => void = () => assert.fail('DEFERRED_UNINITIALIZED');
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
// Same proven barrier as the existing race runner; that runner is executable,
// not an importable helper. Only these two direct-RPC races need this copy.
export async function overlap<A, B>(clients: Clients, first: (db: SQL) => Promise<A>,
  second: (db: SQL) => Promise<B>, afterBlocked?: (db: SQL) => Promise<void>): Promise<[Outcome<A>, Outcome<B>]> {
  const ready = deferred();
  const release = deferred();
  const [{ pid: pidA }] = await clients.a<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  const [{ pid: pidB }] = await clients.b<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  assert(pidA !== pidB, 'DISTINCT_BACKENDS_REQUIRED');
  let lockHolder: SQL | undefined;
  const a = capture(clients.a.begin(async (tx) => {
    const result = await first(tx);
    lockHolder = tx;
    ready.resolve();
    await release.promise;
    return result;
  }));
  let b: Promise<Outcome<B>> | undefined;
  try {
    await Promise.race([ready.promise, a.then(() => assert.fail('FIRST_OPERATION_FAILED_BEFORE_BARRIER'))]);
    b = capture(clients.b.begin((tx) => second(tx)));
    let settled = false;
    void b.then(() => { settled = true; });
    const deadline = performance.now() + 3000;
    for (;;) {
      const [{ blocked }] = await clients.observer<{ blocked: boolean }[]>`
        SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB}::integer)) AS blocked`;
      if (blocked) break;
      assert(!settled, 'SECOND_OPERATION_FINISHED_WITHOUT_LOCK_OVERLAP');
      assert(performance.now() < deadline, 'LOCK_OVERLAP_DEADLINE');
      await Bun.sleep(10);
    }
    assert(lockHolder, 'LOCK_HOLDER_MISSING');
    if (afterBlocked) await afterBlocked(lockHolder);
    release.resolve();
    return [await a, await b];
  } finally {
    release.resolve();
    await Promise.allSettled([a, ...(b ? [b] : [])]);
  }
}
