import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import type { SQL } from 'bun';

export interface PhoneFixture {
  tenant: string;
  actor: string;
  actorUser: string;
  role: string;
  employees: [string, string];
  ordinary: string;
  phones: string[];
}
export interface PhoneCommand {
  employee: string;
  phone: string;
  challenge: string;
  sms: string;
  sendKey: string;
  key: string;
}
export interface PhoneResult {
  status: string;
  challenge_id?: string;
  should_send?: boolean;
  idempotent?: boolean;
  version?: number;
}

export function fixtureIdentity(): PhoneFixture {
  const prefix = `199${randomInt(100000, 999999)}`;
  return {
    tenant: randomUUID(), actor: randomUUID(), actorUser: randomUUID(),
    role: randomUUID(), employees: [randomUUID(), randomUUID()], ordinary: randomUUID(),
    phones: Array.from({ length: 10 }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`),
  };
}

export async function createFixture(db: SQL, f: PhoneFixture): Promise<void> {
  await db.begin(async (tx) => {
    const roles = await tx<{ id: string }[]>`SELECT id FROM public.roles
      WHERE tenant_id IS NULL AND code='platform_admin' AND status='active' LIMIT 1`;
    assert(roles[0], 'FIXTURE_REQUIRES_EXISTING_PLATFORM_ADMIN_ROLE');
    await tx`INSERT INTO auth.users(id) VALUES(${f.actorUser})`;
    await tx`INSERT INTO public.tenants(id,name,slug,status)
      VALUES(${f.tenant},'phone concurrency fixture',${`phone-test-${f.tenant}`},'active')`;
    await tx`INSERT INTO public.roles(id,tenant_id,code,name,status)
      VALUES(${f.role},${f.tenant},'system_admin','phone concurrency fixture','active')`;
    await tx`INSERT INTO public.employees(id,tenant_id,name,phone,user_id,status) VALUES
      (${f.actor},NULL,'phone test actor',${f.phones[0]},${f.actorUser},'active'),
      (${f.employees[0]},${f.tenant},'phone test admin A',${f.phones[1]},NULL,'active'),
      (${f.employees[1]},${f.tenant},'phone test admin B',${f.phones[2]},NULL,'active')`;
    await tx`INSERT INTO public.employee_roles(employee_id,role_id) VALUES
      (${f.actor},${roles[0].id}),(${f.employees[0]},${f.role}),(${f.employees[1]},${f.role})`;
  });
}

export async function prepareCommand(db: SQL, f: PhoneFixture, index = 0, phone = f.phones[3]): Promise<PhoneCommand> {
  const employee = f.employees[index];
  const sendKey = randomUUID();
  const rows = await db<{ result: PhoneResult }[]>`SELECT public.reserve_tenant_admin_phone_change(
    ${f.actor}::uuid,${f.actorUser}::uuid,1,${f.tenant}::uuid,${employee}::uuid,1,
    ${phone},${sendKey}::uuid,'123456',NULL,NULL) AS result`;
  assert(rows[0]?.result.status === 'sending' && rows[0].result.challenge_id, 'FIXTURE_RESERVE_FAILED');
  const challenge = rows[0].result.challenge_id;
  const complete = await db<{ result: PhoneResult }[]>`SELECT public.complete_tenant_admin_phone_change_send(
    ${f.actor}::uuid,${f.actorUser}::uuid,1,${challenge}::uuid,true) AS result`;
  assert(complete[0]?.result.status === 'ready', 'FIXTURE_SEND_FAILED');
  const sms = await db<{ sms: string }[]>`SELECT sms_verification_id AS sms
    FROM public.tenant_admin_phone_change_challenges WHERE id=${challenge}::uuid`;
  assert(sms[0], 'FIXTURE_SMS_MISSING');
  return { employee, phone, challenge, sms: sms[0].sms, sendKey, key: randomUUID() };
}

export async function confirm(db: SQL, f: PhoneFixture, c: PhoneCommand, code = '123456'): Promise<PhoneResult> {
  const rows = await db<{ result: PhoneResult }[]>`SELECT public.confirm_tenant_admin_phone_change(
    ${f.actor}::uuid,${f.actorUser}::uuid,1,${f.tenant}::uuid,${c.employee}::uuid,1,${c.phone},
    ${c.challenge}::uuid,${code},'same person concurrency test',true,${c.key}::uuid) AS result`;
  assert(rows[0], 'CONFIRM_RESULT_MISSING');
  return rows[0].result;
}

// All mutations select UUIDs belonging to this invocation. Never delete by
// phone, label, prefix, timestamp, global role, or unbounded tenant data.
export async function cleanupFixture(db: SQL, f: PhoneFixture): Promise<void> {
  const ids = [f.actor, ...f.employees, f.ordinary];
  await db.begin(async (tx) => {
    const challenges = await tx<{ id: string; sms: string }[]>`SELECT id,sms_verification_id AS sms
      FROM public.tenant_admin_phone_change_challenges
      WHERE actor_employee_id=${f.actor}::uuid AND tenant_id=${f.tenant}::uuid`;
    await tx`DELETE FROM public.platform_audit_logs WHERE actor_employee_id=${f.actor}::uuid
      AND target_tenant_id=${f.tenant}::uuid AND action='tenant_admin_phone_change'`;
    for (const c of challenges) {
      await tx`DELETE FROM public.tenant_admin_phone_change_challenges WHERE id=${c.id}::uuid`;
      await tx`DELETE FROM public.sms_verification_codes WHERE id=${c.sms}::uuid`;
    }
    for (const id of ids) {
      await tx`DELETE FROM public.tenant_admin_login_phone_reservations WHERE employee_id=${id}::uuid`;
      await tx`DELETE FROM public.employee_roles WHERE employee_id=${id}::uuid`;
      await tx`DELETE FROM public.employees WHERE id=${id}::uuid`;
    }
    await tx`DELETE FROM public.roles WHERE id=${f.role}::uuid AND tenant_id=${f.tenant}::uuid`;
    await tx`DELETE FROM public.tenants WHERE id=${f.tenant}::uuid`;
    await tx`DELETE FROM auth.users WHERE id=${f.actorUser}::uuid`;
    const residual = await tx<{ count: number }[]>`SELECT (
      (SELECT count(*) FROM public.employees WHERE id IN (${f.actor}::uuid,${f.employees[0]}::uuid,${f.employees[1]}::uuid,${f.ordinary}::uuid))+
      (SELECT count(*) FROM public.tenants WHERE id=${f.tenant}::uuid)+
      (SELECT count(*) FROM public.roles WHERE id=${f.role}::uuid)+
      (SELECT count(*) FROM auth.users WHERE id=${f.actorUser}::uuid)+
      (SELECT count(*) FROM public.tenant_admin_phone_change_challenges WHERE actor_employee_id=${f.actor}::uuid)+
      (SELECT count(*) FROM public.platform_audit_logs WHERE actor_employee_id=${f.actor}::uuid)
    )::integer AS count`;
    assert(residual[0]?.count === 0, 'FIXTURE_CLEANUP_RESIDUAL');
    for (const c of challenges) {
      const remaining = await tx<{ count: number }[]>`SELECT count(*)::integer AS count
        FROM public.sms_verification_codes WHERE id=${c.sms}::uuid`;
      assert(remaining[0]?.count === 0, 'FIXTURE_SMS_CLEANUP_RESIDUAL');
    }
  });
}

export async function assertChanged(db: SQL, f: PhoneFixture, c: PhoneCommand): Promise<void> {
  const rows = await db<{ ok: boolean }[]>`SELECT e.phone=${c.phone} AND e.version=2 AND e.admin_auth_version=2
    AND ch.status='consumed' AND s.status='verified' AND r.phone=${c.phone}
    AND (SELECT count(*)=1 FROM public.platform_audit_logs WHERE resource_id=e.id
      AND actor_employee_id=${f.actor}::uuid AND action='tenant_admin_phone_change') AS ok
    FROM public.employees e JOIN public.tenant_admin_phone_change_challenges ch ON ch.id=${c.challenge}::uuid
    JOIN public.sms_verification_codes s ON s.id=${c.sms}::uuid
    JOIN public.tenant_admin_login_phone_reservations r ON r.employee_id=e.id
    WHERE e.id=${c.employee}::uuid`;
  assert(rows[0]?.ok, 'WINNER_ATOMIC_STATE_INVALID');
}

export async function assertUnchanged(db: SQL, f: PhoneFixture, c: PhoneCommand): Promise<void> {
  const rows = await db<{ ok: boolean }[]>`SELECT e.version=1 AND e.admin_auth_version=1
    AND e.phone=${f.phones[f.employees.indexOf(c.employee) + 1]}
    AND ch.status='ready' AND s.status='pending'
    AND NOT EXISTS(SELECT 1 FROM public.platform_audit_logs WHERE resource_id=e.id AND action='tenant_admin_phone_change')
    AND NOT EXISTS(SELECT 1 FROM public.tenant_admin_login_phone_reservations WHERE employee_id=e.id) AS ok
    FROM public.employees e JOIN public.tenant_admin_phone_change_challenges ch ON ch.id=${c.challenge}::uuid
    JOIN public.sms_verification_codes s ON s.id=${c.sms}::uuid WHERE e.id=${c.employee}::uuid`;
  assert(rows[0]?.ok, 'LOSER_CHANGED_STATE');
}
