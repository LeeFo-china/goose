import { randomInt } from 'node:crypto';
import { Errors } from '@/errors/error-factory';
import { platformTenantAdminPhoneRepository, type PhoneChallengeResult, type PlatformTenantAdminPhoneRepository } from '@/repositories/platform-tenant-admin-phones';
import type { ConfirmTenantAdminPhoneInput, SendTenantAdminPhoneInput, TenantAdminPhoneActor, TenantAdminPhoneTarget } from '@/schema/platform-tenant-admin-phones';
import type { PaginationQuery } from '@/schema/request';
import { authorizationService, type AuthContext } from '@/services/authorization';
import { platformAuthorizationService } from '@/services/platform-authorization';
import { sendSmsCode } from '@/services/sms';
import { getSmsChannel } from '@/services/sms/legacy/config';

type Dependencies = {
  repository?: Pick<PlatformTenantAdminPhoneRepository,'list'|'reserve'|'completeSend'|'confirm'>;
  send?: (phone:string,code:string)=>Promise<void>;
  assertChannel?: ()=>Promise<void>;
  invalidate?: (employeeId:string)=>void;
};
export class PlatformTenantAdminPhoneService {
  private readonly repository;
  private readonly send;
  private readonly assertChannel;
  private readonly invalidate;
  constructor(dependencies: Dependencies = {}) {
    this.repository=dependencies.repository??platformTenantAdminPhoneRepository;
    this.send=dependencies.send??((phone,code)=>sendSmsCode(phone,code,'tenant_admin_phone_change'));
    this.assertChannel=dependencies.assertChannel??(async()=>{
      const channel=await getSmsChannel();
      if (channel.provider!=='aliyun' && channel.provider!=='tencent') {
        throw Errors.business(503,'短信服务尚未配置，暂不能变更登录手机号','SMS_DISABLED');
      }
    });
    this.invalidate=dependencies.invalidate??((employeeId)=>authorizationService.invalidateAuthContext({employeeId}));
  }
  private actor(auth: AuthContext): TenantAdminPhoneActor {
    if (auth.tenantId!==null || !auth.isPlatformSuperAdmin || !auth.employeeId || !auth.authUserId || !auth.adminAuthVersion) {
      throw Errors.business(403,'当前操作仅平台超管可执行','PLATFORM_SUPER_ADMIN_REQUIRED');
    }
    return {employeeId:auth.employeeId,authUserId:auth.authUserId,adminAuthVersion:auth.adminAuthVersion};
  }
  async list(tenantId:string,query:PaginationQuery,auth:AuthContext) {
    if (auth.tenantId!==null || (!auth.isPlatformStaff && !auth.isPlatformAdmin)) throw Errors.forbidden();
    platformAuthorizationService.assertPermission(auth,'platform.tenant.read');
    const page=await this.repository.list(tenantId,query);
    return {...page,list:page.list.map(row=>({...row,
      can_change:row.can_change && Boolean(auth.isPlatformSuperAdmin),
      disabled_reason:!auth.isPlatformSuperAdmin?'仅平台超管可变更':row.disabled_reason,
    }))};
  }
  async sendCode(target:TenantAdminPhoneTarget,input:SendTenantAdminPhoneInput,auth:AuthContext,request:{ip:string|null;device:string|null}) {
    const actor=this.actor(auth);
    await this.assertChannel();
    const code=String(randomInt(100000,1000000));
    const reservation=await this.repository.reserve({target,input,actor,code,...request});
    if (!reservation.should_send) return this.readyChallenge(reservation);
    try {
      await this.send(input.new_phone,code);
    } catch {
      await this.repository.completeSend({actor,challengeId:reservation.challenge_id,success:false});
      throw Errors.business(503,'发送验证码失败，请稍后重试','SMS_SEND_FAILED');
    }
    const completed=await this.repository.completeSend({actor,challengeId:reservation.challenge_id,success:true});
    return this.readyChallenge(completed);
  }
  private readyChallenge(result:PhoneChallengeResult) {
    if (result.status!=='ready' || Date.parse(result.expires_at)<=Date.now()) {
      throw Errors.business(409,'验证码请求尚未就绪或已失效，请稍后重新发送','TENANT_ADMIN_PHONE_CHALLENGE_INVALID');
    }
    return {challenge_id:result.challenge_id,expires_at:result.expires_at,cooldown_seconds:result.cooldown_seconds};
  }
  async confirm(target:TenantAdminPhoneTarget,input:ConfirmTenantAdminPhoneInput,auth:AuthContext) {
    const result=await this.repository.confirm({target,input,actor:this.actor(auth)});
    if (result.status==='code_invalid') throw Errors.business(400,'验证码错误，请重新输入','TENANT_ADMIN_PHONE_CODE_INVALID');
    if (result.status==='code_exhausted') throw Errors.business(429,'验证码错误次数过多，请重新发送','TENANT_ADMIN_PHONE_CODE_EXHAUSTED');
    if (result.status!=='changed') throw Errors.dbError('管理员手机号变更返回数据异常');
    this.invalidate(target.employeeId);
    const {status,...data}=result;
    return data;
  }
}
export const platformTenantAdminPhoneService = new PlatformTenantAdminPhoneService();
