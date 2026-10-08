import type { FastifyRequest } from 'fastify';
import { PlatformBaseController } from '@/controllers/PlatformBaseController';
import { Errors } from '@/errors/error-factory';
import { PlatformTenantIdParamsSchema } from '@/schema/platform-tenants';
import { PaginationQuerySchema } from '@/schema/request';
import { ConfirmTenantAdminPhoneSchema, SendTenantAdminPhoneCodeSchema, TenantAdminPhoneParamsSchema } from '@/schema/platform-tenant-admin-phones';
import { platformTenantAdminPhoneService, type PlatformTenantAdminPhoneService } from '@/services/platform-tenant-admin-phones';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';
import { resolveTrustedClientIp } from '@/utils/trusted-proxy-client-ip';

export class PlatformTenantAdminPhonesController extends PlatformBaseController {
  constructor(private readonly service: Pick<PlatformTenantAdminPhoneService, 'list'|'sendCode'|'confirm'> = platformTenantAdminPhoneService) {
    super('tenant_admin_phone_change_challenges');
  }
  @Get('/platform/tenants/:id/admins')
  async listAdmins(request:FastifyRequest) {
    const auth=await this.getRequiredPlatformPermissionContext(request,'platform.tenant.read');
    const params=PlatformTenantIdParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const query=PaginationQuerySchema.safeParse(request.query);
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await this.service.list(params.data.id,query.data,auth));
  }
  @Post('/platform/tenants/:id/admins/:employeeId/phone-change/send-code')
  async sendCode(request:FastifyRequest) {
    const auth=await this.getRequiredPlatformSuperAdminContext(request);
    const params=TenantAdminPhoneParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const body=SendTenantAdminPhoneCodeSchema.safeParse(request.body);
    if (!body.success) throw Errors.fromZod(body.error);
    const rawDevice=request.headers['x-device-id'];
    const device=typeof rawDevice==='string' ? rawDevice.trim().slice(0,160)||null : null;
    return ResponseHandler.success(await this.service.sendCode(
      {tenantId:params.data.id,employeeId:params.data.employeeId},body.data,auth,
      {ip:resolveTrustedClientIp(request),device},
    ),'验证码已发送');
  }
  @Post('/platform/tenants/:id/admins/:employeeId/phone-change/confirm')
  async confirm(request:FastifyRequest) {
    const auth=await this.getRequiredPlatformSuperAdminContext(request);
    const params=TenantAdminPhoneParamsSchema.safeParse(request.params);
    if (!params.success) throw Errors.fromZod(params.error);
    const body=ConfirmTenantAdminPhoneSchema.safeParse(request.body);
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await this.service.confirm(
      {tenantId:params.data.id,employeeId:params.data.employeeId},body.data,auth,
    ),'登录手机号已变更');
  }
}
export default new PlatformTenantAdminPhonesController();
