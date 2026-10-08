import { Errors } from '@/errors/error-factory';
import { platformTenantAdminPhoneRepository, type PlatformTenantAdminPhoneRepository } from '@/repositories/platform-tenant-admin-phones';
import type { ConfirmTenantAdminPhoneInput, TenantAdminPhoneActor, TenantAdminPhoneTarget } from '@/schema/platform-tenant-admin-phones';
import type { PaginationQuery } from '@/schema/request';
import { authorizationService, type AuthContext } from '@/services/authorization';
import { platformAuthorizationService } from '@/services/platform-authorization';

type Dependencies = {
  repository?: Pick<PlatformTenantAdminPhoneRepository,'list'|'confirm'>;
  invalidate?: (employeeId:string)=>void;
};
export class PlatformTenantAdminPhoneService {
  private readonly repository;
  private readonly invalidate;
  constructor(dependencies: Dependencies = {}) {
    this.repository=dependencies.repository??platformTenantAdminPhoneRepository;
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
  async confirm(target:TenantAdminPhoneTarget,input:ConfirmTenantAdminPhoneInput,auth:AuthContext) {
    const result=await this.repository.confirm({target,input,actor:this.actor(auth)});
    if (result.status!=='changed') throw Errors.dbError('管理员手机号变更返回数据异常');
    this.invalidate(target.employeeId);
    const {status,...data}=result;
    return data;
  }
}
export const platformTenantAdminPhoneService = new PlatformTenantAdminPhoneService();
