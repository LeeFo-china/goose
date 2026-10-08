/**
 * TENANT_PHONE_TEST_DISPOSABLE=1 TENANT_PHONE_TEST_DATABASE_URL=... bun scripts/tenant-admin-phone-direct-change-smoke.ts
 * Only the owned loopback :55439/postgres disposable DB. No migrations, DDL,
 * SMS delivery, container lifecycle or dependencies. UUID-scoped fixture cleanup.
 * Complements (does not rerun) tenant-admin-phone-change-concurrency.ts's 33 cases.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SQL } from 'bun';
import { createFixture, fixtureIdentity, type PhoneFixture } from './tenant-admin-phone-change-fixture';
import {
  RPC, addIdentities, assertChanged, capture, change, cleanup, command, databaseUrl,
  label, noSms, overlap, rejected, state, type Clients, type Command,
} from './tenant-admin-phone-direct-change-helper';

async function run(): Promise<void> {
  const url = databaseUrl();
  const clients: Clients = {
    a: new SQL(url, { max: 1, connectionTimeout: 5 }),
    b: new SQL(url, { max: 1, connectionTimeout: 5 }),
    observer: new SQL(url, { max: 1, connectionTimeout: 5 }),
  };
  const db = clients.observer;
  let cases = 0;
  let failures = 0;
  const test = async (name: string, body: (f: PhoneFixture) => Promise<void>) => {
    cases++;
    const f = fixtureIdentity();
    const previousFailures = failures;
    let owned = false;
    try {
      // Detect synthetic phone collisions before creating or cleaning anything.
      const [{ available }] = await db<{ available: boolean }[]>`SELECT
        NOT EXISTS(SELECT 1 FROM public.employees WHERE btrim(phone)=ANY(${db.array(f.phones, 'TEXT')}))
        AND NOT EXISTS(SELECT 1 FROM public.sms_verification_codes WHERE phone=ANY(${db.array(f.phones, 'TEXT')})) AS available`;
      assert(available, 'SYNTHETIC_PHONE_COLLISION_RETRY_RUN');
      owned = true;
      await createFixture(db, f);
      await noSms(db, f);
      await body(f);
      await noSms(db, f);
    } catch (error) {
      failures++;
      console.error(`FAIL ${name}: ${label(error)}`);
    } finally {
      if (owned) {
        // Remember only unexpected SMS UUIDs for this invocation's prechecked
        // synthetic phones; cleanupFixture also handles any linked challenges.
        const sms = await db<{ id: string }[]>`SELECT id FROM public.sms_verification_codes
          WHERE phone=ANY(${db.array(f.phones, 'TEXT')})`;
        await cleanup(db, f);
        for (const row of sms) await db`DELETE FROM public.sms_verification_codes WHERE id=${row.id}::uuid`;
        await noSms(db, f);
      }
    }
    if (failures === previousFailures) console.log(`PASS ${name}`);
  };
  const deny = async (f: PhoneFixture, overrides: Partial<Command>, expected: string, code = 'P0001') => {
    const before = await state(db, f);
    rejected(await capture(change(clients.a, command(f, overrides))), expected, code);
    assert.deepEqual(await state(db, f), before, 'REJECTION_MUTATED_STATE');
  };
  try {
    for (const client of Object.values(clients)) {
      await client`SET statement_timeout='12s'`;
      await client`SET lock_timeout='5s'`;
    }
    const [{ present }] = await db<{ present: boolean }[]>`SELECT to_regprocedure(${RPC}) IS NOT NULL AS present`;
    assert(present, 'DIRECT_RPC_MISSING_APPLY_20261008031744');
    await test('service_role success: no SMS/challenge; versions, employee/customer/WeChat identities and audit', async (f) => {
      await addIdentities(db, f);
      const before = await state(db, f);
      const c = command(f, { version: before.employee.version, reason: '  same person direct phone regression  ' });
      await clients.a`SET ROLE service_role`;
      try { await assertChanged(db, f, c, before, await change(clients.a, c)); }
      finally { await clients.a`RESET ROLE`; }
    });
    await test('identical replay; changed payload conflict; different key stale-version conflict', async (f) => {
      const c = command(f);
      const before = await state(db, f);
      const result = await change(clients.a, c);
      await assertChanged(db, f, c, before, result);
      const committed = await state(db, f);
      assert.deepEqual(await change(clients.b, c), { ...result, idempotent: true }, 'REPLAY_RESULT_CHANGED');
      for (const overrides of [{ phone: f.phones[4] }, { reason: 'different reason' }, { employee: f.employees[1] }]) {
        rejected(await capture(change(clients.b, { ...c, ...overrides })), 'TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT');
      }
      rejected(await capture(change(clients.b, { ...c, key: randomUUID() })), 'TENANT_ADMIN_PHONE_VERSION_CONFLICT');
      assert.deepEqual(await state(db, f), committed, 'REPLAY_OR_CONFLICT_MUTATED_STATE');
    });
    await test('effective anon/authenticated ACL denial', async () => {
      // The old runner documents a PostgreSQL 17.6 crash on denied invocation;
      // inspect effective ACL under the actual roles without repeating that crash.
      for (const role of ['anon', 'authenticated']) {
        await clients.a.unsafe(`SET ROLE ${role}`); // constant allowlist only
        try {
          const [{ allowed }] = await clients.a<{ allowed: boolean }[]>`
            SELECT has_function_privilege(current_user,${RPC},'EXECUTE') AS allowed`;
          assert(allowed === false, 'UNSAFE_RPC_ACL');
        } finally { await clients.a`RESET ROLE`; }
      }
    });
    for (const actorCase of ['missing role', 'wrong user', 'stale auth', 'inactive actor'] as const) {
      await test(`actor denied: ${actorCase}`, async (f) => {
        if (actorCase === 'missing role') await db`DELETE FROM public.employee_roles WHERE employee_id=${f.actor}::uuid`;
        if (actorCase === 'inactive actor') await db`UPDATE public.employees SET status='suspended' WHERE id=${f.actor}::uuid`;
        await deny(f, actorCase === 'wrong user' ? { user: randomUUID() } : actorCase === 'stale auth' ? { authVersion: 2 } : {}, 'PLATFORM_SUPER_ADMIN_REQUIRED');
      });
    }
    await test('stale target version denied', (f) => deny(f, { version: 2 }, 'TENANT_ADMIN_PHONE_VERSION_CONFLICT'));
    for (const targetCase of ['wrong tenant', 'missing target', 'missing role', 'inactive role', 'inactive employee', 'archived tenant'] as const) {
      await test(`target denied: ${targetCase}`, async (f) => {
        if (targetCase === 'missing role') await db`DELETE FROM public.employee_roles WHERE employee_id=${f.employees[0]}::uuid`;
        if (targetCase === 'inactive role') await db`UPDATE public.roles SET status='inactive' WHERE id=${f.role}::uuid`;
        if (targetCase === 'inactive employee') await db`UPDATE public.employees SET status='suspended' WHERE id=${f.employees[0]}::uuid`;
        if (targetCase === 'archived tenant') await db`UPDATE public.tenants SET status='archived' WHERE id=${f.tenant}::uuid`;
        const current = await state(db, f);
        await deny(f, { version: current.employee.version,
          ...(targetCase === 'wrong tenant' ? { tenant: randomUUID() } : {}),
          ...(targetCase === 'missing target' ? { employee: randomUUID() } : {}),
        }, 'TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE');
      });
    }
    await test('paused/suspended tenant remains correctable', async (f) => {
      await db`UPDATE public.tenants SET status='suspended' WHERE id=${f.tenant}::uuid`;
      const before = await state(db, f);
      const c = command(f);
      await assertChanged(db, f, c, before, await change(clients.a, c));
      const [{ status }] = await db<{ status: string }[]>`SELECT status FROM public.tenants WHERE id=${f.tenant}::uuid`;
      assert(status === 'suspended', 'TENANT_STATUS_CHANGED');
    });
    for (const inputCase of ['same number', 'invalid number', 'unconfirmed', 'blank reason', 'long reason', 'invalid version'] as const) {
      await test(`invalid input: ${inputCase}`, async (f) => {
        const overrides: Partial<Command> = inputCase === 'same number' ? { phone: f.phones[1] }
          : inputCase === 'invalid number' ? { phone: 'invalid' } : inputCase === 'unconfirmed' ? { confirmed: false }
          : inputCase === 'blank reason' ? { reason: '  ' } : inputCase === 'long reason' ? { reason: 'x'.repeat(501) } : { version: 0 };
        await deny(f, overrides, 'TENANT_ADMIN_PHONE_INVALID', ['same number', 'invalid number'].includes(inputCase) ? 'P0001' : '22023');
      });
    }
    await test('normalized phone already owned by inactive ordinary employee denied', async (f) => {
      await db`INSERT INTO public.employees(id,name,phone,status)
        VALUES(${f.ordinary}::uuid,'direct phone ordinary fixture',${` ${f.phones[3]} `},'suspended')`;
      await deny(f, {}, 'TENANT_ADMIN_PHONE_CONFLICT');
    });
    await test('new phone reservation protects subsequent ordinary employee writes', async (f) => {
      const c = command(f);
      const before = await state(db, f);
      await assertChanged(db, f, c, before, await change(clients.a, c));
      const committed = await state(db, f);
      rejected(await capture(clients.b`INSERT INTO public.employees(id,name,phone,status)
        VALUES(${f.ordinary}::uuid,'direct phone ordinary fixture',${` ${c.phone} `},'pending')`), 'TENANT_ADMIN_PHONE_CONFLICT');
      assert.deepEqual(await state(db, f), committed, 'PROTECTED_PHONE_MUTATED_STATE');
    });
    await test('two SQL backends: different employees compete for same phone, exactly one commits', async (f) => {
      const c = command(f);
      const other = command(f, { employee: f.employees[1] });
      const before = await state(db, f);
      const loserBefore = await state(db, f, other.employee);
      const [a, b] = await overlap(clients, (tx) => change(tx, c), (tx) => change(tx, other));
      assert(a.ok, 'WINNER_FAILED');
      rejected(b, 'TENANT_ADMIN_PHONE_CONFLICT');
      await assertChanged(db, f, c, before, a.value);
      assert.deepEqual(await state(db, f, other.employee), loserBefore, 'RACE_LOSER_MUTATED_STATE');
      const [{ count }] = await db<{ count: number }[]>`SELECT count(*)::integer AS count FROM public.employees WHERE btrim(phone)=${c.phone}`;
      assert(count === 1, 'DUPLICATE_PHONE_AFTER_RACE');
    });
    await test('audit unique failure rolls back phone, both versions and reservation atomically', async (f) => {
      const c = command(f);
      const before = await state(db, f);
      const auditId = randomUUID();
      // Block after the RPC's initial audit lookup, then commit a competing audit
      // key. Its final INSERT must fail on the existing unique index (no DDL).
      const [a, b] = await overlap(clients, async (tx) => {
        await tx`SELECT id FROM public.employees WHERE id=${c.employee}::uuid FOR UPDATE`;
      }, (tx) => change(tx, c), async (tx) => {
        await tx`INSERT INTO public.platform_audit_logs(id,action,actor_employee_id,actor_user_id,target_tenant_id,
          resource_type,resource_id,status,summary,metadata,idempotency_key)
          VALUES(${auditId}::uuid,'tenant_admin_phone_change',${f.actor}::uuid,${f.actorUser}::uuid,${f.tenant}::uuid,
          'employee',${c.employee}::uuid,'failure','synthetic audit collision','{"fixture":"audit-collision"}'::jsonb,${c.key}::uuid)`;
      });
      assert(a.ok, 'AUDIT_COLLISION_SETUP_FAILED');
      rejected(b, '', '23505');
      assert(!b.ok && typeof b.error === 'object' && b.error !== null
        && Reflect.get(b.error, 'constraint') === 'platform_audit_logs_actor_idempotency_unique', 'WRONG_UNIQUE_CONSTRAINT');
      const after = await state(db, f);
      assert.deepEqual({ ...after, audits: before.audits }, before, 'AUDIT_FAILURE_PARTIAL_WRITE');
      const [{ ok }] = await db<{ ok: boolean }[]>`SELECT count(*)=1 AND bool_and(id=${auditId}::uuid
        AND metadata='{"fixture":"audit-collision"}'::jsonb AND status='failure') AS ok
        FROM public.platform_audit_logs WHERE actor_employee_id=${f.actor}::uuid`;
      assert(ok === true, 'AUDIT_FAILURE_LEFT_SUCCESS_OR_CHANGED_SENTINEL');
    });
    console.log(`RESULT ${cases - failures}/${cases} passed; every fixture cleanup verified`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    const closed = await Promise.allSettled(Object.values(clients).map((client) => client.close({ timeout: 2 })));
    assert(closed.every((result) => result.status === 'fulfilled'), 'DATABASE_CONNECTION_CLOSE_FAILED');
  }
}

await run().catch((error: unknown) => {
  console.error(`ABORT ${label(error)}`);
  process.exitCode = 1;
});
