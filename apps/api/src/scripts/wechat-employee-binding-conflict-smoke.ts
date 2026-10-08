import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac, randomUUID, randomInt } from 'node:crypto';
import Fastify from 'fastify';

// Disposable loopback database only; never run this fixture against production.
async function main() {
  const url = process.env.TENANT_PHONE_TEST_DATABASE_URL;
  assert(url && process.env.TENANT_PHONE_TEST_DISPOSABLE === '1', 'explicit disposable database required');
  const parsed = new URL(url);
  assert(parsed.hostname === '127.0.0.1' && parsed.port === '55439' && parsed.pathname === '/postgres');
  const proxy = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
    const path = new URL(request.url);
    if (!path.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 404 });
    return fetch(new Request('http://127.0.0.1:55440' + path.pathname.replace('/rest/v1', '') + path.search, request));
  } });
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  const signature = createHmac('sha256', 'gooes-phone-change-local-only-secret-32').update(`${header}.${payload}`).digest('base64url');
  process.env.SUPABASE_URL = `http://127.0.0.1:${proxy.port}`;
  process.env.SUPABASE_PUBLISH = process.env.SUPABASE_SERVICE_ROLE_KEY = `${header}.${payload}.${signature}`;
  const db = new Bun.SQL(url, { max: 1 });
  const phonePrefix = `199${randomInt(1000000, 9999999)}`;
  const f = { tenant: randomUUID(), actor: randomUUID(), actorUser: randomUUID(), role: randomUUID(),
    employees: [randomUUID()] as const, phones: [phonePrefix + '1', phonePrefix + '2'] as const };
  const newUser = randomUUID();
  const openid = `binding-conflict-${randomUUID()}`;
  const app = Fastify({ logger: false });
  try {
    await db`INSERT INTO auth.users(id) VALUES(${f.actorUser}::uuid)`;
    await db`INSERT INTO public.tenants(id,name,slug,status)
      VALUES(${f.tenant}::uuid,'binding conflict fixture',${'binding-'+f.tenant},'active')`;
    await db`INSERT INTO public.roles(id,tenant_id,code,name,status)
      VALUES(${f.role}::uuid,${f.tenant}::uuid,'system_admin','binding fixture','active')`;
    await db`INSERT INTO public.employees(id,tenant_id,name,phone,user_id,status) VALUES
      (${f.actor}::uuid,null,'binding fixture superadmin',${f.phones[0]},${f.actorUser}::uuid,'active'),
      (${f.employees[0]}::uuid,${f.tenant}::uuid,'binding fixture admin',${f.phones[1]},null,'active')`;
    await db`INSERT INTO public.employee_roles(employee_id,role_id)
      SELECT ${f.actor}::uuid,id FROM public.roles WHERE tenant_id IS NULL AND code='platform_admin' AND status='active'`;
    await db`INSERT INTO public.employee_roles(employee_id,role_id) VALUES(${f.employees[0]}::uuid,${f.role}::uuid)`;
    await db`INSERT INTO auth.users(id) VALUES(${newUser}::uuid)`;
    await db`INSERT INTO public.user_oauth_identities(user_id,platform,openid)
      VALUES(${newUser}::uuid,'wechat_mini',${openid})`;
    const { wechatEmployeeIdentityService } = await import('@/services/wechat-employee-identities');
    const { bindSelectedEmployeeRole } = await import('@/services/wechat-auth-legacy/employee');
    const { default: errorHandler } = await import('@/plugins/error-handler');
    errorHandler(app);
    app.post<{ Body: { occupied: boolean } }>('/bind', async (request) => {
      const employee = await wechatEmployeeIdentityService.getEmployeeLoginCandidateById(f.employees[0]);
      assert(employee);
      const user = request.body.occupied ? f.actorUser : newUser;
      return { user: await bindSelectedEmployeeRole.call({}, request, user, f.phones[1], openid, employee) };
    });
    const conflict = await app.inject({ method: 'POST', url: '/bind', payload: { occupied: true } });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().code, 'WECHAT_EMPLOYEE_BINDING_CONFLICT');
    assert(!conflict.body.includes(f.actorUser));
    const [before] = await db`SELECT user_id,version FROM public.employees WHERE id=${f.employees[0]}::uuid`;
    assert.equal(before.user_id, null); assert.equal(before.version, 1);
    const ok = await app.inject({ method: 'POST', url: '/bind', payload: { occupied: false } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(ok.json().user, newUser);
    const [target] = await db`SELECT user_id,version FROM public.employees WHERE id=${f.employees[0]}::uuid`;
    assert.equal(target.user_id, newUser); assert.equal(target.version, 2);
    const [actor] = await db`SELECT user_id,version FROM public.employees WHERE id=${f.actor}::uuid`;
    assert.equal(actor.user_id, f.actorUser); assert.equal(actor.version, 1);
    const [membership] = await db`SELECT count(*)::int AS count FROM public.user_business_memberships
      WHERE user_id=${newUser}::uuid AND identity_id=${f.employees[0]}::uuid AND identity_type='employee' AND status='active'`;
    assert.equal(membership.count, 1);
    console.log(JSON.stringify({ real_service_and_database: true, occupied_wechat_409: true,
      platform_binding_preserved: true, fresh_wechat_binds: true, membership_created: true }));
  } finally {
    await app.close();
    await db`DELETE FROM public.user_business_memberships WHERE user_id=${newUser}::uuid`;
    await db`DELETE FROM public.user_oauth_identities WHERE user_id=${newUser}::uuid`;
    await db`DELETE FROM public.employee_roles WHERE employee_id IN (${f.actor}::uuid,${f.employees[0]}::uuid)`;
    await db`DELETE FROM public.employees WHERE id IN (${f.actor}::uuid,${f.employees[0]}::uuid)`;
    await db`DELETE FROM public.roles WHERE id=${f.role}::uuid`;
    await db`DELETE FROM public.tenants WHERE id=${f.tenant}::uuid`;
    await db`DELETE FROM auth.users WHERE id=${f.actorUser}::uuid`;
    await db`DELETE FROM auth.users WHERE id=${newUser}::uuid`;
    await db.close(); proxy.stop(true);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Binding smoke failed'); process.exitCode = 1; });
