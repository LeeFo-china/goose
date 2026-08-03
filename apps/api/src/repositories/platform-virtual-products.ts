import { Errors } from '../errors/error-factory';
import { SupabaseDB } from '../utils/supabase/index';

import type {
  CreatePlatformVirtualProductInput,
  PlatformVirtualProductListQueryInput,
  UpdatePlatformVirtualProductInput,
} from '../schema/platform-virtual-products';

export const LIST_COLUMNS =
  'id,code,name,product_type,amount_fen,currency,status,version,updated_at';

const DETAIL_COLUMNS = `
  id,
  code,
  name,
  product_type,
  amount_fen,
  currency,
  image_file_id,
  purchase_notes,
  refund_template,
  status,
  version,
  created_by_employee_id,
  updated_by_employee_id,
  created_at,
  updated_at,
  grant_rule:platform_virtual_product_grant_rules(
    product_id,
    entitlement_code,
    benefit_type,
    grant_amount,
    duration_value,
    duration_unit,
    expiry_mode,
    expiry_value,
    expiry_unit,
    version,
    created_at,
    updated_at
  ),
  mappings:platform_virtual_product_mappings(
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
    created_at,
    updated_at,
    channel:platform_virtual_payment_channels(
      id,
      provider,
      environment,
      app_id,
      virtual_merchant_id,
      offer_id,
      message_auth_status,
      status,
      version,
      created_at,
      updated_at
    )
  )
`;

type SupabaseListQuery = {
  select(columns: string, options?: { count?: 'exact' }): SupabaseListQuery;
  order(column: string, options: { ascending: boolean }): SupabaseListQuery;
  range(
    from: number,
    to: number,
  ): Promise<{ data: unknown[] | null; error: unknown; count: number | null }>;
  eq(column: string, value: unknown): SupabaseListQuery;
  or(filter: string): SupabaseListQuery;
};

type SupabaseDetailQuery = {
  select(columns: string): SupabaseDetailQuery;
  eq(column: string, value: unknown): SupabaseDetailQuery;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
};

type SupabaseRpcClient = {
  from(table: 'platform_virtual_products'): unknown;
  rpc(
    name:
      | 'platform_create_virtual_product'
      | 'platform_update_virtual_product'
      | 'platform_transition_virtual_product',
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

export type PlatformVirtualProductTransitionStatus =
  | 'active'
  | 'suspended'
  | 'archived';

export interface PlatformVirtualProductTransitionInput {
  id: string;
  expectedVersion: number;
  targetStatus: PlatformVirtualProductTransitionStatus;
  actorEmployeeId: string;
}

export class PlatformVirtualProductsRepository {
  private client(): SupabaseRpcClient {
    return SupabaseDB.getAdminClient() as unknown as SupabaseRpcClient;
  }

  async list(query: PlatformVirtualProductListQueryInput): Promise<{
    rows: unknown[];
    total: number;
  }> {
    const from = (query.page - 1) * query.pageSize;
    let request = (this.client().from(
      'platform_virtual_products',
    ) as SupabaseListQuery)
      .select(LIST_COLUMNS, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false });

    if (query.keyword) {
      const keyword = escapePostgrestSearch(query.keyword);
      request = request.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
    }
    if (query.product_type) {
      request = request.eq('product_type', query.product_type);
    }
    if (query.status) {
      request = request.eq('status', query.status);
    }

    const { data, error, count } = await request.range(
      from,
      from + query.pageSize - 1,
    );

    if (error) {
      throw Errors.dbError('查询虚拟商品失败', error);
    }

    return { rows: data ?? [], total: count ?? 0 };
  }

  async getDetail(id: string): Promise<unknown | null> {
    const { data, error } = await (this.client().from(
      'platform_virtual_products',
    ) as SupabaseDetailQuery)
      .select(DETAIL_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError('查询虚拟商品详情失败', error);
    }

    return data ?? null;
  }

  async create(input: {
    product: CreatePlatformVirtualProductInput;
    actorEmployeeId: string;
  }): Promise<unknown> {
    const { data, error } = await this.client().rpc(
      'platform_create_virtual_product',
      {
        p_product: productPayload(input.product),
        p_grant_rule: input.product.grant_rule,
        p_actor_employee_id: input.actorEmployeeId,
      },
    );

    if (error) {
      throw Errors.dbError('创建虚拟商品失败', error);
    }

    return data;
  }

  async update(input: {
    id: string;
    product: UpdatePlatformVirtualProductInput;
    actorEmployeeId: string;
  }): Promise<unknown> {
    const { version, grant_rule: grantRule, ...product } = input.product;
    const { data, error } = await this.client().rpc(
      'platform_update_virtual_product',
      {
        p_product_id: input.id,
        p_expected_version: version,
        p_product_patch: product,
        p_grant_rule_patch: grantRule ?? {},
        p_actor_employee_id: input.actorEmployeeId,
      },
    );

    if (error) {
      throw Errors.dbError('更新虚拟商品失败', error);
    }

    return data;
  }

  async transition(
    input: PlatformVirtualProductTransitionInput,
  ): Promise<unknown> {
    const { data, error } = await this.client().rpc(
      'platform_transition_virtual_product',
      {
        p_product_id: input.id,
        p_expected_version: input.expectedVersion,
        p_target_status: input.targetStatus,
        p_actor_employee_id: input.actorEmployeeId,
      },
    );

    if (error) {
      throw Errors.dbError('调整虚拟商品状态失败', error);
    }

    return data;
  }
}

function productPayload(input: CreatePlatformVirtualProductInput) {
  const { grant_rule: _grantRule, ...product } = input;
  return product;
}

export function escapePostgrestSearch(value: string): string {
  return value.replace(/[%,()]/g, ' ').trim();
}

export const platformVirtualProductsRepository =
  new PlatformVirtualProductsRepository();
