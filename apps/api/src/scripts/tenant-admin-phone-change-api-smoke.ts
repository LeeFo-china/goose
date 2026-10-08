import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac, randomUUID, randomInt } from 'node:crypto';
import Fastify from 'fastify';

async function main() {
  const databaseUrl=process.env.TENANT_PHONE_TEST_DATABASE_URL;
  assert(databaseUrl && process.env.TENANT_PHONE_TEST_DISPOSABLE==='1','explicit disposable local database required');
  const parsed=new URL(databaseUrl);
  assert(['127.0.0.1','localhost','[::1]'].includes(parsed.hostname),'loopback database only');
  const restUrl=new URL(process.env.TENANT_PHONE_TEST_REST_URL??'http://127.0.0.1:55440');
  assert(['127.0.0.1','localhost'].includes(restUrl.hostname),'loopback REST only');
  const proxy=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request) {
    const url=new URL(request.url);
    if (!url.pathname.startsWith('/rest/v1')) return new Response(null,{status:404});
    const target=new URL(url.pathname.replace(/^\/rest\/v1/,'')+url.search,restUrl);
    return fetch(new Request(target.href,request),{redirect:'error'});
  }});
  const jwtSecret='gooes-phone-change-local-only-secret-32';
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({role:'service_role',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const signature=createHmac('sha256',jwtSecret).update(`${header}.${payload}`).digest('base64url');
  const serviceKey=`${header}.${payload}.${signature}`;
  process.env.SUPABASE_URL=`http://127.0.0.1:${proxy.port}`;
  process.env.SUPABASE_PUBLISH=serviceKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY=serviceKey;
  process.env.JWT_SECRET='gooes-tenant-phone-smoke-application-secret';
  process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE='false';
  const sql=new Bun.SQL(databaseUrl,{max:1,prepare:false});
  const ids={tenant:randomUUID(),actor:randomUUID(),actorUser:randomUUID(),employee:randomUUID(),employeeUser:randomUUID(),role:randomUUID(),customer:randomUUID(),customerUser:randomUUID()};
  const openids={employee:'phone-smoke-'+randomUUID(),customer:'phone-smoke-'+randomUUID()};
  const phoneBase='139'+String(randomInt(1000000,9000000));
  const phones={actor:phoneBase+'1',old:phoneBase+'2',next:phoneBase+'3'};
  const app=Fastify({logger:false});
  let sentCode='';
  try {
    await sql`insert into auth.users(id) values(${ids.actorUser}),(${ids.employeeUser}),(${ids.customerUser})`;
    await sql`insert into public.tenants(id,name,slug,status) values(${ids.tenant},'手机号API隔离测试',${'phone-api-'+ids.tenant},'active')`;
    await sql`insert into public.employees(id,tenant_id,name,phone,user_id,status) values
      (${ids.actor},null,'API测试超管',${phones.actor},${ids.actorUser},'active'),
      (${ids.employee},${ids.tenant},'API测试管理员',${phones.old},${ids.employeeUser},'active')`;
    await sql`insert into public.roles(id,tenant_id,code,name,status) values(${ids.role},${ids.tenant},'system_admin','系统管理员','active')`;
    await sql`insert into public.employee_roles(employee_id,role_id)
      select ${ids.actor},id from public.roles where tenant_id is null and code='platform_admin' and status='active'`;
    await sql`insert into public.employee_roles(employee_id,role_id) values(${ids.employee},${ids.role})`;
    await sql`insert into public.role_permissions(role_id,permission_id,access_scope)
      select ${ids.role},id,'all' from public.permissions where code='employee.read'`;
    await sql`insert into public.customers(id,tenant_id,name,phone,user_id) values(${ids.customer},${ids.tenant},'同号客户',${phones.old},${ids.customerUser})`;
    await sql`insert into public.user_oauth_identities(user_id,platform,openid) values
      (${ids.employeeUser},'wechat_mini',${openids.employee}),(${ids.customerUser},'wechat_mini',${openids.customer})`;
    await sql`insert into public.user_business_memberships(user_id,tenant_id,identity_type,identity_id) values
      (${ids.employeeUser},${ids.tenant},'employee',${ids.employee}),(${ids.customerUser},${ids.tenant},'customer',${ids.customer})`;
    const {default:authPlugin}=await import('@/plugins/auth');
    const {default:errorHandler}=await import('@/plugins/error-handler');
    const {default:adminController}=await import('@/controllers/admin-auth');
    const {default:employeeController}=await import('@/controllers/employee');
    const {default:customerController}=await import('@/controllers/customer-self-service');
    const {PlatformTenantAdminPhonesController}=await import('@/controllers/platform-tenant-admin-phones');
    const {PlatformTenantAdminPhoneService}=await import('@/services/platform-tenant-admin-phones');
    const {signAdminToken,signToken}=await import('@/utils/jwt');
    const service=new PlatformTenantAdminPhoneService({send:async(_phone,code)=>{sentCode=code;},assertChannel:async()=>{}});
    authPlugin(app);errorHandler(app);
    adminController.registerExtraRoutes(app);employeeController.registerExtraRoutes(app);
    customerController.registerExtraRoutes(app);
    new PlatformTenantAdminPhonesController(service).registerExtraRoutes(app);
    const actorToken=signAdminToken({sub:ids.actorUser,login_channel:'admin_web',admin_auth_version:1,roles:['employee']},{platform:true});
    const employeeToken=signAdminToken({sub:ids.employeeUser,login_channel:'admin_web',admin_auth_version:1,roles:['employee']},{platform:false});
    const headers={authorization:`Bearer ${actorToken}`};
    const businessUrl=`/employees/withdepartment/${ids.employee}`;
    const before=await app.inject({url:businessUrl,headers:{authorization:`Bearer ${employeeToken}`}});
    assert.equal(before.statusCode,200,`business before: ${before.body}`);
    const list=await app.inject({url:`/platform/tenants/${ids.tenant}/admins?pageSize=20`,headers});
    assert.equal(list.statusCode,200,`list: ${list.body}`);
    assert.equal(list.json().data.list[0].id,ids.employee);
    assert.equal(list.json().data.list[0].can_change,true);
    const prefix=`/platform/tenants/${ids.tenant}/admins/${ids.employee}/phone-change`;
    const sendInput={new_phone:phones.next,expected_version:1,idempotency_key:randomUUID()};
    const sent=await app.inject({method:'POST',url:prefix+'/send-code',headers,payload:sendInput});
    assert.equal(sent.statusCode,200,`send: ${sent.body}`);assert.match(sentCode,/^\d{6}$/);
    const confirmInput={...sendInput,idempotency_key:randomUUID(),challenge_id:sent.json().data.challenge_id,
      code:sentCode,reason:'管理员本人更换手机号',same_person_confirmed:true};
    const changed=await app.inject({method:'POST',url:prefix+'/confirm',headers,payload:confirmInput});
    assert.equal(changed.statusCode,200,`confirm: ${changed.body}`);
    assert.equal(changed.json().data.version,2);
    const replay=await app.inject({method:'POST',url:prefix+'/confirm',headers,payload:confirmInput});
    assert.equal(replay.statusCode,200);assert.equal(replay.json().data.idempotent,true);
    const stale=await app.inject({url:businessUrl,headers:{authorization:`Bearer ${employeeToken}`}});
    assert.equal(stale.statusCode,401);assert.equal(stale.json().code,'ADMIN_SESSION_REVOKED');
    const rawToken=signToken({sub:ids.employeeUser,token_type:'auth'});
    const raw=await app.inject({url:businessUrl,headers:{authorization:`Bearer ${rawToken}`}});
    assert.equal(raw.statusCode,401,'raw authentication token must not restore employee access');
    const wechatToken=signToken({sub:ids.employeeUser,openid:openids.employee,login_channel:'wechat',
      employee_id:ids.employee,tenant_id:ids.tenant,roles:['employee']});
    const wechat=await app.inject({url:businessUrl,headers:{authorization:`Bearer ${wechatToken}`}});
    assert.equal(wechat.statusCode,200,`existing WeChat employee: ${wechat.body}`);
    const customerToken=signToken({sub:ids.customerUser,openid:openids.customer,
      customer_id:ids.customer,tenant_id:ids.tenant,roles:['customer']});
    const customerContext=await app.inject({url:'/auth/me/customer-context',headers:{authorization:`Bearer ${customerToken}`}});
    assert.equal(customerContext.statusCode,200,`same-phone legacy customer: ${customerContext.body}`);
    const oldLogin=await app.inject({method:'POST',url:'/admin/auth/login',payload:{phone:phones.old,code:'123456'}});
    assert.equal(oldLogin.statusCode,404);
    await sql`insert into public.sms_verification_codes(phone,scene,code,expired_at)
      values(${phones.next},'admin_login','123456',now()+interval '5 minutes')`;
    const newLogin=await app.inject({method:'POST',url:'/admin/auth/login',payload:{phone:phones.next,code:'123456'}});
    assert.equal(newLogin.statusCode,200,`new login: ${newLogin.body}`);
    const newToken=newLogin.json().data.token;
    const current=await app.inject({url:businessUrl,headers:{authorization:`Bearer ${newToken}`}});
    assert.equal(current.statusCode,200,`new token: ${current.body}`);
    const [employee]=await sql`select user_id,phone from public.employees where id=${ids.employee}`;
    assert.equal(employee.user_id,ids.employeeUser);assert.equal(employee.phone,phones.next);
    const [customer]=await sql`select phone from public.customers where id=${ids.customer}`;
    assert.equal(customer.phone,phones.old);
    console.log(JSON.stringify({actual_api_and_database:true,sms_delivery:'injected local capture',list:true,change:true,
      idempotent:true,old_phone_rejected:true,old_token_rejected:true,raw_auth_rejected:true,
      wechat_employee_preserved:true,legacy_customer_preserved:true,new_login_and_business_request:true,identity_preserved:true}));
  } finally {
    await app.close();
    await sql`delete from public.platform_audit_logs where actor_user_id=${ids.actorUser}`;
    await sql`delete from public.tenant_admin_phone_change_challenges where employee_id=${ids.employee}`;
    await sql`delete from public.sms_verification_codes where phone in (${phones.actor},${phones.old},${phones.next})`;
    await sql`delete from public.user_business_memberships where user_id in (${ids.actorUser},${ids.employeeUser},${ids.customerUser})`;
    await sql`delete from public.user_oauth_identities where user_id in (${ids.employeeUser},${ids.customerUser})`;
    await sql`delete from public.role_permissions where role_id=${ids.role}`;
    await sql`delete from public.employee_roles where employee_id in (${ids.actor},${ids.employee})`;
    await sql`delete from public.customers where id=${ids.customer}`;
    await sql`delete from public.employees where id in (${ids.actor},${ids.employee})`;
    await sql`delete from public.roles where id=${ids.role}`;
    await sql`delete from public.tenants where id=${ids.tenant}`;
    await sql`delete from auth.users where id in (${ids.actorUser},${ids.employeeUser},${ids.customerUser})`;
    await sql.close();proxy.stop(true);
  }
}
main().catch(error=>{console.error(error instanceof Error ? error.message : 'API smoke failed');process.exitCode=1;});
