import { beforeAll, describe, expect, test, mock, spyOn } from 'bun:test';
import type { AuthContext } from './authorization';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';
import type { PlatformTenantAdminPhoneRepository, PhoneChallengeResult, PhoneConfirmResult } from '@/repositories/platform-tenant-admin-phones';
let PlatformTenantAdminPhoneService: typeof import('./platform-tenant-admin-phones').PlatformTenantAdminPhoneService;
beforeAll(async () => { ({ PlatformTenantAdminPhoneService } = await import('./platform-tenant-admin-phones')); });
const actor = { tenantId: null, isPlatformStaff: true, isPlatformSuperAdmin: true,
  employeeId: '00000000-0000-4000-8000-000000000101', authUserId: '00000000-0000-4000-8000-000000000102',
  adminAuthVersion: 1, permissions: [] } as unknown as AuthContext;
const target = { tenantId: '00000000-0000-4000-8000-000000000103', employeeId: '00000000-0000-4000-8000-000000000104' };
const input = { new_phone: '13999200101', expected_version: 1, idempotency_key: '00000000-0000-4000-8000-000000000105' };
const challenge = { status: 'sending' as const, challenge_id: '00000000-0000-4000-8000-000000000106',
  expires_at: new Date(Date.now()+300000).toISOString(), cooldown_seconds: 60, should_send: true };
