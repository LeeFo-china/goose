import { Errors } from '../errors/error-factory';
import { SupabaseDB } from '../utils/supabase/index';

import type {
  VirtualGoodsOperationState,
  VirtualPaymentEnvironment,
} from '@gooes/domain';

type QueryResult = { data: unknown; error: unknown };

type SupabaseQuery = {
  select(columns: string): SupabaseQuery;
  eq(column: string, value: unknown): SupabaseQuery;
  in(column: string, values: readonly unknown[]): SupabaseQuery;
  order(column: string, options: { ascending: boolean }): SupabaseQuery;
  limit(count: number): SupabaseQuery;
  maybeSingle(): Promise<QueryResult>;
};

type SupabaseClient = {
  from(
    table:
      | 'platform_virtual_products'
      | 'platform_virtual_goods_operations',
  ): SupabaseQuery;
  rpc(
    name:
      | 'platform_begin_virtual_goods_operation'
      | 'platform_finish_virtual_goods_operation',
    args: Record<string, unknown>,
  ): Promise<QueryResult>;
};

export type PlatformVirtualGoodsPhase = 'upload' | 'publish';

export interface PlatformVirtualGoodsOperationRecord {
  id: string;
  channel_id: string;
  mapping_id: string;
  product_id: string;
  product_version: number;
  phase: PlatformVirtualGoodsPhase;
  state: 'submitted' | 'processing';
  request_snapshot_hash: string;
  request_id?: string | null;
}

export interface PlatformVirtualGoodsMappingSnapshot {
  id: string;
  product_id: string;
  channel_id: string;
  provider_product_id: string;
  upload_state: string;
  publish_state: string;
  validation_status: string;
  synced_product_version: number | null;
  remote_snapshot: Record<string, unknown> | null;
  last_operation_id: string | null;
  last_request_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  version: number;
  updated_at: string;
}

export interface PlatformVirtualPaymentChannelSnapshot {
  id: string;
  provider: 'wechat_virtual';
  environment: VirtualPaymentEnvironment;
  app_id: string;
  offer_id: string;
  encrypted_secret_ref: string;
  secret_revision: number;
  status: 'active' | 'disabled';
  version: number;
}

export interface PlatformVirtualProductChannelSnapshot {
  id: string;
  code: string;
  name: string;
  product_type: string;
  amount_fen: number;
  image_file_id: string;
  purchase_notes: string;
  refund_template: string;
  status: string;
  version: number;
  image_url: string | null;
  mapping: PlatformVirtualGoodsMappingSnapshot;
  channel: PlatformVirtualPaymentChannelSnapshot;
}

export interface BeginVirtualGoodsOperationInput {
  mappingId: string;
  productVersion: number;
  phase: PlatformVirtualGoodsPhase;
  requestSnapshotHash: string;
}

export interface FinishVirtualGoodsOperationInput {
  operationId: string;
  state: VirtualGoodsOperationState;
  requestId: string | null;
  normalizedResult: Record<string, unknown> | null;
  failureCode: string | null;
  failureSummary: string | null;
  syncedProductVersion: number | null;
}

const SNAPSHOT_COLUMNS = `
  id,
  code,
  name,
  product_type,
  amount_fen,
  image_file_id,
  purchase_notes,
  refund_template,
  status,
  version,
  image:platform_file_objects!platform_virtual_products_image_file_id_fkey(
    public_url
  ),
  mapping:platform_virtual_product_mappings!inner(
    id,
    product_id,
    channel_id,
    provider_product_id,
    upload_state,
    publish_state,
    validation_status,
    synced_product_version,
    remote_snapshot,
    last_operation_id,
    last_request_id,
    last_error_code,
    last_error_summary,
    version,
    updated_at,
    channel:platform_virtual_payment_channels!inner(
      id,
      provider,
      environment,
      app_id,
      offer_id,
      encrypted_secret_ref,
      secret_revision,
      status,
      version
    )
  )
`;

const OPERATION_COLUMNS = `
  id,
  channel_id,
  mapping_id,
  product_id,
  product_version,
  phase,
  state,
  request_snapshot_hash,
  request_id
`;

export class PlatformVirtualGoodsOperationsRepository {
  private client(): SupabaseClient {
    return SupabaseDB.getAdminClient() as unknown as SupabaseClient;
  }

