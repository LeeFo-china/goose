import { beforeAll, expect, test } from 'bun:test';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
let Repository: typeof import('./platform-tenant-admin-phones').PlatformTenantAdminPhoneRepository;
beforeAll(async()=>{Repository=(await import('./platform-tenant-admin-phones')).PlatformTenantAdminPhoneRepository;});
const uuid='00000000-0000-4000-8000-000000000101';
const actor={employeeId:uuid,authUserId:uuid,adminAuthVersion:2};
const target={employeeId:uuid,tenantId:uuid};
const input={new_phone:'13999200101',expected_version:1,idempotency_key:uuid};
const challenge={status:'sending' as const,challenge_id:uuid,expires_at:'2026-10-08T12:00:00+00:00',should_send:true,cooldown_seconds:60};
test('reserve sends the exact SQL contract and parses offset timestamps',async()=>{
  let observed:unknown;
  const repo=new Repository({rpc:async(name,params)=>{observed={name,params};return{data:challenge,error:null};}});
  expect(await repo.reserve({actor,target,input,code:'123456',ip:null,device:null})).toEqual(challenge);
  expect(observed).toEqual({name:'reserve_tenant_admin_phone_change',params:{p_actor_employee_id:uuid,p_actor_user_id:uuid,
    p_actor_auth_version:2,p_tenant_id:uuid,p_employee_id:uuid,p_expected_version:1,p_new_phone:'13999200101',
    p_idempotency_key:uuid,p_code:'123456',p_request_ip:null,p_request_device:null}});
});
test('rejects missing required RPC fields',async()=>{
  const repo=new Repository({rpc:async()=>({data:{status:'sending'},error:null})});
  await expect(repo.reserve({actor,target,input,code:'123456',ip:null,device:null})).rejects.toThrow('返回数据异常');
});
test('hides raw SQL errors containing phone/code values',async()=>{
  const repo=new Repository({rpc:async()=>({data:null,error:{message:'bad SQL with code 123456'}})});
  await expect(repo.list(uuid,{page:1,pageSize:20})).rejects.toThrow('执行管理员手机号变更失败');
});
test('returns bounded pagination without exposing full phone',async()=>{
  const repo=new Repository({rpc:async()=>({data:{list:[],pagination:{page:1,pageSize:101,total:0,totalPages:0}},error:null})});
  await expect(repo.list(uuid,{page:1,pageSize:20})).rejects.toThrow('返回数据异常');
});
test('maps phone conflicts without exposing other account identity',async()=>{
  const repo=new Repository({rpc:async()=>({data:null,error:{message:'TENANT_ADMIN_PHONE_CONFLICT'}})});
  await expect(repo.list(uuid,{page:1,pageSize:20})).rejects.toMatchObject({statusCode:409,code:'TENANT_ADMIN_PHONE_CONFLICT'});
});