function fixture() {
  const repository = {
    reserve: mock(async (_input: Parameters<PlatformTenantAdminPhoneRepository['reserve']>[0]): Promise<PhoneChallengeResult> => ({ ...challenge })),
    completeSend: mock(async (_input: Parameters<PlatformTenantAdminPhoneRepository['completeSend']>[0]): Promise<PhoneChallengeResult> => ({ ...challenge, status: 'ready' as const, should_send: false })),
    confirm: mock(async (_input: Parameters<PlatformTenantAdminPhoneRepository['confirm']>[0]): Promise<PhoneConfirmResult> => ({ status: 'changed' as const, employee_id: target.employeeId,
      phone_masked: '139****0101', version: 2, changed_at: new Date().toISOString(), idempotent: false })),
    list: mock(async () => ({ list: [{ id:target.employeeId,name:'管理员',phone_masked:'139****0100',status:'active',
      version:1,has_login_binding:true,can_change:true,disabled_reason:null }], pagination:{page:1,pageSize:20,total:1,totalPages:1} })),
  };
  const send = mock(async (_phone: string, _code: string) => {});
  const assertChannel = mock(async () => {});
  const invalidate = mock((_employeeId: string) => {});
  return { repository, send, assertChannel, invalidate,
    service: new PlatformTenantAdminPhoneService({ repository, send, assertChannel, invalidate }) };
}
describe('tenant admin phone change orchestration', () => {
  test('sends exactly reserved code and completes challenge before returning', async () => {
    const f=fixture();
    const result=await f.service.sendCode(target,input,actor,{ip:null,device:null});
    expect(result.challenge_id).toBe(challenge.challenge_id);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0]?.[1]).toMatch(/^\d{6}$/);
    expect(f.repository.reserve.mock.calls[0]?.[0]).toMatchObject({code:f.send.mock.calls[0]?.[1]});
    expect(f.repository.completeSend).toHaveBeenCalledTimes(1);
  });
  test('rejects regular operators before reserving or sending', async () => {
    const f=fixture();
    await expect(f.service.sendCode(target,input,{...actor,isPlatformSuperAdmin:false},{ip:null,device:null})).rejects.toThrow();
    expect(f.repository.reserve).not.toHaveBeenCalled(); expect(f.send).not.toHaveBeenCalled();
  });
  test('replays ready challenge without sending twice', async () => {
    const f=fixture(); f.repository.reserve.mockResolvedValue({...challenge,status:'ready',should_send:false});
    await f.service.sendCode(target,input,actor,{ip:null,device:null});
    expect(f.send).not.toHaveBeenCalled();
  });
  test('failed SMS marks challenge failed and never confirms employee change', async () => {
    const f=fixture(); f.send.mockRejectedValue(new Error('provider contains sensitive detail'));
    await expect(f.service.sendCode(target,input,actor,{ip:null,device:null})).rejects.toThrow('发送验证码失败');
    expect(f.repository.completeSend.mock.calls[0]?.[0]).toMatchObject({success:false});
    expect(f.repository.confirm).not.toHaveBeenCalled();
  });
  test('channel unavailable fails before reservation', async () => {
    const f=fixture(); f.assertChannel.mockRejectedValue(new Error('disabled'));
    await expect(f.service.sendCode(target,input,actor,{ip:null,device:null})).rejects.toThrow();
    expect(f.repository.reserve).not.toHaveBeenCalled();
  });
  test('confirmation invalidates only the changed employee', async () => {
    const f=fixture();
    await f.service.confirm(target,{...input,challenge_id:challenge.challenge_id,code:'123456',reason:'本人换号',same_person_confirmed:true},actor);
    expect(f.invalidate).toHaveBeenCalledWith(target.employeeId);
  });
  test('invalid code is mapped after database persisted attempt', async () => {
    const f=fixture(); f.repository.confirm.mockResolvedValue({status:'code_invalid'});
    await expect(f.service.confirm(target,{...input,challenge_id:challenge.challenge_id,code:'000000',reason:'本人换号',same_person_confirmed:true},actor)).rejects.toThrow('验证码错误');
    expect(f.invalidate).not.toHaveBeenCalled();
  });
  test('exhausted verification cannot invalidate a session or report success', async () => {
    const f=fixture(); f.repository.confirm.mockResolvedValue({status:'code_exhausted'});
    await expect(f.service.confirm(target,{...input,challenge_id:challenge.challenge_id,code:'000000',reason:'本人换号',same_person_confirmed:true},actor))
      .rejects.toMatchObject({statusCode:429,code:'TENANT_ADMIN_PHONE_CODE_EXHAUSTED'});
    expect(f.invalidate).not.toHaveBeenCalled();
  });
  test('ready write failure does not return a usable challenge or change the employee', async () => {
    const f=fixture(); f.repository.completeSend.mockRejectedValue(new Error('database unavailable'));
    await expect(f.service.sendCode(target,input,actor,{ip:null,device:null})).rejects.toThrow();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.repository.confirm).not.toHaveBeenCalled();
  });
  test('both providers map the independent change scene to the admin verification template', async () => {
    const {getTemplateConfigKey}=await import('./sms/legacy/config');
    expect(getTemplateConfigKey({provider:'aliyun',purpose:'tenant_admin_phone_change'})).toBe('ALIYUN_SMS_TEMPLATE_CODE_ADMIN_LOGIN');
    expect(getTemplateConfigKey({provider:'tencent',purpose:'tenant_admin_phone_change'})).toBe('TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN');
  });
  test('change verification supports the existing admin-login template fallback', async () => {
    const {systemSettingsService}=await import('./system-settings');
    const {getAliyunTemplateCode,getTencentTemplateId}=await import('./sms/legacy/config');
    const read=spyOn(systemSettingsService,'getSecretString').mockImplementation(async (key:string)=>
      key.endsWith('_BIND_EMPLOYEE')?'synthetic-verification-template':'');
    try {
      for (const provider of ['aliyun','tencent'] as const) {
        const channel={provider,tenantId:null,strictTenantConfig:false,channelMode:'platform' as const};
        const result=provider==='aliyun'?await getAliyunTemplateCode(channel,'tenant_admin_phone_change')
          :await getTencentTemplateId(channel,'tenant_admin_phone_change');
        expect(result).toBe('synthetic-verification-template');
      }
    } finally {read.mockRestore();}
  });
});
