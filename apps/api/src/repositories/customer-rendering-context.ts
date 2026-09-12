import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

type DatabaseResult = { data: unknown; error: unknown };

interface ContextQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): ContextQuery;
  eq(...args: unknown[]): ContextQuery;
  gt(...args: unknown[]): ContextQuery;
  order(...args: unknown[]): ContextQuery;
  limit(...args: unknown[]): ContextQuery;
  maybeSingle(): Promise<DatabaseResult>;
}

export interface CustomerRenderingContextDatabaseClient {
  from(table: string): ContextQuery;
}

const SelectedTenantSchema = z.strictObject({ selected_tenant_id: z.uuid() });
const ActiveTenantSchema = z.strictObject({
  id: z.uuid(),
  status: z.literal('active'),
});

export class CustomerRenderingContextRepository {
  constructor(private readonly configuredClient?: CustomerRenderingContextDatabaseClient) {}

  private get client(): CustomerRenderingContextDatabaseClient {
    return this.configuredClient
      ?? SupabaseDB.getAdminClient() as unknown as CustomerRenderingContextDatabaseClient;
  }

  async findLatestSelectedVisitorTenant(visitorId: string, now: string) {
    const { data, error } = await this.client.from('user_location_contexts')
      .select('selected_tenant_id')
      .eq('visitor_id', visitorId)
      .eq('selection_status', 'selected')
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError('查询客户生图租户上下文失败');
    if (data === null) return null;
    const parsed = SelectedTenantSchema.safeParse(data);
    if (!parsed.success) throw Errors.dbError('客户生图租户上下文数据格式异常');
    return parsed.data.selected_tenant_id;
  }

  async findActiveTenant(tenantId: string) {
    const { data, error } = await this.client.from('tenants')
      .select('id,status')
      .eq('id', tenantId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError('查询客户生图装修公司失败');
    if (data === null) return null;
    const parsed = ActiveTenantSchema.safeParse(data);
    if (!parsed.success || parsed.data.id !== tenantId) {
      throw Errors.dbError('客户生图装修公司数据格式异常');
    }
    return parsed.data;
  }
}

export const customerRenderingContextRepository =
  new CustomerRenderingContextRepository();
