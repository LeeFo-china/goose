import type { WarehouseStocktakeCommand, WarehouseStocktakeCommandResult, WarehouseStocktakeItem,
  WarehouseStocktakeOrderSummary, WarehouseStocktakeSettings, WarehouseStocktakeStatus } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { PaginationQuerySchema } from '@/schema/request';
import { SupabaseDB } from '@/utils/supabase';
import { WarehouseStocktakeCommandResultSchema, WarehouseStocktakeItemSchema, WarehouseStocktakeSettingsSchema,
  WarehouseStocktakeSummarySchema, parseStocktakePage, parseStocktakeRecord, stocktakeActorParams,
  type WarehouseStocktakeActor, type WarehouseStocktakePage, type WarehouseStocktakePageInput,
  type WarehouseStocktakeRpcClient } from './warehouse-stocktake-records';

export interface WarehouseStocktakeListInput extends WarehouseStocktakeActor, WarehouseStocktakePageInput {
  warehouse_id?: string; status?: WarehouseStocktakeStatus; keyword?: string;
}
export interface WarehouseStocktakeReadInput extends WarehouseStocktakeActor { order_id: string }
export interface WarehouseStocktakeRepositoryCommandInput extends WarehouseStocktakeReadInput {
  command: WarehouseStocktakeCommand; expected_version: number; payload: Record<string, unknown>; idempotency_key: string;
}

export class WarehouseStocktakesRepository {
  constructor(private readonly clientOrProvider: WarehouseStocktakeRpcClient | (() => WarehouseStocktakeRpcClient) = () =>
    SupabaseDB.getAdminClient() as unknown as WarehouseStocktakeRpcClient) {}
  async getSettings(input: WarehouseStocktakeActor): Promise<WarehouseStocktakeSettings> {
    return parseStocktakeRecord(WarehouseStocktakeSettingsSchema,
      await this.rpc('get_warehouse_stocktake_settings', stocktakeActorParams(input)));
  }
  async list(input: WarehouseStocktakeListInput): Promise<WarehouseStocktakePage<WarehouseStocktakeOrderSummary>> {
    return parseStocktakePage(WarehouseStocktakeSummarySchema, await this.rpc('list_warehouse_stocktake_orders', {
      ...stocktakeActorParams(input), ...pageParams(input), p_warehouse_id: input.warehouse_id ?? null,
      p_status: input.status ?? null, p_keyword: input.keyword?.trim() || null,
    }));
  }
  async get(input: WarehouseStocktakeReadInput): Promise<WarehouseStocktakeOrderSummary> {
    return parseStocktakeRecord(WarehouseStocktakeSummarySchema, await this.rpc('get_warehouse_stocktake_order', {
      ...stocktakeActorParams(input), p_order_id: input.order_id,
    }));
  }
  async listItems(input: WarehouseStocktakeReadInput & WarehouseStocktakePageInput): Promise<WarehouseStocktakePage<WarehouseStocktakeItem>> {
    return parseStocktakePage(WarehouseStocktakeItemSchema, await this.rpc('list_warehouse_stocktake_order_items', {
      ...stocktakeActorParams(input), ...pageParams(input), p_order_id: input.order_id,
    }));
  }
  async command(input: WarehouseStocktakeRepositoryCommandInput): Promise<WarehouseStocktakeCommandResult> {
    return parseStocktakeRecord(WarehouseStocktakeCommandResultSchema, await this.rpc('command_warehouse_stocktake_order', {
      ...stocktakeActorParams(input), p_order_id: input.order_id, p_command: input.command,
      p_expected_version: input.expected_version, p_payload: input.payload, p_idempotency_key: input.idempotency_key,
    }));
  }
  private async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
    const client = typeof this.clientOrProvider === 'function' ? this.clientOrProvider() : this.clientOrProvider;
    const { data, error } = await client.rpc(name, params);
    if (error) throw Errors.dbError('仓库盘点操作失败', error);
    return data;
  }
}
export const warehouseStocktakesRepository = new WarehouseStocktakesRepository();

function pageParams(input: WarehouseStocktakePageInput): Record<string, number> {
  const result = PaginationQuerySchema.safeParse({ page: input.page, pageSize: input.pageSize });
  if (!result.success) throw Errors.fromZod(result.error);
  return { p_page: result.data.page, p_page_size: result.data.pageSize };
}
