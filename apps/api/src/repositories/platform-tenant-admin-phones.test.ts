import { expect, test, beforeAll, mock } from 'bun:test';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
let Repository: typeof import('./platform-tenant-admin-phones').PlatformTenantAdminPhoneRepository;
beforeAll(async()=>{Repository=(await import('./platform-tenant-admin-phones')).PlatformTenantAdminPhoneRepository;});
const id='00000000-0000-4000-8000-000000000101';
const command={target:{tenantId:id,employeeId:id},actor:{employeeId:id,authUserId:id,adminAuthVersion:1},input:{new_phone:'13999200101',expected_version:1,reason:'本人换号',same_person_confirmed:true as const,idempotency_key:id}};
const changed={status:'changed',employee_id:id,phone_masked:'139****0101',version:2,changed_at:'2026-10-08T10:00:00+08:00',idempotent:false};
test('direct atomic RPC contains no OTP fields',async()=>{
 const rpc=mock(async(_name:string,_params:Record<string,unknown>)=>({data:changed,error:null}));
 expect((await new Repository({rpc}).confirm(command)).version).toBe(2);
 expect(rpc.mock.calls[0]).toEqual(['change_tenant_admin_login_phone',{p_actor_employee_id:id,p_actor_user_id:id,p_actor_auth_version:1,p_tenant_id:id,p_employee_id:id,p_expected_version:1,p_new_phone:'13999200101',p_reason:'本人换号',p_same_person_confirmed:true,p_idempotency_key:id}]);
});
test('rejects incomplete or obsolete OTP results',async()=>{
 for(const data of [{status:'changed'},{status:'code_invalid'}]) await expect(new Repository({rpc:async()=>({data,error:null})}).confirm(command)).rejects.toThrow('返回数据异常');
});
test('sanitizes database errors',async()=>{
 await expect(new Repository({rpc:async()=>({data:null,error:{message:'sensitive',code:'XX000'}})}).confirm(command)).rejects.toThrow('执行管理员手机号变更失败');
});
test('maps number conflicts',async()=>{
 await expect(new Repository({rpc:async()=>({data:null,error:{message:'TENANT_ADMIN_PHONE_CONFLICT'}})}).confirm(command)).rejects.toMatchObject({statusCode:409,code:'TENANT_ADMIN_PHONE_CONFLICT'});
});
