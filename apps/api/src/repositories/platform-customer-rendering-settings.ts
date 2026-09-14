import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import type { CustomerRenderingSettingsUpdate } from '@/schema/platform-customer-rendering-settings';
import { SupabaseDB } from '@/utils/supabase';

const Setting = z.strictObject({
  tenant_id: z.uuid(), enabled: z.boolean(),
  daily_task_limit: z.number().int().nullable(),
  daily_budget_fen: z.number().int().nullable(),
  per_job_reserve_fen: z.number().int().nullable(),
  version: z.number().int().min(1), updated_at: z.string().min(1),
});
const SaveResult = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('updated'), setting: Setting }),
  z.object({ decision: z.enum(['not_found', 'stale', 'invalid_request', 'tenant_inactive']) }),
]);
export type CustomerRenderingSetting = z.infer<typeof Setting>;
export type CustomerRenderingSettingSaveResult = z.infer<typeof SaveResult>;
export type CustomerRenderingSettingsCommand = CustomerRenderingSettingsUpdate & {
  tenantId: string; operatorEmployeeId: string;
};
export interface CustomerRenderingSettingsRepositoryPort {
  get(tenantId: string): Promise<{ tenantExists: boolean; setting: CustomerRenderingSetting | null }>;
  save(command: CustomerRenderingSettingsCommand): Promise<CustomerRenderingSettingSaveResult>;
}

type QueryResult = { data: unknown; error: unknown };
type DatabaseClient = {
  from(table: string): { select(columns: string): {
    eq(column: string, value: string): { maybeSingle(): PromiseLike<QueryResult> };
  } };
  rpc(name: string, params: Record<string, unknown>): PromiseLike<QueryResult>;
};
const COLUMNS = 'tenant_id,enabled,daily_task_limit,daily_budget_fen,per_job_reserve_fen,version,updated_at';

export class PlatformCustomerRenderingSettingsRepository implements CustomerRenderingSettingsRepositoryPort {
  constructor(private readonly configuredClient?: DatabaseClient) {}

  private client(): DatabaseClient {
    return this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as DatabaseClient;
  }

  async get(tenantId: string): Promise<{ tenantExists: boolean; setting: CustomerRenderingSetting | null }> {
    let result: QueryResult;
    try { result = await this.client().from('tenant_customer_rendering_settings')
      .select(COLUMNS).eq('tenant_id', tenantId).maybeSingle(); }
    catch { throw Errors.dbError('读取客户生图试点设置失败'); }
    if (result.error) throw Errors.dbError('读取客户生图试点设置失败');
    if (result.data !== null) {
      const setting = Setting.safeParse(result.data);
      if (!setting.success) throw Errors.dbError('客户生图试点设置响应无效');
      return { tenantExists: true, setting: setting.data };
    }
    let tenant: QueryResult;
    try { tenant = await this.client().from('tenants').select('id').eq('id', tenantId).maybeSingle(); }
    catch { throw Errors.dbError('读取客户生图试点租户失败'); }
    if (tenant.error) throw Errors.dbError('读取客户生图试点租户失败');
    return { tenantExists: tenant.data !== null, setting: null };
  }

  async save(command: CustomerRenderingSettingsCommand): Promise<CustomerRenderingSettingSaveResult> {
    let result: QueryResult;
    try { result = await this.client().rpc('set_tenant_customer_rendering_settings', {
      p_tenant_id: command.tenantId, p_enabled: command.enabled,
      p_daily_task_limit: command.daily_task_limit,
      p_daily_budget_fen: command.daily_budget_fen,
      p_per_job_reserve_fen: command.per_job_reserve_fen,
      p_expected_version: command.expected_version,
      p_operator_employee_id: command.operatorEmployeeId,
      p_reason: command.reason,
    }); }
    catch { throw Errors.dbError('保存客户生图试点设置失败'); }
    if (result.error) throw Errors.dbError('保存客户生图试点设置失败');
    const parsed = SaveResult.safeParse(result.data);
    if (!parsed.success) throw Errors.dbError('客户生图试点设置响应无效');
    return parsed.data;
  }
}

export const platformCustomerRenderingSettingsRepository = new PlatformCustomerRenderingSettingsRepository();
