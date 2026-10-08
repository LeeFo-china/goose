import { afterEach, beforeAll, expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import type { AuthContext } from '@/services/authorization';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
let controller: typeof import('.').default;
let authorization: typeof import('@/services/authorization').authorizationService;
let platform: typeof import('@/services/platform-authorization').platformAuthorizationService;
let service: typeof import('@/services/platform-tenant-admin-phones').platformTenantAdminPhoneService;
beforeAll(async()=>{
  controller=(await import('.')).default;
  authorization=(await import('@/services/authorization')).authorizationService;
  platform=(await import('@/services/platform-authorization')).platformAuthorizationService;
  service=(await import('@/services/platform-tenant-admin-phones')).platformTenantAdminPhoneService;
});
afterEach(()=>{ for(const s of spies) s.mockRestore(); spies=[]; });
let spies: Array<{mockRestore:()=>void}>=[];
const tenant='00000000-0000-4000-8000-000000000101';
const employee='00000000-0000-4000-8000-000000000102';
const key='00000000-0000-4000-8000-000000000103';
async function app(superAdmin=true) {
  const server=Fastify();
  const auth={tenantId:null,isPlatformStaff:true,isPlatformSuperAdmin:superAdmin,employeeId:employee,
    authUserId:key,adminAuthVersion:1,permissions:[{code:'platform.tenant.read',scope:'all'}]} as unknown as AuthContext;
  spies.push(spyOn(authorization,'getRequiredAuthContext').mockResolvedValue(auth));
  spies.push(spyOn(platform,'assertPlatformSession').mockImplementation(async()=>({...auth,employeeId:employee,
    tenantId:null,isPlatformStaff:true,isPlatformSuperAdmin:superAdmin,adminAuthVersion:1})));
  controller.registerExtraRoutes(server);
  return server;
}
test('registered POST rejects non-superadmin before SMS',async()=>{
  const server=await app(false);
  const send=spyOn(service,'sendCode');spies.push(send);
  const response=await server.inject({method:'POST',url:`/platform/tenants/${tenant}/admins/${employee}/phone-change/send-code`,
    payload:{new_phone:'13999200101',expected_version:1,idempotency_key:key}});
  expect(response.statusCode).toBe(403);expect(send).not.toHaveBeenCalled();await server.close();
});
test('registered GET validates bounded pagination',async()=>{
  const server=await app();const list=spyOn(service,'list');spies.push(list);
  const response=await server.inject(`/platform/tenants/${tenant}/admins?pageSize=101`);
  expect(response.json()).toMatchObject({statusCode:400});expect(list).not.toHaveBeenCalled();await server.close();
});
test('send route passes parsed target and only server actor context',async()=>{
  const server=await app();const send=spyOn(service,'sendCode').mockResolvedValue({challenge_id:key,expires_at:new Date().toISOString(),cooldown_seconds:60});spies.push(send);
  const response=await server.inject({method:'POST',url:`/platform/tenants/${tenant}/admins/${employee}/phone-change/send-code`,
    payload:{new_phone:'13999200101',expected_version:1,idempotency_key:key}});
  expect(response.statusCode).toBe(200);expect(send.mock.calls[0]?.[0]).toEqual({tenantId:tenant,employeeId:employee});
  expect(response.json().data.challenge_id).toBe(key);await server.close();
});
test('confirmation requires same-person acknowledgement',async()=>{
  const server=await app();const confirm=spyOn(service,'confirm');spies.push(confirm);
  const response=await server.inject({method:'POST',url:`/platform/tenants/${tenant}/admins/${employee}/phone-change/confirm`,
    payload:{new_phone:'13999200101',expected_version:1,idempotency_key:key,challenge_id:key,code:'123456',reason:'测试'}});
  expect(response.statusCode).toBe(400);expect(confirm).not.toHaveBeenCalled();await server.close();
});
test.each([
  {actor_employee_id:employee}, {expected_version:1.5}, {reason:'   '},
  {same_person_confirmed:false}, {new_phone:'invalid'},
])('confirmation rejects invalid or client-supplied actor fields %j',async(invalid)=>{
  const server=await app();const confirm=spyOn(service,'confirm');spies.push(confirm);
  try {
    const response=await server.inject({method:'POST',url:`/platform/tenants/${tenant}/admins/${employee}/phone-change/confirm`,
      payload:{new_phone:'13999200101',expected_version:1,idempotency_key:key,challenge_id:key,
        code:'123456',reason:'本人换号',same_person_confirmed:true,...invalid}});
    expect(response.statusCode).toBe(400);expect(confirm).not.toHaveBeenCalled();
  } finally {await server.close();}
});
