import {
  INVENTORY_TRANSACTION_TYPE_VALUES,
  type InventoryTransactionType,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const uuid = z.uuid();
const decimal = z.string().regex(/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/);

const InventoryBalanceRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  warehouse_id: uuid,
  warehouse_name: z.string().min(1),
  supplier_sku_id: uuid,
  sku_code: z.string().min(1),
  sku_name: z.string().min(1),
  specification: z.string().nullable(),
  model: z.string().nullable(),
  quantity_on_hand: decimal,
  inventory_value: decimal,
  average_unit_cost: decimal,
  version: z.number().int().positive(),
  updated_at: z.string(),
}).strict();

const InventoryTransactionRecordSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  warehouse_id: uuid,
  warehouse_name: z.string().min(1),
  supplier_sku_id: uuid,
  sku_code: z.string().min(1),
  sku_name: z.string().min(1),
  transaction_type: z.enum(INVENTORY_TRANSACTION_TYPE_VALUES),
  quantity_delta: decimal,
  unit_cost: decimal,
  value_delta: decimal,
  source_type: z.string().min(1),
  source_id: uuid,
  source_document: z.union([z.object({
    receipt_id: uuid,
    receipt_no: z.string().min(1),
    purchase_order_id: uuid,
    order_no: z.string().min(1),
  }).strict(), z.object({
    issue_order_id: uuid,
    issue_order_no: z.string().min(1),
  }).strict(), z.object({
    return_order_id: uuid,
    return_order_no: z.string().min(1),
    issue_order_id: uuid,
    issue_order_no: z.string().min(1),
  }).strict(), z.object({
    transfer_order_id: uuid,
    transfer_order_no: z.string().min(1),
    source_warehouse_id: uuid,
    destination_warehouse_id: uuid,
  }).strict(), z.object({
    stocktake_order_id: uuid,
    stocktake_order_no: z.string().min(1),
  }).strict()]).nullable().default(null),
  project_id: uuid.nullable(),
  cost_category_id: uuid.nullable(),
  occurred_at: z.string(),
  created_by_employee_id: uuid,
  created_by_employee_name: z.string().min(1),
  created_at: z.string(),
}).strict().refine((row) => {
  const isTransfer = row.transaction_type === "transfer_out" || row.transaction_type === "transfer_in";
  const hasTransferSource = row.source_type === "warehouse_transfer_out_item" || row.source_type === "warehouse_transfer_in_item";
  const isStocktake = row.transaction_type === "adjustment_in" || row.transaction_type === "adjustment_out";
  const hasStocktakeSource = row.source_type === "warehouse_stocktake_item";
  if (isTransfer !== hasTransferSource) return false;
  if (isTransfer && row.source_type !== `warehouse_${row.transaction_type}_item`) return false;
  if (hasStocktakeSource && !isStocktake) return false;
  if (row.source_document === null) return true;
  const documentIsTransfer = "transfer_order_id" in row.source_document;
  const documentIsStocktake = "stocktake_order_id" in row.source_document;
  if (documentIsStocktake) return hasStocktakeSource && isStocktake;
  if (hasStocktakeSource) return false;
  return isTransfer === documentIsTransfer;
}, { message: "库存流水类型与来源单据不一致", path: ["source_document"] });

const InventoryBalancePageSchema = z.object({
  items: z.array(InventoryBalanceRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100),
}).strict();

const InventoryTransactionPageSchema = z.object({
  items: z.array(InventoryTransactionRecordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100),
}).strict();

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<RpcResult>;
};
type PageInput = { page: number; pageSize: number };

export type InventoryBalanceRecord =
  z.infer<typeof InventoryBalanceRecordSchema>;
export type InventoryTransactionRecord =
  z.infer<typeof InventoryTransactionRecordSchema>;
export type Page<T> = {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export type InventoryBalanceListInput = PageInput & {
  tenant_id: string;
  warehouse_id?: string;
  keyword?: string;
};
export type InventoryTransactionListInput = PageInput & {
  tenant_id: string;
  warehouse_id?: string;
  supplier_sku_id?: string;
  transaction_type?: InventoryTransactionType;
};

export class InventoryRepository {
  constructor(
    private readonly clientOrProvider: Client | (() => Client) = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  private get client(): Client {
    return typeof this.clientOrProvider === "function"
      ? this.clientOrProvider()
      : this.clientOrProvider;
  }

  async listBalances(
    input: InventoryBalanceListInput,
  ): Promise<Page<InventoryBalanceRecord>> {
    const { data, error } = await this.client.rpc("list_inventory_balances", {
      p_tenant_id: input.tenant_id,
      p_warehouse_id: input.warehouse_id ?? null,
      p_keyword: input.keyword?.trim() || null,
      p_page: input.page,
      p_page_size: input.pageSize,
    });
    if (error) throw Errors.dbError("查询库存余额失败", error);
    const result = parse(
      InventoryBalancePageSchema,
      data,
      "查询库存余额失败",
    );
    return toPage(result.items, result);
  }

  async listTransactions(
    input: InventoryTransactionListInput,
  ): Promise<Page<InventoryTransactionRecord>> {
    const { data, error } = await this.client.rpc(
      "list_inventory_transactions",
      {
        p_tenant_id: input.tenant_id,
        p_warehouse_id: input.warehouse_id ?? null,
        p_supplier_sku_id: input.supplier_sku_id ?? null,
        p_transaction_type: input.transaction_type ?? null,
        p_page: input.page,
        p_page_size: input.pageSize,
      },
    );
    if (error) throw Errors.dbError("查询库存流水失败", error);
    const result = parse(
      InventoryTransactionPageSchema,
      data,
      "查询库存流水失败",
    );
    return toPage(result.items, result);
  }
}

export const inventoryRepository = new InventoryRepository();

function toPage<T>(
  list: T[],
  input: { page: number; page_size: number; total: number },
): Page<T> {
  return {
    list,
    pagination: {
      page: input.page,
      pageSize: input.page_size,
      total: input.total,
      totalPages: input.total ? Math.ceil(input.total / input.page_size) : 0,
    },
  };
}

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}
