import type { WarehouseMaterialCommand, WarehouseMaterialCommandResult, WarehouseMaterialDocumentType } from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';
import {
  WarehouseIssueOrderSchema, WarehouseReturnOrderSchema, materialActorParams, parseMaterialRecord,
  type WarehouseMaterialActor, type WarehouseMaterialRpcClient,
} from './warehouse-material-records';

export interface WarehouseMaterialCommandInput extends WarehouseMaterialActor {
  document_type: WarehouseMaterialDocumentType;
  order_id: string;
  command: WarehouseMaterialCommand;
  expected_version: number;
  payload: Record<string, unknown>;
  idempotency_key: string;
}

export class WarehouseMaterialCommandsRepository {
  constructor(private readonly clientOrProvider: WarehouseMaterialRpcClient | (() => WarehouseMaterialRpcClient) = () =>
    SupabaseDB.getAdminClient() as unknown as WarehouseMaterialRpcClient) {}

  async command(input: WarehouseMaterialCommandInput): Promise<WarehouseMaterialCommandResult> {
    const client = typeof this.clientOrProvider === 'function' ? this.clientOrProvider() : this.clientOrProvider;
    const { data, error } = await client.rpc('command_warehouse_material_order', {
      ...materialActorParams(input), p_document_type: input.document_type, p_order_id: input.order_id,
      p_command: input.command, p_expected_version: input.expected_version,
      p_payload: input.payload, p_idempotency_key: input.idempotency_key,
    });
    if (error) throw Errors.dbError('执行领退料命令失败', error);
    const schema = z.object({
      status: z.enum(['saved', 'submitted', 'completed', 'cancelled']),
      order: input.document_type === 'issue' ? WarehouseIssueOrderSchema : WarehouseReturnOrderSchema,
    }).strict();
    return parseMaterialRecord(schema, data);
  }
}
export const warehouseMaterialCommandsRepository = new WarehouseMaterialCommandsRepository();
