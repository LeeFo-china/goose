import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';
import type { PaginationQuery } from '@/schema/request';
import type { ConfirmTenantAdminPhoneInput, TenantAdminPhoneActor, TenantAdminPhoneTarget } from '@/schema/platform-tenant-admin-phones';

const ChangedSchema = z.object({
  status: z.literal('changed'), employee_id: z.uuid(), phone_masked: z.string(),
  version: z.number().int().positive(), changed_at: z.iso.datetime({ offset: true }), idempotent: z.boolean(),
});
const ConfirmSchema = ChangedSchema;
const PageSchema = z.object({
  list: z.array(z.object({
    id: z.uuid(), name: z.string().nullable(), phone_masked: z.string().nullable(), status: z.string().nullable(),
    version: z.number().int().positive(), has_login_binding: z.boolean(), can_change: z.boolean(), disabled_reason: z.string().nullable(),
  })).max(100),
  pagination: z.object({page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative()}),
});
export type PhoneConfirmResult = z.infer<typeof ConfirmSchema>;
export type TenantAdminPhonePage = z.infer<typeof PageSchema>;
type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
const RPC_ERRORS: Record<string, [number, string]> = {
  PLATFORM_SUPER_ADMIN_REQUIRED: [403, '当前操作仅平台超管可执行'],
  TENANT_NOT_FOUND: [404, '租户不存在'],
  TENANT_ADMIN_PHONE_INVALID: [400, '新手机号无效或与原号码相同'],
  TENANT_ADMIN_PHONE_CONFLICT: [409, '该手机号已绑定其他员工，请使用其他号码'],
  TENANT_ADMIN_PHONE_VERSION_CONFLICT: [409, '管理员资料已变化，请刷新后重新确认'],
  TENANT_ADMIN_PHONE_TARGET_UNAVAILABLE: [409, '该管理员当前不可变更，请刷新确认状态及角色'],
  TENANT_ADMIN_PHONE_IDEMPOTENCY_CONFLICT: [409, '请求内容已变化，请重新确认'],
};
function actorParams(actor: TenantAdminPhoneActor) {
  return {p_actor_employee_id:actor.employeeId,p_actor_user_id:actor.authUserId,p_actor_auth_version:actor.adminAuthVersion};
}
export class PlatformTenantAdminPhoneRepository {
  constructor(private readonly client: RpcClient = SupabaseDB.getAdminClient() as unknown as RpcClient) {}
  private async call<T>(name: string, params: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const {data,error}=await this.client.rpc(name,params);
    if (error) {
      const failure=error as {message?:unknown; code?:unknown};
      const code=typeof failure.message==='string' ? failure.message : '';
      const mapped=RPC_ERRORS[code];
      if (mapped) throw Errors.business(mapped[0],mapped[1],code);
      if (failure.code==='23505') throw Errors.business(409,'该手机号已被占用，请刷新后重试','TENANT_ADMIN_PHONE_CONFLICT');
      if (failure.code==='40P01' || failure.code==='55P03') throw Errors.business(409,'资料正在更新，请稍后重试','TENANT_ADMIN_PHONE_VERSION_CONFLICT');
      // Database diagnostics may contain private request parameters; never expose raw errors.
      throw Errors.dbError('执行管理员手机号变更失败');
    }
    const parsed=schema.safeParse(data);
    if (!parsed.success) throw Errors.dbError('管理员手机号变更返回数据异常');
    return parsed.data;
  }
  list(tenantId: string, query: PaginationQuery): Promise<TenantAdminPhonePage> {
    return this.call('list_tenant_admin_phone_targets',{p_tenant_id:tenantId,p_page:query.page,p_page_size:query.pageSize},PageSchema);
  }
  confirm(params: {target:TenantAdminPhoneTarget;input:ConfirmTenantAdminPhoneInput;actor:TenantAdminPhoneActor}): Promise<PhoneConfirmResult> {
    const {target,input,actor}=params;
    return this.call('change_tenant_admin_login_phone',{
      ...actorParams(actor),p_tenant_id:target.tenantId,p_employee_id:target.employeeId,p_expected_version:input.expected_version,
      p_new_phone:input.new_phone,p_reason:input.reason,
      p_same_person_confirmed:input.same_person_confirmed,p_idempotency_key:input.idempotency_key,
    },ConfirmSchema);
  }
}
export const platformTenantAdminPhoneRepository = new PlatformTenantAdminPhoneRepository();