  async getSnapshot(
    productId: string,
    environment: VirtualPaymentEnvironment,
  ): Promise<PlatformVirtualProductChannelSnapshot | null> {
    const { data, error } = await this.client()
      .from('platform_virtual_products')
      .select(SNAPSHOT_COLUMNS)
      .eq('id', productId)
      .eq('platform_virtual_product_mappings.channel.environment', environment)
      .maybeSingle();

    if (error) {
      throw Errors.dbError('查询虚拟商品渠道映射失败', error);
    }

    return normalizeSnapshot(data);
  }

  async findRunningByChannel(
    channelId: string,
  ): Promise<PlatformVirtualGoodsOperationRecord | null> {
    const { data, error } = await this.client()
      .from('platform_virtual_goods_operations')
      .select(OPERATION_COLUMNS)
      .eq('channel_id', channelId)
      .in('state', ['submitted', 'processing'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError('查询微信虚拟商品操作状态失败', error);
    }

    return (data as PlatformVirtualGoodsOperationRecord | null) ?? null;
  }

  async begin(
    input: BeginVirtualGoodsOperationInput,
  ): Promise<PlatformVirtualGoodsOperationRecord> {
    const { data, error } = await this.client().rpc(
      'platform_begin_virtual_goods_operation',
      {
        p_mapping_id: input.mappingId,
        p_product_version: input.productVersion,
        p_phase: input.phase,
        p_request_snapshot_hash: input.requestSnapshotHash,
      },
    );

    if (error) throwCommandError(error, '创建微信虚拟商品操作失败');
    return data as PlatformVirtualGoodsOperationRecord;
  }

  async finish(input: FinishVirtualGoodsOperationInput): Promise<unknown> {
    const { data, error } = await this.client().rpc(
      'platform_finish_virtual_goods_operation',
      {
        p_operation_id: input.operationId,
        p_state: input.state,
        p_request_id: input.requestId,
        p_normalized_result: input.normalizedResult,
        p_failure_code: input.failureCode,
        p_failure_summary: input.failureSummary,
        p_synced_product_version: input.syncedProductVersion,
      },
    );

    if (error) throwCommandError(error, '保存微信虚拟商品操作结果失败');
    return data;
  }
}

function normalizeSnapshot(
  value: unknown,
): PlatformVirtualProductChannelSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const mapping = first(record.mapping);
  const channel = first(
    mapping && typeof mapping === 'object' && !Array.isArray(mapping)
      ? (mapping as Record<string, unknown>).channel
      : null,
  );
  const image = first(record.image);

  return {
    ...(record as Omit<
      PlatformVirtualProductChannelSnapshot,
      'mapping' | 'channel' | 'image_url'
    >),
    image_url: image && typeof image === 'object' && !Array.isArray(image)
      ? String((image as Record<string, unknown>).public_url ?? '')
      : null,
    mapping: mapping as PlatformVirtualGoodsMappingSnapshot,
    channel: channel as PlatformVirtualPaymentChannelSnapshot,
  };
}

function first(value: unknown): unknown {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const COMMAND_ERRORS: Record<
  string,
  { statusCode: number; message: string; code: string }
> = {
  VIRTUAL_PRODUCT_OPERATION_INVALID: {
    statusCode: 400,
    message: '微信虚拟商品操作参数无效',
    code: 'VIRTUAL_PRODUCT_OPERATION_INVALID',
  },
  VIRTUAL_PRODUCT_MAPPING_NOT_FOUND: {
    statusCode: 404,
    message: '虚拟商品渠道映射不存在',
    code: 'VIRTUAL_PRODUCT_MAPPING_NOT_FOUND',
  },
  VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING: {
    statusCode: 409,
    message: '微信虚拟商品仍在处理中，请稍后重试',
    code: 'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING',
  },
  VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE: {
    statusCode: 409,
    message: '渠道商品 ID 已生成后不可手动变更',
    code: 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE',
  },
  VIRTUAL_PRODUCT_OPERATION_NOT_FOUND: {
    statusCode: 404,
    message: '微信虚拟商品操作不存在',
    code: 'VIRTUAL_PRODUCT_OPERATION_NOT_FOUND',
  },
};

function throwCommandError(error: unknown, fallbackMessage: string): never {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (record.code === 'P0001' && typeof record.message === 'string') {
      const mapped = COMMAND_ERRORS[record.message];
      if (mapped) {
        throw Errors.business(
          mapped.statusCode,
          mapped.message,
          mapped.code,
        );
      }
    }
  }
  throw Errors.dbError(fallbackMessage, error);
}

export const platformVirtualGoodsOperationsRepository =
  new PlatformVirtualGoodsOperationsRepository();
