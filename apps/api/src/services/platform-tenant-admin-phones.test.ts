import { beforeAll, expect, test, mock } from 'bun:test';
import type { AuthContext } from './authorization';
import type { PlatformTenantAdminPhoneRepository, PhoneConfirmResult } from '@/repositories/platform-tenant-admin-phones';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
let Service: typeof import('./platform-tenant-admin-phones').PlatformTenantAdminPhoneService;
beforeAll(async () => { Service=(await import('./platform-tenant-admin-phones')).PlatformTenantAdminPhoneService; });
const auth={tenantId:null,isPlatformStaff:true,isPlatformSuperAdmin:true,employeeId:'actor',authUserId:'actor-user',adminAuthVersion:1,permissions:[]} as unknown as AuthContext;
const target={tenantId:'tenant',employeeId:'employee'};
const input={new_phone:'13999200101',expected_version:1,idempotency_key:crypto.randomUUID(),reason:'本人换号',same_person_confirmed:true as const};
function fixture() {
 const repository={confirm:mock(async (_input:Parameters<PlatformTenantAdminPhoneRepository['confirm']>[0]):Promise<PhoneConfirmResult>=>({status:'changed',employee_id:'employee',phone_masked:'139****0101',version:2,changed_at:new Date().toISOString(),idempotent:false})),list:mock(async()=>({list:[],pagination:{page:1,pageSize:20,total:0,totalPages:0}}))};
 const invalidate=mock((_employeeId:string)=>{});
 return {repository,invalidate,service:new Service({repository,invalidate})};
}
test('direct change requires no SMS provider, challenge or code',async()=>{
 const f=fixture();expect((await f.service.confirm(target,input,auth)).version).toBe(2);
 expect(f.repository.confirm.mock.calls[0]?.[0]).toEqual({target,input,actor:{employeeId:'actor',authUserId:'actor-user',adminAuthVersion:1}});
 expect(f.invalidate).toHaveBeenCalledWith('employee');
});
test('rejects operators before mutation',async()=>{
 const f=fixture();await expect(f.service.confirm(target,input,{...auth,isPlatformSuperAdmin:false})).rejects.toMatchObject({statusCode:403});
 expect(f.repository.confirm).not.toHaveBeenCalled();
});
test('failed transaction does not invalidate cache',async()=>{
 const f=fixture();f.repository.confirm.mockRejectedValue(new Error('database failure'));
 await expect(f.service.confirm(target,input,auth)).rejects.toThrow('database failure');expect(f.invalidate).not.toHaveBeenCalled();
});
