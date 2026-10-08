/**
 * Owned disposable PostgreSQL only. No migrations, SMS provider, container
 * lifecycle operations, or new dependencies. Fixtures commit and are removed by
 * selected UUID in finally. Credentials are supplied via the dedicated env var.
 * TENANT_PHONE_TEST_DISPOSABLE=1 TENANT_PHONE_TEST_DATABASE_URL=... bun scripts/tenant-admin-phone-change-concurrency.ts
 *
 * Two independent max:1 worker pools + one observer prove actual overlap using
 * pg_blocking_pids, before allowing worker A to commit. Promise.all alone cannot
 * prove concurrency. Failures are reported without SQL, phones, OTPs or URLs.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SQL } from 'bun';
import {
  assertChanged, assertUnchanged, cleanupFixture, confirm, createFixture,
  fixtureIdentity, prepareCommand, type PhoneFixture, type PhoneResult,
} from './tenant-admin-phone-change-fixture';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
const capture = async <T>(work: PromiseLike<T>): Promise<Outcome<T>> => {
  try { return { ok: true, value: await work }; }
  catch (error) { return { ok: false, error }; }
};
function deferred() {
  let resolve: () => void = () => assert.fail('DEFERRED_UNINITIALIZED');
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'UNKNOWN';
  // Bun 1.3.2 exposes PostgreSQL SQLSTATE as errno; later versions also use code.
  for (const key of ['errno', 'code']) {
    if (key in error) {
      const value = Reflect.get(error, key);
      if (typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value)) return value;
    }
  }
  return 'UNKNOWN';
}
function rejection(result: Outcome<unknown>, message: string, code = 'P0001'): void {
  assert(!result.ok, `EXPECTED_REJECTION_${message}`);
  assert(errorCode(result.error) === code, `WRONG_SQLSTATE_EXPECTED_${code}`);
  if (message) assert(result.error instanceof Error && result.error.message === message, `WRONG_REJECTION_EXPECTED_${message}`);
}
function changed(result: Outcome<PhoneResult>): void {
  assert(result.ok && result.value.status === 'changed', 'EXPECTED_CHANGED');
}

function databaseUrl(): string {
  assert(process.env.TENANT_PHONE_TEST_DISPOSABLE === '1', 'EXPLICIT_DISPOSABLE_FLAG_REQUIRED');
  const raw = process.env.TENANT_PHONE_TEST_DATABASE_URL;
  assert(raw, 'DEDICATED_DATABASE_URL_REQUIRED');
  let url: URL | undefined;
  try { url = new URL(raw); } catch { assert.fail('INVALID_DATABASE_URL'); }
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'POSTGRES_URL_REQUIRED');
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'LOOPBACK_REQUIRED');
  assert(!url.search && !url.hash, 'DATABASE_URL_OVERRIDES_FORBIDDEN');
  assert(url.port === '55439' && url.pathname === '/postgres', 'OWNED_TRIAL_DATABASE_REQUIRED');
  return raw;
}

interface Clients { a: SQL; b: SQL; observer: SQL }
async function overlap<A, B>(clients: Clients, first: (db: SQL) => Promise<A>, second: (db: SQL) => Promise<B>,
  afterBlocked?: () => Promise<void>): Promise<[Outcome<A>, Outcome<B>]> {
  const ready = deferred();
  const release = deferred();
  const [{ pid: pidA }] = await clients.a<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  const [{ pid: pidB }] = await clients.b<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
  assert(pidA !== pidB, 'DISTINCT_BACKENDS_REQUIRED');
  const operationA = capture(clients.a.begin(async (tx) => {
    const value = await first(tx);
    ready.resolve();
    await release.promise;
    return value;
  }));
  let operationB: Promise<Outcome<B>> | undefined;
  try {
    await Promise.race([ready.promise, operationA.then(() => assert.fail('FIRST_OPERATION_FAILED_BEFORE_BARRIER'))]);
    operationB = capture(clients.b.begin((tx) => second(tx)));
    let settled = false;
    void operationB.then(() => { settled = true; });
    const deadline = performance.now() + 3000;
    for (;;) {
      const [{ blocked }] = await clients.observer<{ blocked: boolean }[]>`
        SELECT ${pidA}::integer=ANY(pg_blocking_pids(${pidB}::integer)) AS blocked`;
      if (blocked) break;
      assert(!settled, 'SECOND_OPERATION_FINISHED_WITHOUT_LOCK_OVERLAP');
      assert(performance.now() < deadline, 'LOCK_OVERLAP_DEADLINE');
      await Bun.sleep(10);
    }
    if (afterBlocked) await afterBlocked();
    release.resolve();
    return [await operationA, await operationB];
  } finally {
    release.resolve();
    // Await both before UUID cleanup, including the failure path. Server-side
    // statement/lock timeouts bound all worker SQL; no orphan writes can follow.
    await Promise.allSettled([operationA, ...(operationB ? [operationB] : [])]);
  }
}

async function run(): Promise<void> {
  const url = databaseUrl();
  const clients: Clients = {
    a: new SQL(url, { max: 1, connectionTimeout: 5 }),
    b: new SQL(url, { max: 1, connectionTimeout: 5 }),
    observer: new SQL(url, { max: 1, connectionTimeout: 5 }),
  };
  let failures = 0;
  let cases = 0;
  const test = async (name: string, body: (f: PhoneFixture) => Promise<void>) => {
    cases++;
    const f = fixtureIdentity();
    const failuresBefore = failures;
    try {
      await createFixture(clients.observer, f);
      await body(f);
    } catch (error) {
      failures++;
      const label = error instanceof assert.AssertionError ? error.message.split('\n')[0] : errorCode(error);
      console.error(`FAIL ${name}: ${label}`);
    } finally {
      // A shared local server can disconnect during another task. Retry only
      // this idempotent, UUID-scoped cleanup; never retry the test operation.
      let cleaned = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await capture(cleanupFixture(clients.observer, f));
        if (result.ok) { cleaned = true; break; }
        await Bun.sleep(200);
      }
      assert(cleaned, 'FIXTURE_CLEANUP_FAILED');
    }
    if (failures === failuresBefore) console.log(`PASS ${name}`);
  };
  try {
    for (const db of [clients.a, clients.b, clients.observer]) {
      await db`SET statement_timeout='12s'`;
      await db`SET lock_timeout='5s'`;
    }
    await test('wrong OTP attempts committed and observed by another connection', async (f) => {
      const c = await prepareCommand(clients.observer, f);
      for (let i = 1; i <= 5; i++) {
        const result = await confirm(clients.a, f, c, '000000');
        assert(result.status === (i === 5 ? 'code_exhausted' : 'code_invalid'), 'OTP_STATUS');
        const rows = await clients.b<{ attempts: number }[]>`SELECT failed_attempts AS attempts
          FROM public.tenant_admin_phone_change_challenges WHERE id=${c.challenge}::uuid`;
        assert(rows[0]?.attempts === i, 'OTP_COUNTER_NOT_COMMITTED');
      }
      assert((await confirm(clients.b, f, c)).status === 'code_exhausted', 'EXHAUSTED_CODE_REUSED');
      await assertUnchanged(clients.observer, f, c);
    });
    for (const sameKey of [false, true]) {
      await test(`same employee concurrent confirmation, ${sameKey ? 'same' : 'different'} idempotency key`, async (f) => {
        const c = await prepareCommand(clients.observer, f);
        const other = { ...c, key: sameKey ? c.key : randomUUID() };
        const [a, b] = await overlap(clients, (db) => confirm(db, f, c), (db) => confirm(db, f, other));
        changed(a);
        if (sameKey) assert(b.ok && b.value.idempotent === true, 'IDEMPOTENT_REPLAY_FAILED');
        else rejection(b, 'TENANT_ADMIN_PHONE_VERSION_CONFLICT');
        await assertChanged(clients.observer, f, c);
      });
    }
    await test('same employee different proposed phones', async (f) => {
      const old = await prepareCommand(clients.observer, f);
      await clients.observer`UPDATE public.tenant_admin_phone_change_challenges
        SET created_at=clock_timestamp()-interval '61 seconds' WHERE id=${old.challenge}::uuid`;
      const current = await prepareCommand(clients.observer, f, 0, f.phones[4]);
      const [a, b] = await overlap(clients, (db) => confirm(db, f, current), (db) => confirm(db, f, old));
      changed(a); rejection(b, 'TENANT_ADMIN_PHONE_VERSION_CONFLICT');
      await assertChanged(clients.observer, f, current);
      const rows = await clients.observer<{ status: string }[]>`SELECT status FROM public.tenant_admin_phone_change_challenges WHERE id=${old.challenge}::uuid`;
      assert(rows[0]?.status === 'superseded', 'OLD_CHALLENGE_NOT_SUPERSEDED');
    });
    await test('different employees competing for the same phone', async (f) => {
      const a = await prepareCommand(clients.observer, f);
      // Age only this synthetic SMS to avoid a real 60s cooldown; both issued
      // challenges remain valid. No fabricated challenge states or disabled guards.
      await clients.observer`UPDATE public.sms_verification_codes SET created_at=clock_timestamp()-interval '61 seconds' WHERE id=${a.sms}::uuid`;
      const b = await prepareCommand(clients.observer, f, 1, a.phone);
      const [first, second] = await overlap(clients, (db) => confirm(db, f, a), (db) => confirm(db, f, b));
      changed(first); rejection(second, 'TENANT_ADMIN_PHONE_CONFLICT');
      await assertChanged(clients.observer, f, a);
      await assertUnchanged(clients.observer, f, b);
    });
    for (const operation of ['insert', 'update'] as const) {
      for (const ordinaryFirst of [false, true]) {
        for (const status of ['pending', 'active', 'suspended', 'leaved', null]) {
          await test(`ordinary ${operation} status=${status ?? 'null'} ${ordinaryFirst ? 'before' : 'after'} confirm`, async (f) => {
            const c = await prepareCommand(clients.observer, f);
            if (operation === 'update') await clients.observer`INSERT INTO public.employees(id,name,phone,status)
              VALUES(${f.ordinary}::uuid,'ordinary phone fixture',${f.phones[5]},${status})`;
            const write = async (db: SQL) => {
              // Include whitespace to exercise normalized global phone ownership.
              if (operation === 'insert') await db`INSERT INTO public.employees(id,name,phone,status)
                VALUES(${f.ordinary}::uuid,'ordinary phone fixture',${` ${c.phone} `},${status})`;
              else await db`UPDATE public.employees SET phone=${` ${c.phone} `} WHERE id=${f.ordinary}::uuid`;
            };
            if (ordinaryFirst) {
              const [a, b] = await overlap(clients, write, (db) => confirm(db, f, c));
              assert(a.ok, 'ORDINARY_WRITE_FAILED'); rejection(b, 'TENANT_ADMIN_PHONE_CONFLICT');
              await assertUnchanged(clients.observer, f, c);
            } else {
              const [a, b] = await overlap(clients, (db) => confirm(db, f, c), write);
              changed(a); rejection(b, 'TENANT_ADMIN_PHONE_CONFLICT');
              await assertChanged(clients.observer, f, c);
            }
            const rows = await clients.observer<{ count: number }[]>`SELECT count(*)::integer AS count FROM public.employees WHERE btrim(phone)=${c.phone}`;
            assert(rows[0]?.count === 1, 'DUPLICATE_PHONE_AFTER_RACE');
          });
        }
      }
    }
    for (const actor of [false, true]) {
      for (const revokeFirst of [true, false]) {
        await test(`${actor ? 'actor' : 'target'} role revoke ${revokeFirst ? 'before' : 'after'} confirm`, async (f) => {
          const c = await prepareCommand(clients.observer, f);
          const revoke = async (db: SQL) => {
            await db`DELETE FROM public.employee_roles WHERE employee_id=${actor ? f.actor : c.employee}::uuid`;
          };
          if (revokeFirst) {
            const [a, b] = await overlap(clients, revoke, (db) => confirm(db, f, c));
            assert(a.ok, 'REVOKE_FAILED');
            rejection(b, actor ? 'PLATFORM_SUPER_ADMIN_REQUIRED' : 'TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
            await assertUnchanged(clients.observer, f, c);
          } else {
            const [a, b] = await overlap(clients, (db) => confirm(db, f, c), revoke);
            changed(a); assert(b.ok, 'REVOKE_FAILED_AFTER_CONFIRM');
            await assertChanged(clients.observer, f, c);
          }
        });
      }
    }
    for (const lock of ['target', 'sms', 'phone'] as const) {
      await test(`expiry while confirmation waits for ${lock} lock`, async (f) => {
        const c = await prepareCommand(clients.observer, f);
        await clients.observer`UPDATE public.tenant_admin_phone_change_challenges
          SET expires_at=clock_timestamp()+interval '1 second' WHERE id=${c.challenge}::uuid`;
        const [a, b] = await overlap(clients, async (db) => {
          if (lock === 'target') await db`SELECT id FROM public.employees WHERE id=${c.employee}::uuid FOR UPDATE`;
          else if (lock === 'sms') await db`SELECT id FROM public.sms_verification_codes WHERE id=${c.sms}::uuid FOR UPDATE`;
          else await db`SELECT public.lock_tenant_onboarding_employee_phones(ARRAY[${c.phone}]::text[])`;
        }, (db) => confirm(db, f, c), async () => {
          // The contender is observed blocked before waiting for the DB clock.
          const deadline = performance.now() + 2500;
          for (;;) {
            const rows = await clients.observer<{ expired: boolean }[]>`SELECT expires_at<clock_timestamp() AS expired
              FROM public.tenant_admin_phone_change_challenges WHERE id=${c.challenge}::uuid`;
            if (rows[0]?.expired) break;
            assert(performance.now() < deadline, 'EXPIRY_BARRIER_DEADLINE');
            await Bun.sleep(10);
          }
        });
        assert(a.ok, 'LOCK_HOLDER_FAILED');
        if (b.ok) {
          await assertChanged(clients.observer, f, c);
          assert.fail(`EXPIRED_CHALLENGE_COMMITTED_AFTER_${lock.toUpperCase()}_LOCK`);
        }
        rejection(b, 'TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
        await assertUnchanged(clients.observer, f, c);
      });
    }
    await test('effective anon/authenticated denial and real service_role execution', async (f) => {
      const c = await prepareCommand(clients.observer, f);
      for (const role of ['anon', 'authenticated']) {
        await clients.a.unsafe(`SET ROLE ${role}`); // fixed allowlist, never user input
        try {
          // This PostgreSQL 17.6 image segfaults on actual permission-denied
          // RPC calls (both psql and Bun). Check effective privileges under the
          // real role without deliberately crashing the shared database again.
          const privileges = await clients.a<{ allowed: boolean }[]>`SELECT
            has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname IN (
              'reserve_tenant_admin_phone_change','complete_tenant_admin_phone_change_send',
              'confirm_tenant_admin_phone_change','list_tenant_admin_phone_targets')`;
          assert(privileges.length === 4 && privileges.every((p) => !p.allowed), 'UNSAFE_EFFECTIVE_RPC_ACL');
        } finally { await clients.a`RESET ROLE`; }
      }
      await clients.a`SET ROLE service_role`;
      try {
        const replay = await clients.a<{ result: PhoneResult }[]>`SELECT public.reserve_tenant_admin_phone_change(
          ${f.actor}::uuid,${f.actorUser}::uuid,1,${f.tenant}::uuid,${c.employee}::uuid,1,${c.phone},${c.sendKey}::uuid,'123456',NULL,NULL) AS result`;
        assert(replay[0]?.result.should_send === false, 'SERVICE_SEND_REPLAY');
        await clients.a`SELECT public.complete_tenant_admin_phone_change_send(${f.actor}::uuid,${f.actorUser}::uuid,1,${c.challenge}::uuid,true)`;
        await clients.a`SELECT public.list_tenant_admin_phone_targets(${f.tenant}::uuid,1,20)`;
        assert((await confirm(clients.a, f, c)).status === 'changed', 'SERVICE_CONFIRM');
      } finally { await clients.a`RESET ROLE`; }
      await assertChanged(clients.observer, f, c);
    });
    console.log(`RESULT ${cases - failures}/${cases} passed; every fixture cleanup verified`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    const closed = await Promise.allSettled(Object.values(clients).map((db) => db.close({ timeout: 2 })));
    assert(closed.every((result) => result.status === 'fulfilled'), 'DATABASE_CONNECTION_CLOSE_FAILED');
  }
}

await run().catch((error: unknown) => {
  const label = error instanceof assert.AssertionError ? error.message.split('\n')[0] : errorCode(error);
  console.error(`ABORT ${label}`);
  process.exitCode = 1;
});
