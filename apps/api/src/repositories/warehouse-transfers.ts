import type { WarehouseTransferCommand, WarehouseTransferCommandResult, WarehouseTransferSummary,
  WarehouseTransferItem, WarehouseTransferSettings, WarehouseTransferStatus } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { PaginationQuerySchema } from '@/schema/request';
import { SupabaseDB } from '@/utils/supabase';
import { WarehouseTransferCommandResultSchema, WarehouseTransferSummarySchema, WarehouseTransferItemSchema,
  WarehouseTransferSettingsSchema, transferActorParams, parseTransferRecord, parseTransferPage,
  type WarehouseTransferActor, type WarehouseTransferPageInput, type WarehouseTransferPage, type WarehouseTransferRpcClient,
} from './warehouse-transfer-records';

export interface WarehouseTransferListInput extends WarehouseTransferActor, WarehouseTransferPageInput {
  source_warehouse_id?: string;
  destination_warehouse_id?: string;
  status?: WarehouseTransferStatus;
  keyword?: string;
}
export interface WarehouseTransferReadInput extends WarehouseTransferActor { order_id: string }
export interface WarehouseTransferCommandInput extends WarehouseTransferReadInput {
  command: WarehouseTransferCommand;
  expected_version: number;
  payload: Record<string, unknown>;
  idempotency_key: string;
}

export class WarehouseTransfersRepository {
  constructor(private readonly clientOrProvider: WarehouseTransferRpcClient | (() => WarehouseTransferRpcClient) = () =>
    SupabaseDB.getAdminClient() as unknown as WarehouseTransferRpcClient) {}

  async getSettings(input: WarehouseTransferActor): Promise<WarehouseTransferSettings> {
    return parseTransferRecord(WarehouseTransferSettingsSchema,
      await this.rpc('get_warehouse_transfer_settings', transferActorParams(input)));
  }

  async list(input: WarehouseTransferListInput): Promise<WarehouseTransferPage<WarehouseTransferSummary>> {
    return parseTransferPage(WarehouseTransferSummarySchema, await this.rpc('list_warehouse_transfer_orders', {
      ...transferActorParams(input), ...pageParams(input), p_source_warehouse_id: input.source_warehouse_id ?? null,
      p_destination_warehouse_id: input.destination_warehouse_id ?? null,
      p_status: input.status ?? null, p_keyword: input.keyword?.trim() || null,
    }));
  }

  async get(input: WarehouseTransferReadInput): Promise<WarehouseTransferSummary> {
    return parseTransferRecord(WarehouseTransferSummarySchema, await this.rpc('get_warehouse_transfer_order', {
      ...transferActorParams(input), p_order_id: input.order_id,
    }));
  }

  async listItems(input: WarehouseTransferReadInput & WarehouseTransferPageInput): Promise<WarehouseTransferPage<WarehouseTransferItem>> {
    return parseTransferPage(WarehouseTransferItemSchema, await this.rpc('list_warehouse_transfer_order_items', {
      ...transferActorParams(input), ...pageParams(input), p_order_id: input.order_id,
    }));
  }

  async command(input: WarehouseTransferCommandInput): Promise<WarehouseTransferCommandResult> {
    return parseTransferRecord(WarehouseTransferCommandResultSchema, await this.rpc('command_warehouse_transfer_order', {
      ...transferActorParams(input), p_order_id: input.order_id, p_command: input.command,
      p_expected_version: input.expected_version, p_payload: input.payload, p_idempotency_key: input.idempotency_key,
    }));
  }

  private async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
    const client = typeof this.clientOrProvider === 'function' ? this.clientOrProvider() : this.clientOrProvider;
    const { data, error } = await client.rpc(name, params);
    if (error) throw Errors.dbError('仓库调拨操作失败', error);
    return data;
  }
}
export const warehouseTransfersRepository = new WarehouseTransfersRepository();

function pageParams(input: WarehouseTransferPageInput): Record<string, number> {
  const result = PaginationQuerySchema.safeParse({ page: input.page, pageSize: input.pageSize });
  if (!result.success) throw Errors.fromZod(result.error);
  return { p_page: result.data.page, p_page_size: result.data.pageSize };
}
