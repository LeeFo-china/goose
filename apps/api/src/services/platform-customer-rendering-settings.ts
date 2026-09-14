import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import {
  platformCustomerRenderingSettingsRepository,
  type CustomerRenderingSetting,
  type CustomerRenderingSettingsRepositoryPort,
} from '@/repositories/platform-customer-rendering-settings';
import {
  CustomerRenderingSettingsUpdateSchema,
  type CustomerRenderingSettingsUpdate,
} from '@/schema/platform-customer-rendering-settings';
import type { PlatformStaffAuthContext } from '@/services/platform-authorization';

type SuperAdminIdentity = Pick<PlatformStaffAuthContext, 'employeeId' | 'isPlatformSuperAdmin'>;
type SettingResponse = Omit<CustomerRenderingSetting, 'version' | 'updated_at'> & {
  version: number; updated_at: string | null;
};

function assertSuperAdmin(auth: SuperAdminIdentity): void {
  if (!auth.isPlatformSuperAdmin || !z.uuid().safeParse(auth.employeeId).success) {
    throw Errors.forbidden();
  }
}

export class PlatformCustomerRenderingSettingsService {
  constructor(private readonly repository: CustomerRenderingSettingsRepositoryPort =
    platformCustomerRenderingSettingsRepository) {}

  async get(auth: SuperAdminIdentity, tenantId: string): Promise<SettingResponse> {
    assertSuperAdmin(auth);
    if (!z.uuid().safeParse(tenantId).success) throw Errors.badRequest('租户 ID 无效');
    const result = await this.repository.get(tenantId);
    if (!result.tenantExists) {
      throw Errors.business(404, '租户不存在', 'RENDERING_SETTINGS_TENANT_NOT_FOUND');
    }
    return result.setting ?? { tenant_id: tenantId, enabled: false,
      daily_task_limit: null, daily_budget_fen: null, per_job_reserve_fen: null,
      version: 0, updated_at: null };
  }

  async update(auth: SuperAdminIdentity, tenantId: string,
    input: CustomerRenderingSettingsUpdate): Promise<SettingResponse> {
    assertSuperAdmin(auth);
    if (!z.uuid().safeParse(tenantId).success) throw Errors.badRequest('租户 ID 无效');
    const parsed = CustomerRenderingSettingsUpdateSchema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const result = await this.repository.save({ tenantId, ...parsed.data,
      operatorEmployeeId: auth.employeeId });
    if (result.decision === 'not_found') {
      throw Errors.business(404, '租户不存在', 'RENDERING_SETTINGS_TENANT_NOT_FOUND');
    }
    if (result.decision === 'stale') {
      throw Errors.business(409, '客户生图试点设置已变化，请刷新后重试', 'RENDERING_SETTINGS_VERSION_STALE');
    }
    if (result.decision === 'tenant_inactive') {
      throw Errors.business(409, '租户未启用，不能开放客户生图', 'RENDERING_SETTINGS_TENANT_INACTIVE');
    }
    if (result.decision === 'invalid_request') throw Errors.badRequest('客户生图试点设置无效');
    if (result.decision !== 'updated') throw Errors.dbError('客户生图试点设置响应无效');
    if (result.setting.tenant_id !== tenantId || result.setting.enabled !== parsed.data.enabled
      || result.setting.version !== parsed.data.expected_version + 1) {
      throw Errors.dbError('客户生图试点设置响应无效');
    }
    return result.setting;
  }
}

export const platformCustomerRenderingSettingsService = new PlatformCustomerRenderingSettingsService();
