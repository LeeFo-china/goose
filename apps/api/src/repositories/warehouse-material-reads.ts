import type { WarehouseIssueItem, WarehouseMaterialDocumentType, WarehouseMaterialOrder, WarehouseMaterialSettings, WarehouseIssueStatus, WarehouseReturnItem } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';
import {
  WarehouseIssueSummarySchema, WarehouseReturnSummarySchema, WarehouseIssueItemSchema,
  WarehouseReturnItemSchema, WarehouseMaterialProjectSchema, materialActorParams, parseMaterialPage, parseMaterialRecord,
  WarehouseMaterialSettingsSchema,
  type WarehouseMaterialActor, type WarehouseMaterialPage, type WarehouseMaterialPageInput, type WarehouseMaterialRpcClient,
} from './warehouse-material-records';

export interface WarehouseMaterialReadInput extends WarehouseMaterialActor {
  document_type: WarehouseMaterialDocumentType;
  order_id: string;
}
export interface WarehouseMaterialListInput extends WarehouseMaterialActor, WarehouseMaterialPageInput {
  document_type: WarehouseMaterialDocumentType;
  warehouse_id?: string;
  project_id?: string;
  status?: WarehouseIssueStatus;
  keyword?: string;
}

export class WarehouseMaterialReadsRepository {
  constructor(private readonly clientOrProvider: WarehouseMaterialRpcClient | (() => WarehouseMaterialRpcClient) = () =>
    SupabaseDB.getAdminClient() as unknown as WarehouseMaterialRpcClient) {}

  async getSettings(input: WarehouseMaterialActor): Promise<WarehouseMaterialSettings> {
    return parseMaterialRecord(WarehouseMaterialSettingsSchema,
      await this.rpc('get_warehouse_material_settings', materialActorParams(input)));
  }

  async list(input: WarehouseMaterialListInput): Promise<WarehouseMaterialPage<WarehouseMaterialOrder>> {
    const data = await this.rpc('list_warehouse_material_orders', {
      ...materialActorParams(input), ...pageParams(input), p_document_type: input.document_type,
      p_warehouse_id: input.warehouse_id ?? null, p_project_id: input.project_id ?? null,
      p_status: input.status ?? null, p_keyword: input.keyword?.trim() || null,
    });
    return input.document_type === 'issue'
      ? parseMaterialPage(WarehouseIssueSummarySchema, data) : parseMaterialPage(WarehouseReturnSummarySchema, data);
  }

  async get(input: WarehouseMaterialReadInput): Promise<WarehouseMaterialOrder> {
    const data = await this.rpc('get_warehouse_material_order', {
      ...materialActorParams(input), p_document_type: input.document_type, p_order_id: input.order_id,
    });
    return input.document_type === 'issue'
      ? parseMaterialRecord(WarehouseIssueSummarySchema, data) : parseMaterialRecord(WarehouseReturnSummarySchema, data);
  }

  async listItems(input: WarehouseMaterialReadInput & WarehouseMaterialPageInput): Promise<WarehouseMaterialPage<WarehouseIssueItem | WarehouseReturnItem>> {
    const data = await this.rpc('list_warehouse_material_order_items', {
      ...materialActorParams(input), ...pageParams(input), p_document_type: input.document_type, p_order_id: input.order_id,
    });
    return input.document_type === 'issue'
      ? parseMaterialPage(WarehouseIssueItemSchema, data) : parseMaterialPage(WarehouseReturnItemSchema, data);
  }

  async listProjects(input: WarehouseMaterialActor & WarehouseMaterialPageInput & { keyword?: string }): Promise<WarehouseMaterialPage<{ id: string; name: string }>> {
    return parseMaterialPage(WarehouseMaterialProjectSchema, await this.rpc('list_warehouse_material_projects', {
      ...materialActorParams(input), ...pageParams(input), p_keyword: input.keyword?.trim() || null,
    }));
  }

  private async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
    const client = typeof this.clientOrProvider === 'function' ? this.clientOrProvider() : this.clientOrProvider;
    const { data, error } = await client.rpc(name, params);
    if (error) throw Errors.dbError('查询领退料失败', error);
    return data;
  }
}
export const warehouseMaterialReadsRepository = new WarehouseMaterialReadsRepository();

function pageParams(input: WarehouseMaterialPageInput): Record<string, number> {
  return { p_page: Math.max(1, input.page), p_page_size: Math.min(100, Math.max(1, input.pageSize)) };
}
