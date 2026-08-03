import type { VirtualPaymentEnvironment } from '@gooes/domain';

import { Errors } from '../errors/error-factory';
import { SupabaseDB } from '../utils/supabase/index';

export type PlatformVirtualPaymentChannelStatus = 'active' | 'disabled';

export type PlatformVirtualPaymentChannelRecord = {
  id: string;
  provider: 'wechat_virtual';
  environment: VirtualPaymentEnvironment;
  app_id: string;
  virtual_merchant_id: string;
  offer_id: string;
  encrypted_secret_ref: string;
  secret_revision: number;
  message_auth_status: string;
  status: PlatformVirtualPaymentChannelStatus;
  version: number;
  created_by_employee_id: string;
  updated_by_employee_id: string;
  created_at: string;
  updated_at: string;
};

export type UpdatePlatformVirtualPaymentChannelInput = {
  environment: VirtualPaymentEnvironment;
  expectedVersion: number;
  appId: string;
  virtualMerchantId: string;
  offerId: string;
  encryptedSecretRef: string;
  secretRevision: number;
  status: PlatformVirtualPaymentChannelStatus;
  actorEmployeeId: string;
};

type QueryResult<T> = { data: T | null; error: unknown };

type SupabaseQuery<T> = {
  select(columns: string): SupabaseQuery<T>;
  eq(column: string, value: unknown): SupabaseQuery<T>;
  maybeSingle(): Promise<QueryResult<T>>;
  update(values: Record<string, unknown>): SupabaseQuery<T>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type SupabaseClient = {
  from(
    table:
      | 'platform_virtual_payment_channels'
      | 'platform_virtual_product_mappings',
  ): SupabaseQuery<unknown>;
};

export class PlatformVirtualPaymentChannelsRepository {
  private client(): SupabaseClient {
    return SupabaseDB.getAdminClient() as unknown as SupabaseClient;
  }

  async update(
    input: UpdatePlatformVirtualPaymentChannelInput,
  ): Promise<PlatformVirtualPaymentChannelRecord> {
    const current = await this.findByEnvironment(input.environment);
    if (!current) {
      throw Errors.business(
        404,
        '虚拟支付渠道配置不存在',
        'VIRTUAL_PAYMENT_CHANNEL_NOT_FOUND',
      );
    }
    if (current.version !== input.expectedVersion) {
      throw versionConflict();
    }

    const changed = isChannelChanged(current, input);
    const nextVersion = current.version + 1;
    const { data, error } = await this.client()
      .from('platform_virtual_payment_channels')
      .update({
        app_id: input.appId,
        virtual_merchant_id: input.virtualMerchantId,
        offer_id: input.offerId,
        encrypted_secret_ref: input.encryptedSecretRef,
        secret_revision: input.secretRevision,
        status: input.status,
        version: nextVersion,
        updated_by_employee_id: input.actorEmployeeId,
      })
      .eq('id', current.id)
      .eq('version', input.expectedVersion)
      .select(CHANNEL_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError('保存虚拟支付渠道配置失败', error);
    if (!data) throw versionConflict();
    const saved = data as PlatformVirtualPaymentChannelRecord;
    if (changed) await this.invalidateMappings(saved.id);
    return saved;
  }

  private async findByEnvironment(
    environment: VirtualPaymentEnvironment,
  ): Promise<PlatformVirtualPaymentChannelRecord | null> {
    const { data, error } = await this.client()
      .from('platform_virtual_payment_channels')
      .select(CHANNEL_COLUMNS)
      .eq('provider', 'wechat_virtual')
      .eq('environment', environment)
      .maybeSingle();

    if (error) throw Errors.dbError('查询虚拟支付渠道配置失败', error);
    return (data as PlatformVirtualPaymentChannelRecord | null) ?? null;
  }

  private async invalidateMappings(channelId: string): Promise<void> {
    const { error } = await this.client()
      .from('platform_virtual_product_mappings')
      .update({
        upload_state: 'not_started',
        publish_state: 'not_started',
        validation_status: 'pending',
        synced_product_version: null,
        remote_snapshot: {},
        last_operation_id: null,
        last_request_id: null,
        last_error_code: null,
        last_error_summary: null,
      })
      .eq('channel_id', channelId);

    if (error) throw Errors.dbError('重置虚拟商品渠道映射状态失败', error);
  }
}

const CHANNEL_COLUMNS = `
  id,
  provider,
  environment,
  app_id,
  virtual_merchant_id,
  offer_id,
  encrypted_secret_ref,
  secret_revision,
  message_auth_status,
  status,
  version,
  created_by_employee_id,
  updated_by_employee_id,
  created_at,
  updated_at
`;

function isChannelChanged(
  current: PlatformVirtualPaymentChannelRecord,
  input: UpdatePlatformVirtualPaymentChannelInput,
): boolean {
  return current.app_id !== input.appId ||
    current.virtual_merchant_id !== input.virtualMerchantId ||
    current.offer_id !== input.offerId ||
    current.encrypted_secret_ref !== input.encryptedSecretRef ||
    current.secret_revision !== input.secretRevision ||
    current.status !== input.status;
}

function versionConflict(): never {
  throw Errors.business(
    409,
    '虚拟支付渠道配置已更新，请刷新后重试',
    'VIRTUAL_PAYMENT_CHANNEL_VERSION_CONFLICT',
  );
}

export const platformVirtualPaymentChannelsRepository =
  new PlatformVirtualPaymentChannelsRepository();
